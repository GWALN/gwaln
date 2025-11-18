/**
 * @file tests/lookup.test.ts
 * @description Tests for topic lookup workflow including local catalog search and API searches.
 * @author Doğu Abaris <abaris@null.net>
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Topic } from '@gwaln/core';

vi.mock('@gwaln/core', async () => {
  const actual = await vi.importActual('@gwaln/core');
  return {
    ...actual,
    loadTopics: vi.fn(),
    writeTopics: vi.fn(),
  };
});

vi.mock('node-fetch', () => ({
  default: vi.fn(),
}));

import fetch from 'node-fetch';
import {
  loadTopics,
  writeTopics,
  findInLocalCatalog,
  addTopicToCatalog,
  searchGrokipedia,
  searchWikipedia,
  runLookupWorkflow,
} from '@gwaln/core';

const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
const mockLoadTopics = loadTopics as unknown as ReturnType<typeof vi.fn>;
const mockWriteTopics = writeTopics as unknown as ReturnType<typeof vi.fn>;

describe('findInLocalCatalog', () => {
  const mockTopics: Record<string, Topic> = {
    moon: {
      id: 'moon',
      title: 'Moon',
      wikipedia_slug: 'Moon',
      grokipedia_slug: 'page/Moon',
    },
  };

  it('finds topic by exact title match', () => {
    expect(findInLocalCatalog('Moon', mockTopics)).toBeDefined();
  });

  it('finds topic by partial title match (case-insensitive)', () => {
    expect(findInLocalCatalog('moon', mockTopics)).toBeDefined();
  });

  it('returns null when topic not found', () => {
    expect(findInLocalCatalog('nonexistent', mockTopics)).toBeNull();
  });
});

describe('addTopicToCatalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadTopics.mockReturnValue({});
  });

  it('adds new topic and generates ID from slug', () => {
    const newTopic = addTopicToCatalog({
      title: 'Bitcoin',
      wikipediaSlug: 'Bitcoin',
      grokipediaSlug: 'page/Bitcoin',
    });

    expect(newTopic.id).toBe('bitcoin');
    expect(newTopic.title).toBe('Bitcoin');
    expect(mockWriteTopics).toHaveBeenCalled();
  });
});

describe('searchGrokipedia', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns results on success', async () => {
    const mockResults = [{ title: 'Bitcoin', slug: 'Bitcoin' }];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: mockResults }),
    } as never);

    const results = await searchGrokipedia('bitcoin');
    expect(results).toEqual(mockResults);
  });

  it('returns empty array on error', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    const results = await searchGrokipedia('test');
    expect(results).toEqual([]);
    consoleErrorSpy.mockRestore();
  });
});

describe('searchWikipedia', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns results on success', async () => {
    const mockPages = [{ key: 'Bitcoin', title: 'Bitcoin' }];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ pages: mockPages }),
    } as never);

    const results = await searchWikipedia('bitcoin');
    expect(results).toEqual(mockPages);
  });

  it('returns empty array on error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('API error'));
    const results = await searchWikipedia('test');
    expect(results).toEqual([]);
  });
});

describe('runLookupWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns topic from local catalog', async () => {
    mockLoadTopics.mockReturnValue({
      moon: {
        id: 'moon',
        title: 'Moon',
        wikipedia_slug: 'Moon',
        grokipedia_slug: 'page/Moon',
      },
    });

    const result = await runLookupWorkflow({ query: 'Moon' });
    expect(result.found).toBe(true);
    expect(result.topic?.id).toBe('moon');
  });

  it('searches APIs when not found locally', async () => {
    mockLoadTopics.mockReturnValue({});
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ title: 'Test', slug: 'Test' }] }),
      } as never)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ pages: [{ key: 'Test', title: 'Test' }] }),
      } as never);

    const result = await runLookupWorkflow({ query: 'test', searchApis: true });
    expect(result.found).toBe(false);
    expect(result.searchResults).toBeDefined();
  });
});
