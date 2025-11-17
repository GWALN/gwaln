/**
 * @file src/lib/structured-report.ts
 * @description Shapes the raw analyzer payload into a topic-aware report schema that is easier
 *              for downstream tooling (CLI renderers, Community Notes, dashboards) to consume.
 *              The schema is intentionally source-agnostic so Grokipedia and Wikipedia stay aligned.
 * @author Doğu Abaris <abaris@null.net>
 */

import type { Topic } from '../shared/topics';
import { topicUrls } from '../shared/topics';
import type { ClaimAlignmentRecord, SectionAlignmentRecord } from './alignment';
import type {
  AnalysisMeta,
  AnalysisPayload,
  BiasVerificationRecord,
  CitationVerificationRecord,
  ConfidenceSummary,
  DiscrepancyRecord,
  GeminiSummary,
  HighlightSnippet,
} from './analyzer';
import type { BiasMetrics } from './bias-metrics';
import type { EntityDiscrepancy, NumericDiscrepancy } from './discrepancies';

export const STRUCTURED_ANALYSIS_SCHEMA = 'gwaln.analysis/2';

export interface StructuredAnalysisSummary {
  similarity_ratio: {
    word: number;
    sentence: number;
  };
  ngram_overlap: number;
  wiki_char_count: number;
  grok_char_count: number;
  wiki_sentence_count: number;
  grok_sentence_count: number;
  sentences_reviewed: number;
  missing_sentence_count: number;
  extra_sentence_count: number;
  reworded_sentence_count: number;
  truly_missing_count: number;
  agreement_count: number;
  discrepancy_count: number;
  bias_event_count: number;
  hallucination_count: number;
  factual_error_count: number;
  headline: string;
  confidence: ConfidenceSummary;
}

export interface StructuredComparisonBlock {
  sentences: {
    missing: string[];
    extra: string[];
    reworded: Array<{ wikipedia: string; grokipedia: string; similarity: number }>;
    truly_missing: string[];
    agreed: string[];
  };
  sections: {
    missing: string[];
    extra: string[];
    alignment: SectionAlignmentRecord[];
  };
  claims: {
    alignment: ClaimAlignmentRecord[];
  };
  citations: {
    missing: string[];
    extra: string[];
  };
  numbers: NumericDiscrepancy[];
  entities: EntityDiscrepancy[];
}

export interface StructuredDiscrepancyBlock {
  primary: DiscrepancyRecord[];
  bias: DiscrepancyRecord[];
  hallucinations: DiscrepancyRecord[];
  factual_errors: DiscrepancyRecord[];
  highlights: {
    missing: HighlightSnippet[];
    extra: HighlightSnippet[];
  };
}

export interface StructuredAttachments {
  diff_sample: string[];
  bias_verifications?: BiasVerificationRecord[];
  citation_verifications?: CitationVerificationRecord[];
  gemini_summary?: GeminiSummary | null;
}

export interface StructuredAnalysisReport {
  schema: typeof STRUCTURED_ANALYSIS_SCHEMA;
  topic: {
    id: string;
    title: string;
    category?: string | null;
    ual?: string | null;
    slugs: {
      wikipedia: string;
      grokipedia: string;
    };
    urls: {
      wikipedia: string;
      grokipedia: string;
    };
  };
  meta: AnalysisMeta;
  generated_at: string;
  summary: StructuredAnalysisSummary;
  comparison: StructuredComparisonBlock;
  discrepancies: StructuredDiscrepancyBlock;
  attachments: StructuredAttachments;
  bias_metrics: BiasMetrics;
}

const formatCount = (count: number, singular: string, plural: string): string =>
  `${count} ${count === 1 ? singular : plural}`;

const buildHeadline = (topic: Topic, summary: StructuredAnalysisSummary): string => {
  const parts: string[] = [];
  if (summary.discrepancy_count) {
    parts.push(formatCount(summary.discrepancy_count, 'discrepancy', 'discrepancies'));
  }
  if (summary.bias_event_count) {
    parts.push(formatCount(summary.bias_event_count, 'bias cue', 'bias cues'));
  }
  if (summary.hallucination_count) {
    parts.push(
      formatCount(summary.hallucination_count, 'hallucination flag', 'hallucination flags'),
    );
  }
  if (!parts.length) {
    return `Grokipedia remains aligned with Wikipedia for ${topic.title}.`;
  }
  return `Detected ${parts.join(' + ')} for ${topic.title}.`;
};

export const buildStructuredAnalysis = (
  topic: Topic,
  payload: AnalysisPayload,
): StructuredAnalysisReport => {
  const urls = topicUrls(topic);
  const summary: StructuredAnalysisSummary = {
    similarity_ratio: payload.stats.similarity_ratio,
    ngram_overlap: payload.ngram_overlap,
    wiki_char_count: payload.stats.wiki_char_count,
    grok_char_count: payload.stats.grok_char_count,
    wiki_sentence_count: payload.stats.wiki_sentence_count,
    grok_sentence_count: payload.stats.grok_sentence_count,
    sentences_reviewed: payload.stats.wiki_sentence_count + payload.stats.grok_sentence_count,
    missing_sentence_count: payload.stats.missing_sentence_total,
    extra_sentence_count: payload.stats.extra_sentence_total,
    reworded_sentence_count: payload.stats.reworded_sentence_count,
    truly_missing_count: payload.stats.truly_missing_count,
    agreement_count: payload.stats.agreement_count,
    discrepancy_count: payload.discrepancies.length,
    bias_event_count: payload.bias_events.length,
    hallucination_count: payload.hallucination_events.length,
    factual_error_count: payload.factual_errors.length,
    headline: '',
    confidence: payload.confidence,
  };
  summary.headline = buildHeadline(topic, summary);

  const comparison: StructuredComparisonBlock = {
    sentences: {
      missing: payload.missing_sentences,
      extra: payload.extra_sentences,
      reworded: payload.reworded_sentences,
      truly_missing: payload.truly_missing_sentences,
      agreed: payload.agreed_sentences,
    },
    sections: {
      missing: payload.sections_missing,
      extra: payload.sections_extra,
      alignment: payload.section_alignment,
    },
    claims: {
      alignment: payload.claim_alignment,
    },
    citations: payload.citations,
    numbers: payload.numeric_discrepancies,
    entities: payload.entity_discrepancies,
  };

  const discrepancies: StructuredDiscrepancyBlock = {
    primary: payload.discrepancies,
    bias: payload.bias_events,
    hallucinations: payload.hallucination_events,
    factual_errors: payload.factual_errors,
    highlights: payload.highlights,
  };

  const attachments: StructuredAttachments = {
    diff_sample: payload.diff_sample,
    bias_verifications: payload.bias_verifications,
    citation_verifications: payload.citation_verifications,
    gemini_summary: payload.gemini_summary,
  };

  return {
    schema: STRUCTURED_ANALYSIS_SCHEMA,
    topic: {
      id: topic.id,
      title: topic.title,
      category: topic.category ?? null,
      ual: topic.ual ?? null,
      slugs: {
        wikipedia: topic.wikipedia_slug,
        grokipedia: topic.grokipedia_slug,
      },
      urls,
    },
    meta: payload.meta,
    generated_at: payload.updated_at,
    summary,
    comparison,
    discrepancies,
    attachments,
    bias_metrics: payload.bias_metrics,
  };
};

export const isStructuredAnalysisReport = (value: unknown): value is StructuredAnalysisReport =>
  typeof value === 'object' &&
  value !== null &&
  (value as { schema?: string }).schema === STRUCTURED_ANALYSIS_SCHEMA;

export const coerceStructuredAnalysisReport = (
  topic: Topic,
  payload: AnalysisPayload | StructuredAnalysisReport,
): StructuredAnalysisReport => {
  if (isStructuredAnalysisReport(payload)) {
    return payload;
  }
  return buildStructuredAnalysis(topic, payload as AnalysisPayload);
};
