'use client';

import { useEffect, useState } from 'react';
import { useEngine } from '@/lib/store';
import styles from './HUD.module.css';

const pad = (n: number) => n.toString().padStart(2, '0');

const formatUTC = (d: Date) =>
  `ENGINE · ${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())}.${d
    .getUTCFullYear()
    .toString()
    .slice(2)} · ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;

export function HUD() {
  const phaseName = useEngine((s) => s.phaseName);
  const [time, setTime] = useState('ENGINE · — · — UTC');

  useEffect(() => {
    const tick = () => setTime(formatUTC(new Date()));
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className={styles.root} aria-hidden="true">
      <div className={`${styles.cell} ${styles.tr}`}>{time}</div>
      <div className={`${styles.cell} ${styles.br}`}>
        <span>state:</span>
        <span className={styles.state}>{phaseName}</span>
        <span className={styles.dot} />
      </div>
      <div className={`${styles.cell} ${styles.bl}`}>
        <span className={styles.rule} />
        <span>— open thread</span>
      </div>
    </div>
  );
}
