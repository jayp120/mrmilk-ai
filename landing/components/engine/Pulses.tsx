'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useEngine } from '@/lib/store';

type Pulse = { radius: number; axis: THREE.Vector3; speed: number; offset: number };

const PULSES: Pulse[] = [
  { radius: 0.78, axis: new THREE.Vector3(0.9, 0.2, 0.0).normalize(), speed: 0.32, offset: 0 },
  { radius: 0.62, axis: new THREE.Vector3(0.15, 1.0, 0.35).normalize(), speed: -0.4, offset: 0.45 },
  { radius: 0.48, axis: new THREE.Vector3(-0.4, 0.3, 1.0).normalize(), speed: 0.5, offset: 0.2 },
];

export function Pulses() {
  const group = useRef<THREE.Group>(null);
  const meshes = useRef<THREE.Mesh[]>([]);

  const geometry = useMemo(() => new THREE.SphereGeometry(0.012, 12, 10), []);
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#F8EFDC'),
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );

  const basis = useMemo(
    () =>
      PULSES.map((p) => {
        const m = new THREE.Matrix4().lookAt(
          new THREE.Vector3(),
          p.axis,
          new THREE.Vector3(0, 1, 0),
        );
        return m;
      }),
    [],
  );

  useFrame((state, dt) => {
    const phase = useEngine.getState().phase;
    const resolved = Math.max(0, Math.min(1, (phase - 0.4) / 0.35));
    const t = state.clock.elapsedTime;
    PULSES.forEach((p, i) => {
      const mesh = meshes.current[i];
      if (!mesh) return;
      const a = (t * p.speed + p.offset) % (Math.PI * 2);
      const v = new THREE.Vector3(Math.cos(a) * p.radius, Math.sin(a) * p.radius, 0);
      v.applyMatrix4(basis[i]);
      mesh.position.copy(v);
      const s = 0.7 + Math.sin(a * 2) * 0.2;
      mesh.scale.setScalar(s * (0.4 + resolved * 0.9));
      (mesh.material as THREE.MeshBasicMaterial).opacity = 0.35 + resolved * 0.6;
    });
  });

  return (
    <group ref={group}>
      {PULSES.map((_, i) => (
        <mesh
          key={i}
          geometry={geometry}
          material={material}
          ref={(el) => {
            if (el) meshes.current[i] = el;
          }}
        />
      ))}
    </group>
  );
}
