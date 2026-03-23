import type { ApiResponse, PaginatedResult, PaginationParams } from './types.js';

export class ResponseHelper {
  static success<T>(data: T, message = 'ok'): ApiResponse<T> {
    return { code: 200, message, data };
  }

  static error(message: string, code = 500): ApiResponse<null> {
    return { code, message, data: null };
  }

  static paginated<T>(
    items: T[],
    total: number,
    params: PaginationParams
  ): ApiResponse<PaginatedResult<T>> {
    const totalPages = Math.ceil(total / params.pageSize);
    return this.success({
      items,
      total,
      page: params.page,
      pageSize: params.pageSize,
      totalPages,
    });
  }
}

export class Validator {
  static isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
  }

  static isPositiveInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0;
  }
}
