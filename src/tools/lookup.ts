/**
 * @file src/tools/lookup.ts
 * @description MCP tool for looking up topics in the catalog and searching APIs.
 */

import { z } from 'zod';
import { addTopicToCatalog, runLookupWorkflow } from '../workflows/lookup-workflow';
import { textContent } from './utils';

export const LookupInputSchema = z
  .object({
    query: z.string(),
    searchApis: z.boolean().optional(),
    limit: z.number().min(1).max(20).optional(),
    action: z.enum(['search', 'add']).optional(),
    title: z.string().optional(),
    wikipediaSlug: z.string().optional(),
    grokipediaSlug: z.string().optional(),
  })
  .refine(
    (value) => {
      if (value.action === 'add') {
        return Boolean(value.title && value.wikipediaSlug && value.grokipediaSlug);
      }
      return true;
    },
    {
      message: 'When action is "add", title, wikipediaSlug, and grokipediaSlug are required.',
      path: ['action'],
    },
  );

export const lookupTool = {
  title: 'Search and Manage Topics in Catalog and External APIs',
  description:
    'Searches for topics in the local GWALN catalog and optionally queries Grokipedia and Wikipedia APIs for matching content. Returns topic information including IDs, titles, and slugs if found locally, or search results from external APIs if not found. Can also add new topics to the catalog with required metadata (title, Wikipedia slug, Grokipedia slug). Use this to discover available topics or register new ones for analysis. Returns structured results with topic details, search matches, or confirmation of topic addition.',
  inputSchema: LookupInputSchema,
};

const normalizeGrokSlug = (slug: string): string => {
  if (!slug.startsWith('page/')) {
    return `page/${slug}`;
  }
  return slug;
};

export const lookupHandler = async (input: z.infer<typeof LookupInputSchema>) => {
  const { query, searchApis = false, limit = 5, action = 'search' } = input;

  if (action === 'add') {
    if (!input.title || !input.wikipediaSlug || !input.grokipediaSlug) {
      throw new Error(
        'Missing required fields for adding topic: title, wikipediaSlug, grokipediaSlug',
      );
    }

    const grokSlug = normalizeGrokSlug(input.grokipediaSlug);
    const newTopic = addTopicToCatalog({
      title: input.title,
      wikipediaSlug: input.wikipediaSlug,
      grokipediaSlug: grokSlug,
    });

    return {
      content: textContent(
        `[lookup] Added topic "${newTopic.title}" to catalog (ID: ${newTopic.id})`,
      ),
      structuredContent: {
        action: 'add',
        topic: newTopic,
      },
    };
  }

  // Search action
  const result = await runLookupWorkflow({
    query,
    searchApis: searchApis ?? false,
    limit,
  });

  if (result.found && result.topic) {
    return {
      content: textContent(
        `[lookup] Found topic "${result.topic.title}" in local catalog (ID: ${result.topic.id})`,
      ),
      structuredContent: {
        action: 'search',
        found: true,
        topic: result.topic,
        searchResults: null,
      },
    };
  }

  if (result.searchResults) {
    const { grokipedia, wikipedia } = result.searchResults;
    const hasResults = grokipedia.length > 0 || wikipedia.length > 0;

    return {
      content: textContent(
        hasResults
          ? `[lookup] Found ${grokipedia.length} Grokipedia and ${wikipedia.length} Wikipedia results for "${query}"`
          : `[lookup] No results found for "${query}"`,
      ),
      structuredContent: {
        action: 'search',
        found: false,
        topic: null,
        searchResults: {
          grokipedia,
          wikipedia,
        },
      },
    };
  }

  return {
    content: textContent(`[lookup] Topic "${query}" not found in local catalog`),
    structuredContent: {
      action: 'search',
      found: false,
      topic: null,
      searchResults: null,
    },
  };
};
