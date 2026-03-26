import type { Request, Response } from 'express';
import type { CreateReviewTaskDTO, UpdateReviewTaskDTO } from '@zouma/common';
import { ResponseHelper, Validator } from '@zouma/common';
import { ReviewTaskService } from '../services/ReviewTaskService.js';

export class ReviewTaskController {
  static getAll(req: Request, res: Response): void {
    const page = Number(req.query.page) || 0;
    const pageSize = Number(req.query.pageSize) || 0;

    if (page > 0 && pageSize > 0) {
      const { items, total } = ReviewTaskService.findAll({ page, pageSize });
      res.json(ResponseHelper.paginated(items, total, { page, pageSize }));
    } else {
      const { items } = ReviewTaskService.findAll();
      res.json(ResponseHelper.success(items));
    }
  }

  static getById(req: Request, res: Response): void {
    const id = Number(req.params.id);
    if (!Validator.isPositiveInteger(id)) {
      res.status(400).json(ResponseHelper.error('无效的 ID', 400));
      return;
    }
    const item = ReviewTaskService.findById(id);
    if (!item) {
      res.status(404).json(ResponseHelper.error('未找到记录', 404));
      return;
    }
    res.json(ResponseHelper.success(item));
  }

  static create(req: Request, res: Response): void {
    const dto = req.body as CreateReviewTaskDTO;
    if (!Validator.isNonEmptyString(dto.name)) {
      res.status(400).json(ResponseHelper.error('name 不能为空', 400));
      return;
    }
    if (!Validator.isPositiveInteger(dto.repo_id)) {
      res.status(400).json(ResponseHelper.error('repo_id 无效', 400));
      return;
    }
    if (!Validator.isPositiveInteger(dto.llm_config_id)) {
      res.status(400).json(ResponseHelper.error('llm_config_id 无效', 400));
      return;
    }
    const item = ReviewTaskService.create(dto);
    res.status(201).json(ResponseHelper.success(item, '创建成功'));
  }

  static update(req: Request, res: Response): void {
    const id = Number(req.params.id);
    if (!Validator.isPositiveInteger(id)) {
      res.status(400).json(ResponseHelper.error('无效的 ID', 400));
      return;
    }
    const dto = req.body as UpdateReviewTaskDTO;
    const item = ReviewTaskService.update(id, dto);
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
    const deleted = ReviewTaskService.delete(id);
    if (!deleted) {
      res.status(404).json(ResponseHelper.error('未找到记录', 404));
      return;
    }
    res.json(ResponseHelper.success(null, '删除成功'));
  }

  static getLogs(req: Request, res: Response): void {
    const id = Number(req.params.id);
    if (!Validator.isPositiveInteger(id)) {
      res.status(400).json(ResponseHelper.error('无效的 ID', 400));
      return;
    }
    const task = ReviewTaskService.findById(id);
    if (!task) {
      res.status(404).json(ResponseHelper.error('未找到记录', 404));
      return;
    }
    const logs = ReviewTaskService.findLogsByTaskId(id);
    res.json(ResponseHelper.success(logs));
  }

  static execute(req: Request, res: Response): void {
    const id = Number(req.params.id);
    if (!Validator.isPositiveInteger(id)) {
      res.status(400).json(ResponseHelper.error('无效的 ID', 400));
      return;
    }
    const item = ReviewTaskService.execute(id);
    if (!item) {
      res.status(404).json(ResponseHelper.error('未找到记录', 404));
      return;
    }
    res.json(ResponseHelper.success(item, '已提交执行'));
  }

  static getProgress(req: Request, res: Response): void {
    const id = Number(req.params.id);
    if (!Validator.isPositiveInteger(id)) {
      res.status(400).json(ResponseHelper.error('无效的 ID', 400));
      return;
    }
    const progress = ReviewTaskService.findProgressByTaskId(id);
    if (!progress) {
      res.status(404).json(ResponseHelper.error('未找到记录', 404));
      return;
    }
    res.json(ResponseHelper.success(progress));
  }
}
