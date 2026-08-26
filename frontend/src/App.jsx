import React, { useState } from 'react';
import OperatorDashboard from './components/OperatorDashboard';
import ReviewerDashboard from './components/ReviewerDashboard';
import ConsumerDashboard from './components/ConsumerDashboard';
import AuditTrailModal from './components/AuditTrailModal';
import LoanDetailModal from './components/LoanDetailModal';
import {
  Shield,
  Layers,
  UserCheck,
  BarChart3,
  Sparkles,
  Lock,
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('operator'); // "operator" | "reviewer" | "consumer"
  const [selectedLoanId, setSelectedLoanId] = useState(null);
  const [auditLoanId, setAuditLoanId] = useState(null);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Main Navigation Bar */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo & Project Title */}
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-xl shadow-lg shadow-blue-600/30 text-white">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight flex items-center space-x-2">
                <span>Loan Data Verification Copilot</span>
                <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-blue-950 text-blue-400 border border-blue-800">
                  v1.0 Hackathon
                </span>
              </h1>
              <p className="text-[11px] text-slate-400">
                Full-Stack Lineage, AI Validation & Cryptographic Attestation Platform
              </p>
            </div>
          </div>

          {/* Role Navigation Tabs */}
          <nav className="flex items-center space-x-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('operator')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'operator'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Operator (7a)</span>
            </button>

            <button
              onClick={() => setActiveTab('reviewer')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'reviewer'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Reviewer (7b)</span>
            </button>

            <button
              onClick={() => setActiveTab('consumer')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'consumer'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Consumer (7c)</span>
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        {activeTab === 'operator' && (
          <OperatorDashboard
            onSelectLoan={(id) => setSelectedLoanId(id)}
            onOpenAudit={(id) => setAuditLoanId(id)}
          />
        )}

        {activeTab === 'reviewer' && (
          <ReviewerDashboard
            onSelectLoan={(id) => setSelectedLoanId(id)}
            onOpenAudit={(id) => setAuditLoanId(id)}
          />
        )}

        {activeTab === 'consumer' && (
          <ConsumerDashboard
            onSelectLoan={(id) => setSelectedLoanId(id)}
            onOpenAudit={(id) => setAuditLoanId(id)}
          />
        )}
      </main>

      {/* Modals */}
      {selectedLoanId && (
        <LoanDetailModal
          loanId={selectedLoanId}
          onClose={() => setSelectedLoanId(null)}
          onOpenAudit={(id) => {
            setSelectedLoanId(null);
            setAuditLoanId(id);
          }}
        />
      )}

      {auditLoanId && (
        <AuditTrailModal
          loanId={auditLoanId}
          onClose={() => setAuditLoanId(null)}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-4 text-center text-xs text-slate-500">
        Loan Data Verification Copilot • SQLite & Prisma ORM • Anthropic Claude 3.5 Sonnet • SHA-256 Immutability Engine
      </footer>
    </div>
  );
}
