'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useEngine } from '@/lib/store';
import { OuterCloud } from './OuterCloud';
import { IntermediateLattice } from './IntermediateLattice';
import { GyroscopicRings } from './GyroscopicRings';
import { InnerHeart } from './InnerHeart';
import { Pulses } from './Pulses';
import { Particulate } from './Particulate';

const PARALLAX = [1.0, 0.88, 0.76, 0.64];

export function Sculpture() {
  const root = useRef<THREE.Group>(null);
  const layerCloud = useRef<THREE.Group>(null);
  const layerLattice = useRef<THREE.Group>(null);
  const layerRings = useRef<THREE.Group>(null);
  const layerHeart = useRef<THREE.Group>(null);

  useFrame((_, dt) => {
    const pointer = useEngine.getState().pointer;
    const active = pointer.active ? 1 : 0;
    if (root.current) {
      const tiltX = -pointer.y * 0.087 * active;
      const tiltY = pointer.x * 0.109 * active;
      root.current.rotation.x = THREE.MathUtils.damp(root.current.rotation.x, tiltX, 5.5, dt);
      root.current.rotation.y = THREE.MathUtils.damp(root.current.rotation.y, tiltY, 5.5, dt);
    }
    const layers = [
      layerCloud.current,
      layerLattice.current,
      layerRings.current,
      layerHeart.current,
    ];
    layers.forEach((g, i) => {
      if (!g) return;
      const p = PARALLAX[i];
      const offX = pointer.x * 0.04 * (1 - p) * active;
      const offY = pointer.y * 0.04 * (1 - p) * active;
      g.position.x = THREE.MathUtils.damp(g.position.x, offX, 4, dt);
      g.position.y = THREE.MathUtils.damp(g.position.y, offY, 4, dt);
    });
  });

  return (
    <group ref={root}>
      <group ref={layerCloud}>
        <OuterCloud count={34} seed={7} />
        <Particulate count={600} seed={11} />
      </group>
      <group ref={layerLattice}>
        <IntermediateLattice />
      </group>
      <group ref={layerRings}>
        <GyroscopicRings />
        <Pulses />
      </group>
      <group ref={layerHeart}>
        <InnerHeart />
      </group>
    </group>
  );
}
