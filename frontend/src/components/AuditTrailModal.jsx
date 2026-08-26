import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { X, Clock, ShieldCheck, FileText, AlertCircle, Sparkles, UserCheck, ArrowRight, Loader2 } from 'lucide-react';

export default function AuditTrailModal({ loanId, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [auditData, setAuditData] = useState(null);

  useEffect(() => {
    if (!loanId) return;
    setLoading(true);
    setError(null);
    api.getLoanAuditTrail(loanId)
      .then((res) => setAuditData(res.data))
      .catch((err) => setError(err.message || 'Failed to load audit trail.'))
      .finally(() => setLoading(false));
  }, [loanId]);

  const getActionIcon = (actionType) => {
    switch (actionType) {
      case 'UPLOAD':
      case 'IMPORT':
        return <FileText className="w-4 h-4 text-blue-400" />;
      case 'VALIDATE':
      case 'EXCEPTION_CREATED':
        return <AlertCircle className="w-4 h-4 text-amber-400" />;
      case 'AI_SUGGESTION_GENERATED':
        return <Sparkles className="w-4 h-4 text-purple-400" />;
      case 'MANUAL_EDIT':
      case 'ACCEPT_AI_FIX':
      case 'OVERRIDE_APPROVE':
      case 'REJECT':
        return <UserCheck className="w-4 h-4 text-emerald-400" />;
      case 'VERIFIED':
        return <ShieldCheck className="w-4 h-4 text-emerald-300" />;
      default:
        return <Clock className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-400">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-lg">
                Immutable Audit Trail Timeline
              </h3>
              <p className="text-xs text-slate-400">
                Full lifecycle provenance for Loan: <span className="font-mono text-blue-400 font-bold">{auditData?.loanIdentifier || loanId}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-3" />
              <p className="text-sm">Fetching chronological ledger events...</p>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-950/50 border border-red-800 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}

          {!loading && !error && auditData?.timeline?.length === 0 && (
            <p className="text-center text-slate-500 py-8">No audit events recorded for this loan.</p>
          )}

          {!loading && !error && auditData?.timeline && (
            <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-800">
              {auditData.timeline.map((event, idx) => (
                <div key={event.id || idx} className="relative group">
                  {/* Timeline dot */}
                  <div className="absolute -left-6 top-1.5 w-6 h-6 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center group-hover:border-blue-500 transition-colors">
                    {getActionIcon(event.actionType)}
                  </div>

                  <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-4 hover:border-slate-700 transition-all">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-semibold text-white tracking-wide uppercase px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700">
                        {event.actionType}
                      </span>
                      <span className="text-slate-400 font-mono">
                        {new Date(event.timestamp).toLocaleString()}
                      </span>
                    </div>

                    <div className="text-xs text-slate-400 mb-2 flex items-center space-x-2">
                      <span>Actor: <strong className="text-slate-300 font-mono">{event.actor}</strong></span>
                      <span>•</span>
                      <span>Entity: <strong className="text-slate-300">{event.entityType}:{event.entityId?.slice(0, 8)}...</strong></span>
                    </div>

                    {event.details && (
                      <div className="bg-slate-900/80 rounded p-2.5 font-mono text-xs text-slate-300 overflow-x-auto border border-slate-800/60">
                        {typeof event.details === 'object' ? (
                          <pre className="whitespace-pre-wrap">{JSON.stringify(event.details, null, 2)}</pre>
                        ) : (
                          <span>{event.details}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            Close Timeline
          </button>
        </div>
      </div>
    </div>
  );
}
