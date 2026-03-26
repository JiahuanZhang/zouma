import { z } from 'zod';

// ── Zod Schemas ──

export const IssueSeveritySchema = z.enum(['error', 'warning', 'info']);
export const IssueCategorySchema = z.enum(['style', 'logic', 'robustness']);
export const ReviewModeSchema = z.enum(['full', 'incremental']);
export const ReviewStrategySchema = z.enum(['simple', 'smart']);

export const ReviewIssueSchema = z.object({
  severity: IssueSeveritySchema,
  category: IssueCategorySchema,
  file: z.string(),
  line: z.number().optional(),
  description: z.string(),
  suggestion: z.string(),
});

export const ReviewScoreSchema = z.object({
  style: z.number().min(1).max(10),
  logic: z.number().min(1).max(10),
  robustness: z.number().min(1).max(10),
  overall: z.number().min(1).max(10),
});

export const ReviewReportSchema = z.object({
  summary: z.string().describe('Overall review summary in Chinese'),
  issues: z.array(ReviewIssueSchema),
  score: ReviewScoreSchema,
});

export const ReviewStateSchema = z.object({
  lastReviewedCommit: z.string(),
  lastReviewDate: z.string(),
  reviewedFiles: z.number(),
});

export const FileSummarySchema = z.object({
  file: z.string(),
  exports: z.array(z.string()),
  imports: z.array(z.string()),
  keySignatures: z.array(z.string()),
  loc: z.number(),
});

export const ProjectSummarySchema = z.object({
  files: z.array(FileSummarySchema),
  dependencyEdges: z.array(z.tuple([z.string(), z.string()])),
  totalLoc: z.number(),
});

export const ReviewOptionsSchema = z.object({
  mode: ReviewModeSchema,
  strategy: ReviewStrategySchema,
  targetPath: z.string(),
  batchSize: z.number(),
  concurrency: z.number(),
  maxTurns: z.number(),
  maxBudgetUsd: z.number().optional(),
  maxGroupSize: z.number(),
  timeoutMs: z.number(),
  includeExtensions: z.array(z.string()),
  excludePatterns: z.array(z.string()),
});

// ── Inferred Types ──

export type ReviewMode = z.infer<typeof ReviewModeSchema>;
export type ReviewStrategy = z.infer<typeof ReviewStrategySchema>;
export type IssueSeverity = z.infer<typeof IssueSeveritySchema>;
export type IssueCategory = z.infer<typeof IssueCategorySchema>;
export type ReviewIssue = z.infer<typeof ReviewIssueSchema>;
export type ReviewScore = z.infer<typeof ReviewScoreSchema>;
export type ReviewReport = z.infer<typeof ReviewReportSchema>;
export type ReviewState = z.infer<typeof ReviewStateSchema>;
export type FileSummary = z.infer<typeof FileSummarySchema>;
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;
export type ReviewOptions = z.infer<typeof ReviewOptionsSchema>;

// ── Defaults ──

export const DEFAULT_OPTIONS: Omit<ReviewOptions, 'targetPath'> = {
  mode: 'incremental',
  strategy: 'smart',
  batchSize: 15,
  concurrency: 3,
  maxTurns: 30,
  maxGroupSize: 25,
  timeoutMs: 3000_000,
  includeExtensions: [
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.py',
    '.java',
    '.go',
    '.rs',
    '.c',
    '.cpp',
    '.h',
    '.cs',
    '.rb',
    '.php',
    '.swift',
    '.kt',
    '.scala',
    '.vue',
    '.svelte',
  ],
  excludePatterns: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.git/**',
    '**/vendor/**',
    '**/target/**',
    '**/__pycache__/**',
    '**/*.min.*',
    '**/*.lock',
    '**/package-lock.json',
    '**/pnpm-lock.yaml',
    '**/yarn.lock',
  ],
};

// ── JSON Schema (for Claude Agent SDK outputFormat) ──

export const REVIEW_REPORT_SCHEMA = z.toJSONSchema(ReviewReportSchema) as Record<string, unknown>;

// ── Logger interface (injected, not global) ──

export interface ReviewLogger {
  debug(msg: string, fileExtra?: string): void;
  info(msg: string, fileExtra?: string): void;
  warn(msg: string, fileExtra?: string): void;
  error(msg: string, fileExtra?: string): void;
  fileOnly(level: string, msg: string): void;
  flush(): Promise<void>;
}

// ── AppConfig (LLM connection) ──

export interface AppConfig {
  apiKey?: string;
  baseUrl?: string;
  model: string;
}
