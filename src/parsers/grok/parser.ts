/**
 * @file src/parsers/grok/parser.ts
 * @description Parses Grokipedia Markdown into the structured GWALN JSON
 *              snapshots consumed by downstream tooling (`data/grok/<topic>.parsed.json`).
 *              The parser focuses on metadata required by the analyzer flow: lead/section sentences,
 *              media usage, references, and lead-derived claims, while staying dependency-light so
 *              the CLI works offline after fetching a snapshot once.
 * @author Doğu Abaris <abaris@null.net>
 */

import type { Topic } from '../../shared/topics';
import { stripInfobox, stripMetaTemplates } from '../wiki';
import {
  cleanSentenceText,
  normalizeText,
  tokenize,
  stripHtmlComments,
  stripTables,
  stripFileLinks,
} from '../wiki';
import { splitSentences, GROK_BANNER_PATTERNS } from '../wiki/sentence-splitter';
import type {
  ArticleMetadata,
  ExternalCitation,
  StructuredSentence,
  StructuredParagraph,
  StructuredLead,
  StructuredSection,
  StructuredMediaUsage,
  StructuredMedia,
  StructuredReference,
  StructuredClaim,
  StructuredArticle,
} from '../shared/types';

export type {
  ArticleMetadata,
  ExternalCitation,
  StructuredSentence,
  StructuredParagraph,
  StructuredLead,
  StructuredSection,
  StructuredMediaUsage,
  StructuredMedia,
  StructuredReference,
  StructuredClaim,
  StructuredArticle,
};

interface ReferenceMatch {
  citationId: string;
  offset: number;
}

interface MediaMatch {
  mediaId: string;
  offset: number;
}

const CLEANUP_TOKENS = new Set([
  'thumb',
  'frameless',
  'upright',
  'left',
  'right',
  'center',
  'centre',
  'none',
]);

const slugify = (value: string, fallback: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized.length ? normalized : fallback;
};

const citationSlug = (value: string): string => {
  const normalized = value.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return normalized.length ? normalized.toLowerCase() : 'ref';
};

const anchorize = (value: string): string =>
  value
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\w:.-]+/g, '');

const splitMarkdownLead = (markdown: string): { leadText: string; bodyText: string } => {
  const headingRegex = /^#{1,6}\s+.*$/m;
  const match = headingRegex.exec(markdown);
  if (!match || match.index === undefined) {
    return { leadText: markdown.trim(), bodyText: '' };
  }
  const leadText = markdown.slice(0, match.index).trim();
  const bodyText = markdown.slice(match.index).trim();
  return { leadText, bodyText };
};

const stripLeadingTitleHeading = (markdown: string, title: string): string => {
  if (!markdown.trim()) {
    return markdown;
  }
  const [firstLine, ...rest] = markdown.split('\n');
  const headingMatch = firstLine.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
  if (!headingMatch) {
    return markdown;
  }
  const normalized = headingMatch[1].trim().toLowerCase();
  if (normalized === title.trim().toLowerCase()) {
    return rest.join('\n').trimStart();
  }
  return markdown;
};

const stripWikiMediaMarkup = (
  text: string,
  registry: MediaRegistry,
  sectionId: string | null,
): { text: string; matches: MediaMatch[] } => {
  const matches: MediaMatch[] = [];
  let output = '';
  let i = 0;

  while (i < text.length) {
    if (text[i] === '[' && text[i + 1] === '[') {
      const startPos = i;
      i += 2;

      const remaining = text.slice(i);
      const fileMatch = remaining.match(/^(File|Image):/i);

      if (fileMatch) {
        i += fileMatch[0].length;
        let depth = 1;
        let content = '';

        while (i < text.length && depth > 0) {
          if (text[i] === '[' && text[i + 1] === '[') {
            content += '[[';
            i += 2;
            depth++;
          } else if (text[i] === ']' && text[i + 1] === ']') {
            depth--;
            if (depth === 0) {
              i += 2;
              break;
            }
            content += ']]';
            i += 2;
          } else {
            content += text[i];
            i++;
          }
        }

        const parts = [];
        let currentPart = '';
        let nestedDepth = 0;

        for (let j = 0; j < content.length; j++) {
          if (content[j] === '[' && content[j + 1] === '[') {
            currentPart += '[[';
            j++;
            nestedDepth++;
          } else if (content[j] === ']' && content[j + 1] === ']') {
            currentPart += ']]';
            j++;
            nestedDepth--;
          } else if (content[j] === '|' && nestedDepth === 0) {
            parts.push(currentPart);
            currentPart = '';
          } else {
            currentPart += content[j];
          }
        }
        if (currentPart) {
          parts.push(currentPart);
        }

        const fileName = parts[0]?.trim() || '';
        const params = parts.slice(1);

        const captionParts: string[] = [];
        let altText: string | null = null;
        let context = 'body';

        for (const param of params) {
          const lower = param.toLowerCase();
          if (CLEANUP_TOKENS.has(lower)) {
            context = lower === 'thumb' ? 'thumb' : context;
            continue;
          }
          if (lower.startsWith('alt=')) {
            altText = param.slice(4).trim();
            continue;
          }
          if (lower.startsWith('link=') || lower.startsWith('class=')) {
            continue;
          }
          captionParts.push(cleanSentenceText(param));
        }

        const caption = captionParts.filter(Boolean).join(' | ') || null;
        const mediaId = registry.registerBodyMedia({
          title: fileName.startsWith('File:') ? fileName : `File:${fileName}`,
          caption,
          alt: altText,
          context,
          sectionId,
        });
        matches.push({ mediaId, offset: output.length });
      } else {
        output += text.slice(startPos, i);
      }
    } else {
      output += text[i];
      i++;
    }
  }

  return { text: output, matches };
};

const stripMarkdownMedia = (
  text: string,
  registry: MediaRegistry,
  sectionId: string | null,
): { text: string; matches: MediaMatch[] } => {
  const matches: MediaMatch[] = [];
  const regex = /!\[([^\]]*)]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let lastIndex = 0;
  let output = '';
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    output += text.slice(lastIndex, match.index);
    const alt = cleanSentenceText(match[1] ?? '');
    const url = match[2]?.trim() ?? '';
    if (url) {
      const mediaId = registry.registerBodyMedia({
        title: url,
        caption: alt || null,
        alt: alt || null,
        context: 'body',
        sectionId,
      });
      matches.push({ mediaId, offset: output.length });
      if (alt) {
        output += alt;
      }
    }
    lastIndex = regex.lastIndex;
  }
  output += text.slice(lastIndex);
  return { text: output, matches };
};

const stripWikiCitations = (
  text: string,
  references: ReferenceStore,
): { text: string; matches: ReferenceMatch[] } => {
  let output = '';
  const matches: ReferenceMatch[] = [];
  const fullRegex = /<ref\b([^>]*)>([\s\S]*?)<\/ref>/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = fullRegex.exec(text)) !== null) {
    output += text.slice(lastIndex, match.index);
    const attrs = match[1];
    const inner = match[2];
    const citationId = references.registerReference(attrs, inner, match[0]);
    matches.push({ citationId, offset: output.length });
    lastIndex = fullRegex.lastIndex;
  }
  output += text.slice(lastIndex);
  const selfRegex = /<ref\b([^>]*)\/>/gi;
  let finalOutput = '';
  lastIndex = 0;
  while ((match = selfRegex.exec(output)) !== null) {
    finalOutput += output.slice(lastIndex, match.index);
    const citationId = references.registerReference(match[1], null, match[0]);
    matches.push({ citationId, offset: finalOutput.length });
    lastIndex = selfRegex.lastIndex;
  }
  finalOutput += output.slice(lastIndex);
  return { text: finalOutput, matches };
};

const stripMarkdownReferences = (
  text: string,
  references: ReferenceStore,
): { text: string; matches: ReferenceMatch[] } => {
  const matches: ReferenceMatch[] = [];
  const regex = /(?<!!)\[([^\]]+)]\((https?:\/\/[^\s)]+)\)/g;
  let lastIndex = 0;
  let output = '';
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    output += text.slice(lastIndex, match.index);
    const label = cleanSentenceText(match[1] ?? '');
    const url = match[2];
    const citationId = references.registerLinkReference(url, label || null);
    matches.push({ citationId, offset: output.length });
    output += label || url;
    lastIndex = regex.lastIndex;
  }
  output += text.slice(lastIndex);
  return { text: output, matches };
};

const parseParagraph = (
  rawParagraph: string,
  prefix: string,
  paragraphIndex: number,
  references: ReferenceStore,
  media: MediaRegistry,
  sectionId: string | null,
  mode: 'wiki' | 'markdown',
): StructuredParagraph | null => {
  const base = mode === 'wiki' ? stripTables(rawParagraph) : rawParagraph;
  const trimmed = base.trim();
  if (!trimmed) return null;
  const paraId = `${prefix}-${paragraphIndex + 1}`;
  const mediaStripped =
    mode === 'wiki'
      ? stripWikiMediaMarkup(trimmed, media, sectionId)
      : stripMarkdownMedia(trimmed, media, sectionId);
  const citationStripped =
    mode === 'wiki'
      ? stripWikiCitations(mediaStripped.text, references)
      : stripMarkdownReferences(mediaStripped.text, references);
  const slices = splitSentences(citationStripped.text.replace(/\n+/g, ' ').trim());
  const sentences: StructuredSentence[] = [];
  slices.forEach((slice, idx) => {
    const text = cleanSentenceText(slice.text);
    if (!text) return;
    if (GROK_BANNER_PATTERNS.some((regex) => regex.test(text))) {
      return;
    }
    const sentenceId = `${paraId}-${idx + 1}`;
    const normalized = normalizeText(text);
    const tokens = tokenize(text);
    const citationIds = citationStripped.matches
      .filter((match) => match.offset >= slice.start && match.offset <= slice.end)
      .map((match) => match.citationId);
    const mediaIds = mediaStripped.matches
      .filter((match) => match.offset >= slice.start && match.offset <= slice.end)
      .map((match) => match.mediaId);
    mediaIds.forEach((id) => media.linkSentence(id, sentenceId));
    sentences.push({
      sentence_id: sentenceId,
      text,
      normalized_text: normalized,
      tokens,
      citation_ids: Array.from(new Set(citationIds)),
      media_ids: Array.from(new Set(mediaIds)),
      claim_ids: [],
    });
  });
  if (!sentences.length) return null;
  return {
    para_id: paraId,
    sentences,
  };
};

const buildLead = (
  text: string,
  references: ReferenceStore,
  media: MediaRegistry,
  mode: 'wiki' | 'markdown',
): { lead: StructuredLead; offsetEnd: number } => {
  const paragraphs: StructuredParagraph[] = [];
  const blocks = text.split(/\n\s*\n/);
  let validIndex = 0;
  blocks.forEach((block) => {
    const paragraph = parseParagraph(block, 'lead', validIndex, references, media, null, mode);
    if (paragraph) {
      paragraphs.push(paragraph);
      validIndex += 1;
    }
  });
  return {
    lead: {
      text_range: { start_offset: 0, end_offset: text.length },
      paragraphs,
    },
    offsetEnd: text.length,
  };
};

const processSections = (
  matches: Array<{ heading: string; level: number; start: number; end: number }>,
  text: string,
  references: ReferenceStore,
  media: MediaRegistry,
  mode: 'wiki' | 'markdown',
): StructuredSection[] => {
  const sections: StructuredSection[] = [];
  if (!matches.length) return sections;
  const stack: Array<{ level: number; id: string }> = [];
  for (let i = 0; i < matches.length; i += 1) {
    const current = matches[i];
    const nextStart = matches[i + 1]?.start ?? text.length;
    const content = text.slice(current.end, nextStart).trim();
    const sectionId = `sec-${slugify(current.heading, `${i + 1}`)}`;
    while (stack.length && stack[stack.length - 1].level >= current.level) {
      stack.pop();
    }
    const parent = stack[stack.length - 1]?.id;
    stack.push({ level: current.level, id: sectionId });
    const paragraphs: StructuredParagraph[] = [];
    const blocks = content.split(/\n\s*\n/);
    blocks.forEach((block, idx) => {
      const paragraph = parseParagraph(block, sectionId, idx, references, media, sectionId, mode);
      if (paragraph) {
        paragraphs.push(paragraph);
      }
    });
    const mediaIds = Array.from(
      new Set(
        paragraphs.flatMap((paragraph) =>
          paragraph.sentences.flatMap((sentence) => sentence.media_ids),
        ),
      ),
    );
    sections.push({
      section_id: sectionId,
      heading: current.heading,
      level: current.level,
      anchor: anchorize(current.heading),
      parent_section_id: parent,
      media_ids: mediaIds.length ? mediaIds : undefined,
      paragraphs,
    });
  }
  return sections;
};

const buildWikiSections = (
  text: string,
  references: ReferenceStore,
  media: MediaRegistry,
): StructuredSection[] => {
  const headingRegex = /^={2,6}\s*(.*?)\s*={2,6}\s*$/gm;
  const matches: Array<{ heading: string; level: number; start: number; end: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(text)) !== null) {
    const level = match[0].match(/^=+/)?.[0].length ?? 2;
    matches.push({
      heading: match[1].trim(),
      level,
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return processSections(matches, text, references, media, 'wiki');
};

const buildMarkdownSections = (
  text: string,
  references: ReferenceStore,
  media: MediaRegistry,
): StructuredSection[] => {
  const headingRegex = /^#{1,6}\s+(.*?)\s*#*\s*$/gm;
  const matches: Array<{ heading: string; level: number; start: number; end: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(text)) !== null) {
    const level = match[0].match(/^#+/)?.[0].length ?? 1;
    matches.push({
      heading: match[1].trim(),
      level,
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return processSections(matches, text, references, media, 'markdown');
};

const fallbackEntities = (text: string): string[] => {
  const matches = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g) ?? [];
  return Array.from(
    new Set(
      matches
        .map((candidate) => candidate.trim())
        .filter(
          (value) =>
            value.split(' ').length <= 4 && value.length > 2 && !/^[A-Z][a-z]?$/.test(value),
        ),
    ),
  );
};

const extractEntities = (
  text: string,
): Array<{ label: string; type: string | null; qid: string | null }> => {
  const entities: Array<{ label: string; type: string | null; qid: string | null }> = [];
  const regex = /\[\[([^|]+)(\|([^]]+))]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const target = match[1].trim();
    const label = match[3]?.trim() ?? target;
    entities.push({ label, type: null, qid: null });
  }
  if (!entities.length) {
    fallbackEntities(text).forEach((label) => {
      entities.push({ label, type: null, qid: null });
    });
  }
  return entities;
};

const detectTime = (text: string): { unit: string; value: number } | null => {
  const dayMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:day|days)\b/i);
  if (dayMatch) {
    const value = Number.parseFloat(dayMatch[1]);
    if (!Number.isNaN(value)) {
      return { unit: 'day', value };
    }
  }
  return null;
};

const normalizeUnit = (unit: string | null): string | null => {
  if (!unit) return null;
  const cleaned = unit.trim().toLowerCase();
  if (/^kilomet/.test(cleaned) || cleaned === 'km') return 'km';
  if (cleaned === 'm' || cleaned === 'meter' || cleaned === 'meters') return 'm';
  if (cleaned === 'mi' || cleaned.includes('mile')) return 'mi';
  if (cleaned === 'kg' || cleaned.includes('kilogram')) return 'kg';
  if (cleaned === 'g' || cleaned.includes('gram')) return 'g';
  if (cleaned === 'percent' || cleaned === 'percentage') return '%';
  if (cleaned === '%') return '%';
  if (cleaned === 'days' || cleaned === 'day') return 'day';
  if (cleaned.includes('year')) return 'year';
  if (cleaned.includes('c') && cleaned.includes('°')) return '°C';
  if (cleaned.includes('f') && cleaned.includes('°')) return '°F';
  return cleaned || null;
};

const extractNumbers = (
  text: string,
): Array<{ raw: string; value: number; unit: string | null }> => {
  const results: Array<{ raw: string; value: number; unit: string | null }> = [];
  const numberRegex =
    /(\d[\d,.\s]*)(?:\s?[×xe]\s?10(?:\^|[-⁻])?(-?\d+))?(?:\s?(km|kilometres?|kilometers?|miles?|mi|m|meters?|metres?|kg|kilograms?|g|grams?|%|percent|degrees?\s?[cf]|°\s?[cf]|days?|years?))?/gi;
  let match: RegExpExecArray | null;
  while ((match = numberRegex.exec(text)) !== null) {
    const raw = match[0].trim();
    const baseStr = match[1]?.replace(/[\s,]/g, '');
    if (!baseStr) continue;
    let value = Number.parseFloat(baseStr);
    if (Number.isNaN(value)) continue;
    const exponentStr = match[2];
    if (exponentStr !== undefined) {
      const exponent = Number.parseInt(exponentStr, 10);
      if (!Number.isNaN(exponent)) {
        value *= 10 ** exponent;
      }
    }
    const unit = normalizeUnit(match[3] ?? null);
    results.push({ raw, value, unit });
  }
  return results;
};

const buildClaims = (lead: StructuredLead, sections: StructuredSection[]): StructuredClaim[] => {
  const claims: StructuredClaim[] = [];
  let counter = 1;
  const collect = (paragraphs: StructuredParagraph[]): void => {
    for (const sentence of paragraphs.flatMap((paragraph) => paragraph.sentences)) {
      if (!sentence.text.trim()) continue;
      const claimId = `c${counter}`;
      sentence.claim_ids = [claimId];
      claims.push({
        claim_id: claimId,
        text: sentence.text,
        normalized_text: sentence.normalized_text,
        entities: extractEntities(sentence.text),
        time: detectTime(sentence.text),
        numbers: extractNumbers(sentence.text),
        citation_ids: sentence.citation_ids,
      });
      counter += 1;
    }
  };
  collect(lead.paragraphs);
  sections.forEach((section) => collect(section.paragraphs));
  return claims;
};

interface RegisterBodyMediaInput {
  title: string;
  caption: string | null;
  alt: string | null;
  context: string;
  sectionId: string | null;
}

class MediaRegistry {
  private counter = 1;
  private media = new Map<string, StructuredMedia>();

  registerBodyMedia(input: RegisterBodyMediaInput): string {
    let baseId = slugify(input.title.replace(/^File:/i, ''), `${this.counter}`);
    if (!baseId) {
      baseId = `${this.counter}`;
    }
    const mediaId = `m_${baseId}`;
    if (!this.media.has(mediaId)) {
      this.media.set(mediaId, {
        media_id: mediaId,
        title: input.title.startsWith('File:') ? input.title : `File:${input.title}`,
        type: 'image',
        origin: 'body',
        caption: input.caption,
        alt_text: input.alt,
        license: { name: null, short_name: null, url: null },
        usage: [{ context: input.context, section_id: input.sectionId, sentence_id: null }],
      });
      this.counter += 1;
    } else {
      const existing = this.media.get(mediaId);
      existing?.usage.push({
        context: input.context,
        section_id: input.sectionId,
        sentence_id: null,
      });
    }
    return mediaId;
  }

  linkSentence(mediaId: string, sentenceId: string): void {
    const entry = this.media.get(mediaId);
    if (!entry) return;
    for (const usage of entry.usage) {
      if (usage.sentence_id === null) {
        usage.sentence_id = sentenceId;
        break;
      }
    }
  }

  toArray(): StructuredMedia[] {
    return Array.from(this.media.values());
  }
}

class ReferenceStore {
  private counter = 1;
  private linkCounter = 1;
  private byName = new Map<string, StructuredReference>();
  private anon = new Map<string, StructuredReference>();
  private links = new Map<string, StructuredReference>();
  private external = new Map<string, StructuredReference>();

  registerReference(attrsRaw: string, inner: string | null, raw: string): string {
    const nameMatch = attrsRaw?.match(/name\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
    const refName = nameMatch ? (nameMatch[1] ?? nameMatch[2] ?? nameMatch[3]) : null;
    if (refName) {
      const key = refName.toLowerCase();
      const existing = this.byName.get(key);
      if (!existing || (inner && !existing.raw.includes('</ref>'))) {
        const created = this.createReference(refName, raw, inner);
        this.byName.set(key, created);
        return created.citation_id;
      }
      return existing.citation_id;
    }
    const anonId = `r_auto_${this.counter}`;
    if (!this.anon.has(anonId)) {
      this.anon.set(anonId, this.createReference(null, raw, inner));
      this.counter += 1;
    }
    return anonId;
  }

  private createReference(
    name: string | null,
    raw: string,
    inner: string | null,
  ): StructuredReference {
    const normalized = normalizeReference(inner);
    return {
      citation_id: name ? `r_${citationSlug(name)}` : `r_auto_${this.counter}`,
      name,
      raw: raw.trim(),
      normalized,
    };
  }

  registerLinkReference(url: string, title?: string | null): string {
    const key = url.trim();
    if (!key) {
      return `r_link_${this.linkCounter++}`;
    }
    if (!this.links.has(key)) {
      const citation_id = `r_link_${this.linkCounter++}`;
      const normalizedTitle = title ?? url;
      this.links.set(key, {
        citation_id,
        name: title ?? null,
        raw: url,
        normalized: {
          type: 'web',
          title: normalizedTitle,
          publisher: null,
          journal: null,
          year: null,
          url,
        },
      });
    }
    return this.links.get(key)!.citation_id;
  }

  registerExternalReferences(entries: ExternalCitation[], prefix: string): void {
    for (const entry of entries) {
      const url = entry.url?.trim();
      if (!url) continue;
      const slug = entry.id ? slugify(entry.id, entry.id) : slugify(url, `${this.linkCounter}`);
      const citationId = `${prefix}_citation_${slug}`;
      if (this.external.has(citationId)) continue;
      this.external.set(citationId, {
        citation_id: citationId,
        name: entry.title ?? null,
        raw: entry.description?.trim() || url,
        normalized: {
          type: 'web',
          title: entry.title ?? entry.description ?? url,
          publisher: null,
          journal: null,
          year: null,
          url,
        },
      });
    }
  }

  toArray(): StructuredReference[] {
    return [
      ...this.byName.values(),
      ...this.anon.values(),
      ...this.links.values(),
      ...this.external.values(),
    ];
  }
}

const normalizeReference = (
  inner: string | null,
): {
  type: string | null;
  title: string | null;
  publisher?: string | null;
  journal?: string | null;
  year: number | null;
  url: string | null;
  doi?: string | null;
} => {
  if (!inner) {
    return {
      type: null,
      title: null,
      publisher: null,
      journal: null,
      year: null,
      url: null,
      doi: null,
    };
  }
  const citeMatch = inner.match(/{{\s*cite\s+([^\s|}]+)([^}]*)}/i);
  if (!citeMatch) {
    return {
      type: null,
      title: cleanSentenceText(inner) || null,
      publisher: null,
      journal: null,
      year: null,
      url: null,
      doi: null,
    };
  }
  const type = citeMatch[1]?.trim().toLowerCase() ?? null;
  const fieldsText = citeMatch[2] ?? '';
  const fieldParts = fieldsText
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
  const fields: Record<string, string> = {};
  for (const part of fieldParts) {
    const [key, ...rest] = part.split('=');
    if (!key || !rest.length) continue;
    fields[key.trim().toLowerCase()] = rest.join('=').trim();
  }
  const yearValue = fields.year ?? fields.date ?? null;
  const year = yearValue ? Number.parseInt(yearValue.replace(/\D/g, ''), 10) : null;
  return {
    type,
    title: fields.title ?? null,
    publisher: fields.publisher ?? fields.work ?? null,
    journal: fields.journal ?? null,
    year: Number.isNaN(year) ? null : year,
    url: fields.url ?? null,
    doi: fields.doi ?? null,
  };
};

export const parseWikiArticle = (
  topic: Topic,
  wikitext: string,
  metadata: ArticleMetadata,
): StructuredArticle => {
  const referenceStore = new ReferenceStore();
  const mediaRegistry = new MediaRegistry();
  const trimmed = wikitext.trim();
  const remainder = stripInfobox(trimmed);
  const withoutFiles = stripFileLinks(remainder);
  const cleaned = stripMetaTemplates(withoutFiles);
  const firstHeadingMatch = cleaned.match(/^={2,6}[\s\S]*$/m);
  const leadEnd =
    firstHeadingMatch && firstHeadingMatch.index !== undefined
      ? firstHeadingMatch.index
      : cleaned.length;
  const leadText = cleaned.slice(0, leadEnd).trim();
  const bodyText = cleaned.slice(leadEnd).trim();
  const { lead } = buildLead(leadText, referenceStore, mediaRegistry, 'wiki');
  const sections = buildWikiSections(bodyText, referenceStore, mediaRegistry);
  const claims = buildClaims(lead, sections);
  return {
    source: metadata.source,
    page_id: metadata.pageId,
    lang: metadata.lang || 'en',
    title: metadata.title || topic.title,
    canonical_url: metadata.canonicalUrl,
    revision: {
      id: metadata.revisionId,
      timestamp: metadata.revisionTimestamp,
    },
    lead,
    sections,
    media: mediaRegistry.toArray(),
    references: referenceStore.toArray(),
    claims,
  };
};

interface MarkdownParserOptions {
  citations?: ExternalCitation[];
}

export const parseMarkdownStructuredArticle = (
  topic: Topic,
  markdown: string,
  metadata: ArticleMetadata,
  options?: MarkdownParserOptions,
): StructuredArticle => {
  const referenceStore = new ReferenceStore();
  const mediaRegistry = new MediaRegistry();
  const sanitized = stripHtmlComments(markdown);
  const trimmed = sanitized.trim();
  if (options?.citations?.length) {
    referenceStore.registerExternalReferences(options.citations, metadata.source);
  }
  const headingStripped = stripLeadingTitleHeading(trimmed, metadata.title ?? topic.title);
  const { leadText, bodyText: normalizedBodyText } = splitMarkdownLead(headingStripped);
  let { lead } = buildLead(leadText, referenceStore, mediaRegistry, 'markdown');
  const sections = normalizedBodyText
    ? buildMarkdownSections(normalizedBodyText, referenceStore, mediaRegistry)
    : [];
  if (!lead.paragraphs.length && !sections.length && normalizedBodyText.trim().length) {
    lead = buildLead(normalizedBodyText, referenceStore, mediaRegistry, 'markdown').lead;
  }
  if (!lead.paragraphs.length && sections.length) {
    const candidateParagraph =
      sections
        .flatMap((section) => section.paragraphs)
        .find((paragraph) => paragraph.sentences.some((sentence) => sentence.text.length > 80)) ??
      sections[0].paragraphs[0];
    if (candidateParagraph) {
      const clonedSentences = candidateParagraph.sentences.map((sentence, idx) => ({
        ...sentence,
        sentence_id: `lead-1-${idx + 1}`,
        claim_ids: [],
      }));
      lead = {
        text_range: {
          start_offset: 0,
          end_offset: clonedSentences.reduce((sum, sentence) => sum + sentence.text.length, 0),
        },
        paragraphs: [{ para_id: 'lead-1', sentences: clonedSentences }],
      };
    }
  }
  const claims = buildClaims(lead, sections);
  return {
    source: metadata.source,
    page_id: metadata.pageId,
    lang: metadata.lang || 'en',
    title: metadata.title || topic.title,
    canonical_url: metadata.canonicalUrl,
    revision: {
      id: metadata.revisionId,
      timestamp: metadata.revisionTimestamp,
    },
    lead,
    sections,
    media: mediaRegistry.toArray(),
    references: referenceStore.toArray(),
    claims,
  };
};
