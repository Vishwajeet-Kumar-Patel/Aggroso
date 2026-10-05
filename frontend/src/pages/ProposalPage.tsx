import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { api } from '../api/client';
import type { ClarificationAnswer } from '../types';
import { usePageTitle } from '../hooks/usePageTitle';

const SeverityBadge: React.FC<{ severity: string }> = ({ severity }) => {
  const cls =
    severity === 'high'   ? 'badge-danger'   :
    severity === 'medium' ? 'badge-warning'  :
                            'badge-neutral';
  return <span className={cls}>{severity}</span>;
};

export const ProposalPage: React.FC = () => {
  usePageTitle('Proposal');

  const queryClient = useQueryClient();
  const [useFallback, setUseFallback] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [revisionMsg, setRevisionMsg] = useState<string | null>(null);

  const { data: proposal, isLoading, refetch } = useQuery({
    queryKey: ['agentProposal'],
    queryFn: () => api.proposePlan(useFallback),
    staleTime: Infinity,
  });

  const reviseMutation = useMutation({
    mutationFn: (answersList: ClarificationAnswer[]) =>
      api.reviseProposal(answersList, proposal?.field_mappings),
    onSuccess: (data) => {
      queryClient.setQueryData(['agentProposal'], data);
      queryClient.invalidateQueries({ queryKey: ['activePlan'] });
      setRevisionMsg('Proposal revised. A new plan version has been created in draft status.');
      setTimeout(() => setRevisionMsg(null), 6000);
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Page header */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '16px',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <h1 className="page-title">Proposal</h1>
          <p className="page-subtitle">
            The agent inspects source schemas and sample data to propose field
            mappings and transformation rules.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.875rem',
              color: 'var(--color-muted)',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={useFallback}
              onChange={(e) => setUseFallback(e.target.checked)}
              aria-label="Use deterministic fallback agent instead of LLM"
            />
            Deterministic fallback
          </label>

          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="btn btn-primary"
            aria-busy={isLoading}
          >
            <RefreshCw
              size={14}
              aria-hidden="true"
              className={isLoading ? 'spin' : ''}
            />
            {isLoading ? 'Running analysis…' : 'Run agent proposal'}
          </button>
        </div>
      </div>

      {revisionMsg && (
        <div className="banner-success" role="status" aria-live="polite">
          {revisionMsg}
        </div>
      )}

      {/* Agent source tag */}
      {proposal && (
        <div
          className="panel"
          style={{
            padding: '10px 16px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '12px',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.875rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: 'var(--color-muted)' }}>Source:</span>
            <span className={proposal.source === 'llm' ? 'badge-accent' : 'badge-neutral'}>
              {proposal.source === 'llm' ? 'LLM' : 'Fallback'}
            </span>
            <span style={{ color: 'var(--color-muted)' }}>
              {proposal.source === 'llm'
                ? 'Anthropic Claude'
                : 'Deterministic heuristic agent'}
            </span>
          </div>
          <div style={{ color: 'var(--color-muted)', fontSize: '0.8125rem' }}>
            Tools called: <strong style={{ color: 'var(--color-text)' }}>{proposal.tools_called.length}</strong>
            {' '}(read-only, isolation enforced)
          </div>
        </div>
      )}

      {/* Proposed migration strategy */}
      {proposal && (
        <section className="panel" aria-label="Proposed migration strategy">
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
            <h2 className="section-title" style={{ marginBottom: 0 }}>
              Proposed migration strategy
            </h2>
          </div>
          <div style={{ padding: '16px' }}>
            <p style={{ fontSize: '0.9375rem', color: 'var(--color-text)', marginBottom: '16px', lineHeight: '1.7' }}>
              {proposal.proposed_migration_plan.summary}
            </p>
            <ol
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              {proposal.proposed_migration_plan.ordered_steps.map((step, idx) => (
                <li
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    fontSize: '0.875rem',
                    color: 'var(--color-text)',
                    padding: '8px',
                    background: 'var(--color-surface)',
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <span
                    style={{
                      minWidth: '20px',
                      height: '20px',
                      background: 'var(--color-accent-soft)',
                      color: 'var(--color-accent)',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                    aria-hidden="true"
                  >
                    {idx + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {/* Field mappings table */}
      <section className="panel" aria-label="Proposed field mappings">
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
          <h2 className="section-title" style={{ marginBottom: 0 }}>
            Field mappings and transformation rules
          </h2>
        </div>

        <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
          <table className="data-table data-table-responsive" aria-label="Field mappings">
            <thead>
              <tr>
                <th>Target field</th>
                <th>Source fields</th>
                <th>Transformation rules</th>
                <th>Confidence</th>
                <th>Rationale</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-muted)' }}>
                    Running proposal analysis…
                  </td>
                </tr>
              ) : (
                proposal?.field_mappings.map((m) => (
                  <tr key={m.target_field}>
                    <td data-label="Target field">
                      <code style={{ fontWeight: 600, color: 'var(--color-success)' }}>{m.target_field}</code>
                    </td>
                    <td data-label="Source fields">
                      {m.source_fields.length > 0
                        ? <code style={{ color: 'var(--color-accent)' }}>{m.source_fields.join(', ')}</code>
                        : <span style={{ color: 'var(--color-muted)', fontStyle: 'italic' }}>None (default)</span>
                      }
                    </td>
                    <td data-label="Transformation rules">
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {m.transformations.map((t, tidx) => (
                          <code
                            key={tidx}
                            style={{
                              fontSize: '0.75rem',
                              background: 'var(--color-accent-soft)',
                              color: 'var(--color-accent)',
                              border: '1px solid var(--color-accent)',
                              borderRadius: '2px',
                              padding: '1px 5px',
                            }}
                          >
                            {t.rule}
                            {t.params && Object.keys(t.params).length > 0 && ` (${JSON.stringify(t.params)})`}
                          </code>
                        ))}
                      </div>
                    </td>
                    <td data-label="Confidence">
                      <div className="confidence-bar">
                        <div className="confidence-bar-track" aria-hidden="true">
                          <div
                            className="confidence-bar-fill"
                            style={{ width: `${Math.round(m.confidence * 100)}%` }}
                          />
                        </div>
                        <span style={{ fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums' }}>
                          {Math.round(m.confidence * 100)}%
                        </span>
                      </div>
                    </td>
                    <td data-label="Rationale" style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', maxWidth: '240px' }}>
                      {m.rationale}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Risks and incompatible fields */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '16px',
        }}
      >
        {/* Risks */}
        <section className="panel" aria-label="Detected risks">
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
            <h2 className="section-title" style={{ marginBottom: 0 }}>Detected risks</h2>
          </div>
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {proposal?.risks.map((risk, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'flex-start',
                  padding: '10px',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius)',
                }}
              >
                <SeverityBadge severity={risk.severity} />
                <div style={{ fontSize: '0.8125rem' }}>
                  <p style={{ margin: '0 0 2px', color: 'var(--color-text)' }}>{risk.description}</p>
                  {risk.affected_fields.length > 0 && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                      Affected: {risk.affected_fields.join(', ')}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Incompatible / missing fields */}
        <section className="panel" aria-label="Incompatible and unmapped fields">
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
            <h2 className="section-title" style={{ marginBottom: 0 }}>Incompatible and unmapped fields</h2>
          </div>
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {proposal?.incompatible_or_missing_fields.map((field, idx) => (
              <div
                key={idx}
                style={{
                  padding: '10px',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius)',
                  fontSize: '0.8125rem',
                }}
              >
                <div style={{ fontWeight: 600, color: 'var(--color-accent)', marginBottom: '3px' }}>
                  {field.field_name}
                </div>
                <p style={{ margin: '0 0 4px', color: 'var(--color-text)' }}>{field.description}</p>
                <div style={{ color: 'var(--color-warning)', fontSize: '0.75rem' }}>
                  Suggestion: {field.suggestion}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Clarification Q&A form */}
      {proposal && proposal.clarification_questions.length > 0 && (
        <section className="panel" aria-label="Clarification questions">
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
            <h2 className="section-title" style={{ marginBottom: '2px' }}>Clarification questions</h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', margin: 0 }}>
              Answer the questions below to revise the proposal and create a new plan version.
            </p>
          </div>

          <form onSubmit={handleReviseSubmit} style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {proposal.clarification_questions.map((q) => (
              <div
                key={q.id}
                style={{
                  padding: '14px',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    marginBottom: '6px',
                    flexWrap: 'wrap',
                    gap: '6px',
                  }}
                >
                  <code style={{ fontSize: '0.8125rem', color: 'var(--color-accent)' }}>{q.id}</code>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                    Affects: {q.affects_field}
                  </span>
                </div>
                <p style={{ fontWeight: 500, fontSize: '0.9375rem', color: 'var(--color-text)', margin: '0 0 10px' }}>
                  {q.question}
                </p>

                {q.suggested_options.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                    {q.suggested_options.map((opt) => (
                      <button
                        type="button"
                        key={opt}
                        onClick={() => handleAnswerChange(q.id, opt)}
                        className={`btn btn-sm ${(answers[q.id] || q.user_answer) === opt ? 'btn-primary' : 'btn-secondary'}`}
                        aria-pressed={(answers[q.id] || q.user_answer) === opt}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}

                <label htmlFor={`q-${q.id}`} className="label">
                  Custom answer
                </label>
                <input
                  id={`q-${q.id}`}
                  type="text"
                  placeholder="Write a custom answer…"
                  value={answers[q.id] || ''}
                  onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                  className="input"
                  aria-label={`Custom answer for question ${q.id}`}
                />
              </div>
            ))}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="submit"
                disabled={reviseMutation.isPending}
                className="btn btn-primary"
                aria-busy={reviseMutation.isPending}
              >
                {reviseMutation.isPending ? 'Revising…' : 'Revise proposal and create new version'}
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
};
