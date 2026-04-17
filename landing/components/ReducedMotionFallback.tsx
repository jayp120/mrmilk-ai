import styles from './ReducedMotionFallback.module.css';

export function ReducedMotionFallback() {
  return (
    <div className={styles.root} aria-hidden="true">
      <div className={styles.stage}>
        <span className={`${styles.ring} ${styles.r1}`} />
        <span className={`${styles.ring} ${styles.r2}`} />
        <span className={`${styles.ring} ${styles.r3}`} />
        <span className={styles.heart} />
      </div>
    </div>
  );
}
