/**
 * @file src/tools/analyze.ts
 * @description MCP tool for running GWALN analysis.
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
  title: 'Analyze and Compare Grokipedia vs Wikipedia Content',
  description:
    'Performs comprehensive analysis comparing Grokipedia and Wikipedia content for specified topics. Generates structured comparison reports including bias detection, citation verification, and discrepancy analysis. Returns analysis results with metrics, summaries, and structured data that can be used for further processing or reporting. Supports optional Gemini-based bias verification and AI-generated summaries. Results are cached and can be regenerated with the force option.',
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
