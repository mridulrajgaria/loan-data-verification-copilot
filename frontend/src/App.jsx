import React, { useState } from 'react';
import OperatorDashboard from './components/OperatorDashboard';
import ReviewerDashboard from './components/ReviewerDashboard';
import ConsumerDashboard from './components/ConsumerDashboard';
import AuditTrailModal from './components/AuditTrailModal';
import LoanDetailModal from './components/LoanDetailModal';
import { api } from './api';
import {
  Shield,
  Layers,
  FileCheck2,
  Search,
  Menu,
  X,
  ChevronRight,
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('reviewer'); // default to underwriter reviewer workspace
  const [selectedLoanId, setSelectedLoanId] = useState(null);
  const [auditLoanId, setAuditLoanId] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');

  // Three Demo Personas per Challenge Specification
  const personas = {
    operator: {
      name: 'Elena Rostova',
      title: 'Data Operations Specialist',
      role: 'OPERATOR',
      userId: 'usr-operator-01',
      initials: 'ER',
    },
    reviewer: {
      name: 'David Chen',
      title: 'Senior Underwriter',
      role: 'REVIEWER',
      userId: 'usr-reviewer-01',
      initials: 'DC',
    },
    consumer: {
      name: 'Marcus Lee',
      title: 'Verification Auditor',
      role: 'AUDITOR',
      userId: 'usr-auditor-01',
      initials: 'ML',
    },
  };

  const currentPersona = personas[activeTab] || personas.reviewer;

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    const persona = personas[tabId] || personas.reviewer;
    api.setAuthUser(persona.userId, persona.role);
  };

  const navItems = [
    { id: 'operator', label: '01. DATA OPERATIONS', icon: Layers, descriptor: 'Ingestion & tape lineage' },
    { id: 'reviewer', label: '02. UNDERWRITING REVIEW', icon: FileCheck2, descriptor: 'Exception adjudication' },
    { id: 'consumer', label: '03. VERIFICATION PORTAL', icon: Shield, descriptor: 'Cryptographic attestation' },
  ];

  const getPageTitle = () => {
    switch (activeTab) {
      case 'operator':
        return { title: 'Data Control Room', subtitle: 'Loan tape ingestion, validation rule metrics and source lineage' };
      case 'reviewer':
        return { title: 'Underwriting Review Workspace', subtitle: 'Adjudicate flagged tape anomalies, inspect forensic discrepancies, and execute binding decisions' };
      case 'consumer':
        return { title: 'Verification Portal', subtitle: 'Cryptographic integrity, data quality scoring and audit attestation' };
      default:
        return { title: 'Loan Verification Copilot', subtitle: 'Institutional Underwriting Verification System' };
    }
  };

  const activeMeta = getPageTitle();

  return (
    <div className="min-h-screen bg-[#E7EFE5] flex flex-col lg:flex-row text-[#131D1B] font-sans antialiased">
      {/* 1. DESKTOP LEFT SIDEBAR */}
      <aside className="hidden lg:flex lg:flex-col w-64 border-r border-[#CDD7CB] bg-white flex-shrink-0 justify-between">
        <div className="flex flex-col">
          {/* Institutional Anchor Header (Deep Teal Anchor) */}
          <div className="h-16 border-b border-[#163B39] px-5 flex items-center justify-between bg-[#204E4C] text-white">
            <div className="flex items-center space-x-2.5">
              <div className="w-7 h-7 bg-[#CDE78C] rounded-md flex items-center justify-center text-[#204E4C]">
                <Shield className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold tracking-tight block leading-none font-mono text-white">
                  INTAIN
                </span>
                <span className="text-[9.5px] uppercase font-bold tracking-wider text-[#CDE78C] block mt-0.5 font-mono">
                  LOAN VERIFICATION
                </span>
              </div>
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-[#CDE78C] text-[#204E4C]">
              v1.0
            </span>
          </div>

          {/* Navigation Links (Matches FinFox Lime Pill Active State) */}
          <div className="p-3 space-y-2">
            <div className="px-2 pt-3 pb-1 text-[10px] font-mono font-bold uppercase tracking-wider text-[#768883]">
              Workspaces
            </div>

            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleTabChange(item.id)}
                  style={{
                    backgroundColor: isActive ? '#CDE78C' : 'transparent',
                    color: isActive ? '#1C3806' : '#495B56',
                    borderColor: isActive ? '#B3D463' : 'transparent',
                  }}
                  className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-left transition-all border ${
                    isActive
                      ? 'font-bold shadow-subtle'
                      : 'hover:bg-[#E2E9E0] hover:text-[#131D1B]'
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" style={{ color: isActive ? '#1C3806' : '#768883' }} />
                  <div className="flex-1 truncate">
                    <div className="text-xs font-mono tracking-tight leading-none font-bold">
                      {item.label}
                    </div>
                    <div
                      className="text-[11px] mt-1 leading-none font-normal font-sans"
                      style={{ color: isActive ? '#2A5208' : '#768883' }}
                    >
                      {item.descriptor}
                    </div>
                  </div>
                  {isActive && <ChevronRight className="w-4 h-4" style={{ color: '#1C3806' }} />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sidebar Footer: Active Demo Persona & System Status */}
        <div className="border-t border-[#CDD7CB] p-3.5 bg-[#F4F8F3] space-y-2.5">
          {/* Operational Status */}
          <div className="flex items-center justify-between text-xs px-0.5">
            <span className="flex items-center space-x-1.5 text-[11px] text-[#495B56] font-medium font-sans">
              <span className="w-2 h-2 rounded-full bg-[#087443]"></span>
              <span>Verification Engine</span>
            </span>
            <span className="text-[10px] font-mono font-bold text-[#204E4C] bg-white px-2 py-0.5 rounded-md border border-[#CDD7CB]">
              READY
            </span>
          </div>

          {/* Dynamic User Persona Card */}
          <div className="pt-2 border-t border-[#CDD7CB] flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 rounded-md bg-[#204E4C] text-white flex items-center justify-center text-xs font-bold font-mono">
                {currentPersona.initials}
              </div>
              <div className="truncate">
                <div className="text-xs font-bold text-[#131D1B] truncate">{currentPersona.name}</div>
                <div className="text-[9.5px] text-[#768883] uppercase tracking-wider font-mono">{currentPersona.title}</div>
              </div>
            </div>
            <span className="text-[9.5px] font-mono font-bold text-[#204E4C] bg-[#E2ECEB] px-1.5 py-0.5 rounded-md border border-[#9BB8B6]">
              {currentPersona.role}
            </span>
          </div>
        </div>
      </aside>

      {/* 2. MAIN APPLICATION CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Utility Header */}
        <header className="h-16 border-b border-[#CDD7CB] bg-white px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 flex-shrink-0 shadow-subtle">
          {/* Left: Mobile Menu & Title */}
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              className="lg:hidden p-1.5 text-[#495B56] hover:text-[#131D1B] rounded-md hover:bg-[#E2E9E0]"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <div className="hidden sm:flex items-center space-x-2 text-xs text-[#768883] font-mono">
              <span className="font-bold text-[#204E4C]">Intain Copilot</span>
              <span>/</span>
              <span className="capitalize font-sans font-semibold text-[#131D1B]">{activeTab}</span>
            </div>
          </div>

          {/* Center: Global Search Bar */}
          <div className="flex-1 max-w-md mx-4 hidden md:block">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#768883]" />
              <input
                type="text"
                placeholder="Search loan ID, borrower, exception..."
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                aria-label="Search loan ID, borrower, or exception"
                className="w-full bg-[#F4F8F3] border border-[#CDD7CB] rounded-md pl-9 pr-3 py-1.5 text-xs text-[#131D1B] placeholder:text-[#768883] focus:outline-none focus:bg-white focus:border-[#204E4C] focus:ring-2 focus:ring-[#204E4C]/10 transition-all font-sans"
              />
            </div>
          </div>

          {/* Right: Explicit High-Contrast Role Switcher */}
          <div className="flex items-center space-x-3">
            {/* Segmented Workspace Role Switcher (Guaranteed Visible Contrast) */}
            <div className="flex items-center bg-[#E2E9E0] p-1 rounded-lg border border-[#CDD7CB] text-xs">
              <button
                onClick={() => handleTabChange('operator')}
                style={{
                  backgroundColor: activeTab === 'operator' ? '#204E4C' : 'transparent',
                  color: activeTab === 'operator' ? '#FFFFFF' : '#495B56',
                }}
                className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${
                  activeTab === 'operator' ? 'shadow-subtle' : 'hover:text-[#131D1B]'
                }`}
              >
                Operator
              </button>
              <button
                onClick={() => handleTabChange('reviewer')}
                style={{
                  backgroundColor: activeTab === 'reviewer' ? '#204E4C' : 'transparent',
                  color: activeTab === 'reviewer' ? '#FFFFFF' : '#495B56',
                }}
                className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${
                  activeTab === 'reviewer' ? 'shadow-subtle' : 'hover:text-[#131D1B]'
                }`}
              >
                Reviewer
              </button>
              <button
                onClick={() => handleTabChange('consumer')}
                style={{
                  backgroundColor: activeTab === 'consumer' ? '#204E4C' : 'transparent',
                  color: activeTab === 'consumer' ? '#FFFFFF' : '#495B56',
                }}
                className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${
                  activeTab === 'consumer' ? 'shadow-subtle' : 'hover:text-[#131D1B]'
                }`}
              >
                Auditor
              </button>
            </div>

            <div className="h-4 w-px bg-[#CDD7CB] hidden sm:block"></div>

            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-mono font-bold text-[#204E4C] bg-[#E2ECEB] border border-[#9BB8B6]">
              <span className="w-2 h-2 rounded-full bg-[#087443]"></span>
              {currentPersona.name}
            </span>
          </div>
        </header>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-b border-[#CDD7CB] bg-white p-3 space-y-1.5">
            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#768883] mb-1">
              Select Workspace
            </div>
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  handleTabChange(item.id);
                  setMobileMenuOpen(false);
                }}
                style={{
                  backgroundColor: activeTab === item.id ? '#CDE78C' : 'transparent',
                  color: activeTab === item.id ? '#1C3806' : '#495B56',
                }}
                className="w-full flex items-center justify-between px-3 py-2.5 text-xs rounded-lg font-bold"
              >
                <span className="font-mono">{item.label}</span>
                <span className="text-[10px] font-medium opacity-80">{item.descriptor}</span>
              </button>
            ))}
          </div>
        )}

        {/* Workspace Page Header Strip (Sage Tint) */}
        <div className="border-b border-[#CDD7CB] bg-white/80 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold text-[#131D1B] tracking-tight font-sans">
              {activeMeta.title}
            </h1>
            <p className="text-xs text-[#495B56] mt-0.5 font-medium">
              {activeMeta.subtitle}
            </p>
          </div>

          <div className="flex items-center space-x-2 text-xs font-mono text-[#768883]">
            <span className="badge-lime">Tape: Active</span>
            <span>•</span>
            <span className="font-bold text-[#131D1B]">2,000 Records</span>
          </div>
        </div>

        {/* Main Workspace Dynamic Content Area */}
        <main className="flex-1 overflow-y-auto p-6 max-w-[1600px] w-full mx-auto">
          {activeTab === 'operator' && (
            <OperatorDashboard
              searchQuery={globalSearch}
              onSelectLoan={(id) => setSelectedLoanId(id)}
              onOpenAudit={(id) => setAuditLoanId(id)}
            />
          )}

          {activeTab === 'reviewer' && (
            <ReviewerDashboard
              searchQuery={globalSearch}
              onSelectLoan={(id) => setSelectedLoanId(id)}
              onOpenAudit={(id) => setAuditLoanId(id)}
            />
          )}

          {activeTab === 'consumer' && (
            <ConsumerDashboard
              searchQuery={globalSearch}
              onSelectLoan={(id) => setSelectedLoanId(id)}
              onOpenAudit={(id) => setAuditLoanId(id)}
            />
          )}
        </main>

        {/* Forensic Side-Drawer Inspector */}
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

        {/* Audit Trail Modal */}
        {auditLoanId && (
          <AuditTrailModal
            loanId={auditLoanId}
            onClose={() => setAuditLoanId(null)}
          />
        )}

        {/* Institutional Minimal Footer */}
        <footer className="border-t border-[#CDD7CB] bg-white px-6 py-3 text-xs text-[#768883] flex flex-col sm:flex-row items-center justify-between gap-2 flex-shrink-0">
          <div>
            Intain Campus FinTech Challenge 2026 • Full-Stack Track • Loan Data Verification Copilot
          </div>
          <div className="flex items-center space-x-4 font-mono text-[10px] font-semibold">
            <span>Human-in-the-Loop Governance</span>
            <span>SHA-256 Record Hashing</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
