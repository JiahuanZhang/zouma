import fs from 'node:fs';
import path from 'node:path';
import { parseImports } from './dependency.js';
import type { FileSummary, ProjectSummary } from './reviewTypes.js';

function extractExports(content: string, ext: string): string[] {
  const exports: string[] = [];

  if (['.ts', '.tsx', '.js', '.jsx', '.mjs'].includes(ext)) {
    const declRegex =
      /export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|type|interface|enum)\s+(\w+)/g;
    let m: RegExpExecArray | null;
    while ((m = declRegex.exec(content)) !== null) exports.push(m[1]);

    const namedRegex = /export\s*\{([^}]+)\}/g;
    while ((m = namedRegex.exec(content)) !== null) {
      const names = m[1]
        .split(',')
        .map((n) =>
          n
            .trim()
            .split(/\s+as\s+/)
            .pop()!
            .trim()
        )
        .filter(Boolean);
      exports.push(...names);
    }
  } else if (ext === '.py') {
    const defRegex = /^(?:def|class)\s+(\w+)/gm;
    let m: RegExpExecArray | null;
    while ((m = defRegex.exec(content)) !== null) exports.push(m[1]);
  }

  return [...new Set(exports)];
}

function extractKeySignatures(content: string, ext: string): string[] {
  const sigs: string[] = [];

  if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
    const funcRegex = /(?:export\s+)?(?:async\s+)?function\s+\w+\s*\([^)]*\)(?:\s*:\s*[^{]+)?/g;
    let m: RegExpExecArray | null;
    while ((m = funcRegex.exec(content)) !== null) sigs.push(m[0].trim());

    const classRegex =
      /(?:export\s+)?class\s+\w+(?:\s+extends\s+\w+)?(?:\s+implements\s+[\w,\s]+)?/g;
    while ((m = classRegex.exec(content)) !== null) sigs.push(m[0].trim());
  } else if (ext === '.py') {
    const pyRegex = /^(?:def|class)\s+\w+[^:]*:/gm;
    let m: RegExpExecArray | null;
    while ((m = pyRegex.exec(content)) !== null) sigs.push(m[0].trim());
  }

  return sigs.slice(0, 10);
}

export async function generateProjectSummary(
  files: string[],
  targetPath: string,
  dependencyEdges: [string, string][]
): Promise<ProjectSummary> {
  const fileSummaries: FileSummary[] = [];
  let totalLoc = 0;

  for (const file of files) {
    let content: string;
    try {
      content = fs.readFileSync(path.join(targetPath, file), 'utf-8');
    } catch {
      continue;
    }

    const ext = path.extname(file);
    const loc = content.split('\n').filter((l) => l.trim().length > 0).length;
    totalLoc += loc;

    fileSummaries.push({
      file,
      exports: extractExports(content, ext),
      imports: parseImports(content, ext),
      keySignatures: extractKeySignatures(content, ext),
      loc,
    });
  }

  return { files: fileSummaries, dependencyEdges, totalLoc };
}

export function formatSummaryContext(summary: ProjectSummary): string {
  const lines: string[] = [
    `项目概览: ${summary.files.length} 个文件, ${summary.totalLoc} 行有效代码`,
    '',
  ];

  for (const f of summary.files) {
    lines.push(`### ${f.file} (${f.loc} LOC)`);
    if (f.exports.length > 0) lines.push(`  导出: ${f.exports.join(', ')}`);
    if (f.imports.length > 0) lines.push(`  依赖: ${f.imports.join(', ')}`);
    if (f.keySignatures.length > 0) {
      for (const sig of f.keySignatures) lines.push(`  - ${sig}`);
    }
  }

  if (summary.dependencyEdges.length > 0) {
    lines.push('', '依赖关系:');
    for (const [from, to] of summary.dependencyEdges) {
      lines.push(`  ${from} → ${to}`);
    }
  }

  return lines.join('\n');
}
