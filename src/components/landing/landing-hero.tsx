import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";

const HERO_VIDEO_SOURCE =
  "https://stream.mux.com/s8pMcOvMQXc4GD6AX4e1o01xFogFxipmuKltNfSYza0200.m3u8";

type LandingHeroProps = {
  onLearnMore: () => void;
};

type BlurInProps = {
  children: React.ReactNode;
  className?: string;
  delay?: number;
};

type SplitTextProps = {
  text: string;
  className?: string;
  startIndex?: number;
};

function BlurIn({ children, className, delay = 0 }: BlurInProps) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, filter: "blur(10px)", y: 20 }}
      animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function SplitText({ text, className, startIndex = 0 }: SplitTextProps) {
  const reducedMotion = useReducedMotion();
  const words = React.useMemo(() => text.split(" "), [text]);

  if (reducedMotion) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={className}>
      {words.map((word, index) => (
        <span
          key={`${word}-${index}`}
          className="inline-flex overflow-hidden pr-[0.28em] align-baseline last:pr-0"
        >
          <motion.span
            className="inline-block"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.6,
              delay: (startIndex + index) * 0.08,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            {word}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

function useHeroVideo(videoRef: React.RefObject<HTMLVideoElement>) {
  React.useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return undefined;
    }

    let isActive = true;
    let cleanup = () => {};

    const play = async () => {
      try {
        await video.play();
      } catch {
        // Autoplay can be blocked in some environments even when muted.
      }
    };

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = HERO_VIDEO_SOURCE;
      void play();
      return undefined;
    }

    void import("hls.js")
      .then(({ default: Hls }) => {
        if (!isActive || !video) {
          return;
        }

        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
          });

          hls.loadSource(HERO_VIDEO_SOURCE);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            void play();
          });

          cleanup = () => {
            hls.destroy();
          };
          return;
        }

        video.src = HERO_VIDEO_SOURCE;
        void play();
      })
      .catch(() => {
        if (!isActive || !video) {
          return;
        }

        video.src = HERO_VIDEO_SOURCE;
        void play();
      });

    return () => {
      isActive = false;
      cleanup();
    };
  }, [videoRef]);
}

export function LandingHero({ onLearnMore }: LandingHeroProps) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  useHeroVideo(videoRef);

  return (
    <section
      id="story"
      className="relative z-10 h-screen min-h-[100svh] w-full overflow-hidden bg-[#070612]"
    >
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
          className="ml-[200px] h-full w-full origin-left scale-[1.2] object-cover"
        />
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 h-40 bg-gradient-to-t from-[#070612] to-transparent" />

      <div className="relative z-20 mx-auto flex h-full max-w-7xl items-center px-6 lg:px-12">
        <div className="max-w-3xl">
          <div className="flex flex-col gap-12">
            <div className="flex flex-col gap-6">
              <BlurIn>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 backdrop-blur-sm">
                  <Sparkles className="h-3 w-3 text-white/80" aria-hidden="true" />
                  <span className="text-sm font-medium text-white/80">New AI Automation Ally</span>
                </div>
              </BlurIn>

              <div className="flex flex-col gap-6">
                <h1 className="text-4xl font-medium leading-tight text-white md:text-5xl lg:text-6xl lg:leading-[1.2]">
                  <span className="sr-only">Unlock the Power of AI for Your Business.</span>
                  <span aria-hidden="true" className="block">
                    <SplitText text="Unlock the Power of AI" />
                  </span>
                  <span aria-hidden="true" className="block">
                    <SplitText text="for Your" className="inline" startIndex={5} />
                    <SplitText
                      text="Business."
                      className="ml-3 inline font-display italic"
                      startIndex={7}
                    />
                  </span>
                </h1>

                <BlurIn delay={0.4}>
                  <p className="max-w-xl text-lg font-normal leading-relaxed text-white/80">
                    Our cutting-edge AI platform automates, analyzes, and accelerates your
                    workflows so you can focus on what really matters.
                  </p>
                </BlurIn>
              </div>
            </div>

            <BlurIn delay={0.6}>
              <div className="flex flex-wrap items-center gap-4">
                <a
                  href="/book-call"
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-medium text-[#070612] transition hover:bg-white/92"
                >
                  <span>Book A Free Call</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </a>

                <button
                  type="button"
                  onClick={onLearnMore}
                  className="inline-flex min-h-11 items-center rounded-full bg-white/20 px-8 py-3 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/25"
                >
                  Learn now
                </button>
              </div>
            </BlurIn>
          </div>
        </div>
      </div>
    </section>
  );
}
