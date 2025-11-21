/**
 * @file src/workflows/analyze-workflow.ts
 * @description Shared analysis workflow logic reused across CLI and MCP server interfaces.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  AnalysisPayload,
  analyzeContent,
  type AnalyzerSource,
  prepareAnalyzerSource,
} from '../lib/analyzer';
import { GEMINI_DEFAULT_MODEL, verifyBiasWithGemini } from '../lib/bias-verifier';
import { verifySentencesAgainstCitations } from '../lib/citation-verifier';
import { generateGeminiComparisonSummary } from '../lib/gemini-summary';
import { buildStructuredAnalysis } from '../lib/structured-report';
import type { StructuredArticle } from '../parsers/shared/types';
import { probeCachedAnalysis } from '../shared/analysis-cache';
import { readConfig } from '../shared/config';
import { computeContentHash } from '../shared/content-hash';
import { paths } from '../shared/paths';
import { loadTopics, selectTopics, Topic } from '../shared/topics';

export interface BiasVerifierConfig {
  provider: 'gemini';
  apiKey: string;
  model: string;
}

export interface GeminiSummaryConfig {
  apiKey: string;
  model: string;
}

export type AnalyzeTopicStatus = 'cached' | 'error' | 'written' | 'skipped';

export interface AnalyzeTopicResult {
  topicId: string;
  topicTitle: string;
  status: AnalyzeTopicStatus;
  analysisPath?: string;
  detail?: string;
  error?: string;
}

export interface AnalyzeWorkflowHooks {
  onTopicStart?: (topic: Topic) => void;
  onTopicComplete?: (result: AnalyzeTopicResult) => void;
}

export interface AnalyzeWorkflowOptions {
  topicId?: string;
  force?: boolean;
  biasVerifier?: BiasVerifierConfig | null;
  summary?: GeminiSummaryConfig | null;
  verifyCitations?: boolean;
  logger?: Pick<Console, 'log' | 'warn' | 'error'>;
  hooks?: AnalyzeWorkflowHooks;
  semanticBias?: boolean;
}

type WorkflowLogger = Pick<Console, 'log' | 'warn' | 'error'>;

const getLogger = (logger?: WorkflowLogger): WorkflowLogger => logger ?? console;

interface TopicContext {
  wikiSource: AnalyzerSource;
  grokSource: AnalyzerSource;
  contentHash: string;
  analysisPath: string;
}

const readStructuredArticle = (
  dir: string,
  topic: Topic,
  source: 'wiki' | 'grok',
): StructuredArticle => {
  const target = path.join(dir, `${topic.id}.parsed.json`);
  if (!fs.existsSync(target)) {
    const label = source === 'wiki' ? 'wiki' : 'grok';
    throw new Error(
      `Missing structured snapshot ${target}. Run 'gwaln fetch ${label} --topic ${topic.id}' first.`,
    );
  }
  const raw = fs.readFileSync(target, 'utf8');
  return JSON.parse(raw) as StructuredArticle;
};

const buildTopicContext = (topic: Topic): TopicContext => {
  const wikiArticle = readStructuredArticle(paths.WIKI_DIR, topic, 'wiki');
  const grokArticle = readStructuredArticle(paths.GROK_DIR, topic, 'grok');
  const wikiSource = prepareAnalyzerSource(wikiArticle);
  const grokSource = prepareAnalyzerSource(grokArticle);
  const contentHash = computeContentHash(wikiSource.text, grokSource.text);
  return {
    wikiSource,
    grokSource,
    contentHash,
    analysisPath: path.join(paths.ANALYSIS_DIR, `${topic.id}.json`),
  };
};

const analyzeTopicSync = async (
  topic: Topic,
  force: boolean | undefined,
  semanticBias: boolean | undefined,
  context: TopicContext,
  logger: WorkflowLogger,
): Promise<AnalysisPayload | null> => {
  if (!force) {
    const cached = probeCachedAnalysis(context.analysisPath, context.contentHash);
    if (cached.status === 'fresh' && cached.analysis) {
      const cachedTimestamp =
        (cached.analysis as { generated_at?: string }).generated_at ??
        (cached.analysis as { updated_at?: string }).updated_at ??
        'cached';
      logger.log(`[analyse] ${topic.id}: reused cached analysis (${cachedTimestamp})`);
      return null;
    }
    if (cached.status !== 'missing' && cached.status !== 'fresh' && cached.reason) {
      logger.log(`[analyse] ${topic.id}: regenerating analysis (${cached.reason})`);
    }
  }

  return await analyzeContent(topic, context.wikiSource, context.grokSource, {
    contentHash: context.contentHash,
    semanticBias,
  });
};

const analyzeTopicAsync = (
  topic: Topic,
  force: boolean | undefined,
  semanticBias: boolean | undefined,
  context: TopicContext,
  logger: WorkflowLogger,
): Promise<AnalysisPayload | null> =>
  new Promise((resolve, reject) => {
    setImmediate(async () => {
      try {
        resolve(await analyzeTopicSync(topic, force, semanticBias, context, logger));
      } catch (error) {
        reject(error);
      }
    });
  });

export const runAnalyzeWorkflow = async ({
  topicId,
  force,
  biasVerifier,
  summary,
  verifyCitations,
  logger,
  hooks,
  semanticBias,
}: AnalyzeWorkflowOptions): Promise<AnalyzeTopicResult[]> => {
  const topics = loadTopics();
  const selection = selectTopics(topics, topicId);
  paths.ensureDir(paths.ANALYSIS_DIR);
  const activeLogger = getLogger(logger);
  const results: AnalyzeTopicResult[] = [];

  for (const topic of selection) {
    hooks?.onTopicStart?.(topic);
    let context: TopicContext;
    try {
      context = buildTopicContext(topic);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      activeLogger.error(`[analyse] ${topic.id}: ${message}`);
      const result: AnalyzeTopicResult = {
        topicId: topic.id,
        topicTitle: topic.title,
        status: 'error',
        error: message,
      };
      hooks?.onTopicComplete?.(result);
      results.push(result);
      continue;
    }

    try {
      const analysis = await analyzeTopicAsync(topic, force, semanticBias, context, activeLogger);
      if (!analysis) {
        const result: AnalyzeTopicResult = {
          topicId: topic.id,
          topicTitle: topic.title,
          status: 'cached',
          analysisPath: context.analysisPath,
          detail: 'reused cached analysis',
        };
        hooks?.onTopicComplete?.(result);
        results.push(result);
        continue;
      }
      if (biasVerifier?.provider === 'gemini' && analysis.bias_events.length > 0) {
        analysis.bias_verifications = await verifyBiasWithGemini({
          apiKey: biasVerifier.apiKey,
          model: biasVerifier.model ?? GEMINI_DEFAULT_MODEL,
          events: analysis.bias_events,
          wikiText: context.wikiSource.text,
          grokText: context.grokSource.text,
        });
      }
      if (summary) {
        analysis.gemini_summary = await generateGeminiComparisonSummary({
          apiKey: summary.apiKey,
          model: summary.model,
          wikiText: context.wikiSource.text,
          grokText: context.grokSource.text,
        });
      }
      if (verifyCitations && analysis.extra_sentences.length) {
        const citationResults = await verifySentencesAgainstCitations(
          analysis.extra_sentences,
          context.grokSource.content.citations ?? [],
        );
        analysis.citation_verifications = citationResults;
        analysis.hallucination_events = analysis.hallucination_events ?? [];
        citationResults
          .filter((entry) => entry.status === 'unsupported')
          .forEach((entry) => {
            analysis.hallucination_events.push({
              type: 'hallucination',
              description: 'Sentence is not supported by cited sources (auto-check).',
              evidence: { grokipedia: entry.sentence },
              category: 'hallucination',
              severity: 4,
              tags: ['unsupported_citation'],
            });
          });
      }
      const structured = buildStructuredAnalysis(topic, analysis);
      fs.writeFileSync(context.analysisPath, JSON.stringify(structured, null, 2), 'utf8');
      activeLogger.log(`[analyse] ${topic.id}: wrote ${context.analysisPath}`);
      const result: AnalyzeTopicResult = {
        topicId: topic.id,
        topicTitle: topic.title,
        status: 'written',
        analysisPath: context.analysisPath,
      };
      hooks?.onTopicComplete?.(result);
      results.push(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      activeLogger.error(`[analyse] ${topic.id}: ${message}`);
      const result: AnalyzeTopicResult = {
        topicId: topic.id,
        topicTitle: topic.title,
        status: 'error',
        error: message,
      };
      hooks?.onTopicComplete?.(result);
      results.push(result);
    }
  }

  return results;
};

export interface BiasVerifierOptionInput {
  biasVerifier?: string;
  geminiKey?: string;
  geminiModel?: string;
}

export const resolveBiasVerifierOptions = (
  options: BiasVerifierOptionInput,
): BiasVerifierConfig | null => {
  if (!options.biasVerifier) {
    return null;
  }
  const provider = options.biasVerifier.toLowerCase();
  if (provider !== 'gemini') {
    throw new Error(`Unsupported bias verifier '${options.biasVerifier}'.`);
  }
  const cfg = readConfig();
  const apiKey = options.geminiKey ?? cfg.geminiApiKey;
  if (!apiKey) {
    throw new Error(
      'Set --gemini-key or configure geminiApiKey in .gwalnrc.json before using --bias-verifier gemini.',
    );
  }
  return {
    provider: 'gemini',
    apiKey,
    model: options.geminiModel ?? cfg.geminiModel ?? GEMINI_DEFAULT_MODEL,
  };
};

export interface GeminiSummaryOptionInput {
  geminiKey?: string;
  geminiModel?: string;
}

export const resolveGeminiSummaryOptions = (
  options: GeminiSummaryOptionInput,
): GeminiSummaryConfig => {
  const cfg = readConfig();
  const apiKey = options.geminiKey ?? cfg.geminiApiKey;
  if (!apiKey) {
    throw new Error(
      'Set --gemini-key or configure geminiApiKey in .gwalnrc.json before enabling --gemini-summary.',
    );
  }
  return {
    apiKey,
    model: options.geminiModel ?? cfg.geminiModel ?? GEMINI_DEFAULT_MODEL,
  };
};
