/**
 * @file src/lib/semantic-bias-detector.ts
 * @description Semantic bias detection using transformer models to reduce false positives
 *              and catch subtle bias patterns missed by keyword-based detection.
 * @author Doğu Abaris <abaris@null.net>
 */

import { pipeline, type ZeroShotClassificationPipeline } from '@xenova/transformers';

let classifierInstance: ZeroShotClassificationPipeline | null = null;

export async function initBiasClassifier(): Promise<ZeroShotClassificationPipeline> {
  if (!classifierInstance) {
    classifierInstance = (await pipeline(
      'zero-shot-classification',
      'Xenova/bart-large-mnli',
    )) as ZeroShotClassificationPipeline;
  }
  return classifierInstance;
}

/**
 * NPOV (Neutral Point of View) categories aligned with Wikipedia MOS guidelines
 */
const NPOV_LABELS = [
  'neutral encyclopedic tone',
  'promotional or biased language',
  'emotional or subjective tone',
  'unverified or speculative claims',
  'loaded or contentious labels',
];

export interface SemanticBiasResult {
  sentence: string;
  scores: {
    neutral: number;
    promotional: number;
    emotional: number;
    speculative: number;
    contentious: number;
  };
  predicted_bias_type: string | null;
  confidence: number;
}

/**
 * Detect bias using semantic zero-shot classification.
 *
 * @param sentence - Grokipedia sentence to analyze
 * @returns Bias scores and prediction
 *
 * @example
 * const result = await detectSemanticBias("This legendary Moon landing was iconic");
 * // result.predicted_bias_type = "promotional"
 * // result.confidence = 0.87
 */
export async function detectSemanticBias(sentence: string): Promise<SemanticBiasResult> {
  const classifier = await initBiasClassifier();

  const rawResult = await classifier(sentence, NPOV_LABELS, {
    multi_label: false,
  });

  const result = Array.isArray(rawResult) ? rawResult[0] : rawResult;

  const scores = {
    neutral: result.scores[0] ?? 0,
    promotional: result.scores[1] ?? 0,
    emotional: result.scores[2] ?? 0,
    speculative: result.scores[3] ?? 0,
    contentious: result.scores[4] ?? 0,
  };

  const biasScores = [
    { type: 'promotional', score: scores.promotional },
    { type: 'emotional', score: scores.emotional },
    { type: 'speculative', score: scores.speculative },
    { type: 'contentious', score: scores.contentious },
  ];

  const maxBias = biasScores.reduce((max, curr) => (curr.score > max.score ? curr : max));

  const hasBias = maxBias.score > 0.5 && maxBias.score > scores.neutral;

  return {
    sentence,
    scores,
    predicted_bias_type: hasBias ? maxBias.type : null,
    confidence: hasBias ? maxBias.score : scores.neutral,
  };
}

/**
 * Batch detection for improved efficiency.
 * Processes sentences in parallel batches of 5.
 *
 * @param sentences - Array of Grokipedia sentences
 * @returns Array of bias detection results
 */
export async function detectSemanticBiasBatch(sentences: string[]): Promise<SemanticBiasResult[]> {
  const BATCH_SIZE = 5;
  const results: SemanticBiasResult[] = [];

  for (let i = 0; i < sentences.length; i += BATCH_SIZE) {
    const batch = sentences.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map((s) => detectSemanticBias(s)));
    results.push(...batchResults);
  }

  return results;
}
