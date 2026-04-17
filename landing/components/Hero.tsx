'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { useEngine } from '@/lib/store';
import { HUD } from './HUD';
import { ZoneReveal } from './ZoneReveal';
import { ReducedMotionFallback } from './ReducedMotionFallback';
import styles from './Hero.module.css';

const Engine = dynamic(() => import('./engine/Engine').then((m) => m.Engine), {
  ssr: false,
});

export function Hero() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const reducedMotion = useEngine((s) => s.reducedMotion);
  const setReducedMotion = useEngine((s) => s.setReducedMotion);
  const setPointer = useEngine((s) => s.setPointer);
  const setHoverBand = useEngine((s) => s.setHoverBand);
  const setScroll = useEngine((s) => s.setScroll);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReducedMotion(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [setReducedMotion]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const max = window.innerHeight;
      const v = Math.min(1, Math.max(0, window.scrollY / max));
      setScroll(v);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [setScroll]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const rect = el.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      setPointer(nx, ny, true);
      const ry = (e.clientY - rect.top) / rect.height;
      const band: 0 | 1 | 2 = ry < 0.34 ? 0 : ry < 0.66 ? 1 : 2;
      setHoverBand(band);
    };
    const onLeave = () => {
      setPointer(0, 0, false);
      setHoverBand(null);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [setPointer, setHoverBand]);

  useEffect(() => {
    const isTouch =
      typeof window !== 'undefined' &&
      window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    if (!isTouch) return;
    const cap = 3;
    const onOrient = (e: DeviceOrientationEvent) => {
      const gx = Math.max(-cap, Math.min(cap, (e.gamma ?? 0) / 12)) / cap;
      const gy = Math.max(-cap, Math.min(cap, (e.beta ?? 0) / 24)) / cap;
      setPointer(gx, -gy, true);
    };
    window.addEventListener('deviceorientation', onOrient);
    return () => window.removeEventListener('deviceorientation', onOrient);
  }, [setPointer]);

  return (
    <section id="top" className={styles.hero} aria-label="Resolution engine">
      <div className={styles.copy}>
        <div className={styles.eyebrow}>MR MILK / AI · OS FOR WORK</div>
        <h1 className={styles.headline}>
          <span className={`${styles.line} ${styles.lineA}`}>
            From open <span className={styles.italic}>thread</span>
          </span>
          <span className={`${styles.line} ${styles.lineB}`}>
            to resolved <span className={styles.italic}>system.</span>
          </span>
        </h1>
        <p className={styles.sub}>
          Mr Milk AI reads pressure, ambiguity, and half-formed intent, then
          returns work in a state ready to execute. It does not answer
          questions. It resolves them.
        </p>
        <div className={styles.ctaRow}>
          <a href="#access" className={styles.primary}>
            Request access <span className={styles.arrow}>→</span>
          </a>
          <a href="#method" className={styles.secondary}>
            See how it resolves
          </a>
        </div>
      </div>

      <div
        className={styles.canvas}
        ref={wrapRef}
        role="img"
        aria-label="An animated sculpture of threaded arcs and nested rings, resolving from a loose cloud into a calm geometric form."
      >
        {reducedMotion ? (
          <ReducedMotionFallback />
        ) : inView ? (
          <Engine />
        ) : null}
        <ZoneReveal />
        <HUD />
      </div>
    </section>
  );
}
