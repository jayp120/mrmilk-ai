import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { CONFIG } from "../config.js";

const REQUEST_TIMEOUT_MS = 10000;

const fetchJsonWithTimeout = async (url, options = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
};

export function usePomelliBridge() {
  const [jobId, setJobId] = useState("");
  const [jobStatus, setJobStatus] = useState("idle");
  const [result, setResult] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const pollRef = useRef(null);
  const timerRef = useRef(null);

  const clearTimers = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopActiveJob = useCallback(() => {
    clearTimers();
    setElapsedSeconds(0);
  }, [clearTimers]);

  const checkHealth = useCallback(async () => {
    try {
      const response = await fetchJsonWithTimeout(`${CONFIG.BRIDGE_URL}/health`, { method: "GET" });
      const nextConnected = response?.status === "ok";
      setIsConnected(nextConnected);
      if (!nextConnected) {
        console.log("🥛 [Content Studio] bridge health returned non-ok");
      }
    } catch (healthError) {
      setIsConnected(false);
      console.log("🥛 [Content Studio] bridge health check failed", healthError);
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const intervalId = setInterval(checkHealth, 10000);
    return () => clearInterval(intervalId);
  }, [checkHealth]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const cancelJob = useCallback(() => {
    console.log("🥛 [Content Studio] cancel job", jobId);
    stopActiveJob();
    setJobId("");
    setJobStatus("idle");
    setResult(null);
    setError("");
  }, [jobId, stopActiveJob]);

  const sendToPomelli = useCallback(async (prompt, campaignType) => {
    const nextJobId = uuidv4();
    console.log("🥛 [Content Studio] sending prompt to bridge", { campaignType, nextJobId });

    stopActiveJob();
    setJobId(nextJobId);
    setResult(null);
    setError("");
    setElapsedSeconds(0);
    setJobStatus("sending");

    try {
      await fetchJsonWithTimeout(`${CONFIG.BRIDGE_URL}/trigger`, {
        method: "POST",
        body: JSON.stringify({
          prompt,
          campaignType,
          jobId: nextJobId,
          weeklyContext: {}
        })
      });
    } catch (triggerError) {
      setJobStatus("server_offline");
      setError(triggerError.message || "Bridge server is offline");
      console.log("🥛 [Content Studio] bridge trigger failed", triggerError);
      return;
    }

    setJobStatus("opening_pomelli");
    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    const poll = async () => {
      try {
        const payload = await fetchJsonWithTimeout(`${CONFIG.BRIDGE_URL}/result/${nextJobId}`, { method: "GET" });
        if (payload?.status === "pending") {
          setJobStatus("opening_pomelli");
          return;
        }
        if (payload?.status === "processing") {
          setJobStatus("generating");
          return;
        }
        if (payload?.status === "complete") {
          setResult(payload);
          setJobStatus("complete");
          stopActiveJob();
          return;
        }
        if (payload?.status === "error") {
          setResult(payload);
          setJobStatus("error");
          setError(payload?.error || "Pomelli returned an error");
          stopActiveJob();
          return;
        }
        if (payload?.status === "not_found") {
          setJobStatus("error");
          setError("Bridge server does not know this Pomelli job");
          stopActiveJob();
        }
      } catch (pollError) {
        setJobStatus("error");
        setError(pollError.message || "Unable to poll Pomelli bridge result");
        stopActiveJob();
        console.log("🥛 [Content Studio] polling failed", pollError);
      }
    };

    await poll();
    pollRef.current = setInterval(poll, 3000);
  }, [stopActiveJob]);

  return {
    sendToPomelli,
    jobId,
    jobStatus,
    result,
    isConnected,
    error,
    elapsedSeconds,
    cancelJob
  };
}
