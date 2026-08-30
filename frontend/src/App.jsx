import React, { useEffect, useState } from 'react';
import OperatorDashboard from './components/OperatorDashboard';
import ReviewerDashboard from './components/ReviewerDashboard';
import ConsumerDashboard from './components/ConsumerDashboard';
import AuditTrailModal from './components/AuditTrailModal';
import LoanDetailModal from './components/LoanDetailModal';
import { api } from './api';
import {
  ShieldCheck,
  Layers,
  FileCheck2,
  Search,
  Menu,
  X,
  ChevronRight,
  Sparkles,
  Lock,
  Check,
  PanelLeft,
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
      name: 'Priya Sharma',
      title: 'Data Operations Specialist',
      role: 'OPERATOR',
      userId: 'usr-operator-01',
      initials: 'PS',
    },
    reviewer: {
      name: 'Mridul Rajgaria',
      title: 'Lead Underwriter',
      role: 'REVIEWER',
      userId: 'usr-reviewer-01',
      initials: 'MR',
    },
    consumer: {
      name: 'Rohan Mehta',
      title: 'Verification Auditor',
      role: 'AUDITOR',
      userId: 'usr-auditor-01',
      initials: 'RM',
    },
  };

  const currentPersona = personas[activeTab] || personas.reviewer;

  useEffect(() => {
    api.setAuthUser(currentPersona.userId, currentPersona.role);
  }, [currentPersona.userId, currentPersona.role]);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    const persona = personas[tabId] || personas.reviewer;
    api.setAuthUser(persona.userId, persona.role);
  };

  const navItems = [
    { id: 'operator', label: '01. Data Operations', icon: Layers, descriptor: 'Tape ingestion & source lineage' },
    { id: 'reviewer', label: '02. Underwriting Review', icon: FileCheck2, descriptor: 'Anomaly & exception adjudication' },
    { id: 'consumer', label: '03. Verification Portal', icon: ShieldCheck, descriptor: 'Cryptographic data attestation' },
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
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col lg:flex-row text-[#0F172A] font-sans antialiased">
      {/* 1. DESKTOP LEFT SIDEBAR (Expanded to w-72 so text never cuts off) */}
      <aside className="hidden lg:flex lg:flex-col w-72 border-r border-[#E2E8F0] bg-white flex-shrink-0 justify-between">
        <div className="flex flex-col">
          {/* Institutional Brand Header (FinFox Clean Style: White Background + Bold Green Logo) */}
          <div className="h-16 border-b border-[#E2E8F0] px-6 flex items-center bg-white flex-shrink-0">
            <div className="flex items-center space-x-3.5">
              {/* FinFox-Inspired Hexagonal Fintech Icon */}
              <div className="w-9 h-9 bg-[#16433F] rounded-xl flex items-center justify-center shadow-sm relative flex-shrink-0">
                <ShieldCheck className="w-5 h-5 text-[#CDE78C]" />
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[#CDE78C] rounded-full border-2 border-white"></div>
              </div>

              <div>
                <div className="text-xl font-black tracking-tight text-[#16433F] leading-none font-sans flex items-center gap-1">
                  <span>Intain</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#86C232]"></span>
                </div>
                <div className="text-[11px] font-bold text-[#204E4C] tracking-wide mt-1 font-sans">
                  Loan Verification
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Links (Matches FinFox Rounded Lime Pill Active State) */}
          <div className="p-4 space-y-2">
            <div className="px-2 pt-2 pb-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-[#64748B]">
              Navigation & Workspaces
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
                    color: isActive ? '#143834' : '#475569',
                    borderColor: isActive ? '#B3D463' : 'transparent',
                  }}
                  className={`w-full flex items-center space-x-3.5 px-4 py-3 rounded-xl text-left transition-all border ${
                    isActive
                      ? 'font-bold shadow-sm'
                      : 'hover:bg-[#F1F5F9] hover:text-[#0F172A]'
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" style={{ color: isActive ? '#143834' : '#64748B' }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold leading-snug">
                      {item.label}
                    </div>
                    <div
                      className="text-[11px] mt-0.5 leading-snug font-normal font-sans"
                      style={{ color: isActive ? '#204E4C' : '#64748B' }}
                    >
                      {item.descriptor}
                    </div>
                  </div>
                  {isActive && <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: '#143834' }} />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sidebar Footer: Active Demo Persona & System Status */}
        <div className="border-t border-[#E2E8F0] p-4 bg-[#F8FAFC] space-y-3">
          {/* Operational Status */}
          <div className="flex items-center justify-between text-xs px-0.5">
            <span className="flex items-center space-x-2 text-[11px] text-[#475569] font-medium font-sans">
              <span className="w-2 h-2 rounded-full bg-[#087443]"></span>
              <span>Verification Engine</span>
            </span>
            <span className="text-[10px] font-mono font-bold text-[#16433F] bg-white px-2 py-0.5 rounded-md border border-[#E2E8F0]">
              READY
            </span>
          </div>

          {/* Dynamic User Persona Profile Card */}
          <div className="bg-white p-3 rounded-xl border border-[#E2E8F0] shadow-xs flex items-center justify-between gap-3">
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-[#16433F] text-white flex items-center justify-center text-xs font-bold font-mono shadow-xs flex-shrink-0">
                {currentPersona.initials}
              </div>
              <div className="min-w-0 truncate">
                <div className="text-xs font-bold text-[#0F172A] truncate leading-tight">{currentPersona.name}</div>
                <div className="text-[10.5px] text-[#64748B] truncate font-sans font-medium mt-0.5 leading-tight">{currentPersona.title}</div>
              </div>
            </div>
            <span className="text-[10px] font-mono font-bold text-[#16433F] bg-[#EEF4FF] px-2 py-0.5 rounded-md border border-[#9DC0FB] flex-shrink-0">
              {currentPersona.role}
            </span>
          </div>
        </div>
      </aside>

      {/* 2. MAIN APPLICATION CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Utility Header */}
        <header className="h-16 border-b border-[#E2E8F0] bg-white px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 flex-shrink-0 shadow-sm">
          {/* Left: Mobile Menu & Title */}
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              className="lg:hidden p-1.5 text-[#475569] hover:text-[#0F172A] rounded-md hover:bg-[#F1F5F9]"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <div className="hidden sm:flex items-center space-x-2 text-xs text-[#64748B] font-mono">
              <span className="font-bold text-[#16433F]">Intain Copilot</span>
              <span>/</span>
              <span className="capitalize font-sans font-semibold text-[#0F172A]">{activeTab}</span>
            </div>
          </div>

          {/* Center: Global Search Bar with Guaranteed Non-Overlapping Padding */}
          <div className="flex-1 max-w-md mx-4 hidden md:block">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 absolute left-3 text-[#94A3B8] pointer-events-none" />
              <input
                type="text"
                placeholder="Search loan ID, borrower, exception..."
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                aria-label="Search loan ID, borrower, or exception"
                className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-md pl-10 pr-3 py-1.5 text-xs text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:bg-white focus:border-[#204E4C] focus:ring-2 focus:ring-[#204E4C]/10 transition-all font-sans"
              />
            </div>
          </div>

          {/* Right: Explicit High-Contrast Role Switcher */}
          <div className="flex items-center space-x-3">
            {/* Segmented Workspace Role Switcher */}
            <div className="flex items-center bg-[#F1F5F9] p-1 rounded-lg border border-[#E2E8F0] text-xs">
              <button
                onClick={() => handleTabChange('operator')}
                style={{
                  backgroundColor: activeTab === 'operator' ? '#16433F' : 'transparent',
                  color: activeTab === 'operator' ? '#FFFFFF' : '#475569',
                }}
                className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${
                  activeTab === 'operator' ? 'shadow-sm' : 'hover:text-[#0F172A]'
                }`}
              >
                Operator
              </button>
              <button
                onClick={() => handleTabChange('reviewer')}
                style={{
                  backgroundColor: activeTab === 'reviewer' ? '#16433F' : 'transparent',
                  color: activeTab === 'reviewer' ? '#FFFFFF' : '#475569',
                }}
                className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${
                  activeTab === 'reviewer' ? 'shadow-sm' : 'hover:text-[#0F172A]'
                }`}
              >
                Reviewer
              </button>
              <button
                onClick={() => handleTabChange('consumer')}
                style={{
                  backgroundColor: activeTab === 'consumer' ? '#16433F' : 'transparent',
                  color: activeTab === 'consumer' ? '#FFFFFF' : '#475569',
                }}
                className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${
                  activeTab === 'consumer' ? 'shadow-sm' : 'hover:text-[#0F172A]'
                }`}
              >
                Auditor
              </button>
            </div>

            <div className="h-4 w-px bg-[#E2E8F0] hidden sm:block"></div>

            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-mono font-bold text-[#16433F] bg-[#EEF4FF] border border-[#9DC0FB]">
              <span className="w-2 h-2 rounded-full bg-[#087443]"></span>
              {currentPersona.name}
            </span>
          </div>
        </header>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-b border-[#E2E8F0] bg-white p-3 space-y-1.5">
            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#64748B] mb-1">
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
                  color: activeTab === item.id ? '#143834' : '#475569',
                }}
                className="w-full flex items-center justify-between px-3.5 py-3 text-xs rounded-xl font-bold"
              >
                <span className="font-sans font-bold">{item.label}</span>
                <span className="text-[10px] font-medium opacity-80">{item.descriptor}</span>
              </button>
            ))}
          </div>
        )}

        {/* Workspace Page Header Strip (Clean Surface) */}
        <div className="border-b border-[#E2E8F0] bg-white px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs">
          <div>
            <h1 className="text-lg font-bold text-[#0F172A] tracking-tight font-sans">
              {activeMeta.title}
            </h1>
            <p className="text-xs text-[#475569] mt-0.5 font-medium">
              {activeMeta.subtitle}
            </p>
          </div>

          <div className="flex items-center space-x-2 text-xs font-mono text-[#64748B]">
            <span className="badge-lime">Tape: Active</span>
            <span>•</span>
            <span className="font-bold text-[#0F172A]">2,000 Records</span>
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

        {/* Non-Technical Friendly Footer */}
        <footer className="border-t border-[#E2E8F0] bg-white px-6 py-3.5 text-xs text-[#64748B] flex flex-col sm:flex-row items-center justify-between gap-3 flex-shrink-0 shadow-sm">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-[#0F172A]">Intain Loan Verification Copilot</span>
            <span className="text-[#CBD5E1]">•</span>
            <span className="text-[11px] text-[#64748B]">Automated error detection with underwriter review and permanent protection</span>
          </div>

          <div className="flex items-center space-x-3 text-[11px] font-medium text-[#475569]">
            <span className="inline-flex items-center gap-1.5 text-[#087443] font-bold">
              <Check className="w-3.5 h-3.5" />
              <span>Verified by Underwriters</span>
            </span>
            <span className="text-[#CBD5E1]">•</span>
            <span className="inline-flex items-center gap-1.5 text-[#16433F] font-bold">
              <Lock className="w-3.5 h-3.5" />
              <span>Tamper-Proof Records</span>
            </span>
            <span className="text-[#CBD5E1]">•</span>
            <span className="inline-flex items-center gap-1.5 text-[#0F172A] font-bold">
              <Sparkles className="w-3.5 h-3.5 text-[#A15C00]" />
              <span>100% Audit-Ready</span>
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
