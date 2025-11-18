/**
 * @file src/lib/alignment.ts
 * @description Utility helpers for aligning sections and claims between two structured articles.
 * @author Doğu Abaris <abaris@null.net>
 */

import stringSimilarity from 'string-similarity';
import type { StructuredArticle, StructuredClaim } from '../parsers/shared/types';

export interface SectionAlignmentRecord {
  wikipedia?: { section_id: string; heading: string };
  grokipedia?: { section_id: string; heading: string };
  similarity: number;
}

export interface ClaimAlignmentRecord {
  wikipedia?: StructuredClaim;
  grokipedia?: StructuredClaim;
  similarity: number;
}

const SECTION_THRESHOLD = 0.7;
const CLAIM_THRESHOLD = 0.65;

const normalizeHeading = (value: string): string => value.trim().toLowerCase();

export const alignSections = (
  wiki: StructuredArticle,
  grok: StructuredArticle,
): SectionAlignmentRecord[] => {
  const results: SectionAlignmentRecord[] = [];
  const usedGrok = new Set<string>();
  for (const section of wiki.sections) {
    const heading = section.heading ?? '';
    let best: { id: string; heading: string; similarity: number } | null = null;
    for (const candidate of grok.sections) {
      if (!candidate.heading) continue;
      if (usedGrok.has(candidate.section_id)) continue;
      const similarity = stringSimilarity.compareTwoStrings(
        normalizeHeading(heading),
        normalizeHeading(candidate.heading),
      );
      if (!best || similarity > best.similarity) {
        best = { id: candidate.section_id, heading: candidate.heading, similarity };
      }
    }
    const matched = best;
    if (matched && matched.similarity >= SECTION_THRESHOLD) {
      usedGrok.add(matched.id);
      results.push({
        wikipedia: { section_id: section.section_id, heading },
        grokipedia: { section_id: matched.id, heading: matched.heading },
        similarity: Number(matched.similarity.toFixed(3)),
      });
    } else {
      results.push({
        wikipedia: { section_id: section.section_id, heading },
        grokipedia: undefined,
        similarity: matched?.similarity ?? 0,
      });
    }
  }
  grok.sections.forEach((section: { section_id: string; heading?: string }) => {
    if (usedGrok.has(section.section_id)) return;
    results.push({
      wikipedia: undefined,
      grokipedia: { section_id: section.section_id, heading: section.heading ?? '' },
      similarity: 0,
    });
  });
  return results;
};

const compareClaims = (a: string, b: string): number =>
  stringSimilarity.compareTwoStrings(a.trim().toLowerCase(), b.trim().toLowerCase());

export const alignClaims = (
  wiki: StructuredArticle,
  grok: StructuredArticle,
): ClaimAlignmentRecord[] => {
  const wikiClaims = wiki.claims ?? [];
  const grokClaims = grok.claims ?? [];
  const used = new Set<string>();
  const alignments: ClaimAlignmentRecord[] = [];
  for (const claim of wikiClaims) {
    let best: { claim: StructuredClaim; similarity: number } | null = null;
    for (const candidate of grokClaims) {
      if (used.has(candidate.claim_id)) continue;
      const similarity = compareClaims(claim.text, candidate.text);
      if (!best || similarity > best.similarity) {
        best = { claim: candidate, similarity };
      }
    }
    if (best && best.similarity >= CLAIM_THRESHOLD) {
      used.add(best.claim.claim_id);
      alignments.push({
        wikipedia: claim,
        grokipedia: best.claim,
        similarity: Number(best.similarity.toFixed(3)),
      });
    } else {
      alignments.push({
        wikipedia: claim,
        grokipedia: undefined,
        similarity: best?.similarity ?? 0,
      });
    }
  }
  grokClaims.forEach((claim: StructuredClaim) => {
    if (used.has(claim.claim_id)) return;
    alignments.push({
      wikipedia: undefined,
      grokipedia: claim,
      similarity: 0,
    });
  });
  return alignments;
};
