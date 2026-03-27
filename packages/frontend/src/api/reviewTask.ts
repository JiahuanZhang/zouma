import type {
  ReviewTaskWithRelations,
  CreateReviewTaskDTO,
  UpdateReviewTaskDTO,
  PaginatedResult,
  ReviewLog,
  TaskProgressSummary,
  ReviewIssueRecord,
} from '@zouma/common';
import { http } from './http';

const BASE = '/review-tasks';

export const reviewTaskApi = {
  getAll() {
    return http.get<ReviewTaskWithRelations[]>(BASE);
  },
  getPage(page: number, pageSize: number) {
    return http.get<PaginatedResult<ReviewTaskWithRelations>>(
      `${BASE}?page=${page}&pageSize=${pageSize}`
    );
  },
  getById(id: number) {
    return http.get<ReviewTaskWithRelations>(`${BASE}/${id}`);
  },
  create(dto: CreateReviewTaskDTO) {
    return http.post<ReviewTaskWithRelations>(BASE, dto);
  },
  update(id: number, dto: UpdateReviewTaskDTO) {
    return http.put<ReviewTaskWithRelations>(`${BASE}/${id}`, dto);
  },
  remove(id: number) {
    return http.delete(`${BASE}/${id}`);
  },
  getLogs(taskId: number) {
    return http.get<ReviewLog[]>(`${BASE}/${taskId}/logs`);
  },
  getProgress(taskId: number) {
    return http.get<TaskProgressSummary>(`${BASE}/${taskId}/progress`);
  },
  getIssues(taskId: number, filters?: { severity?: string; category?: string }) {
    const params = new URLSearchParams();
    if (filters?.severity) params.set('severity', filters.severity);
    if (filters?.category) params.set('category', filters.category);
    const qs = params.toString();
    return http.get<ReviewIssueRecord[]>(`${BASE}/${taskId}/issues${qs ? `?${qs}` : ''}`);
  },
};
