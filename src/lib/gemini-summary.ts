/**
 * @file src/lib/gemini-summary.ts
 * @description Fetches a high-level comparison summary from Gemini.
 * @author Doğu Abaris <abaris@null.net>
 */

import fetch from 'node-fetch';
import { GEMINI_DEFAULT_ENDPOINT, GEMINI_DEFAULT_MODEL } from './bias-verifier';

export interface GeminiSummaryRecord {
  provider: string;
  model: string;
  text: string;
  generated_at: string;
  raw?: unknown;
}

interface GeminiSummaryOptions {
  apiKey: string;
  model?: string;
  endpoint?: string;
  wikiText: string;
  grokText: string;
  maxChars?: number;
}

const trimContext = (value: string, limit: number): string =>
  value.length > limit ? `${value.slice(0, limit)}…` : value;

const buildSummaryPrompt = (wikiText: string, grokText: string): string => {
  const instructions = [
    'You compare two encyclopedia entries about the same topic.',
    'Reference article: Wikipedia (considered the baseline).',
    'Candidate article: Grokipedia (may add/remove/alter claims).',
    'Summarize the most important differences in 3-5 concise bullet points:',
    '- missing factual context',
    '- added or speculative claims',
    '- tone or bias shifts',
    '- citation or structural gaps.',
    'Avoid quoting raw markdown headers. Focus on human-readable insights.',
  ].join('\n');
  return [
    instructions,
    '',
    'Wikipedia article:',
    `"""${wikiText}"""`,
    '',
    'Grokipedia article:',
    `"""${grokText}"""`,
    '',
    'Bullet summary:',
  ].join('\n');
};

export const generateGeminiComparisonSummary = async ({
  apiKey,
  model = GEMINI_DEFAULT_MODEL,
  endpoint = GEMINI_DEFAULT_ENDPOINT,
  wikiText,
  grokText,
  maxChars = 3200,
}: GeminiSummaryOptions): Promise<GeminiSummaryRecord> => {
  const trimmedWiki = trimContext(wikiText, maxChars);
  const trimmedGrok = trimContext(grokText, maxChars);
  const prompt = buildSummaryPrompt(trimmedWiki, trimmedGrok);

  const target = `${endpoint.replace(/\/$/, '')}/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
    },
  };

  const response = await fetch(target, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini summary request failed (${response.status}): ${err}`);
  }
  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };
  const text =
    payload?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text ?? '')
      .join('\n')
      .trim() ?? '';
  if (!text) {
    throw new Error('Gemini summary response was empty.');
  }
  return {
    provider: 'gemini',
    model,
    text,
    generated_at: new Date().toISOString(),
    raw: payload,
  };
};
