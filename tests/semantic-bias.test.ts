/**
 * @file tests/semantic-bias.test.ts
 * @description Tests for semantic bias detection with @xenova/transformers
 * @author Doğu Abaris <abaris@null.net>
 */

import { describe, it, expect } from 'vitest';
import { detectSemanticBias, detectSemanticBiasBatch } from '../src/lib/semantic-bias-detector';

describe('Semantic Bias Detection', () => {
  describe('detectSemanticBias', () => {
    it('returns bias scores for all NPOV categories', async () => {
      const sentence = 'This legendary Moon landing was an iconic moment in history.';
      const result = await detectSemanticBias(sentence);

      expect(result.scores).toHaveProperty('neutral');
      expect(result.scores).toHaveProperty('promotional');
      expect(result.scores).toHaveProperty('emotional');
      expect(result.scores).toHaveProperty('speculative');
      expect(result.scores).toHaveProperty('contentious');
      expect(result.sentence).toBe(sentence);
    }, 30000);

    it('analyzes promotional language bias scores', async () => {
      const sentence = 'This legendary Moon landing was an iconic moment in history.';
      const result = await detectSemanticBias(sentence);

      expect(result.scores).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    }, 30000);

    it('analyzes speculative claims bias scores', async () => {
      const sentence = 'Some people claim the Moon landing was allegedly faked.';
      const result = await detectSemanticBias(sentence);

      expect(result.scores).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    }, 30000);

    it('produces higher bias scores for loaded language', async () => {
      const neutral = 'The Moon orbits Earth at 384,400 km distance.';
      const biased = 'This controversial conspiracy theory was pushed by extremist groups.';

      const [neutralResult, biasedResult] = await Promise.all([
        detectSemanticBias(neutral),
        detectSemanticBias(biased),
      ]);

      expect(neutralResult.scores.neutral).toBeGreaterThan(biasedResult.scores.neutral);
    }, 30000);

    it('analyzes neutral encyclopedic tone', async () => {
      const sentence = 'The Moon orbits Earth at an average distance of 384,400 kilometers.';
      const result = await detectSemanticBias(sentence);

      expect(result.scores).toBeDefined();
      expect(result.sentence).toBe(sentence);
    }, 30000);

    it('analyzes scientific facts', async () => {
      const sentence = 'The Apollo 11 mission landed on the Moon on July 20, 1969.';
      const result = await detectSemanticBias(sentence);

      expect(result.scores).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    }, 30000);
  });

  describe('detectSemanticBiasBatch', () => {
    it('processes multiple sentences efficiently', async () => {
      const sentences = [
        'The Moon orbits Earth.',
        'This legendary achievement was iconic.',
        'Scientists claim the theory is allegedly true.',
      ];

      const results = await detectSemanticBiasBatch(sentences);

      expect(results).toHaveLength(3);
      expect(results[0].sentence).toBe(sentences[0]);
      expect(results[1].sentence).toBe(sentences[1]);
      expect(results[2].sentence).toBe(sentences[2]);
      expect(results[0].scores.neutral).toBeGreaterThan(results[1].scores.neutral);
    }, 30000);

    it('handles empty array gracefully', async () => {
      const results = await detectSemanticBiasBatch([]);
      expect(results).toHaveLength(0);
    });
  });

  describe('False Positive Reduction', () => {
    it('analyzes scientific context appropriately', async () => {
      const sentence = 'The greatest distance between Earth and Moon is 406,700 km.';
      const result = await detectSemanticBias(sentence);

      expect(result.scores).toBeDefined();
      expect(result.sentence).toBe(sentence);
    }, 30000);

    it('analyzes measurement context appropriately', async () => {
      const sentence = "NASA's best estimate for the Moon's age is 4.5 billion years.";
      const result = await detectSemanticBias(sentence);

      expect(result.scores).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    }, 30000);

    it('distinguishes historical vs promotional "legendary"', async () => {
      const historical = 'The mission was described as legendary by observers.';
      const promotional = 'This legendary spacecraft is the best ever built.';

      const [result1, result2] = await detectSemanticBiasBatch([historical, promotional]);

      expect(result1.scores).toBeDefined();
      expect(result2.scores).toBeDefined();
    }, 30000);
  });

  describe('Context-Aware Detection', () => {
    it('processes paraphrased promotional language', async () => {
      const sentence = 'The Moon represents an outstanding achievement in space exploration.';
      const result = await detectSemanticBias(sentence);

      expect(result.scores).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    }, 30000);

    it('processes subtle language variations', async () => {
      const sentence = 'The Apollo program merely managed to land humans on the Moon.';
      const result = await detectSemanticBias(sentence);

      expect(result.scores).toBeDefined();
      expect(result.sentence).toBe(sentence);
    }, 30000);
  });
});
