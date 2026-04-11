import React, { Suspense, useEffect, useState } from "react";
import LandingPage from "./LandingPage.jsx";
import "./landing.css";

const Workspace = React.lazy(() => import("../mrmilk-ai.jsx"));

function readView() {
  if (typeof window === "undefined") {
    return "landing";
  }

  const url = new URL(window.location.href);
  return url.searchParams.get("view") === "workspace" ? "workspace" : "landing";
}

function writeView(nextView, mode = "push") {
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
  const [view, setView] = useState(() => readView());

  useEffect(() => {
    const syncView = () => setView(readView());
    window.addEventListener("popstate", syncView);
    return () => window.removeEventListener("popstate", syncView);
  }, []);

  useEffect(() => {
    document.title =
      view === "workspace"
        ? "Mr Milk AI OS Workspace"
        : "Mr Milk AI OS | Premium Dairy Intelligence";
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
      <div className="workspace-shell">
        <Suspense
          fallback={
            <div className="workspace-loading">
              <div className="workspace-loading__panel">
                <span className="workspace-loading__eyebrow">Mr Milk AI OS</span>
                <h1>Loading the live workspace.</h1>
                <p>
                  The landing page stays lightweight by loading the analytics and chat workspace
                  only when you open it.
                </p>
              </div>
            </div>
          }
        >
          <Workspace />
        </Suspense>

        <button type="button" className="workspace-back" onClick={openLanding}>
          Back to landing
        </button>
      </div>
    );
  }

  return <LandingPage onOpenWorkspace={openWorkspace} />;
}
