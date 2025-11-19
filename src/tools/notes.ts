/**
 * @file src/tools/notes.ts
 * @description MCP tool for managing Community Notes.
 */

import { z } from 'zod';
import { loadNoteEntry } from '../shared/notes';
import { buildNoteDraft, publishNoteDraft } from '../workflows/notes-workflow';
import { textContent } from './utils';

export const NotesInputSchema = z.object({
  action: z.enum(['build', 'publish', 'status']),
  topicId: z.string(),
  summary: z.string().optional(),
  accuracy: z.number().min(0).max(5).optional(),
  completeness: z.number().min(0).max(5).optional(),
  toneBias: z.number().min(0).max(5).optional(),
  stakeToken: z.string().optional(),
  stakeAmount: z.number().optional(),
  reviewerName: z.string().optional(),
  reviewerId: z.string().optional(),
  ual: z.string().optional(),
  endpoint: z.string().optional(),
  environment: z.string().optional(),
  port: z.number().optional(),
  blockchain: z.string().optional(),
  privateKey: z.string().optional(),
  publicKey: z.string().optional(),
  rpcUrl: z.string().optional(),
  epochsNum: z.number().optional(),
  maxRetries: z.number().optional(),
  frequencySeconds: z.number().optional(),
  dryRun: z.boolean().optional(),
});

export const notesTool = {
  title: 'Build, Publish, and Manage Community Notes from Analysis',
  description:
    'Creates, publishes, and manages Community Notes (X Community Notes format) derived from GWALN analysis results. Supports three actions: (1) "build" - generates a note draft from analysis with ratings (accuracy, completeness, tone bias) and summary, returns file path and draft content; (2) "publish" - publishes the note to the DKG (Decentralized Knowledge Graph) and returns a UAL (Universal Asset Locator) for the published asset; (3) "status" - retrieves the current status and content of an existing note draft. Returns structured data including draft content, UALs, file paths, and publication status.',
  inputSchema: NotesInputSchema,
};

export const notesHandler = async (input: z.infer<typeof NotesInputSchema>) => {
  if (input.action === 'build') {
    const result = buildNoteDraft(input);
    return {
      content: textContent(`[notes] Built draft for ${result.topicId} at ${result.filePath}.`),
      structuredContent: {
        topicId: result.topicId,
        filePath: result.filePath,
        entry: result.entry,
      },
    };
  }

  if (input.action === 'publish') {
    const result = await publishNoteDraft(input);
    const prefix = result.dryRun ? '[notes] Dry-run' : '[notes] Publish';
    const suffix = result.ual
      ? `UAL: ${result.ual}`
      : result.dryRun
        ? 'payload echoed in structuredContent'
        : 'UAL missing from DKG response';
    return {
      content: textContent(`${prefix} complete for ${result.topicId}. ${suffix}.`),
      structuredContent: { ...result } as Record<string, unknown>,
    };
  }

  const payload = loadNoteEntry(input.topicId);
  return {
    content: textContent(
      payload.entry
        ? `[notes] Loaded status for ${input.topicId} (${payload.entry.status}).`
        : `[notes] No note draft found for ${input.topicId}.`,
    ),
    structuredContent: {
      topicId: input.topicId,
      entry: payload.entry,
      note: payload.note,
    },
  };
};
