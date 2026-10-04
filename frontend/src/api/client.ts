import type {
  AgentProposalOutput,
  AuditEvent,
  ClarificationAnswer,
  DryRunResult,
  FieldMapping,
  MigrationRun,
  Plan,
  PlanDefinition,
  PlanVersion,
  PlanVersionDiff,
  QuarantinedRecord,
  ReconciliationResult,
  RollbackResult,
  SchemaDefinition,
  TransformRegistry,
} from '../types';

const API_BASE = '/api';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorDetail = 'Unknown server error';
    try {
      const errJson = await res.json();
      errorDetail = errJson.message || errJson.detail || JSON.stringify(errJson);
    } catch {
      errorDetail = await res.text();
    }
    throw new Error(errorDetail);
  }
  return res.json() as Promise<T>;
}

export const api = {
  // Schemas & Sample
  getSourceSchema: () => fetch(`${API_BASE}/schemas/source`).then(handleResponse<SchemaDefinition>),
  getTargetSchema: () => fetch(`${API_BASE}/schemas/target`).then(handleResponse<SchemaDefinition>),
  getTransformations: () => fetch(`${API_BASE}/schemas/transformations`).then(handleResponse<TransformRegistry>),
  getSampleRecords: (limit = 20, offset = 0) =>
    fetch(`${API_BASE}/sample?limit=${limit}&offset=${offset}`).then(
      handleResponse<{ total: number; limit: number; offset: number; records: Record<string, any>[] }>
    ),
  getScenarios: () =>
    fetch(`${API_BASE}/sample/scenarios`).then(
      handleResponse<{ scenarios: Array<{ name: string; record_count: number; description: string; expected_clean_rate: string }> }>
    ),
  loadScenario: (scenarioName: string) =>
    fetch(`${API_BASE}/sample/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario_name: scenarioName }),
    }).then(
      handleResponse<{ status: string; message: string; record_count: number; schema_valid: boolean; source_records_hash: string }>
    ),


  // AI Agent
  proposePlan: (forceFallback = false) =>
    fetch(`${API_BASE}/agent/propose?force_fallback=${forceFallback}`, { method: 'POST' }).then(
      handleResponse<AgentProposalOutput>
    ),
  reviseProposal: (answers: ClarificationAnswer[], previousMappings?: FieldMapping[]) =>
    fetch(`${API_BASE}/agent/revise`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers, previous_mappings: previousMappings }),
    }).then(handleResponse<AgentProposalOutput>),
  previewTransform: (rule: string, params: Record<string, any>, sampleValues: any[]) =>
    fetch(`${API_BASE}/agent/preview-transform`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rule, params, sample_values: sampleValues }),
    }).then(handleResponse<Array<{ input: any; output: any; success: boolean; error?: string | null }>>),

  // Plans & Versions
  getActivePlan: () => fetch(`${API_BASE}/plans/active`).then(handleResponse<Plan>),
  getPlanVersions: (planId: string) =>
    fetch(`${API_BASE}/plans/${planId}/versions`).then(handleResponse<PlanVersion[]>),
  getPlanVersion: (versionId: string) =>
    fetch(`${API_BASE}/plans/versions/${versionId}`).then(handleResponse<PlanVersion>),
  createPlanVersion: (planId: string, planDefinition: PlanDefinition, creator = 'user') =>
    fetch(`${API_BASE}/plans/${planId}/versions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan_definition: planDefinition, creator }),
    }).then(handleResponse<PlanVersion>),
  getPlanDiff: (v1Id: string, v2Id: string) =>
    fetch(`${API_BASE}/plans/diff/${v1Id}/${v2Id}`).then(handleResponse<PlanVersionDiff>),
  approvePlanVersion: (versionId: string, approver: string) =>
    fetch(`${API_BASE}/plans/versions/${versionId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approver }),
    }).then(handleResponse<PlanVersion>),
  rejectPlanVersion: (versionId: string, reason?: string) =>
    fetch(`${API_BASE}/plans/versions/${versionId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    }).then(handleResponse<PlanVersion>),

  // Dry Run
  executeDryRun: (planVersionId?: string, records?: Record<string, any>[]) =>
    fetch(`${API_BASE}/dry-run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan_version_id: planVersionId, records }),
    }).then(handleResponse<DryRunResult>),
  verifyDeterminism: (planVersionId: string, iterations = 3) =>
    fetch(`${API_BASE}/dry-run/verify-determinism`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan_version_id: planVersionId, iterations }),
    }).then(
      handleResponse<{ plan_version_id: string; iterations: number; result_hashes: string[]; is_deterministic: boolean }>
    ),

  // Quarantine
  getQuarantinedRecords: (dryRunId?: string, field?: string, errorCode?: string, limit = 50, offset = 0) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (dryRunId) params.append('dry_run_id', dryRunId);
    if (field) params.append('field', field);
    if (errorCode) params.append('error_code', errorCode);
    return fetch(`${API_BASE}/quarantine?${params.toString()}`).then(
      handleResponse<{ total: number; limit: number; offset: number; records: QuarantinedRecord[] }>
    );
  },

  // Execution & Runs
  executeMigration: (planVersionId: string, idempotencyKey?: string, simulateFailureAtRecord?: number) =>
    fetch(`${API_BASE}/runs/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan_version_id: planVersionId,
        idempotency_key: idempotencyKey,
        simulate_failure_at_record: simulateFailureAtRecord,
      }),
    }).then(handleResponse<MigrationRun>),
  retryMigration: (runId: string, simulateFailureAtRecord?: number) =>
    fetch(`${API_BASE}/runs/retry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ run_id: runId, simulate_failure_at_record: simulateFailureAtRecord }),
    }).then(handleResponse<MigrationRun>),
  rollbackMigration: (runId?: string, planVersionId?: string) =>
    fetch(`${API_BASE}/runs/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ run_id: runId, plan_version_id: planVersionId }),
    }).then(handleResponse<RollbackResult>),
  getRuns: () => fetch(`${API_BASE}/runs`).then(handleResponse<MigrationRun[]>),
  getRun: (runId: string) => fetch(`${API_BASE}/runs/${runId}`).then(handleResponse<MigrationRun>),

  // Reconciliation
  reconcile: (planVersionId?: string, runId?: string) =>
    fetch(`${API_BASE}/reconciliation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan_version_id: planVersionId, run_id: runId }),
    }).then(handleResponse<ReconciliationResult>),

  // Audit
  getAuditEvents: (eventType?: string, planVersionId?: string, runId?: string, limit = 100, offset = 0) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (eventType) params.append('event_type', eventType);
    if (planVersionId) params.append('plan_version_id', planVersionId);
    if (runId) params.append('run_id', runId);
    return fetch(`${API_BASE}/audit?${params.toString()}`).then(handleResponse<AuditEvent[]>);
  },

  // Demo Reset
  resetDemo: () =>
    fetch(`${API_BASE}/demo/reset`, { method: 'POST' }).then(
      handleResponse<{ status: string; message: string; source_records_loaded: number }>
    ),
};
