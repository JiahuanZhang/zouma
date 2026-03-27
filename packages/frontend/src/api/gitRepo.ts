import type {
  GitRepo,
  CreateGitRepoDTO,
  UpdateGitRepoDTO,
  PaginatedResult,
  DetectLocalRepoResult,
} from '@zouma/common';
import { http } from './http';

const BASE = '/git-repos';

export const gitRepoApi = {
  getAll() {
    return http.get<GitRepo[]>(BASE);
  },
  getPage(page: number, pageSize: number) {
    return http.get<PaginatedResult<GitRepo>>(`${BASE}?page=${page}&pageSize=${pageSize}`);
  },
  getById(id: number) {
    return http.get<GitRepo>(`${BASE}/${id}`);
  },
  create(dto: CreateGitRepoDTO) {
    return http.post<GitRepo>(BASE, dto);
  },
  update(id: number, dto: UpdateGitRepoDTO) {
    return http.put<GitRepo>(`${BASE}/${id}`, dto);
  },
  remove(id: number, deleteLocal = false) {
    return http.delete(`${BASE}/${id}`, { data: { delete_local: deleteLocal } });
  },
  detectLocal(path: string) {
    return http.post<DetectLocalRepoResult>(`${BASE}/detect-local`, { path });
  },
};
