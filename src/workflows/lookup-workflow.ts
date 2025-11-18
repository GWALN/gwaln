/**
 * @file src/workflows/lookup-workflow.ts
 * @description Lookup workflow for finding topics in the local catalog and searching both
 *              Grokipedia and Wikipedia APIs when topics are not found locally.
 * @author Doğu Abaris <abaris@null.net>
 */

import fetch from 'node-fetch';
import { loadTopics, Topic, writeTopics } from '../shared/topics';

export interface GrokipediaSearchResult {
  title: string;
  url?: string;
  slug?: string;
}

export interface WikipediaSearchResult {
  key: string;
  title: string;
  description?: string;
}

export interface LookupWorkflowOptions {
  query: string;
  searchApis?: boolean;
  limit?: number;
}

export interface LookupWorkflowResult {
  found: boolean;
  topic?: Topic;
  searchResults?: {
    grokipedia: GrokipediaSearchResult[];
    wikipedia: WikipediaSearchResult[];
  };
}

export interface AddTopicOptions {
  title: string;
  wikipediaSlug: string;
  grokipediaSlug: string;
}

export const searchGrokipedia = async (
  query: string,
  limit = 5,
): Promise<GrokipediaSearchResult[]> => {
  const url = `https://grokipedia.com/api/typeahead?query=${encodeURIComponent(query)}&limit=${limit}`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const message = `Grokipedia API returned ${response.status}`;
      console.warn(`[lookup] Grokipedia search failed: ${message}`);
      return [];
    }

    const data = (await response.json()) as
      | GrokipediaSearchResult[]
      | { results: GrokipediaSearchResult[] };
    if (data && typeof data === 'object' && 'results' in data && Array.isArray(data.results)) {
      return data.results;
    }
    return Array.isArray(data) ? data : [];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[lookup] Grokipedia search failed: ${message}`);
    return [];
  }
};

export const searchWikipedia = async (
  query: string,
  limit = 5,
): Promise<WikipediaSearchResult[]> => {
  const url = `https://en.wikipedia.org/w/rest.php/v1/search/title?q=${encodeURIComponent(query)}&limit=${limit}`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const message = `Wikipedia API returned ${response.status}`;
      console.warn(`[lookup] Wikipedia search failed: ${message}`);
      return [];
    }

    const data = (await response.json()) as { pages?: WikipediaSearchResult[] };
    return Array.isArray(data.pages) ? data.pages : [];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[lookup] Wikipedia search failed: ${message}`);
    return [];
  }
};

export const findInLocalCatalog = (query: string, topics: Record<string, Topic>): Topic | null => {
  const matchedTopic = Object.values(topics).find((topic) => topic.title === query);

  if (matchedTopic) {
    return matchedTopic;
  }

  const partialMatch = Object.values(topics).find((topic) =>
    topic.title.toLowerCase().includes(query.toLowerCase()),
  );

  return partialMatch || null;
};

const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const addTopicToCatalog = (options: AddTopicOptions): Topic => {
  const topics = loadTopics();
  const id = slugify(options.wikipediaSlug);

  const newTopic: Topic = {
    id,
    title: options.title,
    ual: `did:ot:dkg:topic:${id}`,
    wikipedia_slug: options.wikipediaSlug,
    grokipedia_slug: options.grokipediaSlug,
  };

  const allTopics = [...Object.values(topics), newTopic];
  writeTopics(allTopics);

  return newTopic;
};

export const runLookupWorkflow = async (
  options: LookupWorkflowOptions,
): Promise<LookupWorkflowResult> => {
  const topics = loadTopics();
  const localMatch = findInLocalCatalog(options.query, topics);

  if (localMatch) {
    return {
      found: true,
      topic: localMatch,
    };
  }

  if (!options.searchApis) {
    return {
      found: false,
    };
  }

  const limit = options.limit ?? 5;
  const [grokResults, wikiResults] = await Promise.all([
    searchGrokipedia(options.query, limit),
    searchWikipedia(options.query, limit),
  ]);

  return {
    found: false,
    searchResults: {
      grokipedia: grokResults,
      wikipedia: wikiResults,
    },
  };
};
