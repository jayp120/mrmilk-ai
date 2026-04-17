import styles from './Method.module.css';

const ROWS = [
  {
    n: '01',
    body: (
      <>
        <em>Interpretation.</em> Mr Milk reads ambiguity the way a strategist
        reads a room — tone, pressure, and the thing left unsaid.
      </>
    ),
  },
  {
    n: '02',
    body: (
      <>
        <em>Arrangement.</em> It composes the work — owners, sequence,
        dependencies — into a shape the team can execute without another
        meeting.
      </>
    ),
  },
  {
    n: '03',
    body: (
      <>
        <em>Completion.</em> Outputs arrive resolved: decisions made, artifacts
        drafted, follow-ups surfaced before you remember to ask.
      </>
    ),
  },
];

export function Method() {
  return (
    <section id="method" className={styles.root}>
      <h2 className={styles.title}>
        A method, not a model.
      </h2>
      <div className={styles.rows}>
        {ROWS.map((r) => (
          <div key={r.n} className={styles.row}>
            <div className={styles.numeral}>{r.n}</div>
            <p className={styles.body}>{r.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
