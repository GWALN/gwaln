/**
 * @file src/workflows/query-workflow.ts
 * @description Shared query workflow logic for retrieving Knowledge Assets from the DKG.
 * @author Doğu Abaris <abaris@null.net>
 */

import fs from 'node:fs';
import path from 'node:path';
import { getDkgAsset, searchDkgAssetsByTopic } from '../lib/dkg';
import { type PublishConfigOverrides, resolvePublishConfig } from '../shared/config';
import { loadNoteEntry } from '../shared/notes';
import { paths } from '../shared/paths';
import { loadTopics } from '../shared/topics';

export interface QueryWorkflowOptions
  extends Omit<PublishConfigOverrides, 'rpcUrl' | 'frequencySeconds'> {
  topic?: string;
  ual?: string;
  rpc?: string;
  pollFrequency?: number;
  contentType?: 'public' | 'private' | 'all';
  includeMetadata?: boolean;
  outputFormat?: 'n-quads' | 'json-ld';
  save?: string;
}

export interface QueryWorkflowResult {
  ual: string;
  topicTitle?: string;
  assertion: unknown;
  metadata?: unknown;
  savedPath?: string;
}

/**
 * Resolves a topic title to a UAL, checking local cache first, then searching DKG.
 */
const resolveTopicToUal = async (
  topicTitle: string,
  config: ReturnType<typeof resolvePublishConfig>,
): Promise<string> => {
  const topics = loadTopics();
  const topicEntry = Object.values(topics).find(
    (t) => t.title.toLowerCase() === topicTitle.toLowerCase(),
  );

  if (!topicEntry) {
    const availableTitles = Object.values(topics)
      .map((t) => t.title)
      .join(', ');
    throw new Error(`Topic '${topicTitle}' not found. Available topics: ${availableTitles}`);
  }

  const topicId = topicEntry.id;
  const { entry } = loadNoteEntry(topicId);

  if (entry && entry.status === 'published' && entry.ual) {
    return entry.ual;
  }

  const foundUal = await searchDkgAssetsByTopic(topicId, {
    endpoint: config.endpoint,
    port: config.port,
    environment: config.environment,
    blockchain: {
      name: config.blockchain,
      privateKey: config.privateKey,
      publicKey: config.publicKey,
      rpc: config.rpcUrl,
    },
    maxNumberOfRetries: config.maxRetries,
    frequencySeconds: config.frequencySeconds,
  });

  if (!foundUal) {
    throw new Error(
      `No published Community Note found for topic '${topicEntry.title}' on DKG. Publish a Community Note first with 'gwaln notes publish --topic ${topicId}'.`,
    );
  }

  return foundUal;
};

/**
 * Saves the query result to a file in data/dkg/.
 */
const saveQueryResult = (
  ual: string,
  assertion: unknown,
  metadata: unknown | undefined,
  topicTitle: string | undefined,
  filename: string,
): string => {
  const dkgDir = path.join(paths.DATA_DIR, 'dkg');
  fs.mkdirSync(dkgDir, { recursive: true });
  const finalFilename = filename.endsWith('.json') ? filename : `${filename}.json`;
  const savePath = path.join(dkgDir, finalFilename);

  const saveData: Record<string, unknown> = {
    ual,
    retrieved_at: new Date().toISOString(),
    assertion,
  };

  if (topicTitle) {
    saveData.topic = topicTitle;
  }

  if (metadata) {
    saveData.metadata = metadata;
  }

  fs.writeFileSync(savePath, JSON.stringify(saveData, null, 2), 'utf8');
  return savePath;
};

/**
 * Runs the query workflow to retrieve a Knowledge Asset from the DKG.
 */
export const runQueryWorkflow = async (
  options: QueryWorkflowOptions,
): Promise<QueryWorkflowResult> => {
  if (!options.topic && !options.ual) {
    throw new Error('Either topic or ual must be specified.');
  }

  if (options.topic && options.ual) {
    throw new Error('Cannot specify both topic and ual. Choose one.');
  }

  const config = resolvePublishConfig({
    endpoint: options.endpoint,
    environment: options.environment,
    port: options.port,
    blockchain: options.blockchain,
    privateKey: options.privateKey,
    publicKey: options.publicKey,
    rpcUrl: options.rpc,
    maxRetries: options.maxRetries,
    frequencySeconds: options.pollFrequency,
  });

  let ual: string;
  let topicTitle: string | undefined;

  if (options.topic) {
    topicTitle = options.topic;
    ual = await resolveTopicToUal(topicTitle, config);
  } else {
    ual = options.ual!;
  }

  const result = await getDkgAsset(ual, {
    endpoint: config.endpoint,
    port: config.port,
    environment: config.environment,
    blockchain: {
      name: config.blockchain,
      privateKey: config.privateKey,
      publicKey: config.publicKey,
      rpc: config.rpcUrl,
    },
    contentType: options.contentType ?? 'all',
    includeMetadata: options.includeMetadata ?? false,
    outputFormat: options.outputFormat ?? 'json-ld',
    maxNumberOfRetries: config.maxRetries,
    frequencySeconds: config.frequencySeconds,
  });

  let savedPath: string | undefined;
  if (options.save) {
    savedPath = saveQueryResult(ual, result.assertion, result.metadata, topicTitle, options.save);
  }

  return {
    ual,
    topicTitle,
    assertion: result.assertion,
    metadata: result.metadata,
    savedPath,
  };
};
