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
  description: string | null;
  created_at: string;
  updated_at: string;
}

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
  status: ReviewTaskStatus;
  result: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewTaskWithRelations extends ReviewTask {
  repo_name: string;
  llm_config_name: string;
}

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
