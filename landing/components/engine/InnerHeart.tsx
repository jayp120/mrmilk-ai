'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useEngine } from '@/lib/store';
import heartVert from './shaders/heart.vert.glsl';
import heartFrag from './shaders/heart.frag.glsl';

export function InnerHeart() {
  const meshRef = useRef<THREE.Mesh>(null);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: heartVert,
        fragmentShader: heartFrag,
        uniforms: {
          uBase: { value: new THREE.Color('#F4ECE1') },
          uSSS: { value: new THREE.Color('#E8D9C4') },
          uLightDir: { value: new THREE.Vector3(0.6, 0.8, 0.4).normalize() },
          uTime: { value: 0 },
          uPhase: { value: 0 },
        },
      }),
    [],
  );

  const geometry = useMemo(() => {
    const g = new THREE.SphereGeometry(0.18, 64, 48);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      pos.setY(i, y * 0.82);
    }
    g.computeVertexNormals();
    return g;
  }, []);

  useFrame((_, dt) => {
    const phase = useEngine.getState().phase;
    material.uniforms.uTime.value += dt;
    material.uniforms.uPhase.value = phase;
    if (meshRef.current) {
      const breathe = 1 + Math.sin(material.uniforms.uTime.value * (Math.PI * 2) / 4) * 0.02;
      meshRef.current.scale.setScalar(breathe);
      meshRef.current.rotation.y += dt * 0.06;
    }
  });

  return <mesh ref={meshRef} geometry={geometry} material={material} />;
}
