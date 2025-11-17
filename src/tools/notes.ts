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
  title: 'Manage Community Notes',
  description:
    'Builds, publishes, or inspects Community Notes derived from analysis (maps to `gwaln notes`).',
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
