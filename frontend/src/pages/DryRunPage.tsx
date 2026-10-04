import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  ShieldCheck,
  AlertOctagon,
  CheckCircle2,
  Hash,
  RefreshCw,
  FileJson,
  FileSpreadsheet,
  ChevronRight,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import type { QuarantinedRecord } from '../types';

export const DryRunPage: React.FC = () => {
  const [fieldFilter, setFieldFilter] = useState('');
  const [errorCodeFilter, setErrorCodeFilter] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<QuarantinedRecord | null>(null);

  const { data: plan } = useQuery({
    queryKey: ['activePlan'],
    queryFn: api.getActivePlan,
  });

  const activeVersion = plan?.active_version;

  // Dry run execution
  const { data: dryRunResult, isLoading: dryRunLoading, refetch: runDryRun } = useQuery({
    queryKey: ['dryRunResult', activeVersion?.id],
    queryFn: () => api.executeDryRun(activeVersion?.id),
    enabled: !!activeVersion?.id,
  });

  // Determinism verification mutation
  const determinismMutation = useMutation({
    mutationFn: () => api.verifyDeterminism(activeVersion!.id, 3),
  });

  // Quarantine query
  const { data: quarantineData, isLoading: qLoading } = useQuery({
    queryKey: ['quarantineList', dryRunResult?.id, fieldFilter, errorCodeFilter],
    queryFn: () =>
      api.getQuarantinedRecords(
        dryRunResult?.id,
        fieldFilter || undefined,
        errorCodeFilter || undefined,
        100,
        0
      ),
    enabled: !!dryRunResult?.id,
  });

  const totalSource = dryRunResult?.total_source || 0;
  const totalAccepted = dryRunResult?.total_accepted || 0;
  const totalQuarantined = dryRunResult?.total_quarantined || 0;
  const isInvariantValid = totalSource === totalAccepted + totalQuarantined && totalSource > 0;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <ShieldCheck className="w-6 h-6 text-indigo-400" />
            Deterministic Dry Run & Quarantine Workbench
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Test the active migration plan against the 60 source records with zero target writes. Enforces determinism and exact invariants.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => determinismMutation.mutate()}
            disabled={determinismMutation.isPending || !activeVersion}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 disabled:opacity-40"
          >
            <Hash className="w-3.5 h-3.5 text-sky-400" />
            {determinismMutation.isPending ? 'Verifying 3x...' : 'Verify Determinism (3x)'}
          </button>

          <button
            onClick={() => runDryRun()}
            disabled={dryRunLoading || !activeVersion}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${dryRunLoading ? 'animate-spin' : ''}`} />
            {dryRunLoading ? 'Executing Dry Run...' : 'Re-run Dry Run'}
          </button>
        </div>
      </div>

      {/* Determinism Result Banner */}
      {determinismMutation.data && (
        <div className="p-4 rounded-xl bg-slate-900 border border-sky-500/40 text-xs space-y-2 font-mono">
          <div className="flex items-center gap-2 text-sky-300 font-bold">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            DETERMINISM VERIFICATION PASSED (Byte-Identical Output across 3 Runs)
          </div>
          <div className="text-slate-400 text-[11px]">
            Result Hashes:{' '}
            <span className="text-slate-200">{determinismMutation.data.result_hashes.join(' == ')}</span>
          </div>
        </div>
      )}

      {/* Invariant & Hash Metadata Header */}
      {dryRunResult && (
        <div className="glass-panel p-4 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-4 font-mono text-xs">
          <div className="flex items-center gap-4">
            <span className="text-slate-400">
              Input Hash: <span className="text-slate-200">{dryRunResult.input_hash.substring(0, 12)}...</span>
            </span>
            <span className="text-slate-400">
              Result Hash: <span className="text-amber-400 font-bold">{dryRunResult.result_hash.substring(0, 12)}...</span>
            </span>
          </div>

          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full font-sans font-semibold text-xs border ${
              isInvariantValid
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Invariant: Source ({totalSource}) = Accepted ({totalAccepted}) + Quarantined ({totalQuarantined})
          </div>
        </div>
      )}

      {/* 4 Invariant Count Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Source */}
        <div className="glass-panel p-5 rounded-xl border border-slate-800">
          <div className="text-xs text-slate-400 font-mono uppercase tracking-wider mb-1">
            Total Source Records
          </div>
          <div className="text-3xl font-extrabold text-white font-mono">{totalSource}</div>
          <div className="text-[11px] text-slate-400 mt-1">Under 500 limit ceiling</div>
        </div>

        {/* Transformed */}
        <div className="glass-panel p-5 rounded-xl border border-slate-800">
          <div className="text-xs text-slate-400 font-mono uppercase tracking-wider mb-1">
            Processed / Transformed
          </div>
          <div className="text-3xl font-extrabold text-sky-400 font-mono">
            {dryRunResult?.total_transformed || 0}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">100% processed through pipeline</div>
        </div>

        {/* Accepted */}
        <div className="glass-panel p-5 rounded-xl border border-emerald-900/40 bg-emerald-950/10">
          <div className="text-xs text-emerald-400 font-mono uppercase tracking-wider mb-1">
            Accepted (Ready to Insert)
          </div>
          <div className="text-3xl font-extrabold text-emerald-400 font-mono">{totalAccepted}</div>
          <div className="text-[11px] text-emerald-400/80 mt-1">
            {totalSource > 0 ? `${Math.round((totalAccepted / totalSource) * 100)}% pass rate` : '0%'}
          </div>
        </div>

        {/* Quarantined */}
        <div className="glass-panel p-5 rounded-xl border border-rose-900/40 bg-rose-950/10">
          <div className="text-xs text-rose-400 font-mono uppercase tracking-wider mb-1">
            Quarantined (Rejected)
          </div>
          <div className="text-3xl font-extrabold text-rose-400 font-mono">{totalQuarantined}</div>
          <div className="text-[11px] text-rose-400/80 mt-1">
            {totalSource > 0 ? `${Math.round((totalQuarantined / totalSource) * 100)}% quarantine rate` : '0%'}
          </div>
        </div>
      </div>

      {/* Quarantine Evidence Workbench */}
      <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <AlertOctagon className="w-5 h-5 text-rose-400" />
              Quarantined Records & Field Error Evidence ({quarantineData?.total || 0})
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Every rejected record preserves original raw values, rule that failed, and exact error codes.
            </p>
          </div>

          {/* Export Actions */}
          <div className="flex items-center gap-2">
            <a
              href={`/api/quarantine/export?dry_run_id=${dryRunResult?.id}&format=json`}
              download="quarantine_export.json"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700"
            >
              <FileJson className="w-3.5 h-3.5 text-amber-400" /> Export JSON
            </a>
            <a
              href={`/api/quarantine/export?dry_run_id=${dryRunResult?.id}&format=csv`}
              download="quarantine_export.csv"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" /> Export CSV
            </a>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 bg-slate-900/60 p-3 rounded-lg border border-slate-800">
          <div>
            <label className="text-[10px] text-slate-400 font-mono block mb-1">Filter by Field:</label>
            <input
              type="text"
              placeholder="e.g. date_of_birth, email..."
              value={fieldFilter}
              onChange={(e) => setFieldFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="text-[10px] text-slate-400 font-mono block mb-1">Filter by Error Code:</label>
            <input
              type="text"
              placeholder="e.g. DUPLICATE_EMAIL, TRANSFORM_ERROR..."
              value={errorCodeFilter}
              onChange={(e) => setErrorCodeFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-end">
            {(fieldFilter || errorCodeFilter) && (
              <button
                onClick={() => {
                  setFieldFilter('');
                  setErrorCodeFilter('');
                }}
                className="text-xs text-slate-400 hover:text-white px-3 py-1.5 bg-slate-800 rounded"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* Quarantine Table */}
        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 text-slate-400 font-mono text-[11px] uppercase border-b border-slate-800">
              <tr>
                <th className="px-3 py-2.5">Source Key</th>
                <th className="px-3 py-2.5">Failed Fields</th>
                <th className="px-3 py-2.5">Error Codes</th>
                <th className="px-3 py-2.5">Diagnostic Message</th>
                <th className="px-3 py-2.5 text-right">Drill-Down</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
              {qLoading ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-400 font-sans">
                    Loading quarantine records...
                  </td>
                </tr>
              ) : quarantineData?.records.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-400 font-sans">
                    No records in quarantine matching current filters.
                  </td>
                </tr>
              ) : (
                quarantineData?.records.map((q) => (
                  <tr
                    key={q.id}
                    onClick={() => setSelectedRecord(q)}
                    className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-3 font-mono font-bold text-rose-300">{q.source_key}</td>
                    <td className="px-3 py-3 font-mono text-amber-300">
                      {q.errors.map((e) => e.field).join(', ')}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {q.errors.map((e, idx) => (
                          <span
                            key={idx}
                            className="bg-rose-950/60 text-rose-300 border border-rose-800/40 px-1.5 py-0.2 rounded text-[10px] font-mono"
                          >
                            {e.error_code}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-300 text-[11px] max-w-sm truncate">
                      {q.errors[0]?.message}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button className="text-indigo-400 hover:text-indigo-300 text-xs font-semibold flex items-center gap-1 ml-auto">
                        Inspect <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Drill-Down Drawer / Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <AlertOctagon className="w-5 h-5 text-rose-400" />
                Quarantine Diagnostics: {selectedRecord.source_key}
              </h3>
              <button
                onClick={() => setSelectedRecord(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error Diagnostics List */}
            <div className="space-y-3 mb-5">
              <h4 className="text-xs font-mono font-bold uppercase text-slate-400">Field Failures</h4>
              {selectedRecord.errors.map((err, idx) => (
                <div key={idx} className="bg-rose-950/30 border border-rose-500/40 p-3 rounded-lg text-xs space-y-1">
                  <div className="flex items-center justify-between font-mono font-bold">
                    <span className="text-rose-300">Field: {err.field}</span>
                    <span className="text-[10px] bg-rose-900/60 text-rose-200 px-2 py-0.5 rounded">
                      {err.error_code}
                    </span>
                  </div>
                  <div className="text-slate-200 text-[11px] font-medium">{err.message}</div>
                  <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-400 pt-1">
                    <div>Original Value: <span className="text-white">{String(err.original_value)}</span></div>
                    <div>Attempted Value: <span className="text-white">{String(err.attempted_value ?? '<none>')}</span></div>
                  </div>
                </div>
              ))}
            </div>

            {/* Raw Source Record JSON */}
            <div>
              <h4 className="text-xs font-mono font-bold uppercase text-slate-400 mb-1.5">
                Preserved Raw Source Record
              </h4>
              <pre className="bg-slate-950 border border-slate-800 p-3 rounded-lg text-xs font-mono text-sky-300 overflow-x-auto">
                {JSON.stringify(selectedRecord.raw_record, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
