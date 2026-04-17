'use client';

import { create } from 'zustand';

export type PhaseName = 'thread' | 'interpreting' | 'arranging' | 'resolved';

export type EngineState = {
  phase: number;
  phaseName: PhaseName;
  pointer: { x: number; y: number; active: boolean };
  scroll: number;
  hoverBand: 0 | 1 | 2 | null;
  bandDwellMs: number;
  reducedMotion: boolean;
  setPhase: (t: number) => void;
  setPointer: (x: number, y: number, active: boolean) => void;
  setScroll: (v: number) => void;
  setHoverBand: (b: 0 | 1 | 2 | null) => void;
  setBandDwell: (ms: number) => void;
  setReducedMotion: (b: boolean) => void;
};

export const phaseNameFor = (t: number): PhaseName => {
  if (t < 0.25) return 'thread';
  if (t < 0.5) return 'interpreting';
  if (t < 0.77) return 'arranging';
  return 'resolved';
};

export const useEngine = create<EngineState>((set) => ({
  phase: 0,
  phaseName: 'thread',
  pointer: { x: 0, y: 0, active: false },
  scroll: 0,
  hoverBand: null,
  bandDwellMs: 0,
  reducedMotion: false,
  setPhase: (t) => set({ phase: t, phaseName: phaseNameFor(t) }),
  setPointer: (x, y, active) => set({ pointer: { x, y, active } }),
  setScroll: (v) => set({ scroll: v }),
  setHoverBand: (b) => set({ hoverBand: b, bandDwellMs: 0 }),
  setBandDwell: (ms) => set({ bandDwellMs: ms }),
  setReducedMotion: (b) => set({ reducedMotion: b }),
}));
