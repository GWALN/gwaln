/**
 * @file src/lib/analyzer.ts
 * @description Core text comparison helpers shared by the CLI and tests.
 * @author Doğu Abaris <abaris@null.net>
 */

import { createTwoFilesPatch } from 'diff';
import stringSimilarity from 'string-similarity';
import {
  ANALYZER_VERSION,
  CACHE_TTL_HOURS,
  CLASSIFICATION_THRESHOLDS,
  HIGHLIGHT_WINDOW,
  SEMANTIC_BIAS_CONFIDENCE_THRESHOLD,
  SEMANTIC_NEUTRAL_THRESHOLD,
  SHINGLE_SIZE,
} from '../shared/analyzer-config';
import { computeContentHash } from '../shared/content-hash';
import type { Topic } from '../shared/topics';
import {
  alignClaims,
  alignSections,
  type ClaimAlignmentRecord,
  type SectionAlignmentRecord,
} from './alignment';
import { biasCategories } from './bias-lexicon';
import { type BiasMetrics, computeBiasMetrics } from './bias-metrics';
import {
  detectEntityDiscrepancies,
  detectNumericDiscrepancies,
  type EntityDiscrepancy,
  type NumericDiscrepancy,
} from './discrepancies';
import type {
  StructuredArticle,
  StructuredClaim,
  StructuredParagraph,
  StructuredSection,
  StructuredSentence,
  StructuredReference,
} from '../parsers/shared/types';

export type DiscrepancyType =
  | 'missing_context'
  | 'added_claim'
  | 'section_missing'
  | 'section_extra'
  | 'missing_citation'
  | 'added_citation'
  | 'bias_shift'
  | 'hallucination'
  | 'factual_error'
  | 'reworded_claim';

export interface DiscrepancyRecord {
  type: DiscrepancyType;
  description: string;
  evidence: {
    wikipedia?: string;
    grokipedia?: string;
  };
  severity?: number;
  category?: string;
  tags?: string[];
}

export type ConfidenceLabel = 'aligned' | 'possible_divergence' | 'suspected_divergence';

export interface ConfidenceSummary {
  label: ConfidenceLabel;
  score: number;
  rationale: string[];
}

export interface HighlightSnippet {
  source: 'wikipedia' | 'grokipedia';
  tag: 'missing' | 'extra' | 'bias' | 'hallucination';
  text: string;
  preview: string;
}

export type BiasVerificationVerdict = 'confirm' | 'reject' | 'uncertain' | 'error';

export interface BiasVerificationRecord {
  provider: string;
  event_index: number;
  verdict: BiasVerificationVerdict;
  confidence?: number | null;
  rationale?: string;
  raw?: unknown;
}

export interface AnalysisMeta {
  analyzer_version: string;
  content_hash: string;
  generated_at: string;
  cache_ttl_hours: number;
  shingle_size: number;
  analysis_window: {
    wiki_analyzed_chars: number;
    grok_analyzed_chars: number;
    source_note: string;
  };
}

interface AnalyzerOptions {
  contentHash?: string;
  semanticBias?: boolean;
}

export interface GeminiSummary {
  provider: string;
  model: string;
  text: string;
  generated_at: string;
  raw?: unknown;
}

export interface AnalysisPayload {
  topic_id: string;
  title: string;
  stats: {
    wiki_char_count: number;
    grok_char_count: number;
    similarity_ratio: {
      word: number;
      sentence: number;
    };
    wiki_sentence_count: number;
    grok_sentence_count: number;
    missing_sentence_total: number;
    extra_sentence_total: number;
    reworded_sentence_count: number;
    truly_missing_count: number;
    agreement_count: number;
  };
  ngram_overlap: number;
  missing_sentences: string[];
  extra_sentences: string[];
  reworded_sentences: Array<{ wikipedia: string; grokipedia: string; similarity: number }>;
  truly_missing_sentences: string[];
  agreed_sentences: string[];
  sections_missing: string[];
  sections_extra: string[];
  citations: {
    missing: string[];
    extra: string[];
  };
  diff_sample: string[];
  discrepancies: DiscrepancyRecord[];
  bias_events: DiscrepancyRecord[];
  hallucination_events: DiscrepancyRecord[];
  factual_errors: DiscrepancyRecord[];
  bias_verifications?: BiasVerificationRecord[];
  citation_verifications?: CitationVerificationRecord[];
  gemini_summary?: GeminiSummary | null;
  confidence: ConfidenceSummary;
  highlights: {
    missing: HighlightSnippet[];
    extra: HighlightSnippet[];
  };
  updated_at: string;
  meta: AnalysisMeta;
  section_alignment: SectionAlignmentRecord[];
  claim_alignment: ClaimAlignmentRecord[];
  numeric_discrepancies: NumericDiscrepancy[];
  entity_discrepancies: EntityDiscrepancy[];
  bias_metrics: BiasMetrics;
}

export interface CitationVerificationRecord {
  sentence: string;
  status: 'supported' | 'unsupported' | 'error';
  supporting_url?: string | null;
  message?: string;
}

export interface ArticleContent {
  sentences: string[];
  sections: string[];
  citations: string[];
  claims: StructuredClaim[];
}

export interface AnalyzerSource {
  text: string;
  content: ArticleContent;
  article: StructuredArticle;
}

const REWORD_SIMILARITY_THRESHOLD = 0.65;
const MIN_SENTENCE_LENGTH = 20;
const HALLUCINATION_SIMILARITY_MIN = 0.15;
const HALLUCINATION_SIMILARITY_MAX = 0.6;

const normalizeWhitespace = (text: string): string =>
  text.replace(/\\-/g, '-').replace(/\\\\/g, '\\').replace(/\s+/g, ' ').trim();

const sentenceTokens = (text: string): string[] =>
  text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > MIN_SENTENCE_LENGTH);

const normalizeSentence = (sentence: string): string =>
  sentence
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, '');

const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

const wordSimilarityRatio = (wikiText: string, grokText: string): number => {
  const wikiTokens = tokenize(wikiText);
  const grokTokens = tokenize(grokText);

  if (!wikiTokens.length && !grokTokens.length) {
    return 1;
  }
  if (!wikiTokens.length || !grokTokens.length) {
    return 0;
  }

  const grokSet = new Set(grokTokens);
  let matchedCount = 0;

  wikiTokens.forEach((token) => {
    if (grokSet.has(token)) {
      matchedCount += 1;
    }
  });

  return Number((matchedCount / wikiTokens.length).toFixed(4));
};

const sentenceSimilarityRatio = (wikiSentences: string[], grokSentences: string[]): number => {
  if (wikiSentences.length === 0 && grokSentences.length === 0) {
    return 1;
  }
  if (wikiSentences.length === 0 || grokSentences.length === 0) {
    return 0;
  }

  const threshold = 0.75;
  let totalSimilarity = 0;

  wikiSentences.forEach((wikiSent) => {
    let maxSim = 0;
    grokSentences.forEach((grokSent) => {
      const sim = stringSimilarity.compareTwoStrings(
        wikiSent.toLowerCase().trim(),
        grokSent.toLowerCase().trim(),
      );
      if (sim > maxSim) {
        maxSim = sim;
      }
    });
    if (maxSim >= threshold) {
      totalSimilarity += maxSim;
    }
  });

  return Number((totalSimilarity / wikiSentences.length).toFixed(4));
};

const diffSample = (wiki: string, grok: string, topicId: string): string[] => {
  const patch = createTwoFilesPatch(
    `${topicId}-wiki`,
    `${topicId}-grok`,
    wiki,
    grok,
    undefined,
    undefined,
    { context: 2 },
  );
  const lines = patch.split('\n');
  return lines.length > 120 ? [...lines.slice(0, 120), '... (diff truncated)'] : lines;
};

const normalizeToken = (value: string): string => value.trim().toLowerCase();

const uniqueList = (values: string[]): string[] => {
  const seen = new Set<string>();
  const list: string[] = [];
  values.forEach((value) => {
    const key = normalizeToken(value);
    if (!seen.has(key)) {
      list.push(value.trim());
      seen.add(key);
    }
  });
  return list;
};

const difference = (a: string[], b: string[]): string[] => {
  const setB = new Set(b.map(normalizeToken));
  const result: string[] = [];
  a.forEach((value) => {
    const key = normalizeToken(value);
    if (!setB.has(key)) {
      result.push(value);
    }
  });
  return result;
};

type StructuredParagraphSnapshot = { sentences: Array<{ text: string }> };

const collectStructuredSentences = (paragraphs: StructuredParagraphSnapshot[]): string[] =>
  paragraphs.flatMap((paragraph) =>
    paragraph.sentences
      .map((sentence) => sentence.text.trim())
      .filter((sentence) => sentence.length > 0),
  );

const reconstructTextFromStructured = (article: StructuredArticle): string => {
  const parts: string[] = [];

  article.lead.paragraphs.forEach((para: StructuredParagraph) => {
    const sentences = para.sentences.map((s: StructuredSentence) => s.text).join(' ');
    if (sentences.trim()) {
      parts.push(sentences);
    }
  });

  article.sections
    .filter((section) => !isMetaSection(section))
    .forEach((section: StructuredSection) => {
      section.paragraphs.forEach((para: StructuredParagraph) => {
        const sentences = para.sentences.map((s: StructuredSentence) => s.text).join(' ');
        if (sentences.trim()) {
          parts.push(sentences);
        }
      });
    });

  return parts.join('\n');
};

const META_SECTION_HEADINGS = new Set([
  'references',
  'external links',
  'notes',
  'bibliography',
  'sources',
  'further reading',
  'see also',
  'citations',
  'footnotes',
]);

const isMetaSection = (section: StructuredSection): boolean => {
  const heading = section.heading?.toLowerCase().trim();
  return heading ? META_SECTION_HEADINGS.has(heading) : false;
};

const buildContentFromStructured = (
  article: StructuredArticle,
  fallbackText: string,
): ArticleContent => {
  const leadSentences = collectStructuredSentences(article.lead.paragraphs);

  const contentSections = article.sections.filter((section) => !isMetaSection(section));
  const sectionSentences = contentSections.flatMap((section: StructuredSection) =>
    collectStructuredSentences(section.paragraphs),
  );

  const sentences = [...leadSentences, ...sectionSentences];

  const sections = article.sections
    .filter((section: StructuredSection) => !isMetaSection(section))
    .map((section: StructuredSection) => section.heading?.trim())
    .filter((heading): heading is string => Boolean(heading && heading.length));

  const citations = article.references
    .map(
      (reference: StructuredReference) =>
        reference.normalized.url ?? reference.name ?? reference.citation_id ?? reference.raw,
    )
    .filter((value): value is string => Boolean(value))
    .map((value: string) => value.trim());

  return {
    sentences: sentences.length ? sentences : sentenceTokens(fallbackText),
    sections,
    citations: uniqueList(citations),
    claims: article.claims ?? [],
  };
};

export const prepareAnalyzerSource = (article: StructuredArticle): AnalyzerSource => {
  const reconstructedText = reconstructTextFromStructured(article);
  const normalizedText = normalizeWhitespace(reconstructedText);
  const content = buildContentFromStructured(article, normalizedText);
  return {
    text: normalizedText,
    content,
    article,
  };
};

const detectBiasEventsKeywordOnly = (
  extraSentences: string[],
  wikiText: string,
): DiscrepancyRecord[] => {
  if (!extraSentences.length) {
    return [];
  }
  const wikiHits = new Set<string>();
  biasCategories.forEach((category) => {
    category.patterns.forEach((pattern) => {
      if (pattern.regex.test(wikiText)) {
        wikiHits.add(`${category.id}:${pattern.label.toLowerCase()}`);
      }
    });
  });
  const seen = new Set<string>();
  const events: DiscrepancyRecord[] = [];
  extraSentences.forEach((sentence) => {
    biasCategories.forEach((category) => {
      category.patterns.forEach((pattern) => {
        const key = `${category.id}:${pattern.label.toLowerCase()}`;
        if (wikiHits.has(key)) {
          return;
        }
        if (pattern.regex.test(sentence)) {
          const eventKey = `${key}:${sentence}`;
          if (seen.has(eventKey)) {
            return;
          }
          events.push({
            type: 'bias_shift',
            description: `${category.label}: ${category.description} (${category.reference})`,
            evidence: { grokipedia: sentence },
            severity: category.severity,
            category: 'bias',
            tags: [category.id, pattern.label],
          });
          seen.add(eventKey);
        }
      });
    });
  });
  return events;
};

const detectBiasEventsHybrid = async (
  extraSentences: string[],
  wikiText: string,
): Promise<DiscrepancyRecord[]> => {
  if (!extraSentences.length) {
    return [];
  }

  const keywordEvents = detectBiasEventsKeywordOnly(extraSentences, wikiText);
  const { detectSemanticBiasBatch } = await import('./semantic-bias-detector');

  const flaggedSentences = new Set(keywordEvents.map((e) => e.evidence.grokipedia!));
  const sampleSize = Math.min(50, Math.ceil(extraSentences.length * 0.1));
  const randomSample = extraSentences
    .filter((s) => !flaggedSentences.has(s))
    .sort(() => Math.random() - 0.5)
    .slice(0, sampleSize);

  const sentencesToCheck = [...flaggedSentences, ...randomSample];
  const semanticResults = await detectSemanticBiasBatch(sentencesToCheck);

  const verifiedEvents: DiscrepancyRecord[] = [];
  const processedSentences = new Set<string>();

  keywordEvents.forEach((event) => {
    const sentence = event.evidence.grokipedia!;
    const semanticResult = semanticResults.find((r) => r.sentence === sentence);

    if (!semanticResult) {
      verifiedEvents.push(event);
      processedSentences.add(sentence);
      return;
    }

    if (
      semanticResult.predicted_bias_type &&
      semanticResult.confidence > SEMANTIC_BIAS_CONFIDENCE_THRESHOLD
    ) {
      verifiedEvents.push({
        ...event,
        description: `${event.description} [Semantic: ${semanticResult.predicted_bias_type}, ${(semanticResult.confidence * 100).toFixed(0)}% confidence]`,
        tags: [...(event.tags || []), 'semantic_verified'],
      });
      processedSentences.add(sentence);
    } else if (semanticResult.scores.neutral > SEMANTIC_NEUTRAL_THRESHOLD) {
      return;
    } else {
      verifiedEvents.push({
        ...event,
        severity: Math.max(1, (event.severity ?? 2) - 1),
        tags: [...(event.tags || []), 'semantic_uncertain'],
      });
      processedSentences.add(sentence);
    }
  });

  semanticResults.forEach((semanticResult) => {
    if (processedSentences.has(semanticResult.sentence)) {
      return;
    }

    if (
      semanticResult.predicted_bias_type &&
      semanticResult.confidence > SEMANTIC_BIAS_CONFIDENCE_THRESHOLD
    ) {
      verifiedEvents.push({
        type: 'bias_shift',
        description: `Semantic bias detected: ${semanticResult.predicted_bias_type} (${(semanticResult.confidence * 100).toFixed(0)}% confidence)`,
        evidence: { grokipedia: semanticResult.sentence },
        severity: semanticResult.confidence > 0.8 ? 3 : 2,
        category: 'bias',
        tags: ['semantic_only', semanticResult.predicted_bias_type],
      });
    }
  });

  return verifiedEvents;
};

const detectBiasEvents = async (
  extraSentences: string[],
  wikiText: string,
  enableSemantic: boolean,
): Promise<DiscrepancyRecord[]> => {
  if (!enableSemantic) {
    return detectBiasEventsKeywordOnly(extraSentences, wikiText);
  }
  try {
    return await detectBiasEventsHybrid(extraSentences, wikiText);
  } catch (error) {
    console.warn('[analyzer] Semantic bias detection failed, falling back to keyword-only:', error);
    return detectBiasEventsKeywordOnly(extraSentences, wikiText);
  }
};

const detectHallucinationEvents = (
  extraSentences: string[],
  wikiClaims: StructuredClaim[],
): DiscrepancyRecord[] => {
  const speculativeKeywords = [
    'apparently',
    'reportedly',
    'rumored',
    'rumoured',
    'supposedly',
    'allegedly',
    'unverified',
    'unconfirmed',
    'citation needed',
    'claimed to be',
    'claims to be',
    'some say',
    'some believe',
    'it is said',
    'it is believed',
    'according to rumors',
    'according to rumours',
    'may have',
    'might have',
    'possibly',
    'perhaps',
    'uncertain',
  ];

  const wikiFactsLower = wikiClaims
    .map((claim) => normalizeSentence(claim.text))
    .filter((text) => text.length > MIN_SENTENCE_LENGTH);

  const results: DiscrepancyRecord[] = [];

  extraSentences.forEach((sentence) => {
    const hasSpeculativeWords = speculativeKeywords.some((keyword) =>
      sentence.toLowerCase().includes(keyword),
    );

    if (!hasSpeculativeWords) {
      return;
    }

    const hasConflict = wikiFactsLower.some((wikiFact) => {
      const similarity = stringSimilarity.compareTwoStrings(normalizeSentence(sentence), wikiFact);
      return similarity > HALLUCINATION_SIMILARITY_MIN && similarity < HALLUCINATION_SIMILARITY_MAX;
    });

    if (hasSpeculativeWords && (hasConflict || wikiFactsLower.length === 0)) {
      results.push({
        type: 'hallucination' as const,
        description: 'Grokipedia uses speculative or unverified language.',
        evidence: { grokipedia: sentence },
        severity: 4,
        category: 'hallucination',
        tags: ['speculative_language'],
      });
    }
  });

  return results;
};

const shingle = (tokens: string[], size: number): Set<string> => {
  if (tokens.length === 0) {
    return new Set<string>();
  }
  if (tokens.length <= size) {
    return new Set<string>([tokens.join(' ')]);
  }
  const window = new Set<string>();
  for (let i = 0; i <= tokens.length - size; i += 1) {
    window.add(tokens.slice(i, i + size).join(' '));
  }
  return window;
};

const shingleOverlap = (wiki: string, grok: string): number => {
  const wikiTokens = tokenize(wiki);
  const grokTokens = tokenize(grok);
  if (!wikiTokens.length && !grokTokens.length) {
    return 1;
  }
  const wikiSet = shingle(wikiTokens, SHINGLE_SIZE);
  const grokSet = shingle(grokTokens, SHINGLE_SIZE);
  const union = new Set<string>([...wikiSet, ...grokSet]);
  if (union.size === 0) {
    return 0;
  }
  let intersect = 0;
  wikiSet.forEach((token) => {
    if (grokSet.has(token)) {
      intersect += 1;
    }
  });
  return Number((intersect / union.size).toFixed(4));
};

interface MatchCandidate {
  sentence: string;
  similarity: number;
}

const detectRewordedSentences = (
  missingSentences: string[],
  grokSentences: string[],
): Array<{ wikipedia: string; grokipedia: string; similarity: number }> => {
  const reworded: Array<{ wikipedia: string; grokipedia: string; similarity: number }> = [];

  const validMissing = missingSentences.filter((s) => s.length > MIN_SENTENCE_LENGTH);
  const validGrok = grokSentences.filter((s) => s.length > MIN_SENTENCE_LENGTH);

  validMissing.forEach((wikiSentence) => {
    let bestMatch: MatchCandidate | null = null;

    validGrok.forEach((grokSentence) => {
      const similarity = stringSimilarity.compareTwoStrings(
        normalizeSentence(wikiSentence),
        normalizeSentence(grokSentence),
      );

      if (similarity >= REWORD_SIMILARITY_THRESHOLD && similarity < 1.0) {
        if (!bestMatch || similarity > bestMatch.similarity) {
          bestMatch = { sentence: grokSentence, similarity };
        }
      }
    });

    if (bestMatch !== null) {
      const match: MatchCandidate = bestMatch;
      reworded.push({
        wikipedia: wikiSentence,
        grokipedia: match.sentence,
        similarity: Number(match.similarity.toFixed(3)),
      });
    }
  });

  return reworded;
};

const detectAgreedSentences = (wikiSentences: string[], grokSentences: string[]): string[] => {
  const grokSet = new Set(
    grokSentences.filter((s) => s.length > MIN_SENTENCE_LENGTH).map(normalizeSentence),
  );

  return wikiSentences.filter((wikiSentence) => {
    if (wikiSentence.length <= MIN_SENTENCE_LENGTH) {
      return false;
    }
    return grokSet.has(normalizeSentence(wikiSentence));
  });
};

const detectFactualErrors = (
  claimAlignment: ClaimAlignmentRecord[],
  numericDiscrepancies: NumericDiscrepancy[],
  entityDiscrepancies: EntityDiscrepancy[],
): DiscrepancyRecord[] => {
  const errors: DiscrepancyRecord[] = [];

  numericDiscrepancies.forEach((discrepancy) => {
    if (discrepancy.relative_difference >= 0.2) {
      errors.push({
        type: 'factual_error',
        description: `Significant numeric discrepancy: ${discrepancy.description}`,
        evidence: {
          wikipedia: discrepancy.wikipedia_value?.raw,
          grokipedia: discrepancy.grokipedia_value?.raw,
        },
        severity: 5,
        category: 'factual',
        tags: ['numeric_mismatch'],
      });
    }
  });

  entityDiscrepancies.forEach((discrepancy) => {
    const missingEntities = discrepancy.wikipedia_entities.filter(
      (entity) => !discrepancy.grokipedia_entities.includes(entity),
    );
    const extraEntities = discrepancy.grokipedia_entities.filter(
      (entity) => !discrepancy.wikipedia_entities.includes(entity),
    );

    const totalDiff = missingEntities.length + extraEntities.length;
    if (totalDiff > 1) {
      errors.push({
        type: 'factual_error',
        description: `Entity discrepancy: Wikipedia mentions [${missingEntities.join(', ')}], Grokipedia adds [${extraEntities.join(', ')}]`,
        evidence: {
          wikipedia: missingEntities.join(', '),
          grokipedia: extraEntities.join(', '),
        },
        severity: 3,
        category: 'factual',
        tags: ['entity_mismatch'],
      });
    }
  });

  claimAlignment.forEach((alignment) => {
    if (
      alignment.wikipedia &&
      alignment.grokipedia &&
      alignment.similarity < 0.3 &&
      alignment.similarity > 0
    ) {
      errors.push({
        type: 'factual_error',
        description: 'Claims are semantically divergent despite topic alignment.',
        evidence: {
          wikipedia: alignment.wikipedia.text,
          grokipedia: alignment.grokipedia.text,
        },
        severity: 3,
        category: 'factual',
        tags: ['semantic_divergence'],
      });
    }
  });

  return errors;
};

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

const classifyDocument = (
  wordSimilarity: number,
  sentenceSimilarity: number,
  overlap: number,
  trulyMissingCount: number,
  extraCount: number,
  biasEvents: number,
  hallucinationEvents: number,
  factualErrors: number,
  agreementCount: number,
  _rewordedCount: number,
  sectionAlignment: number,
): ConfidenceSummary => {
  const rationales: string[] = [];

  let score = 1.0 - sentenceSimilarity;

  if (sentenceSimilarity > 0.95) {
    const penalty = (sentenceSimilarity - 0.95) * 2;
    score -= penalty;
    rationales.push(
      `Extreme sentence similarity (${(sentenceSimilarity * 100).toFixed(1)}%) indicates blatant copying`,
    );
  } else if (sentenceSimilarity > 0.8) {
    const penalty = sentenceSimilarity - 0.8;
    score -= penalty;
    rationales.push(
      `Very high sentence similarity (${(sentenceSimilarity * 100).toFixed(1)}%) suggests extensive copying`,
    );
  } else if (sentenceSimilarity > 0.5) {
    const penalty = (sentenceSimilarity - 0.5) * 0.5;
    score -= penalty;
    rationales.push(
      `High sentence similarity (${(sentenceSimilarity * 100).toFixed(1)}%) indicates significant overlap`,
    );
  } else if (sentenceSimilarity < 0.1) {
    const boost = Math.min(0.3, (0.1 - sentenceSimilarity) * 2);
    score += boost;
    rationales.push(
      `Very low sentence similarity (${(sentenceSimilarity * 100).toFixed(1)}%) shows strong independence`,
    );
  }

  if (wordSimilarity > 0.95 && sentenceSimilarity < 0.5) {
    const penalty = (wordSimilarity - 0.95) * 0.5;
    score -= penalty;
    rationales.push(
      `Extreme word similarity (${(wordSimilarity * 100).toFixed(1)}%) despite low sentence match suggests paraphrasing`,
    );
  } else if (wordSimilarity < 0.5) {
    const boost = Math.min(0.1, (0.5 - wordSimilarity) * 0.3);
    score += boost;
    rationales.push(
      `Low word similarity (${(wordSimilarity * 100).toFixed(1)}%) shows original vocabulary`,
    );
  }

  if (sectionAlignment >= 0.95) {
    const penalty = Math.min(0.05, (sectionAlignment - 0.9) * 0.5);
    score -= penalty;
    rationales.push(
      `Identical section structure (${(sectionAlignment * 100).toFixed(1)}%) suggests copying`,
    );
  } else if (sectionAlignment < 0.3) {
    const boost = Math.min(0.05, (0.3 - sectionAlignment) * 0.2);
    score += boost;
    rationales.push(
      `Different section structure (${(sectionAlignment * 100).toFixed(1)}%) shows independence`,
    );
  }

  if (agreementCount > 100) {
    const penalty = Math.min(0.15, agreementCount * 0.0003);
    score -= penalty;
    rationales.push(`${agreementCount} identical sentences suggest extensive copying`);
  }

  if (extraCount > 50) {
    const boost = Math.min(0.1, extraCount * 0.0001);
    score += boost;
    rationales.push(`${extraCount} unique Grokipedia sentences show original content`);
  }

  if (trulyMissingCount > 50) {
    const boost = Math.min(0.05, trulyMissingCount * 0.00005);
    score += boost;
    rationales.push(
      `${trulyMissingCount} Wikipedia sentences omitted (shows editorial independence)`,
    );
  }

  if (factualErrors > 0) {
    score -= factualErrors * 0.03;
    rationales.push(`${factualErrors} factual errors detected`);
  }

  if (biasEvents > 0) {
    score -= biasEvents * 0.01;
    rationales.push(`${biasEvents} bias cues detected`);
  }

  if (hallucinationEvents > 0) {
    score -= hallucinationEvents * 0.025;
    rationales.push(`${hallucinationEvents} hallucination cues detected`);
  }

  const label: ConfidenceLabel =
    sentenceSimilarity >= CLASSIFICATION_THRESHOLDS.aligned.similarity &&
    overlap >= CLASSIFICATION_THRESHOLDS.aligned.ngram &&
    factualErrors === 0
      ? 'aligned'
      : sentenceSimilarity >= CLASSIFICATION_THRESHOLDS.possible.similarity &&
          overlap >= CLASSIFICATION_THRESHOLDS.possible.ngram
        ? 'possible_divergence'
        : 'suspected_divergence';

  if (label === 'aligned' && rationales.length === 0) {
    rationales.push('High similarity and n-gram overlap');
  }

  return {
    label,
    score: Number(clamp(score).toFixed(3)),
    rationale: rationales,
  };
};

const makePreview = (sentence: string): string => {
  const words = sentence.split(/\s+/).filter(Boolean);
  if (words.length <= HIGHLIGHT_WINDOW * 2) {
    return sentence;
  }
  const head = words.slice(0, HIGHLIGHT_WINDOW).join(' ');
  const tail = words.slice(-HIGHLIGHT_WINDOW).join(' ');
  return `${head} … ${tail}`;
};

const buildHighlights = (
  sentences: string[],
  source: HighlightSnippet['source'],
  tag: HighlightSnippet['tag'],
): HighlightSnippet[] =>
  sentences.map((text) => ({
    source,
    tag,
    text,
    preview: makePreview(text),
  }));

const buildDiscrepancies = (
  trulyMissing: string[],
  extra: string[],
  missingSections: string[],
  extraSections: string[],
  missingCitations: string[],
  extraCitations: string[],
  reworded: Array<{ wikipedia: string; grokipedia: string; similarity: number }>,
  bias: DiscrepancyRecord[],
  hallucinations: DiscrepancyRecord[],
  factualErrors: DiscrepancyRecord[],
): DiscrepancyRecord[] => {
  const issues: DiscrepancyRecord[] = [];
  trulyMissing.forEach((sentence) =>
    issues.push({
      type: 'missing_context',
      description: 'Sentence present on Wikipedia but truly absent on Grokipedia.',
      evidence: { wikipedia: sentence },
    }),
  );
  extra.forEach((sentence) =>
    issues.push({
      type: 'added_claim',
      description: 'Sentence present on Grokipedia but absent on Wikipedia.',
      evidence: { grokipedia: sentence },
    }),
  );
  reworded.forEach((pair) =>
    issues.push({
      type: 'reworded_claim',
      description: `Sentence reworded (${(pair.similarity * 100).toFixed(0)}% similar).`,
      evidence: { wikipedia: pair.wikipedia, grokipedia: pair.grokipedia },
      severity: 2,
      category: 'rewording',
    }),
  );
  missingSections.forEach((section) =>
    issues.push({
      type: 'section_missing',
      description: `Section "${section}" exists on Wikipedia but not on Grokipedia.`,
      evidence: { wikipedia: section },
      category: 'structure',
    }),
  );
  extraSections.forEach((section) =>
    issues.push({
      type: 'section_extra',
      description: `Grokipedia adds a section "${section}" not found on Wikipedia.`,
      evidence: { grokipedia: section },
      category: 'structure',
    }),
  );
  missingCitations.forEach((url) =>
    issues.push({
      type: 'missing_citation',
      description: 'Citation present on Wikipedia is missing on Grokipedia.',
      evidence: { wikipedia: url },
      category: 'citation',
    }),
  );
  extraCitations.forEach((url) =>
    issues.push({
      type: 'added_citation',
      description: 'Grokipedia introduces an uncited reference not present on Wikipedia.',
      evidence: { grokipedia: url },
      category: 'citation',
    }),
  );
  return [...issues, ...bias, ...hallucinations, ...factualErrors];
};

export const analyzeContent = async (
  topic: Topic,
  wiki: AnalyzerSource,
  grok: AnalyzerSource,
  options: AnalyzerOptions = {},
): Promise<AnalysisPayload> => {
  const wikiText = wiki.text;
  const grokText = grok.text;

  const ngramScore = shingleOverlap(wikiText, grokText);
  const wikiSentences = wiki.content.sentences;
  const grokSentences = grok.content.sentences;
  const wikiSentenceCount = wikiSentences.length;
  const grokSentenceCount = grokSentences.length;

  const wikiNormSentences = wikiSentences.map(normalizeSentence);
  const grokNormSentences = grokSentences.map(normalizeSentence);

  const missingAll = wikiSentences.filter((_sentence, idx) => {
    const norm = wikiNormSentences[idx];
    return !grokNormSentences.some(
      (grokNorm) => grokNorm === norm || grokNorm.includes(norm) || norm.includes(grokNorm),
    );
  });

  const extraAll = grokSentences.filter((_sentence, idx) => {
    const norm = grokNormSentences[idx];
    return !wikiNormSentences.some(
      (wikiNorm) => wikiNorm === norm || wikiNorm.includes(norm) || norm.includes(wikiNorm),
    );
  });

  const agreedSentences = detectAgreedSentences(wikiSentences, grokSentences);
  const rewordedPairs = detectRewordedSentences(missingAll, grokSentences);

  const wordSimilarity = wordSimilarityRatio(wikiText, grokText);
  const sentenceSimilarity = sentenceSimilarityRatio(wikiSentences, grokSentences);
  const rewordedWikiSentences = new Set(rewordedPairs.map((pair) => pair.wikipedia));
  const trulyMissingAll = missingAll.filter((sentence) => !rewordedWikiSentences.has(sentence));

  const missing = missingAll;
  const extra = extraAll;
  const trulyMissing = trulyMissingAll;
  const reworded = rewordedPairs;
  const agreed = agreedSentences;

  const wikiSections = wiki.content.sections;
  const grokSections = grok.content.sections;
  const missingSections = difference(wikiSections, grokSections);
  const extraSections = difference(grokSections, wikiSections);

  const missingCitations = difference(wiki.content.citations, grok.content.citations);
  const extraCitations = difference(grok.content.citations, wiki.content.citations);

  const sectionAlignment = alignSections(wiki.article, grok.article);
  const claimAlignment = alignClaims(wiki.article, grok.article);
  const numericDiscrepancies = detectNumericDiscrepancies(claimAlignment);
  const entityDiscrepancies = detectEntityDiscrepancies(claimAlignment);

  const semanticBiasEnabled = options.semanticBias === true;
  const biasEvents = await detectBiasEvents(extra, wikiText, semanticBiasEnabled);
  const hallucinationEvents = detectHallucinationEvents(extra, wiki.content.claims);
  const factualErrors = detectFactualErrors(
    claimAlignment,
    numericDiscrepancies,
    entityDiscrepancies,
  );

  const sectionSimilarityAvg =
    sectionAlignment.length > 0
      ? sectionAlignment.reduce((sum, rec) => sum + rec.similarity, 0) / sectionAlignment.length
      : 0;

  const confidence = classifyDocument(
    wordSimilarity,
    sentenceSimilarity,
    ngramScore,
    trulyMissingAll.length,
    extraAll.length,
    biasEvents.length,
    hallucinationEvents.length,
    factualErrors.length,
    agreedSentences.length,
    rewordedPairs.length,
    sectionSimilarityAvg,
  );

  const missingHighlights = buildHighlights(missing, 'wikipedia', 'missing');
  const extraHighlights = [
    ...buildHighlights(extra, 'grokipedia', 'extra'),
    ...buildHighlights(
      biasEvents
        .map((event) => event.evidence?.grokipedia)
        .filter((sentence): sentence is string => Boolean(sentence)),
      'grokipedia',
      'bias',
    ),
    ...buildHighlights(
      hallucinationEvents
        .map((event) => event.evidence?.grokipedia)
        .filter((sentence): sentence is string => Boolean(sentence)),
      'grokipedia',
      'hallucination',
    ),
  ];

  const biasMetrics = computeBiasMetrics(wiki.text, grok.text);
  const generatedAt = new Date().toISOString();
  const contentHash = options.contentHash ?? computeContentHash(wiki.text, grok.text);

  return {
    topic_id: topic.id,
    title: topic.title,
    stats: {
      wiki_char_count: wikiText.length,
      grok_char_count: grokText.length,
      similarity_ratio: {
        word: wordSimilarity,
        sentence: sentenceSimilarity,
      },
      wiki_sentence_count: wikiSentenceCount,
      grok_sentence_count: grokSentenceCount,
      missing_sentence_total: missingAll.length,
      extra_sentence_total: extraAll.length,
      reworded_sentence_count: rewordedPairs.length,
      truly_missing_count: trulyMissingAll.length,
      agreement_count: agreedSentences.length,
    },
    ngram_overlap: ngramScore,
    missing_sentences: missing,
    extra_sentences: extra,
    reworded_sentences: reworded,
    truly_missing_sentences: trulyMissing,
    agreed_sentences: agreed,
    sections_missing: missingSections,
    sections_extra: extraSections,
    citations: {
      missing: missingCitations,
      extra: extraCitations,
    },
    diff_sample: diffSample(wikiText, grokText, topic.id),
    discrepancies: buildDiscrepancies(
      trulyMissing,
      extra,
      missingSections,
      extraSections,
      missingCitations,
      extraCitations,
      reworded,
      biasEvents,
      hallucinationEvents,
      factualErrors,
    ),
    bias_events: biasEvents,
    hallucination_events: hallucinationEvents,
    factual_errors: factualErrors,
    confidence,
    highlights: {
      missing: missingHighlights,
      extra: extraHighlights,
    },
    updated_at: generatedAt,
    meta: {
      analyzer_version: ANALYZER_VERSION,
      content_hash: contentHash,
      generated_at: generatedAt,
      cache_ttl_hours: CACHE_TTL_HOURS,
      shingle_size: SHINGLE_SIZE,
      analysis_window: {
        wiki_analyzed_chars: wiki.text.length,
        grok_analyzed_chars: grok.text.length,
        source_note: 'Analyzed text reconstructed from structured sections, not raw article text',
      },
    },
    section_alignment: sectionAlignment,
    claim_alignment: claimAlignment,
    numeric_discrepancies: numericDiscrepancies,
    entity_discrepancies: entityDiscrepancies,
    bias_metrics: biasMetrics,
  };
};
