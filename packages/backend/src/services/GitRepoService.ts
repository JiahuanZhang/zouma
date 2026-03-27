import type {
  GitRepo,
  GitRepoStatus,
  CreateGitRepoDTO,
  UpdateGitRepoDTO,
  PaginationParams,
  DetectLocalRepoResult,
} from '@zouma/common';
import { DatabaseManager } from '../database/index.js';
import { execSync, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

export class RepoNotReadyError extends Error {}

interface CloneJobParams {
  repoId: number;
  repoUrl: string;
  accessToken: string | null;
  localPath: string;
}

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
    const isLocalRepo = !!dto.local_path?.trim();
    const initialStatus: GitRepoStatus = isLocalRepo ? 'ready' : 'downloading';
    const result = db
      .prepare(
        `INSERT INTO git_repo (name, url, branch, access_token, local_path, status, status_message, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        dto.name,
        dto.url,
        dto.branch ?? 'main',
        dto.access_token ?? null,
        dto.local_path ?? null,
        initialStatus,
        null,
        dto.description ?? null
      );
    const id = Number(result.lastInsertRowid);

    if (!isLocalRepo) {
      const clonePath = GitRepoService.buildDefaultClonePath(dto.name, dto.url, id);
      db.prepare(
        `UPDATE git_repo SET local_path = ?, status = 'downloading', status_message = NULL, updated_at = datetime('now') WHERE id = ?`
      ).run(clonePath, id);
      void GitRepoService.cloneRemoteInBackground({
        repoId: id,
        repoUrl: dto.url,
        accessToken: dto.access_token ?? null,
        localPath: clonePath,
      });
    }

    return GitRepoService.findById(id)!;
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

    if (dto.local_path !== undefined) {
      const nextPath = typeof dto.local_path === 'string' ? dto.local_path.trim() : '';
      if (nextPath) {
        fields.push('status = ?');
        values.push('ready');
        fields.push('status_message = ?');
        values.push(null);
      } else {
        fields.push('status = ?');
        values.push('error');
        fields.push('status_message = ?');
        values.push('本地路径为空，请重新配置');
      }
    }

    fields.push("updated_at = datetime('now')");
    values.push(id);

    db.prepare(`UPDATE git_repo SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return GitRepoService.findById(id);
  }

  static delete(id: number, options?: { deleteLocal?: boolean }): boolean {
    const db = DatabaseManager.getDatabase();
    const existing = GitRepoService.findById(id);
    if (!existing) return false;

    if (options?.deleteLocal && existing.local_path?.trim()) {
      GitRepoService.removeLocalRepoPath(existing.local_path);
    }

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

  static assertRepoReadyForReview(repoId: number): GitRepo {
    const repo = GitRepoService.findById(repoId);
    if (!repo) {
      throw new RepoNotReadyError('关联仓库不存在');
    }

    if (repo.status === 'downloading') {
      throw new RepoNotReadyError(`仓库「${repo.name}」仍在下载中，请稍后重试`);
    }
    if (repo.status === 'error') {
      const detail = repo.status_message ? `：${repo.status_message}` : '';
      throw new RepoNotReadyError(`仓库「${repo.name}」状态异常${detail}`);
    }
    if (repo.status !== 'ready') {
      throw new RepoNotReadyError(`仓库「${repo.name}」状态不可用`);
    }
    if (!repo.local_path || !repo.local_path.trim()) {
      throw new RepoNotReadyError(`仓库「${repo.name}」未配置本地路径`);
    }

    const resolved = path.resolve(repo.local_path);
    if (!fs.existsSync(resolved)) {
      throw new RepoNotReadyError(`仓库「${repo.name}」本地路径不存在`);
    }
    if (!fs.existsSync(path.join(resolved, '.git'))) {
      throw new RepoNotReadyError(`仓库「${repo.name}」本地路径不是有效 Git 仓库`);
    }
    return repo;
  }

  private static async cloneRemoteInBackground(params: CloneJobParams): Promise<void> {
    const { repoId, repoUrl, accessToken, localPath } = params;
    try {
      fs.mkdirSync(path.dirname(localPath), { recursive: true });
      if (fs.existsSync(localPath)) {
        const entries = fs.readdirSync(localPath);
        if (entries.length > 0) {
          throw new Error('目标目录已存在且非空');
        }
      }

      const cloneUrl = GitRepoService.attachAccessToken(repoUrl, accessToken);
      await GitRepoService.execGit(['clone', '--depth', '1', cloneUrl, localPath]);
      GitRepoService.updateStatus(repoId, 'ready', null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      GitRepoService.updateStatus(repoId, 'error', message.slice(0, 500));
    }
  }

  private static updateStatus(
    repoId: number,
    status: GitRepoStatus,
    statusMessage: string | null
  ): void {
    DatabaseManager.getDatabase()
      .prepare(
        `UPDATE git_repo SET status = ?, status_message = ?, updated_at = datetime('now') WHERE id = ?`
      )
      .run(status, statusMessage, repoId);
  }

  private static execGit(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn('git', args, { windowsHide: true });
      let stderr = '';

      child.stderr.on('data', (chunk) => {
        stderr += String(chunk);
      });

      child.on('error', (err) => reject(err));
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        const detail = stderr.trim() || `git 命令失败（exit code: ${code ?? -1}）`;
        reject(new Error(detail));
      });
    });
  }

  private static resolveProjectRoot(): string {
    const cwd = process.cwd();
    if (path.basename(cwd) === 'backend' && path.basename(path.dirname(cwd)) === 'packages') {
      return path.resolve(cwd, '..', '..');
    }
    return cwd;
  }

  private static buildDefaultClonePath(repoName: string, repoUrl: string, repoId: number): string {
    const root = GitRepoService.resolveProjectRoot();
    const baseDir = path.resolve(root, 'data', 'repos');
    const inferred = GitRepoService.inferRepoName(repoName, repoUrl);
    const safeName = inferred
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    const folderName = `${safeName || 'repo'}-${repoId}`;
    return path.resolve(baseDir, folderName);
  }

  private static inferRepoName(repoName: string, repoUrl: string): string {
    const fromName = repoName.trim();
    if (fromName) return fromName;
    const normalized = repoUrl.trim().replace(/[\\/]+$/, '');
    const match = normalized.match(/([^/:]+?)(?:\.git)?$/);
    return match?.[1] ?? 'repo';
  }

  private static attachAccessToken(repoUrl: string, token: string | null): string {
    if (!token?.trim()) return repoUrl;
    try {
      const parsed = new URL(repoUrl);
      if (!/^https?:$/i.test(parsed.protocol)) return repoUrl;
      if (parsed.username || parsed.password) return repoUrl;
      parsed.username = 'x-access-token';
      parsed.password = token;
      return parsed.toString();
    } catch {
      return repoUrl;
    }
  }

  private static removeLocalRepoPath(localPath: string): void {
    const resolved = path.resolve(localPath);
    const parsed = path.parse(resolved);
    const projectRoot = GitRepoService.resolveProjectRoot();

    if (resolved === parsed.root) {
      throw new Error('禁止删除磁盘根目录');
    }
    if (resolved === projectRoot) {
      throw new Error('禁止删除项目根目录');
    }
    if (!fs.existsSync(resolved)) {
      return;
    }

    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      throw new Error('本地路径不是目录，无法删除');
    }

    fs.rmSync(resolved, { recursive: true, force: false });
  }
}
