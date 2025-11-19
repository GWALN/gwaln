/**
 * @file src/workflows/notes-workflow.ts
 * @description Shared helper functions for building and publishing Community Notes.
 *              Both the CLI and MCP server reuse these functions to keep behavior aligned.
 */

import fs from 'node:fs';
import path from 'node:path';
import { publishJsonLdViaSdk } from '../lib/dkg';
import { buildCommunityNote, BuildNoteOptions } from '../lib/notes';
import { coerceStructuredAnalysisReport, StructuredAnalysisReport } from '../lib/structured-report';
import { type PublishConfigOverrides, resolvePublishConfig } from '../shared/config';
import { loadNoteEntry, NoteIndexEntry, upsertNoteIndexEntry } from '../shared/notes';
import { paths } from '../shared/paths';
import { loadTopics, Topic } from '../shared/topics';

const ensureTopic = (topicId: string): Topic => {
  const topics = loadTopics();
  const topic = topics[topicId];
  if (!topic) {
    throw new Error(`Unknown topic '${topicId}'.`);
  }
  return topic;
};

const readAnalysis = (topic: Topic): StructuredAnalysisReport => {
  const filePath = path.join(paths.ANALYSIS_DIR, `${topic.id}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Missing analysis file ${filePath}. Run 'gwaln analyse --topic ${topic.id}' first.`,
    );
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as StructuredAnalysisReport | Record<string, unknown>;
  return coerceStructuredAnalysisReport(topic, parsed as StructuredAnalysisReport);
};

const writeNoteFile = (topic: Topic, payload: Record<string, unknown>): string => {
  fs.mkdirSync(paths.NOTES_DIR, { recursive: true });
  const target = path.join(paths.NOTES_DIR, `${topic.id}.json`);
  fs.writeFileSync(target, JSON.stringify(payload, null, 2), 'utf8');
  return target;
};

export interface BuildNoteInput extends Partial<BuildNoteOptions> {
  topicId: string;
  stakeToken?: string;
  stakeAmount?: number;
}

export interface BuildNoteResult {
  topicId: string;
  note: Record<string, unknown>;
  filePath: string;
  entry: NoteIndexEntry;
}

export const buildNoteDraft = async (input: BuildNoteInput): Promise<BuildNoteResult> => {
  const topic = ensureTopic(input.topicId);
  const analysis = readAnalysis(topic);
  const note = await buildCommunityNote(topic, analysis, {
    summary: input.summary,
    accuracy: input.accuracy,
    completeness: input.completeness,
    toneBias: input.toneBias,
    stakeToken: input.stakeToken,
    stakeAmount: input.stakeAmount,
    reviewerName: input.reviewerName,
    reviewerId: input.reviewerId,
  } as BuildNoteOptions);

  const filePath = writeNoteFile(topic, note);
  const entry = upsertNoteIndexEntry(topic.id, (existing) => ({
    topic_id: topic.id,
    topic_title: topic.title,
    file: path.basename(filePath),
    status: existing?.status === 'published' ? 'published' : 'draft',
    analysis_file: `../analysis/${topic.id}.json`,
    generated_at: new Date().toISOString(),
    published_at: existing?.published_at ?? null,
    ual: existing?.ual ?? null,
    stake: {
      token: input.stakeToken || existing?.stake?.token || 'TRAC',
      amount: input.stakeAmount ?? existing?.stake?.amount ?? 0,
    },
  }));

  return {
    topicId: topic.id,
    note,
    filePath,
    entry,
  };
};

export interface PublishNoteInput extends PublishConfigOverrides {
  topicId: string;
  ual?: string | null;
  dryRun?: boolean;
}

export interface PublishNoteResult {
  topicId: string;
  entry: NoteIndexEntry;
  ual: string | null;
  rawResponse?: unknown;
  logPath?: string;
  noteFile: string;
  note: Record<string, unknown>;
  dryRun: boolean;
}

export const publishNoteDraft = async ({
  topicId,
  ual: providedUal,
  dryRun,
  ...overrides
}: PublishNoteInput): Promise<PublishNoteResult> => {
  const { entry, note } = loadNoteEntry(topicId);
  if (!entry) {
    throw new Error(
      `No note entry found for '${topicId}'. Run 'gwaln notes build --topic ${topicId}' first.`,
    );
  }
  if (!note) {
    throw new Error(
      `Note file '${entry.file}' is missing for topic '${topicId}'. Re-run 'gwaln notes build'.`,
    );
  }

  let ual: string | null = providedUal ?? null;
  let rawResponse: unknown;
  let logPath: string | undefined;
  const publishConfig = resolvePublishConfig({
    ...overrides,
    dryRun,
  });
  const effectiveDryRun = dryRun ?? publishConfig.dryRun;

  if (!ual) {
    if (effectiveDryRun) {
      rawResponse = { dryRun: true, payload: note };
    } else {
      const result = await publishJsonLdViaSdk(note as Record<string, unknown>, {
        endpoint: publishConfig.endpoint,
        port: publishConfig.port,
        environment: publishConfig.environment,
        blockchain: {
          name: publishConfig.blockchain,
          publicKey: publishConfig.publicKey,
          privateKey: publishConfig.privateKey,
          rpc: publishConfig.rpcUrl,
        },
        epochsNum: publishConfig.epochsNum,
        maxNumberOfRetries: publishConfig.maxRetries,
        frequencySeconds: publishConfig.frequencySeconds,
        privacy: 'public',
      });
      ual = result.ual ?? null;
      rawResponse = result.raw;
      if (!effectiveDryRun && rawResponse) {
        logPath = path.join(paths.NOTES_DIR, `${topicId}.publish.log.json`);
        fs.writeFileSync(logPath, JSON.stringify(rawResponse, null, 2), 'utf8');
      }
    }
  }

  const nextEntry = upsertNoteIndexEntry(topicId, () => ({
    ...entry,
    status: 'published',
    ual,
    published_at: new Date().toISOString(),
  }));

  return {
    topicId,
    entry: nextEntry,
    ual,
    rawResponse,
    logPath: effectiveDryRun ? undefined : logPath,
    noteFile: entry.file,
    note,
    dryRun: effectiveDryRun,
  };
};
