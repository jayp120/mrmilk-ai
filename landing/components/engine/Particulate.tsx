'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { seededRandom } from './utils';

type Props = { count?: number; seed?: number };

export function Particulate({ count = 600, seed = 11 }: Props) {
  const ref = useRef<THREE.Points>(null);

  const { geometry, material } = useMemo(() => {
    const rng = seededRandom(seed);
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const speeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = (rng() - 0.5) * 3.2;
      positions[i * 3 + 1] = (rng() - 0.5) * 2.2;
      positions[i * 3 + 2] = (rng() - 0.5) * 3.0;
      sizes[i] = 0.6 + rng() * 1.2;
      speeds[i] = 0.03 + rng() * 0.06;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    g.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));

    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uDpr: { value: 1 },
        uColor: { value: new THREE.Color('#F4ECE1') },
      },
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aSpeed;
        uniform float uTime;
        uniform float uDpr;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          p.y = mod(p.y + 1.1 + uTime * aSpeed, 2.2) - 1.1;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uDpr * (300.0 / -mv.z);
          vAlpha = 0.12 + 0.28 * (aSize - 0.6);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float falloff = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(uColor, vAlpha * falloff * 0.6);
        }
      `,
    });

    return { geometry: g, material: m };
  }, [count, seed]);

  useFrame((_, dt) => {
    material.uniforms.uTime.value += dt;
  });

  return <points ref={ref} geometry={geometry} material={material} />;
}
