'use client';

import { FormEvent, useState } from 'react';
import styles from './Manifest.module.css';

export function Manifest() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!email.includes('@')) return;
    setSent(true);
  };

  return (
    <section id="access" className={styles.root}>
      <h2 className={styles.statement}>
        From open <em>thread</em> to resolved <em>system.</em>
      </h2>
      <form className={styles.form} onSubmit={onSubmit}>
        <input
          className={styles.input}
          type="email"
          required
          placeholder="your@work.email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="Work email for early access"
        />
        <button type="submit" className={styles.submit}>
          {sent ? 'received →' : 'request access →'}
        </button>
      </form>
    </section>
  );
}
