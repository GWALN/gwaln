/**
 * @file src/lib/summary-generator.ts
 * @description AI-powered summary generation using transformers.js
 * @author Doğu Abaris <abaris@null.net>
 */

import { pipeline, type SummarizationPipeline } from '@xenova/transformers';

let summarizerInstance: SummarizationPipeline | null = null;

export async function initSummarizer(): Promise<SummarizationPipeline> {
  if (!summarizerInstance) {
    summarizerInstance = (await pipeline(
      'summarization',
      'Xenova/distilbart-cnn-6-6',
    )) as SummarizationPipeline;
  }
  return summarizerInstance;
}

export interface SummaryOptions {
  maxLength?: number;
  minLength?: number;
}

export async function generateSummary(text: string, options: SummaryOptions = {}): Promise<string> {
  const summarizer = await initSummarizer();

  const rawResult = await summarizer(text, {
    max_new_tokens: options.maxLength ?? 100,
    min_length: options.minLength ?? 30,
  });

  const result = Array.isArray(rawResult) ? rawResult[0] : rawResult;
  return (result as { summary_text: string }).summary_text;
}
