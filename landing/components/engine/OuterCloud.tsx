'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useEngine } from '@/lib/store';
import { buildThreadCurve, seededRandom } from './utils';
import threadVert from './shaders/thread.vert.glsl';
import threadFrag from './shaders/thread.frag.glsl';

type Props = { count?: number; seed?: number };

export function OuterCloud({ count = 34, seed = 7 }: Props) {
  const rng = useMemo(() => seededRandom(seed), [seed]);
  const group = useRef<THREE.Group>(null);

  const curves = useMemo(() => {
    const list: THREE.CatmullRomCurve3[] = [];
    for (let i = 0; i < count; i++) list.push(buildThreadCurve(rng));
    return list;
  }, [count, rng]);

  const geometries = useMemo(
    () =>
      curves.map(
        (c) => new THREE.TubeGeometry(c, 64, 0.0065, 6, false),
      ),
    [curves],
  );

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: threadVert,
      fragmentShader: threadFrag,
      uniforms: {
        uTime: { value: 0 },
        uPhase: { value: 0 },
        uWave: { value: 0 },
        uPointer: { value: new THREE.Vector2(0, 0) },
        uPointerActive: { value: 0 },
        uPointerRadius: { value: 0.38 },
        uColor: { value: new THREE.Color('#F8EFDC') },
        uIntensity: { value: 1.0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }, []);

  useFrame((_, dt) => {
    const phase = useEngine.getState().phase;
    const pointer = useEngine.getState().pointer;
    const u = material.uniforms;
    u.uTime.value += dt;
    u.uPhase.value = phase;
    u.uWave.value = Math.max(0, Math.min(2.6, (phase - 0.22) / 0.32)) * 2.6;
    u.uPointer.value.set(pointer.x, pointer.y);
    u.uPointerActive.value = THREE.MathUtils.damp(
      u.uPointerActive.value,
      pointer.active ? 1 : 0,
      6,
      dt,
    );
    if (group.current) {
      group.current.rotation.y += dt * 0.015;
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
