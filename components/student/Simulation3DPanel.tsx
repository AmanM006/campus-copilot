"use client";

import React, {
  useRef,
  useMemo,
  useState,
  useEffect,
  useCallback,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls, Line } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SimulationNode {
  id: string;
  label: string;
  type?: "server" | "database" | "client" | "concept" | string;
  color?: string;
  group?: string;
  burst?: number;
  arrival?: number;
  priority?: number;
}

export interface SimulationEdge {
  from: string;
  to: string;
  label?: string;
}

export interface SimulationSpec {
  title: string;
  description?: string;
  nodes: SimulationNode[];
  edges: SimulationEdge[];
  steps?: string[];
  sceneType?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const NODE_COLORS: Record<string, string> = {
  server:   "#38bdf8",
  database: "#a78bfa",
  client:   "#34d399",
  concept:  "#fb923c",
  actor:    "#f472b6",
  process:  "#facc15",
  layer:    "#818cf8",
  default:  "#e2e8f0",
};

// ─── Utilities ─────────────────────────────────────────────────────────────────

function getNodeColor(node: SimulationNode): string {
  return node.color || NODE_COLORS[node.type || "default"] || NODE_COLORS.default;
}

function fibonacci3DSphere(count: number, radius: number): THREE.Vector3[] {
  const positions: THREE.Vector3[] = [];
  const goldenRatio = (1 + Math.sqrt(5)) / 2;
  for (let i = 0; i < count; i++) {
    const theta = Math.acos(1 - (2 * (i + 0.5)) / count);
    const phi = (2 * Math.PI * i) / goldenRatio;
    positions.push(new THREE.Vector3(
      radius * Math.sin(theta) * Math.cos(phi),
      radius * Math.sin(theta) * Math.sin(phi),
      radius * Math.cos(theta),
    ));
  }
  return positions;
}

// ─── Force-Directed Physics (node_graph) ─────────────────────────────────────

const REPULSION  = 28;
const ATTRACTION = 0.012;
const DAMPING    = 0.88;
const EDGE_REST  = 5.5;

interface PhysicsBody {
  id: string;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
}

function useForceGraph(nodes: SimulationNode[], edges: SimulationEdge[]) {
  const bodies     = useRef<PhysicsBody[]>([]);
  const settled    = useRef(false);
  const frameCount = useRef(0);

  useEffect(() => {
    settled.current = false;
    frameCount.current = 0;
    bodies.current = nodes.map((n) => ({
      id:  n.id,
      pos: new THREE.Vector3(
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 12,
      ),
      vel: new THREE.Vector3(),
    }));
  }, [nodes]);

  const tick = useCallback(() => {
    if (settled.current) return;
    frameCount.current += 1;
    const bs  = bodies.current;
    const tmp = new THREE.Vector3();

    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        tmp.subVectors(bs[i].pos, bs[j].pos);
        const distSq = Math.max(tmp.lengthSq(), 0.01);
        const force  = REPULSION / distSq;
        tmp.normalize().multiplyScalar(force);
        bs[i].vel.add(tmp);
        bs[j].vel.sub(tmp);
      }
    }

    for (const edge of edges) {
      const a = bs.find((b) => b.id === edge.from);
      const b = bs.find((b) => b.id === edge.to);
      if (!a || !b) continue;
      tmp.subVectors(b.pos, a.pos);
      const dist  = tmp.length();
      const delta = (dist - EDGE_REST) * ATTRACTION;
      tmp.normalize().multiplyScalar(delta);
      a.vel.add(tmp);
      b.vel.sub(tmp);
    }

    let totalKE = 0;
    for (const b of bs) {
      b.vel.multiplyScalar(DAMPING);
      b.pos.add(b.vel);
      totalKE += b.vel.lengthSq();
    }
    if (frameCount.current > 120 && totalKE < 0.001) settled.current = true;
  }, [edges]);

  const getPos = useCallback(
    (id: string) => bodies.current.find((b) => b.id === id)?.pos ?? null,
    [],
  );

  return { tick, getPos, bodies };
}

// ─── Auto-fit Camera ──────────────────────────────────────────────────────────

function AutoFitCamera({ bodies }: { bodies: React.MutableRefObject<{ pos: THREE.Vector3 }[]> }) {
  const { camera } = useThree();
  const fitted = useRef(false);

  useFrame(() => {
    if (fitted.current) return;
    const bs = bodies.current;
    if (bs.length === 0) return;
    (camera as any).__fitFrame = ((camera as any).__fitFrame ?? 0) + 1;
    if ((camera as any).__fitFrame < 150) return;

    const box = new THREE.Box3();
    for (const b of bs) box.expandByPoint(b.pos);
    const size   = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const dist   = Math.max(size.x, size.y, size.z) * 1.6;
    camera.position.set(center.x, center.y, center.z + dist);
    camera.lookAt(center);
    fitted.current = true;
  });

  return null;
}

// ─── Ambient Dust ─────────────────────────────────────────────────────────────

function AmbientDust() {
  const ref   = useRef<THREE.Points>(null);
  const count = 260;
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) arr[i] = (Math.random() - 0.5) * 40;
    return arr;
  }, []);
  useFrame(() => { if (ref.current) ref.current.rotation.y += 0.00015; });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.035} color="#a78bfa" transparent opacity={0.35} sizeAttenuation />
    </points>
  );
}

// ─── Generic Node Geometry ────────────────────────────────────────────────────

function NodeGeometry({ type }: { type: string }) {
  switch (type) {
    case "database": return <cylinderGeometry args={[0.52, 0.52, 0.9, 32]} />;
    case "server":   return <boxGeometry args={[0.85, 0.85, 0.85]} />;
    case "client":   return <torusGeometry args={[0.42, 0.18, 16, 32]} />;
    case "actor":    return <capsuleGeometry args={[0.28, 0.5, 8, 16]} />;
    case "process":  return <octahedronGeometry args={[0.55, 0]} />;
    case "layer":    return <boxGeometry args={[1.6, 0.25, 0.9]} />;
    default:         return <icosahedronGeometry args={[0.52, 1]} />;
  }
}

// ─── Shared Node Mesh ─────────────────────────────────────────────────────────

interface NodeMeshProps {
  node: SimulationNode;
  position: THREE.Vector3;
  hovered: string | null;
  onHover: (id: string | null) => void;
  neighbours: Set<string>;
  animate?: boolean;
}

function NodeMesh({ node, position, hovered, onHover, neighbours, animate = true }: NodeMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const isHov   = hovered === node.id;
  const isNeigh = hovered ? neighbours.has(node.id) : false;
  const isDim   = hovered !== null && !isHov && !isNeigh;

  const baseColor = getNodeColor(node);
  const color = useMemo(() => new THREE.Color(baseColor), [baseColor]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.position.copy(position);
    if (animate) mesh.position.y += Math.sin(Date.now() * 0.001 + position.x) * 0.06;
    mesh.rotation.y += delta * 0.4;
    const ts = isHov ? 1.35 : isDim ? 0.75 : 1.0;
    mesh.scale.lerp(new THREE.Vector3(ts, ts, ts), 0.12);
    if (glowRef.current) {
      glowRef.current.position.copy(mesh.position);
      const gs = isHov ? 1.9 : 1.4;
      glowRef.current.scale.lerp(new THREE.Vector3(gs, gs, gs), 0.12);
    }
  });

  const labelY = animate
    ? position.y + Math.sin(Date.now() * 0.001 + position.x) * 0.06 + 0.95
    : position.y + 0.95;

  return (
    <group>
      <mesh ref={glowRef} position={position.toArray()}>
        <sphereGeometry args={[0.62, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={isDim ? 0.03 : isHov ? 0.22 : 0.08} depthWrite={false} />
      </mesh>

      <mesh
        ref={meshRef}
        position={position.toArray()}
        onPointerOver={(e) => { e.stopPropagation(); onHover(node.id); }}
        onPointerOut={() => onHover(null)}
      >
        <NodeGeometry type={node.type || "concept"} />
        <meshPhysicalMaterial
          color={color} emissive={color}
          emissiveIntensity={isDim ? 0.15 : isHov ? 3.5 : 1.4}
          transmission={0.25} roughness={0.08} metalness={0.6}
          ior={1.4} thickness={0.5} transparent opacity={isDim ? 0.35 : 1}
        />
        <pointLight distance={4} intensity={isHov ? 3 : 1} color={color} />
      </mesh>

      {(isHov || isNeigh || !hovered) && (
        <Html
          position={[position.x, labelY, position.z]}
          center distanceFactor={10} zIndexRange={[100, 0]}
          style={{ pointerEvents: "none" }}
        >
          <div style={{
            padding: "5px 12px", borderRadius: 8,
            fontSize: isHov ? 13 : 11, fontWeight: isHov ? 700 : 500,
            color: "#fff",
            background: isHov ? `${baseColor}33` : "rgba(0,0,0,0.55)",
            border: `1px solid ${isHov ? baseColor : "rgba(255,255,255,0.12)"}`,
            backdropFilter: "blur(12px)", whiteSpace: "nowrap",
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.03em",
            boxShadow: isHov ? `0 0 20px ${baseColor}55` : "none",
            transition: "all 0.2s ease", opacity: isDim ? 0.3 : 1,
          }}>
            {node.label}
          </div>
        </Html>
      )}
    </group>
  );
}

// ─── Animated Edge Line ───────────────────────────────────────────────────────

const MAX_PARTICLES = 4;

interface EdgeLineProps {
  from: THREE.Vector3;
  to: THREE.Vector3;
  label?: string;
  hovered: string | null;
  fromId: string;
  toId: string;
  edgeColor: string;
  speed?: number;
}

function EdgeLine({ from, to, label, hovered, fromId, toId, edgeColor, speed = 0.0004 }: EdgeLineProps) {
  const particlesRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const isActive = !hovered || hovered === fromId || hovered === toId;

  const curve = useMemo(() => {
    const mid = new THREE.Vector3().lerpVectors(from, to, 0.5);
    mid.y += from.distanceTo(to) * 0.12;
    return new THREE.QuadraticBezierCurve3(from, mid, to);
  }, [from, to]);

  const points = useMemo(() => curve.getPoints(40), [curve]);

  useFrame(() => {
    const im = particlesRef.current;
    if (!im) return;
    const t = (Date.now() * speed) % 1;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const tt = (t + i / MAX_PARTICLES) % 1;
      const pos = curve.getPoint(tt);
      dummy.position.copy(pos);
      dummy.scale.setScalar(isActive ? 0.09 : 0.0);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
  });

  const color = new THREE.Color(edgeColor);

  return (
    <group>
      <Line
        points={points} color={edgeColor}
        lineWidth={isActive ? 1.2 : 0.4}
        transparent opacity={isActive ? 0.55 : 0.12}
      />
      <instancedMesh ref={particlesRef} args={[undefined, undefined, MAX_PARTICLES]}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </instancedMesh>
      {label && isActive && (
        <Html position={curve.getPoint(0.5).toArray()} center distanceFactor={12} style={{ pointerEvents: "none" }}>
          <div style={{
            fontSize: 9, fontWeight: 600, color: edgeColor,
            background: "rgba(0,0,0,0.7)", border: `1px solid ${edgeColor}55`,
            borderRadius: 5, padding: "3px 8px",
            fontFamily: "'JetBrains Mono', monospace",
            whiteSpace: "nowrap", letterSpacing: "0.04em", textTransform: "uppercase",
          }}>
            {label}
          </div>
        </Html>
      )}
    </group>
  );
}

// ─── SEQUENCE DIAGRAM ENGINE ──────────────────────────────────────────────────

function SequenceScene({ spec, hovered, onHover }: { spec: SimulationSpec; hovered: string | null; onHover: (id: string | null) => void }) {
  // Extract unique actor groups (preserving order of first appearance)
  const actors = useMemo(() => {
    const seen = new Map<string, string>(); // group → color
    for (const n of spec.nodes) {
      const g = n.group || n.id;
      if (!seen.has(g)) {
        seen.set(g, getNodeColor({ ...n, id: g, label: g }));
      }
    }
    return Array.from(seen.entries()).map(([name, color], i) => ({ name, color, x: (i - (seen.size - 1) / 2) * 4.5 }));
  }, [spec.nodes]);

  const actorXMap = useMemo(() => new Map(actors.map((a) => [a.name, a.x])), [actors]);

  // Sort nodes by index (sequence order)
  const sortedNodes = useMemo(() =>
    [...spec.nodes].map((n, i) => ({ ...n, seqIdx: i })),
    [spec.nodes]
  );

  const Y_STEP = -2.2;
  const Y_TOP  = 1.5;

  const nodePositions = useMemo(() => {
    const map = new Map<string, THREE.Vector3>();
    for (const n of sortedNodes) {
      const group = n.group || n.id;
      const x = actorXMap.get(group) ?? 0;
      const y = Y_TOP + n.seqIdx * Y_STEP;
      map.set(n.id, new THREE.Vector3(x, y, 0));
    }
    return map;
  }, [sortedNodes, actorXMap]);

  const totalHeight = sortedNodes.length * Math.abs(Y_STEP) + 3;

  return (
    <>
      {/* Lifeline cylinders */}
      {actors.map((actor) => (
        <group key={actor.name}>
          {/* Top actor head */}
          <mesh position={[actor.x, Y_TOP + 1.2, 0]}>
            <boxGeometry args={[2.2, 0.55, 0.18]} />
            <meshPhysicalMaterial color={new THREE.Color(actor.color)} emissive={new THREE.Color(actor.color)} emissiveIntensity={1.2} roughness={0.1} metalness={0.5} />
          </mesh>
          <Html position={[actor.x, Y_TOP + 1.7, 0]} center distanceFactor={12} style={{ pointerEvents: "none" }}>
            <div style={{
              padding: "4px 12px", borderRadius: 7, fontSize: 12, fontWeight: 700,
              color: "#fff", background: `${actor.color}22`,
              border: `1px solid ${actor.color}88`,
              fontFamily: "'JetBrains Mono', monospace",
              backdropFilter: "blur(8px)", whiteSpace: "nowrap",
            }}>
              {actor.name}
            </div>
          </Html>

          {/* Dashed lifeline */}
          {Array.from({ length: Math.ceil(totalHeight / 0.7) }).map((_, i) => (
            <mesh key={i} position={[actor.x, Y_TOP - i * 0.7, -0.05]}>
              <boxGeometry args={[0.035, 0.38, 0.035]} />
              <meshBasicMaterial color={actor.color} transparent opacity={0.25} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Sequence nodes */}
      {sortedNodes.map((node) => {
        const pos = nodePositions.get(node.id);
        if (!pos) return null;
        const neighbours = new Set<string>(
          spec.edges.flatMap((e) =>
            e.from === node.id ? [e.to] : e.to === node.id ? [e.from] : []
          )
        );
        return (
          <NodeMesh
            key={node.id}
            node={node}
            position={pos}
            hovered={hovered}
            onHover={onHover}
            neighbours={neighbours}
            animate={false}
          />
        );
      })}

      {/* Horizontal edges */}
      {spec.edges.map((edge, idx) => {
        const fromPos = nodePositions.get(edge.from);
        const toPos   = nodePositions.get(edge.to);
        if (!fromPos || !toPos) return null;
        const fromNode = spec.nodes.find((n) => n.id === edge.from);
        const col = getNodeColor(fromNode || { id: "", label: "" });
        // Draw straight horizontal line at midpoint Y
        const midY = (fromPos.y + toPos.y) / 2;
        const lineFrom = new THREE.Vector3(fromPos.x, midY, 0);
        const lineTo   = new THREE.Vector3(toPos.x, midY, 0);
        return (
          <group key={idx}>
            <EdgeLine
              from={lineFrom} to={lineTo}
              label={edge.label}
              hovered={hovered}
              fromId={edge.from} toId={edge.to}
              edgeColor={col}
              speed={0.0008}
            />
          </group>
        );
      })}
    </>
  );
}

// ─── PROCESS FLOW ENGINE ──────────────────────────────────────────────────────

function ProcessFlowScene({ spec, hovered, onHover }: { spec: SimulationSpec; hovered: string | null; onHover: (id: string | null) => void }) {
  const positions = useMemo(() => {
    const map = new Map<string, THREE.Vector3>();
    const step = 4.5;
    const total = spec.nodes.length;
    spec.nodes.forEach((n, i) => {
      const x = (i - (total - 1) / 2) * step;
      const y = Math.sin(i * 0.7) * 0.8; // slight wave
      map.set(n.id, new THREE.Vector3(x, y, 0));
    });
    return map;
  }, [spec.nodes]);

  const bodies = useRef(
    spec.nodes.map((n) => ({ pos: positions.get(n.id) || new THREE.Vector3() }))
  );

  return (
    <>
      {/* Pipeline track */}
      <mesh position={[0, -1.4, -0.3]}>
        <boxGeometry args={[spec.nodes.length * 4.5 + 2, 0.08, 0.5]} />
        <meshBasicMaterial color="#1e293b" transparent opacity={0.6} />
      </mesh>

      {spec.edges.map((edge, idx) => {
        const a = positions.get(edge.from);
        const b = positions.get(edge.to);
        if (!a || !b) return null;
        const fromNode = spec.nodes.find((n) => n.id === edge.from);
        const col = getNodeColor(fromNode || { id: "", label: "" });
        return (
          <EdgeLine
            key={idx} from={a} to={b}
            label={edge.label} hovered={hovered}
            fromId={edge.from} toId={edge.to}
            edgeColor={col}
          />
        );
      })}

      {spec.nodes.map((node) => {
        const pos = positions.get(node.id);
        if (!pos) return null;
        const neighbours = new Set(spec.edges.flatMap((e) =>
          e.from === node.id ? [e.to] : e.to === node.id ? [e.from] : []
        ));
        return (
          <NodeMesh key={node.id} node={node} position={pos}
            hovered={hovered} onHover={onHover} neighbours={neighbours} />
        );
      })}

      <AutoFitCamera bodies={bodies} />
    </>
  );
}

// ─── LAYER STACK ENGINE ───────────────────────────────────────────────────────

function LayerStackScene({ spec, hovered, onHover }: { spec: SimulationSpec; hovered: string | null; onHover: (id: string | null) => void }) {
  const positions = useMemo(() => {
    const map = new Map<string, THREE.Vector3>();
    const step = 1.8;
    const total = spec.nodes.length;
    spec.nodes.forEach((n, i) => {
      const y = (i - (total - 1) / 2) * step;
      const x = Math.sin(i * 0.9) * 0.5;
      map.set(n.id, new THREE.Vector3(x, y, 0));
    });
    return map;
  }, [spec.nodes]);

  const bodies = useRef(
    spec.nodes.map((n) => ({ pos: positions.get(n.id) || new THREE.Vector3() }))
  );

  return (
    <>
      {/* Layer plate glow planes */}
      {spec.nodes.map((node, i) => {
        const pos = positions.get(node.id);
        if (!pos) return null;
        const col = getNodeColor(node);
        return (
          <mesh key={`plate-${i}`} position={[pos.x, pos.y, -0.3]}>
            <boxGeometry args={[3.6, 0.06, 1.4]} />
            <meshBasicMaterial color={col} transparent opacity={0.08} />
          </mesh>
        );
      })}

      {spec.edges.map((edge, idx) => {
        const a = positions.get(edge.from);
        const b = positions.get(edge.to);
        if (!a || !b) return null;
        const fromNode = spec.nodes.find((n) => n.id === edge.from);
        const col = getNodeColor(fromNode || { id: "", label: "" });
        return (
          <EdgeLine
            key={idx} from={a} to={b}
            label={edge.label} hovered={hovered}
            fromId={edge.from} toId={edge.to}
            edgeColor={col}
          />
        );
      })}

      {spec.nodes.map((node) => {
        const pos = positions.get(node.id);
        if (!pos) return null;
        const neighbours = new Set(spec.edges.flatMap((e) =>
          e.from === node.id ? [e.to] : e.to === node.id ? [e.from] : []
        ));
        return (
          <NodeMesh key={node.id} node={{ ...node, type: node.type || "layer" }}
            position={pos} hovered={hovered} onHover={onHover} neighbours={neighbours} />
        );
      })}

      <AutoFitCamera bodies={bodies} />
    </>
  );
}

// ─── NODE GRAPH ENGINE ────────────────────────────────────────────────────────

function NodeGraphScene({ spec, hovered, onHover }: { spec: SimulationSpec; hovered: string | null; onHover: (id: string | null) => void }) {
  const { tick, getPos, bodies } = useForceGraph(spec.nodes, spec.edges);
  const [positions, setPositions] = useState<Record<string, THREE.Vector3>>({});

  useFrame(() => {
    tick();
    const next: Record<string, THREE.Vector3> = {};
    for (const n of spec.nodes) {
      const p = getPos(n.id);
      if (p) next[n.id] = p.clone();
    }
    setPositions(next);
  });

  const neighbourMap = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const n of spec.nodes) map[n.id] = new Set();
    for (const e of spec.edges) {
      map[e.from]?.add(e.to);
      map[e.to]?.add(e.from);
    }
    return map;
  }, [spec]);

  return (
    <>
      <AutoFitCamera bodies={bodies} />

      {spec.edges.map((edge, idx) => {
        const a = positions[edge.from];
        const b = positions[edge.to];
        if (!a || !b) return null;
        const fromNode = spec.nodes.find((n) => n.id === edge.from);
        const col = getNodeColor(fromNode || { id: "", label: "" });
        return (
          <EdgeLine
            key={idx} from={a} to={b}
            label={edge.label} hovered={hovered}
            fromId={edge.from} toId={edge.to}
            edgeColor={col}
          />
        );
      })}

      {spec.nodes.map((node) => {
        const pos = positions[node.id];
        if (!pos) return null;
        return (
          <NodeMesh key={node.id} node={node} position={pos}
            hovered={hovered} onHover={onHover}
            neighbours={hovered ? (neighbourMap[hovered] || new Set()) : new Set()} />
        );
      })}
    </>
  );
}

// ─── SCHEDULING OVERLAY (FCFS) ────────────────────────────────────────────────

function SchedulingOverlay({ nodes }: { nodes: SimulationNode[] }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 80);
    return () => clearInterval(id);
  }, []);

  const schedule = useMemo(() => {
    const sorted = [...nodes].filter((n) => n.burst).sort((a, b) => (a.arrival || 0) - (b.arrival || 0));
    let clock = 0;
    return sorted.map((n) => {
      const start = Math.max(clock, n.arrival || 0);
      const end   = start + (n.burst || 1);
      clock = end;
      return { ...n, start, end };
    });
  }, [nodes]);

  const totalTime = schedule[schedule.length - 1]?.end || 1;
  const cursor    = (tick * 0.4) % (totalTime + 2);
  const colors    = ["#38bdf8","#a78bfa","#34d399","#fb923c","#f43f5e","#fbbf24"];

  return (
    <div style={{
      position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)",
      width: "90%", maxWidth: 700,
      background: "rgba(0,0,0,0.75)", border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 14, padding: "16px 20px",
      fontFamily: "'JetBrains Mono', monospace", pointerEvents: "none",
      backdropFilter: "blur(16px)",
    }}>
      <div style={{ fontSize: 10, color: "#71717a", marginBottom: 10, letterSpacing: "0.1em", textTransform: "uppercase" }}>
        FCFS Timeline — t = {cursor.toFixed(1)}
      </div>
      <div style={{ position: "relative", height: 28 }}>
        {schedule.map((s, idx) => {
          const color  = colors[idx % colors.length];
          const left   = (s.start / totalTime) * 100;
          const width  = ((s.end - s.start) / totalTime) * 100;
          const active = cursor >= s.start && cursor < s.end;
          return (
            <div key={s.id} style={{
              position: "absolute", left: `${left}%`, width: `${width}%`, height: "100%",
              background: active ? color : `${color}44`,
              borderRadius: 6, border: `1px solid ${color}88`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, color: active ? "#000" : color, fontWeight: 700,
              transition: "background 0.1s", overflow: "hidden",
            }}>
              {s.label}
            </div>
          );
        })}
        <div style={{
          position: "absolute", left: `${(cursor / totalTime) * 100}%`,
          top: -4, bottom: -4, width: 2, background: "#fff", borderRadius: 2,
          boxShadow: "0 0 8px #fff",
        }} />
      </div>
    </div>
  );
}

// ─── Scene Router ─────────────────────────────────────────────────────────────

function Scene({ spec, hovered, onHover }: { spec: SimulationSpec; hovered: string | null; onHover: (id: string | null) => void }) {
  const sceneType = (spec.sceneType || "node_graph").toLowerCase();

  return (
    <>
      <color attach="background" args={["#020408"]} />
      <ambientLight intensity={0.3} />
      <directionalLight position={[10, 12, 8]} intensity={0.8} color="#a0c4ff" />
      <pointLight position={[-10, -8, -10]} intensity={0.4} color="#c084fc" />

      <AmbientDust />

      {/* Camera default for sequence so we can see lifelines */}
      {sceneType === "sequence" && (
        <SequenceScene spec={spec} hovered={hovered} onHover={onHover} />
      )}
      {(sceneType === "process_flow" || sceneType === "pipeline") && (
        <ProcessFlowScene spec={spec} hovered={hovered} onHover={onHover} />
      )}
      {(sceneType === "layer_stack" || sceneType === "layers") && (
        <LayerStackScene spec={spec} hovered={hovered} onHover={onHover} />
      )}
      {(sceneType === "node_graph" || sceneType === "graph" || sceneType === "scheduling" || sceneType === "cpu_scheduling" || !["sequence","process_flow","pipeline","layer_stack","layers"].includes(sceneType)) && (
        <NodeGraphScene spec={spec} hovered={hovered} onHover={onHover} />
      )}

      <EffectComposer>
        <Bloom intensity={1.8} luminanceThreshold={0.1} luminanceSmoothing={0.9} mipmapBlur />
      </EffectComposer>

      <OrbitControls
        enablePan enableZoom enableRotate
        autoRotate={!hovered}
        autoRotateSpeed={0.5}
        makeDefault
      />
    </>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function Simulation3DPanel({ spec }: { spec: SimulationSpec }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const isScheduling = spec.sceneType === "scheduling" || spec.sceneType === "cpu_scheduling";

  // Dynamic camera position based on scene type
  const cameraPos = useMemo((): [number, number, number] => {
    const st = (spec.sceneType || "").toLowerCase();
    if (st === "sequence") return [0, 0, 22];
    if (st === "layer_stack" || st === "layers") return [6, 0, 14];
    if (st === "process_flow" || st === "pipeline") return [0, 4, 20];
    return [0, 0, 18];
  }, [spec.sceneType]);

  return (
    <div style={{ display: "grid", gap: 20, fontFamily: "'JetBrains Mono', monospace" }}>
      {/* Header */}
      <div>
        <div style={{
          fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <span style={{
            display: "inline-block", width: 10, height: 10, borderRadius: "50%",
            background: "#38bdf8", boxShadow: "0 0 14px #38bdf8",
            animation: "pulse 2s ease-in-out infinite",
          }} />
          {spec.title}
        </div>
        {spec.description && (
          <div style={{ fontSize: 13, color: "#71717a", marginTop: 6, lineHeight: 1.6, maxWidth: 640 }}>
            {spec.description}
          </div>
        )}
        {/* Scene type badge */}
        <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
            padding: "3px 10px", borderRadius: 20,
            background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.3)",
            color: "#38bdf8",
          }}>
            {(spec.sceneType || "node_graph").replace(/_/g, " ")}
          </span>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {(["server", "database", "client", "concept", "actor", "process", "layer"] as const).map((t) => (
          <div key={t} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: NODE_COLORS[t], boxShadow: `0 0 8px ${NODE_COLORS[t]}` }} />
            <span style={{ fontSize: 10, color: "#71717a", textTransform: "capitalize", letterSpacing: "0.05em" }}>{t}</span>
          </div>
        ))}
      </div>

      {/* Canvas */}
      <div style={{
        height: 520, borderRadius: 20,
        border: "1px solid rgba(255,255,255,0.07)", background: "#020408",
        overflow: "hidden", position: "relative",
        boxShadow: "inset 0 0 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(56,189,248,0.08)",
      }}>
        <Canvas
          camera={{ position: cameraPos, fov: 55 }}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
          dpr={[1, 2]}
        >
          <Scene spec={spec} hovered={hovered} onHover={setHovered} />
        </Canvas>

        {isScheduling && <SchedulingOverlay nodes={spec.nodes} />}

        <div style={{
          position: "absolute", top: 14, right: 16, fontSize: 9, color: "#38bdf8",
          fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em",
          opacity: 0.6, textTransform: "uppercase",
        }}>
          {(spec.sceneType || "Force-Directed").replace(/_/g, " ")} · 3D
        </div>
      </div>

      {/* Walkthrough steps */}
      {!!spec.steps?.length && (
        <div style={{
          borderRadius: 14, border: "1px solid rgba(56,189,248,0.15)",
          background: "rgba(56,189,248,0.04)", padding: "18px 22px",
        }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: "#38bdf8",
            marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.1em",
          }}>
            Walkthrough
          </div>
          <ol style={{ margin: 0, paddingLeft: 20, color: "#cbd5e1", fontSize: 13, lineHeight: 1.85 }}>
            {spec.steps.map((step, idx) => <li key={idx} style={{ marginBottom: 6 }}>{step}</li>)}
          </ol>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.3); }
        }
      `}</style>
    </div>
  );
}