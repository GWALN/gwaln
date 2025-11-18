/**
 * @file src/shared/paths.ts
 * @description Helper for resolving canonical directories used by the GWALN CLI.
 * @author Doğu Abaris <abaris@null.net>
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = path.join(os.homedir(), '.gwaln');
const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT, 'data');
const WIKI_DIR = path.join(DATA_DIR, 'wiki');
const GROK_DIR = path.join(DATA_DIR, 'grok');
const ANALYSIS_DIR = path.join(ROOT, 'analysis');
const NOTES_DIR = path.join(ROOT, 'notes');

const ensureDir = (target: string): void => {
  fs.mkdirSync(target, { recursive: true });
};

const ensureTopics = (): void => {
  const userTopics = path.join(ROOT, 'topics.json');
  const bundledTopics = path.join(PACKAGE_ROOT, 'topics.json');

  ensureDir(ROOT);

  if (!fs.existsSync(userTopics) && fs.existsSync(bundledTopics)) {
    fs.copyFileSync(bundledTopics, userTopics);
  }
};

export const paths = {
  ROOT,
  PACKAGE_ROOT,
  TOPICS: path.join(ROOT, 'topics.json'),
  TOPICS_BUNDLED: path.join(PACKAGE_ROOT, 'topics.json'),
  DATA_DIR,
  WIKI_DIR,
  GROK_DIR,
  ANALYSIS_DIR,
  NOTES_DIR,
  NOTES_INDEX: path.join(NOTES_DIR, 'index.json'),
  ensureDir,
  ensureTopics,
};
