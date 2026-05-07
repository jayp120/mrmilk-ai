import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const ease = [0.22, 1, 0.36, 1] as const;

export default function AboutSection() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const isInView = useInView(sectionRef, { once: true, margin: "-100px" });

  return (
    <section
      id="about"
      ref={sectionRef}
      className="relative overflow-hidden bg-black px-6 pb-10 pt-32 md:pb-14 md:pt-44"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(255,255,255,0.03)_0%,_transparent_70%)]" />

      <div className="relative mx-auto max-w-6xl">
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.6, ease }}
          className="text-sm uppercase tracking-[0.3em] text-white/40"
        >
          About Us
        </motion.p>

        <motion.h2
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.8, delay: 0.1, ease }}
          className="font-instrument mt-6 max-w-5xl text-4xl leading-[1.1] tracking-tight text-white md:text-6xl lg:text-7xl"
        >
          Pioneering <span className="italic text-white/60">operating intelligence</span> for
          <br className="hidden md:block" />{" "}
          <span className="italic text-white/60">teams that forecast, execute, and grow.</span>
        </motion.h2>
      </div>
    </section>
  );
}
