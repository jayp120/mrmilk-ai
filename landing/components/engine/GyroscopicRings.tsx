'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useEngine } from '@/lib/store';

type Ring = {
  radius: number;
  thickness: number;
  axis: [number, number, number];
  rate: number;
  edgeWidth: number;
};

const RINGS: Ring[] = [
  { radius: 0.78, thickness: 0.042, axis: [0.9, 0.2, 0.0], rate: 0.12, edgeWidth: 0.008 },
  { radius: 0.62, thickness: 0.036, axis: [0.15, 1.0, 0.35], rate: -0.18, edgeWidth: 0.007 },
  { radius: 0.48, thickness: 0.03, axis: [-0.4, 0.3, 1.0], rate: 0.22, edgeWidth: 0.006 },
  { radius: 0.34, thickness: 0.025, axis: [0.6, -0.5, 0.4], rate: -0.28, edgeWidth: 0.005 },
];

const axisQuat = (a: [number, number, number]) => {
  const v = new THREE.Vector3(...a).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(up, v);
  return q;
};

export function GyroscopicRings() {
  const group = useRef<THREE.Group>(null);
  const ringRefs = useRef<THREE.Group[]>([]);

  const obsidian = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#0B0716',
        roughness: 0.18,
        metalness: 0.0,
        clearcoat: 1.0,
        clearcoatRoughness: 0.08,
        ior: 1.6,
        reflectivity: 0.5,
      }),
    [],
  );

  const champagne = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#C9B185',
        roughness: 0.32,
        metalness: 1.0,
        anisotropy: 0.4,
      }),
    [],
  );

  const geometries = useMemo(() => {
    return RINGS.map((r) => {
      const body = new THREE.TorusGeometry(r.radius, r.thickness, 20, 160);
      const outerEdge = new THREE.TorusGeometry(
        r.radius + r.thickness * 0.92,
        r.edgeWidth,
        14,
        180,
      );
      const innerEdge = new THREE.TorusGeometry(
        r.radius - r.thickness * 0.92,
        r.edgeWidth,
        14,
        180,
      );
      return { body, outerEdge, innerEdge };
    });
  }, []);

  const quats = useMemo(() => RINGS.map((r) => axisQuat(r.axis)), []);

  useFrame((_, dt) => {
    const phase = useEngine.getState().phase;
    const pointer = useEngine.getState().pointer;
    const lock = Math.max(0, Math.min(1, (phase - 0.5) / 0.27));

    RINGS.forEach((r, i) => {
      const node = ringRefs.current[i];
      if (!node) return;
      const rate = r.rate * (0.4 + 0.6 * lock);
      node.rotation.y += dt * rate;
      node.rotation.x += dt * rate * 0.3;
    });

    if (group.current) {
      const tiltX = THREE.MathUtils.damp(group.current.rotation.x, pointer.y * 0.08, 5, dt);
      const tiltY = THREE.MathUtils.damp(group.current.rotation.y, pointer.x * 0.1, 5, dt);
      group.current.rotation.x = tiltX;
      group.current.rotation.y = tiltY;
    }
  });

  return (
    <group ref={group}>
      {RINGS.map((r, i) => (
        <group
          key={i}
          quaternion={quats[i]}
          ref={(el) => {
            if (el) ringRefs.current[i] = el;
          }}
        >
          <mesh geometry={geometries[i].body} material={obsidian} />
          <mesh geometry={geometries[i].outerEdge} material={champagne} />
          <mesh geometry={geometries[i].innerEdge} material={champagne} />
        </group>
      ))}
    </group>
  );
}
