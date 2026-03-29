"use client";

import React, { useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";

export type PhysicsModelType = "projectile" | "pendulum" | "spring" | "deadlock" | "tree" | "cpu_scheduling" | "network_topology";

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

function toParamMap(params: PhysicsParameter[]) {
  const map = new Map<string, number>();
  for (const param of params) map.set(param.key, param.value);
  return map;
}

function projectileTrajectory(v0: number, angleDeg: number, g: number) {
  const angle = (angleDeg * Math.PI) / 180;
  const tFlight = Math.max(0.25, (2 * v0 * Math.sin(angle)) / Math.max(g, 0.0001));
  const points: [number, number, number][] = [];
  const slices = 120;

  for (let i = 0; i <= slices; i += 1) {
    const t = (i / slices) * tFlight;
    const x = v0 * Math.cos(angle) * t;
    const y = v0 * Math.sin(angle) * t - 0.5 * g * t * t;
    points.push([x, Math.max(0, y), 0]);
  }

  return { points, tFlight };
}

function ProjectileBody({ values }: { values: Map<string, number> }) {
  const ref = useRef<THREE.Mesh>(null);

  const v0 = values.get("velocity") ?? 20;
  const angleDeg = values.get("angle") ?? 45;
  const g = values.get("gravity") ?? 9.8;
  const { points, tFlight } = useMemo(() => projectileTrajectory(v0, angleDeg, g), [v0, angleDeg, g]);

  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const progress = ((clock.getElapsedTime() * 0.25) % 1);
    const idx = Math.min(points.length - 1, Math.floor(progress * points.length));
    const [x, y, z] = points[idx];
    mesh.position.set(x, y, z);
  });

  return (
    <group>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.4, 0.4, 0.4]} />
        <meshStandardMaterial color="#f59e0b" />
      </mesh>
      <Line points={points} color="#38bdf8" lineWidth={1.2} />
      <mesh ref={ref}>
        <sphereGeometry args={[0.24, 24, 24]} />
        <meshStandardMaterial color="#22d3ee" />
      </mesh>
      <mesh position={[points[points.length - 1][0] + 1, 0, 0]}>
        <boxGeometry args={[2, 0.1, 1]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      <mesh position={[0, -0.05, 0]}>
        <boxGeometry args={[Math.max(8, (v0 * tFlight) + 6), 0.1, 5]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
    </group>
  );
}

function PendulumBody({ values }: { values: Map<string, number> }) {
  const bobRef = useRef<THREE.Mesh>(null);
  const rodRef = useRef<THREE.Mesh>(null);

  const L = Math.max(0.1, values.get("length") ?? 2);
  const g = Math.max(0.1, values.get("gravity") ?? 9.8);
  const amp = ((values.get("amplitude") ?? 20) * Math.PI) / 180;

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const omega = Math.sqrt(g / L);
    const theta = amp * Math.sin(omega * t);
    const x = L * Math.sin(theta);
    const y = -L * Math.cos(theta);

    if (bobRef.current) bobRef.current.position.set(x, y, 0);
    if (rodRef.current) {
      rodRef.current.position.set(x / 2, y / 2, 0);
      rodRef.current.rotation.z = theta;
      rodRef.current.scale.set(1, L, 1);
    }
  });

  return (
    <group>
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.14, 18, 18]} />
        <meshStandardMaterial color="#e2e8f0" />
      </mesh>
      <mesh ref={rodRef} position={[0, -L / 2, 0]}>
        <boxGeometry args={[0.05, 1, 0.05]} />
        <meshStandardMaterial color="#38bdf8" />
      </mesh>
      <mesh ref={bobRef} position={[0, -L, 0]}>
        <sphereGeometry args={[0.22, 24, 24]} />
        <meshStandardMaterial color="#22c55e" />
      </mesh>
      <mesh position={[0, -L - 0.35, 0]}>
        <boxGeometry args={[4, 0.06, 1.6]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
    </group>
  );
}

function SpringBody({ values }: { values: Map<string, number> }) {
  const massRef = useRef<THREE.Mesh>(null);
  const springRef = useRef<THREE.Mesh>(null);

  const k = Math.max(0.1, values.get("k") ?? 20);
  const m = Math.max(0.1, values.get("mass") ?? 1);
  const A = Math.max(0.05, values.get("amplitude") ?? 1);
  const damping = Math.max(0, values.get("damping") ?? 0.15);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const omega = Math.sqrt(k / m);
    const x = A * Math.exp(-damping * t) * Math.cos(omega * t);
    const shifted = x + 1.8;

    if (massRef.current) massRef.current.position.set(shifted, 0, 0);
    if (springRef.current) {
      springRef.current.position.set(shifted / 2 - 0.05, 0, 0);
      springRef.current.scale.set(Math.max(0.2, shifted), 1, 1);
    }
  });

  return (
    <group>
      <mesh position={[-0.2, 0, 0]}>
        <boxGeometry args={[0.3, 1.8, 1.8]} />
        <meshStandardMaterial color="#475569" />
      </mesh>
      <mesh ref={springRef} position={[0.8, 0, 0]}>
        <boxGeometry args={[1, 0.14, 0.14]} />
        <meshStandardMaterial color="#38bdf8" />
      </mesh>
      <mesh ref={massRef} position={[1.8, 0, 0]}>
        <boxGeometry args={[0.45, 0.45, 0.45]} />
        <meshStandardMaterial color="#f97316" />
      </mesh>
      <mesh position={[0.8, -0.32, 0]}>
        <boxGeometry args={[4.4, 0.06, 2]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
    </group>
  );
}

function DeadlockBody({ values }: { values: Map<string, number> }) {
  const processCount = Math.max(2, Math.floor(values.get("processes") ?? 3));
  const resourceCount = Math.max(2, Math.floor(values.get("resources") ?? 3));
  const ringRadius = 2.8;

  const processNodes: Array<[number, number, number]> = Array.from({ length: processCount }).map((_, idx) => {
    const angle = (idx / processCount) * Math.PI * 2;
    return [Math.cos(angle) * ringRadius, Math.sin(angle) * ringRadius, 0];
  });

  const resourceNodes: Array<[number, number, number]> = Array.from({ length: resourceCount }).map((_, idx) => {
    const angle = (idx / resourceCount) * Math.PI * 2 + Math.PI / resourceCount;
    return [Math.cos(angle) * (ringRadius - 1.1), Math.sin(angle) * (ringRadius - 1.1), 0];
  });

  const edges: Array<{ a: [number, number, number]; b: [number, number, number] }> = [];
  for (let i = 0; i < processCount; i += 1) {
    const p = processNodes[i];
    const r = resourceNodes[i % resourceCount];
    const waitR = resourceNodes[(i + 1) % resourceCount];
    edges.push({ a: p, b: r });
    edges.push({ a: waitR, b: p });
  }

  return (
    <group>
      {processNodes.map((position, idx) => (
        <mesh key={`p-${idx}`} position={position}>
          <sphereGeometry args={[0.26, 20, 20]} />
          <meshStandardMaterial color="#22c55e" />
        </mesh>
      ))}
      {resourceNodes.map((position, idx) => (
        <mesh key={`r-${idx}`} position={position}>
          <boxGeometry args={[0.34, 0.34, 0.34]} />
          <meshStandardMaterial color="#f97316" />
        </mesh>
      ))}
      {edges.map((edge, idx) => (
        <Line key={`e-${idx}`} points={[edge.a, edge.b]} color="#38bdf8" lineWidth={1.1} />
      ))}
      <mesh position={[0, -3.2, 0]}>
        <boxGeometry args={[8, 0.05, 2.4]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
    </group>
  );
}

function buildTreePoints(depth: number, width: number, yTop = 2.5) {
  const nodes: Array<[number, number, number]> = [];
  const edges: Array<[[number, number, number], [number, number, number]]> = [];
  const levelMap: Array<Array<[number, number, number]>> = [];

  for (let level = 0; level < depth; level += 1) {
    const count = Math.pow(2, level);
    const y = yTop - level * 1.3;
    const span = width / Math.max(1, count - 1);
    const row: Array<[number, number, number]> = [];

    for (let i = 0; i < count; i += 1) {
      const x = count === 1 ? 0 : -width / 2 + span * i;
      row.push([x, y, 0]);
      nodes.push([x, y, 0]);
    }
    levelMap.push(row);
  }

  for (let level = 0; level < levelMap.length - 1; level += 1) {
    const row = levelMap[level];
    const next = levelMap[level + 1];
    for (let i = 0; i < row.length; i += 1) {
      const left = next[i * 2];
      const right = next[i * 2 + 1];
      if (left) edges.push([row[i], left]);
      if (right) edges.push([row[i], right]);
    }
  }

  return { nodes, edges };
}

function TreeBody({ values }: { values: Map<string, number> }) {
  const depth = Math.max(2, Math.min(5, Math.floor(values.get("depth") ?? 3)));
  const width = Math.max(2.5, values.get("spread") ?? 5.4);
  const { nodes, edges } = useMemo(() => buildTreePoints(depth, width), [depth, width]);

  return (
    <group>
      {nodes.map((position, idx) => (
        <mesh key={`t-${idx}`} position={position}>
          <sphereGeometry args={[0.18, 18, 18]} />
          <meshStandardMaterial color="#22d3ee" />
        </mesh>
      ))}
      {edges.map((edge, idx) => (
        <Line key={`te-${idx}`} points={[edge[0], edge[1]]} color="#c4b5fd" lineWidth={1.1} />
      ))}
      <mesh position={[0, -3.5, 0]}>
        <boxGeometry args={[8.5, 0.05, 2.2]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
    </group>
  );
}

function CpuSchedulingBody({ values }: { values: Map<string, number> }) {
  const processCount = Math.max(2, Math.min(8, Math.floor(values.get("processes") ?? 4)));
  const quantum = Math.max(1, Math.floor(values.get("quantum") ?? 2));
  const contextSwitch = Math.max(0, values.get("context_switch") ?? 0.2);
  const baseBurst = Math.max(1, Math.floor(values.get("burst") ?? 6));

  const schedule = useMemo(() => {
    const bursts = Array.from({ length: processCount }).map((_, idx) => Math.max(1, baseBurst - (idx % 3)));
    const remaining = [...bursts];
    const slots: Array<{ pid: number; start: number; duration: number }> = [];
    let time = 0;

    while (remaining.some((r) => r > 0) && slots.length < 80) {
      for (let pid = 0; pid < remaining.length; pid += 1) {
        if (remaining[pid] <= 0) continue;
        const run = Math.min(quantum, remaining[pid]);
        slots.push({ pid, start: time, duration: run });
        time += run + contextSwitch;
        remaining[pid] -= run;
      }
    }

    return slots;
  }, [processCount, quantum, contextSwitch, baseBurst]);

  const colors = ["#38bdf8", "#22c55e", "#f59e0b", "#f97316", "#a78bfa", "#f43f5e", "#14b8a6", "#eab308"];

  return (
    <group>
      {schedule.map((slot, idx) => {
        const width = Math.max(0.25, slot.duration * 0.5);
        const x = -4 + slot.start * 0.25 + width / 2;
        const y = 1.8 - (slot.pid * 0.55);
        return (
          <mesh key={`cpu-${idx}`} position={[x, y, 0]}>
            <boxGeometry args={[width, 0.35, 0.35]} />
            <meshStandardMaterial color={colors[slot.pid % colors.length]} />
          </mesh>
        );
      })}

      {Array.from({ length: processCount }).map((_, idx) => (
        <mesh key={`lane-${idx}`} position={[0, 1.8 - (idx * 0.55), -0.3]}>
          <boxGeometry args={[9.8, 0.03, 0.03]} />
          <meshStandardMaterial color="#334155" />
        </mesh>
      ))}

      <mesh position={[0, -1.3, 0]}>
        <boxGeometry args={[10, 0.06, 2.4]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
    </group>
  );
}

function NetworkTopologyBody({ values }: { values: Map<string, number> }) {
  const nodeCount = Math.max(3, Math.min(10, Math.floor(values.get("nodes") ?? 6)));
  const connectivity = Math.max(1, Math.min(4, Math.floor(values.get("connectivity") ?? 2)));
  const packetRate = Math.max(0.2, values.get("packet_rate") ?? 1.2);
  const failureRate = Math.max(0, Math.min(0.8, values.get("failure_rate") ?? 0.1));

  const nodes = useMemo<Array<[number, number, number]>>(() => {
    const radius = 3;
    return Array.from({ length: nodeCount }).map((_, idx) => {
      const angle = (idx / nodeCount) * Math.PI * 2;
      return [Math.cos(angle) * radius, Math.sin(angle) * radius, 0];
    });
  }, [nodeCount]);

  const edges = useMemo<Array<[number, number]>>(() => {
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i < nodeCount; i += 1) {
      for (let hop = 1; hop <= connectivity; hop += 1) {
        const j = (i + hop) % nodeCount;
        if (i < j) pairs.push([i, j]);
      }
    }
    return pairs;
  }, [nodeCount, connectivity]);

  const packetRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!packetRef.current || edges.length === 0) return;
    const t = clock.getElapsedTime() * packetRate;
    const edgeIdx = Math.floor(t) % edges.length;
    const localT = t % 1;
    const [aIdx, bIdx] = edges[edgeIdx];
    const a = nodes[aIdx];
    const b = nodes[bIdx];
    packetRef.current.position.set(
      a[0] + (b[0] - a[0]) * localT,
      a[1] + (b[1] - a[1]) * localT,
      0,
    );
  });

  return (
    <group>
      {edges.map(([aIdx, bIdx], idx) => {
        const risky = ((idx + 1) / Math.max(1, edges.length)) < failureRate;
        return (
          <Line
            key={`ne-${idx}`}
            points={[nodes[aIdx], nodes[bIdx]]}
            color={risky ? "#ef4444" : "#38bdf8"}
            lineWidth={1.1}
          />
        );
      })}
      {nodes.map((position, idx) => (
        <mesh key={`nn-${idx}`} position={position}>
          <sphereGeometry args={[0.2, 18, 18]} />
          <meshStandardMaterial color="#22d3ee" />
        </mesh>
      ))}
      <mesh ref={packetRef}>
        <sphereGeometry args={[0.11, 14, 14]} />
        <meshStandardMaterial color="#f59e0b" />
      </mesh>
      <mesh position={[0, -3.2, 0]}>
        <boxGeometry args={[8.8, 0.05, 2.4]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
    </group>
  );
}

function ScenarioBody({ spec, values }: { spec: PhysicsSandboxSpec; values: Map<string, number> }) {
  if (spec.modelType === "cpu_scheduling") return <CpuSchedulingBody values={values} />;
  if (spec.modelType === "network_topology") return <NetworkTopologyBody values={values} />;
  if (spec.modelType === "deadlock") return <DeadlockBody values={values} />;
  if (spec.modelType === "tree") return <TreeBody values={values} />;
  if (spec.modelType === "pendulum") return <PendulumBody values={values} />;
  if (spec.modelType === "spring") return <SpringBody values={values} />;
  return <ProjectileBody values={values} />;
}

function evaluateBreakage(spec: PhysicsSandboxSpec, values: Map<string, number>) {
  const messages: string[] = [];

  if (spec.modelType === "projectile") {
    const angle = values.get("angle") ?? 45;
    const g = values.get("gravity") ?? 9.8;
    if (angle <= 0 || angle >= 90) messages.push("Launch angle is extreme, so horizontal range collapses.");
    if (g < 1) messages.push("Gravity is unrealistically low, so trajectory timing becomes non-intuitive.");
    if (g > 20) messages.push("Gravity is too high, so the projectile drops too fast.");
  }

  if (spec.modelType === "pendulum") {
    const amp = values.get("amplitude") ?? 20;
    const length = values.get("length") ?? 2;
    if (amp > 50) messages.push("Large-angle pendulum breaks the small-angle approximation behind simple equations.");
    if (length < 0.25) messages.push("Very short pendulum increases sensitivity and numerical instability.");
  }

  if (spec.modelType === "spring") {
    const damping = values.get("damping") ?? 0.15;
    const k = values.get("k") ?? 20;
    if (damping > 1.5) messages.push("Heavy damping suppresses oscillation, so periodic intuition no longer holds.");
    if (k < 1) messages.push("Spring constant is too weak, causing sluggish or barely oscillatory motion.");
  }

  if (spec.modelType === "deadlock") {
    const p = Math.max(2, Math.floor(values.get("processes") ?? 3));
    const r = Math.max(2, Math.floor(values.get("resources") ?? 3));
    if (r >= p) messages.push("When resources are at least as many as processes, deadlock likelihood usually drops.");
    if (p > r + 2) messages.push("Too many processes competing for few resources creates circular wait pressure.");
  }

  if (spec.modelType === "tree") {
    const d = Math.max(2, Math.floor(values.get("depth") ?? 3));
    if (d >= 5) messages.push("Tree depth is high, traversal cost grows quickly and visual clarity drops.");
  }

  if (spec.modelType === "cpu_scheduling") {
    const quantum = Math.max(1, Math.floor(values.get("quantum") ?? 2));
    const context = Math.max(0, values.get("context_switch") ?? 0.2);
    if (quantum <= 1 && context > 0.5) messages.push("Very small quantum with high context switch overhead wastes CPU time.");
    if (quantum >= 8) messages.push("Large quantum can behave like FCFS and hurt interactive responsiveness.");
  }

  if (spec.modelType === "network_topology") {
    const failure = Math.max(0, Math.min(0.8, values.get("failure_rate") ?? 0.1));
    const connectivity = Math.max(1, Math.floor(values.get("connectivity") ?? 2));
    if (failure > 0.45) messages.push("High link failure rate fragments routing paths and increases packet loss risk.");
    if (connectivity <= 1) messages.push("Low connectivity creates fragile topologies with weak redundancy.");
  }

  return messages;
}

export function PhysicsSandboxPanel({ spec }: { spec: PhysicsSandboxSpec }) {
  const [params, setParams] = useState<PhysicsParameter[]>(spec.params);

  const values = useMemo(() => toParamMap(params), [params]);
  const breakage = useMemo(() => evaluateBreakage(spec, values), [spec, values]);

  const formulaSummary = useMemo(() => {
    if (spec.modelType === "projectile") {
      const v0 = values.get("velocity") ?? 20;
      const angle = ((values.get("angle") ?? 45) * Math.PI) / 180;
      const g = values.get("gravity") ?? 9.8;
      const range = (v0 * v0 * Math.sin(2 * angle)) / Math.max(g, 0.0001);
      return `Range ≈ ${range.toFixed(2)} m`;
    }

    if (spec.modelType === "pendulum") {
      const L = Math.max(values.get("length") ?? 2, 0.1);
      const g = Math.max(values.get("gravity") ?? 9.8, 0.1);
      const period = 2 * Math.PI * Math.sqrt(L / g);
      return `Period ≈ ${period.toFixed(2)} s`;
    }

    if (spec.modelType === "deadlock") {
      const p = Math.max(2, Math.floor(values.get("processes") ?? 3));
      const r = Math.max(2, Math.floor(values.get("resources") ?? 3));
      return `Graph: ${p} processes · ${r} resources`;
    }

    if (spec.modelType === "tree") {
      const d = Math.max(2, Math.floor(values.get("depth") ?? 3));
      const nodes = Math.pow(2, d) - 1;
      return `Tree nodes ≈ ${nodes}`;
    }

    if (spec.modelType === "cpu_scheduling") {
      const p = Math.max(2, Math.floor(values.get("processes") ?? 4));
      const q = Math.max(1, Math.floor(values.get("quantum") ?? 2));
      return `Round-robin: ${p} processes · q=${q}`;
    }

    if (spec.modelType === "network_topology") {
      const n = Math.max(3, Math.floor(values.get("nodes") ?? 6));
      const c = Math.max(1, Math.floor(values.get("connectivity") ?? 2));
      return `Topology: ${n} nodes · degree~${c}`;
    }

    const k = Math.max(values.get("k") ?? 20, 0.1);
    const m = Math.max(values.get("mass") ?? 1, 0.1);
    const omega = Math.sqrt(k / m);
    return `Angular frequency ω ≈ ${omega.toFixed(2)} rad/s`;
  }, [spec.modelType, values]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{spec.title}</div>
        <div style={{ fontSize: 12, color: "#38bdf8" }}>{formulaSummary}</div>
      </div>

      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.55 }}>{spec.intuition || spec.concept}</div>

      <div
        style={{
          height: 420,
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.02)",
          overflow: "hidden",
        }}
      >
        <Canvas camera={{ position: [3, 2, 8], fov: 50 }}>
          <color attach="background" args={["#080808"]} />
          <ambientLight intensity={0.65} />
          <directionalLight position={[3, 6, 4]} intensity={1} />
          <pointLight position={[-4, -2, -3]} intensity={0.35} />
          <ScenarioBody spec={spec} values={values} />
          <OrbitControls enablePan enableZoom enableRotate />
          <gridHelper args={[20, 20, "#1f2937", "#111827"]} />
        </Canvas>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {params.map((param) => (
          <div key={param.key} style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 10, background: "rgba(255,255,255,0.02)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "rgba(255,255,255,0.8)", marginBottom: 6 }}>
              <span>{param.label}</span>
              <span>{param.value.toFixed(2)}{param.unit ? ` ${param.unit}` : ""}</span>
            </div>
            <input
              type="range"
              min={param.min}
              max={param.max}
              step={param.step ?? 0.1}
              value={param.value}
              onChange={(e) => {
                const value = Number(e.target.value);
                setParams((prev) => prev.map((p) => (p.key === param.key ? { ...p, value } : p)));
              }}
              style={{ width: "100%" }}
            />
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 12, background: "rgba(255,255,255,0.02)" }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>Structured Notes</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "rgba(255,255,255,0.86)", lineHeight: 1.55 }}>
            {(spec.notes || []).slice(0, 8).map((note, idx) => <li key={`${idx}-${note}`}>{note}</li>)}
          </ul>
        </div>

        <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 12, background: "rgba(255,255,255,0.02)" }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>{spec.modelType === "deadlock" || spec.modelType === "tree" || spec.modelType === "cpu_scheduling" || spec.modelType === "network_topology" ? "Rules / Relations" : "Real Equations"}</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "rgba(255,255,255,0.86)", lineHeight: 1.55 }}>
            {(spec.equations || []).slice(0, 8).map((eq, idx) => <li key={`${idx}-${eq}`}>{eq}</li>)}
          </ul>
        </div>
      </div>

      {(breakage.length > 0 || (spec.caveats || []).length > 0) && (
        <div style={{ border: "1px solid rgba(248,113,113,0.35)", borderRadius: 10, padding: 12, background: "rgba(248,113,113,0.08)" }}>
          <div style={{ fontSize: 12, color: "#fca5a5", marginBottom: 8 }}>What Broke and Why</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "rgba(255,255,255,0.9)", lineHeight: 1.55 }}>
            {breakage.map((msg, idx) => <li key={`b-${idx}`}>{msg}</li>)}
            {(spec.caveats || []).map((msg, idx) => <li key={`c-${idx}`}>{msg}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}