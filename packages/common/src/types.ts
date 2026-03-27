export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ========== Git Repo ==========

export interface GitRepo {
  id: number;
  name: string;
  url: string;
  branch: string;
  access_token: string | null;
  local_path: string | null;
  status: GitRepoStatus;
  status_message: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export type GitRepoStatus = 'downloading' | 'ready' | 'error';

export interface CreateGitRepoDTO {
  name: string;
  url: string;
  branch?: string;
  access_token?: string;
  local_path?: string;
  description?: string;
}

export interface UpdateGitRepoDTO {
  name?: string;
  url?: string;
  branch?: string;
  access_token?: string;
  local_path?: string;
  description?: string;
}

export interface DetectLocalRepoResult {
  name: string;
  url: string;
  branch: string;
  local_path: string;
}

// ========== LLM Config ==========

export interface LlmConfig {
  id: number;
  name: string;
  provider: string;
  model: string;
  api_key: string;
  base_url: string | null;
  max_tokens: number;
  temperature: number;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface CreateLlmConfigDTO {
  name: string;
  provider: string;
  model: string;
  api_key: string;
  base_url?: string;
  max_tokens?: number;
  temperature?: number;
  enabled?: number;
}

export interface UpdateLlmConfigDTO {
  name?: string;
  provider?: string;
  model?: string;
  api_key?: string;
  base_url?: string;
  max_tokens?: number;
  temperature?: number;
  enabled?: number;
}

export interface FetchModelsDTO {
  api_key: string;
  base_url?: string;
  provider?: string;
}

export interface ModelInfo {
  id: string;
  owned_by?: string;
}

export interface LlmTestResult {
  ok: boolean;
  message: string;
  latencyMs: number;
}

// ========== Review Plan ==========

export type ReviewPlanTriggerType = 'interval' | 'daily' | 'webhook';

export interface IntervalTriggerConfig {
  interval_hours: number;
}

export interface DailyTriggerConfig {
  time: string; // HH:mm
}

export interface WebhookTriggerConfig {
  secret?: string;
}

export type TriggerConfig = IntervalTriggerConfig | DailyTriggerConfig | WebhookTriggerConfig;

export interface ReviewPlan {
  id: number;
  name: string;
  repo_id: number;
  llm_config_id: number;
  target_branch: string | null;
  file_patterns: string | null;
  trigger_type: ReviewPlanTriggerType;
  trigger_config: TriggerConfig;
  enabled: number;
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewPlanWithRelations extends ReviewPlan {
  repo_name: string;
  llm_config_name: string;
}

export interface CreateReviewPlanDTO {
  name: string;
  repo_id: number;
  llm_config_id: number;
  target_branch?: string;
  file_patterns?: string;
  trigger_type: ReviewPlanTriggerType;
  trigger_config: TriggerConfig;
  enabled?: number;
}

export interface UpdateReviewPlanDTO {
  name?: string;
  repo_id?: number;
  llm_config_id?: number;
  target_branch?: string;
  file_patterns?: string;
  trigger_type?: ReviewPlanTriggerType;
  trigger_config?: TriggerConfig;
  enabled?: number;
}

// ========== Review Task ==========

export type ReviewTaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ReviewTask {
  id: number;
  name: string;
  repo_id: number;
  llm_config_id: number;
  target_branch: string | null;
  file_patterns: string | null;
  plan_id: number | null;
  plan_name: string | null;
  repo_name: string | null;
  llm_config_name: string | null;
  status: ReviewTaskStatus;
  result: string | null;
  created_at: string;
  updated_at: string;
}

export type ReviewTaskWithRelations = ReviewTask;

export interface CreateReviewTaskDTO {
  name: string;
  repo_id: number;
  llm_config_id: number;
  target_branch?: string;
  file_patterns?: string;
}

export interface UpdateReviewTaskDTO {
  name?: string;
  repo_id?: number;
  llm_config_id?: number;
  target_branch?: string;
  file_patterns?: string;
  status?: ReviewTaskStatus;
  result?: string;
}

// ========== Review Log ==========

export type ReviewLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ReviewLog {
  id: number;
  task_id: number;
  level: ReviewLogLevel;
  message: string;
  detail: string | null;
  created_at: string;
}

// ========== Review Progress ==========

export type ProgressStepType =
  | 'task_start'
  | 'task_end'
  | 'phase_start'
  | 'phase_end'
  | 'batch_start'
  | 'batch_end'
  | 'agent_start'
  | 'agent_end'
  | 'tool_call';

export type ProgressPhase =
  | 'collect_files'
  | 'analyze_deps'
  | 'project_summary'
  | 'quick_scan'
  | 'deep_review'
  | 'merge';

export type ProgressStatus = 'running' | 'completed' | 'failed';

export interface ReviewProgress {
  id: number;
  task_id: number;
  step_type: ProgressStepType;
  phase: ProgressPhase | null;
  batch_index: number | null;
  batch_total: number | null;
  agent_name: string | null;
  tool_name: string | null;
  status: ProgressStatus | null;
  strategy: string | null;
  mode: string | null;
  total_files: number | null;
  file_count: number | null;
  issue_count: number | null;
  duration_ms: number | null;
  tokens_used: number | null;
  cost_usd: number | null;
  detail: string | null;
  created_at: string;
}

export interface TaskProgressSummary {
  taskId: number;
  strategy: string | null;
  mode: string | null;
  totalFiles: number;
  fileList: string[];
  totalBatches: number;
  completedBatches: number;
  failedBatches: number;
  currentPhase: string | null;
  overallStatus: ReviewTaskStatus;
  startedAt: string | null;
  endedAt: string | null;
  totalDurationMs: number | null;
  totalIssues: number;
  totalTokens: number;
  totalCostUsd: number;
  phases: PhaseProgressItem[];
  batches: BatchProgressItem[];
}

export interface PhaseProgressItem {
  phase: ProgressPhase;
  status: ProgressStatus;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  batchCount: number;
  completedBatches: number;
  issueCount: number;
}

export interface BatchProgressItem {
  phase: ProgressPhase;
  batchIndex: number;
  batchTotal: number;
  status: ProgressStatus;
  fileCount: number;
  issueCount: number;
  durationMs: number | null;
  tokensUsed: number;
  costUsd: number;
  startedAt: string;
  agents: AgentProgressItem[];
}

export interface AgentProgressItem {
  agentName: string;
  status: ProgressStatus;
  durationMs: number | null;
  tokensUsed: number;
  toolCalls: ToolCallItem[];
}

export interface ToolCallItem {
  toolName: string;
  agentName: string | null;
  detail: string | null;
  createdAt: string;
}

// ========== Review Issues ==========

export type IssueSeverity = 'error' | 'warning' | 'info';
export type IssueCategory = 'style' | 'logic' | 'robustness';

export interface ReviewIssueRecord {
  id: number;
  task_id: number;
  severity: IssueSeverity;
  category: IssueCategory;
  file: string;
  line: number | null;
  description: string;
  suggestion: string;
  created_at: string;
}
