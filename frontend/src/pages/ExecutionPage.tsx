import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PlayCircle,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Lock,
  Unlock,
  ShieldAlert,
  Activity,
  Bug,
  Database,
} from 'lucide-react';
import { api } from '../api/client';
import type { MigrationRun } from '../types';

export const ExecutionPage: React.FC = () => {
  const queryClient = useQueryClient();

  const [simulateFaultIndex, setSimulateFaultIndex] = useState<string>('');
  const [showConfirmExec, setShowConfirmExec] = useState(false);
  const [showConfirmRollback, setShowConfirmRollback] = useState(false);

  // Active Plan Query
  const { data: plan } = useQuery({
    queryKey: ['activePlan'],
    queryFn: api.getActivePlan,
  });

  const activeVersion = plan?.active_version;
  const isApproved = activeVersion?.status === 'approved';

  // Execution runs query
  const { data: runs } = useQuery({
    queryKey: ['migrationRuns'],
    queryFn: api.getRuns,
    refetchInterval: 3000,
  });

  const latestRun: MigrationRun | undefined = runs && runs.length > 0 ? runs[0] : undefined;

  // Reconciliation query
  const { data: reconciliation, refetch: runReconciliation, isLoading: recLoading } = useQuery({
    queryKey: ['reconciliationResult', activeVersion?.id, latestRun?.id],
    queryFn: () => (activeVersion ? api.reconcile(activeVersion.id, latestRun?.id) : Promise.resolve(null)),
    enabled: !!activeVersion?.id && !!latestRun,
  });

  // Execute mutation
  const executeMutation = useMutation({
    mutationFn: () => {
      const fault = simulateFaultIndex ? parseInt(simulateFaultIndex, 10) : undefined;
      return api.executeMigration(activeVersion!.id, undefined, fault);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['migrationRuns'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliationResult'] });
      setShowConfirmExec(false);
    },
  });

  // Retry mutation
  const retryMutation = useMutation({
    mutationFn: () => {
      const fault = simulateFaultIndex ? parseInt(simulateFaultIndex, 10) : undefined;
      return api.retryMigration(latestRun!.id, fault);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['migrationRuns'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliationResult'] });
    },
  });

  // Rollback mutation
  const rollbackMutation = useMutation({
    mutationFn: () => api.rollbackMigration(latestRun?.id, activeVersion?.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['migrationRuns'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliationResult'] });
      setShowConfirmRollback(false);
    },
  });

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
          <PlayCircle className="w-6 h-6 text-indigo-400" />
          Migration Execution, Rollback & Reconciliation
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Execute accepted records into the mock target store. Protected by server-side approval gates and idempotency keys.
        </p>
      </div>

      {/* Approval Gate Status Banner */}
      <div
        className={`p-5 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4 ${
          isApproved
            ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-300'
            : 'bg-rose-950/20 border-rose-500/40 text-rose-300'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
              isApproved ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
            }`}
          >
            {isApproved ? <Unlock className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
          </div>
          <div>
            <div className="font-bold text-sm sm:text-base">
              {isApproved
                ? `Approval Gate Unlocked: Plan Version v${activeVersion?.version_num} is Approved`
                : `Approval Gate Locked: Plan Version v${activeVersion?.version_num || 1} (${activeVersion?.status || 'draft'})`}
            </div>
            <div className="text-xs text-slate-300 mt-0.5">
              {isApproved
                ? `Approved by ${activeVersion?.approver} on ${new Date(activeVersion?.approved_at!).toLocaleString()} (Hash: ${activeVersion?.content_hash.substring(0, 10)}...)`
                : 'Execution is strictly blocked with HTTP 403 on the server until a human signs off.'}
            </div>
          </div>
        </div>

        {!isApproved && (
          <a
            href="/plans"
            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg transition-all text-center"
          >
            Go to Approval Gate
          </a>
        )}
      </div>

      {/* Execution Actions Control Panel */}
      <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-5">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Activity className="w-5 h-5 text-indigo-400" />
          Execution Control Center & Fault Simulation
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          {/* Fault Injection input */}
          <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
            <label className="text-xs font-mono text-amber-300 flex items-center gap-1.5 mb-1">
              <Bug className="w-3.5 h-3.5 text-amber-400" />
              Fault Injection (Mid-run Failure Hook):
            </label>
            <input
              type="number"
              placeholder="e.g. 5 (Simulate crash at record #5)"
              value={simulateFaultIndex}
              onChange={(e) => setSimulateFaultIndex(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
            />
            <span className="text-[10px] text-slate-400 mt-1 block">
              Leave blank for clean run. Use 5 to test transactional retry.
            </span>
          </div>

          {/* Execute Button */}
          <div>
            <button
              onClick={() => setShowConfirmExec(true)}
              disabled={!isApproved || executeMutation.isPending}
              className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/20 disabled:opacity-40 transition-all flex items-center justify-center gap-2"
            >
              <PlayCircle className="w-4 h-4" />
              {executeMutation.isPending ? 'Executing...' : 'Execute Migration Run'}
            </button>
          </div>

          {/* Retry & Rollback buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => retryMutation.mutate()}
              disabled={!latestRun || latestRun.status !== 'failed' || retryMutation.isPending}
              className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-amber-600/20 disabled:opacity-30 transition-all flex items-center justify-center gap-1.5"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${retryMutation.isPending ? 'animate-spin' : ''}`} />
              Retry Run
            </button>

            <button
              onClick={() => setShowConfirmRollback(true)}
              disabled={!latestRun || latestRun.status === 'rolled_back' || rollbackMutation.isPending}
              className="flex-1 py-3 bg-rose-600/80 hover:bg-rose-600 text-white font-bold text-xs rounded-xl shadow-lg shadow-rose-600/20 disabled:opacity-30 transition-all flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Rollback
            </button>
          </div>
        </div>

        {/* Error Notification if Execution Failed */}
        {latestRun?.status === 'failed' && (
          <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs space-y-1">
            <div className="font-bold flex items-center gap-2 text-rose-300">
              <ShieldAlert className="w-4 h-4" />
              Migration Run Failed ({latestRun.error_details})
            </div>
            <p className="text-[11px] text-slate-300">
              The target database transaction was automatically rolled back. You can retry the run to resume execution without duplicate insertions.
            </p>
          </div>
        )}
      </div>

      {/* Live Run Metrics Cards */}
      {latestRun && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-panel p-4 rounded-xl border border-slate-800">
            <div className="text-[11px] font-mono text-slate-400 uppercase">Run Status</div>
            <div
              className={`text-xl font-bold font-mono mt-1 ${
                latestRun.status === 'completed'
                  ? 'text-emerald-400'
                  : latestRun.status === 'failed'
                  ? 'text-rose-400'
                  : latestRun.status === 'rolled_back'
                  ? 'text-amber-400'
                  : 'text-sky-400'
              }`}
            >
              {latestRun.status.toUpperCase()}
            </div>
            <div className="text-[10px] font-mono text-slate-500 truncate mt-1">
              ID: {latestRun.id.substring(0, 12)}...
            </div>
          </div>

          <div className="glass-panel p-4 rounded-xl border border-slate-800">
            <div className="text-[11px] font-mono text-slate-400 uppercase">Inserted Rows</div>
            <div className="text-2xl font-bold text-white font-mono mt-1">{latestRun.inserted_count}</div>
            <div className="text-[10px] text-slate-400 mt-1">Committed to mock target store</div>
          </div>

          <div className="glass-panel p-4 rounded-xl border border-slate-800">
            <div className="text-[11px] font-mono text-slate-400 uppercase">Skipped Existing</div>
            <div className="text-2xl font-bold text-amber-400 font-mono mt-1">
              {latestRun.skipped_existing_count}
            </div>
            <div className="text-[10px] text-slate-400 mt-1">Idempotency conflict prevented</div>
          </div>

          <div className="glass-panel p-4 rounded-xl border border-slate-800">
            <div className="text-[11px] font-mono text-slate-400 uppercase">Total Accepted</div>
            <div className="text-2xl font-bold text-sky-400 font-mono mt-1">{latestRun.total_accepted}</div>
            <div className="text-[10px] text-slate-400 mt-1">Target expected count</div>
          </div>
        </div>
      )}

      {/* Automated 3-Point Reconciliation Panel */}
      <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Database className="w-5 h-5 text-indigo-400" />
              Automated 3-Point Reconciliation Engine
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Continuously verifies invariants and key-set parity between source dataset, dry-run, and target store.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {reconciliation && (
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold border font-mono ${
                  reconciliation.overall_status === 'PASS'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                }`}
              >
                OVERALL STATUS: {reconciliation.overall_status}
              </span>
            )}

            <button
              onClick={() => runReconciliation()}
              disabled={recLoading}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700"
            >
              Re-verify
            </button>
          </div>
        </div>

        {/* Checks Table */}
        <div className="space-y-3">
          {reconciliation?.checks.map((check, idx) => (
            <div
              key={idx}
              className={`p-4 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                check.status === 'PASS'
                  ? 'bg-slate-900/60 border-slate-800 text-slate-200'
                  : 'bg-rose-950/30 border-rose-500/40 text-rose-200'
              }`}
            >
              <div className="space-y-0.5">
                <div className="font-bold text-white flex items-center gap-2">
                  {check.status === 'PASS' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  {check.name}
                </div>
                <div className="text-[11px] text-slate-400">{check.description}</div>
                {check.discrepancy_details && (
                  <div className="text-[11px] text-rose-300 font-mono pt-1">
                    {check.discrepancy_details}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-4 text-right font-mono shrink-0">
                <div>
                  <span className="text-slate-500 text-[10px] block">Expected</span>
                  <span className="text-slate-300">{String(check.expected)}</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">Actual</span>
                  <span className="text-white font-bold">{String(check.actual)}</span>
                </div>
                <div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      check.status === 'PASS'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-rose-500/20 text-rose-300'
                    }`}
                  >
                    {check.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Confirmation Modals */}
      {showConfirmExec && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-2">
              <PlayCircle className="w-5 h-5 text-emerald-400" />
              Confirm Migration Execution
            </h3>
            <p className="text-xs text-slate-300 mb-6">
              You are about to insert accepted records for approved plan version{' '}
              <strong className="text-white">v{activeVersion?.version_num}</strong> into the mock target SQLite store.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirmExec(false)}
                className="px-4 py-2 text-xs text-slate-300 hover:bg-slate-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => executeMutation.mutate()}
                disabled={executeMutation.isPending}
                className="px-4 py-2 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow-lg shadow-emerald-600/30"
              >
                {executeMutation.isPending ? 'Executing...' : 'Confirm & Execute'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfirmRollback && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-2">
              <RotateCcw className="w-5 h-5 text-rose-400" />
              Confirm Rollback
            </h3>
            <p className="text-xs text-slate-300 mb-6">
              This will delete all records in the target store associated with run{' '}
              <code className="text-rose-300">{latestRun?.id}</code> inside a single database transaction.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirmRollback(false)}
                className="px-4 py-2 text-xs text-slate-300 hover:bg-slate-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => rollbackMutation.mutate()}
                disabled={rollbackMutation.isPending}
                className="px-4 py-2 text-xs bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg shadow-lg shadow-rose-600/30"
              >
                {rollbackMutation.isPending ? 'Rolling back...' : 'Yes, Rollback Target Rows'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
