import type { ReviewTask, GitRepo, LlmConfig } from '@zouma/common';
import { DatabaseManager, testLlmConnection } from '@zouma/common';
import path from 'node:path';
import type { AppConfig, ReviewOptions } from './core/reviewTypes.js';
import { DEFAULT_OPTIONS } from './core/reviewTypes.js';

export interface ResolvedConfig {
  appConfig: AppConfig;
  reviewOptions: ReviewOptions;
}

export function buildFromDB(task: ReviewTask): ResolvedConfig {
  const db = DatabaseManager.getDatabase();

  const llmConfig = db.prepare('SELECT * FROM llm_config WHERE id = ?').get(task.llm_config_id) as
    | LlmConfig
    | undefined;
  if (!llmConfig) {
    throw new Error(`LLM 配置不存在 (id=${task.llm_config_id})`);
  }

  const gitRepo = db.prepare('SELECT * FROM git_repo WHERE id = ?').get(task.repo_id) as
    | GitRepo
    | undefined;
  if (!gitRepo) {
    throw new Error(`Git 仓库不存在 (id=${task.repo_id})`);
  }

  const targetPath = gitRepo.local_path ? path.resolve(gitRepo.local_path) : undefined;
  if (!targetPath) {
    throw new Error(`Git 仓库 "${gitRepo.name}" 未配置本地路径 (local_path)`);
  }

  const appConfig: AppConfig = {
    apiKey: llmConfig.api_key,
    baseUrl: llmConfig.base_url ?? undefined,
    model: llmConfig.model,
  };

  const includeExtensions =
    parseFilePatterns(task.file_patterns) ?? DEFAULT_OPTIONS.includeExtensions;

  const reviewOptions: ReviewOptions = {
    ...DEFAULT_OPTIONS,
    targetPath,
    includeExtensions,
  };

  return { appConfig, reviewOptions };
}

/**
 * Preflight check: verify LLM API connectivity by sending a minimal request.
 * Throws an Error with user-friendly message if the API is unreachable or auth fails.
 */
export async function preflightLlmCheck(task: ReviewTask): Promise<void> {
  const db = DatabaseManager.getDatabase();
  const llmConfig = db.prepare('SELECT * FROM llm_config WHERE id = ?').get(task.llm_config_id) as
    | LlmConfig
    | undefined;

  if (!llmConfig) {
    throw new Error(`LLM 配置不存在 (id=${task.llm_config_id})`);
  }

  const result = await testLlmConnection(llmConfig);
  if (!result.ok) {
    throw new Error(`LLM API 预检失败: ${result.message}`);
  }
}

function parseFilePatterns(patterns: string | null): string[] | null {
  if (!patterns || !patterns.trim()) return null;

  const exts = patterns
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (p.startsWith('.') ? p : `.${p}`));

  return exts.length > 0 ? exts : null;
}
