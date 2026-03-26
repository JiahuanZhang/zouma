import type { Request, Response } from 'express';
import { ResponseHelper } from '@zouma/common';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

interface DirEntry {
  name: string;
  path: string;
}

export class SystemController {
  static browseDirectories(req: Request, res: Response): void {
    const rawPath = (req.query.path as string) || '';
    let targetPath = rawPath.trim();

    if (!targetPath) {
      const drives = SystemController.getWindowsDrives();
      if (drives.length > 0) {
        res.json(ResponseHelper.success({ current: '', entries: drives }));
        return;
      }
      targetPath = os.homedir();
    }

    targetPath = path.resolve(targetPath);

    if (!fs.existsSync(targetPath)) {
      res.status(400).json(ResponseHelper.error('路径不存在', 400));
      return;
    }

    try {
      const stat = fs.statSync(targetPath);
      if (!stat.isDirectory()) {
        res.status(400).json(ResponseHelper.error('路径不是目录', 400));
        return;
      }
      const items = fs.readdirSync(targetPath, { withFileTypes: true });
      const entries: DirEntry[] = items
        .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((d) => ({
          name: d.name,
          path: path.join(targetPath, d.name),
        }));

      res.json(ResponseHelper.success({ current: targetPath, entries }));
    } catch {
      res.status(400).json(ResponseHelper.error('无法读取目录', 400));
    }
  }

  private static getWindowsDrives(): DirEntry[] {
    if (os.platform() !== 'win32') return [];
    const drives: DirEntry[] = [];
    for (let i = 65; i <= 90; i++) {
      const letter = String.fromCharCode(i);
      const drivePath = `${letter}:\\`;
      try {
        fs.accessSync(drivePath);
        drives.push({ name: `${letter}:`, path: drivePath });
      } catch {
        // drive not available
      }
    }
    return drives;
  }
}
