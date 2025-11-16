/**
 * @file src/tools/fetch.ts
 * @description MCP tool for fetching structured snapshots.
 */

import { z } from 'zod';
import { type FetchSource, runFetchWorkflow } from '../workflows/fetch-workflow';
import { textContent } from './utils';

export const FetchInputSchema = z.object({
  source: z.enum(['wiki', 'grok', 'both']).optional(),
  topicId: z.string().optional(),
});

export const fetchTool = {
  title: 'Fetch structured snapshots',
  description: 'Downloads Grokipedia and/or Wikipedia content for a topic.',
  inputSchema: FetchInputSchema,
};

export const fetchHandler = async (input: z.infer<typeof FetchInputSchema>) => {
  const { source, topicId } = input;
  const selectedSource = source ?? 'both';
  const sources: FetchSource[] = selectedSource === 'both' ? ['wiki', 'grok'] : [selectedSource];
  const payload = [];
  for (const selected of sources) {
    const results = await runFetchWorkflow(selected, topicId);
    payload.push({ source: selected, results });
  }
  return {
    content: textContent(
      `[fetch] Completed fetch for ${sources.join('+')} (topic: ${topicId ?? 'all topics'}).`,
    ),
    structuredContent: { topicId: topicId ?? null, sources: payload },
  };
};
