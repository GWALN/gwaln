/**
 * @file src/parsers/wiki/template-handler.ts
 * @description Template parsing and stripping functions for Wikipedia wikitext
 * @author Doğu Abaris <abaris@null.net>
 */

import type { ParsedTemplate } from '../shared/types';

const STRIP_TEMPLATES = new Set([
  'circa',
  'c',
  'nowrap',
  'ipac-en',
  'respell',
  'ipa',
  'ipac',
  'langx',
  'lang',
  'plainlist',
  'snd',
  'ublist',
  'small',
  'big',
  'sup',
  'sub',
  'nbsp',
  'audio',
  'listen',
  'pronunciation',
  'transl',
  'hlist',
  'ubl',
  'flatlist',
]);

const EXTRACT_FIRST_PARAM_TEMPLATES = new Set(['abbr', 'val', 'cvt', 'convert']);

const FOOTNOTE_TEMPLATES = new Set(['efn', 'efn-ua', 'note', 'refn']);

const META_TEMPLATE_WHITELIST = [
  'short description',
  'use american english',
  'use british english',
  'use dmy dates',
  'use mdy dates',
  'good article',
  'featured article',
  'main',
  'see also',
  'further information',
  'details',
  'about',
  'for',
  'redirect',
  'hatnote',
  'dablink',
  'distinguish',
  'other uses',
  'self-reference',
  'unreferenced',
  'citation needed',
  'fact',
  'clarify',
  'disputed',
  'original research',
  'primary source',
  'secondary source',
  'tertiary source',
  'update',
  'current',
  'recent',
  'dated',
  'fix',
  'cleanup',
  'copy edit',
  'grammar',
  'spelling',
  'style',
  'tone',
  'neutrality',
  'pov',
  'advert',
  'spam',
  'blp',
  'notability',
  'afd',
  'merge',
  'split',
  'move',
  'delete',
  'prod',
  'cfd',
  'tfd',
  'ffd',
  'rfd',
  'sfd',
  'vfd',
  'xfd',
  'disambiguation',
  'set index article',
  'geodis',
  'coord',
  'infobox',
  'taxobox',
  'chembox',
  'drugbox',
  'wikitable',
  'chart',
  'graph',
  'timeline',
  'map',
  'image',
  'gallery',
  'listen',
  'audio',
  'video',
  'youtube',
  'vimeo',
  'commons',
  'category',
  'portal',
  'project',
  'template',
  'module',
  'help',
  'book',
  'draft',
  'file',
  'media',
  'special',
  'user',
  'user talk',
  'wikipedia',
  'wikipedia talk',
  'portal talk',
  'file talk',
  'media talk',
  'template talk',
  'module talk',
  'help talk',
  'book talk',
  'draft talk',
  'category talk',
  'project talk',
  'special talk',
  'image talk',
  'gallery talk',
  'talk',
  'article talk',
  'page talk',
  'subject talk',
  'topic talk',
  'wp',
  'wp talk',
  'cs1 config',
  'protection padlock',
];

export const getTemplateBlock = (
  text: string,
  startIndex: number,
): { block: string; end: number } | null => {
  let depth = 0;
  for (let i = startIndex; i < text.length - 1; i += 1) {
    const pair = text.slice(i, i + 2);
    if (pair === '{{') {
      depth += 1;
      i += 1;
      continue;
    }
    if (pair === '}}') {
      depth -= 1;
      i += 1;
      if (depth === 0) {
        return { block: text.slice(startIndex, i + 1), end: i + 1 };
      }
    }
  }
  return null;
};

export const parseTemplate = (text: string, startIndex: number): ParsedTemplate | null => {
  const block = getTemplateBlock(text, startIndex);
  if (!block) return null;

  const content = block.block.slice(2, -2);
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  let inLink = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const next = content[i + 1];

    if (char === '{' && next === '{') {
      depth += 1;
      current += '{{';
      i += 1;
    } else if (char === '}' && next === '}') {
      depth -= 1;
      current += '}}';
      i += 1;
    } else if (char === '[' && next === '[') {
      inLink = true;
      current += '[[';
      i += 1;
    } else if (char === ']' && next === ']') {
      inLink = false;
      current += ']]';
      i += 1;
    } else if (char === '|' && depth === 0 && !inLink) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current);

  const name = parts[0]?.trim().toLowerCase() || '';
  const params = parts.slice(1).map((p) => p.split('=').pop()?.trim() || '');

  return {
    name,
    params,
    raw: block.block,
    startIndex,
    endIndex: block.end,
  };
};

export const stripTemplates = (text: string): string => {
  let result = '';
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const two = text.slice(i, i + 2);
    if (two === '{{') {
      depth += 1;
      i += 1;
      continue;
    }
    if (two === '}}') {
      if (depth > 0) depth -= 1;
      i += 1;
      continue;
    }
    if (depth === 0) {
      result += text[i];
    }
  }
  return result;
};

export const stripNonCiteTemplates = (text: string): string => {
  let result = text;
  let position = 0;
  const maxIterations = 200;
  let iterations = 0;

  while (position < result.length && iterations < maxIterations) {
    iterations += 1;

    const searchText = result.slice(position);
    const templateMatch = searchText.match(/{{\s*([^|{}]+)/);
    if (!templateMatch || templateMatch.index === undefined) break;

    const absoluteIndex = position + templateMatch.index;
    const parsed = parseTemplate(result, absoluteIndex);
    if (!parsed) {
      position = absoluteIndex + 2;
      continue;
    }

    const templateName = parsed.name;

    if (templateName.startsWith('cite')) {
      position = parsed.endIndex;
      continue;
    }

    if (FOOTNOTE_TEMPLATES.has(templateName)) {
      position = parsed.endIndex;
      continue;
    }

    let replacement = '';
    if (STRIP_TEMPLATES.has(templateName)) {
      replacement = '';
    } else if (EXTRACT_FIRST_PARAM_TEMPLATES.has(templateName)) {
      replacement = parsed.params[0] || '';
    } else {
      replacement = '';
    }

    const before = result.slice(0, parsed.startIndex);
    const after = result.slice(parsed.endIndex);
    result = before + replacement + after;

    position = parsed.startIndex + replacement.length;
  }

  return result;
};

export const stripFootnoteTemplates = (text: string): string => {
  let result = text;
  let position = 0;
  const maxIterations = 200;
  let iterations = 0;

  while (position < result.length && iterations < maxIterations) {
    iterations += 1;

    const searchText = result.slice(position);
    const templateMatch = searchText.match(/{{\s*([^|{}]+)/);
    if (!templateMatch || templateMatch.index === undefined) break;

    const absoluteIndex = position + templateMatch.index;
    const parsed = parseTemplate(result, absoluteIndex);
    if (!parsed) {
      position = absoluteIndex + 2;
      continue;
    }

    const templateName = parsed.name;

    if (FOOTNOTE_TEMPLATES.has(templateName)) {
      const before = result.slice(0, parsed.startIndex);
      const after = result.slice(parsed.endIndex);
      result = before + after;
      position = parsed.startIndex;
    } else {
      position = parsed.endIndex;
    }
  }

  return result;
};

export const stripInfobox = (text: string): string => {
  const start = text.match(/{{\s*Infobox[^{]*/i);
  if (!start || start.index === undefined) {
    return text;
  }
  const block = getTemplateBlock(text, start.index);
  if (!block) {
    return text;
  }
  const before = text.slice(0, start.index).trimEnd();
  const after = text.slice(block.end).trimStart();
  const glue = before && after ? `${before}\n\n${after}` : before || after;
  return glue.trim();
};

export const stripMetaTemplates = (text: string): string => {
  let result = text;
  let changed = true;
  const maxIterations = 50;
  let iterations = 0;

  while (changed && iterations < maxIterations) {
    changed = false;
    iterations += 1;

    let firstMatch: { index: number; end: number } | null = null;

    for (const templateName of META_TEMPLATE_WHITELIST) {
      const pattern = new RegExp(`{{\\s*${templateName}(?:[\\s|]|$)`, 'i');
      const match = result.match(pattern);
      if (match && match.index !== undefined) {
        const block = getTemplateBlock(result, match.index);
        if (block && (!firstMatch || match.index < firstMatch.index)) {
          firstMatch = { index: match.index, end: block.end };
        }
      }
    }

    if (!firstMatch) break;

    const before = result.slice(0, firstMatch.index);
    const after = result.slice(firstMatch.end);
    result = before + after;
    changed = true;
  }

  return result.replace(/ {2,}/g, ' ').trimStart();
};
