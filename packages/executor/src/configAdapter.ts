import type { ReviewTask, GitRepo, LlmConfig, FileFilter } from '@zouma/common';
import { DatabaseManager, testLlmConnection } from '@zouma/common';
import path from 'node:path';
import fs from 'node:fs';
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
  if (gitRepo.status === 'downloading') {
    throw new Error(`Git 仓库 "${gitRepo.name}" 正在下载中，请稍后重试`);
  }
  if (gitRepo.status === 'error') {
    const detail = gitRepo.status_message ? `: ${gitRepo.status_message}` : '';
    throw new Error(`Git 仓库 "${gitRepo.name}" 状态异常${detail}`);
  }

  const targetPath = gitRepo.local_path ? path.resolve(gitRepo.local_path) : undefined;
  if (!targetPath) {
    throw new Error(`Git 仓库 "${gitRepo.name}" 未配置本地路径 (local_path)`);
  }
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Git 仓库 "${gitRepo.name}" 本地路径不存在: ${targetPath}`);
  }
  if (!fs.existsSync(path.join(targetPath, '.git'))) {
    throw new Error(`Git 仓库 "${gitRepo.name}" 本地路径不是有效 Git 仓库: ${targetPath}`);
  }

  const appConfig: AppConfig = {
    apiKey: llmConfig.api_key,
    baseUrl: llmConfig.base_url ?? undefined,
    model: llmConfig.model,
  };

  let includeExtensions = DEFAULT_OPTIONS.includeExtensions;
  let excludePatterns = DEFAULT_OPTIONS.excludePatterns;

  if (task.file_filter_id) {
    const fileFilter = db
      .prepare('SELECT * FROM file_filter WHERE id = ?')
      .get(task.file_filter_id) as FileFilter | undefined;
    if (fileFilter) {
      const parsed = parseFilePatterns(fileFilter.include_extensions);
      if (parsed) includeExtensions = parsed;
      if (fileFilter.exclude_patterns) {
        const extra = fileFilter.exclude_patterns
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean);
        if (extra.length > 0) {
          excludePatterns = [...DEFAULT_OPTIONS.excludePatterns, ...extra];
        }
      }
    }
  } else {
    const fromTask = parseFilePatterns(task.file_patterns);
    if (fromTask) includeExtensions = fromTask;
  }

  const reviewOptions: ReviewOptions = {
    ...DEFAULT_OPTIONS,
    targetPath,
    includeExtensions,
    excludePatterns,
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
