/**
 * @file src/shared/analysis-cache.ts
 * @description Helpers for caching analyzer output on disk, similar in spirit
 *              to CopyPatrol's SQL-backed cache but stored per-topic as JSON.
 *              Keeping this logic in one place makes it easy to adjust TTLs
 *              or hashing strategy later on without touching CLI commands.
 * @author Doğu Abaris <abaris@null.net>
 */

import fs from 'node:fs';
import path from 'node:path';
import type { AnalysisPayload } from '../lib/analyzer';
import type { StructuredAnalysisReport } from '../lib/structured-report';
import { STRUCTURED_ANALYSIS_SCHEMA } from '../lib/structured-report';
import { CACHE_TTL_HOURS } from './analyzer-config';

export type CacheStatus = 'missing' | 'fresh' | 'stale' | 'mismatch' | 'invalid';

export interface CacheProbeResult {
  status: CacheStatus;
  analysis?: StructuredAnalysisReport | AnalysisPayload;
  reason?: string;
}

const ttlMs = CACHE_TTL_HOURS * 60 * 60 * 1000;

const resolvePath = (filePath: string): string => path.resolve(filePath);

/**
 * Loads a cached analysis file if present and determines whether it is still
 * fresh given the expected content hash and TTL.
 */
type CachedFile = StructuredAnalysisReport | AnalysisPayload;

const extractHashAndTimestamp = (payload: CachedFile): { hash?: string; timestamp?: string } => {
  if ((payload as StructuredAnalysisReport).schema === STRUCTURED_ANALYSIS_SCHEMA) {
    const structured = payload as StructuredAnalysisReport;
    return {
      hash: structured.meta?.content_hash,
      timestamp: structured.meta?.generated_at ?? structured.generated_at,
    };
  }
  const legacy = payload as AnalysisPayload;
  return {
    hash: legacy.meta?.content_hash,
    timestamp: legacy.meta?.generated_at ?? legacy.updated_at,
  };
};

export const probeCachedAnalysis = (filePath: string, expectedHash: string): CacheProbeResult => {
  const absolutePath = resolvePath(filePath);
  if (!fs.existsSync(absolutePath)) {
    return { status: 'missing' };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(absolutePath, 'utf8')) as CachedFile;
    const { hash: metaHash, timestamp } = extractHashAndTimestamp(parsed);
    if (!metaHash || !timestamp) {
      return { status: 'invalid', reason: 'missing metadata', analysis: parsed };
    }
    const delta = Date.now() - new Date(timestamp).getTime();
    if (metaHash !== expectedHash) {
      return { status: 'mismatch', reason: 'content hash changed', analysis: parsed };
    }
    if (delta <= ttlMs) {
      return { status: 'fresh', analysis: parsed };
    }
    return { status: 'stale', reason: 'cache expired', analysis: parsed };
  } catch (error) {
    return {
      status: 'invalid',
      reason: error instanceof Error ? error.message : 'Unable to parse cached analysis',
    };
  }
};
