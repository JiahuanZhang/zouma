import type {
  LlmConfig,
  CreateLlmConfigDTO,
  UpdateLlmConfigDTO,
  PaginatedResult,
  FetchModelsDTO,
  ModelInfo,
  LlmTestResult,
} from '@zouma/common';
import { http } from './http';

const BASE = '/llm-configs';

export const llmConfigApi = {
  getAll() {
    return http.get<LlmConfig[]>(BASE);
  },
  getPage(page: number, pageSize: number) {
    return http.get<PaginatedResult<LlmConfig>>(`${BASE}?page=${page}&pageSize=${pageSize}`);
  },
  getById(id: number) {
    return http.get<LlmConfig>(`${BASE}/${id}`);
  },
  create(dto: CreateLlmConfigDTO) {
    return http.post<LlmConfig>(BASE, dto);
  },
  update(id: number, dto: UpdateLlmConfigDTO) {
    return http.put<LlmConfig>(`${BASE}/${id}`, dto);
  },
  remove(id: number) {
    return http.delete(`${BASE}/${id}`);
  },
  fetchModels(dto: FetchModelsDTO) {
    return http.post<ModelInfo[]>(`${BASE}/models`, dto);
  },
  testConnection(id: number) {
    return http.post<LlmTestResult>(`${BASE}/${id}/test`);
  },
};
