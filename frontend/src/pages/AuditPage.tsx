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
import { usePageTitle } from '../hooks/usePageTitle';

export const AuditPage: React.FC = () => {
  usePageTitle('Audit Log');

  const [selectedEventType, setSelectedEventType] = useState<string>('');
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  const { data: events, isLoading } = useQuery({
    queryKey: ['auditEvents', selectedEventType],
    queryFn: () => api.getAuditEvents(selectedEventType || undefined, undefined, undefined, 200),
    refetchInterval: 5000,
  });

  const getEventBadge = (type: string) => {
    switch (type) {
      case 'approved':
      case 'executed':
        return 'badge-success';
      case 'rejected':
      case 'rolled_back':
      case 'error':
        return 'badge-danger';
      case 'retried':
        return 'badge-warning';
      case 'agent_proposal':
      case 'dry_run':
      case 'reconciled':
      case 'plan_created':
      case 'plan_edited':
      default:
        return 'badge-accent';
    }
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'agent_proposal':
        return <Cpu size={15} style={{ color: 'var(--color-accent)' }} />;
      case 'approved':
        return <CheckCircle2 size={15} style={{ color: 'var(--color-success)' }} />;
      case 'rejected':
        return <AlertOctagon size={15} style={{ color: 'var(--color-danger)' }} />;
      case 'executed':
        return <PlayCircle size={15} style={{ color: 'var(--color-success)' }} />;
      case 'retried':
        return <RotateCcw size={15} style={{ color: 'var(--color-warning)' }} />;
      case 'rolled_back':
        return <RotateCcw size={15} style={{ color: 'var(--color-danger)' }} />;
      case 'dry_run':
        return <ShieldCheck size={15} style={{ color: 'var(--color-accent)' }} />;
      case 'reconciled':
        return <CheckCircle2 size={15} style={{ color: 'var(--color-accent)' }} />;
      case 'plan_created':
      case 'plan_edited':
        return <FileCode size={15} style={{ color: 'var(--color-accent)' }} />;
      case 'error':
        return <AlertOctagon size={15} style={{ color: 'var(--color-danger)' }} />;
      default:
        return <History size={15} style={{ color: 'var(--color-muted)' }} />;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 className="page-title">Append-Only Audit Trail & Compliance Log</h1>
          <p className="page-subtitle">
            Cryptographic and provenance record of every proposal, plan revision, approval, execution, and rollback.
          </p>
        </div>

        {/* Immutability Guarantee Pill */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          borderRadius: 'var(--radius)',
          background: 'var(--color-success-soft)',
          border: '1px solid var(--color-success)',
          color: 'var(--color-success)',
          fontSize: '0.75rem',
          fontWeight: 600,
        }}>
          <ShieldCheck size={14} />
          Strictly Append-Only (Mutations Blocked)
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Filter size={15} style={{ color: 'var(--color-muted)' }} />
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', fontWeight: 500 }}>Filter Event Type:</span>
          <select
            value={selectedEventType}
            onChange={(e) => setSelectedEventType(e.target.value)}
            className="select"
            style={{ padding: '4px 8px', fontSize: '0.8125rem' }}
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

        <div style={{ fontSize: '0.8125rem', color: 'var(--color-muted)' }}>
          Showing <strong>{events?.length || 0}</strong> recorded events
        </div>
      </div>

      {/* Timeline */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--color-muted)', fontSize: '0.875rem' }}>
            Loading audit events...
          </div>
        ) : events?.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '32px', color: 'var(--color-muted)', fontSize: '0.875rem' }}>
            No audit events found. Run a proposal, plan approval, or migration to generate logs.
          </div>
        ) : (
          events?.map((evt) => {
            const isExpanded = expandedEventId === evt.id;
            return (
              <div
                key={evt.id}
                className="card"
                style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '28px',
                      height: '28px',
                      borderRadius: 'var(--radius)',
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                    }}>
                      {getEventIcon(evt.event_type)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span className={getEventBadge(evt.event_type)}>
                        {evt.event_type}
                      </span>
                      <span style={{ fontSize: '0.8125rem', color: 'var(--color-muted)' }}>
                        Actor: <strong style={{ color: 'var(--color-text)' }}>{evt.actor}</strong>
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.8125rem', color: 'var(--color-muted)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={13} />
                      {new Date(evt.timestamp).toLocaleString()}
                    </span>
                    <button
                      onClick={() => setExpandedEventId(isExpanded ? null : evt.id)}
                      className="btn btn-tertiary btn-sm"
                      style={{ padding: '2px 6px' }}
                    >
                      <Code2 size={13} />
                      {isExpanded ? 'Hide Payload' : 'View Payload'}
                    </button>
                  </div>
                </div>

                {/* Provenance Tags */}
                {(evt.plan_version_id || evt.run_id) && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '0.75rem' }}>
                    {evt.plan_version_id && (
                      <span className="badge-neutral">
                        Plan Version ID: {evt.plan_version_id}
                      </span>
                    )}
                    {evt.run_id && (
                      <span className="badge-neutral">
                        Run ID: {evt.run_id}
                      </span>
                    )}
                  </div>
                )}

                {/* JSON Payload Inspector */}
                {isExpanded && (
                  <div style={{ paddingTop: '8px', borderTop: '1px solid var(--color-border)' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-muted)', marginBottom: '4px' }}>
                      EVENT PAYLOAD JSON:
                    </div>
                    <pre className="code-block" style={{ margin: 0 }}>
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
