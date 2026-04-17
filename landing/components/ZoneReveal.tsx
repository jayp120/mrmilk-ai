'use client';

import { useEffect, useState } from 'react';
import { useEngine } from '@/lib/store';
import styles from './ZoneReveal.module.css';

const WORDS: Record<0 | 1 | 2, string> = {
  0: 'Interpretation',
  1: 'Arrangement',
  2: 'Completion',
};

export function ZoneReveal() {
  const hoverBand = useEngine((s) => s.hoverBand);
  const [active, setActive] = useState<0 | 1 | 2 | null>(null);

  useEffect(() => {
    if (hoverBand === null) {
      setActive(null);
      return;
    }
    const id = window.setTimeout(() => setActive(hoverBand), 400);
    return () => window.clearTimeout(id);
  }, [hoverBand]);

  return (
    <div className={styles.root} aria-hidden="true">
      <span
        className={`${styles.word} ${styles.bandTop} ${
          active === 0 ? styles.wordActive : ''
        }`}
      >
        {WORDS[0]}
      </span>
      <span
        className={`${styles.word} ${styles.bandMid} ${
          active === 1 ? styles.wordActive : ''
        }`}
      >
        {WORDS[1]}
      </span>
      <span
        className={`${styles.word} ${styles.bandBot} ${
          active === 2 ? styles.wordActive : ''
        }`}
      >
        {WORDS[2]}
      </span>
      <div className="sr-only" aria-live="polite">
        {active !== null ? WORDS[active] : ''}
      </div>
    </div>
  );
}
