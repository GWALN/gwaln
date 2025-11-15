/**
 * @file src/lib/analyzer.ts
 * @description Core text comparison helpers shared by the CLI and tests.
 * @author Doğu Abaris <abaris@null.net>
 */

import {createTwoFilesPatch} from "diff";
import type {Topic} from "../shared/topics";
import {
    ANALYZER_VERSION,
    CACHE_TTL_HOURS,
    CLASSIFICATION_THRESHOLDS,
    HIGHLIGHT_WINDOW,
    SHINGLE_SIZE
} from "../shared/analyzer-config";
import {computeContentHash} from "../shared/content-hash";
import type {StructuredArticle, StructuredClaim} from "./wiki-structured";
import {biasCategories} from "./bias-lexicon";
import {alignSections, alignClaims, type SectionAlignmentRecord, type ClaimAlignmentRecord} from "./alignment";
import {
    detectNumericDiscrepancies,
    detectEntityDiscrepancies,
    type NumericDiscrepancy,
    type EntityDiscrepancy
} from "./discrepancies";
import {computeBiasMetrics, type BiasMetrics} from "./bias-metrics";

export type DiscrepancyType =
    | "missing_context"
    | "added_claim"
    | "section_missing"
    | "section_extra"
    | "missing_media"
    | "added_media"
    | "missing_citation"
    | "added_citation"
    | "bias_shift"
    | "hallucination";

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

export type ConfidenceLabel = "aligned" | "possible_divergence" | "suspected_divergence";

export interface ConfidenceSummary {
    label: ConfidenceLabel;
    score: number;
    rationale: string[];
}

export interface HighlightSnippet {
    source: "wikipedia" | "grokipedia";
    tag: "missing" | "extra" | "bias" | "hallucination";
    text: string;
    preview: string;
}

export type BiasVerificationVerdict = "confirm" | "reject" | "uncertain" | "error";

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
        similarity_ratio: number;
        wiki_sentence_count: number;
        grok_sentence_count: number;
        missing_sentence_total: number;
        extra_sentence_total: number;
    };
    ngram_overlap: number;
    missing_sentences: string[];
    extra_sentences: string[];
    sections_missing: string[];
    sections_extra: string[];
    media: {
        missing: string[];
        extra: string[];
    };
    citations: {
        missing: string[];
        extra: string[];
    };
    diff_sample: string[];
    discrepancies: DiscrepancyRecord[];
    bias_events: DiscrepancyRecord[];
    hallucination_events: DiscrepancyRecord[];
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
    status: "supported" | "unsupported" | "error";
    supporting_url?: string | null;
    message?: string;
}

export interface ArticleContent {
    sentences: string[];
    sections: string[];
    media: string[];
    citations: string[];
    claims: StructuredClaim[];
}

export interface AnalyzerSource {
    text: string;
    content: ArticleContent;
    article: StructuredArticle;
}

const normalizeWhitespace = (text: string): string => text.replace(/\s+/g, " ").trim();

const sentenceTokens = (text: string): string[] =>
    text
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => sentence.trim())
        .filter((sentence) => sentence.length > 40);

const tokenize = (text: string): string[] =>
    text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .filter(Boolean);

const similarityRatio = (a: string, b: string): number => {
    const tokensA = tokenize(a);
    const tokensB = tokenize(b);
    if (!tokensA.length && !tokensB.length) {
        return 1;
    }
    if (!tokensA.length || !tokensB.length) {
        return 0;
    }
    const [shorter, longer] = tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];
    const longerSet = new Set(longer);
    let overlap = 0;
    shorter.forEach((token) => {
        if (longerSet.has(token)) {
            overlap += 1;
        }
    });
    return Number((overlap / Math.max(tokensA.length, tokensB.length)).toFixed(4));
};

const diffSample = (wiki: string, grok: string, topicId: string): string[] => {
    const patch = createTwoFilesPatch(`${topicId}-wiki`, `${topicId}-grok`, wiki, grok, undefined, undefined, {context: 2});
    const lines = patch.split("\n");
    return lines.length > 120 ? [...lines.slice(0, 120), "... (diff truncated)"] : lines;
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
        paragraph.sentences.map((sentence) => sentence.text.trim()).filter((sentence) => sentence.length > 0)
    );

const buildContentFromStructured = (article: StructuredArticle, fallbackText: string): ArticleContent => {
    const leadSentences = collectStructuredSentences(article.lead.paragraphs);
    const sectionSentences = article.sections.flatMap((section) => collectStructuredSentences(section.paragraphs));
    const sentences = [...leadSentences, ...sectionSentences];
    const sections = article.sections
        .map((section) => section.heading?.trim())
        .filter((heading): heading is string => Boolean(heading && heading.length));
    const media = article.media
        .map((entry) => entry.title?.trim() || entry.media_id || entry.caption || "")
        .filter((entry): entry is string => entry.length > 0);
    const citations = article.references
        .map((reference) => reference.normalized.url ?? reference.name ?? reference.citation_id ?? reference.raw)
        .filter((value): value is string => Boolean(value))
        .map((value) => value.trim());
    return {
        sentences: sentences.length ? sentences : sentenceTokens(fallbackText),
        sections,
        media: uniqueList(media),
        citations: uniqueList(citations),
        claims: article.claims ?? []
    };
};

export const prepareAnalyzerSource = (article: StructuredArticle): AnalyzerSource => {
    const normalizedText = normalizeWhitespace(article.text ?? "");
    const content = buildContentFromStructured(article, normalizedText);
    return {
        text: normalizedText,
        content,
        article
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
                        type: "bias_shift",
                        description: `${category.label}: ${category.description} (${category.reference})`,
                        evidence: {grokipedia: sentence},
                        severity: category.severity,
                        category: "bias",
                        tags: [category.id, pattern.label]
                    });
                    seen.add(eventKey);
                }
            });
        });
    });
    return events;
};

const detectHallucinationEvents = (extraSentences: string[]): DiscrepancyRecord[] => {
    const keywords = ["apparently", "reportedly", "rumored", "supposedly", "allegedly", "unverified", "citation needed"];
    return extraSentences
        .filter((sentence) => keywords.some((keyword) => sentence.toLowerCase().includes(keyword)))
        .map((sentence) => ({
            type: "hallucination" as const,
            description: "Grokipedia introduces unverified or speculative claims.",
            evidence: {grokipedia: sentence},
            severity: 4,
            category: "hallucination",
            tags: ["unverified"]
        }));
};

const shingle = (tokens: string[], size: number): Set<string> => {
    if (tokens.length === 0) {
        return new Set<string>();
    }
    if (tokens.length <= size) {
        return new Set<string>([tokens.join(" ")]);
    }
    const window = new Set<string>();
    for (let i = 0; i <= tokens.length - size; i += 1) {
        window.add(tokens.slice(i, i + size).join(" "));
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

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

const classifyDocument = (
    similarity: number,
    overlap: number,
    missingCount: number,
    extraCount: number,
    biasEvents: number,
    hallucinationEvents: number
): ConfidenceSummary => {
    const rationales: string[] = [];
    let score = (similarity + overlap) / 2;
    if (missingCount > 0) {
        const delta = Math.min(0.25, missingCount * 0.03);
        score -= delta;
        rationales.push(`${missingCount} Wikipedia sentences missing on Grokipedia`);
    }
    if (extraCount > 0) {
        const delta = Math.min(0.2, extraCount * 0.025);
        score -= delta;
        rationales.push(`${extraCount} Grokipedia sentences not found on Wikipedia`);
    }
    if (biasEvents > 0) {
        score -= 0.1;
        rationales.push("Bias cues detected");
    }
    if (hallucinationEvents > 0) {
        score -= 0.12;
        rationales.push("Hallucination cues detected");
    }

    const label: ConfidenceLabel =
        similarity >= CLASSIFICATION_THRESHOLDS.aligned.similarity && overlap >= CLASSIFICATION_THRESHOLDS.aligned.ngram
            ? "aligned"
            : similarity >= CLASSIFICATION_THRESHOLDS.possible.similarity && overlap >= CLASSIFICATION_THRESHOLDS.possible.ngram
                ? "possible_divergence"
                : "suspected_divergence";

    if (label === "aligned" && rationales.length === 0) {
        rationales.push("High similarity and n-gram overlap");
    }

    return {
        label,
        score: Number(clamp(score).toFixed(3)),
        rationale: rationales
    };
};

const makePreview = (sentence: string): string => {
    const words = sentence.split(/\s+/).filter(Boolean);
    if (words.length <= HIGHLIGHT_WINDOW * 2) {
        return sentence;
    }
    const head = words.slice(0, HIGHLIGHT_WINDOW).join(" ");
    const tail = words.slice(-HIGHLIGHT_WINDOW).join(" ");
    return `${head} … ${tail}`;
};

const buildHighlights = (sentences: string[], source: HighlightSnippet["source"], tag: HighlightSnippet["tag"]): HighlightSnippet[] =>
    sentences.map((text) => ({
        source,
        tag,
        text,
        preview: makePreview(text)
    }));

const buildDiscrepancies = (
    missing: string[],
    extra: string[],
    missingSections: string[],
    extraSections: string[],
    missingMedia: string[],
    extraMedia: string[],
    missingCitations: string[],
    extraCitations: string[],
    bias: DiscrepancyRecord[],
    hallucinations: DiscrepancyRecord[]
): DiscrepancyRecord[] => {
    const issues: DiscrepancyRecord[] = [];
    missing.forEach((sentence) =>
        issues.push({
            type: "missing_context",
            description: "Sentence present on Wikipedia but absent on Grokipedia.",
            evidence: {wikipedia: sentence}
        })
    );
    extra.forEach((sentence) =>
        issues.push({
            type: "added_claim",
            description: "Sentence present on Grokipedia but absent on Wikipedia.",
            evidence: {grokipedia: sentence}
        })
    );
    missingSections.forEach((section) =>
        issues.push({
            type: "section_missing",
            description: `Section "${section}" exists on Wikipedia but not on Grokipedia.`,
            evidence: {wikipedia: section},
            category: "structure"
        })
    );
    extraSections.forEach((section) =>
        issues.push({
            type: "section_extra",
            description: `Grokipedia adds a section "${section}" not found on Wikipedia.`,
            evidence: {grokipedia: section},
            category: "structure"
        })
    );
    missingMedia.forEach((url) =>
        issues.push({
            type: "missing_media",
            description: "Media asset present on Wikipedia is missing on Grokipedia.",
            evidence: {wikipedia: url},
            category: "media"
        })
    );
    extraMedia.forEach((url) =>
        issues.push({
            type: "added_media",
            description: "Grokipedia includes an extra media asset not referenced on Wikipedia.",
            evidence: {grokipedia: url},
            category: "media"
        })
    );
    missingCitations.forEach((url) =>
        issues.push({
            type: "missing_citation",
            description: "Citation present on Wikipedia is missing on Grokipedia.",
            evidence: {wikipedia: url},
            category: "citation"
        })
    );
    extraCitations.forEach((url) =>
        issues.push({
            type: "added_citation",
            description: "Grokipedia introduces an uncited reference not present on Wikipedia.",
            evidence: {grokipedia: url},
            category: "citation"
        })
    );
    return [...issues, ...bias, ...hallucinations];
};

export const analyzeContent = (
    topic: Topic,
    wiki: AnalyzerSource,
    grok: AnalyzerSource,
    options: AnalyzerOptions = {}
): AnalysisPayload => {
    const wikiText = wiki.text;
    const grokText = grok.text;

    const ratio = similarityRatio(wikiText, grokText);
    const ngramScore = shingleOverlap(wikiText, grokText);
    const wikiSentences = wiki.content.sentences;
    const grokSentences = grok.content.sentences;
    const wikiSentenceCount = wikiSentences.length;
    const grokSentenceCount = grokSentences.length;

    const wikiSet = new Set<string>(wikiSentences);
    const grokSet = new Set<string>(grokSentences);

    const missingAll = wikiSentences.filter((sentence) => !grokSet.has(sentence));
    const extraAll = grokSentences.filter((sentence) => !wikiSet.has(sentence));
    const missing = missingAll.slice(0, 5);
    const extra = extraAll.slice(0, 5);

    const wikiSections = wiki.content.sections;
    const grokSections = grok.content.sections;
    const missingSections = difference(wikiSections, grokSections).slice(0, 5);
    const extraSections = difference(grokSections, wikiSections).slice(0, 5);

    const missingMedia = difference(wiki.content.media, grok.content.media).slice(0, 5);
    const extraMedia = difference(grok.content.media, wiki.content.media).slice(0, 5);

    const missingCitations = difference(wiki.content.citations, grok.content.citations).slice(0, 5);
    const extraCitations = difference(grok.content.citations, wiki.content.citations).slice(0, 5);

    const biasEvents = detectBiasEvents(extra, wikiText);
    const hallucinationEvents = detectHallucinationEvents(extra);

    const confidence = classifyDocument(
        ratio,
        ngramScore,
        missing.length,
        extra.length,
        biasEvents.length,
        hallucinationEvents.length
    );

    const missingHighlights = buildHighlights(missing, "wikipedia", "missing");
    const extraHighlights = [
        ...buildHighlights(extra, "grokipedia", "extra"),
        ...buildHighlights(
            biasEvents
                .map((event) => event.evidence?.grokipedia)
                .filter((sentence): sentence is string => Boolean(sentence)),
            "grokipedia",
            "bias"
        ),
        ...buildHighlights(
            hallucinationEvents
                .map((event) => event.evidence?.grokipedia)
                .filter((sentence): sentence is string => Boolean(sentence)),
            "grokipedia",
            "hallucination"
        )
    ];

    const sectionAlignment = alignSections(wiki.article, grok.article);
    const claimAlignment = alignClaims(wiki.article, grok.article);
    const numericDiscrepancies = detectNumericDiscrepancies(claimAlignment);
    const entityDiscrepancies = detectEntityDiscrepancies(claimAlignment);
    const biasMetrics = computeBiasMetrics(wiki.article.text, grok.article.text);
    const generatedAt = new Date().toISOString();
    const contentHash = options.contentHash ?? computeContentHash(wiki.text, grok.text);

    return {
        topic_id: topic.id,
        title: topic.title,
        stats: {
            wiki_char_count: wikiText.length,
            grok_char_count: grokText.length,
            similarity_ratio: ratio,
            wiki_sentence_count: wikiSentenceCount,
            grok_sentence_count: grokSentenceCount,
            missing_sentence_total: missingAll.length,
            extra_sentence_total: extraAll.length
        },
        ngram_overlap: ngramScore,
        missing_sentences: missing,
        extra_sentences: extra,
        sections_missing: missingSections,
        sections_extra: extraSections,
        media: {
            missing: missingMedia,
            extra: extraMedia
        },
        citations: {
            missing: missingCitations,
            extra: extraCitations
        },
        diff_sample: diffSample(wikiText, grokText, topic.id),
        discrepancies: buildDiscrepancies(
            missing,
            extra,
            missingSections,
            extraSections,
            missingMedia,
            extraMedia,
            missingCitations,
            extraCitations,
            biasEvents,
            hallucinationEvents
        ),
        bias_events: biasEvents,
        hallucination_events: hallucinationEvents,
        confidence,
        highlights: {
            missing: missingHighlights,
            extra: extraHighlights
        },
        updated_at: generatedAt,
        meta: {
            analyzer_version: ANALYZER_VERSION,
            content_hash: contentHash,
            generated_at: generatedAt,
            cache_ttl_hours: CACHE_TTL_HOURS,
            shingle_size: SHINGLE_SIZE
        },
        section_alignment: sectionAlignment,
        claim_alignment: claimAlignment,
        numeric_discrepancies: numericDiscrepancies,
        entity_discrepancies: entityDiscrepancies,
        bias_metrics: biasMetrics
    };
};
