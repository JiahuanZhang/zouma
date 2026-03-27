import type { Request, Response } from 'express';
import type { CreateGitRepoDTO, UpdateGitRepoDTO } from '@zouma/common';
import { ResponseHelper, Validator } from '@zouma/common';
import { GitRepoService } from '../services/GitRepoService.js';

export class GitRepoController {
  static getAll(req: Request, res: Response): void {
    const page = Number(req.query.page) || 0;
    const pageSize = Number(req.query.pageSize) || 0;

    if (page > 0 && pageSize > 0) {
      const { items, total } = GitRepoService.findAll({ page, pageSize });
      res.json(ResponseHelper.paginated(items, total, { page, pageSize }));
    } else {
      const { items } = GitRepoService.findAll();
      res.json(ResponseHelper.success(items));
    }
  }

  static getById(req: Request, res: Response): void {
    const id = Number(req.params.id);
    if (!Validator.isPositiveInteger(id)) {
      res.status(400).json(ResponseHelper.error('无效的 ID', 400));
      return;
    }
    const item = GitRepoService.findById(id);
    if (!item) {
      res.status(404).json(ResponseHelper.error('未找到记录', 404));
      return;
    }
    res.json(ResponseHelper.success(item));
  }

  static create(req: Request, res: Response): void {
    const dto = req.body as CreateGitRepoDTO;
    if (!Validator.isNonEmptyString(dto.name)) {
      res.status(400).json(ResponseHelper.error('name 不能为空', 400));
      return;
    }
    if (!Validator.isNonEmptyString(dto.url)) {
      res.status(400).json(ResponseHelper.error('url 不能为空', 400));
      return;
    }
    const item = GitRepoService.create(dto);
    res.status(201).json(ResponseHelper.success(item, '创建成功'));
  }

  static update(req: Request, res: Response): void {
    const id = Number(req.params.id);
    if (!Validator.isPositiveInteger(id)) {
      res.status(400).json(ResponseHelper.error('无效的 ID', 400));
      return;
    }
    const dto = req.body as UpdateGitRepoDTO;
    const item = GitRepoService.update(id, dto);
    if (!item) {
      res.status(404).json(ResponseHelper.error('未找到记录', 404));
      return;
    }
    res.json(ResponseHelper.success(item, '更新成功'));
  }

  static remove(req: Request, res: Response): void {
    const id = Number(req.params.id);
    if (!Validator.isPositiveInteger(id)) {
      res.status(400).json(ResponseHelper.error('无效的 ID', 400));
      return;
    }
    const { delete_local: deleteLocalRaw } = (req.body ?? {}) as { delete_local?: unknown };
    if (deleteLocalRaw !== undefined && typeof deleteLocalRaw !== 'boolean') {
      res.status(400).json(ResponseHelper.error('delete_local 必须为布尔值', 400));
      return;
    }
    const deleteLocal = deleteLocalRaw === true;

    let deleted = false;
    try {
      deleted = GitRepoService.delete(id, { deleteLocal });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '删除失败';
      res.status(400).json(ResponseHelper.error(msg, 400));
      return;
    }
    if (!deleted) {
      res.status(404).json(ResponseHelper.error('未找到记录', 404));
      return;
    }
    res.json(ResponseHelper.success(null, deleteLocal ? '删除成功（含本地目录）' : '删除成功'));
  }

  static detectLocal(req: Request, res: Response): void {
    const { path: localPath } = req.body as { path: string };
    if (!Validator.isNonEmptyString(localPath)) {
      res.status(400).json(ResponseHelper.error('path 不能为空', 400));
      return;
    }
    try {
      const result = GitRepoService.detectLocal(localPath);
      res.json(ResponseHelper.success(result));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '识别失败';
      res.status(400).json(ResponseHelper.error(msg, 400));
    }
  }
}
