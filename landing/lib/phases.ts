export const LOOP_SECONDS = 22;

export const PHASE_BOUNDS = {
  thread: [0, 5.5] as const,
  interpreting: [5.5, 11] as const,
  arranging: [11, 17] as const,
  resolved: [17, 22] as const,
};

export const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

export const phaseProgress = (secs: number) => {
  const t = ((secs % LOOP_SECONDS) + LOOP_SECONDS) % LOOP_SECONDS;
  return t / LOOP_SECONDS;
};

export const cubicBezier =
  (p1x: number, p1y: number, p2x: number, p2y: number) => {
    return (x: number) => {
      const cx = 3 * p1x;
      const bx = 3 * (p2x - p1x) - cx;
      const ax = 1 - cx - bx;
      const cy = 3 * p1y;
      const by = 3 * (p2y - p1y) - cy;
      const ay = 1 - cy - by;
      let t = x;
      for (let i = 0; i < 6; i++) {
        const sx = ((ax * t + bx) * t + cx) * t - x;
        const dx = (3 * ax * t + 2 * bx) * t + cx;
        if (Math.abs(dx) < 1e-6) break;
        t -= sx / dx;
      }
      return ((ay * t + by) * t + cy) * t;
    };
  };

export const easeSoft = cubicBezier(0.22, 1, 0.36, 1);
export const easeWeight = cubicBezier(0.7, 0, 0.3, 1);
