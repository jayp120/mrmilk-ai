import React from "react";
import {
  motion,
  useMotionTemplate,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";

import { GoogleGeminiEffect } from "@/components/ui/google-gemini-effect";

type MrMilkAiOsStorySectionProps = {
  shellRef?: React.RefObject<HTMLElement>;
};

export function MrMilkAiOsStorySection({ shellRef }: MrMilkAiOsStorySectionProps) {
  const sectionRef = React.useRef<HTMLDivElement | null>(null);
  const reducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  const pathLengthFirst = useTransform(scrollYProgress, [0, 0.82], [0.2, 1.16]);
  const pathLengthSecond = useTransform(scrollYProgress, [0, 0.82], [0.16, 1.16]);
  const pathLengthThird = useTransform(scrollYProgress, [0, 0.82], [0.12, 1.16]);
  const pathLengthFourth = useTransform(scrollYProgress, [0, 0.82], [0.08, 1.16]);
  const pathLengthFifth = useTransform(scrollYProgress, [0, 0.82], [0.02, 1.16]);

  const startOpacity = useTransform(scrollYProgress, [0, 0.24, 0.58], [0.92, 0.92, 0.22]);
  const startX = useTransform(scrollYProgress, [0, 0.54], [0, -34]);

  const resolvedOpacity = useTransform(scrollYProgress, [0.26, 0.62, 1], [0.12, 1, 1]);
  const resolvedX = useTransform(scrollYProgress, [0.24, 0.62], [38, 0]);
  const resolvedY = useTransform(scrollYProgress, [0.24, 0.62], [18, 0]);

  const completionOpacity = useTransform(scrollYProgress, [0.54, 0.9], [0, 1]);
  const completionGlow = useTransform(scrollYProgress, [0.5, 0.92], [0, 0.22]);
  const completionIvory = useTransform(scrollYProgress, [0.56, 0.94], [0, 0.12]);
  const continuationOpacity = useTransform(scrollYProgress, [0.72, 0.94], [0, 1]);
  const continuationY = useTransform(scrollYProgress, [0.72, 0.94], [18, 0]);

  React.useEffect(() => {
    const unsubscribe = scrollYProgress.on("change", (latest) => {
      const completion = Math.max(0, Math.min(1, (latest - 0.5) / 0.36));

      if (shellRef?.current) {
        shellRef.current.style.setProperty("--page-completion", completion.toFixed(3));
      }
    });

    return unsubscribe;
  }, [scrollYProgress, shellRef]);

  const themeShift = useMotionTemplate`
    radial-gradient(circle at 76% 42%, rgba(193, 171, 121, ${completionGlow}), transparent 18%),
    radial-gradient(circle at 52% 90%, rgba(245, 236, 216, ${completionIvory}), transparent 22%),
    radial-gradient(circle at 18% 32%, rgba(61, 108, 189, 0.1), transparent 24%)
  `;

  return (
    <section id="story" ref={sectionRef} className="relative h-[230vh] md:h-[280vh]">
      <div className="sticky top-[73px] flex h-[calc(100svh-73px)] items-center overflow-clip">
        <motion.div className="absolute inset-0" style={{ background: themeShift }} />

        <div className="mx-auto w-full max-w-[1320px] px-4 sm:px-6 lg:px-8">
          <GoogleGeminiEffect
            pathLengths={[
              pathLengthFirst,
              pathLengthSecond,
              pathLengthThird,
              pathLengthFourth,
              pathLengthFifth,
            ]}
            title="What begins as intent leaves as execution."
            className="min-h-full"
          >
            <div className="relative z-20 h-full">
              <div className="absolute inset-x-0 bottom-14 mx-auto max-w-[1400px] px-4 sm:px-6 md:bottom-16 lg:px-8">
                <div className="grid grid-cols-1 gap-10 md:grid-cols-[20rem_minmax(0,1fr)_20rem] md:items-end md:gap-16 lg:grid-cols-[22rem_minmax(0,1fr)_22rem]">
                  <motion.div
                    style={reducedMotion ? undefined : { opacity: startOpacity, x: startX }}
                    className="relative isolate justify-self-start"
                  >
                    <div className="absolute -inset-x-8 -inset-y-8 -z-10 rounded-[2.5rem] bg-[radial-gradient(circle_at_center,rgba(7,9,13,0.94),rgba(7,9,13,0.78)_58%,transparent_100%)] blur-2xl" />
                    <div className="h-px w-20 bg-gradient-to-r from-[#d8c18a] via-[#ebe2cb]/55 to-transparent" />
                    <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.34em] text-[#c6b07c]">
                      Origin thread
                    </p>
                    <div className="mt-4 flex items-center gap-4">
                      <h3 className="font-accent text-[clamp(1.7rem,1.85vw,2.15rem)] leading-none tracking-[-0.05em] text-white md:whitespace-nowrap">
                        Milk Master
                      </h3>
                      <span className="inline-flex rounded-full border border-white/14 px-3 py-1 text-[10px] uppercase tracking-[0.28em] text-white/52">
                        live
                      </span>
                    </div>
                  </motion.div>

                  <motion.div
                    style={reducedMotion ? undefined : { opacity: completionOpacity, scale: 1 }}
                    className="pointer-events-none absolute right-[-4%] top-[34%] hidden h-[24rem] w-[24rem] rounded-full bg-[radial-gradient(circle,rgba(193,171,121,0.16),transparent_62%)] blur-[105px] md:block"
                  />

                  <div className="hidden md:block" />

                  <motion.div
                    style={
                      reducedMotion
                        ? undefined
                        : { opacity: resolvedOpacity, x: resolvedX, y: resolvedY }
                    }
                    className="relative isolate justify-self-end text-left md:text-right"
                  >
                    <div className="absolute -inset-x-8 -inset-y-8 -z-10 rounded-[2.5rem] bg-[radial-gradient(circle_at_center,rgba(7,9,13,0.94),rgba(7,9,13,0.78)_58%,transparent_100%)] blur-2xl" />
                    <div className="ml-auto h-px w-20 bg-gradient-to-l from-[#f0dfb1] via-[#f4ebd4]/55 to-transparent" />
                    <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.34em] text-[#dcc791]">
                      Resolved state
                    </p>
                    <div className="mt-4 flex items-center gap-4 md:justify-end">
                      <h3 className="font-accent text-[clamp(1.7rem,1.8vw,2.15rem)] leading-none tracking-[-0.05em] text-white md:whitespace-nowrap">
                        Mr. Milk AI OS
                      </h3>
                      <span className="inline-flex rounded-full border border-[#c1ab79]/18 px-3 py-1 text-[10px] uppercase tracking-[0.28em] text-[#ddd0aa]">
                        resolved
                      </span>
                    </div>
                  </motion.div>
                </div>
              </div>

              <motion.div
                style={
                  reducedMotion
                    ? undefined
                    : { opacity: continuationOpacity, y: continuationY }
                }
                className="pointer-events-none absolute inset-x-0 bottom-[6%] flex justify-center"
              >
                <div className="flex flex-col items-center">
                  <div className="h-px w-24 bg-gradient-to-r from-transparent via-[#e7d7ab] to-transparent" />
                  <p className="mt-4 text-[11px] uppercase tracking-[0.34em] text-white/36">
                    Continue below
                  </p>
                </div>
              </motion.div>
            </div>
          </GoogleGeminiEffect>
        </div>
      </div>
    </section>
  );
}
