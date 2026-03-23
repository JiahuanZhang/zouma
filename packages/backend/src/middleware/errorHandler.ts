import type { Request, Response, NextFunction } from 'express';
import { ResponseHelper } from '@zouma/common';

export class ErrorHandler {
  static handle(err: Error, _req: Request, res: Response, _next: NextFunction): void {
    console.error('[Error]', err.message);
    res.status(500).json(ResponseHelper.error(err.message || '服务器内部错误'));
  }
}
