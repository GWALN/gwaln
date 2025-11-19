/**
 * @file src/tools/show.ts
 * @description MCP tool for showing GWALN analysis.
 */

import { z } from 'zod';
import { loadShowContext, renderAndWriteHtmlReport } from '../workflows/show-workflow';
import { textContent } from './utils';

export const ShowInputSchema = z.object({
  topicId: z.string(),
  renderHtml: z.boolean().optional(),
});

export const showTool = {
  title: 'Display GWALN Analysis Results and Generate HTML Reports',
  description:
    'Loads and displays comprehensive GWALN analysis results for a specified topic, including structured analysis data, summary information, and associated Community Note drafts. Optionally generates and saves a detailed HTML report with visualizations, metrics, and comparison data. Returns structured content including topic information, analysis summary, note entry status and content, notes index metadata, and the HTML file path if rendered. Use this to review analysis results or generate shareable HTML reports for presentation.',
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
