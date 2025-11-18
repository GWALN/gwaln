/**
 * @file src/lib/citation-verifier.ts
 * @description Fetches Grokipedia citation URLs and checks whether extra sentences appear in those sources.
 * @author Doğu Abaris <abaris@null.net>
 */

import fetch from 'node-fetch';
import type { CitationVerificationRecord } from './analyzer';

interface CitationVerificationOptions {
  maxCitations?: number;
  timeoutMs?: number;
}

const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim().toLowerCase();

const fetchCitation = async (url: string, timeoutMs = 8000): Promise<string> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
};

export const verifySentencesAgainstCitations = async (
  sentences: string[],
  citations: string[],
  options: CitationVerificationOptions = {},
): Promise<CitationVerificationRecord[]> => {
  if (!sentences.length || !citations.length) {
    return sentences.map((sentence) => ({
      sentence,
      status: 'error',
      message: 'No citations available for verification.',
    }));
  }

  const { maxCitations = 5, timeoutMs = 8000 } = options;
  const uniqueCitations = Array.from(
    new Set(citations.filter((url) => /^https?:\/\//i.test(url))),
  ).slice(0, maxCitations);
  if (!uniqueCitations.length) {
    return sentences.map((sentence) => ({
      sentence,
      status: 'error',
      message: 'No HTTP citations available.',
    }));
  }

  const cache = new Map<string, string | Error>();

  const getCitationText = async (url: string): Promise<string | Error> => {
    if (cache.has(url)) {
      return cache.get(url)!;
    }
    try {
      const text = await fetchCitation(url, timeoutMs);
      cache.set(url, text);
      return text;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      cache.set(url, err);
      return err;
    }
  };

  const normalizedSentences = sentences.map((sentence) => ({
    raw: sentence,
    normalized: normalize(sentence),
  }));

  const results: CitationVerificationRecord[] = [];
  const fetchedTexts: Array<{ url: string; text?: string; error?: Error }> = [];

  for (const citation of uniqueCitations) {
    const result = await getCitationText(citation);
    if (result instanceof Error) {
      fetchedTexts.push({ url: citation, error: result });
    } else {
      fetchedTexts.push({ url: citation, text: result });
    }
  }

  normalizedSentences.forEach((sentence) => {
    const supported = fetchedTexts.find(
      (entry) => entry.text && normalize(entry.text).includes(sentence.normalized),
    );
    if (supported) {
      results.push({
        sentence: sentence.raw,
        status: 'supported',
        supporting_url: supported.url,
      });
      return;
    }
    const hadText = fetchedTexts.some((entry) => entry.text);
    if (!hadText) {
      const issues = fetchedTexts
        .filter((entry) => entry.error)
        .map((entry) => `${entry.url}: ${(entry.error as Error).message}`)
        .join('; ');
      results.push({
        sentence: sentence.raw,
        status: 'error',
        message: issues || 'Unable to fetch citations.',
      });
      return;
    }
    results.push({
      sentence: sentence.raw,
      status: 'unsupported',
      message: 'Sentence not found in fetched citations.',
    });
  });

  return results;
};
