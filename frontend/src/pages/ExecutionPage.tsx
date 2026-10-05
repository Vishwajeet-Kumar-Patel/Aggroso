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
  RefreshCw,
} from 'lucide-react';
import { api } from '../api/client';
import type { MigrationRun } from '../types';
import { usePageTitle } from '../hooks/usePageTitle';

export const ExecutionPage: React.FC = () => {
  usePageTitle('Execution');

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div>
        <h1 className="page-title">Migration Execution & Reconciliation</h1>
        <p className="page-subtitle">
          Execute accepted records into the target store with server-side approval gates and idempotency protection.
        </p>
      </div>

      {/* Approval Gate Status Banner */}
      <div className={isApproved ? 'banner-success' : 'banner-warning'}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <div style={{ marginTop: '2px' }}>
              {isApproved ? <Unlock size={18} /> : <Lock size={18} />}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                {isApproved
                  ? `Approval Gate Unlocked: Plan Version v${activeVersion?.version_num} is Approved`
                  : `Approval Gate Locked: Plan Version v${activeVersion?.version_num || 1} (${activeVersion?.status || 'draft'})`}
              </div>
              <div style={{ fontSize: '0.8125rem', marginTop: '2px', opacity: 0.9 }}>
                {isApproved
                  ? `Approved by ${activeVersion?.approver} on ${new Date(activeVersion?.approved_at!).toLocaleString()} (Hash: ${activeVersion?.content_hash.substring(0, 10)}...)`
                  : 'Execution is blocked on the server until a human signs off in the Plan Editor.'}
              </div>
            </div>
          </div>

          {!isApproved && (
            <a
              href="/plans"
              className="btn btn-secondary btn-sm"
            >
              Go to Approval Gate
            </a>
          )}
        </div>
      </div>

      {/* Execution Actions Control Panel */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
          <Activity size={18} style={{ color: 'var(--color-accent)' }} />
          Execution Control Center & Fault Simulation
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', alignItems: 'end' }}>
          {/* Fault Injection input */}
          <div>
            <label className="label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Bug size={14} style={{ color: 'var(--color-warning)' }} />
              Fault Injection (Mid-run Failure Hook):
            </label>
            <input
              type="number"
              placeholder="e.g. 5 (crash at record #5)"
              value={simulateFaultIndex}
              onChange={(e) => setSimulateFaultIndex(e.target.value)}
              className="input"
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: '4px', display: 'block' }}>
              Leave blank for clean run. Use 5 to test transactional retry.
            </span>
          </div>

          {/* Execute Button */}
          <div>
            <button
              onClick={() => setShowConfirmExec(true)}
              disabled={!isApproved || executeMutation.isPending}
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center' }}
            >
              <PlayCircle size={16} />
              {executeMutation.isPending ? 'Executing...' : 'Execute Migration Run'}
            </button>
          </div>

          {/* Retry & Rollback buttons */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => retryMutation.mutate()}
              disabled={!latestRun || latestRun.status !== 'failed' || retryMutation.isPending}
              className="btn btn-secondary"
              style={{ flex: 1, justifyContent: 'center' }}
            >
              <RotateCcw size={14} className={retryMutation.isPending ? 'spin' : ''} />
              Retry Run
            </button>

            <button
              onClick={() => setShowConfirmRollback(true)}
              disabled={!latestRun || latestRun.status === 'rolled_back' || rollbackMutation.isPending}
              className="btn btn-danger"
              style={{ flex: 1, justifyContent: 'center' }}
            >
              <RotateCcw size={14} />
              Rollback
            </button>
          </div>
        </div>

        {/* Error Notification if Execution Failed */}
        {latestRun?.status === 'failed' && (
          <div className="banner-danger">
            <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <ShieldAlert size={16} />
              Migration Run Failed ({latestRun.error_details})
            </div>
            <p style={{ fontSize: '0.8125rem', margin: 0 }}>
              The target database transaction was automatically rolled back. You can retry the run to resume execution without duplicate insertions.
            </p>
          </div>
        )}
      </div>

      {/* Live Run Metrics Cards */}
      {latestRun && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div className="stat-block">
            <div className="stat-label">RUN STATUS</div>
            <div className="stat-number" style={{
              fontSize: '1.25rem',
              color: latestRun.status === 'completed'
                ? 'var(--color-success)'
                : latestRun.status === 'failed'
                ? 'var(--color-danger)'
                : latestRun.status === 'rolled_back'
                ? 'var(--color-warning)'
                : 'var(--color-accent)'
            }}>
              {latestRun.status.toUpperCase()}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              ID: {latestRun.id.substring(0, 12)}...
            </div>
          </div>

          <div className="stat-block">
            <div className="stat-label">INSERTED ROWS</div>
            <div className="stat-number">{latestRun.inserted_count}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: '4px' }}>
              Committed to target store
            </div>
          </div>

          <div className="stat-block">
            <div className="stat-label">SKIPPED EXISTING</div>
            <div className="stat-number">{latestRun.skipped_existing_count}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: '4px' }}>
              Idempotency conflict prevented
            </div>
          </div>

          <div className="stat-block">
            <div className="stat-label">TOTAL ACCEPTED</div>
            <div className="stat-number">{latestRun.total_accepted}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: '4px' }}>
              Target expected count
            </div>
          </div>
        </div>
      )}

      {/* Automated 3-Point Reconciliation Panel */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <Database size={18} style={{ color: 'var(--color-accent)' }} />
              Automated 3-Point Reconciliation Engine
            </h2>
            <p className="page-subtitle" style={{ marginTop: '2px' }}>
              Continuously verifies invariants and key-set parity between source dataset, dry-run, and target store.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {reconciliation && (
              <span className={reconciliation.overall_status === 'PASS' ? 'badge-success' : 'badge-danger'}>
                STATUS: {reconciliation.overall_status}
              </span>
            )}

            <button
              onClick={() => runReconciliation()}
              disabled={recLoading}
              className="btn btn-secondary btn-sm"
            >
              <RefreshCw size={14} className={recLoading ? 'spin' : ''} />
              Re-verify
            </button>
          </div>
        </div>

        {/* Checks Table */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {reconciliation?.checks.map((check, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 16px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius)',
                backgroundColor: check.status === 'PASS' ? 'var(--color-bg)' : 'var(--color-danger-soft)',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', maxWidth: '65%' }}>
                <div style={{ marginTop: '2px' }}>
                  {check.status === 'PASS' ? (
                    <CheckCircle2 size={16} style={{ color: 'var(--color-success)' }} />
                  ) : (
                    <XCircle size={16} style={{ color: 'var(--color-danger)' }} />
                  )}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{check.name}</div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-muted)' }}>{check.description}</div>
                  {check.discrepancy_details && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-danger)', marginTop: '4px', fontFamily: 'monospace' }}>
                      {check.discrepancy_details}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.8125rem', textAlign: 'right' }}>
                <div>
                  <span style={{ fontSize: '0.6875rem', color: 'var(--color-muted)', display: 'block' }}>Expected</span>
                  <code>{String(check.expected)}</code>
                </div>
                <div>
                  <span style={{ fontSize: '0.6875rem', color: 'var(--color-muted)', display: 'block' }}>Actual</span>
                  <code>{String(check.actual)}</code>
                </div>
                <div>
                  <span className={check.status === 'PASS' ? 'badge-success' : 'badge-danger'}>
                    {check.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Confirmation Modal - Execute */}
      {showConfirmExec && (
        <div className="dialog-overlay" onClick={() => setShowConfirmExec(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-header">
              <h3 className="dialog-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <PlayCircle size={18} style={{ color: 'var(--color-accent)' }} />
                Confirm Migration Execution
              </h3>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', marginBottom: '20px' }}>
              You are about to insert accepted records for approved plan version{' '}
              <strong>v{activeVersion?.version_num}</strong> into the target database.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setShowConfirmExec(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => executeMutation.mutate()}
                disabled={executeMutation.isPending}
                className="btn btn-primary"
              >
                {executeMutation.isPending ? 'Executing...' : 'Confirm & Execute'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal - Rollback */}
      {showConfirmRollback && (
        <div className="dialog-overlay" onClick={() => setShowConfirmRollback(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-header">
              <h3 className="dialog-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <RotateCcw size={18} style={{ color: 'var(--color-danger)' }} />
                Confirm Rollback
              </h3>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', marginBottom: '20px' }}>
              This will delete all records in the target store associated with run{' '}
              <code>{latestRun?.id}</code> inside a single database transaction.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setShowConfirmRollback(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => rollbackMutation.mutate()}
                disabled={rollbackMutation.isPending}
                className="btn btn-danger"
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
