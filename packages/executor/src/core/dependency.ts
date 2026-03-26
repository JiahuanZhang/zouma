import fs from 'node:fs';
import path from 'node:path';

const JS_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte']);

export function parseImports(content: string, ext: string): string[] {
  const imports: string[] = [];

  if (JS_EXTS.has(ext)) {
    const fromRegex = /from\s+['"]([^'"]+)['"]/g;
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = fromRegex.exec(content)) !== null) imports.push(m[1]);
    while ((m = requireRegex.exec(content)) !== null) imports.push(m[1]);
  } else if (ext === '.py') {
    const pyFromRegex = /from\s+([\w.]+)\s+import/g;
    const pyImportRegex = /^import\s+([\w.]+)/gm;
    let m: RegExpExecArray | null;
    while ((m = pyFromRegex.exec(content)) !== null) imports.push(m[1]);
    while ((m = pyImportRegex.exec(content)) !== null) imports.push(m[1]);
  }

  return imports;
}

function resolveImport(importPath: string, fromFile: string, fileSet: Set<string>): string | null {
  if (!importPath.startsWith('.')) return null;

  const fromDir = path.dirname(fromFile);
  const base = path.normalize(path.join(fromDir, importPath));

  if (fileSet.has(base)) return base;

  const stripped = base.replace(/\.(js|jsx|mjs|cjs)$/, '');
  if (stripped !== base) {
    for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
      if (fileSet.has(stripped + ext)) return stripped + ext;
    }
  }

  for (const ext of ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.py']) {
    if (fileSet.has(base + ext)) return base + ext;
  }

  for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
    const idx = path.join(base, `index${ext}`);
    if (fileSet.has(idx)) return idx;
  }

  return null;
}

class UnionFind {
  private parent: Map<string, string>;
  private rank: Map<string, number>;

  constructor(items: string[]) {
    this.parent = new Map();
    this.rank = new Map();
    for (const item of items) {
      this.parent.set(item, item);
      this.rank.set(item, 0);
    }
  }

  find(x: string): string {
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    let cur = x;
    while (cur !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    const rankA = this.rank.get(ra)!;
    const rankB = this.rank.get(rb)!;
    if (rankA < rankB) {
      this.parent.set(ra, rb);
    } else if (rankA > rankB) {
      this.parent.set(rb, ra);
    } else {
      this.parent.set(rb, ra);
      this.rank.set(ra, rankA + 1);
    }
  }
}

export interface DependencyResult {
  groups: string[][];
  edges: [string, string][];
}

export function analyzeDependencies(
  files: string[],
  targetPath: string,
  maxGroupSize: number
): DependencyResult {
  const fileSet = new Set(files);
  const uf = new UnionFind(files);
  const edges: [string, string][] = [];

  for (const file of files) {
    let content: string;
    try {
      content = fs.readFileSync(path.join(targetPath, file), 'utf-8');
    } catch {
      continue;
    }

    const ext = path.extname(file);
    for (const imp of parseImports(content, ext)) {
      const resolved = resolveImport(imp, file, fileSet);
      if (resolved) {
        uf.union(file, resolved);
        edges.push([file, resolved]);
      }
    }
  }

  const groupMap = new Map<string, string[]>();
  for (const file of files) {
    const root = uf.find(file);
    if (!groupMap.has(root)) groupMap.set(root, []);
    groupMap.get(root)!.push(file);
  }

  const groups: string[][] = [];
  for (const group of groupMap.values()) {
    if (group.length <= maxGroupSize) {
      groups.push(group);
    } else {
      for (let i = 0; i < group.length; i += maxGroupSize) {
        groups.push(group.slice(i, i + maxGroupSize));
      }
    }
  }

  return { groups, edges };
}
