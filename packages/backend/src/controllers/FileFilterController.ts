import type { Request, Response } from 'express';
import type { CreateFileFilterDTO, UpdateFileFilterDTO } from '@zouma/common';
import { ResponseHelper, Validator } from '@zouma/common';
import { FileFilterService } from '../services/FileFilterService.js';

export class FileFilterController {
  static getAll(req: Request, res: Response): void {
    const page = Number(req.query.page) || 0;
    const pageSize = Number(req.query.pageSize) || 0;

    if (page > 0 && pageSize > 0) {
      const { items, total } = FileFilterService.findAll({ page, pageSize });
      res.json(ResponseHelper.paginated(items, total, { page, pageSize }));
    } else {
      const { items } = FileFilterService.findAll();
      res.json(ResponseHelper.success(items));
    }
  }

  static getById(req: Request, res: Response): void {
    const id = Number(req.params.id);
    if (!Validator.isPositiveInteger(id)) {
      res.status(400).json(ResponseHelper.error('无效的 ID', 400));
      return;
    }
    const item = FileFilterService.findById(id);
    if (!item) {
      res.status(404).json(ResponseHelper.error('未找到记录', 404));
      return;
    }
    res.json(ResponseHelper.success(item));
  }

  static create(req: Request, res: Response): void {
    const dto = req.body as CreateFileFilterDTO;
    if (!Validator.isNonEmptyString(dto.name)) {
      res.status(400).json(ResponseHelper.error('name 不能为空', 400));
      return;
    }
    if (!Validator.isNonEmptyString(dto.include_extensions)) {
      res.status(400).json(ResponseHelper.error('include_extensions 不能为空', 400));
      return;
    }
    const item = FileFilterService.create(dto);
    res.status(201).json(ResponseHelper.success(item, '创建成功'));
  }

  static update(req: Request, res: Response): void {
    const id = Number(req.params.id);
    if (!Validator.isPositiveInteger(id)) {
      res.status(400).json(ResponseHelper.error('无效的 ID', 400));
      return;
    }
    const dto = req.body as UpdateFileFilterDTO;
    const item = FileFilterService.update(id, dto);
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
    try {
      const deleted = FileFilterService.delete(id);
      if (!deleted) {
        res.status(404).json(ResponseHelper.error('未找到记录', 404));
        return;
      }
      res.json(ResponseHelper.success(null, '删除成功'));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '删除失败';
      res.status(400).json(ResponseHelper.error(msg, 400));
    }
  }
}
