import { useEffect, useRef } from "react";

import logo from "@/assets/logo.png";

type LandingPageProps = {
  onOpenWorkspace: () => void;
};

const HERO_VIDEO_URL =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_065045_c44942da-53c6-4804-b734-f9e07fc22e08.mp4";

const marqueeLogos = [
  { label: "Milk Master", mark: "M" },
  { label: "Segment Engine", mark: "S" },
  { label: "Campaign Studio", mark: "C" },
  { label: "Field Command", mark: "F" },
  { label: "Growth Desk", mark: "G" },
  { label: "Insight Graph", mark: "I" },
] as const;

function readOpacity(video: HTMLVideoElement) {
  const numericOpacity = Number.parseFloat(video.style.opacity);
  return Number.isNaN(numericOpacity) ? 0 : numericOpacity;
}

export default function LandingPage({ onOpenWorkspace }: LandingPageProps) {
  const heroVideoRef = useRef<HTMLVideoElement | null>(null);
  const fadeFrameRef = useRef<number | null>(null);
  const restartTimeoutRef = useRef<number | null>(null);
  const isFadingOutRef = useRef(false);

  useEffect(() => {
    return () => {
      if (fadeFrameRef.current) {
        window.cancelAnimationFrame(fadeFrameRef.current);
      }

      if (restartTimeoutRef.current) {
        window.clearTimeout(restartTimeoutRef.current);
      }
    };
  }, []);

  const animateVideoOpacity = (from: number, to: number, duration = 500) => {
    const video = heroVideoRef.current;

    if (!video) {
      return;
    }

    if (fadeFrameRef.current) {
      window.cancelAnimationFrame(fadeFrameRef.current);
    }

    const start = performance.now();

    const updateOpacity = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      video.style.opacity = String(from + (to - from) * progress);

      if (progress < 1) {
        fadeFrameRef.current = window.requestAnimationFrame(updateOpacity);
        return;
      }

      fadeFrameRef.current = null;
    };

    fadeFrameRef.current = window.requestAnimationFrame(updateOpacity);
  };

  const handleVideoCanPlay = () => {
    const video = heroVideoRef.current;

    if (!video) {
      return;
    }

    isFadingOutRef.current = false;
    video.play().catch(() => undefined);
    animateVideoOpacity(0, 1, 500);
  };

  const handleVideoTimeUpdate = () => {
    const video = heroVideoRef.current;

    if (!video || isFadingOutRef.current || !Number.isFinite(video.duration)) {
      return;
    }

    const remainingTime = video.duration - video.currentTime;

    if (remainingTime <= 0.55) {
      isFadingOutRef.current = true;
      animateVideoOpacity(readOpacity(video), 0, 500);
    }
  };

  const handleVideoEnded = () => {
    const video = heroVideoRef.current;

    if (!video) {
      return;
    }

    if (fadeFrameRef.current) {
      window.cancelAnimationFrame(fadeFrameRef.current);
      fadeFrameRef.current = null;
    }

    video.style.opacity = "0";
    isFadingOutRef.current = false;

    if (restartTimeoutRef.current) {
      window.clearTimeout(restartTimeoutRef.current);
    }

    restartTimeoutRef.current = window.setTimeout(() => {
      const currentVideo = heroVideoRef.current;

      if (!currentVideo) {
        return;
      }

      currentVideo.currentTime = 0;
      currentVideo.play().catch(() => undefined);
      animateVideoOpacity(0, 1, 500);
    }, 100);
  };

  const marqueeItems = [...marqueeLogos, ...marqueeLogos];

  return (
    <main className="min-h-screen overflow-hidden bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <section className="relative flex min-h-screen flex-col overflow-visible">
        <div className="absolute inset-0 overflow-hidden">
          <video
            ref={heroVideoRef}
            className="absolute inset-0 h-full w-full object-cover"
            src={HERO_VIDEO_URL}
            muted
            autoPlay
            playsInline
            preload="auto"
            style={{ opacity: 0 }}
            onCanPlay={handleVideoCanPlay}
            onTimeUpdate={handleVideoTimeUpdate}
            onEnded={handleVideoEnded}
          />
        </div>

        <div className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-[527px] w-[984px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gray-950 opacity-90 blur-[82px]" />

        <div className="relative z-10 flex min-h-screen flex-col">
          <header className="w-full px-5 py-5 sm:px-8">
            <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-6">
              <a href="/" aria-label="Mr. Milk AI OS" className="shrink-0">
                <img src={logo} alt="Mr. Milk AI OS" className="h-8 w-auto object-contain" />
              </a>

              <button
                type="button"
                onClick={onOpenWorkspace}
                className="hero-secondary shrink-0 px-4 py-2 text-sm font-medium"
              >
                Open OS
              </button>
            </div>
          </header>

          <div className="flex flex-1 items-center justify-center px-5 py-16 sm:px-8">
            <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col items-center text-center">
              <div className="hero-chip mb-8 text-[11px] font-medium uppercase tracking-[0.34em] sm:mb-10">
                Dairy intelligence operating layer
              </div>

              <h1
                className="font-general text-[72px] font-normal leading-[1.02] text-[hsl(var(--foreground))] sm:text-[110px] lg:text-[160px] xl:text-[220px]"
                style={{ letterSpacing: "-0.024em" }}
              >
                <span>Mr. Milk </span>
                <span
                  className="bg-clip-text text-transparent"
                  style={{ backgroundImage: "linear-gradient(to left, #6366f1, #a855f7, #fcd34d)" }}
                >
                  AI
                </span>
              </h1>

              <p className="mt-[9px] max-w-xl text-balance text-lg leading-8 text-[hsl(var(--hero-sub))] opacity-80">
                The premium operating layer for customer intelligence, campaign orchestration,
                operator clarity, and growth decisions across the Mr. Milk system.
              </p>

              <button
                type="button"
                onClick={onOpenWorkspace}
                className="hero-secondary mt-[25px] px-[29px] py-[24px] text-base font-medium"
              >
                Enter Mr. Milk AI OS
              </button>

              <p className="mt-5 text-[11px] uppercase tracking-[0.28em] text-[hsl(var(--hero-line))]">
                Built around MilkMaster imports, live segments, and execution workflows
              </p>
            </div>
          </div>

          <div className="px-5 pb-10 sm:px-8">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
              <p className="text-sm text-[hsl(var(--foreground))]/50">
                Trusted across the Mr. Milk operating stack.
              </p>

              <div className="hero-marquee-shell relative flex-1 overflow-hidden">
                <div className="hero-marquee-track flex items-center gap-16 whitespace-nowrap pr-16">
                  {marqueeItems.map((item, index) => (
                    <div key={`${item.label}-${index}`} className="hero-marquee-item">
                      <div className="liquid-glass flex h-6 w-6 items-center justify-center rounded-lg text-[10px] font-semibold text-[hsl(var(--foreground))]">
                        {item.mark}
                      </div>
                      <span className="text-base font-semibold text-[hsl(var(--foreground))]">
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
