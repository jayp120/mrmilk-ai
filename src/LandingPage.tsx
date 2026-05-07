import { motion, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import logo from "@/assets/logo.png";

type LandingPageProps = {
  onOpenWorkspace: () => void;
};

const HERO_VIDEO_URL =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_065045_c44942da-53c6-4804-b734-f9e07fc22e08.mp4";

const navigationItems = [
  { label: "Features", hasChevron: true },
  { label: "Solutions", hasChevron: false },
  { label: "Plans", hasChevron: false },
  { label: "Learning", hasChevron: true },
] as const;

const marqueeLogos = [
  { label: "Milk Master", mark: "M" },
  { label: "Segment Engine", mark: "S" },
  { label: "Campaign Studio", mark: "C" },
  { label: "Field Command", mark: "F" },
  { label: "Growth Desk", mark: "G" },
  { label: "Insight Graph", mark: "I" },
] as const;

const sheetFields = [
  {
    accent: "#f7dfa1",
    detail:
      "Primary customer handle that keeps each imported row anchored to a stable business identity.",
    group: "Identity",
    label: "Id",
    outcome: "Used to preserve continuity across imports, analytics, and downstream action.",
    x: "9%",
    y: "63%",
  },
  {
    accent: "#f7dfa1",
    detail:
      "Human-readable customer identity that turns raw records into operator-usable context.",
    group: "Identity",
    label: "Name",
    outcome: "Paired with contact fields for service, support, and premium-touch communication.",
    x: "21%",
    y: "40%",
  },
  {
    accent: "#86d6ff",
    detail: "Primary outreach field for follow-ups, retention flows, and service coordination.",
    group: "Contact",
    label: "Mobile",
    outcome: "Connects the spreadsheet record to the real customer conversation layer.",
    x: "34%",
    y: "22%",
  },
  {
    accent: "#86d6ff",
    detail:
      "Territory signal that helps cluster demand, route activity, and neighborhood-specific decisions.",
    group: "Territory",
    label: "Area",
    outcome: "Feeds geographic filtering and local action planning across Pune and PCMC.",
    x: "49%",
    y: "29%",
  },
  {
    accent: "#86d6ff",
    detail: "Operational routing field tying customers to field motion and delivery execution.",
    group: "Territory",
    label: "Route Name",
    outcome: "Links customer truth to field movement instead of leaving logistics abstract.",
    x: "64%",
    y: "18%",
  },
  {
    accent: "#d39aff",
    detail:
      "Lifecycle signal for trial, active, inactive, blocked, and service-attention states.",
    group: "Lifecycle",
    label: "Temp Customer Status",
    outcome: "Turns a static workbook into a dynamic segmentation surface for action.",
    x: "78%",
    y: "31%",
  },
  {
    accent: "#d39aff",
    detail:
      "Attribution layer that carries acquisition and campaign context into the customer record.",
    group: "Campaign",
    label: "Campaign Name",
    outcome: "Makes growth performance traceable beyond the acquisition moment.",
    x: "85%",
    y: "53%",
  },
  {
    accent: "#d39aff",
    detail:
      "Explicit operator action date used to schedule the next touch instead of guessing cadence.",
    group: "Campaign",
    label: "Follow Up Date",
    outcome: "Converts insight into a real task with timing.",
    x: "73%",
    y: "72%",
  },
  {
    accent: "#8ea4ff",
    detail: "Operational recency marker for freshness, service rhythm, and churn-risk visibility.",
    group: "Behavior",
    label: "Last Delivery Date",
    outcome: "Helps identify slipping customers before they become silent churn.",
    x: "56%",
    y: "83%",
  },
  {
    accent: "#8ea4ff",
    detail: "Volume signal for customer habit strength and relationship depth over time.",
    group: "Value",
    label: "Total Orders",
    outcome: "Adds behavioral weight to segmentation beyond simple status labels.",
    x: "39%",
    y: "75%",
  },
  {
    accent: "#8ea4ff",
    detail: "Revenue signal that identifies economic importance across the live customer base.",
    group: "Value",
    label: "Total Revenue",
    outcome: "Enables high-value prioritization and premium retention logic.",
    x: "25%",
    y: "83%",
  },
  {
    accent: "#8ea4ff",
    detail: "Financial readiness layer showing the real state before service or campaign action.",
    group: "Value",
    label: "Effective Wallet Balance",
    outcome: "Prevents blind outreach by grounding action in commercial reality.",
    x: "12%",
    y: "80%",
  },
] as const;

const workbookPhases = [
  {
    body: "Profile the MilkMaster workbook and preserve one trustworthy live dataset.",
    label: "Import profile",
  },
  {
    body: "Translate status, recency, wallet, and attribution into readable customer intelligence.",
    label: "Segment interpretation",
  },
  {
    body: "Push the right signal into campaigns, follow-ups, and field execution without losing context.",
    label: "Operator action",
  },
] as const;

function readOpacity(video: HTMLVideoElement) {
  const numericOpacity = Number.parseFloat(video.style.opacity);
  return Number.isNaN(numericOpacity) ? 0 : numericOpacity;
}

export default function LandingPage({ onOpenWorkspace }: LandingPageProps) {
  const [activeFieldIndex, setActiveFieldIndex] = useState(0);
  const heroVideoRef = useRef<HTMLVideoElement | null>(null);
  const fadeFrameRef = useRef<number | null>(null);
  const restartTimeoutRef = useRef<number | null>(null);
  const isFadingOutRef = useRef(false);
  const prefersReducedMotion = useReducedMotion();

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

  useEffect(() => {
    if (prefersReducedMotion) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setActiveFieldIndex((current) => (current + 1) % sheetFields.length);
    }, 2200);

    return () => window.clearInterval(intervalId);
  }, [prefersReducedMotion]);

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
  const activeField = sheetFields[activeFieldIndex];
  const relatedFields = sheetFields.filter((field) => field.group === activeField.group);

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

              <nav className="hidden items-center gap-8 lg:flex" aria-label="Primary navigation">
                {navigationItems.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-[hsl(var(--foreground))]/90 transition-colors hover:text-[hsl(var(--foreground))]"
                  >
                    <span>{item.label}</span>
                    {item.hasChevron ? <ChevronDown className="h-4 w-4" strokeWidth={1.8} /> : null}
                  </button>
                ))}
              </nav>

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

      <section className="relative overflow-hidden px-5 pb-24 pt-20 sm:px-8 md:pb-32 md:pt-24">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(126,87,255,0.14),transparent_28%),radial-gradient(circle_at_86%_78%,rgba(252,211,77,0.07),transparent_24%)]" />

        <div className="relative mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-[11px] uppercase tracking-[0.34em] text-[hsl(var(--hero-line))]">
              Workbook intelligence
            </p>

            <h2
              className="font-general mt-5 text-4xl font-medium leading-[1.02] text-[hsl(var(--foreground))] sm:text-5xl lg:text-7xl"
              style={{ letterSpacing: "-0.03em" }}
            >
              A gentle schema thread that turns{" "}
              <span className="text-white/62">MilkMaster columns into operating clarity.</span>
            </h2>

            <p className="mt-6 max-w-2xl text-base leading-8 text-[hsl(var(--hero-sub))]/82 md:text-lg">
              The empty block is gone. This layer now surfaces real headers from the Mr. Milk
              workbook, then shows how each one feeds segmentation, operator timing, and campaign
              action without overloading the page.
            </p>
          </div>

          <div className="mt-12 grid gap-8 xl:grid-cols-[minmax(0,1.12fr)_420px]">
            <div className="liquid-glass rounded-[2rem] p-5 sm:p-7">
              <div className="flex flex-col gap-5 border-b border-white/8 pb-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-white/42">
                    Interactive schema thread
                  </p>
                  <p className="mt-2 max-w-xl font-general text-2xl font-medium tracking-[-0.03em] text-white sm:text-[2rem]">
                    Representative fields from the live customer workbook.
                  </p>
                </div>

                <div className="inline-flex items-center gap-2 self-start rounded-full border border-white/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.26em] text-white/55 sm:self-auto">
                  <span className="h-2 w-2 rounded-full bg-white/60" />
                  12 surfaced from 42 headers
                </div>
              </div>

              <div className="mt-6 hidden min-h-[500px] rounded-[1.75rem] border border-white/8 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.035),transparent_64%)] p-5 md:block">
                <div className="relative h-full min-h-[440px] overflow-hidden rounded-[1.4rem] border border-white/6 bg-[#0b0913]/65">
                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,transparent_0,rgba(255,255,255,0.025)_50%,transparent_100%),linear-gradient(0deg,transparent_0,rgba(255,255,255,0.02)_50%,transparent_100%)] bg-[length:160px_160px]" />

                  <svg
                    className="pointer-events-none absolute inset-0 h-full w-full"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <motion.path
                      d="M8 64C17 55 23 35 33 24C42 15 56 16 66 23C76 30 79 51 86 56C90 59 87 69 74 73C62 76 53 82 40 78C27 75 18 80 11 74C6 70 5 67 8 64Z"
                      fill="none"
                      stroke="rgba(255,255,255,0.12)"
                      strokeLinecap="round"
                      strokeWidth="0.45"
                      initial={prefersReducedMotion ? false : { pathLength: 0, opacity: 0.35 }}
                      animate={prefersReducedMotion ? { opacity: 0.35 } : { pathLength: 1, opacity: 1 }}
                      transition={{ duration: 1.2, ease: "easeOut" }}
                    />
                    <motion.path
                      d="M8 64C17 55 23 35 33 24C42 15 56 16 66 23C76 30 79 51 86 56C90 59 87 69 74 73C62 76 53 82 40 78C27 75 18 80 11 74C6 70 5 67 8 64Z"
                      fill="none"
                      stroke={activeField.accent}
                      strokeDasharray="1.6 2.8"
                      strokeLinecap="round"
                      strokeWidth="0.3"
                      animate={{ opacity: prefersReducedMotion ? 0.25 : 0.55 }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                    />
                  </svg>

                  {sheetFields.map((field, index) => {
                    const isActive = activeFieldIndex === index;

                    return (
                      <motion.button
                        key={field.label}
                        type="button"
                        aria-pressed={isActive}
                        onMouseEnter={() => setActiveFieldIndex(index)}
                        onFocus={() => setActiveFieldIndex(index)}
                        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-4 py-2 text-left backdrop-blur-xl transition-colors duration-200 focus:outline-none"
                        style={{
                          left: field.x,
                          top: field.y,
                          background: isActive ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
                          borderColor: isActive ? `${field.accent}70` : "rgba(255,255,255,0.12)",
                          boxShadow: isActive
                            ? `0 0 0 1px ${field.accent}24, 0 24px 40px rgba(0, 0, 0, 0.28)`
                            : "0 18px 32px rgba(0, 0, 0, 0.22)",
                        }}
                        animate={
                          prefersReducedMotion
                            ? undefined
                            : { scale: isActive ? 1.02 : 1, y: isActive ? -2 : 0 }
                        }
                        transition={{ duration: 0.22, ease: "easeOut" }}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{
                              background: field.accent,
                              boxShadow: isActive ? `0 0 18px ${field.accent}` : "none",
                            }}
                          />
                          <span className="text-[11px] uppercase tracking-[0.24em] text-white/42">
                            {field.group}
                          </span>
                        </div>
                        <div className="mt-2 font-general text-lg font-medium tracking-[-0.03em] text-white">
                          {field.label}
                        </div>
                      </motion.button>
                    );
                  })}

                  <div className="absolute bottom-4 left-4 rounded-full border border-white/8 bg-black/30 px-3 py-1.5 text-[10px] uppercase tracking-[0.24em] text-white/40">
                    Hover a header to inspect its role
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-3 md:hidden">
                {sheetFields.map((field, index) => {
                  const isActive = activeFieldIndex === index;

                  return (
                    <button
                      key={field.label}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => setActiveFieldIndex(index)}
                      className="rounded-full border px-4 py-2 text-sm text-white/78 transition-colors duration-200"
                      style={{
                        background: isActive ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
                        borderColor: isActive ? `${field.accent}6e` : "rgba(255,255,255,0.1)",
                      }}
                    >
                      {field.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="liquid-glass rounded-[2rem] p-5 sm:p-7">
              <div className="flex items-center justify-between gap-4 border-b border-white/8 pb-5">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-white/45">
                    Selected column
                  </p>
                  <p className="mt-2 font-general text-2xl font-medium tracking-[-0.03em] text-white">
                    Workbook field context
                  </p>
                </div>

                <div
                  className="rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.26em]"
                  style={{
                    borderColor: `${activeField.accent}42`,
                    color: activeField.accent,
                  }}
                >
                  {activeField.group}
                </div>
              </div>

              <motion.div
                key={activeField.label}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: "easeOut" }}
                className="pt-6"
              >
                <div className="rounded-[1.5rem] border border-white/8 bg-white/[0.028] p-5">
                  <p className="text-[11px] uppercase tracking-[0.28em] text-white/35">
                    Active workbook header
                  </p>
                  <h3 className="mt-3 font-general text-3xl font-medium tracking-[-0.04em] text-white">
                    {activeField.label}
                  </h3>
                  <p className="mt-4 text-sm leading-7 text-white/68">{activeField.detail}</p>
                </div>

                <div
                  className="mt-4 rounded-[1.5rem] border p-5"
                  style={{
                    borderColor: `${activeField.accent}32`,
                    background: `linear-gradient(135deg, ${activeField.accent}16, rgba(255,255,255,0.02))`,
                  }}
                >
                  <p className="text-[11px] uppercase tracking-[0.28em] text-white/40">
                    Why it matters
                  </p>
                  <p className="mt-3 text-sm leading-7 text-white/78">{activeField.outcome}</p>
                </div>

                <div className="mt-4 rounded-[1.5rem] border border-white/8 bg-white/[0.022] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] uppercase tracking-[0.28em] text-white/40">
                      Related headers
                    </p>
                    <p className="text-[10px] uppercase tracking-[0.22em] text-white/32">
                      same decision family
                    </p>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2.5">
                    {relatedFields.map((field) => (
                      <span
                        key={field.label}
                        className="rounded-full border px-3 py-1.5 text-xs tracking-[0.08em] text-white/72"
                        style={{
                          borderColor:
                            field.label === activeField.label
                              ? `${activeField.accent}70`
                              : "rgba(255,255,255,0.1)",
                          background:
                            field.label === activeField.label
                              ? `${activeField.accent}18`
                              : "rgba(255,255,255,0.03)",
                        }}
                      >
                        {field.label}
                      </span>
                    ))}
                  </div>
                </div>
              </motion.div>

              <div className="mt-6 space-y-3">
                {workbookPhases.map((phase, index) => (
                  <article
                    key={phase.label}
                    className="rounded-[1.35rem] border border-white/8 bg-white/[0.022] px-4 py-4"
                  >
                    <p className="text-[11px] uppercase tracking-[0.28em] text-white/34">
                      Phase {String(index + 1).padStart(2, "0")}
                    </p>
                    <h4 className="mt-2 font-general text-lg font-medium tracking-[-0.03em] text-white">
                      {phase.label}
                    </h4>
                    <p className="mt-2 text-sm leading-6 text-white/58">{phase.body}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
