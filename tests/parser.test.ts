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

  it('strips citation markers from sentences and content', () => {
    const markdownWithCitations = `# Moon

The Moon is Earth's only natural satellite. [1][2] It orbits Earth at an average distance of 384,400 kilometers.

## Formation

Scientists believe [3] the Moon formed from debris. [4] This theory is widely accepted.`;

    const result = parseMarkdownArticle(topic, markdownWithCitations, {
      source: 'grokipedia',
      sourceUrl: 'https://grok.x.ai/page/Moon',
      fetchedAt: '2025-11-14T00:00:00Z',
    });

    expect(result.sections).toHaveLength(2);

    const intro = result.sections[0];
    expect(intro.content).not.toContain('[1]');
    expect(intro.content).not.toContain('[2]');
    expect(intro.content).toContain('It orbits Earth at an average distance of 384,400 kilometers');

    const sentence = intro.sentences.find((s) => s.includes('It orbits Earth'));
    expect(sentence).toBeDefined();
    expect(sentence).not.toContain('[1]');
    expect(sentence).not.toContain('[2]');
    expect(sentence).toBe('It orbits Earth at an average distance of 384,400 kilometers.');

    const formation = result.sections[1];
    expect(formation.content).not.toContain('[3]');
    expect(formation.content).not.toContain('[4]');
    expect(formation.content).toContain('Scientists believe the Moon formed from debris.');
    expect(formation.content).toContain('This theory is widely accepted.');
  });

  it('handles multiple consecutive citation markers', () => {
    const markdownWithMultipleCitations = `# Test

[1][2][3] Multiple citations at the start. Text with [4][5] citations in the middle.`;

    const result = parseMarkdownArticle(topic, markdownWithMultipleCitations, {
      source: 'grokipedia',
      sourceUrl: 'https://grok.x.ai/page/Test',
      fetchedAt: '2025-11-14T00:00:00Z',
    });

    const section = result.sections[0];
    expect(section.content).not.toContain('[1]');
    expect(section.content).not.toContain('[2]');
    expect(section.content).not.toContain('[3]');
    expect(section.content).not.toContain('[4]');
    expect(section.content).not.toContain('[5]');
    expect(section.content).toContain('Multiple citations at the start.');
    expect(section.content).toContain('Text with citations in the middle.');
  });
});
