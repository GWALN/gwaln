/**
 * @file tests/confidence.test.ts
 * @description Tests for confidence score calculation logic
 */

import { describe, it, expect } from 'vitest';

type ConfidenceSummary = {
  label: string;
  score: number;
  rationale: string[];
};

function calculateConfidence(
  similarity: number,
  overlap: number,
  trulyMissingCount: number,
  extraCount: number,
  factualErrors: number,
  agreementCount: number,
  rewordedCount: number,
): ConfidenceSummary {
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
    const penalty = Math.min(0.3, factualErrors * 0.05);
    score -= penalty;
    rationales.push(`${factualErrors} factual errors detected`);
  }

  score = Math.max(0, Math.min(1, score));

  let label = 'high_confidence';
  if (score < 0.3) label = 'suspected_divergence';
  else if (score < 0.5) label = 'low_confidence';
  else if (score < 0.7) label = 'moderate_confidence';

  return { label, score, rationale: rationales };
}

describe('Confidence Score Calculation', () => {
  describe('Perfect Match Scenarios', () => {
    it('should return high confidence (1.0) for perfect similarity with no issues', () => {
      const result = calculateConfidence(1.0, 1.0, 0, 0, 0, 0, 0);

      expect(result.score).toBe(1.0);
      expect(result.label).toBe('high_confidence');
      expect(result.rationale).toHaveLength(0);
    });

    it('should boost score with exact sentence matches', () => {
      const result = calculateConfidence(0.8, 0.8, 0, 0, 0, 10, 0);

      expect(result.score).toBe(0.9);
      expect(result.label).toBe('high_confidence');
      expect(result.rationale).toContain('10 sentences match exactly between sources');
    });

    it('should cap agreement boost at 0.1', () => {
      const result = calculateConfidence(0.8, 0.8, 0, 0, 0, 100, 0);

      expect(result.score).toBe(0.9);
    });
  });

  describe('Low Similarity Scenarios', () => {
    it('should return suspected divergence for very low similarity', () => {
      const result = calculateConfidence(0.0013, 0.0056, 673, 768, 3, 0, 2);

      expect(result.score).toBe(0);
      expect(result.label).toBe('suspected_divergence');
      expect(result.rationale).toContain('673 Wikipedia sentences truly missing on Grokipedia');
      expect(result.rationale).toContain('768 Grokipedia sentences not found on Wikipedia');
      expect(result.rationale).toContain('3 factual errors detected');
    });

    it('should classify as low_confidence for scores between 0.3 and 0.5', () => {
      const result = calculateConfidence(0.5, 0.5, 5, 0, 0, 0, 0);

      expect(result.score).toBe(0.35);
      expect(result.label).toBe('low_confidence');
    });

    it('should classify as moderate_confidence for scores between 0.5 and 0.7', () => {
      const result = calculateConfidence(0.6, 0.6, 0, 0, 0, 0, 0);

      expect(result.score).toBe(0.6);
      expect(result.label).toBe('moderate_confidence');
    });
  });

  describe('Missing Sentences Impact', () => {
    it('should penalize missing sentences up to 0.25', () => {
      const result = calculateConfidence(0.8, 0.8, 10, 0, 0, 0, 0);

      expect(result.score).toBeCloseTo(0.55, 2);
      expect(result.label).toBe('moderate_confidence');
    });

    it('should cap missing sentences penalty at 0.25', () => {
      const result = calculateConfidence(0.8, 0.8, 100, 0, 0, 0, 0);

      expect(result.score).toBeCloseTo(0.55, 2);
    });
  });

  describe('Extra Sentences Impact', () => {
    it('should penalize extra sentences up to 0.2', () => {
      const result = calculateConfidence(0.8, 0.8, 0, 10, 0, 0, 0);

      expect(result.score).toBeCloseTo(0.6, 2);
    });

    it('should cap extra sentences penalty at 0.2', () => {
      const result = calculateConfidence(0.8, 0.8, 0, 100, 0, 0, 0);

      expect(result.score).toBeCloseTo(0.6, 2);
    });
  });

  describe('Factual Errors Impact', () => {
    it('should heavily penalize factual errors', () => {
      const result = calculateConfidence(0.8, 0.8, 0, 0, 5, 0, 0);

      expect(result.score).toBeCloseTo(0.55, 2);
    });

    it('should cap factual error penalty at 0.3', () => {
      const result = calculateConfidence(0.8, 0.8, 0, 0, 10, 0, 0);

      expect(result.score).toBeCloseTo(0.5, 2);
    });
  });

  describe('Combined Scenarios', () => {
    it('should handle mixed good and bad signals', () => {
      const result = calculateConfidence(0.7, 0.7, 5, 3, 1, 5, 2);

      expect(result.score).toBeCloseTo(0.475, 2);
      expect(result.label).toBe('low_confidence');
      expect(result.rationale).toContain('5 sentences match exactly between sources');
      expect(result.rationale).toContain('2 sentences reworded but semantically similar');
      expect(result.rationale).toContain('5 Wikipedia sentences truly missing on Grokipedia');
    });

    it('should never go below 0', () => {
      const result = calculateConfidence(0.1, 0.1, 100, 100, 10, 0, 0);

      expect(result.score).toBe(0);
    });

    it('should never go above 1', () => {
      const result = calculateConfidence(0.95, 0.95, 0, 0, 0, 20, 0);

      expect(result.score).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero similarity with no other issues', () => {
      const result = calculateConfidence(0, 0, 0, 0, 0, 0, 0);

      expect(result.score).toBe(0);
      expect(result.label).toBe('suspected_divergence');
    });

    it('should handle all zeros except similarity', () => {
      const result = calculateConfidence(0.5, 0, 0, 0, 0, 0, 0);

      expect(result.score).toBe(0.25);
      expect(result.label).toBe('suspected_divergence');
    });

    it('should include reworded rationale without score change', () => {
      const result = calculateConfidence(0.8, 0.8, 0, 0, 0, 0, 5);

      expect(result.score).toBe(0.8);
      expect(result.rationale).toContain('5 sentences reworded but semantically similar');
    });
  });

  describe('Label Boundaries', () => {
    it('should label 0.29 as suspected_divergence', () => {
      const result = calculateConfidence(0.58, 0, 0, 0, 0, 0, 0);
      expect(result.score).toBe(0.29);
      expect(result.label).toBe('suspected_divergence');
    });

    it('should label 0.30 as low_confidence', () => {
      const result = calculateConfidence(0.6, 0, 0, 0, 0, 0, 0);
      expect(result.score).toBe(0.3);
      expect(result.label).toBe('low_confidence');
    });

    it('should label 0.49 as low_confidence', () => {
      const result = calculateConfidence(0.98, 0, 0, 0, 0, 0, 0);
      expect(result.score).toBe(0.49);
      expect(result.label).toBe('low_confidence');
    });

    it('should label 0.50 as moderate_confidence', () => {
      const result = calculateConfidence(1.0, 0, 0, 0, 0, 0, 0);
      expect(result.score).toBe(0.5);
      expect(result.label).toBe('moderate_confidence');
    });

    it('should label 0.69 as moderate_confidence', () => {
      const result = calculateConfidence(1.0, 0.38, 0, 0, 0, 0, 0);
      expect(result.score).toBe(0.69);
      expect(result.label).toBe('moderate_confidence');
    });

    it('should label 0.70 as high_confidence', () => {
      const result = calculateConfidence(1.0, 0.4, 0, 0, 0, 0, 0);
      expect(result.score).toBe(0.7);
      expect(result.label).toBe('high_confidence');
    });
  });
});
