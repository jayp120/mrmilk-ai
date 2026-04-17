import * as THREE from 'three';

export const LOOP = 22;

export const phaseFromElapsed = (secs: number) => {
  const t = ((secs % LOOP) + LOOP) % LOOP;
  return t / LOOP;
};

export const waveRadiusFromPhase = (t: number) => {
  const s = Math.max(0, Math.min(1, (t - 0.22) / 0.32));
  return s * 2.6;
};

export const seededRandom = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
};

export const buildThreadCurve = (rng: () => number, resolved = false) => {
  const points: THREE.Vector3[] = [];
  const segs = 6 + Math.floor(rng() * 3);
  const baseTheta = rng() * Math.PI * 2;
  const basePhi = (rng() - 0.5) * Math.PI;
  const radius = 0.9 + rng() * 0.8;

  for (let i = 0; i < segs; i++) {
    const u = i / (segs - 1);
    const theta = baseTheta + u * (Math.PI * (0.7 + rng() * 0.6));
    const phi = basePhi + (rng() - 0.5) * 0.4;
    const r = resolved
      ? radius
      : radius + Math.sin(u * Math.PI) * (0.4 + rng() * 0.4);
    const jitter = resolved ? 0 : (rng() - 0.5) * 0.25;
    const x = Math.cos(theta) * Math.cos(phi) * r + jitter;
    const y = Math.sin(phi) * r + (rng() - 0.5) * (resolved ? 0.02 : 0.3);
    const z = Math.sin(theta) * Math.cos(phi) * r + jitter * 0.8;
    points.push(new THREE.Vector3(x, y, z));
  }
  return new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
};
