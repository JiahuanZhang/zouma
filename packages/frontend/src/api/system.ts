import { http } from './http';

interface DirEntry {
  name: string;
  path: string;
}

export interface BrowseDirsResult {
  current: string;
  entries: DirEntry[];
}

export const systemApi = {
  browseDirs(path?: string) {
    const query = path ? `?path=${encodeURIComponent(path)}` : '';
    return http.get<BrowseDirsResult>(`/system/browse-dirs${query}`);
  },
};
