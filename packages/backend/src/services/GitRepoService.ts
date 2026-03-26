import type {
  GitRepo,
  CreateGitRepoDTO,
  UpdateGitRepoDTO,
  PaginationParams,
  DetectLocalRepoResult,
} from '@zouma/common';
import { DatabaseManager } from '../database/index.js';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

export class GitRepoService {
  static findAll(params?: PaginationParams): { items: GitRepo[]; total: number } {
    const db = DatabaseManager.getDatabase();
    const total = (db.prepare('SELECT COUNT(*) as count FROM git_repo').get() as { count: number })
      .count;

    if (params) {
      const offset = (params.page - 1) * params.pageSize;
      const items = db
        .prepare('SELECT * FROM git_repo ORDER BY id DESC LIMIT ? OFFSET ?')
        .all(params.pageSize, offset) as GitRepo[];
      return { items, total };
    }

    const items = db.prepare('SELECT * FROM git_repo ORDER BY id DESC').all() as GitRepo[];
    return { items, total };
  }

  static findById(id: number): GitRepo | undefined {
    const db = DatabaseManager.getDatabase();
    return db.prepare('SELECT * FROM git_repo WHERE id = ?').get(id) as GitRepo | undefined;
  }

  static create(dto: CreateGitRepoDTO): GitRepo {
    const db = DatabaseManager.getDatabase();
    const result = db
      .prepare(
        `INSERT INTO git_repo (name, url, branch, access_token, local_path, description) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        dto.name,
        dto.url,
        dto.branch ?? 'main',
        dto.access_token ?? null,
        dto.local_path ?? null,
        dto.description ?? null
      );
    return GitRepoService.findById(Number(result.lastInsertRowid))!;
  }

  static update(id: number, dto: UpdateGitRepoDTO): GitRepo | undefined {
    const db = DatabaseManager.getDatabase();
    const existing = GitRepoService.findById(id);
    if (!existing) return undefined;

    const fields: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length === 0) return existing;

    fields.push("updated_at = datetime('now')");
    values.push(id);

    db.prepare(`UPDATE git_repo SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return GitRepoService.findById(id);
  }

  static delete(id: number): boolean {
    const db = DatabaseManager.getDatabase();
    const result = db.prepare('DELETE FROM git_repo WHERE id = ?').run(id);
    return result.changes > 0;
  }

  static detectLocal(localPath: string): DetectLocalRepoResult {
    const resolved = path.resolve(localPath);
    if (!fs.existsSync(resolved)) {
      throw new Error('路径不存在');
    }

    const gitDir = path.join(resolved, '.git');
    if (!fs.existsSync(gitDir)) {
      throw new Error('该目录不是一个 Git 仓库');
    }

    const execOpts = { cwd: resolved, encoding: 'utf-8' as const, timeout: 5000 };

    let remoteUrl = '';
    try {
      remoteUrl = execSync('git remote get-url origin', execOpts).trim();
    } catch {
      // no remote configured
    }

    let branch = 'main';
    try {
      branch = execSync('git rev-parse --abbrev-ref HEAD', execOpts).trim();
    } catch {
      // fallback
    }

    const repoName = path.basename(resolved);

    return {
      name: repoName,
      url: remoteUrl,
      branch,
      local_path: resolved,
    };
  }
}
