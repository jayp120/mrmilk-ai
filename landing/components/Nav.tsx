import styles from './Nav.module.css';

export function Nav() {
  return (
    <nav className={styles.nav} aria-label="Primary">
      <a href="#top" className={styles.wordmark} aria-label="Mr Milk home">
        Mr Mil<span className={styles.k}>k</span>
      </a>
      <div className={styles.links}>
        <a href="#method">Method</a>
        <a href="#signals">Signals</a>
        <a href="#pricing">Pricing</a>
        <a href="#login">Log in</a>
      </div>
    </nav>
  );
}
