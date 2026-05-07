import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const PHILOSOPHY_VIDEO_URL =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260307_083826_e938b29f-a43a-41ec-a153-3d4730578ab8.mp4";

const ease = [0.22, 1, 0.36, 1] as const;

export default function PhilosophySection() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const isInView = useInView(sectionRef, { once: true, margin: "-100px" });

  return (
    <section
      id="philosophy"
      ref={sectionRef}
      className="overflow-hidden bg-black px-6 py-28 md:py-40"
    >
      <div className="mx-auto max-w-6xl">
        <motion.h2
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.8, ease }}
          className="font-instrument mb-16 text-5xl tracking-tight text-white md:mb-24 md:text-7xl lg:text-8xl"
        >
          Intelligence <span className="italic text-white/40">x</span> Vision
        </motion.h2>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-12">
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={isInView ? { opacity: 1, x: 0 } : undefined}
            transition={{ duration: 0.8, delay: 0.1, ease }}
            className="overflow-hidden rounded-[2rem]"
          >
            <div className="aspect-[4/3] overflow-hidden rounded-[2rem]">
              <video
                className="h-full w-full object-cover"
                src={PHILOSOPHY_VIDEO_URL}
                muted
                autoPlay
                loop
                playsInline
                preload="auto"
              />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={isInView ? { opacity: 1, x: 0 } : undefined}
            transition={{ duration: 0.8, delay: 0.15, ease }}
            className="flex flex-col justify-center"
          >
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/40">Choose your command layer</p>
              <p className="mt-4 text-base leading-relaxed tracking-[0.03em] text-white/70 md:text-lg">
                Every high-stakes decision gets better when data, intent, and execution share one
                operating layer. Mr Milk AI OS brings them together so your team can move without
                guessing what matters next.
              </p>
            </div>

            <div className="my-8 h-px w-full bg-white/10 md:my-10" />

            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/40">Shape the next move</p>
              <p className="mt-4 text-base leading-relaxed tracking-[0.03em] text-white/70 md:text-lg">
                The system is built for operators who need clarity before speed. It helps teams
                uncover hidden opportunities, align decisions, and translate strategy into work that
                lands cleanly in the real world.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
