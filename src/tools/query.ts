/**
 * @file src/tools/query.ts
 * @description MCP tool for querying the DKG to retrieve published Knowledge Assets.
 */

import { z } from 'zod';
import { runQueryWorkflow } from '../workflows/query-workflow';
import { textContent } from './utils';

export const QueryInputSchema = z
  .object({
    topic: z.string().optional(),
    ual: z.string().optional(),
    endpoint: z.string().optional(),
    environment: z.string().optional(),
    port: z.number().optional(),
    blockchain: z.string().optional(),
    privateKey: z.string().optional(),
    publicKey: z.string().optional(),
    rpc: z.string().optional(),
    contentType: z.enum(['public', 'private', 'all']).optional(),
    includeMetadata: z.boolean().optional(),
    outputFormat: z.enum(['n-quads', 'json-ld']).optional(),
    maxRetries: z.number().optional(),
    pollFrequency: z.number().optional(),
    save: z.string().optional(),
  })
  .refine((value) => Boolean(value.topic || value.ual), {
    message: 'Either topic or ual must be specified.',
    path: ['topic'],
  })
  .refine((value) => !(value.topic && value.ual), {
    message: 'Cannot specify both topic and ual. Choose one.',
    path: ['topic'],
  });

export const queryTool = {
  title: 'Retrieve Knowledge Assets from Decentralized Knowledge Graph (DKG)',
  description:
    'Queries the DKG to retrieve published Knowledge Assets either by topic name or by UAL (Universal Asset Locator). Returns the complete asset data including assertions, metadata, and content in the requested format (JSON-LD or N-Quads). Optionally saves the retrieved asset to a local file. Supports filtering by content type (public, private, or all) and can include or exclude metadata. Returns structured data with the asset content, UAL, topic title, and file path if saved. Use this to access previously published knowledge assets from the decentralized network.',
  inputSchema: QueryInputSchema,
};

export const queryHandler = async (input: z.infer<typeof QueryInputSchema>) => {
  try {
    const result = await runQueryWorkflow(input);

    const message = result.savedPath
      ? `[query] Successfully retrieved${result.topicTitle ? ` ${result.topicTitle}` : ' asset'} from DKG. Saved to ${result.savedPath}`
      : `[query] Successfully retrieved${result.topicTitle ? ` ${result.topicTitle}` : ' asset'} from DKG`;

    return {
      content: textContent(message),
      structuredContent: {
        ual: result.ual,
        topicTitle: result.topicTitle ?? null,
        assertion: result.assertion,
        metadata: result.metadata ?? null,
        savedPath: result.savedPath ?? null,
      },
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'Unknown error occurred while querying DKG';

    throw new Error(`[query] Failed to retrieve asset from DKG: ${errorMessage}`);
  }
};
