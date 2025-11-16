/**
 * @file src/tools/analyze.ts
 * @description MCP tool for running CivicLens analysis.
 */

import { z } from 'zod';
import {
  resolveBiasVerifierOptions,
  resolveGeminiSummaryOptions,
  runAnalyzeWorkflow,
} from '../workflows/analyze-workflow';
import { textContent } from './utils';

export const AnalyzeInputSchema = z.object({
  topicId: z.string().optional(),
  force: z.boolean().optional(),
  biasVerifier: z.enum(['gemini']).optional(),
  geminiKey: z.string().optional(),
  geminiModel: z.string().optional(),
  geminiSummary: z.boolean().optional(),
  verifyCitations: z.boolean().optional(),
});

export const analyzeTool = {
  title: 'Run CivicLens analysis',
  description: 'Reuses or regenerates Grokipedia vs Wikipedia comparisons.',
  inputSchema: AnalyzeInputSchema,
};

export const analyzeHandler = async (
  input: z.infer<typeof AnalyzeInputSchema>,
  logger: Pick<Console, 'log' | 'warn' | 'error'>,
) => {
  const verifier = input.biasVerifier
    ? resolveBiasVerifierOptions({
        biasVerifier: input.biasVerifier,
        geminiKey: input.geminiKey,
        geminiModel: input.geminiModel,
      })
    : null;
  const summary =
    input.geminiSummary === true
      ? resolveGeminiSummaryOptions({
          geminiKey: input.geminiKey,
          geminiModel: input.geminiModel,
        })
      : null;
  const results = await runAnalyzeWorkflow({
    topicId: input.topicId,
    force: input.force,
    biasVerifier: verifier,
    summary,
    verifyCitations: input.verifyCitations,
    logger,
  });
  return {
    content: textContent(
      `[analyse] Completed for ${input.topicId ?? 'all topics'} (${results.length} topic(s)).`,
    ),
    structuredContent: { topicId: input.topicId ?? null, results },
  };
};
