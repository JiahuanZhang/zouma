import pLimit from 'p-limit';
import { scanFull, scanIncremental, splitBatches } from './scanner.js';
import { loadState, saveState, getCurrentCommit, isGitRepo } from './state.js';
import { reviewBatch, quickScanBatch, type BatchResult } from './review.js';
import { analyzeDependencies } from './dependency.js';
import { generateProjectSummary, formatSummaryContext } from './summarize.js';
import type {
  AppConfig,
  ReviewLogger,
  ReviewOptions,
  ReviewReport,
  ReviewIssue,
} from './reviewTypes.js';
import type { ProgressTracker } from '../progressTracker.js';

export interface RunResult {
  report: ReviewReport;
  totalFiles: number;
  batchCount: number;
  mode: string;
  strategy: string;
  tokensUsed: number;
  costUsd: number;
}

export async function runReview(
  options: ReviewOptions,
  config: AppConfig,
  logger: ReviewLogger,
  tracker?: ProgressTracker
): Promise<RunResult> {
  tracker?.taskStart({
    strategy: options.strategy,
    mode: options.mode,
    totalFiles: 0,
    totalBatches: 0,
  });

  tracker?.phaseStart('collect_files');
  const t0 = Date.now();
  const files = await collectFiles(options, logger);
  tracker?.phaseEnd('collect_files', {
    durationMs: Date.now() - t0,
    fileCount: files.length,
    detail: { files },
  });

  if (files.length === 0) {
    logger.info('没有需要评审的文件。');
    tracker?.taskEnd({ status: 'completed', durationMs: Date.now() - t0, issueCount: 0 });
    return emptyResult(options.mode, options.strategy);
  }

  const effectiveStrategy =
    options.strategy === 'smart' && files.length < 30 ? 'simple' : options.strategy;

  if (effectiveStrategy === 'simple' && options.strategy === 'smart') {
    logger.info('文件数 < 30，自动切换为 simple 策略');
  }

  return effectiveStrategy === 'smart'
    ? runReviewSmart(files, options, config, logger, tracker)
    : runReviewSimple(files, options, config, logger, tracker);
}

// ---------- Simple strategy ----------

async function runReviewSimple(
  files: string[],
  options: ReviewOptions,
  config: AppConfig,
  logger: ReviewLogger,
  tracker?: ProgressTracker
): Promise<RunResult> {
  const { mode, batchSize, concurrency } = options;

  logger.info(`发现 ${files.length} 个待评审文件，模式: ${mode}，策略: simple`);

  const batches = splitBatches(files, batchSize);
  logger.info(
    `分为 ${batches.length} 个批次（每批最多 ${batchSize} 个文件），并发: ${concurrency}`
  );

  tracker?.phaseStart('deep_review');
  const phaseT0 = Date.now();
  let totalTokens = 0;
  let totalCost = 0;

  const limit = pLimit(concurrency);
  const tasks = batches.map((batch, idx) =>
    limit(async () => {
      const batchIdx = idx + 1;
      logger.info(`[批次 ${batchIdx}/${batches.length}] 开始评审 ${batch.length} 个文件...`);
      tracker?.batchStart('deep_review', batchIdx, batches.length, batch.length, { files: batch });
      const t0 = Date.now();
      try {
        const result = await reviewBatch(
          batch,
          options,
          config,
          logger,
          undefined,
          undefined,
          tracker
        );
        const durationMs = Date.now() - t0;
        const safe = ensureBatchResult(result);
        const sec = (durationMs / 1000).toFixed(1);
        logger.info(
          `[批次 ${batchIdx}/${batches.length}] 完成 (${sec}s, issues=${safe.report.issues.length})`
        );
        tracker?.batchEnd('deep_review', batchIdx, {
          status: 'completed',
          durationMs,
          issueCount: safe.report.issues.length,
          tokensUsed: safe.tokensUsed,
          costUsd: safe.costUsd,
        });
        totalTokens += safe.tokensUsed ?? 0;
        totalCost += safe.costUsd ?? 0;
        return safe.report;
      } catch (err) {
        tracker?.batchEnd('deep_review', batchIdx, {
          status: 'failed',
          durationMs: Date.now() - t0,
          issueCount: 0,
        });
        throw err;
      }
    })
  );

  const settled = await Promise.allSettled(tasks);
  const reports = collectSettled(settled, '批次', logger);
  const merged = mergeReports(reports);

  tracker?.phaseEnd('deep_review', {
    durationMs: Date.now() - phaseT0,
    issueCount: merged.issues.length,
  });

  tracker?.phaseStart('merge');
  tracker?.phaseEnd('merge', { durationMs: 0 });

  saveIfGit(options, files, logger);

  return {
    report: merged,
    totalFiles: files.length,
    batchCount: batches.length,
    mode,
    strategy: 'simple',
    tokensUsed: totalTokens,
    costUsd: totalCost,
  };
}

// ---------- Smart strategy ----------

async function runReviewSmart(
  files: string[],
  options: ReviewOptions,
  config: AppConfig,
  logger: ReviewLogger,
  tracker?: ProgressTracker
): Promise<RunResult> {
  const { mode, targetPath, concurrency, maxGroupSize } = options;
  let totalTokens = 0;
  let totalCost = 0;

  logger.info(`发现 ${files.length} 个待评审文件，模式: ${mode}，策略: smart`);

  // ── Phase 0a: dependency analysis ──
  logger.info('── 阶段 0: 项目分析 ──');
  tracker?.phaseStart('analyze_deps');
  let depT0 = Date.now();
  const { groups, edges } = analyzeDependencies(files, targetPath, maxGroupSize);
  logger.info(`依赖分析: ${groups.length} 个模块组`);
  tracker?.phaseEnd('analyze_deps', {
    durationMs: Date.now() - depT0,
    detail: {
      groupCount: groups.length,
      groups: groups.map((g, i) => ({ index: i + 1, files: g })),
    },
  });

  // ── Phase 0b: project summary ──
  tracker?.phaseStart('project_summary');
  depT0 = Date.now();
  const summary = await generateProjectSummary(files, targetPath, edges);
  const context = formatSummaryContext(summary);
  logger.info(`结构摘要: ${summary.totalLoc} 行有效代码`);
  logger.fileOnly('debug', `项目摘要:\n${context}`);
  tracker?.phaseEnd('project_summary', {
    durationMs: Date.now() - depT0,
    detail: {
      totalLoc: summary.totalLoc,
      files: summary.files.map((f) => ({ file: f.file, loc: f.loc })),
    },
  });

  const limit = pLimit(concurrency);
  const totalBudget = options.maxBudgetUsd;

  // ── Phase 1: quick scan ──
  logger.info(`── 阶段 1: 快速扫描 (${groups.length} 组, 并发 ${concurrency}) ──`);
  tracker?.phaseStart('quick_scan');
  const quickPhaseT0 = Date.now();
  const quickBudget = totalBudget ? (totalBudget * 0.2) / groups.length : undefined;

  const quickTasks = groups.map((group, idx) =>
    limit(async () => {
      const batchIdx = idx + 1;
      logger.info(`[快扫 ${batchIdx}/${groups.length}] ${group.length} 文件`);
      tracker?.batchStart('quick_scan', batchIdx, groups.length, group.length, { files: group });
      const t0 = Date.now();
      try {
        const r = await quickScanBatch(
          group,
          options,
          config,
          logger,
          context,
          quickBudget,
          tracker
        );
        const durationMs = Date.now() - t0;
        const safe = ensureBatchResult(r);
        const sec = (durationMs / 1000).toFixed(1);
        logger.info(
          `[快扫 ${batchIdx}/${groups.length}] 完成 (${sec}s, issues=${safe.report.issues.length})`
        );
        tracker?.batchEnd('quick_scan', batchIdx, {
          status: 'completed',
          durationMs,
          issueCount: safe.report.issues.length,
          tokensUsed: safe.tokensUsed,
          costUsd: safe.costUsd,
        });
        totalTokens += safe.tokensUsed ?? 0;
        totalCost += safe.costUsd ?? 0;
        return safe.report;
      } catch (err) {
        tracker?.batchEnd('quick_scan', batchIdx, {
          status: 'failed',
          durationMs: Date.now() - t0,
          issueCount: 0,
        });
        throw err;
      }
    })
  );
  const quickReports = await Promise.allSettled(quickTasks);
  const settledQuickReports = collectSettled(quickReports, '快扫', logger);
  const quickIssues = settledQuickReports.flatMap((r) => r.issues);
  logger.info(`快速扫描完成: ${quickIssues.length} 个严重问题`);
  tracker?.phaseEnd('quick_scan', {
    durationMs: Date.now() - quickPhaseT0,
    issueCount: quickIssues.length,
  });

  // ── Phase 2: deep review ──
  logger.info(`── 阶段 2: 深度评审 (${groups.length} 组, 并发 ${concurrency}) ──`);
  tracker?.phaseStart('deep_review');
  const deepPhaseT0 = Date.now();
  const deepBudget = totalBudget ? (totalBudget * 0.8) / groups.length : undefined;
  const enrichedContext = enrichContext(context, quickIssues);

  const deepTasks = groups.map((group, idx) =>
    limit(async () => {
      const batchIdx = idx + 1;
      logger.info(`[深审 ${batchIdx}/${groups.length}] ${group.length} 文件`);
      tracker?.batchStart('deep_review', batchIdx, groups.length, group.length, { files: group });
      const t0 = Date.now();
      try {
        const r = await reviewBatch(
          group,
          options,
          config,
          logger,
          enrichedContext,
          deepBudget,
          tracker
        );
        const durationMs = Date.now() - t0;
        const safe = ensureBatchResult(r);
        const sec = (durationMs / 1000).toFixed(1);
        logger.info(
          `[深审 ${batchIdx}/${groups.length}] 完成 (${sec}s, issues=${safe.report.issues.length})`
        );
        tracker?.batchEnd('deep_review', batchIdx, {
          status: 'completed',
          durationMs,
          issueCount: safe.report.issues.length,
          tokensUsed: safe.tokensUsed,
          costUsd: safe.costUsd,
        });
        totalTokens += safe.tokensUsed ?? 0;
        totalCost += safe.costUsd ?? 0;
        return safe.report;
      } catch (err) {
        tracker?.batchEnd('deep_review', batchIdx, {
          status: 'failed',
          durationMs: Date.now() - t0,
          issueCount: 0,
        });
        throw err;
      }
    })
  );
  const deepReports = await Promise.allSettled(deepTasks);
  const settledDeepReports = collectSettled(deepReports, '深审', logger);

  tracker?.phaseEnd('deep_review', {
    durationMs: Date.now() - deepPhaseT0,
    issueCount: settledDeepReports.reduce((s, r) => s + r.issues.length, 0),
  });

  // ── Merge ──
  tracker?.phaseStart('merge');
  const mergeT0 = Date.now();
  const merged = smartMergeReports(settledQuickReports, settledDeepReports);
  tracker?.phaseEnd('merge', { durationMs: Date.now() - mergeT0 });

  saveIfGit(options, files, logger);

  return {
    report: merged,
    totalFiles: files.length,
    batchCount: groups.length,
    mode,
    strategy: 'smart',
    tokensUsed: totalTokens,
    costUsd: totalCost,
  };
}

// ---------- Helpers ----------

function ensureBatchResult(r: BatchResult): BatchResult {
  return {
    report: {
      summary: r?.report?.summary ?? '评审未返回有效结果',
      issues: Array.isArray(r?.report?.issues) ? r.report.issues : [],
      score: r?.report?.score ?? { style: 0, logic: 0, robustness: 0, overall: 0 },
    },
    tokensUsed: r?.tokensUsed,
    costUsd: r?.costUsd,
    turns: r?.turns,
  };
}

function collectSettled(
  results: PromiseSettledResult<ReviewReport>[],
  label: string,
  logger: ReviewLogger
): ReviewReport[] {
  const emptyReport: ReviewReport = {
    summary: '评审未返回有效结果',
    issues: [],
    score: { style: 0, logic: 0, robustness: 0, overall: 0 },
  };
  const reports: ReviewReport[] = [];
  for (const [i, r] of results.entries()) {
    if (r.status === 'fulfilled') {
      reports.push(r.value);
    } else {
      const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
      logger.error(`[${label} ${i + 1}] 异常: ${msg}`);
      reports.push(emptyReport);
    }
  }
  return reports;
}

function enrichContext(baseContext: string, quickIssues: ReviewIssue[]): string {
  if (quickIssues.length === 0) return baseContext;

  const issueLines = quickIssues
    .map((i) => `- [${i.file}${i.line ? ':' + i.line : ''}] ${i.description}`)
    .join('\n');

  return `${baseContext}\n\n## 快速扫描已发现的严重问题\n${issueLines}\n\n请在深度评审中关注这些问题的根因，并发现更多潜在问题。`;
}

function saveIfGit(options: ReviewOptions, files: string[], logger: ReviewLogger): void {
  if (isGitRepo(options.targetPath)) {
    const commit = getCurrentCommit(options.targetPath);
    saveState(options.targetPath, commit, files.length);
    logger.info(`评审状态已保存（commit: ${commit.slice(0, 8)}）`);
  }
}

function emptyResult(mode: string, strategy: string): RunResult {
  return {
    report: {
      summary: '没有需要评审的文件',
      issues: [],
      score: { style: 10, logic: 10, robustness: 10, overall: 10 },
    },
    totalFiles: 0,
    batchCount: 0,
    mode,
    strategy,
    tokensUsed: 0,
    costUsd: 0,
  };
}

async function collectFiles(options: ReviewOptions, logger: ReviewLogger): Promise<string[]> {
  const { mode, targetPath, includeExtensions } = options;

  if (mode === 'incremental' && isGitRepo(targetPath)) {
    const state = loadState(targetPath);
    if (state) {
      logger.info(`增量模式：从 commit ${state.lastReviewedCommit.slice(0, 8)} 开始`);
      const files = await scanIncremental(targetPath, state.lastReviewedCommit, includeExtensions);
      if (files.length === 0) {
        logger.info('自上次评审以来没有文件变更，无需评审');
      }
      return files;
    }
    logger.info('未找到评审状态文件，回退为全量评审');
  }

  return scanFull(options);
}

// ---------- Merge strategies ----------

function mergeReports(reports: ReviewReport[]): ReviewReport {
  if (reports.length === 0) {
    return {
      summary: '无评审结果',
      issues: [],
      score: { style: 0, logic: 0, robustness: 0, overall: 0 },
    };
  }
  if (reports.length === 1) return reports[0];

  const allIssues = deduplicateIssues(reports.flatMap((r) => r.issues));
  const summaries = reports.map((r) => r.summary).filter(Boolean);
  const avgScore = {
    style: avg(reports.map((r) => r.score.style)),
    logic: avg(reports.map((r) => r.score.logic)),
    robustness: avg(reports.map((r) => r.score.robustness)),
    overall: 0,
  };
  avgScore.overall = Math.round((avgScore.style + avgScore.logic + avgScore.robustness) / 3);

  return { summary: summaries.join('\n\n---\n\n'), issues: allIssues, score: avgScore };
}

function smartMergeReports(
  quickReports: ReviewReport[],
  deepReports: ReviewReport[]
): ReviewReport {
  const allIssues = smartDeduplicateIssues([
    ...quickReports.flatMap((r) => r.issues),
    ...deepReports.flatMap((r) => r.issues),
  ]);

  const validScores = deepReports.filter((r) => r.score.overall > 0);
  const avgScore =
    validScores.length > 0
      ? {
          style: avg(validScores.map((r) => r.score.style)),
          logic: avg(validScores.map((r) => r.score.logic)),
          robustness: avg(validScores.map((r) => r.score.robustness)),
          overall: 0,
        }
      : { style: 0, logic: 0, robustness: 0, overall: 0 };
  avgScore.overall = Math.round((avgScore.style + avgScore.logic + avgScore.robustness) / 3);

  const summaries = deepReports.map((r) => r.summary).filter(Boolean);

  return {
    summary: summaries.length <= 1 ? (summaries[0] ?? '无评审总结') : summaries.join('\n\n---\n\n'),
    issues: allIssues,
    score: avgScore,
  };
}

function deduplicateIssues(issues: ReviewIssue[]): ReviewIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.file}:${issue.line ?? ''}:${issue.description}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function smartDeduplicateIssues(issues: ReviewIssue[]): ReviewIssue[] {
  const result: ReviewIssue[] = [];
  for (const issue of issues) {
    const dup = result.some(
      (e) =>
        e.file === issue.file &&
        e.category === issue.category &&
        (e.line === issue.line || (!e.line && !issue.line)) &&
        jaccardSimilarity(e.description, issue.description) > 0.6
    );
    if (!dup) result.push(issue);
  }
  return result;
}

function jaccardSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const setA = new Set(a.toLowerCase().split(/\s+/));
  const setB = new Set(b.toLowerCase().split(/\s+/));
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}
