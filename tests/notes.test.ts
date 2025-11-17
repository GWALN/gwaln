/**
 * @file tests/notes.test.ts
 * @description Tests for transforming analysis payloads into JSON-LD Community Notes.
 * @author Doğu Abaris <abaris@null.net>
 */

import { describe, expect, it } from 'vitest';
import { buildCommunityNote } from '../src/lib/notes';
import type { AnalysisPayload } from '../src/lib/analyzer';
import type { Topic } from '../src/shared/topics';
import { buildStructuredAnalysis } from '../src/lib/structured-report';

const topic: Topic = {
  id: 'moon',
  title: 'Moon',
  wikipedia_slug: 'Moon',
  grokipedia_slug: 'page/Moon',
};

const baseAnalysis: AnalysisPayload = {
  topic_id: 'moon',
  title: 'Moon',
  stats: {
    wiki_char_count: 100,
    grok_char_count: 95,
    similarity_ratio: {
      word: 0.95,
      sentence: 0.90,
    },
    wiki_sentence_count: 6,
    grok_sentence_count: 5,
    missing_sentence_total: 3,
    extra_sentence_total: 2,
    reworded_sentence_count: 0,
    truly_missing_count: 3,
    agreement_count: 0,
  },
  ngram_overlap: 0.9,
  missing_sentences: ['Missing snippet example.'],
  extra_sentences: ['Added snippet example.'],
  reworded_sentences: [],
  truly_missing_sentences: ['Missing snippet example.'],
  agreed_sentences: [],
  sections_missing: ['History'],
  sections_extra: [],
  citations: {
    missing: ['https://nasa.gov/moon'],
    extra: [],
  },
  diff_sample: ['--- moon-wiki', '+++ moon-grok'],
  discrepancies: [
    {
      type: 'missing_context',
      description: 'Moon article omits NASA program paragraph.',
      evidence: { wikipedia: 'NASA section text' },
    },
    {
      type: 'added_claim',
      description: 'Grokipedia adds conspiratorial claim.',
      evidence: { grokipedia: 'Conspiracy snippet' },
    },
  ],
  bias_events: [],
  hallucination_events: [],
  factual_errors: [],
  confidence: {
    label: 'aligned',
    score: 0.97,
    rationale: ['High similarity'],
  },
  highlights: {
    missing: [],
    extra: [],
  },
  section_alignment: [],
  claim_alignment: [],
  numeric_discrepancies: [],
  entity_discrepancies: [],
  bias_metrics: {
    subjectivity_delta: 0,
    polarity_delta: 0,
    loaded_terms_grok: {},
    loaded_terms_wiki: {},
  },
  updated_at: '2025-11-13T15:00:00Z',
  meta: {
    analyzer_version: 'gwaln-analyzer@test',
    content_hash: 'abc123',
    generated_at: '2025-11-13T15:00:00Z',
    cache_ttl_hours: 72,
    shingle_size: 4,
    analysis_window: {
      wiki_analyzed_chars: 100,
      grok_analyzed_chars: 95,
      source_note: 'Full articles analyzed',
    },
  },
};

const structuredAnalysis = buildStructuredAnalysis(topic, baseAnalysis);

describe('buildCommunityNote', () => {
  it('produces JSON-LD ClaimReview with annotations and trust metadata', () => {
    const note = buildCommunityNote(topic, structuredAnalysis, {
      accuracy: 2.5,
      stakeToken: 'TRAC',
      stakeAmount: 10,
    });
    expect(note['@type']).toBe('ClaimReview');
    expect(note['topic_id']).toBe('moon');
    expect(note['reviewRating']).toBeDefined();
    expect(note['hasPart'] as unknown[]).toHaveLength(2);
    expect(note['gwalnTrust']).toMatchObject({
      accuracy: 2.5,
      stake: { token: 'TRAC', amount: 10 },
    });
  });

  it('defaults summary when none provided and caps scores', () => {
    const note = buildCommunityNote(topic, structuredAnalysis, { accuracy: 42 });
    const trust = note['gwalnTrust'] as Record<string, unknown>;
    expect(trust.accuracy).toBe(5);
    const rating = note['reviewRating'] as Record<string, unknown>;
    expect(typeof rating.ratingExplanation).toBe('string');
  });
});
