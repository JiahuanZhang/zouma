import type {
  LlmConfig,
  CreateLlmConfigDTO,
  UpdateLlmConfigDTO,
  PaginationParams,
  FetchModelsDTO,
  ModelInfo,
} from '@zouma/common';
import { resolveBaseUrl, testLlmConnection, isAnthropicProvider } from '@zouma/common';
import { DatabaseManager } from '../database/index.js';

export class LlmConfigService {
  static findAll(params?: PaginationParams): { items: LlmConfig[]; total: number } {
    const db = DatabaseManager.getDatabase();
    const total = (
      db.prepare('SELECT COUNT(*) as count FROM llm_config').get() as { count: number }
    ).count;

    if (params) {
      const offset = (params.page - 1) * params.pageSize;
      const items = db
        .prepare('SELECT * FROM llm_config ORDER BY id DESC LIMIT ? OFFSET ?')
        .all(params.pageSize, offset) as LlmConfig[];
      return { items, total };
    }

    const items = db.prepare('SELECT * FROM llm_config ORDER BY id DESC').all() as LlmConfig[];
    return { items, total };
  }

  static findById(id: number): LlmConfig | undefined {
    const db = DatabaseManager.getDatabase();
    return db.prepare('SELECT * FROM llm_config WHERE id = ?').get(id) as LlmConfig | undefined;
  }

  static create(dto: CreateLlmConfigDTO): LlmConfig {
    const db = DatabaseManager.getDatabase();
    const result = db
      .prepare(
        `INSERT INTO llm_config (name, provider, model, api_key, base_url, max_tokens, temperature, enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        dto.name,
        dto.provider,
        dto.model,
        dto.api_key,
        dto.base_url ?? null,
        dto.max_tokens ?? 4096,
        dto.temperature ?? 0.3,
        dto.enabled ?? 1
      );
    return LlmConfigService.findById(Number(result.lastInsertRowid))!;
  }

  static update(id: number, dto: UpdateLlmConfigDTO): LlmConfig | undefined {
    const db = DatabaseManager.getDatabase();
    const existing = LlmConfigService.findById(id);
    if (!existing) return undefined;

    const fields: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length === 0) return existing;

    fields.push("updated_at = datetime('now')");
    values.push(id);

    db.prepare(`UPDATE llm_config SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return LlmConfigService.findById(id);
  }

  static delete(id: number): boolean {
    const db = DatabaseManager.getDatabase();
    const result = db.prepare('DELETE FROM llm_config WHERE id = ?').run(id);
    return result.changes > 0;
  }

  static async testConnection(config: LlmConfig) {
    return testLlmConnection(config);
  }

  static async fetchModels(dto: FetchModelsDTO): Promise<ModelInfo[]> {
    const provider = dto.provider ?? '';
    const baseUrl = resolveBaseUrl(provider, dto.base_url);

    if (isAnthropicProvider(provider, dto.base_url)) {
      return LlmConfigService.fetchAnthropicModels(baseUrl, dto.api_key);
    }
    return LlmConfigService.fetchOpenAICompatibleModels(baseUrl, dto.api_key);
  }

  private static async fetchOpenAICompatibleModels(
    baseUrl: string,
    apiKey: string
  ): Promise<ModelInfo[]> {
    const res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`获取模型列表失败 (${res.status}): ${text.slice(0, 200)}`);
    }

    const json = (await res.json()) as { data?: { id: string; owned_by?: string }[] };
    const models = (json.data ?? []).map((m) => ({ id: m.id, owned_by: m.owned_by }));
    models.sort((a, b) => a.id.localeCompare(b.id));
    return models;
  }

  private static async fetchAnthropicModels(
    baseUrl: string,
    apiKey: string
  ): Promise<ModelInfo[]> {
    const res = await fetch(`${baseUrl}/v1/models`, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`获取 Anthropic 模型列表失败 (${res.status}): ${text.slice(0, 200)}`);
    }

    const json = (await res.json()) as { data?: { id: string; display_name?: string }[] };
    const models = (json.data ?? []).map((m) => ({
      id: m.id,
      owned_by: 'anthropic',
    }));
    models.sort((a, b) => a.id.localeCompare(b.id));
    return models;
  }
}
