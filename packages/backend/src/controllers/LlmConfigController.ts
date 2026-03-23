import type { Request, Response } from 'express';
import type { CreateLlmConfigDTO, UpdateLlmConfigDTO, FetchModelsDTO } from '@zouma/common';
import { ResponseHelper, Validator } from '@zouma/common';
import { LlmConfigService } from '../services/LlmConfigService.js';

export class LlmConfigController {
  static getAll(req: Request, res: Response): void {
    const page = Number(req.query.page) || 0;
    const pageSize = Number(req.query.pageSize) || 0;

    if (page > 0 && pageSize > 0) {
      const { items, total } = LlmConfigService.findAll({ page, pageSize });
      res.json(ResponseHelper.paginated(items, total, { page, pageSize }));
    } else {
      const { items } = LlmConfigService.findAll();
      res.json(ResponseHelper.success(items));
    }
  }

  static getById(req: Request, res: Response): void {
    const id = Number(req.params.id);
    if (!Validator.isPositiveInteger(id)) {
      res.status(400).json(ResponseHelper.error('无效的 ID', 400));
      return;
    }
    const item = LlmConfigService.findById(id);
    if (!item) {
      res.status(404).json(ResponseHelper.error('未找到记录', 404));
      return;
    }
    res.json(ResponseHelper.success(item));
  }

  static create(req: Request, res: Response): void {
    const dto = req.body as CreateLlmConfigDTO;
    if (!Validator.isNonEmptyString(dto.name)) {
      res.status(400).json(ResponseHelper.error('name 不能为空', 400));
      return;
    }
    if (!Validator.isNonEmptyString(dto.provider)) {
      res.status(400).json(ResponseHelper.error('provider 不能为空', 400));
      return;
    }
    if (!Validator.isNonEmptyString(dto.model)) {
      res.status(400).json(ResponseHelper.error('model 不能为空', 400));
      return;
    }
    if (!Validator.isNonEmptyString(dto.api_key)) {
      res.status(400).json(ResponseHelper.error('api_key 不能为空', 400));
      return;
    }
    const item = LlmConfigService.create(dto);
    res.status(201).json(ResponseHelper.success(item, '创建成功'));
  }

  static update(req: Request, res: Response): void {
    const id = Number(req.params.id);
    if (!Validator.isPositiveInteger(id)) {
      res.status(400).json(ResponseHelper.error('无效的 ID', 400));
      return;
    }
    const dto = req.body as UpdateLlmConfigDTO;
    const item = LlmConfigService.update(id, dto);
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
    const deleted = LlmConfigService.delete(id);
    if (!deleted) {
      res.status(404).json(ResponseHelper.error('未找到记录', 404));
      return;
    }
    res.json(ResponseHelper.success(null, '删除成功'));
  }

  static async fetchModels(req: Request, res: Response): Promise<void> {
    const dto = req.body as FetchModelsDTO;
    if (!Validator.isNonEmptyString(dto.api_key)) {
      res.status(400).json(ResponseHelper.error('api_key 不能为空', 400));
      return;
    }
    try {
      const models = await LlmConfigService.fetchModels(dto);
      res.json(ResponseHelper.success(models));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '获取模型列表失败';
      res.status(502).json(ResponseHelper.error(msg, 502));
    }
  }
}
