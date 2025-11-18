/**
 * @file src/lib/discrepancies.ts
 * @description Helpers for extracting numeric/entity differences from aligned claims.
 * @author Doğu Abaris <abaris@null.net>
 */

import type { ClaimAlignmentRecord } from './alignment';

export interface NumericDiscrepancy {
  wikipedia_claim_id?: string;
  grokipedia_claim_id?: string;
  wikipedia_value?: { value: number; unit: string | null; raw: string } | null;
  grokipedia_value?: { value: number; unit: string | null; raw: string } | null;
  relative_difference: number;
  description: string;
}

export interface EntityDiscrepancy {
  wikipedia_claim_id?: string;
  grokipedia_claim_id?: string;
  wikipedia_entities: string[];
  grokipedia_entities: string[];
  description: string;
}

const relativeDiff = (a: number, b: number): number => {
  if (a === 0 && b === 0) return 0;
  if (a === 0 || b === 0) return 1;
  return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b));
};

const isComparableUnit = (a: string | null, b: string | null): boolean => {
  if (!a || !b) return false;
  return a === b;
};

export const detectNumericDiscrepancies = (
  alignments: ClaimAlignmentRecord[],
): NumericDiscrepancy[] => {
  const results: NumericDiscrepancy[] = [];
  alignments.forEach((record) => {
    if (!record.wikipedia || !record.grokipedia) return;
    const wNumbers = record.wikipedia.numbers ?? [];
    const gNumbers = record.grokipedia.numbers ?? [];
    if (!wNumbers.length || !gNumbers.length) return;
    const primaryW = wNumbers[0];
    const primaryG = gNumbers[0];
    if (primaryW.unit && primaryG.unit && !isComparableUnit(primaryW.unit, primaryG.unit)) {
      return;
    }
    const delta = relativeDiff(primaryW.value, primaryG.value);
    if (delta >= 0.05) {
      results.push({
        wikipedia_claim_id: record.wikipedia.claim_id,
        grokipedia_claim_id: record.grokipedia.claim_id,
        wikipedia_value: primaryW,
        grokipedia_value: primaryG,
        relative_difference: Number(delta.toFixed(3)),
        description: `Numeric discrepancy detected (${primaryW.raw} vs ${primaryG.raw}).`,
      });
    }
  });
  return results;
};

const normalizeEntity = (entity: { label: string; type: string | null }): string =>
  entity.label?.trim().toLowerCase() ?? '';

export const detectEntityDiscrepancies = (
  alignments: ClaimAlignmentRecord[],
): EntityDiscrepancy[] => {
  const discrepancies: EntityDiscrepancy[] = [];
  alignments.forEach((record) => {
    if (!record.wikipedia || !record.grokipedia) return;
    const wikiEntities = new Set(
      (record.wikipedia.entities ?? [])
        .map((entity: { label: string; type: string | null }) => normalizeEntity(entity))
        .filter((label: string) => label.length > 0),
    );
    const grokEntities = new Set(
      (record.grokipedia.entities ?? [])
        .map((entity: { label: string; type: string | null }) => normalizeEntity(entity))
        .filter((label: string) => label.length > 0),
    );
    const missing = Array.from(wikiEntities).filter((label) => !grokEntities.has(label));
    const extra = Array.from(grokEntities).filter((label) => !wikiEntities.has(label));
    if (missing.length || extra.length) {
      discrepancies.push({
        wikipedia_claim_id: record.wikipedia.claim_id,
        grokipedia_claim_id: record.grokipedia.claim_id,
        wikipedia_entities: Array.from(wikiEntities) as string[],
        grokipedia_entities: Array.from(grokEntities) as string[],
        description: 'Entity mismatch between Wikipedia and Grokipedia claims.',
      });
    }
  });
  return discrepancies;
};
