/**
 * @file src/lib/parser.ts
 * @description Lightweight Markdown parser that converts fetched Grokipedia/Wikipedia
 *              content into a structured representation for downstream tooling.
 *              The goal is to expose sections, sentences, links, and media assets
 *              without pulling in a full Markdown AST dependency.
 * @author Doğu Abaris <abaris@null.net>
 */

import type { Topic } from '../shared/topics';

export interface ParsedSection {
  level: number;
  title: string;
  content: string;
  sentences: string[];
  links: string[];
  media: string[];
}

export interface ParsedArticle {
  topic_id: string;
  title: string;
  source: 'wikipedia' | 'grokipedia';
  source_url: string;
  fetched_at: string;
  word_count: number;
  char_count: number;
  summary: string;
  sections: ParsedSection[];
  links: string[];
  media: string[];
  references: string[];
}

const headingRegex = /^(#{1,6})\s+(.*)$/;
const linkRegex = /\[([^\]]+)]\((https?:\/\/[^\s)]+)\)/g;
const imageRegex = /!\[[^\]]*]\((https?:\/\/[^\s)]+)\)/g;

const normalize = (text: string): string => text.replace(/\r\n/g, '\n').trim();

/**
 * Removes Wikipedia-style citation markers like [1], [2], [1][2], etc.
 */
const stripCitationMarkers = (text: string): string =>
  text
    .replace(/\[(\d+)]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const sentenceTokens = (text: string): string[] =>
  text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => stripCitationMarkers(sentence).trim())
    .filter((sentence) => sentence.length > 0);

const collectLinks = (value: string): { links: string[]; media: string[] } => {
  const links: string[] = [];
  const media: string[] = [];
  const matchAll = (regex: RegExp, target: 'link' | 'media') => {
    const cloned = new RegExp(regex);
    let match: RegExpExecArray | null;
    while ((match = cloned.exec(value)) !== null) {
      if (target === 'media') {
        media.push(match[1]);
      } else {
        links.push(match[2]);
      }
    }
  };
  matchAll(imageRegex, 'media');
  matchAll(linkRegex, 'link');
  return { links, media };
};

export const parseMarkdownArticle = (
  topic: Topic,
  markdown: string,
  context: { source: 'wikipedia' | 'grokipedia'; sourceUrl: string; fetchedAt: string },
): ParsedArticle => {
  const clean = normalize(markdown);
  const lines = clean.split('\n');
  const sections: ParsedSection[] = [];
  let buffer: string[] = [];
  let currentTitle = topic.title;
  let currentLevel = 1;

  const flush = () => {
    if (!buffer.length) return;
    const rawContent = buffer.join('\n').trim();
    const content = stripCitationMarkers(rawContent);
    const sentences = sentenceTokens(content);
    const { links, media } = collectLinks(rawContent);
    sections.push({
      level: currentLevel,
      title: currentTitle,
      content,
      sentences,
      links,
      media,
    });
    buffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.length) {
      buffer.push('');
      continue;
    }
    const headingMatch = line.match(headingRegex);
    if (headingMatch) {
      flush();
      currentLevel = headingMatch[1].length;
      currentTitle = headingMatch[2].trim();
    } else {
      buffer.push(line);
    }
  }
  flush();

  const joined = sections.map((section) => section.content).join('\n\n');
  const summary = sections.length ? sections[0].content.split('\n')[0] : '';
  const allLinks = Array.from(new Set(sections.flatMap((section) => section.links)));
  const allMedia = Array.from(new Set(sections.flatMap((section) => section.media)));

  return {
    topic_id: topic.id,
    title: topic.title,
    source: context.source,
    source_url: context.sourceUrl,
    fetched_at: context.fetchedAt,
    word_count: joined.split(/\s+/).filter(Boolean).length,
    char_count: joined.length,
    summary,
    sections,
    links: allLinks,
    media: allMedia,
    references: allLinks.filter((href) => href.includes('wikipedia.org') || href.includes('wiki')),
  };
};
