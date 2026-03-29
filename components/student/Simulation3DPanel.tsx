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
  group?:string;
  // FCFS / scheduling animation metadata (optional)
  burst?: number;        // burst time units
  arrival?: number;      // arrival time
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
  // If sceneType is "scheduling", trigger the FCFS/CPU timeline mode
  sceneType?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const NODE_COLORS: Record<string, string> = {
  server:   "#38bdf8",
  database: "#a78bfa",
  client:   "#34d399",
  concept:  "#fb923c",
  default:  "#e2e8f0",
};

const REPULSION    = 28;
const ATTRACTION   = 0.012;
const DAMPING      = 0.88;
const EDGE_REST    = 5.5;
const ITERATIONS   = 1;   // physics steps per frame

// ─── Force-Directed Physics Hook ─────────────────────────────────────────────

interface PhysicsNode {
  id: string;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
}

function useForceGraph(nodes: SimulationNode[], edges: SimulationEdge[]) {
  const bodies = useRef<PhysicsNode[]>([]);
  const settled = useRef(false);
  const frameCount = useRef(0);

  // Initialise random positions once
  useEffect(() => {
    settled.current = false;
    frameCount.current = 0;
    bodies.current = nodes.map((n) => ({
      id: n.id,
      pos: new THREE.Vector3(
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 12,
      ),
      vel: new THREE.Vector3(),
    }));
  }, [nodes]);

  // Run physics each frame until settled
  const tick = useCallback(() => {
    if (settled.current) return;
    frameCount.current += 1;

    const bs = bodies.current;
    const tmp = new THREE.Vector3();

    for (let iter = 0; iter < ITERATIONS; iter++) {
      // Repulsion between every pair
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

      // Attraction along edges
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

      // Integrate
      let totalKE = 0;
      for (const b of bs) {
        b.vel.multiplyScalar(DAMPING);
        b.pos.add(b.vel);
        totalKE += b.vel.lengthSq();
      }

      if (frameCount.current > 120 && totalKE < 0.001) {
        settled.current = true;
      }
    }
  }, [edges]);

  const getPos = useCallback(
    (id: string): THREE.Vector3 | null =>
      bodies.current.find((b) => b.id === id)?.pos ?? null,
    [],
  );

  return { tick, getPos, bodies };
}

// ─── Node Geometry ────────────────────────────────────────────────────────────

function nodeGeometry(type: string) {
  switch (type) {
    case "database": return <cylinderGeometry args={[0.52, 0.52, 0.9, 32]} />;
    case "server":   return <boxGeometry args={[0.85, 0.85, 0.85]} />;
    case "client":   return <torusGeometry args={[0.42, 0.18, 16, 32]} />;
    default:         return <icosahedronGeometry args={[0.55, 1]} />;
  }
}

// ─── Single Node Mesh ─────────────────────────────────────────────────────────

interface NodeMeshProps {
  node: SimulationNode;
  position: THREE.Vector3;
  hovered: string | null;
  onHover: (id: string | null) => void;
  neighbours: Set<string>;
}

function NodeMesh({ node, position, hovered, onHover, neighbours }: NodeMeshProps) {
  const meshRef  = useRef<THREE.Mesh>(null);
  const glowRef  = useRef<THREE.Mesh>(null);
  const isHov    = hovered === node.id;
  const isNeighbour = hovered ? neighbours.has(node.id) : false;
  const isDimmed = hovered !== null && !isHov && !isNeighbour;

  const baseColor = node.color || NODE_COLORS[node.type || "default"] || NODE_COLORS.default;
  const color = useMemo(() => new THREE.Color(baseColor), [baseColor]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    // Float animation
    mesh.position.copy(position);
    mesh.position.y += Math.sin(Date.now() * 0.001 + position.x) * 0.06;
    // Slow rotation on Y
    mesh.rotation.y += delta * 0.4;

    // Scale pulse on hover
    const targetScale = isHov ? 1.35 : isDimmed ? 0.75 : 1.0;
    mesh.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.12);

    if (glowRef.current) {
      glowRef.current.position.copy(mesh.position);
      const gs = isHov ? 1.9 : 1.4;
      glowRef.current.scale.lerp(new THREE.Vector3(gs, gs, gs), 0.12);
    }
  });

  return (
    <group>
      {/* Glow halo */}
      <mesh ref={glowRef} position={position.toArray()}>
        <sphereGeometry args={[0.62, 16, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={isDimmed ? 0.03 : isHov ? 0.22 : 0.08}
          depthWrite={false}
        />
      </mesh>

      {/* Core geometry */}
      <mesh
        ref={meshRef}
        position={position.toArray()}
        onPointerOver={(e) => { e.stopPropagation(); onHover(node.id); }}
        onPointerOut={() => onHover(null)}
      >
        {nodeGeometry(node.type || "concept")}
        <meshPhysicalMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isDimmed ? 0.15 : isHov ? 3.5 : 1.4}
          transmission={0.25}
          roughness={0.08}
          metalness={0.6}
          ior={1.4}
          thickness={0.5}
          transparent
          opacity={isDimmed ? 0.35 : 1}
        />
        <pointLight
          distance={4}
          intensity={isHov ? 3 : 1}
          color={color}
        />
      </mesh>

      {/* Label */}
      {(isHov || isNeighbour || !hovered) && (
        <Html
          position={[
            position.x,
            position.y + (Math.sin(Date.now() * 0.001 + position.x) * 0.06) + 0.95,
            position.z,
          ]}
          center
          distanceFactor={10}
          zIndexRange={[100, 0]}
          style={{ pointerEvents: "none" }}
        >
          <div
            style={{
              padding: "5px 12px",
              borderRadius: 8,
              fontSize: isHov ? 13 : 11,
              fontWeight: isHov ? 700 : 500,
              color: "#fff",
              background: isHov
                ? `${baseColor}33`
                : "rgba(0,0,0,0.55)",
              border: `1px solid ${isHov ? baseColor : "rgba(255,255,255,0.12)"}`,
              backdropFilter: "blur(12px)",
              whiteSpace: "nowrap",
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: "0.03em",
              boxShadow: isHov ? `0 0 20px ${baseColor}55` : "none",
              transition: "all 0.2s ease",
              opacity: isDimmed ? 0.3 : 1,
            }}
          >
            {node.label}
          </div>
        </Html>
      )}
    </group>
  );
}

// ─── Animated Edge with Particle Flow ────────────────────────────────────────

const MAX_PARTICLES = 4;

interface EdgeLineProps {
  from: THREE.Vector3;
  to: THREE.Vector3;
  label?: string;
  hovered: string | null;
  fromId: string;
  toId: string;
  edgeColor: string;
}

function EdgeLine({ from, to, label, hovered, fromId, toId, edgeColor }: EdgeLineProps) {
  const particlesRef = useRef<THREE.InstancedMesh>(null);
  const matrix       = useMemo(() => new THREE.Matrix4(), []);
  const dummy         = useMemo(() => new THREE.Object3D(), []);

  const isActive = !hovered || hovered === fromId || hovered === toId;

  const curve = useMemo(() => {
    const mid = new THREE.Vector3().lerpVectors(from, to, 0.5);
    // Slight arc
    mid.y += from.distanceTo(to) * 0.12;
    return new THREE.QuadraticBezierCurve3(from, mid, to);
  }, [from, to]);

  const points = useMemo(() => curve.getPoints(40), [curve]);

  useFrame(() => {
    const im = particlesRef.current;
    if (!im) return;
    const t = (Date.now() * 0.0004) % 1;
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
        points={points}
        color={edgeColor}
        lineWidth={isActive ? 1.2 : 0.4}
        transparent
        opacity={isActive ? 0.55 : 0.12}
        dashed={false}
      />

      {/* Flowing particles */}
      <instancedMesh ref={particlesRef} args={[undefined, undefined, MAX_PARTICLES]}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </instancedMesh>

      {/* Edge label */}
      {label && isActive && (
        <Html
          position={curve.getPoint(0.5).toArray()}
          center
          distanceFactor={12}
          style={{ pointerEvents: "none" }}
        >
          <div
            style={{
              fontSize: 9,
              fontWeight: 600,
              color: edgeColor,
              background: "rgba(0,0,0,0.7)",
              border: `1px solid ${edgeColor}55`,
              borderRadius: 5,
              padding: "3px 8px",
              fontFamily: "'JetBrains Mono', monospace",
              whiteSpace: "nowrap",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            {label}
          </div>
        </Html>
      )}
    </group>
  );
}

// ─── FCFS / CPU Scheduling Overlay ───────────────────────────────────────────

function SchedulingOverlay({ nodes }: { nodes: SimulationNode[] }) {
  const timeRef = useRef<HTMLDivElement>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 80);
    return () => clearInterval(id);
  }, []);

  // Build FCFS schedule
  const schedule = useMemo(() => {
    const sorted = [...nodes]
      .filter((n) => n.burst)
      .sort((a, b) => (a.arrival || 0) - (b.arrival || 0));
    let clock = 0;
    return sorted.map((n) => {
      const start = Math.max(clock, n.arrival || 0);
      const end   = start + (n.burst || 1);
      clock = end;
      return { ...n, start, end };
    });
  }, [nodes]);

  const totalTime = schedule[schedule.length - 1]?.end || 1;
  const cursor    = ((tick * 0.4) % (totalTime + 2));

  const colors = ["#38bdf8","#a78bfa","#34d399","#fb923c","#f43f5e","#fbbf24"];

  return (
    <div
      style={{
        position: "absolute",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        width: "90%",
        maxWidth: 700,
        background: "rgba(0,0,0,0.75)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 14,
        padding: "16px 20px",
        fontFamily: "'JetBrains Mono', monospace",
        pointerEvents: "none",
        backdropFilter: "blur(16px)",
      }}
    >
      <div style={{ fontSize: 10, color: "#71717a", marginBottom: 10, letterSpacing: "0.1em", textTransform: "uppercase" }}>
        FCFS Timeline — t = {cursor.toFixed(1)}
      </div>
      <div style={{ position: "relative", height: 28 }}>
        {schedule.map((s, idx) => {
          const color = colors[idx % colors.length];
          const left  = (s.start / totalTime) * 100;
          const width = ((s.end - s.start) / totalTime) * 100;
          const active = cursor >= s.start && cursor < s.end;
          return (
            <div
              key={s.id}
              style={{
                position: "absolute",
                left:  `${left}%`,
                width: `${width}%`,
                height: "100%",
                background: active ? color : `${color}44`,
                borderRadius: 6,
                border: `1px solid ${color}88`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 9,
                color: active ? "#000" : color,
                fontWeight: 700,
                transition: "background 0.1s",
                overflow: "hidden",
              }}
            >
              {s.label}
            </div>
          );
        })}
        {/* Cursor */}
        <div
          style={{
            position: "absolute",
            left: `${(cursor / totalTime) * 100}%`,
            top: -4,
            bottom: -4,
            width: 2,
            background: "#fff",
            borderRadius: 2,
            boxShadow: "0 0 8px #fff",
          }}
        />
      </div>
    </div>
  );
}

// ─── Camera Auto-Fit ──────────────────────────────────────────────────────────

function AutoFitCamera({ bodies }: { bodies: React.MutableRefObject<{ pos: THREE.Vector3 }[]> }) {
  const { camera } = useThree();
  const fitted = useRef(false);

  useFrame(() => {
    if (fitted.current) return;
    const bs = bodies.current;
    if (bs.length === 0) return;

    // After 150 frames, fit camera
    if ((camera as any).__fitFrame === undefined) (camera as any).__fitFrame = 0;
    (camera as any).__fitFrame += 1;
    if ((camera as any).__fitFrame < 150) return;

    const box = new THREE.Box3();
    for (const b of bs) box.expandByPoint(b.pos);
    const size   = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist   = maxDim * 1.6;

    camera.position.set(center.x, center.y, center.z + dist);
    camera.lookAt(center);
    fitted.current = true;
  });

  return null;
}

// ─── Ambient Particles (Background) ──────────────────────────────────────────

function AmbientDust() {
  const ref   = useRef<THREE.Points>(null);
  const count = 260;
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) arr[i] = (Math.random() - 0.5) * 40;
    return arr;
  }, []);

  useFrame(() => {
    if (ref.current) ref.current.rotation.y += 0.00015;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.035} color="#a78bfa" transparent opacity={0.35} sizeAttenuation />
    </points>
  );
}

// ─── Inner Scene (must be inside Canvas) ─────────────────────────────────────

interface SceneProps {
  spec: SimulationSpec;
  hovered: string | null;
  onHover: (id: string | null) => void;
}

function Scene({ spec, hovered, onHover }: SceneProps) {
  const { tick, getPos, bodies } = useForceGraph(spec.nodes, spec.edges || []);

  const [positions, setPositions] = useState<Record<string, THREE.Vector3>>({});

  useFrame(() => {
    tick();
    // Read positions from physics bodies
    const next: Record<string, THREE.Vector3> = {};
    for (const n of spec.nodes) {
      const p = getPos(n.id);
      if (p) next[n.id] = p.clone();
    }
    setPositions(next);
  });

  // Neighbour map for hover dimming
  const neighbourMap = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const n of spec.nodes) map[n.id] = new Set();
    for (const e of spec.edges || []) {
      map[e.from]?.add(e.to);
      map[e.to]?.add(e.from);
    }
    return map;
  }, [spec]);

  const hoveredNeighbours: Set<string> = hovered ? (neighbourMap[hovered] || new Set()) : new Set();

  return (
    <>
      <color attach="background" args={["#020408"]} />
      <ambientLight intensity={0.3} />
      <directionalLight position={[10, 12, 8]} intensity={0.8} color="#a0c4ff" />
      <pointLight position={[-10, -8, -10]} intensity={0.4} color="#c084fc" />

      <AmbientDust />
      <AutoFitCamera bodies={bodies} />

      {/* Edges */}
      {(spec.edges || []).map((edge, idx) => {
        const a = positions[edge.from];
        const b = positions[edge.to];
        if (!a || !b) return null;

        const fromNode = spec.nodes.find((n) => n.id === edge.from);
        const toNode   = spec.nodes.find((n) => n.id === edge.to);
        const col = fromNode?.color || NODE_COLORS[fromNode?.type || "default"] || "#38bdf8";

        return (
          <EdgeLine
            key={`${edge.from}-${edge.to}-${idx}`}
            from={a}
            to={b}
            label={edge.label}
            hovered={hovered}
            fromId={edge.from}
            toId={edge.to}
            edgeColor={col}
          />
        );
      })}

      {/* Nodes */}
      {spec.nodes.map((node) => {
        const pos = positions[node.id];
        if (!pos) return null;
        return (
          <NodeMesh
            key={node.id}
            node={node}
            position={pos}
            hovered={hovered}
            onHover={onHover}
            neighbours={hoveredNeighbours}
          />
        );
      })}

      {/* Post-processing */}
      <EffectComposer>
        <Bloom
          intensity={1.8}
          luminanceThreshold={0.1}
          luminanceSmoothing={0.9}
          mipmapBlur
        />
      </EffectComposer>

      <OrbitControls
        enablePan
        enableZoom
        enableRotate
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

  return (
    <div style={{ display: "grid", gap: 20, fontFamily: "'JetBrains Mono', monospace" }}>
      {/* Header */}
      <div>
        <div
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: "#fff",
            letterSpacing: "-0.02em",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "#38bdf8",
              boxShadow: "0 0 14px #38bdf8",
              animation: "pulse 2s ease-in-out infinite",
            }}
          />
          {spec.title}
        </div>
        {spec.description && (
          <div
            style={{
              fontSize: 13,
              color: "#71717a",
              marginTop: 6,
              lineHeight: 1.6,
              maxWidth: 640,
            }}
          >
            {spec.description}
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {(["server", "database", "client", "concept"] as const).map((t) => (
          <div key={t} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: NODE_COLORS[t],
                boxShadow: `0 0 8px ${NODE_COLORS[t]}`,
              }}
            />
            <span style={{ fontSize: 10, color: "#71717a", textTransform: "capitalize", letterSpacing: "0.05em" }}>
              {t}
            </span>
          </div>
        ))}
      </div>

      {/* Canvas */}
      <div
        style={{
          height: 520,
          borderRadius: 20,
          border: "1px solid rgba(255,255,255,0.07)",
          background: "#020408",
          overflow: "hidden",
          position: "relative",
          boxShadow: "inset 0 0 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(56,189,248,0.08)",
        }}
      >
        <Canvas
          camera={{ position: [0, 0, 18], fov: 55 }}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
          dpr={[1, 2]}
        >
          <Scene spec={spec} hovered={hovered} onHover={setHovered} />
        </Canvas>

        {/* FCFS overlay */}
        {isScheduling && <SchedulingOverlay nodes={spec.nodes} />}

        {/* Corner badge */}
        <div
          style={{
            position: "absolute",
            top: 14,
            right: 16,
            fontSize: 9,
            color: "#38bdf8",
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: "0.1em",
            opacity: 0.6,
            textTransform: "uppercase",
          }}
        >
          Force-Directed · 3D
        </div>
      </div>

      {/* Walkthrough steps */}
      {!!spec.steps?.length && (
        <div
          style={{
            borderRadius: 14,
            border: "1px solid rgba(56,189,248,0.15)",
            background: "rgba(56,189,248,0.04)",
            padding: "18px 22px",
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "#38bdf8",
              marginBottom: 14,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            Walkthrough
          </div>
          <ol
            style={{
              margin: 0,
              paddingLeft: 20,
              color: "#cbd5e1",
              fontSize: 13,
              lineHeight: 1.85,
            }}
          >
            {spec.steps.map((step, idx) => (
              <li key={idx} style={{ marginBottom: 6 }}>
                {step}
              </li>
            ))}
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