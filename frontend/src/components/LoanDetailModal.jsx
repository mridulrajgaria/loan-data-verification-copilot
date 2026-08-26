import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { X, FileCode, CheckCircle, AlertTriangle, ShieldCheck, User, Database, Loader2 } from 'lucide-react';

export default function LoanDetailModal({ loanId, onClose, onOpenAudit }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loan, setLoan] = useState(null);

  useEffect(() => {
    if (!loanId) return;
    setLoading(true);
    setError(null);
    api.getLoanDetail(loanId)
      .then((res) => setLoan(res.data))
      .catch((err) => setError(err.message || 'Failed to fetch loan details.'))
      .finally(() => setLoading(false));
  }, [loanId]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-lg flex items-center space-x-2">
                <span>Loan Provenance & Integrity View</span>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800">
                  {loan?.loanIdentifier || loanId}
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Uploaded via: <span className="text-slate-300 font-mono">{loan?.rawUpload?.filename}</span> • Status: <strong className="text-white">{loan?.status}</strong>
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {onOpenAudit && (
              <button
                onClick={() => onOpenAudit(loanId)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 rounded-lg border border-slate-700 transition-colors"
              >
                View Audit Trail
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-3" />
              <p className="text-sm">Loading normalized entity and provenance records...</p>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-950/50 border border-red-800 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}

          {!loading && !error && loan && (
            <>
              {/* Grid of Normalized Values */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                  Normalized Underwriting Fields
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800 text-xs">
                  <div>
                    <span className="text-slate-500 block">Original Principal</span>
                    <strong className="text-slate-200 text-sm">${loan.originalPrincipal?.toLocaleString() ?? '—'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Current Balance</span>
                    <strong className="text-slate-200 text-sm">${loan.currentBalance?.toLocaleString() ?? '—'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Interest Rate</span>
                    <strong className="text-slate-200 text-sm">{loan.interestRate ? `${loan.interestRate}%` : '—'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Loan Type</span>
                    <strong className="text-slate-200 text-sm">{loan.loanType || '—'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Borrower ID / Name</span>
                    <strong className="text-slate-200">{loan.borrowerId || loan.borrowerName || '—'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Borrower State</span>
                    <strong className="text-slate-200">{loan.borrowerState || '—'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Payment Status</span>
                    <strong className="text-slate-200">{loan.paymentStatus || '—'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Days Past Due (DPD)</span>
                    <strong className="text-slate-200">{loan.daysPastDue ?? '—'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Origination Date</span>
                    <strong className="text-slate-200">{loan.originationDate ? new Date(loan.originationDate).toISOString().split('T')[0] : '—'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Maturity Date</span>
                    <strong className="text-slate-200">{loan.maturityDate ? new Date(loan.maturityDate).toISOString().split('T')[0] : '—'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Document Custody</span>
                    <strong className="text-slate-200">{loan.documentStatus || '—'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Record Version</span>
                    <strong className="text-slate-200 font-mono">v{loan.currentVersion}</strong>
                  </div>
                </div>
              </div>

              {/* Source-of-Truth Raw CSV Row Lineage */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center space-x-2">
                  <FileCode className="w-4 h-4 text-blue-400" />
                  <span>Immutable Source-Of-Truth Raw CSV Row (Row #{loan.rawLoanRecord?.rowNumber})</span>
                </h4>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-xs text-slate-300 overflow-x-auto">
                  <pre className="whitespace-pre-wrap">
                    {loan.rawLoanRecord?.rawContent ? JSON.stringify(JSON.parse(loan.rawLoanRecord.rawContent), null, 2) : 'No raw record content available.'}
                  </pre>
                </div>
              </div>

              {/* Open Exceptions */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span>Validation Exceptions ({loan.exceptions?.length || 0})</span>
                </h4>
                {loan.exceptions?.length === 0 ? (
                  <div className="p-3 bg-emerald-950/30 border border-emerald-800/40 rounded-lg text-xs text-emerald-300 flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4" />
                    <span>No open validation violations on this loan.</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {loan.exceptions.map((e) => (
                      <div key={e.id} className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-white">{e.rule?.name || e.rule?.ruleCode}</span>
                          <span className={`badge-${e.severity?.toLowerCase() || 'high'}`}>{e.severity}</span>
                        </div>
                        <p className="text-slate-400">
                          {e.details ? JSON.parse(e.details).message : 'Validation rule flagged.'}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Cryptographic Verification State */}
              {loan.verifiedLoan && (
                <div className="p-4 bg-emerald-950/20 border border-emerald-800/50 rounded-xl">
                  <div className="flex items-center space-x-2 mb-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                    <h4 className="text-sm font-semibold text-emerald-300">Cryptographically Locked & Verified</h4>
                  </div>
                  <div className="text-xs text-slate-300 space-y-1 font-mono">
                    <p>SHA-256 Hash: <strong className="text-emerald-400 break-all">{loan.verifiedLoan.recordHash}</strong></p>
                    <p>Verified At: {new Date(loan.verifiedLoan.verifiedAt).toLocaleString()}</p>
                    <p>Verified By: {loan.verifiedLoan.verifiedByUser?.name || loan.verifiedLoan.verifiedByUserId}</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
