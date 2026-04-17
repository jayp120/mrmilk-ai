import styles from './Replaces.module.css';

export function Replaces() {
  return (
    <section id="replaces" className={styles.root}>
      <h2 className={styles.title}>
        What it <em>replaces.</em>
      </h2>
      <div className={styles.prose}>
        <p>
          The project planning meeting where nothing is decided. The weekly
          status chain nobody reads. The Slack message that starts with
          &ldquo;quick one&rdquo; and ends a week later. The hand-off where
          context evaporates between two well-intentioned people.
        </p>
        <p>
          Mr Milk does not add another surface to check. It removes the
          surfaces you were already ignoring.
        </p>
      </div>
      <p className={styles.quote}>
        &ldquo;Let me circle back&rdquo; is a system failure.
      </p>
    </section>
  );
}
