/**
 * @file src/parsers/wiki/sentence-splitter.ts
 * @description Sentence splitting and filtering functions for Wikipedia and Grokipedia
 * @author Doğu Abaris <abaris@null.net>
 */

import type { SentenceSlice } from '../shared/types';

export const splitSentences = (text: string): SentenceSlice[] => {
  const sentences: SentenceSlice[] = [];
  const parts = text.split(/(?<=[.!?])(?=\s+[A-Z])|(?<=[.!?])\s*$/);

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed.length < 5) continue;
    if (/^[,;:\s.!?]+$/.test(trimmed)) continue;

    const words = trimmed.split(/\s+/).filter((w) => /[a-zA-Z0-9]/.test(w));
    if (words.length < 2) continue;

    const alphanumericCount = trimmed.replace(/[^a-zA-Z0-9\s]/g, '').length;
    if (alphanumericCount < trimmed.length * 0.5) continue;

    if (/^(until|from|and|or|but)\s+/i.test(trimmed)) continue;

    if (/^See\s+/i.test(trimmed)) continue;

    if (/^(ogg|jpg|png|svg|gif|webm|mp4)\s*[,;.]/i.test(trimmed)) continue;

    if (trimmed === trimmed.toUpperCase() && trimmed.length > 3) continue;

    if (/^(Retrieved|Archived|Accessed)\s+/i.test(trimmed)) continue;
    if (/^\w+,\s+\w+\s+\(\w+\s+\d+,\s+\d{4}\)/i.test(trimmed)) continue;

    const start = text.indexOf(trimmed);
    const end = start + trimmed.length;
    sentences.push({ text: trimmed, start, end });
  }
  return sentences;
};

export const GROK_BANNER_PATTERNS = [/search\s*⌘k/i, /fact-checked\s+by\s+grok/i];
