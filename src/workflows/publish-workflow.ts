/**
 * @file src/workflows/publish-workflow.ts
 * @description Shared helpers for publishing arbitrary JSON-LD payloads to the DKG.
 */

import fs from 'node:fs';
import path from 'node:path';
import { publishJsonLdViaSdk } from '../lib/dkg';
import { type PublishConfigOverrides, resolvePublishConfig } from '../shared/config';

export const loadJsonFile = (filePath: string): unknown => {
  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`File not found at '${absolute}'.`);
  }
  const raw = fs.readFileSync(absolute, 'utf8');
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    throw new Error(`Invalid JSON in '${absolute}': ${(error as Error).message}`);
  }
};

const toJsonLdObject = (payload: unknown): Record<string, unknown> => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('JSON-LD payload must be an object.');
  }
  const record = payload as Record<string, unknown>;
  const assetCandidate = record.asset;
  if (assetCandidate && typeof assetCandidate === 'object') {
    return assetCandidate as Record<string, unknown>;
  }
  const jsonldCandidate = record.jsonld;
  if (jsonldCandidate && typeof jsonldCandidate === 'object') {
    return jsonldCandidate as Record<string, unknown>;
  }
  return record;
};

export const loadJsonLdFromFile = (filePath: string): Record<string, unknown> =>
  toJsonLdObject(loadJsonFile(filePath));

export interface PublishJsonLdInput extends PublishConfigOverrides {
  payload: Record<string, unknown>;
  privacy?: 'public' | 'private';
  dryRun?: boolean;
}

export interface PublishJsonLdResult {
  ual: string | null;
  datasetRoot?: string;
  raw?: unknown;
  dryRun: boolean;
  payload: Record<string, unknown>;
}

export const publishJsonLdAsset = async ({
  payload,
  privacy = 'private',
  dryRun,
  ...overrides
}: PublishJsonLdInput): Promise<PublishJsonLdResult> => {
  const normalizedPrivacy = privacy.toLowerCase();
  if (normalizedPrivacy !== 'public' && normalizedPrivacy !== 'private') {
    throw new Error("Privacy must be either 'public' or 'private'.");
  }
  const config = resolvePublishConfig({
    ...overrides,
    dryRun,
  });
  const effectiveDryRun = dryRun ?? config.dryRun;

  if (effectiveDryRun) {
    return {
      ual: null,
      dryRun: true,
      raw: { dryRun: true, payload },
      payload,
    };
  }

  const result = await publishJsonLdViaSdk(payload, {
    endpoint: config.endpoint,
    port: config.port,
    environment: config.environment,
    blockchain: {
      name: config.blockchain,
      publicKey: config.publicKey,
      privateKey: config.privateKey,
      rpc: config.rpcUrl,
    },
    epochsNum: config.epochsNum,
    maxNumberOfRetries: config.maxRetries,
    frequencySeconds: config.frequencySeconds,
    privacy: normalizedPrivacy as 'public' | 'private',
  });

  const datasetRoot =
    typeof (result.raw as { datasetRoot?: unknown }).datasetRoot === 'string'
      ? ((result.raw as { datasetRoot?: string }).datasetRoot as string)
      : undefined;

  return {
    ual: result.ual ?? null,
    datasetRoot,
    raw: result.raw,
    dryRun: false,
    payload,
  };
};
