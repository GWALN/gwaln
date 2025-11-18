/**
 * @file src/parsers/wiki/sentence-splitter.ts
 * @description Sentence splitting and filtering functions for Wikipedia and Grokipedia
 * @author Doğu Abaris <abaris@null.net>
 */

import type { SentenceSlice } from '../shared/types';

export const splitSentences = (text: string): SentenceSlice[] => {
  const sentences: SentenceSlice[] = [];
  const regex = /[^.!?]+(?:[.!?]+|$)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const raw = match[0];
    const trimmed = raw.trim();
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

    const leading = raw.length - raw.trimStart().length;
    const trailing = raw.length - raw.trimEnd().length;
    const start = match.index + leading;
    const end = match.index + raw.length - trailing;
    sentences.push({ text: trimmed, start, end });
  }
  return sentences;
};

export const GROK_BANNER_PATTERNS = [/search\s*⌘k/i, /fact-checked\s+by\s+grok/i];
