/**
 * @file src/lib/notes.ts
 * @description Helpers for turning analysis payloads into JSON-LD Community Notes.
 * @author Doğu Abaris <abaris@null.net>
 */

import type { Topic } from '../shared/topics';
import { topicUrls } from '../shared/topics';
import type { DiscrepancyRecord } from './analyzer';
import type { StructuredAnalysisReport } from './structured-report';
import { generateSummary } from './summary-generator';

export interface BuildNoteOptions {
  summary?: string;
  accuracy?: number;
  completeness?: number;
  toneBias?: number;
  stakeToken?: string;
  stakeAmount?: number;
  reviewerName?: string;
  reviewerId?: string;
}

const clampScore = (value: number | undefined, fallback: number): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(5, value));
};

const snip = (value: string, limit = 240): string =>
  value.length > limit ? `${value.slice(0, limit)}…` : value;

const NOTE_CONTEXT: string[] = ['https://schema.org', 'https://www.w3.org/ns/anno.jsonld'];

const buildAnalysisText = (analysis: StructuredAnalysisReport, topic: Topic): string => {
  const parts: string[] = [];

  parts.push(`Comparison analysis for ${topic.title}.`);

  parts.push(
    `Similarity metrics: ${(analysis.summary.similarity_ratio.word * 100).toFixed(1)}% word similarity, ` +
      `${(analysis.summary.similarity_ratio.sentence * 100).toFixed(1)}% sentence similarity, ` +
      `${(analysis.summary.ngram_overlap * 100).toFixed(1)}% n-gram overlap.`,
  );

  if (analysis.summary.discrepancy_count > 0) {
    parts.push(
      `Detected ${analysis.summary.discrepancy_count} discrepancies including ` +
        `${analysis.summary.bias_event_count} bias issues, ` +
        `${analysis.summary.hallucination_count} hallucination flags, ` +
        `and ${analysis.summary.factual_error_count} factual errors.`,
    );
  }

  const missingCount = analysis.comparison.sentences.missing.length;
  if (missingCount > 0) {
    const examples = analysis.comparison.sentences.missing.slice(0, 2).join(' ');
    parts.push(
      `Grokipedia is missing ${missingCount} Wikipedia sentences. Examples: ${examples.slice(0, 200)}...`,
    );
  }

  const extraCount = analysis.comparison.sentences.extra.length;
  if (extraCount > 0) {
    const examples = analysis.comparison.sentences.extra.slice(0, 2).join(' ');
    parts.push(
      `Grokipedia contains ${extraCount} additional sentences not in Wikipedia. Examples: ${examples.slice(0, 200)}...`,
    );
  }

  if (analysis.summary.confidence.label) {
    parts.push(`Overall confidence assessment: ${analysis.summary.confidence.label}.`);
  }

  return parts.join(' ');
};

const annotationFromDiscrepancy = (
  issue: DiscrepancyRecord,
  topicId: string,
  urls: { wikipedia: string; grokipedia: string },
  index: number,
) => {
  const isMissing = issue.type === 'missing_context';
  const targetUrl = isMissing ? urls.wikipedia : urls.grokipedia;
  const quote = isMissing ? issue.evidence.wikipedia : issue.evidence.grokipedia;
  return {
    '@type': 'Annotation',
    '@id': `urn:gwaln:annotation:${topicId}:${index}`,
    classification: issue.type,
    motivation: 'commenting',
    body: {
      '@type': 'TextualBody',
      value: issue.description,
    },
    target: [
      {
        source: targetUrl,
        ...(quote
          ? {
              selector: {
                type: 'TextQuoteSelector',
                exact: snip(quote),
              },
            }
          : {}),
      },
    ],
  };
};

export const buildCommunityNote = async (
  topic: Topic,
  analysis: StructuredAnalysisReport,
  options: BuildNoteOptions = {},
): Promise<Record<string, unknown>> => {
  const urls = topicUrls(topic);
  const now = new Date().toISOString();
  const accuracy = clampScore(options.accuracy, 3);
  const completeness = clampScore(options.completeness, 3);
  const toneBias = clampScore(options.toneBias, 3);

  const discrepancies = analysis.discrepancies.primary ?? [];

  let summary: string;

  if (options.summary) {
    summary = options.summary;
  } else {
    try {
      const analysisText = buildAnalysisText(analysis, topic);
      summary = await generateSummary(analysisText, { maxLength: 100, minLength: 30 });
    } catch (error) {
      console.warn('[notes] AI summary generation failed, falling back to template:', error);
      summary = discrepancies.length
        ? `Detected ${analysis.summary.discrepancy_count} notable discrepancies between Grokipedia and Wikipedia entries for ${topic.title}.`
        : `No material discrepancies detected for ${topic.title}; Grokipedia aligns with Wikipedia.`;
    }
  }

  return {
    '@context': NOTE_CONTEXT,
    '@type': 'ClaimReview',
    '@id': `urn:gwaln:note:${topic.id}:${analysis.generated_at}`,
    topic_id: topic.id,
    topic_title: topic.title,
    claimReviewed: `Comparison of ${topic.title} entries on Grokipedia and Wikipedia`,
    dateCreated: now,
    author: {
      '@type': 'Organization',
      name: options.reviewerName ?? 'GWALN',
      ...(options.reviewerId ? { identifier: options.reviewerId } : {}),
    },
    itemReviewed: {
      '@type': 'CreativeWork',
      name: `${topic.title} (Wikipedia)`,
      url: urls.wikipedia,
    },
    reviewRating: {
      '@type': 'Rating',
      bestRating: 5,
      worstRating: 0,
      ratingValue: Number((5 - discrepancies.length).toFixed(2)).toString(),
      ratingExplanation: summary,
    },
    gwalnTrust: {
      accuracy,
      completeness,
      tone_bias: toneBias,
      stake: {
        token: options.stakeToken ?? 'TRAC',
        amount: options.stakeAmount ?? 0,
      },
    },
    hasPart: discrepancies.map((issue, idx) =>
      annotationFromDiscrepancy(issue, topic.id, urls, idx),
    ),
    citation: [
      { '@type': 'CreativeWork', name: 'Wikipedia', url: urls.wikipedia },
      { '@type': 'CreativeWork', name: 'Grokipedia', url: urls.grokipedia },
    ],
    analysisSummary: {
      missing_count: analysis.comparison.sentences.missing.length,
      added_count: analysis.comparison.sentences.extra.length,
      similarity_ratio: analysis.summary.similarity_ratio,
      ngram_overlap: analysis.summary.ngram_overlap,
      confidence_label: analysis.summary.confidence.label,
      confidence_score: analysis.summary.confidence.score,
      analyzer_version: analysis.meta?.analyzer_version ?? null,
    },
    ual: null,
    notes: '',
  };
};
