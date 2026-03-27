import { query, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import {
  REVIEW_REPORT_SCHEMA,
  ReviewReportSchema,
  type AppConfig,
  type ReviewLogger,
  type ReviewOptions,
  type ReviewReport,
} from './reviewTypes.js';
import type { ProgressTracker } from '../progressTracker.js';

export interface BatchResult {
  report: ReviewReport;
  tokensUsed?: number;
  costUsd?: number;
  turns?: number;
}

export function buildEnv(config: AppConfig): Record<string, string> {
  const env: Record<string, string> = {};
  if (config.apiKey) env.ANTHROPIC_API_KEY = config.apiKey;
  if (config.baseUrl) env.ANTHROPIC_BASE_URL = config.baseUrl;
  return env;
}

function buildReviewPrompt(projectContext?: string): string {
  const contextSection = projectContext
    ? `\n## 项目全局上下文\n以下是整个项目的结构摘要，请在评审时参考跨文件的依赖关系：\n\n${projectContext}\n`
    : '';

  return `你是一名资深全栈代码评审专家，同时精通代码风格、逻辑正确性和健壮性三个维度的审查。
${contextSection}
工作流程：
1. 使用 Read / Grep / Glob 工具阅读待评审文件的完整代码
2. 从以下三个维度进行全面评审，然后汇总输出结构化报告

## 维度一：代码风格
1. **命名规范** - 变量、函数、类、文件的命名是否清晰且符合语言惯例（camelCase / snake_case / PascalCase）
2. **代码格式** - 缩进一致性、行长度、空行使用、括号风格
3. **Import 组织** - 是否按标准分组排序（内置 → 第三方 → 本地），是否有未使用的 import
4. **注释质量** - 是否有必要注释、注释是否准确、是否有无意义的注释
5. **代码重复** - 是否存在可提取为公共函数/常量的重复代码

## 维度二：逻辑正确性
1. **条件判断** - if/switch 分支是否完整，是否有遗漏的 else/default 分支
2. **边界条件** - 循环终止条件、数组越界、off-by-one 错误
3. **异步与并发** - Promise 是否正确处理、是否有竞态条件、async/await 使用是否正确
4. **类型安全** - 隐式类型转换风险、any 类型滥用、类型断言安全性
5. **算法正确性** - 逻辑流程是否符合预期、数据变换是否正确、状态管理是否一致

## 维度三：健壮性
1. **空值安全** - 是否对可能为 null/undefined 的值做了检查，可选链和空值合并的使用
2. **异常处理** - try-catch 是否覆盖关键路径、错误是否被正确传播、是否有吞掉异常的情况
3. **输入验证** - 函数参数是否做了有效性检查、外部输入（API / 用户输入）是否有验证
4. **资源管理** - 文件句柄、数据库连接、定时器是否正确关闭/清理
5. **安全隐患** - XSS、SQL 注入、路径遍历、敏感信息泄漏、不安全的正则表达式

## 输出要求
- 列出发现的每个问题，包含文件名、行号（如果能定位）、问题描述和改进建议
- severity 标注：error（严重 bug / 安全 / 崩溃风险）、warning（潜在风险 / 建议改进）、info（微小建议）
- 最终输出必须是结构化的 JSON 评审报告，包含 summary、issues、score
- score 中各项评分为 1-10 分（10 为最佳）
- 用中文回复所有内容`;
}

function truncate(s: string, max = 200): string {
  return s.length > max ? s.slice(0, max) + '...' : s;
}

interface SDKUsageInfo {
  tokens?: number;
  costUsd?: number;
  turns?: number;
}

function extractSDKUsage(message: SDKMessage): SDKUsageInfo {
  const raw = message as unknown as Record<string, unknown>;
  const usage = raw.usage as Record<string, number> | undefined;

  let tokens: number | undefined;
  if (usage) {
    if (typeof usage.total_tokens === 'number') {
      tokens = usage.total_tokens;
    } else if (typeof usage.input_tokens === 'number' || typeof usage.output_tokens === 'number') {
      tokens = (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);
    }
  }

  return {
    tokens,
    costUsd: raw.total_cost_usd as number | undefined,
    turns: raw.num_turns as number | undefined,
  };
}

function handleSDKMessage(
  message: SDKMessage,
  label: string,
  logger: ReviewLogger,
  tracker?: ProgressTracker
): void {
  tracker?.handleSDKEvent(message as Parameters<ProgressTracker['handleSDKEvent']>[0]);

  switch (message.type) {
    case 'assistant': {
      const blocks = message.message?.content ?? [];
      for (const block of blocks) {
        if (block.type === 'text') {
          logger.info(`[${label}] LLM 输出文本`, `Full text:\n${block.text}`);
        } else if (block.type === 'tool_use') {
          const inputStr = JSON.stringify(block.input ?? {});
          logger.info(`[${label}] 调用工具: ${block.name}`, `Tool input: ${inputStr}`);
        }
      }
      const parentId = message.parent_tool_use_id;
      if (parentId) {
        logger.debug(`[${label}] (parent_tool_use: ${parentId})`);
      }
      break;
    }

    case 'tool_progress': {
      const toolName = message.tool_name ?? 'unknown';
      const elapsed = message.elapsed_time_seconds?.toFixed(1) ?? '?';
      logger.info(`[${label}] 工具执行中: ${toolName} (${elapsed}s)`);
      break;
    }

    case 'tool_use_summary': {
      logger.info(`[${label}] 工具摘要: ${truncate(message.summary ?? '')}`);
      logger.fileOnly('debug', `[${label}] Tool use summary detail: ${message.summary}`);
      break;
    }

    case 'system': {
      const sub = message.subtype;
      if (sub === 'task_started') {
        logger.info(`[${label}] Agent 启动: ${message.description ?? message.task_id}`);
      } else if (sub === 'task_progress') {
        const u = message.usage ?? {};
        const tool = message.last_tool_name ? ` (工具: ${message.last_tool_name})` : '';
        logger.info(
          `[${label}] Agent 进行中: ${message.description}${tool} | tokens=${u.total_tokens ?? 0}`
        );
      } else if (sub === 'status') {
        if (message.status) logger.info(`[${label}] 状态: ${message.status}`);
      } else {
        logger.debug(`[${label}] system/${sub}: ${JSON.stringify(message).slice(0, 300)}`);
      }
      break;
    }

    case 'result': {
      const sub = message.subtype;
      if (sub === 'success') {
        const cost = message.total_cost_usd?.toFixed(4) ?? '?';
        const turns = message.num_turns ?? '?';
        logger.info(`[${label}] 完成 (turns=${turns}, cost=$${cost})`);
        logger.fileOnly('debug', `[${label}] Result text: ${truncate(message.result ?? '', 2000)}`);
      } else {
        const errors = (message.errors ?? []).join('; ');
        logger.warn(`[${label}] 结束(${sub}): ${truncate(errors)}`);
      }
      break;
    }

    default:
      logger.fileOnly(
        'debug',
        `[${label}] msg(${message.type}): ${JSON.stringify(message).slice(0, 500)}`
      );
  }
}

export async function reviewBatch(
  files: string[],
  options: ReviewOptions,
  config: AppConfig,
  logger: ReviewLogger,
  projectContext?: string,
  budgetUsd?: number,
  tracker?: ProgressTracker
): Promise<BatchResult> {
  const fileList = files.map((f) => `- ${f}`).join('\n');
  const prompt = `请评审以下代码文件（基于目录 ${options.targetPath}）：\n\n${fileList}\n\n请从代码风格、逻辑正确性、健壮性三个维度进行全面评审，然后输出结构化报告。`;

  const env = buildEnv(config);
  const useTimeout = options.timeoutMs > 0;
  const ac = useTimeout ? new AbortController() : undefined;
  const timer = ac ? setTimeout(() => ac.abort(), options.timeoutMs) : undefined;

  const label = `深审-${files.length}f`;
  logger.info(`[${label}] 开始评审 ${files.length} 个文件`);
  logger.fileOnly('debug', `[${label}] 文件列表:\n${fileList}`);
  logger.fileOnly('debug', `[${label}] Prompt:\n${prompt}`);

  let batchTokens = 0;
  let batchCost: number | undefined;
  let batchTurns: number | undefined;

  try {
    const conversation = query({
      prompt,
      options: {
        cwd: options.targetPath,
        systemPrompt: buildReviewPrompt(projectContext),
        allowedTools: ['Read', 'Grep', 'Glob'],
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        maxTurns: options.maxTurns,
        maxBudgetUsd: budgetUsd ?? options.maxBudgetUsd,
        model: config.model,
        ...(Object.keys(env).length > 0 && { env }),
        ...(ac && { abortController: ac }),
        outputFormat: {
          type: 'json_schema',
          schema: REVIEW_REPORT_SCHEMA,
        },
      },
    });

    let resultText = '';

    for await (const message of conversation) {
      handleSDKMessage(message, label, logger, tracker);

      if (message.type === 'system' && message.subtype === 'task_progress') {
        const { tokens } = extractSDKUsage(message);
        if (tokens && tokens > batchTokens) batchTokens = tokens;
      }

      if (message.type === 'result') {
        const usage = extractSDKUsage(message);
        if (usage.tokens && usage.tokens > batchTokens) batchTokens = usage.tokens;
        batchCost = usage.costUsd;
        batchTurns = usage.turns;
        if (message.subtype === 'success') {
          if (message.structured_output) {
            const parsed = validateReport(message.structured_output, label, logger);
            if (parsed)
              return {
                report: parsed,
                tokensUsed: batchTokens,
                costUsd: batchCost,
                turns: batchTurns,
              };
          }
          resultText = message.result;
        }
      }
    }

    return {
      report: parseReportFallback(resultText),
      tokensUsed: batchTokens,
      costUsd: batchCost,
      turns: batchTurns,
    };
  } catch (err) {
    if (ac?.signal.aborted) {
      logger.warn(`[${label}] 评审超时 (${options.timeoutMs / 1000}s)`);
      return {
        report: parseReportFallback(''),
        tokensUsed: batchTokens,
        costUsd: batchCost,
        turns: batchTurns,
      };
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`[${label}] 评审失败: ${truncate(errMsg)}`, `Full error: ${errMsg}`);
    return {
      report: parseReportFallback(''),
      tokensUsed: batchTokens,
      costUsd: batchCost,
      turns: batchTurns,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const QUICK_SCAN_PROMPT = `你是一名代码快速扫描专家。你的任务是快速浏览代码，仅找出最严重的问题。

工作流程：
1. 使用 Read 工具快速浏览每个文件
2. 仅报告 error 级别的问题（可能导致 bug、崩溃、安全漏洞的问题）
3. 不要报告代码风格问题或微小改进建议
4. 输出结构化 JSON 报告

用中文回复所有内容。`;

export async function quickScanBatch(
  files: string[],
  options: ReviewOptions,
  config: AppConfig,
  logger: ReviewLogger,
  projectContext: string,
  budgetUsd?: number,
  tracker?: ProgressTracker
): Promise<BatchResult> {
  const fileList = files.map((f) => `- ${f}`).join('\n');
  const prompt = `快速扫描以下代码文件（基于目录 ${options.targetPath}），仅找出严重问题：\n\n${fileList}`;

  const env = buildEnv(config);
  const systemPrompt = `${QUICK_SCAN_PROMPT}\n\n## 项目全局上下文\n${projectContext}`;
  const useTimeout = options.timeoutMs > 0;
  const ac = useTimeout ? new AbortController() : undefined;
  const timer = ac ? setTimeout(() => ac.abort(), options.timeoutMs) : undefined;

  const label = `快扫-${files.length}f`;
  logger.info(`[${label}] 开始扫描 ${files.length} 个文件`);
  logger.fileOnly('debug', `[${label}] 文件列表:\n${fileList}`);

  let batchTokens = 0;
  let batchCost: number | undefined;
  let batchTurns: number | undefined;

  try {
    const conversation = query({
      prompt,
      options: {
        cwd: options.targetPath,
        systemPrompt,
        allowedTools: ['Read', 'Grep', 'Glob'],
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        maxTurns: Math.min(options.maxTurns, 10),
        maxBudgetUsd: budgetUsd,
        model: config.model,
        ...(Object.keys(env).length > 0 && { env }),
        ...(ac && { abortController: ac }),
        outputFormat: {
          type: 'json_schema',
          schema: REVIEW_REPORT_SCHEMA,
        },
      },
    });

    let resultText = '';

    for await (const message of conversation) {
      handleSDKMessage(message, label, logger, tracker);

      if (message.type === 'system' && message.subtype === 'task_progress') {
        const { tokens } = extractSDKUsage(message);
        if (tokens && tokens > batchTokens) batchTokens = tokens;
      }

      if (message.type === 'result') {
        const usage = extractSDKUsage(message);
        if (usage.tokens && usage.tokens > batchTokens) batchTokens = usage.tokens;
        batchCost = usage.costUsd;
        batchTurns = usage.turns;
        if (message.subtype === 'success') {
          if (message.structured_output) {
            const parsed = validateReport(message.structured_output, label, logger);
            if (parsed)
              return {
                report: parsed,
                tokensUsed: batchTokens,
                costUsd: batchCost,
                turns: batchTurns,
              };
          }
          resultText = message.result;
        }
      }
    }

    return {
      report: parseReportFallback(resultText),
      tokensUsed: batchTokens,
      costUsd: batchCost,
      turns: batchTurns,
    };
  } catch (err) {
    if (ac?.signal.aborted) {
      logger.warn(`[${label}] 快扫超时 (${options.timeoutMs / 1000}s)`);
      return {
        report: parseReportFallback(''),
        tokensUsed: batchTokens,
        costUsd: batchCost,
        turns: batchTurns,
      };
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`[${label}] 快扫失败: ${truncate(errMsg)}`, `Full error: ${errMsg}`);
    return {
      report: parseReportFallback(''),
      tokensUsed: batchTokens,
      costUsd: batchCost,
      turns: batchTurns,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function validateReport(raw: unknown, label: string, logger: ReviewLogger): ReviewReport | null {
  const result = ReviewReportSchema.safeParse(raw);
  if (result.success) return result.data;

  const errors = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  logger.error(`[${label}] structured_output 类型校验失败: ${errors}`);
  logger.fileOnly('debug', `[${label}] 原始 structured_output: ${JSON.stringify(raw)}`);
  return null;
}

function parseReportFallback(text: string): ReviewReport {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as ReviewReport;
  } catch {
    // ignore parse errors
  }

  return {
    summary: text || '评审未返回有效结果',
    issues: [],
    score: { style: 0, logic: 0, robustness: 0, overall: 0 },
  };
}
