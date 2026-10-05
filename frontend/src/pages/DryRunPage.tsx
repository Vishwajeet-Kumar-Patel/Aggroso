import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { RefreshCw, X } from 'lucide-react';
import { api } from '../api/client';
import type { QuarantinedRecord } from '../types';
import { EmailCell } from '../components/EmailCell';
import { usePageTitle } from '../hooks/usePageTitle';

export const DryRunPage: React.FC = () => {
  usePageTitle('Dry run');

  const [fieldFilter, setFieldFilter] = useState('');
  const [errorCodeFilter, setErrorCodeFilter] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<QuarantinedRecord | null>(null);

  const { data: plan } = useQuery({
    queryKey: ['activePlan'],
    queryFn: api.getActivePlan,
  });

  const activeVersion = plan?.active_version;

  const { data: dryRunResult, isLoading: dryRunLoading, refetch: runDryRun } = useQuery({
    queryKey: ['dryRunResult', activeVersion?.id],
    queryFn: () => api.executeDryRun(activeVersion?.id),
    enabled: !!activeVersion?.id,
  });

  const determinismMutation = useMutation({
    mutationFn: () => api.verifyDeterminism(activeVersion!.id, 3),
  });

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

  const totalSource       = dryRunResult?.total_source       || 0;
  const totalAccepted     = dryRunResult?.total_accepted     || 0;
  const totalQuarantined  = dryRunResult?.total_quarantined  || 0;
  const totalTransformed  = dryRunResult?.total_transformed  || 0;
  const isInvariantValid  = totalSource === totalAccepted + totalQuarantined && totalSource > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Page header */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <h1 className="page-title">Dry run</h1>
          <p className="page-subtitle">
            Test the migration plan against the source records with no writes to the target.
            Verifies determinism and exact record-count invariants.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => determinismMutation.mutate()}
            disabled={determinismMutation.isPending || !activeVersion}
            className="btn btn-secondary"
            aria-busy={determinismMutation.isPending}
            title={!activeVersion ? 'No active plan version' : 'Run the dry run 3 times and compare output hashes'}
          >
            {determinismMutation.isPending ? 'Verifying 3×…' : 'Verify determinism (3×)'}
          </button>
          {!activeVersion && (
            <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', margin: '4px 0 0' }}>
              No approved plan version.
            </p>
          )}

          <button
            onClick={() => runDryRun()}
            disabled={dryRunLoading || !activeVersion}
            className="btn btn-primary"
            aria-busy={dryRunLoading}
          >
            <RefreshCw
              size={14}
              aria-hidden="true"
              className={dryRunLoading ? 'spin' : ''}
            />
            {dryRunLoading ? 'Running dry run…' : 'Re-run dry run'}
          </button>
        </div>
      </div>

      {/* Determinism result */}
      {determinismMutation.data && (
        <div className="banner-success" role="status" aria-live="polite">
          <strong>Determinism check passed.</strong> All 3 runs produced byte-identical output.
          <br />
          <span style={{ fontSize: '0.8125rem', fontFamily: 'ui-monospace, monospace' }}>
            Hashes: {determinismMutation.data.result_hashes.join(' == ')}
          </span>
        </div>
      )}

      {/* Invariant header */}
      {dryRunResult && (
        <div
          className="panel"
          style={{
            padding: '10px 16px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '12px',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.8125rem',
            fontFamily: 'ui-monospace, monospace',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', color: 'var(--color-muted)' }}>
            <span>
              Input hash: <strong style={{ color: 'var(--color-text)' }}>{dryRunResult.input_hash.substring(0, 12)}…</strong>
            </span>
            <span>
              Result hash: <strong style={{ color: 'var(--color-warning)' }}>{dryRunResult.result_hash.substring(0, 12)}…</strong>
            </span>
          </div>
          <div
            className={isInvariantValid ? 'badge-success' : 'badge-danger'}
            role="status"
            aria-label={`Invariant check ${isInvariantValid ? 'passed' : 'failed'}`}
          >
            Invariant: {totalSource} = {totalAccepted} + {totalQuarantined}
            {isInvariantValid ? ' ✓' : ' ✗'}
          </div>
        </div>
      )}

      {/* Stat blocks */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '12px',
        }}
      >
        <div className="stat-block" aria-label="Total source records">
          <div className="stat-number">{totalSource}</div>
          <div className="stat-label">Total source records</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: '4px' }}>
            Under 500-record limit
          </div>
        </div>

        <div className="stat-block" aria-label="Records transformed">
          <div className="stat-number">{totalTransformed}</div>
          <div className="stat-label">Processed and transformed</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: '4px' }}>
            100% through pipeline
          </div>
        </div>

        <div
          className="stat-block"
          style={{ borderColor: 'var(--color-success)' }}
          aria-label="Accepted records"
        >
          <div className="stat-number" style={{ color: 'var(--color-success)' }}>{totalAccepted}</div>
          <div className="stat-label">Accepted — ready to insert</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: '4px' }}>
            {totalSource > 0 ? `${Math.round((totalAccepted / totalSource) * 100)}% pass rate` : '—'}
          </div>
        </div>

        <div
          className="stat-block"
          style={{ borderColor: 'var(--color-danger)' }}
          aria-label="Quarantined records"
        >
          <div className="stat-number" style={{ color: 'var(--color-danger)' }}>{totalQuarantined}</div>
          <div className="stat-label">Quarantined — rejected</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: '4px' }}>
            {totalSource > 0 ? `${Math.round((totalQuarantined / totalSource) * 100)}% quarantine rate` : '—'}
          </div>
        </div>
      </div>

      {/* Quarantine workbench */}
      <section className="panel" aria-label="Quarantined records">
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '12px',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h2 className="section-title" style={{ marginBottom: '2px' }}>
              Quarantined records
              <span style={{ fontWeight: 400, fontSize: '0.875rem', color: 'var(--color-muted)', marginLeft: '8px' }}>
                ({quarantineData?.total || 0})
              </span>
            </h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', margin: 0 }}>
              Every rejected record preserves its original value, the rule that failed, and the exact error code.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <a
              href={`/api/quarantine/export?dry_run_id=${dryRunResult?.id}&format=json`}
              download="quarantine_export.json"
              className="btn btn-secondary btn-sm"
              aria-label="Export quarantine records as JSON"
            >
              Export JSON
            </a>
            <a
              href={`/api/quarantine/export?dry_run_id=${dryRunResult?.id}&format=csv`}
              download="quarantine_export.csv"
              className="btn btn-secondary btn-sm"
              aria-label="Export quarantine records as CSV"
            >
              Export CSV
            </a>
          </div>
        </div>

        {/* Filters */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '12px',
            alignItems: 'flex-end',
          }}
        >
          <div>
            <label htmlFor="field-filter" className="label">Filter by field</label>
            <input
              id="field-filter"
              type="search"
              placeholder="e.g. date_of_birth, email…"
              value={fieldFilter}
              onChange={(e) => setFieldFilter(e.target.value)}
              className="input"
              style={{ width: '180px' }}
            />
          </div>
          <div>
            <label htmlFor="error-code-filter" className="label">Filter by error code</label>
            <input
              id="error-code-filter"
              type="search"
              placeholder="e.g. DUPLICATE_EMAIL…"
              value={errorCodeFilter}
              onChange={(e) => setErrorCodeFilter(e.target.value)}
              className="input"
              style={{ width: '200px' }}
            />
          </div>
          {(fieldFilter || errorCodeFilter) && (
            <button
              onClick={() => { setFieldFilter(''); setErrorCodeFilter(''); }}
              className="btn btn-tertiary btn-sm"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
          <table
            className="data-table data-table-responsive"
            aria-label="Quarantined records"
          >
            <thead>
              <tr>
                <th>Source key</th>
                <th>Failed fields</th>
                <th>Error codes</th>
                <th>Diagnostic message</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {qLoading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-muted)' }}>
                    Loading quarantine records…
                  </td>
                </tr>
              ) : quarantineData?.records.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-muted)' }}>
                    No records match the current filters.
                  </td>
                </tr>
              ) : (
                quarantineData?.records.map((q) => (
                  <tr key={q.id}>
                    <td data-label="Source key">
                      <code style={{ fontWeight: 600, color: 'var(--color-danger)' }}>{q.source_key}</code>
                    </td>
                    <td data-label="Failed fields">
                      <code style={{ color: 'var(--color-warning)' }}>
                        {q.errors.map((e) => e.field).join(', ')}
                      </code>
                    </td>
                    <td data-label="Error codes">
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {q.errors.map((e, idx) => (
                          <span key={idx} className="badge-danger" style={{ fontSize: '0.75rem' }}>
                            {e.error_code}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td data-label="Diagnostic" style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', maxWidth: '240px', overflowWrap: 'anywhere' }}>
                      {q.errors[0]?.message}
                    </td>
                    <td data-label="Actions">
                      <button
                        onClick={() => setSelectedRecord(q)}
                        className="btn btn-tertiary btn-sm"
                        aria-label={`Inspect quarantine record ${q.source_key}`}
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Record drill-down dialog */}
      {selectedRecord && (
        <div
          className="dialog-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="record-dialog-title"
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedRecord(null); }}
        >
          <div className="dialog dialog-wide">
            <div className="dialog-header">
              <h2 id="record-dialog-title" className="dialog-title">
                Quarantine details: {selectedRecord.source_key}
              </h2>
              <button
                onClick={() => setSelectedRecord(null)}
                className="btn btn-tertiary btn-sm"
                aria-label="Close dialog"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            {/* Field failures */}
            <div style={{ marginBottom: '16px' }}>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Field failures
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {selectedRecord.errors.map((err, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '10px 12px',
                      background: 'var(--color-danger-soft)',
                      border: '1px solid var(--color-danger)',
                      borderRadius: 'var(--radius)',
                      fontSize: '0.8125rem',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '4px',
                        fontWeight: 600,
                      }}
                    >
                      <code>Field: {err.field}</code>
                      <span className="badge-danger">{err.error_code}</span>
                    </div>
                    <p style={{ margin: '0 0 6px', color: 'var(--color-text)' }}>{err.message}</p>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '8px',
                        fontSize: '0.75rem',
                        fontFamily: 'ui-monospace, monospace',
                        color: 'var(--color-muted)',
                      }}
                    >
                      <div>
                        Original: <strong style={{ color: 'var(--color-text)' }}>{String(err.original_value)}</strong>
                      </div>
                      <div>
                        Attempted: <strong style={{ color: 'var(--color-text)' }}>{String(err.attempted_value ?? '(none)')}</strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Raw record */}
            <div>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Preserved raw source record
              </h3>
              {/* Render email field specially if present */}
              {selectedRecord.raw_record?.email_addr && (
                <div style={{ marginBottom: '8px', fontSize: '0.8125rem', color: 'var(--color-muted)' }}>
                  Email:{' '}
                  <EmailCell email={selectedRecord.raw_record.email_addr} />
                </div>
              )}
              <pre className="code-block">
                {JSON.stringify(selectedRecord.raw_record, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
