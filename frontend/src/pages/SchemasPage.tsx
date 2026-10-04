import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Database, Table, CheckCircle, ChevronLeft, ChevronRight, Tag, Layers, RefreshCw } from 'lucide-react';
import { api } from '../api/client';


export const SchemasPage: React.FC = () => {
  const [page, setPage] = useState(0);
  const [selectedScenario, setSelectedScenario] = useState('baseline_60');
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const pageSize = 12;
  const queryClient = useQueryClient();

  const { data: sourceSchema, isLoading: srcLoading } = useQuery({
    queryKey: ['sourceSchema'],
    queryFn: api.getSourceSchema,
  });

  const { data: targetSchema, isLoading: tgtLoading } = useQuery({
    queryKey: ['targetSchema'],
    queryFn: api.getTargetSchema,
  });

  const { data: scenariosData } = useQuery({
    queryKey: ['scenarios'],
    queryFn: api.getScenarios,
  });

  const { data: sampleData, isLoading: sampleLoading } = useQuery({
    queryKey: ['sampleRecords', page],
    queryFn: () => api.getSampleRecords(pageSize, page * pageSize),
  });

  const loadScenarioMutation = useMutation({
    mutationFn: (scenarioName: string) => api.loadScenario(scenarioName),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['sampleRecords'] });
      setPage(0);
      setFeedbackMsg(`Loaded ${res.record_count} records from scenario '${selectedScenario}'.`);
      setTimeout(() => setFeedbackMsg(null), 4000);
    },
    onError: (err: any) => {
      setFeedbackMsg(`Error loading scenario: ${err.message}`);
    },
  });

  const totalPages = sampleData ? Math.ceil(sampleData.total / pageSize) : 1;

  // Helper to detect intentional anomalies for visual tagging in UI
  const getRecordAnomalyTag = (rec: Record<string, any>) => {
    if (rec.dob === '31/02/1990') return { text: 'Invalid Date (Feb 31)', color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' };
    if (rec.dob === 'N/A') return { text: 'Malformed Date', color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' };
    if (rec.email_addr?.includes('-invalid-email')) return { text: 'Malformed Email', color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' };
    if (rec.email_addr === 'duplicate.email@example.com') return { text: 'Duplicate Email', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' };
    if (rec.cust_id === 'CUST-0005' && rec.full_name?.includes('Duplicate')) return { text: 'Duplicate cust_id', color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' };
    if (rec.full_name === 'Cher') return { text: 'Single-word Name', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' };
    if (rec.full_name === '') return { text: 'Missing Name', color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' };
    if (rec.credit_limit?.startsWith('-')) return { text: 'Negative Credit', color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' };
    if (rec.credit_limit === 'unlimited') return { text: 'Non-numeric Credit', color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' };
    if (rec.country_code === 'ZZ') return { text: 'Invalid Country (ZZ)', color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' };
    if (rec.status_flag === 'UNKNOWN_FLAG' || rec.status_flag === '') return { text: 'Unmapped Status', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' };
    if (rec.full_name?.startsWith('  ')) return { text: 'Whitespace Padding', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' };
    return null;
  };


  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
          <Database className="w-6 h-6 text-indigo-400" />
          Schemas & Source Dataset Explorer
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Inspect legacy source structure, modern target constraints, and the curated 60-record dataset containing intentional real-world anomalies.
        </p>
      </div>

      {/* Side-by-Side Schema Comparison Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Source Schema Card */}
        <div className="glass-panel rounded-xl p-5 border border-slate-800">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
            <div>
              <span className="text-xs uppercase font-mono tracking-wider text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded">
                Source Schema
              </span>
              <h2 className="text-lg font-bold text-white mt-1">
                {sourceSchema?.name || 'legacy_customers'}
              </h2>
              <p className="text-xs text-slate-400">{sourceSchema?.description}</p>
            </div>
            <div className="text-right text-xs text-slate-400">
              <span className="font-semibold text-slate-200">{sourceSchema?.fields.length || 0}</span> fields
            </div>
          </div>

          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {srcLoading ? (
              <div className="text-center py-8 text-slate-400 text-sm">Loading source schema...</div>
            ) : (
              sourceSchema?.fields.map((f) => (
                <div
                  key={f.name}
                  className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80 flex items-start justify-between text-xs hover:border-slate-700 transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-sky-300">{f.name}</span>
                      {sourceSchema.primary_key.includes(f.name) && (
                        <span className="bg-indigo-500/20 text-indigo-300 text-[10px] px-1.5 py-0.2 rounded font-mono">
                          PK
                        </span>
                      )}
                      {!f.nullable && (
                        <span className="text-rose-400 text-[10px] font-mono">required</span>
                      )}
                    </div>
                    <div className="text-slate-400 text-[11px] mt-0.5">{f.description}</div>
                  </div>
                  <span className="font-mono text-slate-300 bg-slate-800 px-2 py-0.5 rounded text-[11px]">
                    {f.type}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Target Schema Card */}
        <div className="glass-panel rounded-xl p-5 border border-slate-800">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
            <div>
              <span className="text-xs uppercase font-mono tracking-wider text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded">
                Target Schema (Mock DB)
              </span>
              <h2 className="text-lg font-bold text-white mt-1">
                {targetSchema?.name || 'customers'}
              </h2>
              <p className="text-xs text-slate-400">{targetSchema?.description}</p>
            </div>
            <div className="text-right text-xs text-slate-400">
              <span className="font-semibold text-slate-200">{targetSchema?.fields.length || 0}</span> fields
            </div>
          </div>

          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {tgtLoading ? (
              <div className="text-center py-8 text-slate-400 text-sm">Loading target schema...</div>
            ) : (
              targetSchema?.fields.map((f) => (
                <div
                  key={f.name}
                  className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80 flex items-start justify-between text-xs hover:border-slate-700 transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-emerald-300">{f.name}</span>
                      {targetSchema.primary_key.includes(f.name) && (
                        <span className="bg-indigo-500/20 text-indigo-300 text-[10px] px-1.5 py-0.2 rounded font-mono">
                          PK
                        </span>
                      )}
                      {f.unique && (
                        <span className="bg-amber-500/20 text-amber-300 text-[10px] px-1.5 py-0.2 rounded font-mono">
                          UNIQUE
                        </span>
                      )}
                      {!f.nullable && (
                        <span className="text-rose-400 text-[10px] font-mono">required</span>
                      )}
                      {f.enum && (
                        <span className="text-indigo-300 text-[10px] font-mono">
                          enum [{f.enum.join(', ')}]
                        </span>
                      )}
                    </div>
                    <div className="text-slate-400 text-[11px] mt-0.5">{f.description}</div>
                  </div>
                  <span className="font-mono text-slate-300 bg-slate-800 px-2 py-0.5 rounded text-[11px]">
                    {f.type} {f.format ? `(${f.format})` : ''}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Sample Records Explorer Table */}
      <div className="glass-panel rounded-xl p-5 border border-slate-800">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-800/80">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Table className="w-5 h-5 text-sky-400" />
              Source Dataset Explorer ({sampleData?.total || 0} Records)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Inspect active input records, realistic human-entered edge cases, and test scenarios.
            </p>
          </div>

          {/* Scenario Selector & Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1.5">
              <Layers className="w-4 h-4 text-indigo-400" />
              <label className="text-xs text-slate-300 font-medium">Scenario:</label>
              <select
                value={selectedScenario}
                onChange={(e) => setSelectedScenario(e.target.value)}
                className="bg-slate-800 text-white text-xs rounded border border-slate-700 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {scenariosData?.scenarios.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name} ({s.record_count} records) - {s.expected_clean_rate}
                  </option>
                ))}
              </select>
              <button
                onClick={() => loadScenarioMutation.mutate(selectedScenario)}
                disabled={loadScenarioMutation.isPending}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadScenarioMutation.isPending ? 'animate-spin' : ''}`} />
                Load
              </button>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">
                Page {page + 1} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 disabled:opacity-40 hover:bg-slate-700"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 disabled:opacity-40 hover:bg-slate-700"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {feedbackMsg && (
          <div className="mb-4 p-2.5 rounded-lg bg-indigo-950/40 border border-indigo-500/30 text-indigo-300 text-xs flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-indigo-400 shrink-0" />
            {feedbackMsg}
          </div>
        )}


        {/* Table */}
        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 text-slate-400 font-mono text-[11px] uppercase border-b border-slate-800">
              <tr>
                <th className="px-3 py-2.5">Key / ID</th>
                <th className="px-3 py-2.5">Full Name</th>
                <th className="px-3 py-2.5">Email</th>
                <th className="px-3 py-2.5">Phone</th>
                <th className="px-3 py-2.5">DOB</th>
                <th className="px-3 py-2.5">Country</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Credit</th>
                <th className="px-3 py-2.5">Anomalies</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-slate-950/40 font-mono">
              {sampleLoading ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-slate-400 font-sans">
                    Loading records...
                  </td>
                </tr>
              ) : (
                sampleData?.records.map((rec, idx) => {
                  const anomaly = getRecordAnomalyTag(rec);
                  return (
                    <tr
                      key={`${rec.cust_id}-${idx}`}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        anomaly ? 'bg-amber-950/10' : ''
                      }`}
                    >
                      <td className="px-3 py-2 text-sky-300 font-semibold">{rec.cust_id}</td>
                      <td className="px-3 py-2 text-slate-200 font-sans">{rec.full_name || '<empty>'}</td>
                      <td className="px-3 py-2 text-slate-300">{rec.email_addr}</td>
                      <td className="px-3 py-2 text-slate-400">{rec.phone}</td>
                      <td className="px-3 py-2 text-slate-300">{rec.dob}</td>
                      <td className="px-3 py-2 text-slate-300">{rec.country_code}</td>
                      <td className="px-3 py-2">
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">
                          {rec.status_flag || '<empty>'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-300">${rec.credit_limit}</td>
                      <td className="px-3 py-2 font-sans">
                        {anomaly ? (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${anomaly.color}`}
                          >
                            <Tag className="w-2.5 h-2.5" />
                            {anomaly.text}
                          </span>
                        ) : (
                          <span className="text-emerald-400/80 text-[11px] flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> Valid
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
