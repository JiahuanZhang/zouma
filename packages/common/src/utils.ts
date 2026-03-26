import type {
  ApiResponse,
  LlmConfig,
  LlmTestResult,
  PaginatedResult,
  PaginationParams,
} from './types.js';

// ========== LLM Provider Helpers ==========

export const PROVIDER_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  deepseek: 'https://api.deepseek.com/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
};

const ANTHROPIC_API_VERSION = '2023-06-01';

export function isAnthropicProvider(provider: string, baseUrl?: string | null): boolean {
  if (provider.toLowerCase() === 'anthropic') return true;
  if (baseUrl && /anthropic\.com/i.test(baseUrl)) return true;
  return false;
}

export function resolveBaseUrl(provider: string, customBaseUrl?: string | null): string {
  if (customBaseUrl) return customBaseUrl.replace(/\/+$/, '');
  const url = PROVIDER_BASE_URLS[provider.toLowerCase()];
  if (!url) throw new Error(`未知的 LLM provider: ${provider}`);
  return url;
}

async function testAnthropicConnection(
  baseUrl: string,
  config: Pick<LlmConfig, 'model' | 'api_key'>
): Promise<LlmTestResult> {
  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.api_key,
        'anthropic-version': ANTHROPIC_API_VERSION,
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 5,
        messages: [{ role: 'user', content: 'Hi' }],
      }),
      signal: AbortSignal.timeout(15000),
    });

    const latencyMs = Date.now() - start;

    if (res.ok) {
      return { ok: true, message: `连接正常 (${res.status})`, latencyMs };
    }

    const text = await res.text().catch(() => '');
    const brief = text.slice(0, 200);

    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: `认证失败 (${res.status}): ${brief}`, latencyMs };
    }
    return { ok: false, message: `请求失败 (${res.status}): ${brief}`, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `连接异常: ${msg}`, latencyMs };
  }
}

async function testOpenAICompatibleConnection(
  baseUrl: string,
  config: Pick<LlmConfig, 'model' | 'api_key'>
): Promise<LlmTestResult> {
  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.api_key}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const latencyMs = Date.now() - start;

    if (res.ok) {
      return { ok: true, message: `连接正常 (${res.status})`, latencyMs };
    }

    const text = await res.text().catch(() => '');
    const brief = text.slice(0, 200);

    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: `认证失败 (${res.status}): ${brief}`, latencyMs };
    }
    return { ok: false, message: `请求失败 (${res.status}): ${brief}`, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `连接异常: ${msg}`, latencyMs };
  }
}

export async function testLlmConnection(
  config: Pick<LlmConfig, 'provider' | 'model' | 'api_key' | 'base_url'>
): Promise<LlmTestResult> {
  const baseUrl = resolveBaseUrl(config.provider, config.base_url);

  if (isAnthropicProvider(config.provider, config.base_url)) {
    return testAnthropicConnection(baseUrl, config);
  }
  return testOpenAICompatibleConnection(baseUrl, config);
}

// ========== Response Helpers ==========

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
