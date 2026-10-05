import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Save, X } from 'lucide-react';
import { api } from '../api/client';
import type { FieldMapping, PlanDefinition, PlanVersion } from '../types';
import { usePageTitle } from '../hooks/usePageTitle';

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const cls =
    status === 'approved'   ? 'badge-success'  :
    status === 'draft'      ? 'badge-warning'  :
    status === 'rejected'   ? 'badge-danger'   :
                              'badge-neutral';
  return <span className={cls}>{status}</span>;
};

export const PlanEditorPage: React.FC = () => {
  usePageTitle('Plan versions');

  const queryClient = useQueryClient();
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [diffV1Id, setDiffV1Id] = useState<string | null>(null);
  const [diffV2Id, setDiffV2Id] = useState<string | null>(null);
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [approverName, setApproverName] = useState('TechLead Reviewer');
  const [currentMappings, setCurrentMappings] = useState<FieldMapping[]>([]);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const { data: plan } = useQuery({
    queryKey: ['activePlan'],
    queryFn: api.getActivePlan,
  });

  const { data: versions } = useQuery({
    queryKey: ['planVersions', plan?.id],
    queryFn: () => (plan ? api.getPlanVersions(plan.id) : Promise.resolve([])),
    enabled: !!plan?.id,
  });

  const { data: transformRegistry } = useQuery({
    queryKey: ['transformRegistry'],
    queryFn: api.getTransformations,
  });

  useEffect(() => {
    if (versions && versions.length > 0 && !selectedVersionId) {
      setSelectedVersionId(versions[0].id);
      setCurrentMappings(versions[0].mapping_json.field_mappings || []);
      if (versions.length >= 2) {
        setDiffV1Id(versions[1].id);
        setDiffV2Id(versions[0].id);
      }
    }
  }, [versions, selectedVersionId]);

  const selectedVersion = versions?.find((v) => v.id === selectedVersionId);

  const handleSelectVersion = (version: PlanVersion) => {
    setSelectedVersionId(version.id);
    setCurrentMappings(version.mapping_json.field_mappings || []);
  };

  const { data: diffData } = useQuery({
    queryKey: ['planDiff', diffV1Id, diffV2Id],
    queryFn: () => (diffV1Id && diffV2Id ? api.getPlanDiff(diffV1Id, diffV2Id) : Promise.resolve(null)),
    enabled: !!(diffV1Id && diffV2Id && showDiffModal),
  });

  const createVersionMutation = useMutation({
    mutationFn: (planDef: PlanDefinition) => api.createPlanVersion(plan!.id, planDef, 'user'),
    onSuccess: (newVersion) => {
      queryClient.invalidateQueries({ queryKey: ['activePlan'] });
      queryClient.invalidateQueries({ queryKey: ['planVersions'] });
      setSelectedVersionId(newVersion.id);
      setSaveMsg(`New immutable version v${newVersion.version_num} saved in draft status.`);
      setTimeout(() => setSaveMsg(null), 5000);
    },
  });

  const approveMutation = useMutation({
    mutationFn: (versionId: string) => api.approvePlanVersion(versionId, approverName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activePlan'] });
      queryClient.invalidateQueries({ queryKey: ['planVersions'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (versionId: string) => api.rejectPlanVersion(versionId, 'Rejected during manual review'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activePlan'] });
      queryClient.invalidateQueries({ queryKey: ['planVersions'] });
    },
  });

  const handleAddTransformation = (mappingIdx: number) => {
    const updated = [...currentMappings];
    updated[mappingIdx].transformations.push({ rule: 'trim' });
    setCurrentMappings(updated);
  };

  const handleRemoveTransformation = (mappingIdx: number, transIdx: number) => {
    const updated = [...currentMappings];
    updated[mappingIdx].transformations.splice(transIdx, 1);
    setCurrentMappings(updated);
  };

  const handleRuleChange = (mappingIdx: number, transIdx: number, newRule: string) => {
    const updated = [...currentMappings];
    let defaultParams: Record<string, any> = {};
    if (newRule === 'parse_date') defaultParams = { input_format: '%d/%m/%Y' };
    if (newRule === 'parse_datetime') defaultParams = { input_format: '%Y-%m-%d %H:%M:%S' };
    if (newRule === 'split_name') defaultParams = { part: 'first' };
    if (newRule === 'default_value') defaultParams = { value: 'BRONZE' };
    if (newRule === 'enum_map') defaultParams = { mapping: { A: 'ACTIVE', I: 'INACTIVE', P: 'PENDING' }, on_unmapped: 'error' };
    if (newRule === 'normalize_phone_e164') defaultParams = { default_country: 'US' };
    updated[mappingIdx].transformations[transIdx] = { rule: newRule, params: defaultParams };
    setCurrentMappings(updated);
  };

  const handleSavePlan = () => {
    const planDef: PlanDefinition = {
      field_mappings: currentMappings,
      unmapped_target_fields: [],
      unmapped_source_fields: ['legacy_notes'],
    };
    createVersionMutation.mutate(planDef);
  };

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
          <h1 className="page-title">Plan versions</h1>
          <p className="page-subtitle">
            Configure transformation rules from the whitelist registry. Every edit creates an
            immutable version and resets approval status.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowDiffModal(true)}
            disabled={!versions || versions.length < 2}
            className="btn btn-secondary"
            title={!versions || versions.length < 2 ? 'Need at least 2 versions to compare' : undefined}
          >
            Compare versions
          </button>
          {!versions || versions.length < 2 && (
            <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', margin: '4px 0 0' }}>
              Need at least 2 versions to compare
            </p>
          )}
          <button
            onClick={handleSavePlan}
            disabled={createVersionMutation.isPending}
            className="btn btn-primary"
            aria-busy={createVersionMutation.isPending}
          >
            <Save size={14} aria-hidden="true" />
            {createVersionMutation.isPending ? 'Saving…' : 'Save as new version'}
          </button>
        </div>
      </div>

      {saveMsg && (
        <div className="banner-success" role="status" aria-live="polite">{saveMsg}</div>
      )}

      {/* Version picker + approval controls */}
      <div className="panel" style={{ padding: '12px 16px' }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '12px',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {/* Version tabs */}
          <div
            style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}
            role="tablist"
            aria-label="Plan versions"
          >
            <span style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', marginRight: '4px' }}>Version:</span>
            {versions?.map((v) => (
              <button
                key={v.id}
                onClick={() => handleSelectVersion(v)}
                role="tab"
                aria-selected={selectedVersionId === v.id}
                className={selectedVersionId === v.id ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
              >
                v{v.version_num}
                <StatusBadge status={v.status} />
              </button>
            ))}
          </div>

          {/* Approval controls */}
          {selectedVersion && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {selectedVersion.status !== 'approved' && (
                <div>
                  <label
                    htmlFor="approver-name"
                    className="label"
                    style={{ margin: '0 0 2px' }}
                  >
                    Approver
                  </label>
                  <input
                    id="approver-name"
                    type="text"
                    value={approverName}
                    onChange={(e) => setApproverName(e.target.value)}
                    disabled={selectedVersion.status === 'superseded' || approveMutation.isPending}
                    className="input"
                    style={{ width: '160px' }}
                    aria-label="Approver name"
                  />
                </div>
              )}

              {selectedVersion.status === 'approved' ? (
                <div className="approval-unlocked" style={{ fontSize: '0.875rem' }}>
                  Approved by {selectedVersion.approver}
                </div>
              ) : (
                <button
                  onClick={() => approveMutation.mutate(selectedVersion.id)}
                  disabled={approveMutation.isPending || selectedVersion.status === 'superseded'}
                  className="btn btn-primary btn-sm"
                  aria-busy={approveMutation.isPending}
                  title={selectedVersion.status === 'superseded' ? 'Superseded versions cannot be approved' : undefined}
                >
                  Approve v{selectedVersion.version_num}
                </button>
              )}

              {selectedVersion.status !== 'rejected' && selectedVersion.status !== 'approved' && (
                <button
                  onClick={() => rejectMutation.mutate(selectedVersion.id)}
                  disabled={rejectMutation.isPending}
                  className="btn btn-danger btn-sm"
                  aria-busy={rejectMutation.isPending}
                  aria-label={`Reject version v${selectedVersion.version_num}`}
                >
                  Reject
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Selected version metadata */}
      {selectedVersion && (
        <div
          style={{
            padding: '10px 16px',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius)',
            fontSize: '0.8125rem',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '16px',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: 'var(--color-muted)',
            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
          }}
        >
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <span>Version: <strong style={{ color: 'var(--color-text)' }}>v{selectedVersion.version_num}</strong></span>
            <span>Creator: <strong style={{ color: 'var(--color-text)' }}>{selectedVersion.creator}</strong></span>
            <span>Created: <strong style={{ color: 'var(--color-text)' }}>{new Date(selectedVersion.created_at).toLocaleString()}</strong></span>
          </div>
          <span style={{ overflowWrap: 'anywhere' }}>
            Hash: <strong style={{ color: 'var(--color-warning)' }}>{selectedVersion.content_hash}</strong>
          </span>
        </div>
      )}

      {/* Field mapping editor */}
      <section className="panel" aria-label="Field mapping editor">
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
          <h2 className="section-title" style={{ marginBottom: '2px' }}>
            Field mapping and transformation rules
          </h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', margin: 0 }}>
            Rules are limited to the whitelist registry.
          </p>
        </div>

        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {currentMappings.map((m, mIdx) => (
            <div
              key={m.target_field}
              style={{
                padding: '12px',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '8px',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '10px',
                }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                  <code style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-success)' }}>
                    Target: {m.target_field}
                  </code>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--color-muted)' }}>
                    Source: {m.source_fields.length > 0 ? m.source_fields.join(', ') : '(none)'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleAddTransformation(mIdx)}
                  className="btn btn-secondary btn-sm"
                >
                  <Plus size={12} aria-hidden="true" />
                  Add rule
                </button>
              </div>

              {m.transformations.length === 0 ? (
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', margin: 0 }}>
                  No transformation rules. Use "Add rule" to build a pipeline.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {m.transformations.map((t, tIdx) => (
                    <div
                      key={tIdx}
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px',
                        background: 'var(--color-bg)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius)',
                        fontSize: '0.8125rem',
                      }}
                    >
                      <span style={{ color: 'var(--color-muted)', minWidth: '16px' }}>
                        {tIdx + 1}.
                      </span>

                      <label htmlFor={`rule-${mIdx}-${tIdx}`} className="sr-only">
                        Transformation rule {tIdx + 1} for {m.target_field}
                      </label>
                      <select
                        id={`rule-${mIdx}-${tIdx}`}
                        value={t.rule}
                        onChange={(e) => handleRuleChange(mIdx, tIdx, e.target.value)}
                        className="select"
                        aria-label={`Rule ${tIdx + 1} for ${m.target_field}`}
                      >
                        {transformRegistry?.rules.map((r) => (
                          <option key={r.name} value={r.name}>
                            {r.name} ({r.category})
                          </option>
                        ))}
                      </select>

                      {t.params && Object.keys(t.params).length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {Object.entries(t.params).map(([paramKey, paramVal]) => (
                            <div key={paramKey} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <label
                                htmlFor={`param-${mIdx}-${tIdx}-${paramKey}`}
                                style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}
                              >
                                {paramKey}:
                              </label>
                              <input
                                id={`param-${mIdx}-${tIdx}-${paramKey}`}
                                type="text"
                                value={typeof paramVal === 'object' ? JSON.stringify(paramVal) : String(paramVal)}
                                onChange={(e) => {
                                  const updated = [...currentMappings];
                                  let val: any = e.target.value;
                                  try {
                                    if (val.startsWith('{') || val.startsWith('[')) val = JSON.parse(val);
                                  } catch { }
                                  updated[mIdx].transformations[tIdx].params![paramKey] = val;
                                  setCurrentMappings(updated);
                                }}
                                className="input"
                                style={{ width: '140px', padding: '4px 8px' }}
                                aria-label={`${paramKey} parameter`}
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => handleRemoveTransformation(mIdx, tIdx)}
                        className="btn btn-tertiary btn-sm"
                        style={{ marginLeft: 'auto', color: 'var(--color-danger)' }}
                        aria-label={`Remove rule ${tIdx + 1}`}
                        title="Remove rule"
                      >
                        <Trash2 size={13} aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Version diff modal */}
      {showDiffModal && (
        <div
          className="dialog-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="diff-dialog-title"
          onClick={(e) => { if (e.target === e.currentTarget) setShowDiffModal(false); }}
        >
          <div className="dialog dialog-wide">
            <div className="dialog-header">
              <h2 id="diff-dialog-title" className="dialog-title">
                Version comparison
              </h2>
              <button
                onClick={() => setShowDiffModal(false)}
                className="btn btn-tertiary btn-sm"
                aria-label="Close dialog"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label htmlFor="diff-v1" className="label">Base version (v1)</label>
                <select
                  id="diff-v1"
                  value={diffV1Id || ''}
                  onChange={(e) => setDiffV1Id(e.target.value)}
                  className="select"
                  style={{ width: '100%' }}
                >
                  {versions?.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.version_num} ({v.status}) — {v.content_hash.substring(0, 8)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="diff-v2" className="label">Compared version (v2)</label>
                <select
                  id="diff-v2"
                  value={diffV2Id || ''}
                  onChange={(e) => setDiffV2Id(e.target.value)}
                  className="select"
                  style={{ width: '100%' }}
                >
                  {versions?.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.version_num} ({v.status}) — {v.content_hash.substring(0, 8)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {diffData?.changes.map((c) => (
                <div
                  key={c.field}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius)',
                    border: '1px solid',
                    borderColor:
                      c.change_type === 'added'    ? 'var(--color-success)' :
                      c.change_type === 'removed'  ? 'var(--color-danger)'  :
                      c.change_type === 'modified' ? 'var(--color-warning)' :
                      'var(--color-border)',
                    background:
                      c.change_type === 'added'    ? 'var(--color-success-soft)' :
                      c.change_type === 'removed'  ? 'var(--color-danger-soft)'  :
                      c.change_type === 'modified' ? 'var(--color-warning-soft)' :
                      'var(--color-surface)',
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
                    <code>{c.field}</code>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        textTransform: 'uppercase',
                        color: 'var(--color-muted)',
                      }}
                    >
                      {c.change_type}
                    </span>
                  </div>
                  <div style={{ color: 'var(--color-muted)' }}>{c.details}</div>
                  {c.change_type === 'modified' && (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '8px',
                        marginTop: '8px',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginBottom: '2px' }}>
                          v{diffData.v1_num}
                        </div>
                        <pre className="code-block" style={{ color: 'var(--color-danger)', margin: 0 }}>
                          {JSON.stringify(c.v1_value, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginBottom: '2px' }}>
                          v{diffData.v2_num}
                        </div>
                        <pre className="code-block" style={{ color: 'var(--color-success)', margin: 0 }}>
                          {JSON.stringify(c.v2_value, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
