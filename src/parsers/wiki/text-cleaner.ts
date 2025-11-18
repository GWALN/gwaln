/**
 * @file src/parsers/wiki/text-cleaner.ts
 * @description Text cleaning and normalization functions for Wikipedia wikitext
 * @author Doğu Abaris <abaris@null.net>
 */

import { stripTemplates } from './template-handler';

export const cleanWikiLinks = (text: string): string => {
  let result = text;
  result = result.replace(/\[\[([^|\]]+)\|([^\]]+)]]/g, '$2');
  result = result.replace(/\[\[([^\]]+)]]/g, '$1');
  result = result.replace(/\[([^\s]+)\s+([^\]]+)]/g, '$2');
  return result;
};

export const cleanSentenceText = (text: string): string => {
  let cleaned = text;
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');
  cleaned = cleanWikiLinks(cleaned);
  cleaned = stripTemplates(cleaned);
  cleaned = cleaned.replace(/''+/g, '');
  cleaned = cleaned.replace(/&nbsp;/g, ' ');
  cleaned = cleaned.replace(/<[^>]+>/g, '');
  cleaned = cleaned.replace(/\[(\d+)]/g, '');
  cleaned = cleaned.replace(/\s+/g, ' ');
  return cleaned.trim();
};

export const normalizeText = (text: string): string => text.toLowerCase();

export const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter(Boolean);

export const stripHtmlComments = (text: string): string => {
  let previous: string;
  let result = text;
  do {
    previous = result;
    result = result.replace(/<!--[\s\S]*?-->/g, '');
  } while (result !== previous);
  return result.trim();
};

export const stripFileLinks = (text: string): string => text.replace(/\[\[:File:[^\]]+\]\]/gi, '');

export const stripTables = (text: string): string => text.replace(/{\|[\s\S]*?\|}/g, '');
