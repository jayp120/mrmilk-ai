import React, { Suspense, useEffect, useState } from "react";

import LandingPage from "@/LandingPage";

const Workspace = React.lazy(() => import("../mrmilk-ai.jsx"));

type View = "landing" | "workspace";

function readView(): View {
  if (typeof window === "undefined") {
    return "landing";
  }

  const url = new URL(window.location.href);
  return url.searchParams.get("view") === "workspace" ? "workspace" : "landing";
}

function writeView(nextView: View, mode: "push" | "replace" = "push") {
  const url = new URL(window.location.href);

  if (nextView === "workspace") {
    url.searchParams.set("view", "workspace");
  } else {
    url.searchParams.delete("view");
  }

  const method = mode === "replace" ? "replaceState" : "pushState";
  window.history[method]({}, "", url);
}

export default function AppShell() {
  const [view, setView] = useState<View>(() => readView());

  useEffect(() => {
    const syncView = () => setView(readView());
    window.addEventListener("popstate", syncView);
    return () => window.removeEventListener("popstate", syncView);
  }, []);

  useEffect(() => {
    document.title =
      view === "workspace"
        ? "Mr. Milk AI OS Workspace"
        : "Mr. Milk AI OS | Premium dairy intelligence";
  }, [view]);

  const openWorkspace = () => {
    writeView("workspace");
    setView("workspace");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openLanding = () => {
    writeView("landing");
    setView("landing");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (view === "workspace") {
    return (
      <div className="relative bg-[#06070a] text-white">
        <Suspense
          fallback={
            <div className="grid min-h-screen place-items-center px-6 py-10">
              <div className="milk-panel w-full max-w-2xl rounded-[32px] p-8 md:p-10">
                <span className="milk-eyebrow">Mr. Milk AI OS</span>
                <h1 className="mt-4 font-display text-[clamp(2.7rem,5vw,4.6rem)] leading-[0.95] tracking-[-0.045em] text-white">
                  Loading the live workspace.
                </h1>
                <p className="mt-4 max-w-xl text-base leading-8 text-white/60">
                  The landing page stays restrained by loading the analytics and chat workspace only
                  when you open it.
                </p>
              </div>
            </div>
          }
        >
          <Workspace />
        </Suspense>

        <button
          type="button"
          onClick={openLanding}
          className="fixed bottom-5 right-5 z-50 rounded-full border border-white/[0.12] bg-[#101217]/90 px-5 py-3 text-sm text-white shadow-glow backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-[#14171d]"
        >
          Back to landing
        </button>
      </div>
    );
  }

  return <LandingPage onOpenWorkspace={openWorkspace} />;
}
