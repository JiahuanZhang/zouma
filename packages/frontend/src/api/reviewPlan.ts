import type {
  ReviewPlanWithRelations,
  CreateReviewPlanDTO,
  UpdateReviewPlanDTO,
  PaginatedResult,
} from '@zouma/common';
import { http } from './http';

const BASE = '/review-plans';

export const reviewPlanApi = {
  getAll() {
    return http.get<ReviewPlanWithRelations[]>(BASE);
  },
  getPage(page: number, pageSize: number) {
    return http.get<PaginatedResult<ReviewPlanWithRelations>>(
      `${BASE}?page=${page}&pageSize=${pageSize}`
    );
  },
  getById(id: number) {
    return http.get<ReviewPlanWithRelations>(`${BASE}/${id}`);
  },
  create(dto: CreateReviewPlanDTO) {
    return http.post<ReviewPlanWithRelations>(BASE, dto);
  },
  update(id: number, dto: UpdateReviewPlanDTO) {
    return http.put<ReviewPlanWithRelations>(`${BASE}/${id}`, dto);
  },
  remove(id: number) {
    return http.delete(`${BASE}/${id}`);
  },
  trigger(id: number) {
    return http.post<{ plan: ReviewPlanWithRelations; taskId: number }>(`${BASE}/${id}/trigger`);
  },
};
