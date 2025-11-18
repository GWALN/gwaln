/**
 * @file tests/analyzer.test.ts
 * @description Unit tests for the analyzer module to ensure discrepancies are extracted correctly.
 * @author Doğu Abaris <abaris@null.net>
 */

import { describe, expect, it } from 'vitest';
import { analyzeContent, prepareAnalyzerSource } from '../src/lib/analyzer';
import { parseMarkdownStructuredArticle } from '../src/parsers/grok';
import type { StructuredArticle } from '../src/parsers/shared/types';

const topic = {
  id: 'moon',
  title: 'Moon',
  wikipedia_slug: 'Moon',
  grokipedia_slug: 'page/Moon',
};

const paragraph = (start: string): string =>
  `${start} It orbits at an average distance of 384,399 kilometres (238,854 mi) and completes an orbit every 29.5 days. The resulting tidal forces are the main drivers of Earth's tides and have forced the Moon to face Earth with always the same near side, effectively synchronizing rotation and orbit. This makes the Moon tidally locked to Earth and keeps one hemisphere permanently turned away.`;

const toStructured = (
  markdown: string,
  source: 'wikipedia' | 'grokipedia' = 'wikipedia',
): StructuredArticle => {
  const normalized = markdown.includes('\n') ? markdown : markdown.replace('# Moon', '# Moon\n\n');
  return parseMarkdownStructuredArticle(
    topic,
    normalized,
    {
      source,
      pageId: `${source}:${topic.id}`,
      lang: 'en',
      title: topic.title,
      canonicalUrl: `https://example.org/${topic.id}/${source}`,
      revisionId: `${source}-test`,
      revisionTimestamp: '2025-01-01T00:00:00Z',
    },
    { citations: [] },
  );
};

describe('analyzeContent', () => {
  it('returns perfect similarity with no discrepancies when texts match', () => {
    const text =
      '# Moon The Moon is the only natural satellite orbiting Earth. It orbits at an average distance of 384,399 kilometres and remains tidally locked to Earth.';
    const source = prepareAnalyzerSource(toStructured(text));
    const result = analyzeContent(topic, source, source);
    expect(result.stats.similarity_ratio.word).toBe(1);
    expect(result.stats.similarity_ratio.sentence).toBe(1);
    expect(result.discrepancies).toHaveLength(0);
    expect(result.confidence.label).toBe('aligned');
    expect(result.highlights.missing).toHaveLength(0);
    expect(result.meta.content_hash).toMatch(/[a-f0-9]{64}/);
  });

  it('detects reworded claims when texts diverge with substitutions', () => {
    const wiki =
      '# Moon The Moon is the only natural satellite orbiting Earth. It orbits at an average distance of 384,399 kilometres and remains tidally locked to Earth.';
    const grok =
      '# Moon The Moon is the only test satellite orbiting Earth. It test orbits at an experimental distance of 384,399 kilometres and remains tidally locked to Earth.';
    const result = analyzeContent(
      topic,
      prepareAnalyzerSource(toStructured(wiki, 'wikipedia')),
      prepareAnalyzerSource(toStructured(grok, 'grokipedia')),
    );
    expect(result.stats.similarity_ratio.word).toBeLessThan(1);
    expect(result.discrepancies.length).toBeGreaterThanOrEqual(2);
    expect(result.discrepancies.some((d) => d.type === 'reworded_claim')).toBe(true);
    expect(result.confidence.label).not.toBe('aligned');
    expect(result.reworded_sentences.length).toBeGreaterThan(0);
  });

  it('identifies pure missing context when Grokipedia truncates the article', () => {
    const wiki = `# Moon ${paragraph("The Moon is Earth's only natural satellite.")}`;
    const grok = '# Moon';
    const result = analyzeContent(
      topic,
      prepareAnalyzerSource(toStructured(wiki, 'wikipedia')),
      prepareAnalyzerSource(toStructured(grok, 'grokipedia')),
    );
    const missingOnly = result.discrepancies.filter((d) => d.type === 'missing_context');
    const addedOnly = result.discrepancies.filter((d) => d.type === 'added_claim');
    expect(missingOnly.length).toBeGreaterThan(0);
    expect(addedOnly).toHaveLength(0);
  });

  it('identifies added claims when Grokipedia appends new paragraphs', () => {
    const wiki = '# Moon The Moon is the only natural satellite orbiting Earth.';
    const grok = `${wiki} ${paragraph('Test agents claim the Moon emits its own light, which is incorrect.')}`;
    const result = analyzeContent(
      topic,
      prepareAnalyzerSource(toStructured(wiki, 'wikipedia')),
      prepareAnalyzerSource(toStructured(grok, 'grokipedia')),
    );
    expect(result.discrepancies.some((d) => d.type === 'added_claim')).toBe(true);
    expect(result.discrepancies.some((d) => d.type === 'missing_context')).toBe(false);
  });

  it('caps missing/extra sentences at five entries', () => {
    const wikiSentences = Array.from({ length: 6 }).map((_, idx) =>
      paragraph(`Sentence ${idx + 1}: baseline.`),
    );
    const wiki = `# Moon ${wikiSentences.join(' ')}`;
    const grok = '# Moon';
    const result = analyzeContent(
      topic,
      prepareAnalyzerSource(toStructured(wiki, 'wikipedia')),
      prepareAnalyzerSource(toStructured(grok, 'grokipedia')),
    );
    expect(result.missing_sentences).toHaveLength(5);
    expect(result.discrepancies.filter((d) => d.type === 'missing_context')).toHaveLength(5);
  });

  it('ignores pure whitespace differences', () => {
    const wiki = "# Moon The Moon is Earth's natural satellite. It remains tidally locked.";
    const wikiStructured = toStructured(wiki, 'wikipedia');
    const grokStructured = JSON.parse(JSON.stringify(wikiStructured)) as StructuredArticle;
    grokStructured.source = 'grokipedia';
    grokStructured.page_id = `grok:${topic.id}`;
    const result = analyzeContent(
      topic,
      prepareAnalyzerSource(wikiStructured),
      prepareAnalyzerSource(grokStructured),
    );
    expect(result.stats.similarity_ratio.word).toBeGreaterThan(0.99);
    expect(result.discrepancies).toHaveLength(0);
  });

  it('detects missing sections and citations', () => {
    const wiki = `# Moon
## History
${paragraph('Historical overview of lunar exploration.')}
![Apollo](https://example.com/apollo.png)
For more info see [NASA](https://nasa.gov/moon).`;
    const grok = '# Moon\nHistory overview.';
    const result = analyzeContent(
      topic,
      prepareAnalyzerSource(toStructured(wiki, 'wikipedia')),
      prepareAnalyzerSource(toStructured(grok, 'grokipedia')),
    );
    expect(result.sections_missing).toContain('History');
    expect(result.citations.missing.length).toBeGreaterThan(0);
    expect(result.discrepancies.some((d) => d.type === 'section_missing')).toBe(true);
    expect(result.discrepancies.some((d) => d.type === 'missing_citation')).toBe(true);
    expect(result.highlights.missing.length).toBeGreaterThan(0);
    expect(result.section_alignment.some((record) => record.similarity === 0)).toBe(true);
  });

  it('flags bias and hallucination cues in extra sentences', () => {
    const wiki = '# Moon The Moon is the only natural satellite orbiting Earth.';
    const grok = `${wiki} This conspiracy proves scientists lied about the Moon, and reportedly it reflects secret signals.`;
    const result = analyzeContent(
      topic,
      prepareAnalyzerSource(toStructured(wiki, 'wikipedia')),
      prepareAnalyzerSource(toStructured(grok, 'grokipedia')),
    );
    expect(result.bias_events.length).toBeGreaterThan(0);
    expect(result.hallucination_events.length).toBeGreaterThan(0);
    expect(result.discrepancies.some((d) => d.type === 'bias_shift')).toBe(true);
    expect(result.discrepancies.some((d) => d.type === 'hallucination')).toBe(true);
    expect(result.highlights.extra.some((snippet) => snippet.tag === 'bias')).toBe(true);
    expect(result.confidence.label).toBe('suspected_divergence');
  });

  it('tags MOS words-to-watch categories as bias events', () => {
    const wiki = '# Moon Encyclopedic overview of the Moon.';
    const grok = `${wiki} Some people say the Moon is an iconic and legendary lighthouse for humanity.`;
    const result = analyzeContent(
      topic,
      prepareAnalyzerSource(toStructured(wiki, 'wikipedia')),
      prepareAnalyzerSource(toStructured(grok, 'grokipedia')),
    );
    expect(result.bias_events.length).toBeGreaterThanOrEqual(2);
    expect(result.bias_events.every((event) => event.type === 'bias_shift')).toBe(true);
    expect(result.bias_events[0].description).toContain('MOS');
    expect(result.bias_metrics).toBeDefined();
  });

  it('skips bias detections when Wikipedia uses the same wording', () => {
    const wiki = '# Moon The mission was described as legendary by observers.';
    const grok = `${wiki} Legendary explorers returned additional samples.`;
    const result = analyzeContent(
      topic,
      prepareAnalyzerSource(toStructured(wiki, 'wikipedia')),
      prepareAnalyzerSource(toStructured(grok, 'grokipedia')),
    );
    expect(result.bias_events).toHaveLength(0);
  });

  it('computes n-gram overlap and confidence metadata', () => {
    const wiki =
      '# Moon The Moon is the only natural satellite orbiting Earth and it remains tidally locked with our planet throughout its orbit.';
    const grok =
      '# Moon The Moon is the only natural satellite orbiting Earth, but Grokipedia adds commentary about future experiments.';
    const result = analyzeContent(
      topic,
      prepareAnalyzerSource(toStructured(wiki, 'wikipedia')),
      prepareAnalyzerSource(toStructured(grok, 'grokipedia')),
    );
    expect(result.ngram_overlap).toBeGreaterThan(0);
    expect(result.ngram_overlap).toBeLessThanOrEqual(1);
    expect(result.meta.analyzer_version).toContain('gwaln-analyzer');
    expect(result.meta.cache_ttl_hours).toBeGreaterThan(0);
  });

  it('detects numeric discrepancies when quantitative values diverge', () => {
    const wiki = '# Moon The Moon has a mean radius of 1737 km.';
    const grok = '# Moon The Moon has a mean radius of 1500 km.';
    const result = analyzeContent(
      topic,
      prepareAnalyzerSource(toStructured(wiki, 'wikipedia')),
      prepareAnalyzerSource(toStructured(grok, 'grokipedia')),
    );
    expect(result.numeric_discrepancies.length).toBeGreaterThan(0);
  });

  it('detects entity discrepancies when prominent names shift', () => {
    const wiki = '# Moon The giant impact hypothesis describes Theia striking Earth.';
    const grok = '# Moon The giant impact hypothesis describes Mars colliding with Earth.';
    const result = analyzeContent(
      topic,
      prepareAnalyzerSource(toStructured(wiki, 'wikipedia')),
      prepareAnalyzerSource(toStructured(grok, 'grokipedia')),
    );
    expect(result.entity_discrepancies.length).toBeGreaterThan(0);
  });

  it('calculates sentence similarity correctly with identical, reworded, and unique sentences', () => {
    const wiki = `# Moon
The Moon is Earth's only natural satellite in the solar system. It orbits around our planet Earth at an average distance of 384,400 kilometers from the surface.
The lunar surface completely lacks any form of atmosphere. The terrain is heavily covered in impact craters from meteorites.
NASA space agency has sent many exploration missions to study the Moon.`;

    const grok = `# Moon
The Moon is Earth's only natural satellite in the solar system. It orbits around our planet Earth at an average distance of 384,400 kilometers from the surface.
The lunar body's surface completely lacks atmosphere. The lunar terrain features numerous impact craters from space debris.
SpaceX aerospace company plans future exploration missions to the Moon.`;

    const result = analyzeContent(
      topic,
      prepareAnalyzerSource(toStructured(wiki, 'wikipedia')),
      prepareAnalyzerSource(toStructured(grok, 'grokipedia')),
    );

    expect(result.stats.agreement_count).toBeGreaterThan(0);
    expect(result.stats.similarity_ratio.sentence).toBeGreaterThan(0);
    expect(result.stats.similarity_ratio.sentence).toBeLessThanOrEqual(1);
    expect(result.stats.similarity_ratio.word).toBeGreaterThan(0.5);
    expect(result.stats.similarity_ratio.sentence).toBeLessThan(result.stats.similarity_ratio.word);
  });

  it('calculates sentence similarity as zero when no sentences match', () => {
    const wiki = `# Astronomy Article
The first document extensively discusses astronomy and planetary science topics.
Researchers study celestial bodies and their movements through space.
The universe contains billions of galaxies with countless stars.`;

    const grok = `# Biology Document
This text covers completely different subjects like biology and chemistry.
Scientists examine living organisms and their cellular structures.
DNA molecules carry genetic information in all living things.`;

    const result = analyzeContent(
      topic,
      prepareAnalyzerSource(toStructured(wiki, 'wikipedia')),
      prepareAnalyzerSource(toStructured(grok, 'grokipedia')),
    );

    expect(result.stats.agreement_count).toBe(0);
    expect(result.stats.similarity_ratio.sentence).toBeLessThan(0.5);
  });

  it('calculates sentence similarity as 1.0 when all sentences are identical', () => {
    const text = `# Moon
The Moon is Earth's only natural satellite orbiting our planet.
It orbits around Earth at an average distance of 384,400 kilometers.
The Moon has no atmosphere and its surface is covered in impact craters.`;

    const result = analyzeContent(
      topic,
      prepareAnalyzerSource(toStructured(text, 'wikipedia')),
      prepareAnalyzerSource(toStructured(text, 'grokipedia')),
    );

    expect(result.stats.agreement_count).toBe(3);
    expect(result.stats.similarity_ratio.sentence).toBe(1);
    expect(result.stats.similarity_ratio.word).toBe(1);
  });
});
