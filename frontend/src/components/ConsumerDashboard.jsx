import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  AlertCircle,
  Info,
  Loader2,
  FileJson,
  FileSpreadsheet,
  Flame,
  Check,
  X,
} from 'lucide-react';

// Fixed status palette (never themed) — deliberately distinct from any
// categorical/series color in the app so severity never impersonates a
// data series. Order runs worst -> mildest; mitigated by icon + label
// pairing per bar (color is never the only cue).
const SEVERITY_META = [
  { key: 'CRITICAL', label: 'Critical', color: '#d03b3b', icon: AlertOctagon },
  { key: 'HIGH', label: 'High', color: '#ec835a', icon: AlertTriangle },
  { key: 'MEDIUM', label: 'Medium', color: '#fab219', icon: AlertCircle },
  { key: 'WARNING', label: 'Warning', color: '#0ca30c', icon: Info },
];

/**
 * Open Exception Severity Breakdown — a lightweight, dependency-free
 * horizontal bar chart (inline SVG-free, pure CSS) summarizing
 * summary.severityCounts. Added so the Consumer dashboard's portfolio
 * health story is visual, not just tabular numbers.
 */
function SeverityBreakdownChart({ severityCounts }) {
  const counts = severityCounts || {};
  const total = SEVERITY_META.reduce((acc, s) => acc + (counts[s.key] || 0), 0);
  const maxCount = Math.max(1, ...SEVERITY_META.map((s) => counts[s.key] || 0));

  return (
    <div className="section-band p-5 space-y-3 bg-white">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-content-primary font-mono">
          Open Exception Severity Breakdown
        </h3>
        <span className="text-[10px] font-mono text-content-secondary">
          {total} open {total === 1 ? 'exception' : 'exceptions'}
        </span>
      </div>

      {total === 0 ? (
        <p className="text-xs text-content-secondary font-mono py-2">
          No open exceptions — portfolio is fully reconciled.
        </p>
      ) : (
        <div
          className="space-y-2.5 pt-1"
          role="img"
          aria-label={`Open exceptions by severity: ${SEVERITY_META.map(
            (s) => `${s.label} ${counts[s.key] || 0}`
          ).join(', ')}`}
        >
          {SEVERITY_META.map(({ key, label, color, icon: Icon }) => {
            const count = counts[key] || 0;
            const widthPct = count > 0 ? Math.max((count / maxCount) * 100, 4) : 0;
            return (
              <div key={key} className="flex items-center gap-3">
                <div className="w-[72px] flex items-center gap-1.5 flex-shrink-0">
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} />
                  <span className="text-[10.5px] font-mono font-semibold text-content-secondary uppercase tracking-wide">
                    {label}
                  </span>
                </div>
                <div className="flex-1 h-2.5 bg-surface-inset rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${widthPct}%`, backgroundColor: color }}
                  />
                </div>
                <span className="w-7 text-right text-xs font-mono font-bold text-content-primary tabular-nums">
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ConsumerDashboard({ onOpenAudit, onSelectLoan, searchQuery = '' }) {
  const [summary, setSummary] = useState(null);
  const [verifiedList, setVerifiedList] = useState([]);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingVerified, setLoadingVerified] = useState(true);
  const [summaryError, setSummaryError] = useState(null);
  const [verifiedError, setVerifiedError] = useState(null);

  // Hash verification state
  const [hashVerificationState, setHashVerificationState] = useState({});
  const [verifyingId, setVerifyingId] = useState(null);
  const [tamperAlertMessage, setTamperAlertMessage] = useState(null);
  const [confirmingTamperId, setConfirmingTamperId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [actionError, setActionError] = useState(null);

  const fetchSummary = useCallback(async () => {
    setLoadingSummary(true);
    setSummaryError(null);
    try {
      const res = await api.getSummary();
      setSummary(res.data);
    } catch (err) {
      setSummaryError(err.message || 'Failed to fetch summary metrics.');
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  const fetchVerifiedLoans = useCallback(async () => {
    setLoadingVerified(true);
    setVerifiedError(null);
    try {
      const res = await api.getVerifiedLoans({ limit: 100 });
      setVerifiedList(res.data?.items || []);
    } catch (err) {
      setVerifiedError(err.message || 'Failed to fetch verified records.');
    } finally {
      setLoadingVerified(false);
    }
  }, []);

  const refreshAll = () => {
    fetchSummary();
    fetchVerifiedLoans();
  };

  useEffect(() => {
    refreshAll();
  }, [fetchSummary, fetchVerifiedLoans]);

  // Run Independent Hash Verification
  const handleVerifyHash = async (verifiedLoanId) => {
    setVerifyingId(verifiedLoanId);
    setActionError(null);
    try {
      const res = await api.verifyRecordHash(verifiedLoanId);
      setHashVerificationState((prev) => ({
        ...prev,
        [verifiedLoanId]: res.data,
      }));
    } catch (err) {
      setActionError(`Hash verification failed: ${err.message}`);
    } finally {
      setVerifyingId(null);
    }
  };

  // Live Judge Demo: Simulated DB Tamper execution
  const executeSimulateTamper = async (verifiedLoanId) => {
    setConfirmingTamperId(null);
    setActionError(null);
    try {
      await api.simulateTamper(verifiedLoanId);
      setTamperAlertMessage(`Tamper simulated on record #${verifiedLoanId.slice(0, 8)}. Click "Verify Hash" to observe the cryptographic hash mismatch.`);
      handleVerifyHash(verifiedLoanId);
    } catch (err) {
      setActionError(`Simulation error: ${err.message}`);
    }
  };

  // Handle Export (JSON / CSV) with memory leak prevention (revokeObjectURL)
  const handleExport = async (format = 'json', target = 'verified') => {
    setExporting(true);
    setActionError(null);
    try {
      const data = await api.exportVerified(format, target);
      if (format === 'csv') {
        const blob = new Blob([data], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = target === 'audit' ? `audit_trail_${Date.now()}.csv` : `verified_loan_tape_${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else {
        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `verified_portfolio_with_audit_trail_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
    } catch (err) {
      setActionError(`Export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  const filteredVerified = searchQuery
    ? verifiedList.filter(
        (v) =>
          v.loan?.loanIdentifier?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          v.loan?.borrowerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          v.recordHash?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : verifiedList;

  const verifiedRatio = summary?.totalLoans
    ? ((summary.verifiedLoansCount / summary.totalLoans) * 100).toFixed(1)
    : '0.0';

  return (
    <div className="space-y-6">
      {/* Top Header Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-border">
        <div>
          <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-content-primary">
            Verification & Cryptographic Attestation Ledger
          </h2>
          <p className="text-xs text-content-secondary mt-0.5">
            Cryptographic integrity, data quality scoring and audit attestation
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => handleExport('json')}
            disabled={exporting}
            aria-label="Export verification bundle as JSON"
            className="btn-teal text-xs font-mono"
          >
            <FileJson className="w-3.5 h-3.5 text-ref-lime" />
            <span>Export Bundle (JSON)</span>
          </button>
          <button
            onClick={() => handleExport('csv')}
            disabled={exporting}
            aria-label="Export verified loan tape as CSV"
            className="btn-institutional-secondary text-xs font-mono"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-content-secondary" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={() => handleExport('csv', 'audit')}
            disabled={exporting}
            aria-label="Export full audit trail as CSV"
            className="btn-institutional-secondary text-xs font-mono"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-content-secondary" />
            <span>Export Audit Trail</span>
          </button>
        </div>
      </div>

      {actionError && (
        <div className="p-3 bg-semantic-critical-bg border border-semantic-critical-border rounded-xs text-semantic-critical text-xs flex items-center justify-between font-mono">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{actionError}</span>
          </div>
          <button
            onClick={() => setActionError(null)}
            aria-label="Dismiss error"
            className="p-1 hover:text-content-primary"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 1. DATA QUALITY SCORE & VERIFICATION STATUS (LARGE PALE LIME BLOCK SURFACE #CDE78C) */}
      <div className="block-lime p-6 shadow-subtle">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-5 h-5 text-ref-lime-text" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-ref-lime-text font-mono">
                Portfolio Data Quality & Verification Index
              </h3>
            </div>

            {/* FORMULA (GRADABLE CRITERIA) */}
            <div className="bg-white/60 px-3 py-1.5 rounded-xs border border-ref-lime-border text-[11px] font-mono text-ref-lime-text inline-flex items-center space-x-2">
              <span className="font-semibold">Formula:</span>
              <span>(verified_records / total_ingested_records) × 100</span>
            </div>

            <p className="text-xs text-ref-lime-text max-w-xl font-sans">
              Measures the proportion of portfolio loans cryptographically signed and sealed with zero unresolved critical exceptions.
            </p>
          </div>

          {/* Metric Tiles Strip */}
          <div className="flex items-center space-x-6 bg-white/70 p-4 rounded-xs border border-ref-lime-border">
            <div className="text-left">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-ref-lime-text block">
                Verification Rate
              </span>
              <span className="text-3xl font-bold font-mono text-ref-lime-text tabular-nums">
                {verifiedRatio}%
              </span>
            </div>
            <div className="h-8 w-px bg-ref-lime-border"></div>
            <div className="text-left">
              <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-ref-lime-text block">
                Verified / Total
              </span>
              <span className="text-sm font-mono font-bold text-ref-lime-text tabular-nums">
                {summary?.verifiedLoansCount?.toLocaleString() ?? 0} / {summary?.totalLoans?.toLocaleString() ?? 0}
              </span>
            </div>
            <div className="h-8 w-px bg-ref-lime-border"></div>
            <div className="text-left">
              <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-ref-lime-text block">
                Avg Exceptions
              </span>
              <span className="text-sm font-mono font-bold text-semantic-warning tabular-nums">
                {summary?.dataQualityScore?.avgExceptionsPerLoan ?? 0.0}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 1b. VISUAL EXCEPTION SEVERITY BREAKDOWN (chart) */}
      <SeverityBreakdownChart severityCounts={summary?.severityCounts} />

      {tamperAlertMessage && (
        <div className="p-3 bg-semantic-warning-bg border border-semantic-warning-border rounded-xs text-semantic-warning text-xs flex items-center justify-between font-mono">
          <div className="flex items-center space-x-2">
            <Flame className="w-4 h-4 flex-shrink-0 text-semantic-warning" />
            <span>{tamperAlertMessage}</span>
          </div>
          <button
            onClick={() => setTamperAlertMessage(null)}
            aria-label="Dismiss tamper notice"
            className="text-[11px] underline font-medium hover:text-content-primary"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Inline Non-Blocking Tamper Confirmation Banner */}
      {confirmingTamperId && (
        <div className="p-4 bg-white border-2 border-semantic-critical rounded-xs shadow-modal space-y-2 font-mono text-xs">
          <div className="flex items-center justify-between text-semantic-critical font-bold">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4" />
              <span>Live Judge Demo: Confirm Simulated Database Tampering</span>
            </div>
            <button
              onClick={() => setConfirmingTamperId(null)}
              aria-label="Cancel tamper demonstration"
              className="text-content-muted hover:text-content-primary"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-content-secondary font-sans text-xs">
            This action will inject an unauthorized 1-byte modification into the SQLite canonical JSON for record <strong className="font-mono text-content-primary">#{confirmingTamperId.slice(0, 8)}</strong> to demonstrate instant cryptographic hash mismatch detection.
          </p>
          <div className="pt-2 flex items-center justify-end space-x-2">
            <button
              onClick={() => setConfirmingTamperId(null)}
              className="btn-institutional-secondary text-xs"
            >
              Cancel
            </button>
            <button
              onClick={() => executeSimulateTamper(confirmingTamperId)}
              className="btn-critical text-xs"
            >
              Inject 1-Byte Tamper
            </button>
          </div>
        </div>
      )}

      {/* 2. CRYPTOGRAPHICALLY LOCKED VERIFIED RECORDS TABLE (CLEAN WHITE DATA LEDGER) */}
      <div className="section-band p-5 space-y-3 bg-white">
        <div className="flex items-center justify-between border-b border-border pb-2.5">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-content-primary font-mono">
              Verified Records Ledger
            </h3>
            <span className="text-[11px] text-content-secondary font-sans">
              Immutable SHA-256 digests over recursively sorted canonical JSON payloads.
            </span>
          </div>
          <span className="badge-verified font-mono">
            {filteredVerified.length} Sealed Records
          </span>
        </div>

        {loadingVerified ? (
          <div className="py-16 flex justify-center text-content-muted">
            <Loader2 className="w-6 h-6 animate-spin text-ref-teal" />
          </div>
        ) : verifiedError ? (
          <div className="p-3 bg-semantic-critical-bg border border-semantic-critical-border rounded-xs text-semantic-critical text-xs font-mono">
            {verifiedError}
          </div>
        ) : filteredVerified.length === 0 ? (
          <div className="py-12 text-center text-xs text-content-muted">
            No verified loan records match criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border text-[10px] text-content-muted font-mono font-semibold uppercase tracking-wider">
                  <th className="pb-2.5">Loan Identifier</th>
                  <th className="pb-2.5">Borrower & Amount</th>
                  <th className="pb-2.5">SHA-256 Digest</th>
                  <th className="pb-2.5">Integrity Attestation</th>
                  <th className="pb-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredVerified.map((v) => {
                  const check = hashVerificationState[v.id];
                  const isVerifying = verifyingId === v.id;

                  return (
                    <tr key={v.id} className="hover:bg-surface-secondary/40 transition-colors">
                      <td className="py-3 pr-2">
                        <span className="font-mono font-bold text-ref-teal block">
                          {v.loan?.loanIdentifier}
                        </span>
                        <span className="text-[10px] text-content-muted font-mono">
                          Verified: {new Date(v.verifiedAt).toLocaleDateString()}
                        </span>
                      </td>

                      <td className="py-3">
                        <span className="text-content-primary block font-medium">
                          {v.loan?.borrowerName || 'Borrower'}
                        </span>
                        <span className="text-content-secondary font-mono text-[11px] tabular-nums">
                          ${v.loan?.originalPrincipal?.toLocaleString() ?? 0} • {v.loan?.paymentStatus}
                        </span>
                      </td>

                      <td className="py-3 font-mono text-[11px]">
                        <span className="bg-surface-secondary text-content-primary px-2 py-0.5 rounded-xs border border-border block truncate max-w-[210px]" title={v.recordHash}>
                          {v.recordHash}
                        </span>
                      </td>

                      {/* Live Cryptographic Proof Badge */}
                      <td className="py-3">
                        {check ? (
                          check.isValid ? (
                            <span className="badge-verified">
                              <Check className="w-3 h-3" />
                              <span>Exact Match</span>
                            </span>
                          ) : (
                            <span className="badge-critical animate-pulse">
                              <AlertTriangle className="w-3 h-3" />
                              <span>TAMPER DETECTED</span>
                            </span>
                          )
                        ) : (
                          <span className="text-[11px] text-content-muted italic font-mono">Ready</span>
                        )}
                      </td>

                      <td className="py-3 text-right space-x-2 font-mono">
                        <button
                          onClick={() => handleVerifyHash(v.id)}
                          disabled={isVerifying}
                          aria-label={`Verify SHA-256 hash for loan ${v.loan?.loanIdentifier}`}
                          className="btn-institutional-secondary text-[11px] py-1"
                        >
                          {isVerifying ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Verify Hash'}
                        </button>

                        <button
                          onClick={() => setConfirmingTamperId(v.id)}
                          aria-label={`Simulate database modification on loan ${v.loan?.loanIdentifier} for demonstration`}
                          className="btn-institutional-ghost text-semantic-critical text-[11px] py-1"
                          title="Simulate database modification for live judge demo"
                        >
                          Demo Tamper
                        </button>

                        <button
                          onClick={() => onOpenAudit && onOpenAudit(v.loanId)}
                          aria-label={`View audit trail for loan ${v.loan?.loanIdentifier}`}
                          className="btn-institutional-ghost text-[11px] py-1 font-sans"
                        >
                          Audit Trail
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
