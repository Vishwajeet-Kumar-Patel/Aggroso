import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Database,
  BrainCircuit,
  FileCode,
  ShieldCheck,
  PlayCircle,
  History,
  RotateCcw,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { api } from '../../api/client';

export const Navbar: React.FC = () => {
  const queryClient = useQueryClient();
  const [showResetModal, setShowResetModal] = useState(false);

  const { data: plan } = useQuery({
    queryKey: ['activePlan'],
    queryFn: api.getActivePlan,
    refetchInterval: 5000,
  });

  const resetMutation = useMutation({
    mutationFn: api.resetDemo,
    onSuccess: () => {
      queryClient.invalidateQueries();
      setShowResetModal(false);
    },
  });

  const activeVersion = plan?.active_version;
  const isApproved = activeVersion?.status === 'approved';

  const navLinks = [
    { to: '/', label: 'Schemas & Data', icon: Database },
    { to: '/proposal', label: 'AI Proposal', icon: BrainCircuit },
    { to: '/plans', label: 'Plan & Versions', icon: FileCode },
    { to: '/dry-run', label: 'Dry Run & Quarantine', icon: ShieldCheck },
    { to: '/execution', label: 'Execution & Reconciliation', icon: PlayCircle },
    { to: '/audit', label: 'Audit Log', icon: History },
  ];

  return (
    <header className="sticky top-0 z-50 glass-panel border-b border-slate-800/80">
      {/* Top Banner: Mock Target Notice & Plan Status */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 px-4 py-1.5 border-b border-slate-800/60 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
            <AlertTriangle className="w-3.5 h-3.5" />
            MOCK TARGET STORE: SQLite (Protected Sandbox)
          </span>
          <span className="text-slate-400 hidden md:inline">
            Bounded dataset migration workbench (Max 500 records)
          </span>
        </div>

        <div className="flex items-center gap-3">
          {activeVersion && (
            <div className="flex items-center gap-2 bg-slate-800/80 px-2.5 py-0.5 rounded-md border border-slate-700/60">
              <span className="text-slate-400">Active Plan:</span>
              <span className="font-semibold text-sky-400">v{activeVersion.version_num}</span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.2 rounded text-[11px] font-semibold ${
                  isApproved
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                }`}
              >
                {isApproved ? <CheckCircle2 className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                {activeVersion.status.toUpperCase()}
              </span>
              <span className="text-slate-500 font-mono text-[10px] hidden sm:inline" title={activeVersion.content_hash}>
                [{activeVersion.content_hash.substring(0, 8)}]
              </span>
            </div>
          )}

          <button
            onClick={() => setShowResetModal(true)}
            className="flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 px-2 py-1 rounded transition-colors"
            title="Reset demo databases to clean initial state"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reset Demo</span>
          </button>
        </div>
      </div>

      {/* Main Navigation */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-sky-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="font-bold text-sm sm:text-base tracking-tight gradient-text">
                Agentic Migration Planner
              </span>
              <span className="text-[10px] block text-slate-400 font-mono">
                & Reconciliation Workbench
              </span>
            </div>
          </div>

          <nav className="flex items-center gap-1 sm:gap-2 overflow-x-auto py-1">
            {navLinks.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                <span className="hidden md:inline">{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </div>

      {/* Reset Confirmation Dialog */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-2">
              <RotateCcw className="w-5 h-5 text-rose-400" />
              Reset Demo Environment?
            </h3>
            <p className="text-sm text-slate-300 mb-6">
              This will drop and recreate all tables in <code className="text-amber-400">app.db</code> and{' '}
              <code className="text-amber-400">target.db</code>, clearing all plans, executions, and audit history,
              and reload the pristine 60 source sample records.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => resetMutation.mutate()}
                disabled={resetMutation.isPending}
                className="px-4 py-2 text-sm bg-rose-600 hover:bg-rose-500 text-white font-medium rounded-lg shadow-lg shadow-rose-600/30 transition-all flex items-center gap-2"
              >
                {resetMutation.isPending ? 'Resetting...' : 'Yes, Reset Everything'}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
