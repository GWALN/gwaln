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
  title: 'Fetch Structured Content Snapshots from Grokipedia and Wikipedia',
  description:
    'Downloads and stores structured content snapshots from Grokipedia (X.AI) and/or Wikipedia for one or more topics. Returns parsed, structured data ready for analysis. Content is cached locally to avoid redundant downloads. Use this tool to gather source material before running analysis. Returns structured payloads containing the fetched content organized by source (wiki/grok) and topic.',
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
