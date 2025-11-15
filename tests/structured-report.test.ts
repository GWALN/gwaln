/**
 * @file tests/structured-report.test.ts
 * @description Ensures analyzer payloads are reshaped into the structured CivicLens schema.
 * @author Doğu Abaris <abaris@null.net>
 */

import { describe, expect, it } from 'vitest';
import { buildStructuredAnalysis, STRUCTURED_ANALYSIS_SCHEMA } from '../src/lib/structured-report';
import type { AnalysisPayload } from '../src/lib/analyzer';
import type { Topic } from '../src/shared/topics';

const topic: Topic = {
  id: 'moon',
  title: 'Moon',
  wikipedia_slug: 'Moon',
  grokipedia_slug: 'page/Moon',
  category: 'space',
  ual: 'did:ot:dkg:topic:moon',
};

const payload: AnalysisPayload = {
  topic_id: 'moon',
  title: 'Moon',
  stats: {
    wiki_char_count: 100,
    grok_char_count: 120,
    similarity_ratio: 0.9,
    wiki_sentence_count: 5,
    grok_sentence_count: 4,
    missing_sentence_total: 3,
    extra_sentence_total: 2,
  },
  ngram_overlap: 0.72,
  missing_sentences: ['Missing example sentence.'],
  extra_sentences: ['Extra Grokipedia sentence.'],
  sections_missing: ['History'],
  sections_extra: ['Interpretations'],
  media: { missing: [], extra: [] },
  citations: { missing: [], extra: [] },
  diff_sample: ['--- wiki', '+++ grok'],
  discrepancies: [
    {
      type: 'missing_context',
      description: 'Missing context sample',
      evidence: { wikipedia: 'Wikipedia snippet' },
    },
  ],
  bias_events: [],
  hallucination_events: [],
  confidence: {
    label: 'aligned',
    score: 0.93,
    rationale: ['High overlap'],
  },
  highlights: { missing: [], extra: [] },
  updated_at: '2025-01-01T00:00:00Z',
  meta: {
    analyzer_version: 'test',
    content_hash: 'abcd',
    generated_at: '2025-01-01T00:00:00Z',
    cache_ttl_hours: 72,
    shingle_size: 4,
  },
  section_alignment: [
    {
      wikipedia_heading: 'History',
      grokipedia_heading: 'History',
      similarity: 0.95,
      wikipedia_section_id: 'sec-history',
      grokipedia_section_id: 'sec-history',
    },
  ],
  claim_alignment: [],
  numeric_discrepancies: [],
  entity_discrepancies: [],
  bias_metrics: {
    subjectivity_delta: 0.1,
    polarity_delta: -0.05,
    loaded_terms_grok: {},
    loaded_terms_wiki: {},
  },
};

describe('buildStructuredAnalysis', () => {
  it('emits schema-compliant report with headline + summary data', () => {
    const report = buildStructuredAnalysis(topic, payload);
    expect(report.schema).toBe(STRUCTURED_ANALYSIS_SCHEMA);
    expect(report.topic.id).toBe(topic.id);
    expect(report.summary.discrepancy_count).toBe(1);
    expect(report.summary.headline).toContain('Detected');
    expect(report.comparison.sentences.missing).toHaveLength(1);
    expect(report.discrepancies.primary).toHaveLength(1);
    expect(report.attachments.diff_sample).toHaveLength(2);
    expect(report.meta.content_hash).toBe(payload.meta.content_hash);
  });
});
