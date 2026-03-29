"use client";

import React, { useMemo, useRef, useState, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Line, OrbitControls, Html } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PhysicsModelType =
  | "projectile"
  | "pendulum"
  | "spring"
  | "deadlock"
  | "tree"
  | "cpu_scheduling"
  | "network_topology";

export interface PhysicsParameter {
  key: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}

export interface PhysicsSandboxSpec {
  title: string;
  concept: string;
  modelType: PhysicsModelType;
  notes: string[];
  equations: string[];
  intuition: string;
  params: PhysicsParameter[];
  caveats?: string[];
}

// ─── Utilities ─────────────────────────────────────────────────────────────────

function toParamMap(params: PhysicsParameter[]) {
  const map = new Map<string, number>();
  for (const p of params) map.set(p.key, p.value);
  return map;
}

// ─── Ambient Dust ─────────────────────────────────────────────────────────────

function AmbientDust() {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const arr = new Float32Array(180 * 3);
    for (let i = 0; i < 180 * 3; i++) arr[i] = (Math.random() - 0.5) * 30;
    return arr;
  }, []);
  useFrame(() => { if (ref.current) ref.current.rotation.y += 0.0001; });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.03} color="#818cf8" transparent opacity={0.3} sizeAttenuation />
    </points>
  );
}

// ─── Floating Readout HUD ─────────────────────────────────────────────────────

function Readout({ position, lines, color = "#38bdf8" }: { position: [number, number, number]; lines: string[]; color?: string }) {
  return (
    <Html position={position} center distanceFactor={12} style={{ pointerEvents: "none" }}>
      <div style={{
        padding: "8px 14px", borderRadius: 9,
        background: "rgba(0,0,0,0.75)", border: `1px solid ${color}44`,
        backdropFilter: "blur(12px)", fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10, color, lineHeight: 1.7, whiteSpace: "nowrap",
        boxShadow: `0 0 16px ${color}22`,
      }}>
        {lines.map((l, i) => <div key={i}>{l}</div>)}
      </div>
    </Html>
  );
}

// ─── PROJECTILE ENGINE ────────────────────────────────────────────────────────

function projectileTrajectory(v0: number, angleDeg: number, g: number) {
  const angle   = (angleDeg * Math.PI) / 180;
  const tFlight = Math.max(0.25, (2 * v0 * Math.sin(angle)) / Math.max(g, 0.0001));
  const points: [number, number, number][] = [];
  for (let i = 0; i <= 120; i++) {
    const t = (i / 120) * tFlight;
    const x = v0 * Math.cos(angle) * t;
    const y = v0 * Math.sin(angle) * t - 0.5 * g * t * t;
    points.push([x, Math.max(0, y), 0]);
  }
  const range  = (v0 * v0 * Math.sin(2 * angle)) / Math.max(g, 0.0001);
  const maxH   = (v0 * v0 * Math.sin(angle) ** 2) / (2 * Math.max(g, 0.0001));
  return { points, tFlight, range, maxH };
}

function ProjectileEngine({ values }: { values: Map<string, number> }) {
  const bobRef = useRef<THREE.Mesh>(null);
  const trailRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const v0      = values.get("velocity") ?? 20;
  const angle   = values.get("angle") ?? 45;
  const g       = values.get("gravity") ?? 9.8;
  const { points, range, maxH } = useMemo(() => projectileTrajectory(v0, angle, g), [v0, angle, g]);

  const TRAIL = 12;

  useFrame(({ clock }) => {
    const mesh = bobRef.current;
    const im   = trailRef.current;
    if (!mesh) return;
    const progress = (clock.getElapsedTime() * 0.22) % 1;
    const idx = Math.min(points.length - 1, Math.floor(progress * points.length));
    const [x, y] = points[idx];
    mesh.position.set(x, y, 0);

    if (im) {
      for (let i = 0; i < TRAIL; i++) {
        const ti = Math.max(0, idx - i * 3);
        const [tx, ty] = points[ti];
        dummy.position.set(tx, ty, 0);
        const s = (1 - i / TRAIL) * 0.09;
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
      }
      im.instanceMatrix.needsUpdate = true;
    }
  });

  const scaledPoints = useMemo(() => points.map(([x, y, z]) => [x * 0.22, y * 0.22, z] as [number, number, number]), [points]);

  return (
    <group scale={[1, 1, 1]}>
      {/* Ground */}
      <mesh position={[range * 0.11, -0.05, 0]}>
        <boxGeometry args={[Math.max(8, range * 0.22 + 3), 0.08, 4]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>

      {/* Cannon */}
      <mesh position={[0, 0.2, 0]} rotation={[0, 0, (angle * Math.PI) / 180 - Math.PI / 2]}>
        <cylinderGeometry args={[0.12, 0.18, 0.7, 16]} />
        <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshStandardMaterial color="#334155" metalness={0.9} roughness={0.1} />
      </mesh>

      {/* Trajectory arc */}
      <Line points={scaledPoints} color="#38bdf8" lineWidth={1.5} transparent opacity={0.4} dashed dashScale={3} />

      {/* Trail */}
      <instancedMesh ref={trailRef} args={[undefined, undefined, TRAIL]}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial color="#22d3ee" toneMapped={false} transparent opacity={0.6} />
      </instancedMesh>

      {/* Projectile */}
      <mesh ref={bobRef}>
        <sphereGeometry args={[0.18, 20, 20]} />
        <meshPhysicalMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={2} metalness={0.8} roughness={0.1} />
        <pointLight distance={3} intensity={2} color="#38bdf8" />
      </mesh>

      {/* Target pole */}
      <mesh position={[range * 0.22, 0.5, 0]}>
        <boxGeometry args={[0.06, 1, 0.06]} />
        <meshStandardMaterial color="#ef4444" />
      </mesh>

      {/* Readouts */}
      <Readout position={[0, maxH * 0.22 + 1.2, 0]} lines={[`v₀ = ${v0.toFixed(1)} m/s`, `θ = ${angle.toFixed(1)}°`, `g = ${g.toFixed(2)} m/s²`]} color="#38bdf8" />
      <Readout position={[range * 0.11, -0.8, 0]} lines={[`R = ${range.toFixed(1)} m`, `H = ${maxH.toFixed(1)} m`]} color="#34d399" />
    </group>
  );
}

// ─── PENDULUM ENGINE ──────────────────────────────────────────────────────────

function PendulumEngine({ values }: { values: Map<string, number> }) {
  const bobRef = useRef<THREE.Mesh>(null);
  const rodRef = useRef<THREE.Line>(null);

  const L   = Math.max(0.1, values.get("length") ?? 2);
  const g   = Math.max(0.1, values.get("gravity") ?? 9.8);
  const amp = Math.min(Math.PI * 0.9, ((values.get("amplitude") ?? 20) * Math.PI) / 180);
  const damp = Math.max(0, values.get("damping") ?? 0.05);

  const phaseRef = useRef(0);
  const velRef   = useRef(0);
  const lastT    = useRef(0);
  const linePoints = useMemo(() => [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -L, 0)], [L]);

  useEffect(() => {
    phaseRef.current = amp;
    velRef.current = 0;
    lastT.current = 0;
  }, [amp, L, g]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const dt = Math.min(t - lastT.current, 0.05);
    lastT.current = t;

    const omega2 = g / L;
    // RK4 for accuracy
    const theta = phaseRef.current;
    const vv = velRef.current;
    const k1t = vv;
    const k1v = -omega2 * Math.sin(theta) - damp * vv;
    const k2t = vv + 0.5 * dt * k1v;
    const k2v = -omega2 * Math.sin(theta + 0.5 * dt * k1t) - damp * (vv + 0.5 * dt * k1v);
    const k3t = vv + 0.5 * dt * k2v;
    const k3v = -omega2 * Math.sin(theta + 0.5 * dt * k2t) - damp * (vv + 0.5 * dt * k2v);
    const k4t = vv + dt * k3v;
    const k4v = -omega2 * Math.sin(theta + dt * k3t) - damp * (vv + dt * k3v);
    phaseRef.current += (dt / 6) * (k1t + 2 * k2t + 2 * k3t + k4t);
    velRef.current   += (dt / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);

    const x = L * Math.sin(phaseRef.current);
    const y = -L * Math.cos(phaseRef.current);

    if (bobRef.current) {
      bobRef.current.position.set(x, y, 0);
      const speed = Math.abs(velRef.current);
      (bobRef.current.material as THREE.MeshPhysicalMaterial).emissiveIntensity = 0.8 + speed * 0.4;
    }

    if (rodRef.current) {
      const pos = rodRef.current.geometry.attributes.position;
      pos.setXYZ(1, x, y, 0);
      pos.needsUpdate = true;
    }
  });

  const period = 2 * Math.PI * Math.sqrt(L / g);

  return (
    <group>
      {/* Pivot */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshStandardMaterial color="#e2e8f0" metalness={0.9} roughness={0.1} />
      </mesh>

      {/* Rod (dynamic line) */}
{/* Just pass an array of [x,y,z] coordinates directly. No Float32Arrays needed! */}
<Line
  points={[
    [0, 0, 0],   // Point 1
    [5, 5, 0],   // Point 2
    [10, 0, 0]   // Point 3
  ]}       
  color="#38bdf8"
  lineWidth={3}  // Actually renders thick lines!
/>
      {/* Bob */}
      <mesh ref={bobRef} position={[0, -L, 0]}>
        <sphereGeometry args={[0.28, 24, 24]} />
        <meshPhysicalMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.8} metalness={0.4} roughness={0.15} />
        <pointLight distance={4} intensity={1.5} color="#22c55e" />
      </mesh>

      {/* Floor */}
      <mesh position={[0, -L - 0.5, 0]}>
        <boxGeometry args={[L * 3, 0.06, 3]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>

      <Readout position={[L + 0.5, -L / 2, 0]} lines={[`L = ${L.toFixed(2)} m`, `T = ${period.toFixed(2)} s`, `θ₀ = ${((amp * 180) / Math.PI).toFixed(1)}°`]} color="#22c55e" />
    </group>
  );
}

// ─── SPRING ENGINE ────────────────────────────────────────────────────────────

const COIL_SEGMENTS = 18;

function SpringCoil({ length, color }: { length: number; color: string }) {
  const points = useMemo(() => {
    const pts: [number, number, number][] = [];
    const turns = 6;
    const r = 0.15;
    for (let i = 0; i <= COIL_SEGMENTS * turns; i++) {
      const t  = i / (COIL_SEGMENTS * turns);
      const x  = t * length;
      const y  = Math.sin(t * turns * Math.PI * 2) * r;
      const z  = Math.cos(t * turns * Math.PI * 2) * r;
      pts.push([x, y, z]);
    }
    return pts;
  }, [length]);

  return <Line points={points} color={color} lineWidth={2} />;
}

function SpringEngine({ values }: { values: Map<string, number> }) {
  const massRef = useRef<THREE.Mesh>(null);
  const xRef    = useRef(0);
  const vRef    = useRef(0);
  const lastT   = useRef(0);
  const [springLen, setSpringLen] = useState(2);

  const k     = Math.max(0.1, values.get("k") ?? 20);
  const m     = Math.max(0.1, values.get("mass") ?? 1);
  const A     = Math.max(0.05, values.get("amplitude") ?? 1.2);
  const damp  = Math.max(0, values.get("damping") ?? 0.1);

  useEffect(() => {
    xRef.current = A;
    vRef.current = 0;
    lastT.current = 0;
  }, [A, k, m]);

  useFrame(({ clock }) => {
    const t  = clock.getElapsedTime();
    const dt = Math.min(t - lastT.current, 0.05);
    lastT.current = t;

    const omega2 = k / m;
    // Verlet integration
    const acc = -omega2 * xRef.current - damp * vRef.current;
    vRef.current += acc * dt;
    xRef.current += vRef.current * dt;

    const wallX  = -3;
    const restX  = wallX + 2; // natural length anchor
    const massX  = restX + xRef.current;

    if (massRef.current) {
      massRef.current.position.set(massX, 0, 0);
      const speed = Math.abs(vRef.current);
      (massRef.current.material as THREE.MeshPhysicalMaterial).emissiveIntensity = 0.5 + speed * 0.3;
    }

    setSpringLen(Math.max(0.1, xRef.current + 2));
  });

  const omega = Math.sqrt(k / m);
  const period = (2 * Math.PI) / omega;

  return (
    <group>
      {/* Wall */}
      <mesh position={[-3.15, 0, 0]}>
        <boxGeometry args={[0.25, 2, 1.8]} />
        <meshStandardMaterial color="#475569" metalness={0.6} roughness={0.3} />
      </mesh>

      {/* Spring coil */}
      <group position={[-3, 0, 0]}>
        <SpringCoil length={springLen} color="#38bdf8" />
      </group>

      {/* Mass */}
      <mesh ref={massRef} position={[-1 + A, 0, 0]}>
        <boxGeometry args={[0.55, 0.55, 0.55]} />
        <meshPhysicalMaterial color="#f97316" emissive="#f97316" emissiveIntensity={0.5} metalness={0.3} roughness={0.2} />
        <pointLight distance={4} intensity={1.5} color="#f97316" />
      </mesh>

      {/* Floor */}
      <mesh position={[0, -0.55, 0]}>
        <boxGeometry args={[10, 0.06, 3]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>

      {/* Equilibrium marker */}
      <mesh position={[-1, 0, 0.2]}>
        <boxGeometry args={[0.04, 1.2, 0.04]} />
        <meshBasicMaterial color="#52525b" />
      </mesh>

      <Readout position={[2, 1.2, 0]} lines={[`k = ${k.toFixed(1)} N/m`, `m = ${m.toFixed(2)} kg`, `ω = ${omega.toFixed(2)} rad/s`, `T = ${period.toFixed(2)} s`]} color="#f97316" />
    </group>
  );
}

// ─── DEADLOCK ENGINE ──────────────────────────────────────────────────────────

const DEADLOCK_COLORS = ["#38bdf8","#22c55e","#f59e0b","#f43f5e","#a78bfa","#14b8a6"];

function DeadlockEngine({ values }: { values: Map<string, number> }) {
  const processCount  = Math.max(2, Math.min(6, Math.floor(values.get("processes") ?? 3)));
  const resourceCount = Math.max(2, Math.min(6, Math.floor(values.get("resources") ?? 3)));
  const radius = 2.6;
  const pulseRef = useRef(0);

  const processNodes = useMemo<THREE.Vector3[]>(() =>
    Array.from({ length: processCount }).map((_, i) => {
      const a = (i / processCount) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0);
    }), [processCount]);

  const resourceNodes = useMemo<THREE.Vector3[]>(() =>
    Array.from({ length: resourceCount }).map((_, i) => {
      const a = (i / resourceCount) * Math.PI * 2 + Math.PI / resourceCount;
      return new THREE.Vector3(Math.cos(a) * (radius - 1.2), Math.sin(a) * (radius - 1.2), 0);
    }), [resourceCount]);

  const edges = useMemo(() => {
    const list: Array<{ from: THREE.Vector3; to: THREE.Vector3; type: "holds" | "waits" }> = [];
    for (let i = 0; i < processCount; i++) {
      list.push({ from: processNodes[i], to: resourceNodes[i % resourceCount], type: "holds" });
      list.push({ from: resourceNodes[(i + 1) % resourceCount], to: processNodes[i], type: "waits" });
    }
    return list;
  }, [processNodes, resourceNodes, processCount, resourceCount]);

  // Animated warning pulse
  const pulseNodeRef = useRef<THREE.Mesh[]>([]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    pulseNodeRef.current.forEach((m, i) => {
      if (!m) return;
      const s = 1 + 0.12 * Math.sin(t * 2 + i * 0.8);
      m.scale.setScalar(s);
      (m.material as THREE.MeshPhysicalMaterial).emissiveIntensity = 0.8 + 0.4 * Math.sin(t * 3 + i);
    });
  });

  return (
    <group>
      {/* Process nodes (circles) */}
      {processNodes.map((pos, i) => (
        <mesh key={`p-${i}`} ref={el => { if (el) pulseNodeRef.current[i] = el; }} position={pos.toArray()}>
          <sphereGeometry args={[0.28, 20, 20]} />
          <meshPhysicalMaterial color={DEADLOCK_COLORS[i % DEADLOCK_COLORS.length]} emissive={DEADLOCK_COLORS[i % DEADLOCK_COLORS.length]} emissiveIntensity={0.8} metalness={0.4} roughness={0.2} />
          <pointLight distance={3} intensity={1} color={DEADLOCK_COLORS[i % DEADLOCK_COLORS.length]} />
          <Html position={[0, 0.55, 0]} center distanceFactor={10} style={{ pointerEvents: "none" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: DEADLOCK_COLORS[i % DEADLOCK_COLORS.length], fontFamily: "monospace", whiteSpace: "nowrap" }}>P{i + 1}</div>
          </Html>
        </mesh>
      ))}

      {/* Resource nodes (squares/diamonds) */}
      {resourceNodes.map((pos, i) => (
        <mesh key={`r-${i}`} position={pos.toArray()} rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[0.36, 0.36, 0.36]} />
          <meshPhysicalMaterial color="#f97316" emissive="#f97316" emissiveIntensity={0.6} metalness={0.5} roughness={0.3} />
          <Html position={[0, 0.55, 0]} center distanceFactor={10} style={{ pointerEvents: "none" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#f97316", fontFamily: "monospace", whiteSpace: "nowrap" }}>R{i + 1}</div>
          </Html>
        </mesh>
      ))}

      {/* Edges */}
      {edges.map((edge, i) => (
        <Line
          key={`e-${i}`}
          points={[edge.from, edge.to]}
          color={edge.type === "holds" ? "#ef4444" : "#38bdf8"}
          lineWidth={edge.type === "holds" ? 1.5 : 1}
          dashed={edge.type === "waits"}
          dashScale={3}
        />
      ))}

      <Readout
        position={[0, -radius - 0.8, 0]}
        lines={[
          `Processes: ${processCount}`,
          `Resources: ${resourceCount}`,
          processCount > resourceCount ? "⚠ Circular wait likely" : "✓ May be safe",
        ]}
        color={processCount > resourceCount ? "#ef4444" : "#22c55e"}
      />
    </group>
  );
}

// ─── TREE ENGINE ──────────────────────────────────────────────────────────────

interface TreeNode { pos: THREE.Vector3; id: string; depth: number; }
interface TreeEdge { from: THREE.Vector3; to: THREE.Vector3; }

function buildTree(depth: number, spread: number): { nodes: TreeNode[]; edges: TreeEdge[] } {
  const nodes: TreeNode[] = [];
  const edges: TreeEdge[] = [];
  const levels: TreeNode[][] = [];
  const yTop = 2.5;

  for (let d = 0; d < depth; d++) {
    const count = Math.pow(2, d);
    const row: TreeNode[] = [];
    for (let i = 0; i < count; i++) {
      const x = count === 1 ? 0 : -spread / 2 + (spread / (count - 1)) * i;
      const y = yTop - d * 1.5;
      const id = `n-${d}-${i}`;
      row.push({ pos: new THREE.Vector3(x, y, 0), id, depth: d });
      nodes.push({ pos: new THREE.Vector3(x, y, 0), id, depth: d });
    }
    levels.push(row);
  }

  for (let d = 0; d < levels.length - 1; d++) {
    for (let i = 0; i < levels[d].length; i++) {
      const left  = levels[d + 1][i * 2];
      const right = levels[d + 1][i * 2 + 1];
      if (left)  edges.push({ from: levels[d][i].pos, to: left.pos });
      if (right) edges.push({ from: levels[d][i].pos, to: right.pos });
    }
  }

  return { nodes, edges };
}

const TREE_COLORS = ["#38bdf8", "#22c55e", "#f59e0b", "#a78bfa", "#f43f5e"];

function TreeEngine({ values }: { values: Map<string, number> }) {
  const depth  = Math.max(2, Math.min(5, Math.floor(values.get("depth") ?? 3)));
  const spread = Math.max(2, values.get("spread") ?? 5.5);
  const { nodes, edges } = useMemo(() => buildTree(depth, spread), [depth, spread]);

  const nodeRefs = useRef<THREE.Mesh[]>([]);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    nodeRefs.current.forEach((m, i) => {
      if (!m) return;
      const node = nodes[i];
      const s = 1 + 0.08 * Math.sin(t * 1.5 + node.depth * 1.1 + i * 0.3);
      m.scale.setScalar(s);
    });
  });

  return (
    <group>
      {edges.map((e, i) => (
        <Line key={`te-${i}`} points={[e.from, e.to]} color="#c4b5fd" lineWidth={1.1} />
      ))}

      {nodes.map((n, i) => (
        <mesh key={n.id} ref={el => { if (el) nodeRefs.current[i] = el; }} position={n.pos.toArray()}>
          <sphereGeometry args={[0.2, 18, 18]} />
          <meshPhysicalMaterial
            color={TREE_COLORS[n.depth % TREE_COLORS.length]}
            emissive={TREE_COLORS[n.depth % TREE_COLORS.length]}
            emissiveIntensity={0.8}
            metalness={0.4} roughness={0.2}
          />
          <pointLight distance={2} intensity={0.5} color={TREE_COLORS[n.depth % TREE_COLORS.length]} />
        </mesh>
      ))}

      <mesh position={[0, -3.5, 0]}>
        <boxGeometry args={[spread + 2, 0.05, 2.5]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>

      <Readout position={[0, -3, 0]} lines={[`Depth: ${depth}`, `Nodes: ${nodes.length}`, `Height: O(log n)`]} color="#c4b5fd" />
    </group>
  );
}

// ─── CPU SCHEDULING ENGINE ────────────────────────────────────────────────────

const CPU_COLORS = ["#38bdf8", "#22c55e", "#f59e0b", "#f97316", "#a78bfa", "#f43f5e", "#14b8a6", "#eab308"];

interface ScheduleSlot { pid: number; start: number; duration: number; }

function buildRoundRobinSchedule(processCount: number, quantum: number, contextSwitch: number, baseBurst: number): ScheduleSlot[] {
  const bursts   = Array.from({ length: processCount }).map((_, i) => Math.max(1, baseBurst - (i % 3)));
  const remaining = [...bursts];
  const slots: ScheduleSlot[] = [];
  let time = 0;

  while (remaining.some((r) => r > 0) && slots.length < 100) {
    for (let pid = 0; pid < remaining.length; pid++) {
      if (remaining[pid] <= 0) continue;
      const run = Math.min(quantum, remaining[pid]);
      slots.push({ pid, start: time, duration: run });
      time += run + contextSwitch;
      remaining[pid] -= run;
    }
  }
  return slots;
}

function CpuSchedulingEngine({ values }: { values: Map<string, number> }) {
  const playheadRef = useRef<THREE.Mesh>(null);

  const processCount   = Math.max(2, Math.min(8, Math.floor(values.get("processes") ?? 4)));
  const quantum        = Math.max(1, Math.floor(values.get("quantum") ?? 2));
  const contextSwitch  = Math.max(0, values.get("context_switch") ?? 0.2);
  const baseBurst      = Math.max(1, Math.floor(values.get("burst") ?? 6));

  const schedule = useMemo(
    () => buildRoundRobinSchedule(processCount, quantum, contextSwitch, baseBurst),
    [processCount, quantum, contextSwitch, baseBurst]
  );

  const totalTime = schedule.length > 0 ? schedule[schedule.length - 1].start + schedule[schedule.length - 1].duration : 1;
  const SCALE = 0.35;
  const X_OFFSET = -totalTime * SCALE * 0.5;

  useFrame(({ clock }) => {
    if (!playheadRef.current) return;
    const t = (clock.getElapsedTime() * 1.2) % (totalTime + 1);
    playheadRef.current.position.x = X_OFFSET + t * SCALE;
  });

  // Axis labels
  const axisTicks = useMemo(() => {
    const ticks: number[] = [];
    const step = Math.max(1, Math.ceil(totalTime / 10));
    for (let i = 0; i <= totalTime; i += step) ticks.push(i);
    return ticks;
  }, [totalTime]);

  return (
    <group>
      {/* Process lane lines */}
      {Array.from({ length: processCount }).map((_, i) => (
        <group key={`lane-${i}`}>
          <mesh position={[0, 2 - i * 0.8, -0.2]}>
            <boxGeometry args={[totalTime * SCALE + 1, 0.02, 0.02]} />
            <meshBasicMaterial color="#1e293b" />
          </mesh>
          <Html position={[X_OFFSET - 0.8, 2 - i * 0.8, 0]} center distanceFactor={12} style={{ pointerEvents: "none" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: CPU_COLORS[i % CPU_COLORS.length], fontFamily: "monospace", whiteSpace: "nowrap" }}>
              P{i + 1}
            </div>
          </Html>
        </group>
      ))}

      {/* Schedule blocks */}
      {schedule.map((slot, idx) => {
        const w    = Math.max(0.15, slot.duration * SCALE);
        const x    = X_OFFSET + slot.start * SCALE + w / 2;
        const y    = 2 - slot.pid * 0.8;
        const col  = CPU_COLORS[slot.pid % CPU_COLORS.length];
        return (
          <mesh key={`cpu-${idx}`} position={[x, y, 0]}>
            <boxGeometry args={[w - 0.04, 0.45, 0.35]} />
            <meshPhysicalMaterial color={col} emissive={col} emissiveIntensity={0.7} metalness={0.3} roughness={0.2} transparent opacity={0.9} />
          </mesh>
        );
      })}

      {/* Playhead (sweeping vertical plane) */}
      <mesh ref={playheadRef} position={[X_OFFSET, 1, 0]}>
        <boxGeometry args={[0.04, processCount * 0.8 + 0.5, 0.5]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.85} />
        <pointLight distance={3} intensity={2} color="#ffffff" />
      </mesh>

      {/* Time axis */}
      <mesh position={[0, 2 - processCount * 0.8 - 0.3, 0]}>
        <boxGeometry args={[totalTime * SCALE + 1, 0.04, 0.1]} />
        <meshBasicMaterial color="#334155" />
      </mesh>

      {/* Axis ticks */}
      {axisTicks.map((tick, i) => (
        <group key={i}>
          <mesh position={[X_OFFSET + tick * SCALE, 2 - processCount * 0.8 - 0.25, 0]}>
            <boxGeometry args={[0.03, 0.15, 0.1]} />
            <meshBasicMaterial color="#52525b" />
          </mesh>
          <Html position={[X_OFFSET + tick * SCALE, 2 - processCount * 0.8 - 0.55, 0]} center distanceFactor={14} style={{ pointerEvents: "none" }}>
            <div style={{ fontSize: 7, color: "#52525b", fontFamily: "monospace" }}>{tick}</div>
          </Html>
        </group>
      ))}

      <Readout position={[0, 2 - processCount * 0.8 - 1.1, 0]} lines={[`Processes: ${processCount}`, `Quantum: ${quantum}`, `Ctx Switch: ${contextSwitch.toFixed(1)}`, `Total Time: ${totalTime.toFixed(1)}`]} color="#38bdf8" />
    </group>
  );
}

// ─── NETWORK TOPOLOGY ENGINE ──────────────────────────────────────────────────

function NetworkTopologyEngine({ values }: { values: Map<string, number> }) {
  const nodeCount      = Math.max(3, Math.min(10, Math.floor(values.get("nodes") ?? 6)));
  const connectivity   = Math.max(1, Math.min(4, Math.floor(values.get("connectivity") ?? 2)));
  const packetRate     = Math.max(0.2, values.get("packet_rate") ?? 1.2);
  const failureRate    = Math.max(0, Math.min(0.8, values.get("failure_rate") ?? 0.1));

  const nodes = useMemo<THREE.Vector3[]>(() =>
    Array.from({ length: nodeCount }).map((_, i) => {
      const angle = (i / nodeCount) * Math.PI * 2;
      const r = 3;
      return new THREE.Vector3(Math.cos(angle) * r, Math.sin(angle) * r, 0);
    }), [nodeCount]);

  const edges = useMemo<Array<{ a: number; b: number; failed: boolean }>>(() => {
    const list: Array<{ a: number; b: number; failed: boolean }> = [];
    for (let i = 0; i < nodeCount; i++) {
      for (let hop = 1; hop <= connectivity; hop++) {
        const j = (i + hop) % nodeCount;
        if (i < j) {
          const failed = Math.random() < failureRate;
          list.push({ a: i, b: j, failed });
        }
      }
    }
    return list;
  }, [nodeCount, connectivity, failureRate]);

  const activeEdges = edges.filter(e => !e.failed);

  // Multi-packet animation
  const PACKET_COUNT = 6;
  const packetRefs   = useRef<THREE.Mesh[]>([]);
  const packetEdges  = useRef<number[]>(
    Array.from({ length: PACKET_COUNT }).map((_, i) => i % Math.max(1, activeEdges.length))
  );

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() * packetRate;
    packetRefs.current.forEach((mesh, pi) => {
      if (!mesh || activeEdges.length === 0) return;
      const edgeIdx = packetEdges.current[pi] % activeEdges.length;
      const edge    = activeEdges[edgeIdx];
      if (!edge) return;
      const localT  = (t * 0.5 + pi * (1 / PACKET_COUNT)) % 1;
      const a = nodes[edge.a];
      const b = nodes[edge.b];
      mesh.position.lerpVectors(a, b, localT);
      if (localT > 0.98) {
        packetEdges.current[pi] = (edgeIdx + 1 + pi) % activeEdges.length;
      }
    });
  });

  const nodeRefs = useRef<THREE.Mesh[]>([]);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    nodeRefs.current.forEach((m, i) => {
      if (!m) return;
      const s = 1 + 0.1 * Math.sin(t * 2 + i * 0.7);
      m.scale.setScalar(s);
    });
  });

  return (
    <group>
      {/* Edges */}
      {edges.map((edge, i) => (
        <Line
          key={`ne-${i}`}
          points={[nodes[edge.a], nodes[edge.b]]}
          color={edge.failed ? "#ef4444" : "#38bdf8"}
          lineWidth={edge.failed ? 0.6 : 1.2}
          transparent opacity={edge.failed ? 0.25 : 0.5}
          dashed={edge.failed}
          dashScale={3}
        />
      ))}

      {/* Nodes */}
      {nodes.map((pos, i) => (
        <mesh key={`nn-${i}`} ref={el => { if (el) nodeRefs.current[i] = el; }} position={pos.toArray()}>
          <sphereGeometry args={[0.22, 20, 20]} />
          <meshPhysicalMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.8} metalness={0.4} roughness={0.2} />
          <pointLight distance={3} intensity={0.8} color="#22d3ee" />
          <Html position={[0, 0.5, 0]} center distanceFactor={12} style={{ pointerEvents: "none" }}>
            <div style={{ fontSize: 8, fontWeight: 700, color: "#22d3ee", fontFamily: "monospace" }}>N{i + 1}</div>
          </Html>
        </mesh>
      ))}

      {/* Packets */}
      {Array.from({ length: PACKET_COUNT }).map((_, pi) => (
        <mesh key={`pkt-${pi}`} ref={el => { if (el) packetRefs.current[pi] = el; }}>
          <sphereGeometry args={[0.1, 10, 10]} />
          <meshBasicMaterial color="#fbbf24" toneMapped={false} />
          <pointLight distance={2} intensity={1} color="#fbbf24" />
        </mesh>
      ))}

      <Readout position={[0, -3.8, 0]} lines={[`Nodes: ${nodeCount}`, `Degree: ~${connectivity}`, `Failed links: ${edges.filter(e => e.failed).length}`]} color={failureRate > 0.4 ? "#ef4444" : "#22d3ee"} />
    </group>
  );
}

// ─── Scene Router ─────────────────────────────────────────────────────────────

function SandboxScene({ spec, values }: { spec: PhysicsSandboxSpec; values: Map<string, number> }) {
  const cameraPos = useMemo((): [number, number, number] => {
    switch (spec.modelType) {
      case "cpu_scheduling":    return [0, 1, 14];
      case "network_topology":  return [0, 0, 12];
      case "deadlock":          return [0, 0, 11];
      case "tree":              return [0, 0, 14];
      case "pendulum":          return [3, 0, 10];
      case "spring":            return [0, 1, 10];
      case "projectile":        return [6, 3, 14];
      default:                  return [3, 2, 10];
    }
  }, [spec.modelType]);

  return (
    <Canvas camera={{ position: cameraPos, fov: 52 }} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }} dpr={[1, 2]}>
      <color attach="background" args={["#030712"]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[5, 8, 6]} intensity={0.9} color="#bfdbfe" />
      <pointLight position={[-6, -4, -6]} intensity={0.3} color="#c084fc" />

      <AmbientDust />

      {spec.modelType === "projectile"      && <ProjectileEngine values={values} />}
      {spec.modelType === "pendulum"        && <PendulumEngine values={values} />}
      {spec.modelType === "spring"          && <SpringEngine values={values} />}
      {spec.modelType === "deadlock"        && <DeadlockEngine values={values} />}
      {spec.modelType === "tree"            && <TreeEngine values={values} />}
      {spec.modelType === "cpu_scheduling"  && <CpuSchedulingEngine values={values} />}
      {spec.modelType === "network_topology"&& <NetworkTopologyEngine values={values} />}

      <EffectComposer>
        <Bloom intensity={2.0} luminanceThreshold={0.08} luminanceSmoothing={0.9} mipmapBlur />
      </EffectComposer>

      <OrbitControls enablePan enableZoom enableRotate />
      <gridHelper args={[20, 20, "#0f172a", "#0a0f1a"]} />
    </Canvas>
  );
}

// ─── Breakage Analysis ────────────────────────────────────────────────────────

function evaluateBreakage(spec: PhysicsSandboxSpec, values: Map<string, number>): string[] {
  const msgs: string[] = [];
  switch (spec.modelType) {
    case "projectile": {
      const angle = values.get("angle") ?? 45;
      const g     = values.get("gravity") ?? 9.8;
      if (angle <= 5 || angle >= 85) msgs.push("Extreme launch angle collapses horizontal range.");
      if (g < 1)  msgs.push("Near-zero gravity makes trajectory non-intuitive.");
      if (g > 20) msgs.push("High gravity causes rapid drop — trajectory flattens.");
      break;
    }
    case "pendulum": {
      const amp = values.get("amplitude") ?? 20;
      const L   = values.get("length") ?? 2;
      if (amp > 50) msgs.push("Large angle breaks the small-angle approximation (sin θ ≠ θ).");
      if (L < 0.3)  msgs.push("Very short pendulum increases numerical stiffness.");
      break;
    }
    case "spring": {
      const damp = values.get("damping") ?? 0.1;
      const k    = values.get("k") ?? 20;
      if (damp > 1.5) msgs.push("Over-damped — no oscillation, just exponential decay.");
      if (k < 1)      msgs.push("Weak spring: very slow oscillation, barely visible motion.");
      break;
    }
    case "deadlock": {
      const p = Math.floor(values.get("processes") ?? 3);
      const r = Math.floor(values.get("resources") ?? 3);
      if (r >= p) msgs.push("Resources ≥ Processes: deadlock is unlikely (Coffman condition not met).");
      if (p > r + 2) msgs.push("Many more processes than resources — circular wait is almost certain.");
      break;
    }
    case "tree": {
      const d = Math.floor(values.get("depth") ?? 3);
      if (d >= 5) msgs.push("Depth ≥ 5: node count doubles per level, visual clarity degrades fast.");
      break;
    }
    case "cpu_scheduling": {
      const q   = Math.floor(values.get("quantum") ?? 2);
      const ctx = values.get("context_switch") ?? 0.2;
      if (q <= 1 && ctx > 0.5) msgs.push("Tiny quantum + high context switch overhead wastes CPU time.");
      if (q >= 8)              msgs.push("Large quantum degenerates to FCFS — poor interactive response.");
      break;
    }
    case "network_topology": {
      const fail = values.get("failure_rate") ?? 0.1;
      const conn = Math.floor(values.get("connectivity") ?? 2);
      if (fail > 0.45) msgs.push("High failure rate fragments the network — packet delivery fails.");
      if (conn <= 1)   msgs.push("Low connectivity creates fragile, poorly redundant topology.");
      break;
    }
  }
  return msgs;
}

// ─── Live Formula Readout ─────────────────────────────────────────────────────

function formulaSummary(spec: PhysicsSandboxSpec, values: Map<string, number>): string {
  switch (spec.modelType) {
    case "projectile": {
      const v0 = values.get("velocity") ?? 20;
      const a  = ((values.get("angle") ?? 45) * Math.PI) / 180;
      const g  = values.get("gravity") ?? 9.8;
      const R  = (v0 * v0 * Math.sin(2 * a)) / Math.max(g, 0.001);
      return `Range ≈ ${R.toFixed(1)} m`;
    }
    case "pendulum": {
      const L = Math.max(values.get("length") ?? 2, 0.1);
      const g = Math.max(values.get("gravity") ?? 9.8, 0.1);
      return `T = ${(2 * Math.PI * Math.sqrt(L / g)).toFixed(2)} s`;
    }
    case "spring": {
      const k = Math.max(values.get("k") ?? 20, 0.1);
      const m = Math.max(values.get("mass") ?? 1, 0.1);
      return `ω = ${Math.sqrt(k / m).toFixed(2)} rad/s`;
    }
    case "deadlock":
      return `${Math.floor(values.get("processes") ?? 3)}P · ${Math.floor(values.get("resources") ?? 3)}R`;
    case "tree":
      return `${Math.pow(2, Math.floor(values.get("depth") ?? 3)) - 1} nodes`;
    case "cpu_scheduling":
      return `q = ${Math.floor(values.get("quantum") ?? 2)} · ${Math.floor(values.get("processes") ?? 4)}P`;
    case "network_topology":
      return `${Math.floor(values.get("nodes") ?? 6)} nodes · degree ~${Math.floor(values.get("connectivity") ?? 2)}`;
    default:
      return "—";
  }
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function PhysicsSandboxPanel({ spec }: { spec: PhysicsSandboxSpec }) {
  const [params, setParams] = useState<PhysicsParameter[]>(spec.params);
  const values = useMemo(() => toParamMap(params), [params]);
  const breakage = useMemo(() => evaluateBreakage(spec, values), [spec, values]);
  const formula  = useMemo(() => formulaSummary(spec, values), [spec, values]);

  const isCS = ["deadlock","tree","cpu_scheduling","network_topology"].includes(spec.modelType);

  return (
    <div style={{ display: "grid", gap: 14, fontFamily: "'JetBrains Mono', monospace" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 12px #22c55e", animation: "pulse2 2s ease-in-out infinite" }} />
            {spec.title}
          </div>
          <div style={{ fontSize: 11, color: "#52525b", marginTop: 4 }}>{spec.concept}</div>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#22c55e", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", padding: "6px 14px", borderRadius: 10, whiteSpace: "nowrap" }}>
          {formula}
        </div>
      </div>

      {/* Intuition */}
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.72)", lineHeight: 1.65, padding: "12px 16px", background: "rgba(255,255,255,0.02)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.05)" }}>
        {spec.intuition || spec.concept}
      </div>

      {/* Model badge */}
      <div>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", padding: "3px 10px", borderRadius: 20, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", color: "#22c55e" }}>
          {spec.modelType.replace(/_/g, " ")}
        </span>
      </div>

      {/* 3D Canvas */}
      <div style={{ height: 440, borderRadius: 16, border: "1px solid rgba(255,255,255,0.07)", background: "#030712", overflow: "hidden", position: "relative", boxShadow: "inset 0 0 50px rgba(0,0,0,0.8), 0 0 0 1px rgba(34,197,94,0.06)" }}>
        <SandboxScene spec={spec} values={values} />
        <div style={{ position: "absolute", top: 12, right: 14, fontSize: 9, color: "#22c55e", letterSpacing: "0.1em", opacity: 0.6, textTransform: "uppercase" }}>
          Live Sandbox · 3D
        </div>
      </div>

      {/* Sliders */}
      <div style={{ display: "grid", gap: 10 }}>
        {params.map((param) => (
          <div key={param.key} style={{ border: "1px solid rgba(255,255,255,0.07)", borderRadius: 11, padding: "12px 14px", background: "rgba(255,255,255,0.02)", transition: "border-color 0.2s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(255,255,255,0.75)", marginBottom: 8 }}>
              <span style={{ fontWeight: 600 }}>{param.label}</span>
              <span style={{ color: "#22c55e" }}>
                {param.value.toFixed(param.step && param.step < 0.1 ? 3 : 2)}
                {param.unit ? ` ${param.unit}` : ""}
              </span>
            </div>
            <div style={{ position: "relative" }}>
              <input
                type="range"
                min={param.min} max={param.max}
                step={param.step ?? 0.1}
                value={param.value}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setParams((prev) => prev.map((p) => p.key === param.key ? { ...p, value } : p));
                }}
                style={{
                  width: "100%", accentColor: "#22c55e",
                  cursor: "pointer", outline: "none",
                }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#3f3f46", marginTop: 4 }}>
              <span>{param.min}{param.unit ? ` ${param.unit}` : ""}</span>
              <span>{param.max}{param.unit ? ` ${param.unit}` : ""}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Notes & Equations */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ border: "1px solid rgba(255,255,255,0.07)", borderRadius: 11, padding: 14, background: "rgba(255,255,255,0.02)" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#52525b", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>Key Notes</div>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "rgba(255,255,255,0.82)", lineHeight: 1.7 }}>
            {(spec.notes || []).slice(0, 8).map((n, i) => <li key={i} style={{ marginBottom: 4 }}>{n}</li>)}
          </ul>
        </div>
        <div style={{ border: "1px solid rgba(255,255,255,0.07)", borderRadius: 11, padding: 14, background: "rgba(255,255,255,0.02)" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#52525b", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {isCS ? "Rules / Relations" : "Equations"}
          </div>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "rgba(255,255,255,0.82)", lineHeight: 1.7 }}>
            {(spec.equations || []).slice(0, 8).map((eq, i) => <li key={i} style={{ marginBottom: 4, fontFamily: "'JetBrains Mono', monospace" }}>{eq}</li>)}
          </ul>
        </div>
      </div>

      {/* Breakage / Caveats */}
      {(breakage.length > 0 || (spec.caveats || []).length > 0) && (
        <div style={{ border: "1px solid rgba(239,68,68,0.25)", borderRadius: 11, padding: "14px 16px", background: "rgba(239,68,68,0.06)" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#fca5a5", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            ⚠ What Breaks and Why
          </div>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "rgba(255,255,255,0.88)", lineHeight: 1.7 }}>
            {breakage.map((m, i) => <li key={`b-${i}`} style={{ marginBottom: 4 }}>{m}</li>)}
            {(spec.caveats || []).map((m, i) => <li key={`c-${i}`} style={{ marginBottom: 4 }}>{m}</li>)}
          </ul>
        </div>
      )}

      <style>{`
        @keyframes pulse2 {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.4); }
        }
      `}</style>
    </div>
  );
}