import React, { Suspense, useEffect, useState } from "react";

import LandingPage from "@/LandingPage";
import {
  clearAuthToken,
  fetchCurrentUser,
  getAuthToken,
  getCachedUser,
  login as loginUser,
  setCachedUser,
} from "@/utils/importApi.js";

const Workspace = React.lazy(() => import("../mrmilk-ai.jsx"));

type View = "landing" | "workspace";
type AuthUser = {
  username: string;
  name: string;
  role: string;
  permissions: string[];
};

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

function WorkspaceLoading({ label = "Loading the live workspace." }: { label?: string }) {
  return (
    <div className="grid min-h-screen place-items-center px-6 py-10">
      <div className="milk-panel w-full max-w-2xl rounded-[32px] p-8 md:p-10">
        <span className="milk-eyebrow">Mr. Milk AI OS</span>
        <h1 className="mt-4 font-display text-[clamp(2.5rem,5vw,4.4rem)] leading-[0.95] tracking-[-0.045em] text-white">
          {label}
        </h1>
      </div>
    </div>
  );
}

function WorkspaceLogin({
  notice,
  onSubmit,
}: {
  notice: string;
  onSubmit: (username: string, password: string) => Promise<void>;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await onSubmit(username, password);
    } catch (err: any) {
      setError(err?.message || "Login failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-[#06070a] px-5 py-10 text-white">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[420px] rounded-[28px] border border-white/[0.12] bg-[#101217]/95 p-6 shadow-glow backdrop-blur-xl"
      >
        <span className="milk-eyebrow">Secure Workspace</span>
        <h1 className="mt-3 font-display text-4xl leading-none text-white">Sign in</h1>
        <div className="mt-6 grid gap-3">
          <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/55">
            Username
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              className="rounded-xl border border-white/[0.12] bg-white px-4 py-3 text-sm normal-case tracking-normal text-[#101217] outline-none focus:border-[#d2ab67]"
            />
          </label>
          <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/55">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              className="rounded-xl border border-white/[0.12] bg-white px-4 py-3 text-sm normal-case tracking-normal text-[#101217] outline-none focus:border-[#d2ab67]"
            />
          </label>
        </div>
        {(error || notice) && (
          <div className="mt-4 rounded-xl border border-[#d2ab67]/35 bg-[#d2ab67]/10 px-4 py-3 text-sm text-[#f2d39b]">
            {error || notice}
          </div>
        )}
        <button
          type="submit"
          disabled={submitting || !username.trim() || !password}
          className="mt-6 w-full rounded-xl bg-[#d2ab67] px-5 py-3 text-sm font-bold text-[#101217] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {submitting ? "Signing in..." : "Open Workspace"}
        </button>
      </form>
    </div>
  );
}

export default function AppShell() {
  const [view, setView] = useState<View>(() => readView());
  // Seed from the cached user so a refresh (or a brief backend blip) keeps the
  // operator signed in instead of bouncing them to the login screen.
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => getCachedUser());
  const [authLoading, setAuthLoading] = useState(() => !getCachedUser());
  const [authNotice, setAuthNotice] = useState("");

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

  useEffect(() => {
    const controller = new AbortController();
    const loadSession = async () => {
      // No token at all → not signed in. Skip the call (a 401 here would also
      // wipe nothing) and show the login screen.
      if (!getAuthToken()) {
        setAuthUser(null);
        setAuthLoading(false);
        return;
      }
      setAuthLoading(true);
      try {
        const payload = await fetchCurrentUser(controller.signal);
        const user = payload?.user || null;
        setAuthUser(user);
        setCachedUser(user);
        setAuthNotice("");
      } catch (err: any) {
        // Request cancelled (StrictMode double-effect / unmount) — ignore it,
        // do NOT touch the token or the signed-in state.
        if (err?.name === "AbortError") return;
        // Genuine auth failure: apiFetch already cleared the token and fired
        // "mrmilk-auth-expired"; reflect the logout here too.
        if (err?.status === 401) {
          setAuthUser(null);
        }
        // Any other error (backend down / network blip / timeout) → keep the
        // token and the cached user, stay signed in, retry on next load.
      } finally {
        setAuthLoading(false);
      }
    };
    const handleExpired = () => {
      setAuthUser(null);
      setAuthNotice("Session expired. Sign in again.");
    };
    window.addEventListener("mrmilk-auth-expired", handleExpired);
    loadSession();
    return () => {
      controller.abort();
      window.removeEventListener("mrmilk-auth-expired", handleExpired);
    };
  }, []);

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

  const handleLogin = async (username: string, password: string) => {
    const payload = await loginUser(username.trim(), password);
    const user = payload?.user || null;
    setAuthUser(user);
    setCachedUser(user);
    setAuthNotice("");
  };

  const handleLogout = () => {
    clearAuthToken();
    setAuthUser(null);
    setAuthNotice("Signed out.");
  };

  if (view === "workspace") {
    if (authLoading) {
      return (
        <div className="relative bg-[#06070a] text-white">
          <WorkspaceLoading label="Checking workspace access." />
        </div>
      );
    }

    if (!authUser) {
      return <WorkspaceLogin notice={authNotice} onSubmit={handleLogin} />;
    }

    return (
      <div className="relative bg-[#06070a] text-white">
        <Suspense
          fallback={<WorkspaceLoading />}
        >
          <Workspace authUser={authUser} onLogout={handleLogout} />
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
