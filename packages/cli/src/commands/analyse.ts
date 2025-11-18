/**
 * @file src/commands/analyse.ts
 * @description CLI wiring for the analysis workflow.
 */

import { Command } from 'commander';
import ora from 'ora';
import {
  GEMINI_DEFAULT_MODEL,
  type AnalyzeTopicResult,
  type AnalyzeWorkflowHooks,
  type BiasVerifierOptionInput,
  type GeminiSummaryOptionInput,
  resolveBiasVerifierOptions,
  resolveGeminiSummaryOptions,
  runAnalyzeWorkflow,
} from '@gwaln/core';

interface AnalyseCliOptions extends BiasVerifierOptionInput, GeminiSummaryOptionInput {
  topic?: string;
  force?: boolean;
  geminiSummary?: boolean;
  verifyCitations?: boolean;
}

const createCliHooks = (): AnalyzeWorkflowHooks => {
  let spinner: ora.Ora | null = null;
  return {
    onTopicStart: (topic) => {
      spinner = ora(`[analyse] ${topic.id}: analyzing`).start();
    },
    onTopicComplete: (result: AnalyzeTopicResult) => {
      if (!spinner) return;
      const label = `[analyse] ${result.topicId}:`;
      if (result.status === 'written') {
        spinner.succeed(`${label} wrote ${result.analysisPath}`);
      } else if (result.status === 'cached') {
        spinner.succeed(`${label} ${result.detail ?? 'reused cached analysis'}`);
      } else if (result.status === 'error') {
        spinner.fail(`${label} ${result.error ?? 'Unknown error'}`);
      } else {
        spinner.stop();
      }
      spinner = null;
    },
  };
};

const analyseCommand = new Command('analyse')
  .alias('analyze')
  .description('Generate comparison JSON between Grokipedia and Wikipedia content')
  .option('-t, --topic <id>', 'Topic identifier (default: all topics)')
  .option('-f, --force', 'Ignore cached analysis results and recompute')
  .option(
    '--bias-verifier <provider>',
    'Verify bias events with an external provider (e.g., gemini)',
  )
  .option('--gemini-key <key>', 'API key for the Gemini provider (falls back to GEMINI_API_KEY)')
  .option('--gemini-model <model>', `Gemini model identifier (default: ${GEMINI_DEFAULT_MODEL})`)
  .option('--gemini-summary', 'Generate a Gemini-authored comparison summary')
  .option(
    '--verify-citations',
    'Fetch Grokipedia citations and confirm extra sentences are supported',
  )
  .action(async (options: AnalyseCliOptions) => {
    const verifier = resolveBiasVerifierOptions(options);
    const summary = options.geminiSummary ? resolveGeminiSummaryOptions(options) : null;
    await runAnalyzeWorkflow({
      topicId: options.topic,
      force: options.force,
      biasVerifier: verifier,
      summary,
      verifyCitations: options.verifyCitations,
      hooks: createCliHooks(),
    });
  });

export default analyseCommand;
