import { execSync } from 'node:child_process';
import path from 'node:path';
import { glob } from 'glob';
import type { ReviewOptions } from './reviewTypes.js';

export async function scanFull(options: ReviewOptions): Promise<string[]> {
  const { targetPath, includeExtensions, excludePatterns } = options;
  const extGlob =
    includeExtensions.length === 1
      ? `**/*${includeExtensions[0]}`
      : `**/*{${includeExtensions.join(',')}}`;

  const files = await glob(extGlob, {
    cwd: targetPath,
    ignore: excludePatterns,
    nodir: true,
    absolute: false,
  });

  return files.map((f) => path.normalize(f));
}

export async function scanIncremental(
  targetPath: string,
  lastCommit: string,
  includeExtensions: string[]
): Promise<string[]> {
  const extSet = new Set(includeExtensions);
  const raw = execSync(`git diff --name-only --diff-filter=ACMR ${lastCommit}..HEAD`, {
    cwd: targetPath,
    encoding: 'utf-8',
  });

  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter((f) => f && extSet.has(path.extname(f)));
}

export function splitBatches<T>(items: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}
