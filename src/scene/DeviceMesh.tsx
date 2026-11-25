import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef, useState } from 'react';
import * as THREE from 'three';
import { useStore } from '../store';
import type { Device, Lang } from '../types';
import { deviceColor } from './geo';

interface Props {
  d: Device;
  pos: THREE.Vector3;
  dim: boolean;
  selected: boolean;
  compromised: boolean;
  label: boolean;
  lang: Lang;
}

export function DeviceMesh({ d, pos, dim, selected, compromised, label, lang }: Props) {
  const group = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const [hover, setHover] = useState(false);
  const color = compromised ? '#ef4444' : deviceColor(d);
  const hostile = d.kind === 'attacker' || d.kind === 'rogue';

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (group.current) {
      const s = selected ? 1.25 : hover ? 1.12 : 1;
      group.current.scale.lerp(new THREE.Vector3(s, s, s), 0.2);
      if (d.kind === 'internet') group.current.rotation.y = t * 0.15;
    }
    if (ring.current) {
      ring.current.rotation.z = t * 1.5;
      const m = ring.current.material as THREE.MeshBasicMaterial;
      m.opacity = compromised || hostile ? 0.5 + 0.5 * Math.sin(t * 6) : 0.9;
    }
  });

  const mat = (c = color, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => (
    <meshStandardMaterial
      color={c}
      emissive={compromised || hostile ? '#7f1d1d' : c}
      emissiveIntensity={compromised || hostile ? 0.9 : selected ? 0.45 : 0.12}
      transparent
      opacity={dim ? 0.14 : 1}
      flatShading
      {...extra}
    />
  );
  const dark = (o = 1) => <meshStandardMaterial color="#0f172a" transparent opacity={dim ? 0.12 : o} flatShading />;

  return (
    <group
      position={pos}
      onClick={(e) => {
        e.stopPropagation();
        useStore.getState().select(d.id, false);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        useStore.getState().select(d.id, true);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = '';
      }}
    >
      <group ref={group}>{shape(d, mat, dark)}</group>
      {(selected || compromised || hostile) && (
        <mesh ref={ring} rotation-x={-Math.PI / 2} position={[0, -0.55 - (d.lift ?? 0) + (d.lift ? d.lift : 0), 0]}>
          <ringGeometry args={[1.5, 1.75, 6]} />
          <meshBasicMaterial color={compromised || hostile ? '#ef4444' : '#22d3ee'} transparent side={THREE.DoubleSide} />
        </mesh>
      )}
      {label && !dim && (
        <Html position={[0, 1.6, 0]} center zIndexRange={[2, 0]} style={{ pointerEvents: 'none' }}>
          <div className={`dev-tag ${selected ? 'sel' : ''} ${compromised || hostile ? 'bad' : ''}`}>
            {d.id}
            {hover || selected ? <span className="sub">{d.name[lang]}</span> : null}
          </div>
        </Html>
      )}
    </group>
  );
}

type MatFn = (c?: string, extra?: Partial<THREE.MeshStandardMaterialParameters>) => JSX.Element;
type DarkFn = (o?: number) => JSX.Element;

/** Low-poly procedural shape for each device kind. */
function shape(d: Device, mat: MatFn, dark: DarkFn) {
  switch (d.kind) {
    case 'internet':
      return (
        <group position={[0, 2, 0]}>
          {[
            [0, 0, 0, 2.4],
            [2.2, -0.4, 0.4, 1.7],
            [-2.1, -0.5, -0.2, 1.8],
            [0.6, 0.9, -1.2, 1.5],
          ].map(([x, y, z, r], i) => (
            <mesh key={i} position={[x, y, z]}>
              <icosahedronGeometry args={[r, 0]} />
              {mat('#cbd5e1', { opacity: 0.85 })}
            </mesh>
          ))}
        </group>
      );
    case 'attacker':
      return (
        <group>
          <mesh position={[0, 0.6, 0]}>
            <boxGeometry args={[1.6, 2.4, 1.4]} />
            {mat('#7f1d1d')}
          </mesh>
          <mesh position={[0, 2.4, 0]}>
            <octahedronGeometry args={[0.8, 0]} />
            {mat('#ef4444')}
          </mesh>
        </group>
      );
    case 'router':
      return (
        <group>
          <mesh>
            <cylinderGeometry args={[1.1, 1.1, 0.7, 10]} />
            {mat()}
          </mesh>
          {[0, 1, 2, 3].map((i) => (
            <mesh key={i} position={[0, 0.4, 0]} rotation-y={(i * Math.PI) / 2}>
              <coneGeometry args={[0.18, 0.4, 4]} />
              {dark()}
            </mesh>
          ))}
        </group>
      );
    case 'firewall':
      return (
        <group>
          {[0, 1, 2].map((row) =>
            [0, 1].map((col) => (
              <mesh key={`${row}${col}`} position={[(col - 0.5) * 1.05 + (row % 2) * 0.25, row * 0.55 - 0.3, 0]}>
                <boxGeometry args={[1, 0.5, 0.9]} />
                {mat()}
              </mesh>
            )),
          )}
        </group>
      );
    case 'l3switch':
    case 'switch':
      return (
        <group>
          <mesh>
            <boxGeometry args={[d.kind === 'l3switch' ? 2.8 : 2.4, d.kind === 'l3switch' ? 0.9 : 0.45, 1.4]} />
            {mat()}
          </mesh>
          {Array.from({ length: 8 }).map((_, i) => (
            <mesh key={i} position={[-1 + i * 0.28, 0, 0.71]}>
              <boxGeometry args={[0.18, 0.18, 0.04]} />
              {dark()}
            </mesh>
          ))}
        </group>
      );
    case 'wlc':
      return (
        <group>
          <mesh>
            <boxGeometry args={[2.2, 0.7, 1.4]} />
            {mat()}
          </mesh>
          <mesh position={[0, 0.7, 0]}>
            <torusGeometry args={[0.5, 0.08, 6, 16, Math.PI]} />
            {mat('#22d3ee')}
          </mesh>
        </group>
      );
    case 'ap':
    case 'rogue':
      return (
        <group>
          <mesh>
            <cylinderGeometry args={[0.9, 1, 0.3, 12]} />
            {mat(d.kind === 'rogue' ? '#ef4444' : undefined)}
          </mesh>
          <mesh position={[0, -0.2, 0]}>
            <sphereGeometry args={[0.18, 8, 8]} />
            {mat(d.kind === 'rogue' ? '#fca5a5' : '#22d3ee')}
          </mesh>
          {d.kind === 'ap' && (
            <mesh position={[0, -1.6, 0]}>
              <cylinderGeometry args={[0.02, 0.02, 3, 4]} />
              {dark(0.4)}
            </mesh>
          )}
        </group>
      );
    case 'server':
    case 'siem':
      return (
        <group position={[0, 0.6, 0]}>
          <mesh>
            <boxGeometry args={[1.2, 2.4, 1.3]} />
            {mat()}
          </mesh>
          {[0, 1, 2, 3, 4].map((i) => (
            <mesh key={i} position={[0, -0.9 + i * 0.45, 0.66]}>
              <boxGeometry args={[1, 0.08, 0.02]} />
              {dark()}
            </mesh>
          ))}
          {d.kind === 'siem' && (
            <mesh position={[0, 1.5, 0]}>
              <octahedronGeometry args={[0.4, 0]} />
              {mat('#e9d5ff')}
            </mesh>
          )}
        </group>
      );
    case 'workstation':
      return (
        <group>
          <mesh position={[0, 0.6, 0]}>
            <boxGeometry args={[1.6, 1, 0.1]} />
            {mat()}
          </mesh>
          <mesh position={[0, 0.6, 0.06]}>
            <boxGeometry args={[1.4, 0.8, 0.02]} />
            {dark()}
          </mesh>
          <mesh position={[0, 0, 0]}>
            <cylinderGeometry args={[0.08, 0.3, 0.3, 6]} />
            {mat()}
          </mesh>
          <mesh position={[0, -0.1, 0.6]}>
            <boxGeometry args={[1.2, 0.05, 0.4]} />
            {mat('#94a3b8')}
          </mesh>
        </group>
      );
    case 'phone':
      return (
        <mesh position={[0, 0.2, 0]}>
          <boxGeometry args={[0.5, 0.9, 0.12]} />
          {mat()}
        </mesh>
      );
    case 'iot':
    default:
      return iotShape(d, mat, dark);
  }
}

function iotShape(d: Device, mat: MatFn, dark: DarkFn) {
  if (d.id.includes('CT'))
    return (
      <group position={[0, 0.6, 0]}>
        <mesh rotation-y={Math.PI / 2}>
          <torusGeometry args={[1.2, 0.45, 8, 16]} />
          {mat()}
        </mesh>
        <mesh position={[1.6, -0.6, 0]}>
          <boxGeometry args={[2.6, 0.3, 0.7]} />
          {mat('#e2e8f0')}
        </mesh>
      </group>
    );
  if (d.id.includes('CAM'))
    return (
      <group rotation-z={-0.4}>
        <mesh rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.3, 0.35, 1.1, 8]} />
          {mat()}
        </mesh>
        <mesh position={[0.6, 0, 0]}>
          <sphereGeometry args={[0.18, 8, 8]} />
          {dark()}
        </mesh>
      </group>
    );
  if (d.id.includes('PUMP'))
    return (
      <group position={[0, 0.6, 0]}>
        <mesh position={[0, 1, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 3.2, 4]} />
          {mat('#94a3b8')}
        </mesh>
        <mesh position={[0, 0.2, 0.2]}>
          <boxGeometry args={[0.9, 1.1, 0.5]} />
          {mat()}
        </mesh>
        <mesh position={[0, 2.4, 0.2]}>
          <capsuleGeometry args={[0.25, 0.5, 3, 6]} />
          {mat('#e0f2fe', { opacity: 0.6 })}
        </mesh>
      </group>
    );
  if (d.id.includes('MON'))
    return (
      <group position={[0, 0.6, 0]}>
        <mesh>
          <boxGeometry args={[1.4, 1, 0.4]} />
          {mat()}
        </mesh>
        <mesh position={[0, 0, 0.21]}>
          <boxGeometry args={[1.2, 0.8, 0.02]} />
          {dark()}
        </mesh>
        <mesh position={[0, -1, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 1.4, 4]} />
          {mat('#94a3b8')}
        </mesh>
      </group>
    );
  if (d.id.includes('BMS'))
    return (
      <group position={[0, 0.4, 0]}>
        <mesh>
          <boxGeometry args={[1.5, 1.6, 0.8]} />
          {mat()}
        </mesh>
        <mesh position={[0, 1.05, 0]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.5, 0.5, 0.15, 8]} />
          {dark()}
        </mesh>
      </group>
    );
  return (
    <group position={[0, 0.5, 0]}>
      <mesh>
        <boxGeometry args={[1.4, 1.2, 1.2]} />
        {mat()}
      </mesh>
      <mesh position={[0, 0.7, 0]}>
        <cylinderGeometry args={[0.35, 0.35, 0.25, 8]} />
        {dark()}
      </mesh>
    </group>
  );
}
