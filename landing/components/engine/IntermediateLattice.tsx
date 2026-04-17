'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useEngine } from '@/lib/store';

type Arc = { radius: number; axis: THREE.Vector3; start: number; sweep: number };

const buildArc = (a: Arc) => {
  const pts: THREE.Vector3[] = [];
  const segs = 64;
  const basis = new THREE.Matrix4().lookAt(
    new THREE.Vector3(0, 0, 0),
    a.axis,
    new THREE.Vector3(0, 1, 0),
  );
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const angle = a.start + t * a.sweep;
    const v = new THREE.Vector3(
      Math.cos(angle) * a.radius,
      Math.sin(angle) * a.radius,
      0,
    );
    v.applyMatrix4(basis);
    pts.push(v);
  }
  return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
};

export function IntermediateLattice() {
  const group = useRef<THREE.Group>(null);

  const arcs = useMemo<Arc[]>(
    () => [
      { radius: 0.92, axis: new THREE.Vector3(1, 0.2, 0.1), start: 0.3, sweep: Math.PI * 1.2 },
      { radius: 1.05, axis: new THREE.Vector3(-0.2, 1, 0.3), start: -0.4, sweep: Math.PI * 1.4 },
      { radius: 0.98, axis: new THREE.Vector3(0.3, -0.4, 1), start: 0.8, sweep: Math.PI * 1.1 },
      { radius: 0.86, axis: new THREE.Vector3(-1, 0.3, -0.2), start: -0.1, sweep: Math.PI * 1.3 },
    ],
    [],
  );

  const geometries = useMemo(
    () => arcs.map((a) => new THREE.TubeGeometry(buildArc(a), 96, 0.011, 8, false)),
    [arcs],
  );

  const material = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#1C1230',
        roughness: 0.12,
        metalness: 0.0,
        transmission: 1.0,
        thickness: 0.4,
        ior: 1.48,
        attenuationColor: new THREE.Color('#1C1230'),
        attenuationDistance: 0.6,
        clearcoat: 0.4,
        clearcoatRoughness: 0.2,
        transparent: true,
      }),
    [],
  );

  useFrame((_, dt) => {
    const phase = useEngine.getState().phase;
    const settle = Math.max(0, Math.min(1, (phase - 0.3) / 0.45));
    if (group.current) {
      group.current.rotation.y += dt * (0.08 - settle * 0.06);
      group.current.rotation.x = Math.sin(phase * Math.PI * 2) * 0.04 * (1 - settle);
    }
  });

  return (
    <group ref={group}>
      {geometries.map((g, i) => (
        <mesh key={i} geometry={g} material={material} />
      ))}
    </group>
  );
}
