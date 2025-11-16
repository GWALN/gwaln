/**
 * @file src/tools/show.ts
 * @description MCP tool for showing CivicLens analysis.
 */

import { z } from 'zod';
import { loadShowContext, renderAndWriteHtmlReport } from '../workflows/show-workflow';
import { textContent } from './utils';

export const ShowInputSchema = z.object({
  topicId: z.string(),
  renderHtml: z.boolean().optional(),
});

export const showTool = {
  title: 'Show CivicLens analysis',
  description: 'Loads structured analysis, note drafts, and optionally renders the HTML report.',
  inputSchema: ShowInputSchema,
};

export const showHandler = async (input: z.infer<typeof ShowInputSchema>) => {
  const context = loadShowContext(input.topicId);
  let htmlPath: string | null = null;
  if (input.renderHtml) {
    const { filePath } = renderAndWriteHtmlReport(input.topicId, context);
    htmlPath = filePath;
  }
  return {
    content: textContent(
      `[show] Loaded analysis + notes for ${input.topicId}${htmlPath ? ` (html: ${htmlPath})` : ''}.`,
    ),
    structuredContent: {
      topic: context.topic,
      summary: context.analysis.summary,
      noteEntry: context.noteEntry.entry,
      noteDraft: context.noteEntry.note,
      notesIndexUpdatedAt: context.notesIndex?.updated_at ?? null,
      htmlPath,
    },
  };
};
