import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./import-center.css";
import {
  commitSalesFile,
  fetchImportHistory,
  fetchSalesStatus,
  profileImportFile,
  profileSalesFile,
  queueImportFile,
} from "./utils/importApi.js";

const STATUS_META = {
  queued: { label: "Queued", tone: "queued" },
  processing: { label: "Processing", tone: "processing" },
  succeeded: { label: "Succeeded", tone: "success" },
  failed: { label: "Failed", tone: "error" },
};

function formatDateTime(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCount(value) {
  if (value == null) return "0";
  return Number(value).toLocaleString("en-IN");
}

function formatRole(role) {
  if (!role) return "";
  if (role === "ops") return "Ops";
  if (role === "crm") return "CRM";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function buildRowDelta(profile) {
  if (!profile?.current_row_count || !profile?.row_count) return null;
  const delta = profile.row_count - profile.current_row_count;
  if (delta === 0) return "Matches the current live row count.";
  const direction = delta > 0 ? "higher" : "lower";
  return `${Math.abs(delta).toLocaleString("en-IN")} rows ${direction} than the current live dataset.`;
}

export default function ImportCenter({ role, roleMeta, onBackToDashboard, onImportSucceeded }) {
  const fileInputRef = useRef(null);
  const [historyItems, setHistoryItems] = useState([]);
  const [allowedRoles, setAllowedRoles] = useState([]);
  const [historyError, setHistoryError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState("");
  const [profiling, setProfiling] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmWarnings, setConfirmWarnings] = useState(false);
  const [notice, setNotice] = useState("");

  // Sales transactions upload state — runs alongside customer master,
  // backed by /api/imports/sales/* (parquet on disk, no DB rows).
  const salesFileInputRef = useRef(null);
  const [salesStatus, setSalesStatus] = useState(null);
  const [salesStatusError, setSalesStatusError] = useState("");
  const [salesFile, setSalesFile] = useState(null);
  const [salesProfile, setSalesProfile] = useState(null);
  const [salesProfileError, setSalesProfileError] = useState("");
  const [salesProfiling, setSalesProfiling] = useState(false);
  const [salesUploading, setSalesUploading] = useState(false);
  const [salesConfirmWarnings, setSalesConfirmWarnings] = useState(false);
  const [salesNotice, setSalesNotice] = useState("");

  const refreshHistory = useCallback(async () => {
    setHistoryError("");
    try {
      const payload = await fetchImportHistory();
      setHistoryItems(payload.items || []);
      setAllowedRoles(payload.allowed_upload_roles || []);
    } catch (error) {
      setHistoryError(error.message || "Could not load import history.");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  const hasRunningJob = useMemo(
    () => historyItems.some((item) => item.status === "queued" || item.status === "processing"),
    [historyItems],
  );

  useEffect(() => {
    if (!hasRunningJob) return undefined;
    const timer = window.setInterval(() => {
      refreshHistory();
    }, 3500);
    return () => window.clearInterval(timer);
  }, [hasRunningJob, refreshHistory]);

  // ------------------------------------------------------------------
  // Auto-aggregate: when a job transitions from queued/processing to
  // succeeded, poke the parent so the Dashboard pulls the new snapshot.
  // On first mount we seed the set with existing succeeded IDs so the
  // already-current dataset doesn't trigger a spurious refresh.
  // ------------------------------------------------------------------
  const firedSucceededIds = useRef(new Set());
  const seededSucceededIdsRef = useRef(false);
  useEffect(() => {
    if (!historyItems.length) return;
    if (!seededSucceededIdsRef.current) {
      historyItems.forEach((item) => {
        if (item.status === "succeeded") firedSucceededIds.current.add(item.import_job_id);
      });
      seededSucceededIdsRef.current = true;
      return;
    }
    if (!onImportSucceeded) return;
    for (const item of historyItems) {
      if (item.status === "succeeded" && item.is_current_dataset && !firedSucceededIds.current.has(item.import_job_id)) {
        firedSucceededIds.current.add(item.import_job_id);
        // 400ms buffer so the backend finishes marking is_current + flushing
        // the last records batch before the dashboard re-fetches.
        setTimeout(() => onImportSucceeded(item), 400);
      }
    }
  }, [historyItems, onImportSucceeded]);

  const currentDataset = useMemo(
    () => historyItems.find((item) => item.is_current_dataset) || null,
    [historyItems],
  );

  const canReplaceDataset = useMemo(() => {
    if (!allowedRoles.length) return false;
    return allowedRoles.includes((role || "").toLowerCase());
  }, [allowedRoles, role]);

  const rowDelta = useMemo(() => buildRowDelta(profile), [profile]);

  // ------------------------------------------------------------------
  // Sales transactions: status fetch + profile + commit handlers
  // ------------------------------------------------------------------
  const refreshSalesStatus = useCallback(async () => {
    setSalesStatusError("");
    try {
      const payload = await fetchSalesStatus();
      setSalesStatus(payload);
    } catch (err) {
      setSalesStatusError(err.message || "Could not load sales status.");
    }
  }, []);

  useEffect(() => {
    refreshSalesStatus();
  }, [refreshSalesStatus]);

  const handleSalesProfile = useCallback(async (file) => {
    if (!file) return;
    setSalesProfiling(true);
    setSalesProfile(null);
    setSalesProfileError("");
    setSalesNotice("");
    setSalesConfirmWarnings(false);
    try {
      const payload = await profileSalesFile(file);
      setSalesProfile(payload);
    } catch (err) {
      setSalesProfileError(err.message || "Could not inspect this sales file.");
    } finally {
      setSalesProfiling(false);
    }
  }, []);

  const onSalesFileSelected = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSalesFile(file);
    await handleSalesProfile(file);
    if (event.target) event.target.value = "";
  };

  const handleCommitSales = async () => {
    if (!salesFile || !salesProfile) return;
    if (salesProfile.blocked) return;
    if ((salesProfile.warnings || []).length && !salesConfirmWarnings) {
      setSalesProfileError("Acknowledge the warnings before replacing the sales report.");
      return;
    }
    setSalesUploading(true);
    setSalesProfileError("");
    setSalesNotice("");
    try {
      const payload = await commitSalesFile({
        file: salesFile,
        role,
        confirmReplace: (salesProfile.warnings || []).length > 0,
      });
      setSalesNotice(payload.message || "Sales report imported.");
      setSalesFile(null);
      setSalesProfile(null);
      setSalesConfirmWarnings(false);
      await refreshSalesStatus();
      // Pull dashboard refresh too — chat now sees new product names.
      if (onImportSucceeded) {
        onImportSucceeded({ kind: "sales", file_name: payload?.meta?.file_name });
      }
    } catch (err) {
      const detail = err.detail;
      if (detail && typeof detail === "object" && detail.warnings) {
        setSalesProfile((c) => (c ? { ...c, warnings: detail.warnings } : c));
      }
      setSalesProfileError(err.message || "The sales import could not be queued.");
    } finally {
      setSalesUploading(false);
    }
  };

  const handleProfile = useCallback(async (file) => {
    if (!file) return;
    setProfiling(true);
    setProfile(null);
    setProfileError("");
    setNotice("");
    setConfirmWarnings(false);

    try {
      const payload = await profileImportFile(file);
      setProfile(payload);
      setAllowedRoles((current) =>
        current.length ? current : payload.allowed_upload_roles || [],
      );
    } catch (error) {
      setProfileError(error.message || "Could not inspect this file.");
    } finally {
      setProfiling(false);
    }
  }, []);

  const onFileSelected = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    await handleProfile(file);
    if (event.target) event.target.value = "";
  };

  const handleQueueImport = async () => {
    if (!selectedFile || !profile) return;
    if (profile.blocked) return;
    if (profile.warnings.length && !confirmWarnings) {
      setProfileError("Acknowledge the warnings before replacing the live dataset.");
      return;
    }

    setUploading(true);
    setProfileError("");
    setNotice("");

    try {
      const payload = await queueImportFile({
        file: selectedFile,
        role,
        confirmReplace: profile.warnings.length > 0,
      });
      setNotice(payload.message || "Import queued.");
      setSelectedFile(null);
      setProfile(null);
      setConfirmWarnings(false);
      await refreshHistory();
    } catch (error) {
      const detail = error.detail;
      if (detail && typeof detail === "object") {
        setProfile((current) =>
          current
            ? {
                ...current,
                warnings: detail.warnings || current.warnings,
                duplicate_of_current:
                  detail.duplicate_of_current ?? current.duplicate_of_current,
                duplicate_of_job_id:
                  detail.duplicate_of_job_id ?? current.duplicate_of_job_id,
              }
            : current,
        );
      }
      setProfileError(error.message || "The import could not be queued.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="import-center" style={{ "--import-accent": roleMeta?.color || "#074069" }}>
      <div className="import-center__hero">
        <div>
          <span className="import-center__eyebrow">Live Dataset Operations</span>
          <h2>Replace the live MilkMaster snapshot without blocking the team.</h2>
          <p>
            Files are validated first, large imports run in the background, and the live
            dataset only changes after a safe replacement.
          </p>
        </div>
        <div className="import-center__heroActions">
          <button type="button" className="import-center__ghostButton" onClick={refreshHistory}>
            Refresh history
          </button>
          <button type="button" className="import-center__primaryButton" onClick={onBackToDashboard}>
            Back to dashboard
          </button>
        </div>
      </div>

      <div className="import-center__grid">
        <section className="import-center__panel import-center__panel--current">
          <div className="import-center__panelHead">
            <span className="import-center__panelEyebrow">Current dataset</span>
            {currentDataset && (
              <span className="import-center__status import-center__status--success">Live</span>
            )}
          </div>
          {currentDataset ? (
            <>
              <div className="import-center__datasetName">{currentDataset.file_name}</div>
              <div className="import-center__datasetMeta">
                <span>{formatCount(currentDataset.row_count)} rows live</span>
                <span>Switched {formatDateTime(currentDataset.updated_at)}</span>
              </div>
              <div className="import-center__datasetNote">
                Older parsed rows are overwritten after a successful replacement. History keeps the
                job trail and file name, not multiple active datasets.
              </div>
            </>
          ) : (
            <div className="import-center__emptyState">
              No live snapshot has been marked current yet.
            </div>
          )}

          <div className="import-center__roleStrip">
            <div>
              <span className="import-center__panelEyebrow">Current role</span>
              <strong>{roleMeta?.label || formatRole(role)}</strong>
            </div>
            <div>
              <span className="import-center__panelEyebrow">Allowed to replace</span>
              <strong>{allowedRoles.length ? allowedRoles.map(formatRole).join(", ") : "Loading"}</strong>
            </div>
          </div>

          <div
            className={`import-center__permission ${
              canReplaceDataset ? "import-center__permission--allowed" : "import-center__permission--blocked"
            }`}
          >
            {canReplaceDataset
              ? "This role can queue a replacement after validation."
              : "This role is read-only for live dataset replacement. Review history or switch to an allowed role."}
          </div>

          {historyError && <div className="import-center__feedback import-center__feedback--error">{historyError}</div>}
          {notice && <div className="import-center__feedback import-center__feedback--success">{notice}</div>}
        </section>

        <section className="import-center__panel import-center__panel--upload">
          <div className="import-center__panelHead">
            <span className="import-center__panelEyebrow">Replace dataset</span>
            <span className="import-center__subtle">Full customer snapshot only</span>
          </div>
          <h3>Validate the workbook before cutover.</h3>
          <p className="import-center__muted">
            Choose the next MilkMaster export. The backend will inspect the sheet, flag duplicates
            and row-count shifts, then queue the replacement.
          </p>

          <div className="import-center__uploadActions">
            <button
              type="button"
              className="import-center__primaryButton"
              onClick={() => fileInputRef.current?.click()}
            >
              Choose XLSX snapshot
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={onFileSelected}
              style={{ display: "none" }}
            />
            {selectedFile && <span className="import-center__filePill">{selectedFile.name}</span>}
            {profiling && <span className="import-center__subtle">Inspecting workbook...</span>}
          </div>

          {profileError && (
            <div className="import-center__feedback import-center__feedback--error">{profileError}</div>
          )}

          {profile && (
            <div className="import-center__validation">
              <div className="import-center__validationStats">
                <div>
                  <span className="import-center__metricLabel">Rows detected</span>
                  <strong>{formatCount(profile.row_count)}</strong>
                </div>
                <div>
                  <span className="import-center__metricLabel">Sheet</span>
                  <strong>{profile.sheet_name}</strong>
                </div>
                <div>
                  <span className="import-center__metricLabel">Headers</span>
                  <strong>{formatCount(profile.header_count)}</strong>
                </div>
              </div>

              <div
                className={`import-center__recommendation ${
                  profile.blocked
                    ? "import-center__recommendation--blocked"
                    : profile.warnings.length
                      ? "import-center__recommendation--warning"
                      : "import-center__recommendation--ready"
                }`}
              >
                {profile.recommended_action}
              </div>

              <div className="import-center__comparison">
                <div>
                  <span className="import-center__metricLabel">Current live file</span>
                  <strong>{profile.current_file_name || "No live file yet"}</strong>
                </div>
                <div>
                  <span className="import-center__metricLabel">Comparison</span>
                  <strong>{rowDelta || "First live dataset or no row delta available."}</strong>
                </div>
              </div>

              {profile.warnings.length ? (
                <div className="import-center__warningList">
                  {profile.warnings.map((warning) => (
                    <div key={warning} className="import-center__warningItem">
                      {warning}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="import-center__feedback import-center__feedback--neutral">
                  No validation warnings. This file is ready for replacement.
                </div>
              )}

              {profile.warnings.length > 0 && !profile.blocked && (
                <label className="import-center__confirm">
                  <input
                    type="checkbox"
                    checked={confirmWarnings}
                    onChange={(event) => setConfirmWarnings(event.target.checked)}
                  />
                  I reviewed the warnings and want this file to replace the live dataset.
                </label>
              )}

              <div className="import-center__queueActions">
                <button
                  type="button"
                  className="import-center__primaryButton"
                  onClick={handleQueueImport}
                  disabled={
                    uploading ||
                    !canReplaceDataset ||
                    profile.blocked ||
                    (profile.warnings.length > 0 && !confirmWarnings)
                  }
                >
                  {uploading
                    ? "Queueing import..."
                    : profile.blocked
                      ? "Replacement blocked"
                      : profile.warnings.length
                        ? "Confirm and replace live dataset"
                        : "Queue replacement"}
                </button>
                <span className="import-center__subtle">
                  The request returns immediately. The job continues in the background.
                </span>
              </div>
            </div>
          )}
        </section>
      </div>

      <section className="import-center__panel import-center__panel--history">
        <div className="import-center__panelHead">
          <span className="import-center__panelEyebrow">Upload history</span>
          <span className="import-center__subtle">
            {hasRunningJob ? "Auto-refreshing while jobs are running" : "Latest jobs first"}
          </span>
        </div>

        {historyLoading ? (
          <div className="import-center__emptyState">Loading import history...</div>
        ) : historyItems.length ? (
          <div className="import-center__historyList">
            {historyItems.map((item) => {
              const statusMeta = STATUS_META[item.status] || STATUS_META.queued;
              return (
                <article key={item.import_job_id} className="import-center__historyItem">
                  <div className="import-center__historyTop">
                    <div>
                      <div className="import-center__historyName">{item.file_name}</div>
                      <div className="import-center__historyMeta">
                        <span>{formatCount(item.row_count)} rows</span>
                        <span>Queued {formatDateTime(item.created_at)}</span>
                        <span>{item.file_retained ? "Source file retained" : "Source file cleared"}</span>
                      </div>
                    </div>
                    <div className="import-center__historyBadges">
                      {item.is_current_dataset && (
                        <span className="import-center__status import-center__status--live">Current</span>
                      )}
                      <span className={`import-center__status import-center__status--${statusMeta.tone}`}>
                        {statusMeta.label}
                      </span>
                    </div>
                  </div>
                  {item.error_summary && (
                    <div className="import-center__feedback import-center__feedback--error">
                      {item.error_summary}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="import-center__emptyState">No imports have been recorded yet.</div>
        )}
      </section>

      {/* ===========================================================
          Sales transactions — parallel upload track.
          Backed by /api/imports/sales/* (parquet on disk).
          =========================================================== */}
      <div className="import-center__grid" style={{ marginTop: 24 }}>
        <section className="import-center__panel import-center__panel--current">
          <div className="import-center__panelHead">
            <span className="import-center__panelEyebrow">Sales report (current)</span>
            {salesStatus?.has_data ? (
              <span className="import-center__status import-center__status--success">Loaded</span>
            ) : (
              <span className="import-center__status import-center__status--queued">Empty</span>
            )}
          </div>
          {salesStatusError && (
            <div className="import-center__error" style={{ marginTop: 10 }}>
              {salesStatusError}
            </div>
          )}
          {salesStatus?.has_data && salesStatus.current ? (
            <div className="import-center__datasetMeta">
              <div className="import-center__datasetName">{salesStatus.current.file_name || "Sales transactions"}</div>
              <div className="import-center__datasetStats">
                <div>
                  <span className="import-center__panelEyebrow">Rows</span>
                  <strong>
                    {salesStatus.current.row_count != null
                      ? formatCount(salesStatus.current.row_count)
                      : "—"}
                  </strong>
                </div>
                <div>
                  <span className="import-center__panelEyebrow">Date range</span>
                  <strong>
                    {salesStatus.current.date_range?.from
                      ? `${salesStatus.current.date_range.from} → ${salesStatus.current.date_range.to || "?"}`
                      : "—"}
                  </strong>
                </div>
                <div>
                  <span className="import-center__panelEyebrow">Uploaded</span>
                  <strong>{formatDateTime(salesStatus.current.uploaded_at)}</strong>
                </div>
                {salesStatus.current.distinct_counts?.product_name != null && (
                  <div>
                    <span className="import-center__panelEyebrow">Distinct products</span>
                    <strong>{formatCount(salesStatus.current.distinct_counts.product_name)}</strong>
                  </div>
                )}
                {salesStatus.current.distinct_counts?.area != null && (
                  <div>
                    <span className="import-center__panelEyebrow">Distinct areas</span>
                    <strong>{formatCount(salesStatus.current.distinct_counts.area)}</strong>
                  </div>
                )}
              </div>
              <p className="import-center__datasetHint">
                Sales transactions are stored as Parquet on disk (does not consume Supabase quota).
                Replacing this file rebuilds the chat embedding index in the background so new
                product names become searchable within ~30 seconds.
              </p>
            </div>
          ) : (
            <div className="import-center__emptyState">
              No sales report uploaded yet. Upload a CSV / XLSX with at least these columns:
              <code> mobile, product_name, sub_total, date</code>.
            </div>
          )}
        </section>

        <section className="import-center__panel import-center__panel--upload">
          <div className="import-center__panelHead">
            <span className="import-center__panelEyebrow">Upload sales report</span>
            {!canReplaceDataset && (
              <span className="import-center__status import-center__status--processing">Read-only</span>
            )}
          </div>

          <p className="import-center__panelHint">
            Validate the next sales export. Same role rules as customer master uploads — only
            roles in {allowedRoles.join(", ") || "owner / ops"} can replace it.
          </p>

          <div className="import-center__uploadRow">
            <input
              ref={salesFileInputRef}
              type="file"
              accept=".csv,.tsv,.xlsx,.xls,.csv.gz"
              onChange={onSalesFileSelected}
              disabled={salesProfiling || salesUploading || !canReplaceDataset}
              style={{ display: "none" }}
            />
            <button
              type="button"
              className="import-center__primaryButton"
              onClick={() => salesFileInputRef.current?.click()}
              disabled={salesProfiling || salesUploading || !canReplaceDataset}
            >
              {salesProfiling ? "Inspecting..." : salesFile ? "Choose different file" : "Choose sales file"}
            </button>
            {salesFile && !salesProfiling && (
              <span className="import-center__uploadFile">{salesFile.name}</span>
            )}
          </div>

          {salesProfileError && (
            <div className="import-center__error">{salesProfileError}</div>
          )}

          {salesProfile && (
            <div className="import-center__profile">
              <div className="import-center__profileGrid">
                <div>
                  <span className="import-center__panelEyebrow">Rows in file</span>
                  <strong>{formatCount(salesProfile.row_count)}</strong>
                </div>
                <div>
                  <span className="import-center__panelEyebrow">Date range</span>
                  <strong>
                    {salesProfile.date_range?.from
                      ? `${salesProfile.date_range.from} → ${salesProfile.date_range.to || "?"}`
                      : "—"}
                  </strong>
                </div>
                <div>
                  <span className="import-center__panelEyebrow">Required columns matched</span>
                  <strong>{(salesProfile.columns_matched || []).length} / 4</strong>
                </div>
                <div>
                  <span className="import-center__panelEyebrow">Distinct products</span>
                  <strong>
                    {salesProfile.distinct_counts?.product_name != null
                      ? formatCount(salesProfile.distinct_counts.product_name)
                      : "—"}
                  </strong>
                </div>
              </div>

              {salesProfile.blocked && (salesProfile.missing_required || []).length > 0 && (
                <div className="import-center__error">
                  Cannot replace: missing required columns ({salesProfile.missing_required.join(", ")}).
                </div>
              )}

              {(salesProfile.warnings || []).length > 0 && (
                <ul className="import-center__warnings">
                  {salesProfile.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}

              {(salesProfile.warnings || []).length > 0 && !salesProfile.blocked && (
                <label className="import-center__confirm">
                  <input
                    type="checkbox"
                    checked={salesConfirmWarnings}
                    onChange={(e) => setSalesConfirmWarnings(e.target.checked)}
                  />
                  I have reviewed the warnings above and want to proceed.
                </label>
              )}

              <div className="import-center__uploadActions">
                <button
                  type="button"
                  className="import-center__primaryButton"
                  onClick={handleCommitSales}
                  disabled={
                    salesUploading ||
                    salesProfile.blocked ||
                    !canReplaceDataset ||
                    ((salesProfile.warnings || []).length > 0 && !salesConfirmWarnings)
                  }
                >
                  {salesUploading ? "Replacing..." : "Replace sales report"}
                </button>
                <button
                  type="button"
                  className="import-center__ghostButton"
                  onClick={() => {
                    setSalesFile(null);
                    setSalesProfile(null);
                    setSalesProfileError("");
                    setSalesConfirmWarnings(false);
                  }}
                  disabled={salesUploading}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {salesNotice && (
            <div className="import-center__notice">{salesNotice}</div>
          )}
        </section>
      </div>
    </div>
  );
}
