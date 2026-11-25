import { Html, Line, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { FLOWS, LINKS, ZONES, deviceById } from '../data/network';
import { blockedLinks } from '../sim/reach';
import { scenarioById } from '../sim/scenarios';
import { useStore } from '../store';
import type { Device, Flow } from '../types';
import { DeviceMesh } from './DeviceMesh';
import { BUILDING_ZONES, FLOOR_D, FLOOR_W, allDevices, flowColor, flowPath, isVisible, linkPoints, pathPoints, wpos, zoneY } from './geo';

export function Scene() {
  return (
    <Canvas camera={{ position: [42, 34, 46], fov: 45, near: 0.5, far: 600 }} dpr={[1, 2]} onPointerMissed={() => useStore.getState().select(null)}>
      <color attach="background" args={['#060a13']} />
      <fog attach="fog" args={['#060a13', 90, 220]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[30, 60, 20]} intensity={1.1} />
      <directionalLight position={[-40, 20, -30]} intensity={0.35} color="#7dd3fc" />
      <Ground />
      <Building />
      <Links />
      <Devices />
      <Flows />
      <CameraRig />
    </Canvas>
  );
}

function Ground() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[-10, -0.05, 0]}>
        <planeGeometry args={[220, 160]} />
        <meshStandardMaterial color="#0a1220" />
      </mesh>
      <gridHelper args={[220, 110, '#13304a', '#0e1d30']} position={[-10, 0, 0]} />
    </group>
  );
}

function Building() {
  const floor = useStore((s) => s.floor);
  const exploded = useStore((s) => s.exploded);
  const lang = useStore((s) => s.lang);
  const setFloor = useStore((s) => s.setFloor);
  const top = zoneY('f3', exploded) + 4;
  return (
    <group>
      {BUILDING_ZONES.map((z) => {
        const y = zoneY(z, exploded);
        const active = floor === 'all' || floor === z;
        return (
          <group key={z} position={[0, y, 0]}>
            <mesh position={[0, 0.05, 0]} onDoubleClick={(e) => (e.stopPropagation(), setFloor(floor === z ? 'all' : z))}>
              <boxGeometry args={[FLOOR_W, 0.2, FLOOR_D]} />
              <meshStandardMaterial color={z === 'b1' ? '#0f2236' : '#0e1b2e'} transparent opacity={active ? 0.78 : 0.12} />
            </mesh>
            <lineSegments position={[0, 0.16, 0]}>
              <edgesGeometry args={[new THREE.BoxGeometry(FLOOR_W, 0.01, FLOOR_D)]} />
              <lineBasicMaterial color={active ? '#22d3ee' : '#164e63'} transparent opacity={active ? 0.9 : 0.3} />
            </lineSegments>
            <Rooms zone={z} faded={!active} />
            <Html position={[FLOOR_W / 2 + 0.5, 0.4, FLOOR_D / 2]} center={false} style={{ pointerEvents: 'none' }} zIndexRange={[1, 0]}>
              <div className={`floor-tag ${active ? '' : 'dim'}`}>{ZONES[z].name[lang]}</div>
            </Html>
          </group>
        );
      })}
      {/* building pillars */}
      {[
        [-FLOOR_W / 2, -FLOOR_D / 2],
        [FLOOR_W / 2, -FLOOR_D / 2],
        [-FLOOR_W / 2, FLOOR_D / 2],
        [FLOOR_W / 2, FLOOR_D / 2],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, top / 2, z]}>
          <boxGeometry args={[0.35, top, 0.35]} />
          <meshStandardMaterial color="#1e3a5f" transparent opacity={0.5} />
        </mesh>
      ))}
      {/* cable riser */}
      <mesh position={[-19.5, top / 2, -11]}>
        <cylinderGeometry args={[0.5, 0.5, top, 8]} />
        <meshStandardMaterial color="#0e7490" transparent opacity={0.25} />
      </mesh>
      {/* red cross sign on the roof */}
      <group position={[0, top + 0.2, 0]}>
        <mesh>
          <boxGeometry args={[6, 0.3, 2]} />
          <meshStandardMaterial color="#ef4444" emissive="#7f1d1d" />
        </mesh>
        <mesh>
          <boxGeometry args={[2, 0.3, 6]} />
          <meshStandardMaterial color="#ef4444" emissive="#7f1d1d" />
        </mesh>
      </group>
    </group>
  );
}

/** Low walls that outline rooms on each floor, purely decorative. */
const ROOMS: Record<string, { x: number; z: number; w: number; d: number }[]> = {
  b1: [
    { x: 4, z: -8, w: 24, d: 7 },
    { x: -14, z: -8, w: 11, d: 7 },
    { x: 10, z: 5, w: 12, d: 8 },
  ],
  f1: [
    { x: -6, z: 6, w: 10, d: 6 },
    { x: 16, z: 7, w: 8, d: 7 },
    { x: -17, z: -8, w: 6, d: 6 },
  ],
  f2: [
    { x: 8, z: 7, w: 6, d: 7 },
    { x: 14, z: 7, w: 6, d: 7 },
    { x: 2, z: 7, w: 6, d: 7 },
    { x: -7, z: 4, w: 8, d: 5 },
    { x: -17, z: -8, w: 6, d: 6 },
  ],
  f3: [
    { x: 9, z: -5, w: 10, d: 8 },
    { x: 0, z: -7, w: 7, d: 6 },
    { x: 13, z: 7, w: 9, d: 7 },
    { x: -17, z: -8, w: 6, d: 6 },
  ],
};

function Rooms({ zone, faded }: { zone: string; faded: boolean }) {
  return (
    <group>
      {(ROOMS[zone] ?? []).map((r, i) => (
        <lineSegments key={i} position={[r.x, 0.6, r.z]}>
          <edgesGeometry args={[new THREE.BoxGeometry(r.w, 1, r.d)]} />
          <lineBasicMaterial color="#38bdf8" transparent opacity={faded ? 0.06 : 0.28} />
        </lineSegments>
      ))}
    </group>
  );
}

function deviceDim(d: Device, floor: string, highlight: string[]) {
  if (highlight.length && !highlight.includes(d.id)) return true;
  return floor !== 'all' && d.zone !== floor && d.zone !== 'outside';
}

function Devices() {
  const sim = useStore((s) => s.sim);
  const floor = useStore((s) => s.floor);
  const highlight = useStore((s) => s.highlight);
  const exploded = useStore((s) => s.exploded);
  const showLabels = useStore((s) => s.showLabels);
  const selected = useStore((s) => s.selected);
  const lang = useStore((s) => s.lang);
  return (
    <group>
      {allDevices
        .filter((d) => isVisible(d.id, sim))
        .map((d) => (
          <DeviceMesh
            key={d.id}
            d={d}
            pos={wpos(d, exploded)}
            dim={deviceDim(d, floor, highlight)}
            selected={selected === d.id}
            compromised={sim.compromised.includes(d.id)}
            label={showLabels}
            lang={lang}
          />
        ))}
    </group>
  );
}

const LINK_STYLE = {
  trunk: { color: '#fbbf24', width: 2.2, dashed: false },
  uplink: { color: '#e2e8f0', width: 2.4, dashed: false },
  wan: { color: '#94a3b8', width: 1.6, dashed: true },
  access: { color: '#38bdf8', width: 1.2, dashed: false },
  wireless: { color: '#a5f3fc', width: 1, dashed: true },
};

function Links() {
  const sim = useStore((s) => s.sim);
  const exploded = useStore((s) => s.exploded);
  const floor = useStore((s) => s.floor);
  const highlight = useStore((s) => s.highlight);
  const blocked = useMemo(() => blockedLinks(sim), [sim]);
  return (
    <group>
      {LINKS.filter((lk) => isVisible(lk.id, sim)).map((lk) => {
        const a = deviceById(lk.a)!;
        const b = deviceById(lk.b)!;
        const st = LINK_STYLE[lk.kind];
        const isDown = blocked.has(lk.id);
        const rogue = lk.id === 'L-rogue-pda';
        const dim = deviceDim(a, floor, highlight) && deviceDim(b, floor, highlight);
        return (
          <Line
            key={lk.id}
            points={linkPoints(a, b, exploded)}
            color={isDown ? '#ef4444' : rogue ? '#ff3b3b' : st.color}
            lineWidth={st.width}
            dashed={st.dashed || isDown}
            dashSize={0.6}
            gapSize={0.4}
            transparent
            opacity={dim ? 0.08 : isDown ? 0.9 : 0.55}
          />
        );
      })}
    </group>
  );
}

function Flows() {
  const sim = useStore((s) => s.sim);
  const run = useStore((s) => s.run);
  const showFlows = useStore((s) => s.showFlows);
  const exploded = useStore((s) => s.exploded);
  const focusFlow = useStore((s) => s.focusFlow);
  const selected = useStore((s) => s.selected);
  const floor = useStore((s) => s.floor);

  const flows: Flow[] = useMemo(() => {
    const hostile = run && !run.finishedAt ? scenarioById(run.id)!.attackFlows(sim) : [];
    const normal = showFlows ? FLOWS : FLOWS.filter((f) => f.id === focusFlow || f.from === selected || f.to === selected);
    return [...normal, ...hostile];
  }, [sim, run, showFlows, focusFlow, selected]);

  return (
    <group>
      {flows.map((f) => {
        const ids = flowPath(f, sim);
        if (!ids) return null;
        const pts = pathPoints(ids, exploded);
        const emphasised = f.hostile || f.id === focusFlow || (selected != null && (f.from === selected || f.to === selected));
        const dimmed = floor !== 'all' && !ids.some((id) => deviceById(id)!.zone === floor);
        return <Packets key={f.id + exploded} points={pts} color={flowColor(f)} big={emphasised} hostile={!!f.hostile} dim={dimmed && !emphasised} showPath={emphasised} />;
      })}
    </group>
  );
}

function Packets({ points, color, big, hostile, dim, showPath }: { points: THREE.Vector3[]; color: string; big: boolean; hostile: boolean; dim: boolean; showPath: boolean }) {
  const curve = useMemo(() => {
    const c = new THREE.CurvePath<THREE.Vector3>();
    for (let i = 0; i < points.length - 1; i++) c.add(new THREE.LineCurve3(points[i], points[i + 1]));
    return c;
  }, [points]);
  const len = useMemo(() => curve.getLength(), [curve]);
  const refs = useRef<THREE.Mesh[]>([]);
  const n = hostile ? 5 : 3;
  const offset = useMemo(() => Math.random(), []);
  useFrame(({ clock }) => {
    const speed = hostile ? 14 : 9;
    for (let i = 0; i < n; i++) {
      const m = refs.current[i];
      if (!m || len === 0) continue;
      const t = (((clock.elapsedTime * speed) / len + offset + i / n) % 1 + 1) % 1;
      m.position.copy(curve.getPointAt(t));
    }
  });
  if (points.length < 2) return null;
  return (
    <group>
      {showPath && <Line points={points} color={color} lineWidth={hostile ? 3.2 : 2.6} transparent opacity={0.85} />}
      {Array.from({ length: n }).map((_, i) => (
        <mesh key={i} ref={(m) => m && (refs.current[i] = m)}>
          <sphereGeometry args={[big ? 0.32 : 0.2, 10, 10]} />
          <meshBasicMaterial color={color} transparent opacity={dim ? 0.15 : 1} />
        </mesh>
      ))}
    </group>
  );
}

function CameraRig() {
  const selected = useStore((s) => s.selected);
  const focusTick = useStore((s) => s.focusTick);
  const exploded = useStore((s) => s.exploded);
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const goal = useRef<{ target: THREE.Vector3; pos: THREE.Vector3 } | null>(null);

  useEffect(() => {
    if (!selected || focusTick === 0) return;
    const d = deviceById(selected);
    if (!d) return;
    const target = wpos(d, exploded);
    const dir = camera.position.clone().sub(controls.current?.target ?? new THREE.Vector3()).normalize();
    goal.current = { target, pos: target.clone().add(dir.multiplyScalar(26)) };
  }, [focusTick]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, dt) => {
    const g = goal.current;
    const c = controls.current;
    if (!g || !c) return;
    const k = 1 - Math.pow(0.002, dt);
    c.target.lerp(g.target, k);
    camera.position.lerp(g.pos, k);
    c.update();
    if (c.target.distanceTo(g.target) < 0.05) goal.current = null;
  });

  return <OrbitControls ref={controls} makeDefault target={[-6, 6, 0]} maxDistance={180} minDistance={6} enableDamping onStart={() => (goal.current = null)} />;
}
