import type {
  FileFilter,
  CreateFileFilterDTO,
  UpdateFileFilterDTO,
  PaginatedResult,
} from '@zouma/common';
import { http } from './http';

const BASE = '/file-filters';

export const fileFilterApi = {
  getAll() {
    return http.get<FileFilter[]>(BASE);
  },
  getPage(page: number, pageSize: number) {
    return http.get<PaginatedResult<FileFilter>>(`${BASE}?page=${page}&pageSize=${pageSize}`);
  },
  getById(id: number) {
    return http.get<FileFilter>(`${BASE}/${id}`);
  },
  create(dto: CreateFileFilterDTO) {
    return http.post<FileFilter>(BASE, dto);
  },
  update(id: number, dto: UpdateFileFilterDTO) {
    return http.put<FileFilter>(`${BASE}/${id}`, dto);
  },
  remove(id: number) {
    return http.delete(`${BASE}/${id}`);
  },
};
