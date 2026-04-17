import styles from './Signals.module.css';

const SIGNALS = [
  {
    mark: '— 001',
    body:
      '“The morning stand-up disappeared. Nothing was missed. The resolution layer handled the triage we used to spend forty minutes on.”',
    attribution: 'A head of operations at a 400-person SaaS company.',
  },
  {
    mark: '— 002',
    body:
      '“It reads the context I forgot to give it. The plan it returns is one I would have written if I had another hour and a sharper head.”',
    attribution: 'A founder, Series A, building in regulated infrastructure.',
  },
  {
    mark: '— 003',
    body:
      '“We stopped asking whether the work was done. The system told us what was resolved and what was still open, and it was always right.”',
    attribution: 'A VP of product at a public consumer marketplace.',
  },
];

export function Signals() {
  return (
    <section id="signals" className={styles.root}>
      <h2 className={styles.title}>
        Signals from the <em>field.</em>
      </h2>
      <div className={styles.grid}>
        {SIGNALS.map((s) => (
          <article key={s.mark} className={styles.item}>
            <span className={styles.mark}>{s.mark}</span>
            <p className={styles.body}>{s.body}</p>
            <p className={styles.attribution}>{s.attribution}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
