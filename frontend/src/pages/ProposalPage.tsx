import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BrainCircuit,
  Sparkles,
  AlertTriangle,
  HelpCircle,
  CheckCircle2,
  RefreshCw,
  Cpu,
  Layers,
  FileCheck,
} from 'lucide-react';
import { api } from '../api/client';
import type { ClarificationAnswer } from '../types';

export const ProposalPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [useFallback, setUseFallback] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [revisionSuccessMsg, setRevisionSuccessMsg] = useState<string | null>(null);

  const { data: proposal, isLoading, refetch } = useQuery({
    queryKey: ['agentProposal'],
    queryFn: () => api.proposePlan(useFallback),
    staleTime: Infinity, // Keep proposal in memory
  });

  const reviseMutation = useMutation({
    mutationFn: (answersList: ClarificationAnswer[]) =>
      api.reviseProposal(answersList, proposal?.field_mappings),
    onSuccess: (data) => {
      queryClient.setQueryData(['agentProposal'], data);
      queryClient.invalidateQueries({ queryKey: ['activePlan'] });
      setRevisionSuccessMsg('Proposal revised! A new immutable plan version has been created in draft status.');
      setTimeout(() => setRevisionSuccessMsg(null), 6000);
    },
  });

  const handleAnswerChange = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleReviseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const answersList: ClarificationAnswer[] = Object.entries(answers).map(([qid, val]) => ({
      question_id: qid,
      selected_option_or_text: val,
    }));
    reviseMutation.mutate(answersList);
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      case 'medium':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'low':
      default:
        return 'bg-sky-500/20 text-sky-300 border-sky-500/40';
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <BrainCircuit className="w-6 h-6 text-indigo-400" />
            AI Migration Proposal & Clarifications
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            The AI agent inspects source schemas, dirty samples, and whitelist rules to propose deterministic mappings.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-300 bg-slate-900/80 px-3 py-2 rounded-lg border border-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={useFallback}
              onChange={(e) => setUseFallback(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-indigo-500 focus:ring-0"
            />
            <span>Deterministic Fallback Mode</span>
          </label>

          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'Analyzing...' : 'Re-run Agent Proposal'}
          </button>
        </div>
      </div>

      {revisionSuccessMsg && (
        <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          {revisionSuccessMsg}
        </div>
      )}

      {/* Agent Status Badge */}
      {proposal && (
        <div className="glass-panel p-4 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Agent Engine Source:</span>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold ${proposal.source === 'llm'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                  : 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              {proposal.source === 'llm' ? 'Anthropic Claude 3.5 Sonnet' : 'Deterministic Heuristic Fallback Agent'}
            </span>
          </div>
          <div className="text-slate-400">
            Read-only Tools Executed: <span className="text-slate-200 font-mono">{proposal.tools_called.length}</span> (Isolation Enforced)
          </div>
        </div>
      )}

      {/* Proposal Summary Card */}
      {proposal && (
        <div className="glass-panel p-5 rounded-xl border border-slate-800">
          <h2 className="text-sm font-semibold text-white uppercase font-mono tracking-wider text-indigo-400 mb-2">
            Proposed Migration Strategy
          </h2>
          <p className="text-sm text-slate-300 mb-4">{proposal.proposed_migration_plan.summary}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {proposal.proposed_migration_plan.ordered_steps.map((step, idx) => (
              <div
                key={idx}
                className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80 text-xs text-slate-300 flex items-center gap-2"
              >
                <span className="w-5 h-5 rounded-full bg-indigo-600/30 text-indigo-400 flex items-center justify-center font-mono text-[10px] shrink-0">
                  {idx + 1}
                </span>
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Field Mappings Table */}
      <div className="glass-panel p-5 rounded-xl border border-slate-800">
        <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
          <Layers className="w-5 h-5 text-indigo-400" />
          Proposed Field Mappings & Rule Pipelines
        </h2>

        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 text-slate-400 font-mono text-[11px] uppercase border-b border-slate-800">
              <tr>
                <th className="px-3 py-2.5">Target Field</th>
                <th className="px-3 py-2.5">Source Fields</th>
                <th className="px-3 py-2.5">Transformation Rules</th>
                <th className="px-3 py-2.5">Confidence</th>
                <th className="px-3 py-2.5">Agent Rationale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-400 font-sans">
                    Generating mapping proposal...
                  </td>
                </tr>
              ) : (
                proposal?.field_mappings.map((m) => (
                  <tr key={m.target_field} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-3 py-3 font-mono font-semibold text-emerald-300">
                      {m.target_field}
                    </td>
                    <td className="px-3 py-3 font-mono text-sky-300">
                      {m.source_fields.length > 0 ? m.source_fields.join(', ') : <span className="text-slate-500 italic">None (Default)</span>}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {m.transformations.map((t, tidx) => (
                          <span
                            key={tidx}
                            className="bg-indigo-950/60 text-indigo-300 border border-indigo-800/40 px-2 py-0.5 rounded text-[10px] font-mono"
                          >
                            {t.rule}
                            {t.params && Object.keys(t.params).length > 0 && `(${JSON.stringify(t.params)})`}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full"
                            style={{ width: `${Math.round(m.confidence * 100)}%` }}
                          />
                        </div>
                        <span className="font-mono text-[10px] text-slate-300">
                          {Math.round(m.confidence * 100)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-300 text-[11px] max-w-xs">{m.rationale}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Risks & Incompatible Fields Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Risks */}
        <div className="glass-panel p-5 rounded-xl border border-slate-800">
          <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            Detected Data & Schema Risks
          </h2>
          <div className="space-y-2.5">
            {proposal?.risks.map((risk, idx) => (
              <div
                key={idx}
                className="bg-slate-900/60 p-3 rounded-lg border border-slate-800 flex items-start gap-2.5"
              >
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold border ${getSeverityBadge(
                    risk.severity
                  )}`}
                >
                  {risk.severity}
                </span>
                <div className="text-xs">
                  <p className="text-slate-200">{risk.description}</p>
                  {risk.affected_fields.length > 0 && (
                    <span className="text-[10px] font-mono text-slate-400 mt-1 block">
                      Affected: {risk.affected_fields.join(', ')}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Incompatible / Missing Fields */}
        <div className="glass-panel p-5 rounded-xl border border-slate-800">
          <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-sky-400" />
            Incompatible & Unmapped Fields
          </h2>
          <div className="space-y-2.5">
            {proposal?.incompatible_or_missing_fields.map((field, idx) => (
              <div
                key={idx}
                className="bg-slate-900/60 p-3 rounded-lg border border-slate-800 text-xs space-y-1"
              >
                <div className="font-mono font-semibold text-sky-300">{field.field_name}</div>
                <p className="text-slate-300 text-[11px]">{field.description}</p>
                <div className="text-[11px] text-amber-300/90 font-medium">
                  Suggestion: {field.suggestion}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Clarification Q&A Form */}
      {proposal && proposal.clarification_questions.length > 0 && (
        <div className="glass-panel p-5 rounded-xl border border-indigo-900/40 bg-gradient-to-b from-indigo-950/20 to-slate-950/40">
          <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            Human-in-the-Loop Clarification Questions
          </h2>
          <p className="text-xs text-slate-400 mb-5">
            Answer the agent's questions below. Submitting answers will revise the proposal and create a new immutable plan version.
          </p>

          <form onSubmit={handleReviseSubmit} className="space-y-4">
            {proposal.clarification_questions.map((q) => (
              <div key={q.id} className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 text-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono font-bold text-indigo-400">{q.id}</span>
                  <span className="text-[10px] font-mono bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
                    Affects: {q.affects_field}
                  </span>
                </div>
                <p className="text-slate-200 font-medium text-sm mb-3">{q.question}</p>

                {/* Suggested Options */}
                {q.suggested_options.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {q.suggested_options.map((opt) => (
                      <button
                        type="button"
                        key={opt}
                        onClick={() => handleAnswerChange(q.id, opt)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${(answers[q.id] || q.user_answer) === opt
                            ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                            : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                          }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}

                {/* Custom Answer Input */}
                <input
                  type="text"
                  placeholder="Or write custom answer..."
                  value={answers[q.id] || ''}
                  onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            ))}

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={reviseMutation.isPending}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50"
              >
                <FileCheck className="w-4 h-4" />
                {reviseMutation.isPending ? 'Revising Proposal...' : 'Revise Proposal (Creates New Version)'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
