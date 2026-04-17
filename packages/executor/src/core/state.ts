import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import type { ReviewState } from './reviewTypes.js';
import { DatabaseManager } from '@zouma/common';

const STATE_FILE = '.code-review-state.json';

function statePath(targetPath: string): string {
  return path.join(targetPath, STATE_FILE);
}

export function loadState(targetPath: string): ReviewState | null {
  try {
    const db = DatabaseManager.getDatabase();
    // 获取当前分支
    let branch = 'unknown';
    try {
      branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: targetPath, encoding: 'utf-8' }).trim();
    } catch {
      // ignore
    }

    // 优先从 per-branch review record 表查询
    const repo = db.prepare('SELECT id FROM git_repo WHERE local_path = ?').get(targetPath) as { id: number } | undefined;
    if (repo) {
      const record = db.prepare(
        'SELECT last_commit, reviewed_at FROM git_repo_review_record WHERE repo_id = ? AND branch = ?'
      ).get(repo.id, branch) as { last_commit: string; reviewed_at: string } | undefined;
      if (record) {
        return {
          lastReviewedCommit: record.last_commit,
          lastReviewDate: record.reviewed_at,
          reviewedFiles: 0,
        };
      }
    }

    // fallback: git_repo 表中的旧字段
    const repoFallback = db.prepare('SELECT last_reviewed_commit, updated_at FROM git_repo WHERE local_path = ?').get(targetPath) as { last_reviewed_commit: string | null; updated_at: string } | undefined;
    if (repoFallback && repoFallback.last_reviewed_commit) {
      return {
        lastReviewedCommit: repoFallback.last_reviewed_commit,
        lastReviewDate: repoFallback.updated_at,
        reviewedFiles: 0,
      };
    }
  } catch (err) {
    console.warn('[state] Failed to load state from DB:', err);
  }

  const fp = statePath(targetPath);
  if (!fs.existsSync(fp)) return null;
  return JSON.parse(fs.readFileSync(fp, 'utf-8')) as ReviewState;
}

export function saveState(targetPath: string, commit: string, fileCount: number): void {
  try {
    const db = DatabaseManager.getDatabase();
    let branch = 'unknown';
    try {
      branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: targetPath, encoding: 'utf-8' }).trim();
    } catch {
      // ignore
    }

    // 更新 git_repo 表的整体最新评审记录
    db.prepare('UPDATE git_repo SET last_reviewed_commit = ?, last_reviewed_branch = ?, updated_at = datetime("now") WHERE local_path = ?').run(commit, branch, targetPath);

    // upsert per-branch review record
    const repo = db.prepare('SELECT id FROM git_repo WHERE local_path = ?').get(targetPath) as { id: number } | undefined;
    if (repo) {
      db.prepare(
        `INSERT INTO git_repo_review_record (repo_id, branch, last_commit, reviewed_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT (repo_id, branch) DO UPDATE SET last_commit = excluded.last_commit, reviewed_at = excluded.reviewed_at`
      ).run(repo.id, branch, commit);
    }
  } catch (err) {
    console.warn('[state] Failed to save state to DB:', err);
  }

  const state: ReviewState = {
    lastReviewedCommit: commit,
    lastReviewDate: new Date().toISOString(),
    reviewedFiles: fileCount,
  };
  fs.writeFileSync(statePath(targetPath), JSON.stringify(state, null, 2), 'utf-8');
}

export function getCurrentCommit(targetPath: string): string {
  return execSync('git rev-parse HEAD', { cwd: targetPath, encoding: 'utf-8' }).trim();
}

export function isGitRepo(targetPath: string): boolean {
  try {
    execSync('git rev-parse --is-inside-work-tree', {
      cwd: targetPath,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}
