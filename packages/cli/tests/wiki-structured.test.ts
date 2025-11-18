/**
 * @file tests/wiki-structured.test.ts
 * @description Unit tests for the Wikipedia wikitext parser used by `gwaln fetch wiki`.
 *              The parser never hits the network; it converts the raw Moon wikitext blob into the
 *              structured JSON snapshot consumed by downstream tooling. The fixture mirrors the
 *              full `?action=raw` output to ensure we catch regressions in heading/paragraph
 *              detection, references, claims, and media usage.
 * @author Doğu Abaris <abaris@null.net>
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ArticleMetadata,
  parseMarkdownStructuredArticle,
  parseWikiArticle,
  type Topic,
} from '@gwaln/core';

const topic: Topic = {
  id: 'moon',
  title: 'Moon',
  wikipedia_slug: 'Moon',
  grokipedia_slug: 'page/Moon',
};

const venusTopic: Topic = {
  id: 'venus',
  title: 'Venus',
  wikipedia_slug: 'Venus',
  grokipedia_slug: 'page/Venus',
};

const metadata: ArticleMetadata = {
  source: 'wikipedia',
  pageId: 'en:Moon',
  lang: 'en',
  title: 'Moon',
  canonicalUrl: 'https://en.wikipedia.org/wiki/Moon',
  revisionId: '2025-11-14-snapshot',
  revisionTimestamp: '2025-11-14T00:00:00Z',
};

const fixturePath = path.join(__dirname, 'fixtures', 'wiki-moon.raw');
const wikitext = fs.readFileSync(fixturePath, 'utf8');
const grokFixturePath = path.join(__dirname, 'fixtures', 'grok-moon.md');
const grokMarkdown = fs.readFileSync(grokFixturePath, 'utf8');
const grokCitations = [
  {
    id: '1',
    title: 'Moon Facts - NASA Science',
    description: "Structure. Earth's Moon has a core, mantle, and crust.",
    url: 'https://science.nasa.gov/moon/facts/',
  },
  {
    id: '2',
    title: 'All About the Moon | NASA Space Place',
    description: 'Quick Facts: Earth has just one moon.',
    url: 'https://spaceplace.nasa.gov/all-about-the-moon/en/',
  },
];
const grokMetadata: ArticleMetadata = {
  source: 'grokipedia',
  pageId: 'grok:moon',
  lang: 'en',
  title: 'Moon',
  canonicalUrl: 'https://grokipedia.com/page/Moon',
  revisionId: 'grok-fixture',
  revisionTimestamp: '2025-11-14T00:00:00Z',
};

const venusMetadata: ArticleMetadata = {
  source: 'grokipedia',
  pageId: 'grok:venus',
  lang: 'en',
  title: 'Venus',
  canonicalUrl: 'https://grokipedia.com/page/Venus',
  revisionId: 'grok-venus',
  revisionTimestamp: '2025-11-14T00:00:00Z',
};

describe('parseWikiArticle', () => {
  it('parses lead sentences from the full Moon article', { timeout: 15000 }, () => {
    const article = parseWikiArticle(topic, wikitext, metadata);
    expect(article.lead.paragraphs[0].sentences[0].text).toBe(
      'The Moon is the only natural satellite orbiting Earth.',
    );
    expect(article.lead.paragraphs[0].sentences[1].citation_ids).toEqual(['r_nasafactsheet']);
    expect(article.lead.text_range.end_offset).toBeGreaterThan(
      article.lead.text_range.start_offset,
    );
    expect(article.claims.length).toBeGreaterThan(100);
  });

  it('emits sections, media entries, references, and claims', { timeout: 15000 }, () => {
    const article = parseWikiArticle(topic, wikitext, metadata);
    const namesSection = article.sections.find((sec) => sec.heading === 'Names and etymology');
    expect(namesSection).toBeDefined();
    expect(namesSection?.paragraphs[0].sentences[0].citation_ids).toEqual(['r_auto_1', 'r_pn_faq']);
    expect(article.references).toHaveLength(315);
    expect(article.sections.length).toBeGreaterThan(40);
  });

  it('parses Grokipedia markdown into the structured schema', () => {
    const article = parseMarkdownStructuredArticle(topic, grokMarkdown, grokMetadata, {
      citations: grokCitations,
    });
    expect(article.source).toBe('grokipedia');
    expect(article.page_id).toBe('grok:moon');
    expect(article.lead.paragraphs[0].sentences.length).toBeGreaterThan(0);
    expect(article.sections.length).toBeGreaterThan(0);
    expect(article.claims.length).toBeGreaterThan(0);
    expect(article.lead.paragraphs[0].sentences[0].text).toContain(
      "The Moon is Earth's only natural satellite",
    );
    expect(article.references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ citation_id: 'grokipedia_citation_1' }),
        expect.objectContaining({ citation_id: 'grokipedia_citation_2' }),
      ]),
    );
  });

  it('supports non-Moon topics with arbitrary headings', () => {
    const markdown = `# Venus

Venus is the second planet from the Sun.

## Atmosphere

Venus has a dense atmosphere composed mainly of carbon dioxide.

## Exploration

Multiple probes have visited Venus.`;
    const article = parseMarkdownStructuredArticle(venusTopic, markdown, venusMetadata);
    expect(article.title).toBe('Venus');
    expect(article.lead.paragraphs[0].sentences[0].text).toContain('second planet');
    expect(article.sections.map((section) => section.heading)).toEqual([
      'Atmosphere',
      'Exploration',
    ]);
    expect(article.claims.length).toBeGreaterThan(2);
  });

  it('drops Grok banner sentences before parsing', () => {
    const bannerMarkdown = `Moon Search ⌘K Fact-checked by Grok 2 weeks ago

Moon overview paragraph.

## Details
Deep dive.`;
    const article = parseMarkdownStructuredArticle(topic, bannerMarkdown, grokMetadata);
    const sentences = article.lead.paragraphs.flatMap((p) => p.sentences.map((s) => s.text));
    expect(sentences[0]).toBe('Moon overview paragraph.');
    expect(sentences.some((sentence) => sentence.toLowerCase().includes('search ⌘k'))).toBe(false);
  });
});
