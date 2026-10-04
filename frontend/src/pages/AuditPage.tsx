import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  History,
  ShieldCheck,
  Filter,
  Code2,
  Clock,
  CheckCircle2,
  AlertOctagon,
  FileCode,
  RotateCcw,
  PlayCircle,
  Cpu,
} from 'lucide-react';
import { api } from '../api/client';

export const AuditPage: React.FC = () => {
  const [selectedEventType, setSelectedEventType] = useState<string>('');
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  const { data: events, isLoading } = useQuery({
    queryKey: ['auditEvents', selectedEventType],
    queryFn: () => api.getAuditEvents(selectedEventType || undefined, undefined, undefined, 200),
    refetchInterval: 5000,
  });

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'agent_proposal':
        return <BrainIcon />;
      case 'approved':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case 'rejected':
        return <AlertOctagon className="w-4 h-4 text-rose-400" />;
      case 'executed':
        return <PlayCircle className="w-4 h-4 text-emerald-400" />;
      case 'retried':
        return <RotateCcw className="w-4 h-4 text-amber-400" />;
      case 'rolled_back':
        return <RotateCcw className="w-4 h-4 text-rose-400" />;
      case 'dry_run':
        return <ShieldCheck className="w-4 h-4 text-sky-400" />;
      case 'reconciled':
        return <CheckCircle2 className="w-4 h-4 text-indigo-400" />;
      case 'plan_created':
      case 'plan_edited':
        return <FileCode className="w-4 h-4 text-indigo-400" />;
      case 'error':
        return <AlertOctagon className="w-4 h-4 text-rose-400" />;
      default:
        return <History className="w-4 h-4 text-slate-400" />;
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case 'approved':
      case 'executed':
        return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300';
      case 'rejected':
      case 'rolled_back':
      case 'error':
        return 'bg-rose-500/10 border-rose-500/30 text-rose-300';
      case 'retried':
        return 'bg-amber-500/10 border-amber-500/30 text-amber-300';
      case 'agent_proposal':
      case 'dry_run':
      case 'reconciled':
      case 'plan_created':
      case 'plan_edited':
      default:
        return 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300';
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <History className="w-6 h-6 text-indigo-400" />
            Append-Only Audit Trail & Compliance Log
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Complete cryptographic and provenance record of every proposal, plan revision, approval, execution, and rollback.
          </p>
        </div>

        {/* Immutability Guarantee Pill */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          Strictly Append-Only (Mutations Blocked)
        </div>
      </div>

      {/* Filter Bar */}
      <div className="glass-panel p-4 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-slate-400">Filter Event Type:</span>
          <select
            value={selectedEventType}
            onChange={(e) => setSelectedEventType(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
          >
            <option value="">All Event Types ({events?.length || 0})</option>
            <option value="agent_proposal">agent_proposal</option>
            <option value="plan_created">plan_created</option>
            <option value="plan_edited">plan_edited</option>
            <option value="approved">approved</option>
            <option value="rejected">rejected</option>
            <option value="dry_run">dry_run</option>
            <option value="executed">executed</option>
            <option value="retried">retried</option>
            <option value="reconciled">reconciled</option>
            <option value="rolled_back">rolled_back</option>
            <option value="error">error</option>
          </select>
        </div>

        <div className="text-slate-400">
          Showing <span className="text-white font-mono font-bold">{events?.length || 0}</span> recorded events
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="text-center py-12 text-slate-400 text-sm">Loading audit events...</div>
        ) : events?.length === 0 ? (
          <div className="glass-panel p-8 rounded-xl border border-slate-800 text-center text-slate-400 text-sm">
            No audit events found. Run a proposal, plan approval, or migration to generate logs.
          </div>
        ) : (
          events?.map((evt) => {
            const isExpanded = expandedEventId === evt.id;
            return (
              <div
                key={evt.id}
                className="glass-panel rounded-xl border border-slate-800 p-4 space-y-3 hover:border-slate-700 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                      {getEventIcon(evt.event_type)}
                    </div>
                    <div>
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border ${getEventColor(
                          evt.event_type
                        )}`}
                      >
                        {evt.event_type}
                      </span>
                      <span className="text-xs text-slate-400 ml-2 font-mono">
                        Actor: <span className="text-slate-200">{evt.actor}</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(evt.timestamp).toLocaleString()}
                    </span>
                    <button
                      onClick={() => setExpandedEventId(isExpanded ? null : evt.id)}
                      className="text-indigo-400 hover:text-indigo-300 font-semibold text-xs flex items-center gap-1"
                    >
                      <Code2 className="w-3.5 h-3.5" />
                      {isExpanded ? 'Hide Payload' : 'View Payload'}
                    </button>
                  </div>
                </div>

                {/* Provenance Tags */}
                {(evt.plan_version_id || evt.run_id) && (
                  <div className="flex flex-wrap gap-2 text-[10px] font-mono text-slate-400 pt-1">
                    {evt.plan_version_id && (
                      <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                        Plan Version ID: {evt.plan_version_id}
                      </span>
                    )}
                    {evt.run_id && (
                      <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                        Run ID: {evt.run_id}
                      </span>
                    )}
                  </div>
                )}

                {/* JSON Payload Inspector */}
                {isExpanded && (
                  <div className="pt-2 border-t border-slate-800">
                    <div className="text-[10px] font-mono text-slate-400 uppercase mb-1">
                      Immutable Event Payload JSON:
                    </div>
                    <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs font-mono text-sky-300 overflow-x-auto">
                      {JSON.stringify(evt.payload, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

const BrainIcon: React.FC = () => (
  <Cpu className="w-4 h-4 text-purple-400" />
);
