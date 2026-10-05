import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { api } from '../api/client';
import { EmailCell } from '../components/EmailCell';
import { usePageTitle } from '../hooks/usePageTitle';

/** Returns an anomaly descriptor if the record has a known data quality issue. */
const getRecordAnomaly = (rec: Record<string, any>): { text: string; type: 'danger' | 'warning' | 'info' } | null => {
  if (rec.dob === '31/02/1990') return { text: 'Invalid date (Feb 31)', type: 'danger' };
  if (rec.dob === 'N/A') return { text: 'Malformed date', type: 'danger' };
  if (rec.email_addr?.includes('-invalid-email')) return { text: 'Malformed email', type: 'danger' };
  if (rec.email_addr === 'duplicate.email@example.com') return { text: 'Duplicate email', type: 'warning' };
  if (rec.cust_id === 'CUST-0005' && rec.full_name?.includes('Duplicate')) return { text: 'Duplicate cust_id', type: 'danger' };
  if (rec.full_name === 'Cher') return { text: 'Single-word name', type: 'warning' };
  if (rec.full_name === '') return { text: 'Missing name', type: 'danger' };
  if (rec.credit_limit?.startsWith('-')) return { text: 'Negative credit', type: 'danger' };
  if (rec.credit_limit === 'unlimited') return { text: 'Non-numeric credit', type: 'danger' };
  if (rec.country_code === 'ZZ') return { text: 'Invalid country (ZZ)', type: 'danger' };
  if (rec.status_flag === 'UNKNOWN_FLAG' || rec.status_flag === '') return { text: 'Unmapped status', type: 'warning' };
  if (rec.full_name?.startsWith('  ')) return { text: 'Whitespace padding', type: 'info' };
  return null;
};

const AnomalyBadge: React.FC<{ anomaly: { text: string; type: 'danger' | 'warning' | 'info' } }> = ({ anomaly }) => (
  <span
    className={`badge-${anomaly.type === 'info' ? 'neutral' : anomaly.type}`}
    style={{ fontSize: '0.75rem' }}
  >
    {anomaly.text}
  </span>
);

export const SchemasPage: React.FC = () => {
  usePageTitle('Schemas and sample data');

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
      setFeedbackMsg(`Loaded ${res.record_count} records from "${selectedScenario}".`);
      setTimeout(() => setFeedbackMsg(null), 4000);
    },
    onError: (err: any) => {
      setFeedbackMsg(`Error loading scenario: ${err.message}`);
    },
  });

  const totalPages = sampleData ? Math.ceil(sampleData.total / pageSize) : 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Page header */}
      <div>
        <h1 className="page-title">Schemas and sample data</h1>
        <p className="page-subtitle">
          Source and target schema comparison. The 60-record dataset contains
          intentional data quality issues for testing.
        </p>
      </div>

      {/* Schema comparison */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '16px',
        }}
      >
        {/* Source schema */}
        <section className="panel" aria-label="Source schema">
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--color-border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
            }}
          >
            <div>
              <span className="badge-warning" style={{ marginBottom: '4px', display: 'inline-block' }}>
                Source
              </span>
              <h2
                style={{
                  fontSize: '1rem',
                  fontWeight: 600,
                  color: 'var(--color-text)',
                  margin: '4px 0 2px',
                }}
              >
                {sourceSchema?.name || 'legacy_customers'}
              </h2>
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', margin: 0 }}>
                {sourceSchema?.description}
              </p>
            </div>
            <span style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>
              {sourceSchema?.fields.length || 0} fields
            </span>
          </div>

          <div style={{ padding: '8px', maxHeight: '400px', overflowY: 'auto' }}>
            {srcLoading ? (
              <p style={{ padding: '16px', textAlign: 'center', color: 'var(--color-muted)', fontSize: '0.875rem' }}>
                Loading…
              </p>
            ) : (
              sourceSchema?.fields.map((f) => (
                <div
                  key={f.name}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '8px',
                    padding: '8px',
                    borderBottom: '1px solid var(--color-border)',
                    fontSize: '0.8125rem',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <code style={{ fontWeight: 600, color: 'var(--color-text)', background: 'none', border: 'none', padding: 0 }}>
                        {f.name}
                      </code>
                      {sourceSchema.primary_key.includes(f.name) && (
                        <span className="badge-accent">PK</span>
                      )}
                      {!f.nullable && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-danger)' }}>required</span>
                      )}
                    </div>
                    {f.description && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: '2px' }}>
                        {f.description}
                      </div>
                    )}
                  </div>
                  <code style={{ fontSize: '0.75rem', color: 'var(--color-muted)', whiteSpace: 'nowrap', background: 'none', border: 'none', padding: 0 }}>
                    {f.type}
                  </code>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Target schema */}
        <section className="panel" aria-label="Target schema">
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--color-border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
            }}
          >
            <div>
              <span className="badge-success" style={{ marginBottom: '4px', display: 'inline-block' }}>
                Target (mock DB)
              </span>
              <h2
                style={{
                  fontSize: '1rem',
                  fontWeight: 600,
                  color: 'var(--color-text)',
                  margin: '4px 0 2px',
                }}
              >
                {targetSchema?.name || 'customers'}
              </h2>
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', margin: 0 }}>
                {targetSchema?.description}
              </p>
            </div>
            <span style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>
              {targetSchema?.fields.length || 0} fields
            </span>
          </div>

          <div style={{ padding: '8px', maxHeight: '400px', overflowY: 'auto' }}>
            {tgtLoading ? (
              <p style={{ padding: '16px', textAlign: 'center', color: 'var(--color-muted)', fontSize: '0.875rem' }}>
                Loading…
              </p>
            ) : (
              targetSchema?.fields.map((f) => (
                <div
                  key={f.name}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '8px',
                    padding: '8px',
                    borderBottom: '1px solid var(--color-border)',
                    fontSize: '0.8125rem',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <code style={{ fontWeight: 600, color: 'var(--color-text)', background: 'none', border: 'none', padding: 0 }}>
                        {f.name}
                      </code>
                      {targetSchema.primary_key.includes(f.name) && (
                        <span className="badge-accent">PK</span>
                      )}
                      {f.unique && <span className="badge-warning">unique</span>}
                      {!f.nullable && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-danger)' }}>required</span>
                      )}
                      {f.enum && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                          enum [{f.enum.join(', ')}]
                        </span>
                      )}
                    </div>
                    {f.description && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: '2px' }}>
                        {f.description}
                      </div>
                    )}
                  </div>
                  <code style={{ fontSize: '0.75rem', color: 'var(--color-muted)', whiteSpace: 'nowrap', background: 'none', border: 'none', padding: 0 }}>
                    {f.type}{f.format ? ` (${f.format})` : ''}
                  </code>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Sample records explorer */}
      <section className="panel" aria-label="Source dataset explorer">
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
              Source dataset explorer
              <span style={{ marginLeft: '8px', fontSize: '0.875rem', fontWeight: 400, color: 'var(--color-muted)' }}>
                ({sampleData?.total || 0} records)
              </span>
            </h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', margin: 0 }}>
              Showing active input records with data quality annotations.
            </p>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
            {/* Scenario selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label
                htmlFor="scenario-select"
                className="label"
                style={{ margin: 0, whiteSpace: 'nowrap' }}
              >
                Scenario
              </label>
              <select
                id="scenario-select"
                value={selectedScenario}
                onChange={(e) => setSelectedScenario(e.target.value)}
                className="select"
                aria-label="Select test scenario"
              >
                {(Array.isArray(scenariosData) ? scenariosData : (scenariosData as any)?.scenarios || []).map((s: any) => (
                  <option key={s.name} value={s.name}>
                    {s.name} ({s.record_count} records)
                  </option>
                ))}
              </select>
              <button
                id="load-scenario-btn"
                onClick={() => loadScenarioMutation.mutate(selectedScenario)}
                disabled={loadScenarioMutation.isPending}
                className="btn btn-secondary btn-sm"
                aria-busy={loadScenarioMutation.isPending}
              >
                <RefreshCw
                  size={13}
                  aria-hidden="true"
                  className={loadScenarioMutation.isPending ? 'spin' : ''}
                />
                Load
              </button>
            </div>

            {/* Pagination */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>
                Page {page + 1} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="btn btn-secondary btn-sm"
                aria-label="Previous page"
              >
                <ChevronLeft size={14} aria-hidden="true" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="btn btn-secondary btn-sm"
                aria-label="Next page"
              >
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        {feedbackMsg && (
          <div className="banner-info" style={{ margin: '12px 16px 0', borderRadius: 'var(--radius)' }}>
            {feedbackMsg}
          </div>
        )}

        {/* Responsive table */}
        <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
          <table
            className="data-table data-table-responsive"
            aria-label="Source records"
            style={{ minWidth: 0 }}
          >
            <thead>
              <tr>
                <th>ID</th>
                <th>Full name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>DOB</th>
                <th>Country</th>
                <th>Status</th>
                <th>Credit</th>
                <th>Anomalies</th>
              </tr>
            </thead>
            <tbody>
              {sampleLoading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-muted)' }}>
                    Loading records…
                  </td>
                </tr>
              ) : (
                sampleData?.records.map((rec, idx) => {
                  const anomaly = getRecordAnomaly(rec);
                  return (
                    <tr
                      key={`${rec.cust_id}-${idx}`}
                      style={anomaly ? { background: 'var(--color-warning-soft)' } : undefined}
                    >
                      <td data-label="ID">
                        <code style={{ fontWeight: 600, fontSize: '0.8125rem' }}>{rec.cust_id}</code>
                      </td>
                      <td data-label="Full name">{rec.full_name || '(empty)'}</td>
                      <td data-label="Email">
                        <EmailCell email={rec.email_addr} style={{ fontSize: '0.8125rem' } as React.CSSProperties} />
                      </td>
                      <td data-label="Phone" style={{ fontSize: '0.8125rem', color: 'var(--color-muted)' }}>
                        {rec.phone}
                      </td>
                      <td data-label="DOB" style={{ fontSize: '0.8125rem' }}>{rec.dob}</td>
                      <td data-label="Country" style={{ fontSize: '0.8125rem' }}>{rec.country_code}</td>
                      <td data-label="Status">
                        <span className="badge-neutral" style={{ fontSize: '0.75rem' }}>
                          {rec.status_flag || '(empty)'}
                        </span>
                      </td>
                      <td data-label="Credit" style={{ fontSize: '0.8125rem' }}>
                        ${rec.credit_limit}
                      </td>
                      <td data-label="Anomalies">
                        {anomaly ? (
                          <AnomalyBadge anomaly={anomaly} />
                        ) : (
                          <span className="badge-success" style={{ fontSize: '0.75rem' }}>Valid</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
