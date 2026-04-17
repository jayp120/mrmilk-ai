'use client';

import { Canvas } from '@react-three/fiber';
import { AdaptiveDpr, AdaptiveEvents } from '@react-three/drei';
import { Suspense, useEffect, useState } from 'react';
import * as THREE from 'three';
import { Sculpture } from './Sculpture';
import { PhaseDriver } from './PhaseDriver';
import { Post } from './Post';

function Lighting() {
  return (
    <>
      <ambientLight intensity={0.12} color="#1C1230" />
      <directionalLight
        position={[2.4, 2.8, 1.8]}
        intensity={1.6}
        color="#F4ECE1"
      />
      <directionalLight
        position={[-2.8, 1.0, -2.0]}
        intensity={0.28}
        color="#3A2A58"
      />
      <directionalLight
        position={[-0.4, -1.8, -1.2]}
        intensity={0.42}
        color="#C9B185"
      />
    </>
  );
}

export function Engine() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <Canvas
      dpr={[1, 1.75]}
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.1,
      }}
      camera={{ position: [0, 0, 3.6], fov: 32, near: 0.1, far: 30 }}
      style={{ background: 'transparent' }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
      }}
    >
      <AdaptiveDpr pixelated={false} />
      <AdaptiveEvents />
      <fog attach="fog" args={['#05040A', 3.2, 7.2]} />
      <Lighting />
      <Suspense fallback={null}>
        <Sculpture />
      </Suspense>
      <PhaseDriver />
      <Post />
    </Canvas>
  );
}
