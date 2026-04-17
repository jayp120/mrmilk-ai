import styles from './Footer.module.css';

export function Footer() {
  return (
    <footer className={styles.root}>
      <span className={styles.mark}>Mr Milk</span>
      <div className={styles.links}>
        <a href="#method">method</a>
        <a href="#signals">signals</a>
        <a href="#access">access</a>
      </div>
      <span className={styles.line}>
        A resolution layer for intelligent work. © 2026.
      </span>
    </footer>
  );
}
