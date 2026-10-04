export interface FieldDefinition {
  name: string;
  type: string;
  nullable: boolean;
  format?: string;
  enum?: string[];
  default?: any;
  min?: number;
  unique?: boolean;
  description?: string;
}

export interface SchemaDefinition {
  name: string;
  description?: string;
  primary_key: string[];
  unique_constraints?: string[][];
  fields: FieldDefinition[];
}

export interface TransformRuleParameterSchema {
  type?: string;
  properties?: Record<string, any>;
  required?: string[];
}

export interface TransformRuleDefinition {
  name: string;
  description: string;
  category: string;
  params_schema: TransformRuleParameterSchema;
}

export interface TransformRegistry {
  rules: TransformRuleDefinition[];
}

export interface TransformRuleInvocation {
  rule: string;
  params?: Record<string, any>;
}

export interface FieldMapping {
  target_field: string;
  source_fields: string[];
  transformations: TransformRuleInvocation[];
  confidence: number;
  rationale: string;
}

export interface PlanDefinition {
  field_mappings: FieldMapping[];
  unmapped_target_fields?: string[];
  unmapped_source_fields?: string[];
}

export interface PlanVersion {
  id: string;
  plan_id: string;
  version_num: number;
  mapping_json: PlanDefinition;
  content_hash: string;
  creator: string;
  parent_version_id?: string | null;
  status: 'draft' | 'approved' | 'superseded' | 'rejected';
  approver?: string | null;
  approved_at?: string | null;
  approval_hash?: string | null;
  created_at: string;
}

export interface Plan {
  id: string;
  name: string;
  description?: string;
  active_version_id?: string | null;
  active_version?: PlanVersion | null;
  created_at: string;
  updated_at: string;
  versions_count: number;
}

export interface DiffChange {
  field: string;
  change_type: 'added' | 'removed' | 'modified' | 'unchanged';
  v1_value?: any;
  v2_value?: any;
  details?: string;
}

export interface PlanVersionDiff {
  v1_id: string;
  v1_num: number;
  v2_id: string;
  v2_num: number;
  changes: DiffChange[];
  is_identical: boolean;
}

export interface RecordErrorDetail {
  field: string;
  rule?: string | null;
  original_value?: any;
  attempted_value?: any;
  message: string;
  error_code: string;
}

export interface TransformedRecordResult {
  index: number;
  source_key?: string | null;
  status: 'accepted' | 'quarantined';
  transformed_data?: Record<string, any> | null;
  errors: RecordErrorDetail[];
}

export interface DryRunResult {
  id: string;
  plan_version_id: string;
  input_hash: string;
  result_hash: string;
  total_source: number;
  total_transformed: number;
  total_accepted: number;
  total_quarantined: number;
  is_deterministic: boolean;
  created_at: string;
  sample_records: TransformedRecordResult[];
}

export interface QuarantinedRecord {
  id: string;
  dry_run_id?: string | null;
  run_id?: string | null;
  record_index: number;
  source_key?: string | null;
  raw_record: Record<string, any>;
  errors: RecordErrorDetail[];
  created_at: string;
}

export interface MigrationRun {
  id: string;
  plan_version_id: string;
  idempotency_key: string;
  status: 'in_progress' | 'completed' | 'failed' | 'rolled_back';
  total_accepted: number;
  inserted_count: number;
  skipped_existing_count: number;
  failed_count: number;
  error_details?: string | null;
  started_at: string;
  completed_at?: string | null;
}

export interface RollbackResult {
  run_id?: string | null;
  plan_version_id?: string | null;
  deleted_count: number;
  status: string;
  message: string;
}

export interface ReconciliationCheck {
  name: string;
  description: string;
  expected: any;
  actual: any;
  status: 'PASS' | 'FAIL';
  discrepancy_details?: string | null;
}

export interface ReconciliationResult {
  plan_version_id: string;
  run_id?: string | null;
  overall_status: 'PASS' | 'FAIL';
  checks: ReconciliationCheck[];
  missing_in_target_keys: string[];
  unexpected_target_keys: string[];
  timestamp: string;
}

export interface AuditEvent {
  id: string;
  event_type: string;
  actor: string;
  timestamp: string;
  plan_version_id?: string | null;
  run_id?: string | null;
  payload: Record<string, any>;
}

export interface IncompatibleFieldInfo {
  field_name: string;
  description: string;
  suggestion: string;
}

export interface MigrationRisk {
  severity: 'low' | 'medium' | 'high';
  description: string;
  affected_fields: string[];
}

export interface ClarificationQuestion {
  id: string;
  question: string;
  affects_field: string;
  suggested_options: string[];
  user_answer?: string | null;
}

export interface ProposedMigrationPlan {
  summary: string;
  ordered_steps: string[];
}

export interface AgentProposalOutput {
  source: 'llm' | 'fallback';
  field_mappings: FieldMapping[];
  incompatible_or_missing_fields: IncompatibleFieldInfo[];
  risks: MigrationRisk[];
  clarification_questions: ClarificationQuestion[];
  proposed_migration_plan: ProposedMigrationPlan;
  tools_called: Array<{ name: string; args?: Record<string, any> }>;
}

export interface ClarificationAnswer {
  question_id: string;
  selected_option_or_text: string;
}
