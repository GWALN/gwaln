/**
 * @file tests/parser.test.ts
 * @description Ensures Markdown parser returns structured sections with links/media.
 * @author Doğu Abaris <abaris@null.net>
 */

import { describe, expect, it } from 'vitest';
import { parseMarkdownArticle } from '../src/lib/parser';
import type { Topic } from '../src/shared/topics';

const topic: Topic = {
  id: 'moon',
  title: 'Moon',
  wikipedia_slug: 'Moon',
  grokipedia_slug: 'page/Moon',
};

const markdown = `# Moon

The **Moon** is Earth's only natural satellite. [NASA](https://nasa.gov/moon) explains its history.

## Exploration

![Apollo](https://example.com/apollo.png)
Missions such as Apollo documented its surface.
`;

describe('parseMarkdownArticle', () => {
  it('parses sections with sentences, links, and media', () => {
    const result = parseMarkdownArticle(topic, markdown, {
      source: 'wikipedia',
      sourceUrl: 'https://en.wikipedia.org/wiki/Moon',
      fetchedAt: '2025-11-14T00:00:00Z',
    });
    expect(result.sections).toHaveLength(2);
    const intro = result.sections[0];
    expect(intro.sentences.length).toBeGreaterThan(0);
    expect(intro.links).toContain('https://nasa.gov/moon');
    const exploration = result.sections[1];
    expect(exploration.media).toContain('https://example.com/apollo.png');
    expect(result.links).toContain('https://nasa.gov/moon');
    expect(result.media).toContain('https://example.com/apollo.png');
  });
});
