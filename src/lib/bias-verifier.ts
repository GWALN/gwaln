/**
 * @file src/lib/bias-verifier.ts
 * @description Optional Gemini integration that double-checks detected bias events via the Generative Language API.
 * @author Doğu Abaris <abaris@null.net>
 */

import fetch from 'node-fetch';
import type { BiasVerificationRecord, DiscrepancyRecord } from './analyzer';

export const GEMINI_DEFAULT_ENDPOINT = 'https://generativelanguage.googleapis.com';
export const GEMINI_DEFAULT_MODEL = 'gemini-1.5-flash';

interface GeminiContentPart {
  text?: string;
}

interface GeminiCandidate {
  content?: {
    parts?: GeminiContentPart[];
  };
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  error?: {
    message?: string;
  };
}

interface GeminiVerifierParams {
  apiKey: string;
  model?: string;
  endpoint?: string;
  events: DiscrepancyRecord[];
  wikiText: string;
  grokText: string;
  maxContextChars?: number;
}

interface GeminiResultPayload {
  index: number;
  verdict: string;
  confidence?: number;
  rationale?: string;

  [key: string]: unknown;
}

const sanitizeJsonBlock = (text: string): string => text.replace(/```json|```/g, '').trim();

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

const buildPrompt = (
  events: DiscrepancyRecord[],
  wikiText: string,
  grokText: string,
  contextLimit: number,
): string => {
  const wikiContext =
    wikiText.length > contextLimit ? `${wikiText.slice(0, contextLimit)}…` : wikiText;
  const grokLimit = Math.max(1000, Math.floor(contextLimit * 0.8));
  const grokContext = grokText.length > grokLimit ? `${grokText.slice(0, grokLimit)}…` : grokText;
  const bullets = events
    .map((event, idx) => {
      const snippet = event.evidence.grokipedia ?? '';
      const tag = event.tags?.[0] ?? event.type;
      return `${idx}. (${tag}) ${snippet}`;
    })
    .join('\n');
  return [
    'You are verifying whether Grokipedia sentences introduce biased framing absent from Wikipedia.',
    'Base your decision on Wikipedia tone (reference excerpt) and the Grokipedia snippet provided.',
    'Respond with compact JSON only. Allowed verdicts: "confirm", "reject", or "uncertain".',
    'Include a rationale per entry and a confidence score between 0 and 1.',
    '',
    'Reference excerpt (Wikipedia):',
    `"""${wikiContext}"""`,
    '',
    'Grokipedia context (trimmed):',
    `"""${grokContext}"""`,
    '',
    'Candidate sentences:',
    bullets,
    '',
    'Return JSON shaped like:',
    `[{"index":0,"verdict":"confirm","confidence":0.8,"rationale":"Why the wording is biased"}, {...}]`,
  ].join('\n');
};

const normalizeVerdict = (value: string): BiasVerificationRecord['verdict'] => {
  const normalized = value.toLowerCase();
  if (normalized === 'confirm' || normalized === 'reject' || normalized === 'uncertain') {
    return normalized;
  }
  return 'error';
};

export const verifyBiasWithGemini = async ({
  apiKey,
  model = GEMINI_DEFAULT_MODEL,
  endpoint = GEMINI_DEFAULT_ENDPOINT,
  events,
  wikiText,
  grokText,
  maxContextChars = 2500,
}: GeminiVerifierParams): Promise<BiasVerificationRecord[]> => {
  if (!events.length) {
    return [];
  }
  const prompt = buildPrompt(events, wikiText, grokText, maxContextChars);
  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0,
    },
  };
  const target = `${endpoint.replace(/\/$/, '')}/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const response = await fetch(target, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API request failed (${response.status}): ${err}`);
  }
  const payload = (await response.json()) as GeminiResponse;
  if (payload.error?.message) {
    throw new Error(`Gemini API returned an error: ${payload.error.message}`);
  }
  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? '')
    .join('\n')
    .trim();
  if (!text) {
    throw new Error('Gemini response contained no text content.');
  }
  const normalized = sanitizeJsonBlock(text);
  let parsed: GeminiResultPayload[];
  try {
    parsed = JSON.parse(normalized) as GeminiResultPayload[];
  } catch {
    throw new Error(
      'Gemini response was not valid JSON. Enable debug logging to inspect the raw payload.',
    );
  }
  return parsed
    .filter((entry) => events[entry.index])
    .map((entry) => ({
      provider: 'gemini',
      event_index: entry.index,
      verdict: normalizeVerdict(entry.verdict ?? ''),
      confidence:
        typeof entry.confidence === 'number' ? Number(clamp(entry.confidence).toFixed(2)) : null,
      rationale: entry.rationale,
      raw: entry,
    }));
};
