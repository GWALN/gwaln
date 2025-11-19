/**
 * @file src/shared/analyzer-config.ts
 * @description Centralized knobs for the Grokipedia ⇄ Wikipedia analyzer.
 *              These constants control cache behaviour, thresholds, and scoring.
 * @author Doğu Abaris <abaris@null.net>
 */

import pkg from '../../package.json';

export const ANALYZER_VERSION = `gwaln-analyzer@${pkg.version}`;

/**
 * Cached JSON analyses remain valid for this many hours unless the
 * underlying Markdown content hash changes.
 */
export const CACHE_TTL_HOURS = 72;

/**
 * Sliding n-gram window length (in words) for overlap scoring.
 */
export const SHINGLE_SIZE = 4;

export const CLASSIFICATION_THRESHOLDS = {
  aligned: {
    similarity: 0.94,
    ngram: 0.88,
  },
  possible: {
    similarity: 0.85,
    ngram: 0.78,
  },
};

export const HIGHLIGHT_WINDOW = 3;

/**
 * Minimum confidence threshold for semantic bias detection.
 * Only flag bias when semantic model confidence exceeds this value.
 */
export const SEMANTIC_BIAS_CONFIDENCE_THRESHOLD = 0.5;

/**
 * Threshold for false positive filtering.
 * If keyword detects bias but semantic neutrality score > this threshold,
 * mark as potential false positive.
 */
export const SEMANTIC_NEUTRAL_THRESHOLD = 0.7;
