'use client';

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { useEngine } from '@/lib/store';
import { easeSoft, LOOP_SECONDS } from '@/lib/phases';

export function PhaseDriver() {
  const clock = useRef(0);
  useFrame((_, dt) => {
    const scroll = useEngine.getState().scroll;
    const scrollAssist = easeSoft(scroll) * 0.28;
    clock.current += dt * (1 + scrollAssist);
    const t = ((clock.current % LOOP_SECONDS) + LOOP_SECONDS) % LOOP_SECONDS;
    useEngine.getState().setPhase(t / LOOP_SECONDS);
  });
  return null;
}
