import React, { useEffect, useMemo, useRef } from "react";
import logoImage from "./assets/logo.png";

const VIDEO_URL =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_065045_c44942da-53c6-4804-b734-f9e07fc22e08.mp4";

const NAV_ITEMS = [
  { label: "Bridge", target: "bridge" },
  { label: "Proof", target: "proof" },
  { label: "Teams", target: "teams" },
];

const HERO_MARQUEE = ["Marketing", "Digital", "Design", "BDM", "Team Leads", "Sales"];

const BRIDGE_POINTS = [
  "MilkMaster stores the business record.",
  "Mr Milk AI OS reads the record instantly.",
  "Teams move with clearer next actions.",
];

const RECORD_POINTS = [
  "Customers, subscriptions, routes, wallets, and products stay in the operating system.",
  "Operations keeps the workflow it already trusts.",
  "Nothing changes in the record layer. The speed changes in the decision layer.",
];

const ACTION_POINTS = [
  "Ask plain-language questions against customer and campaign data.",
  "Turn exports into win-back lists, briefs, priorities, and route actions.",
  "Give every team the next move instead of another spreadsheet.",
];

const PROOF_STATS = [
  {
    value: "16,052",
    label: "inactive customers",
    body: "Already visible inside the data, if someone has time to find them.",
  },
  {
    value: "240",
    label: "wallet-risk accounts",
    body: "Retention issues become visible earlier, not after the month slips.",
  },
  {
    value: "912",
    label: "trial customers",
    body: "Campaign follow-up gets faster when lists do not need rebuilding.",
  },
  {
    value: "15+",
    label: "priority areas",
    body: "Field effort becomes sharper when locality-level signal is clear.",
  },
];

const MANUAL_STEPS = [
  "Download the MilkMaster export.",
  "Sort by status, route, product, or wallet.",
  "Filter again for the real question.",
  "Lose time before action even starts.",
];

const AI_QUERIES = [
  {
    team: "Marketing",
    title: "Which premium customers need the next push?",
    body: "See the segment, locality, and reactivation angle in one answer.",
  },
  {
    team: "Digital",
    title: "Which sources are bringing retained value?",
    body: "Judge channels by revenue quality, not vanity metrics.",
  },
  {
    team: "BDM",
    title: "Where should the team go today, and why?",
    body: "Know which route, pocket, or account needs field attention first.",
  },
];

const TEAM_CARDS = [
  {
    team: "Marketing",
    tag: "Campaign clarity",
    title: "Plan with demand, not guesswork.",
  },
  {
    team: "Digital",
    tag: "Better spend",
    title: "Read quality beyond clicks and leads.",
  },
  {
    team: "Design",
    tag: "Sharper briefs",
    title: "Build creative from live business signal.",
  },
  {
    team: "BDM",
    tag: "Field priority",
    title: "Know where to go and what to fix.",
  },
  {
    team: "Team Leads",
    tag: "Daily direction",
    title: "Spot the slip before it spreads.",
  },
  {
    team: "Sales",
    tag: "Recovery context",
    title: "Call with the right story already ready.",
  },
];

function scrollToSection(target) {
  const node = document.getElementById(target);

  if (!node) {
    return;
  }

  node.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function LandingPage({ onOpenWorkspace }) {
  const videoRef = useRef(null);
  const fadeFrameRef = useRef(0);
  const monitorFrameRef = useRef(0);
  const restartTimeoutRef = useRef(0);
  const fadeOutStartedRef = useRef(false);
  const marqueeItems = useMemo(() => [...HERO_MARQUEE, ...HERO_MARQUEE], []);

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return undefined;
    }

    let cancelled = false;

    const clearFade = () => {
      if (fadeFrameRef.current) {
        window.cancelAnimationFrame(fadeFrameRef.current);
        fadeFrameRef.current = 0;
      }
    };

    const clearMonitor = () => {
      if (monitorFrameRef.current) {
        window.cancelAnimationFrame(monitorFrameRef.current);
        monitorFrameRef.current = 0;
      }
    };

    const setOpacity = (value) => {
      video.style.opacity = String(Math.max(0, Math.min(1, value)));
    };

    const animateOpacity = (from, to, duration, onComplete) => {
      clearFade();

      const startAt = performance.now();

      const tick = (now) => {
        if (cancelled) {
          return;
        }

        const progress = Math.min((now - startAt) / duration, 1);
        const eased =
          progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        setOpacity(from + (to - from) * eased);

        if (progress < 1) {
          fadeFrameRef.current = window.requestAnimationFrame(tick);
          return;
        }

        fadeFrameRef.current = 0;
        onComplete?.();
      };

      fadeFrameRef.current = window.requestAnimationFrame(tick);
    };

    const startMonitor = () => {
      clearMonitor();

      const check = () => {
        if (cancelled) {
          return;
        }

        if (video.duration && !video.paused && !fadeOutStartedRef.current) {
          const remaining = video.duration - video.currentTime;

          if (remaining <= 0.5) {
            fadeOutStartedRef.current = true;
            animateOpacity(Number(video.style.opacity || 1), 0, 500);
          }
        }

        monitorFrameRef.current = window.requestAnimationFrame(check);
      };

      monitorFrameRef.current = window.requestAnimationFrame(check);
    };

    const playFromStart = () => {
      fadeOutStartedRef.current = false;
      video.currentTime = 0;
      setOpacity(0);

      const afterPlay = () => {
        animateOpacity(0, 1, 500);
        startMonitor();
      };

      const playAttempt = video.play();

      if (playAttempt && typeof playAttempt.then === "function") {
        playAttempt.then(afterPlay).catch(() => {});
        return;
      }

      afterPlay();
    };

    const handleCanPlay = () => {
      playFromStart();
    };

    const handleEnded = () => {
      clearMonitor();
      clearFade();
      setOpacity(0);

      restartTimeoutRef.current = window.setTimeout(() => {
        if (!cancelled) {
          playFromStart();
        }
      }, 100);
    };

    video.muted = true;
    video.playsInline = true;
    video.loop = false;
    setOpacity(0);

    if (video.readyState >= 2) {
      playFromStart();
    } else {
      video.addEventListener("canplay", handleCanPlay, { once: true });
    }

    video.addEventListener("ended", handleEnded);

    return () => {
      cancelled = true;
      clearFade();
      clearMonitor();
      window.clearTimeout(restartTimeoutRef.current);
      video.pause();
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("canplay", handleCanPlay);
    };
  }, []);

  return (
    <main className="dark-milk-page">
      <section className="dark-hero" id="top">
        <div className="dark-hero__video-wrap">
          <video
            ref={videoRef}
            className="dark-hero__video"
            src={VIDEO_URL}
            muted
            playsInline
            preload="auto"
            aria-hidden="true"
          />
        </div>

        <div className="dark-hero__content">
          <div className="dark-hero__blur" aria-hidden="true" />

          <header className="dark-header">
            <div className="dark-header__inner">
              <a href="#top" className="dark-brand" aria-label="Mr Milk AI OS">
                <img src={logoImage} alt="Mr Milk AI OS" className="dark-brand__logo" />
                <div className="dark-brand__text">
                  <span className="dark-brand__eyebrow">Mr Milk</span>
                  <span className="dark-brand__title">AI OS</span>
                </div>
              </a>

              <nav className="dark-nav" aria-label="Primary navigation">
                {NAV_ITEMS.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className="dark-nav__item"
                    onClick={() => scrollToSection(item.target)}
                  >
                    {item.label}
                  </button>
                ))}
              </nav>

              <button
                type="button"
                className="dark-button dark-button--nav liquid-glass"
                onClick={onOpenWorkspace}
              >
                Open Workspace
              </button>
            </div>

            <div className="dark-header__divider" aria-hidden="true" />
          </header>

          <div className="dark-hero__center">
            <div className="dark-hero__copy">
              <div className="dark-kicker">MilkMaster data. Mr Milk action.</div>
              <h1 className="dark-hero__title">
                <span className="dark-hero__title-main">Mr Milk</span>{" "}
                <span className="dark-hero__title-accent">AI</span>
              </h1>
              <p className="dark-hero__subtitle">
                <span>From report export to same-day action.</span>
              </p>
              <div className="dark-hero__body">
                Ask the business a question and get the customer, route, product, or campaign
                answer without spending half the day in filters.
              </div>
              <div className="dark-hero__actions">
                <button type="button" className="dark-button liquid-glass" onClick={onOpenWorkspace}>
                  Open Mr Milk AI OS
                </button>
                <button
                  type="button"
                  className="dark-link-button"
                  onClick={() => scrollToSection("bridge")}
                >
                  See how it works
                </button>
              </div>
            </div>
          </div>

          <div className="dark-marquee">
            <div className="dark-marquee__inner">
              <p className="dark-marquee__label">
                <span>Used across teams</span>
                <span>from marketing to field action</span>
              </p>

              <div className="dark-marquee__viewport">
                <div className="dark-marquee__track">
                  {marqueeItems.map((brand, index) => (
                    <div key={`${brand}-${index}`} className="dark-marquee__item">
                      <span className="dark-marquee__icon liquid-glass">{brand.charAt(0)}</span>
                      <span className="dark-marquee__name">{brand}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="dark-section" id="bridge">
        <div className="dark-container">
          <div className="dark-section-header dark-section-header--compact">
            <div className="dark-kicker">The bridge</div>
            <h2 className="dark-section-title">MilkMaster records. AI OS responds.</h2>
            <p className="dark-section-copy">
              Keep the operating system your team already trusts. Add the layer that reads the
              record and turns it into clearer next actions.
            </p>
          </div>

          <div className="dark-bridge-band liquid-glass">
            <div className="dark-bridge-band__brand">
              <span className="dark-mini-label">System of record</span>
              <img src="/landing-assets/milkmaster-logo-white.png" alt="MilkMaster" />
            </div>

            <div className="dark-bridge-band__flow">
              {BRIDGE_POINTS.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>

            <div className="dark-bridge-band__brand dark-bridge-band__brand--ai">
              <span className="dark-mini-label">System of action</span>
              <div className="dark-bridge-band__ai">
                <img src={logoImage} alt="Mr Milk AI OS" />
                <strong>Mr Milk AI OS</strong>
              </div>
            </div>
          </div>

          <div className="dark-grid dark-grid--bridge">
            <article className="dark-card dark-card--record liquid-glass">
              <span className="dark-card__label">MilkMaster</span>
              <h3>Operating platform</h3>
              <ul className="dark-list">
                {RECORD_POINTS.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>

            <article className="dark-card dark-card--action liquid-glass">
              <span className="dark-card__label">Mr Milk AI OS</span>
              <h3>Decision layer</h3>
              <ul className="dark-list">
                {ACTION_POINTS.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          </div>
        </div>
      </section>

      <section className="dark-section dark-section--proof" id="proof">
        <div className="dark-shell">
          <div className="dark-shell__mesh dark-shell__mesh--violet" aria-hidden="true" />
          <div className="dark-container">
            <div className="dark-section-header dark-section-header--compact">
              <div className="dark-kicker">The proof</div>
              <h2 className="dark-section-title">Stop exporting insight. Start asking for it.</h2>
              <p className="dark-section-copy">
                The data is already there. AI OS simply removes the manual sorting and turns it
                into answers teams can act on.
              </p>
            </div>

            <div className="dark-grid dark-grid--stats">
              {PROOF_STATS.map((item) => (
                <article key={item.label} className="dark-stat liquid-glass">
                  <strong>{item.value}</strong>
                  <span>{item.label}</span>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>

            <div className="dark-grid dark-grid--workflow">
              <article className="dark-card dark-card--manual liquid-glass">
                <span className="dark-card__label">Without AI OS</span>
                <h3>Manual work slows the day.</h3>
                <ol className="dark-steps">
                  {MANUAL_STEPS.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ol>
              </article>

              <article className="dark-card dark-card--accent liquid-glass">
                <span className="dark-card__label">With AI OS</span>
                <h3>Ask once. Move faster.</h3>
                <div className="dark-grid dark-grid--queries">
                  {AI_QUERIES.map((item) => (
                    <article key={item.title} className="dark-query">
                      <span>{item.team}</span>
                      <h4>{item.title}</h4>
                      <p>{item.body}</p>
                    </article>
                  ))}
                </div>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section className="dark-section" id="teams">
        <div className="dark-container">
          <div className="dark-section-header dark-section-header--split">
            <div>
              <div className="dark-kicker">The teams</div>
              <h2 className="dark-section-title">One question layer for the whole company.</h2>
            </div>
            <p className="dark-section-copy">
              Marketing, digital, design, BDM, leaders, and sales all read from the same business
              truth, but each gets a more useful next move.
            </p>
          </div>

          <div className="dark-grid dark-grid--teams">
            {TEAM_CARDS.map((item) => (
              <article key={item.team} className="dark-team liquid-glass">
                <div className="dark-team__top">
                  <span className="dark-card__label">{item.team}</span>
                  <span className="dark-team__tag">{item.tag}</span>
                </div>
                <h3>{item.title}</h3>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="dark-section dark-section--final">
        <div className="dark-container">
          <div className="dark-final liquid-glass">
            <div>
              <div className="dark-kicker">Mr Milk AI OS</div>
              <h2 className="dark-section-title">A shorter page. A clearer story.</h2>
              <p className="dark-section-copy">
                Premium, fast, and direct: MilkMaster keeps the record, AI OS gives the next move.
              </p>
            </div>

            <div className="dark-final__actions">
              <button type="button" className="dark-button liquid-glass" onClick={onOpenWorkspace}>
                Open Workspace
              </button>
              <a
                href="https://www.mittaldairyfarms.com/"
                target="_blank"
                rel="noreferrer"
                className="dark-final__link"
              >
                Visit Mr Milk website
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
