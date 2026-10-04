import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileCode,
  CheckCircle2,
  XCircle,
  GitCompare,
  Plus,
  Trash2,
  Save,
  Layers,
} from 'lucide-react';
import { api } from '../api/client';
import type { FieldMapping, PlanDefinition, PlanVersion } from '../types';


export const PlanEditorPage: React.FC = () => {
  const queryClient = useQueryClient();

  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [diffV1Id, setDiffV1Id] = useState<string | null>(null);
  const [diffV2Id, setDiffV2Id] = useState<string | null>(null);
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [approverName, setApproverName] = useState('TechLead Reviewer');

  // Editable mappings state
  const [currentMappings, setCurrentMappings] = useState<FieldMapping[]>([]);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

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

  // Set default selected version
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

  // Sync mappings when switching selected version
  const handleSelectVersion = (version: PlanVersion) => {
    setSelectedVersionId(version.id);
    setCurrentMappings(version.mapping_json.field_mappings || []);
  };

  // Diff query
  const { data: diffData } = useQuery({
    queryKey: ['planDiff', diffV1Id, diffV2Id],
    queryFn: () => (diffV1Id && diffV2Id ? api.getPlanDiff(diffV1Id, diffV2Id) : Promise.resolve(null)),
    enabled: !!(diffV1Id && diffV2Id && showDiffModal),
  });

  // Mutations
  const createVersionMutation = useMutation({
    mutationFn: (planDef: PlanDefinition) =>
      api.createPlanVersion(plan!.id, planDef, 'user'),
    onSuccess: (newVersion) => {
      queryClient.invalidateQueries({ queryKey: ['activePlan'] });
      queryClient.invalidateQueries({ queryKey: ['planVersions'] });
      setSelectedVersionId(newVersion.id);
      setSaveSuccessMsg(`New immutable version v${newVersion.version_num} saved in draft status.`);
      setTimeout(() => setSaveSuccessMsg(null), 5000);
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

  // Form field mapping handlers
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

    updated[mappingIdx].transformations[transIdx] = {
      rule: newRule,
      params: defaultParams,
    };
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
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <FileCode className="w-6 h-6 text-indigo-400" />
            Plan Editor, Versioning & Approval Gate
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Configure transformation rules strictly from the whitelist registry. Every edit creates an immutable version and resets approvals.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowDiffModal(true)}
            disabled={!versions || versions.length < 2}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 disabled:opacity-40"
          >
            <GitCompare className="w-4 h-4 text-sky-400" />
            Compare Version Diff
          </button>

          <button
            onClick={handleSavePlan}
            disabled={createVersionMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {createVersionMutation.isPending ? 'Saving New Version...' : 'Save as New Version'}
          </button>
        </div>
      </div>

      {saveSuccessMsg && (
        <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          {saveSuccessMsg}
        </div>
      )}

      {/* Version Selector & Approval Action Strip */}
      <div className="glass-panel p-4 rounded-xl border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {/* Version Picker */}
        <div className="flex items-center gap-2 overflow-x-auto max-w-full py-1">
          <span className="text-xs text-slate-400 font-semibold mr-1">Version:</span>
          {versions?.map((v) => (
            <button
              key={v.id}
              onClick={() => handleSelectVersion(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all ${selectedVersionId === v.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-900/90 text-slate-300 hover:bg-slate-800 border border-slate-800'
                }`}
            >
              <span>v{v.version_num}</span>
              <span
                className={`text-[9px] px-1.5 py-0.2 rounded uppercase ${v.status === 'approved'
                    ? 'bg-emerald-500/30 text-emerald-300'
                    : v.status === 'draft'
                      ? 'bg-amber-500/30 text-amber-300'
                      : 'bg-slate-700 text-slate-400'
                  }`}
              >
                {v.status}
              </span>
            </button>
          ))}
        </div>

        {/* Approval Controls */}
        {selectedVersion && (
          <div className="flex items-center gap-3 bg-slate-900/90 p-2 rounded-lg border border-slate-800">
            <div className="text-xs">
              <span className="text-slate-400 block text-[10px]">Approver Name:</span>
              <input
                type="text"
                value={approverName}
                onChange={(e) => setApproverName(e.target.value)}
                disabled={selectedVersion.status === 'approved'}
                className="bg-slate-950 border border-slate-700 rounded px-2 py-0.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            {selectedVersion.status !== 'approved' ? (
              <button
                onClick={() => approveMutation.mutate(selectedVersion.id)}
                disabled={approveMutation.isPending || selectedVersion.status === 'superseded'}
                className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-sm shadow-emerald-600/30 disabled:opacity-40"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Approve v{selectedVersion.version_num}
              </button>
            ) : (
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-3 py-1.5 rounded-lg">
                <CheckCircle2 className="w-4 h-4" />
                Approved by {selectedVersion.approver}
              </div>
            )}

            {selectedVersion.status !== 'rejected' && selectedVersion.status !== 'approved' && (
              <button
                onClick={() => rejectMutation.mutate(selectedVersion.id)}
                disabled={rejectMutation.isPending}
                className="text-xs text-rose-400 hover:text-rose-300 p-1.5 hover:bg-rose-950/30 rounded"
                title="Reject version"
              >
                <XCircle className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Selected Version Metadata Header */}
      {selectedVersion && (
        <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800/80 text-xs flex flex-wrap items-center justify-between gap-4 font-mono">
          <div className="flex items-center gap-4 text-slate-400">
            <div>
              Version: <span className="text-white font-bold">v{selectedVersion.version_num}</span>
            </div>
            <div>
              Creator: <span className="text-sky-300">{selectedVersion.creator}</span>
            </div>
            <div>
              Created: <span className="text-slate-300">{new Date(selectedVersion.created_at).toLocaleString()}</span>
            </div>
          </div>
          <div className="text-slate-400">
            Canonical Content Hash:{' '}
            <span className="text-amber-400 font-bold">{selectedVersion.content_hash}</span>
          </div>
        </div>
      )}

      {/* Field Mapping Editor Form */}
      <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-4">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Layers className="w-5 h-5 text-indigo-400" />
          Field Mapping & Whitelist Transformation Rule Configurator
        </h2>

        <div className="space-y-4">
          {currentMappings.map((m, mIdx) => (
            <div
              key={m.target_field}
              className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded">
                    Target: {m.target_field}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    Source: {m.source_fields.length > 0 ? m.source_fields.join(', ') : '<none>'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleAddTransformation(mIdx)}
                  className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 bg-indigo-950/40 hover:bg-indigo-900/50 px-2 py-1 rounded border border-indigo-800/40 transition-colors"
                >
                  <Plus className="w-3 h-3" /> Add Rule
                </button>
              </div>

              {/* Transformation Rules Sequence */}
              <div className="space-y-2">
                {m.transformations.map((t, tIdx) => (
                  <div
                    key={tIdx}
                    className="flex flex-wrap items-center gap-2 bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/80 text-xs"
                  >
                    <span className="font-mono text-slate-500 text-[10px] w-5">{tIdx + 1}.</span>

                    {/* Rule Dropdown (Whitelist Only) */}
                    <select
                      value={t.rule}
                      onChange={(e) => handleRuleChange(mIdx, tIdx, e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-indigo-300 font-mono focus:outline-none focus:border-indigo-500"
                    >
                      {transformRegistry?.rules.map((r) => (
                        <option key={r.name} value={r.name}>
                          {r.name} ({r.category})
                        </option>
                      ))}
                    </select>

                    {/* Rule Parameters Editor */}
                    {t.params && Object.keys(t.params).length > 0 && (
                      <div className="flex items-center gap-2">
                        {Object.entries(t.params).map(([paramKey, paramVal]) => (
                          <div key={paramKey} className="flex items-center gap-1">
                            <span className="text-slate-400 text-[10px] font-mono">{paramKey}:</span>
                            <input
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
                              className="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500 w-36"
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => handleRemoveTransformation(mIdx, tIdx)}
                      className="ml-auto text-slate-500 hover:text-rose-400 p-1"
                      title="Remove rule"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Version Diff Modal */}
      {showDiffModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-4xl w-full max-h-[85vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <GitCompare className="w-5 h-5 text-sky-400" />
                Version-to-Version Diff Comparison
              </h3>
              <button
                onClick={() => setShowDiffModal(false)}
                className="text-slate-400 hover:text-white text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {/* Version Selectors for Diff */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Base Version (v1):</label>
                <select
                  value={diffV1Id || ''}
                  onChange={(e) => setDiffV1Id(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono"
                >
                  {versions?.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.version_num} ({v.status}) - {v.content_hash.substring(0, 8)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Compared Version (v2):</label>
                <select
                  value={diffV2Id || ''}
                  onChange={(e) => setDiffV2Id(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono"
                >
                  {versions?.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.version_num} ({v.status}) - {v.content_hash.substring(0, 8)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Diff Results */}
            <div className="space-y-3">
              {diffData?.changes.map((c) => (
                <div
                  key={c.field}
                  className={`p-3 rounded-lg border text-xs ${c.change_type === 'added'
                      ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                      : c.change_type === 'removed'
                        ? 'bg-rose-950/30 border-rose-500/40 text-rose-300'
                        : c.change_type === 'modified'
                          ? 'bg-amber-950/30 border-amber-500/40 text-amber-300'
                          : 'bg-slate-950/40 border-slate-800 text-slate-400'
                    }`}
                >
                  <div className="flex items-center justify-between font-mono font-bold mb-1">
                    <span>Field: {c.field}</span>
                    <span className="uppercase text-[10px] px-2 py-0.5 rounded bg-black/40">
                      {c.change_type}
                    </span>
                  </div>
                  <div className="text-[11px]">{c.details}</div>
                  {c.change_type === 'modified' && (
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] font-mono bg-black/30 p-2 rounded">
                      <div>
                        <div className="text-slate-500">v{diffData.v1_num}:</div>
                        <pre className="text-rose-300 overflow-x-auto">{JSON.stringify(c.v1_value, null, 2)}</pre>
                      </div>
                      <div>
                        <div className="text-slate-500">v{diffData.v2_num}:</div>
                        <pre className="text-emerald-300 overflow-x-auto">{JSON.stringify(c.v2_value, null, 2)}</pre>
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
