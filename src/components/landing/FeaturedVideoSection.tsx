import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const FEATURED_VIDEO_URL =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260402_054547_9875cfc5-155a-4229-8ec8-b7ba7125cbf8.mp4";

const ease = [0.22, 1, 0.36, 1] as const;

type FeaturedVideoSectionProps = {
  onExplore: () => void;
};

export default function FeaturedVideoSection({ onExplore }: FeaturedVideoSectionProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const isInView = useInView(sectionRef, { once: true, margin: "-100px" });

  return (
    <section
      id="features"
      ref={sectionRef}
      className="overflow-hidden bg-black px-6 pb-20 pt-6 md:pb-32 md:pt-10"
    >
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={isInView ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.9, ease }}
          className="relative aspect-video overflow-hidden rounded-[2rem] md:rounded-[2.4rem]"
        >
          <video
            className="h-full w-full object-cover"
            src={FEATURED_VIDEO_URL}
            muted
            autoPlay
            loop
            playsInline
            preload="auto"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

          <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="liquid-glass max-w-md rounded-[1.6rem] p-6 md:p-8">
                <p className="text-xs uppercase tracking-[0.3em] text-white/50">Operating model</p>
                <p className="mt-3 text-sm leading-relaxed tracking-[0.03em] text-white md:text-base">
                  Mr Milk AI OS connects insights, planning, and execution so teams can move from a
                  live question to a clear next move without losing context along the way.
                </p>
              </div>

              <motion.button
                type="button"
                onClick={onExplore}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="liquid-glass self-start rounded-full px-8 py-3 text-sm tracking-[0.08em] text-white transition-colors hover:bg-white/5 md:self-auto"
              >
                Explore more
              </motion.button>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
