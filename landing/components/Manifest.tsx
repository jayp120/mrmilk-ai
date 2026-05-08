'use client';

import { FormEvent, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import styles from './Manifest.module.css';

type Status = 'idle' | 'sending' | 'sent' | 'duplicate' | 'error';

const STATUS_LABEL: Record<Status, string> = {
  idle: 'request access →',
  sending: 'sending…',
  sent: 'received →',
  duplicate: 'already on the list →',
  error: 'try again →',
};

export function Manifest() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.includes('@') || status === 'sending') return;
    setStatus('sending');

    const sb = getSupabase();
    if (!sb) {
      setStatus('sent');
      return;
    }

    const { error } = await sb
      .from('waitlist')
      .insert({ email: email.trim().toLowerCase() });

    if (!error) {
      setStatus('sent');
      return;
    }
    if (error.code === '23505') {
      setStatus('duplicate');
      return;
    }
    setStatus('error');
  };

  const locked = status === 'sent' || status === 'duplicate';

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
          disabled={locked}
          aria-label="Work email for early access"
        />
        <button
          type="submit"
          className={styles.submit}
          disabled={status === 'sending' || locked}
        >
          {STATUS_LABEL[status]}
        </button>
      </form>
    </section>
  );
}
