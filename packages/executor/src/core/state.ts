import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import type { ReviewState } from "./reviewTypes.js";

const STATE_FILE = ".code-review-state.json";

function statePath(targetPath: string): string {
  return path.join(targetPath, STATE_FILE);
}

export function loadState(targetPath: string): ReviewState | null {
  const fp = statePath(targetPath);
  if (!fs.existsSync(fp)) return null;
  return JSON.parse(fs.readFileSync(fp, "utf-8")) as ReviewState;
}

export function saveState(targetPath: string, commit: string, fileCount: number): void {
  const state: ReviewState = {
    lastReviewedCommit: commit,
    lastReviewDate: new Date().toISOString(),
    reviewedFiles: fileCount,
  };
  fs.writeFileSync(statePath(targetPath), JSON.stringify(state, null, 2), "utf-8");
}

export function getCurrentCommit(targetPath: string): string {
  return execSync("git rev-parse HEAD", { cwd: targetPath, encoding: "utf-8" }).trim();
}

export function isGitRepo(targetPath: string): boolean {
  try {
    execSync("git rev-parse --is-inside-work-tree", {
      cwd: targetPath,
      encoding: "utf-8",
      stdio: "pipe",
    });
    return true;
  } catch {
    return false;
  }
}
