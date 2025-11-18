/**
 * @file src/shared/paths.ts
 * @description Helper for resolving canonical directories used by the GWALN CLI.
 * @author Doğu Abaris <abaris@null.net>
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Finds the workspace root by looking for package.json with workspaces or topics.json
 * Falls back to process.cwd() if not found
 */
const findWorkspaceRoot = (): string => {
  let current = process.cwd();
  const root = path.parse(current).root;
  
  while (current !== root) {
    const packageJsonPath = path.join(current, 'package.json');
    const topicsJsonPath = path.join(current, 'topics.json');
    
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        if (pkg.workspaces || fs.existsSync(topicsJsonPath)) {
          return current;
        }
      } catch {
        // Continue searching
      }
    }
    
    if (fs.existsSync(topicsJsonPath)) {
      return current;
    }
    
    current = path.dirname(current);
  }
  
  return process.cwd();
};

const ROOT = findWorkspaceRoot();
const DATA_DIR = path.join(ROOT, 'data');
const WIKI_DIR = path.join(DATA_DIR, 'wiki');
const GROK_DIR = path.join(DATA_DIR, 'grok');
const ANALYSIS_DIR = path.join(ROOT, 'analysis');
const NOTES_DIR = path.join(ROOT, 'notes');

const ensureDir = (target: string): void => {
  fs.mkdirSync(target, { recursive: true });
};

export const paths = {
  ROOT,
  TOPICS: path.join(ROOT, 'topics.json'),
  DATA_DIR,
  WIKI_DIR,
  GROK_DIR,
  ANALYSIS_DIR,
  NOTES_DIR,
  NOTES_INDEX: path.join(NOTES_DIR, 'index.json'),
  ensureDir,
};
