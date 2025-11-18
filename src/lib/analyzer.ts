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

const normalizeWhitespace = (text: string): string => text.replace(/\s+/g, ' ').trim();

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

const wordSimilarityRatio = (a: string, b: string): number => {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (!tokensA.length && !tokensB.length) {
    return 1;
  }
  if (!tokensA.length || !tokensB.length) {
    return 0;
  }
  const [shorter, longer] =
    tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];
  const longerSet = new Set(longer);
  let overlap = 0;
  shorter.forEach((token) => {
    if (longerSet.has(token)) {
      overlap += 1;
    }
  });
  return Number((overlap / Math.max(tokensA.length, tokensB.length)).toFixed(4));
};

const sentenceSimilarityRatio = (
  wikiSentences: string[],
  grokSentences: string[],
  agreedCount: number,
  rewordedCount: number,
): number => {
  const totalSentences = Math.max(wikiSentences.length, grokSentences.length);
  if (totalSentences === 0) {
    return 1;
  }

  const matchScore = agreedCount + rewordedCount * 0.5;
  return Number((matchScore / totalSentences).toFixed(4));
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

  article.sections.forEach((section: StructuredSection) => {
    section.paragraphs.forEach((para: StructuredParagraph) => {
      const sentences = para.sentences.map((s: StructuredSentence) => s.text).join(' ');
      if (sentences.trim()) {
        parts.push(sentences);
      }
    });
  });

  return parts.join('\n');
};

const buildContentFromStructured = (
  article: StructuredArticle,
  fallbackText: string,
): ArticleContent => {
  const leadSentences = collectStructuredSentences(article.lead.paragraphs);
  const sectionSentences = article.sections.flatMap((section: StructuredSection) =>
    collectStructuredSentences(section.paragraphs),
  );
  const sentences = [...leadSentences, ...sectionSentences];
  const sections = article.sections
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

const detectBiasEvents = (extraSentences: string[], wikiText: string): DiscrepancyRecord[] => {
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
  similarity: number,
  overlap: number,
  trulyMissingCount: number,
  extraCount: number,
  biasEvents: number,
  hallucinationEvents: number,
  factualErrors: number,
  agreementCount: number,
  rewordedCount: number,
): ConfidenceSummary => {
  const rationales: string[] = [];
  let score = (similarity + overlap) / 2;

  if (agreementCount > 0) {
    const boost = Math.min(0.1, agreementCount * 0.01);
    score += boost;
    rationales.push(`${agreementCount} sentences match exactly between sources`);
  }

  if (rewordedCount > 0) {
    rationales.push(`${rewordedCount} sentences reworded but semantically similar`);
  }

  if (trulyMissingCount > 0) {
    const delta = Math.min(0.25, trulyMissingCount * 0.03);
    score -= delta;
    rationales.push(`${trulyMissingCount} Wikipedia sentences truly missing on Grokipedia`);
  }

  if (extraCount > 0) {
    const delta = Math.min(0.2, extraCount * 0.025);
    score -= delta;
    rationales.push(`${extraCount} Grokipedia sentences not found on Wikipedia`);
  }

  if (factualErrors > 0) {
    score -= 0.15;
    rationales.push(`${factualErrors} factual errors detected`);
  }

  if (biasEvents > 0) {
    score -= 0.1;
    rationales.push(`${biasEvents} bias cues detected`);
  }

  if (hallucinationEvents > 0) {
    score -= 0.12;
    rationales.push(`${hallucinationEvents} hallucination cues detected`);
  }

  const label: ConfidenceLabel =
    similarity >= CLASSIFICATION_THRESHOLDS.aligned.similarity &&
    overlap >= CLASSIFICATION_THRESHOLDS.aligned.ngram &&
    factualErrors === 0
      ? 'aligned'
      : similarity >= CLASSIFICATION_THRESHOLDS.possible.similarity &&
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

export const analyzeContent = (
  topic: Topic,
  wiki: AnalyzerSource,
  grok: AnalyzerSource,
  options: AnalyzerOptions = {},
): AnalysisPayload => {
  const wikiText = wiki.text;
  const grokText = grok.text;

  const ngramScore = shingleOverlap(wikiText, grokText);
  const wikiSentences = wiki.content.sentences;
  const grokSentences = grok.content.sentences;
  const wikiSentenceCount = wikiSentences.length;
  const grokSentenceCount = grokSentences.length;

  const wikiSet = new Set<string>(wikiSentences);
  const grokSet = new Set<string>(grokSentences);

  const missingAll = wikiSentences.filter((sentence) => !grokSet.has(sentence));
  const extraAll = grokSentences.filter((sentence) => !wikiSet.has(sentence));

  const agreedSentences = detectAgreedSentences(wikiSentences, grokSentences);
  const rewordedPairs = detectRewordedSentences(missingAll, grokSentences);

  const wordSimilarity = wordSimilarityRatio(wikiText, grokText);
  const sentenceSimilarity = sentenceSimilarityRatio(
    wikiSentences,
    grokSentences,
    agreedSentences.length,
    rewordedPairs.length,
  );
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

  const biasEvents = detectBiasEvents(extra, wikiText);
  const hallucinationEvents = detectHallucinationEvents(extra, wiki.content.claims);
  const factualErrors = detectFactualErrors(
    claimAlignment,
    numericDiscrepancies,
    entityDiscrepancies,
  );

  const confidence = classifyDocument(
    wordSimilarity,
    ngramScore,
    trulyMissingAll.length,
    extraAll.length,
    biasEvents.length,
    hallucinationEvents.length,
    factualErrors.length,
    agreedSentences.length,
    rewordedPairs.length,
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
