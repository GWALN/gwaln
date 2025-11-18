/**
 * @file src/workflows/fetch-workflow.ts
 * @description Downloads Grokipedia and Wikipedia articles, normalizes them into structured JSON,
 *              and stores the snapshots under `data/wiki|grok/<topic>.parsed.json`. These files
 *              become the canonical inputs for `gwaln analyse`.
 * @author Doğu Abaris <abaris@null.net>
 */

import { load as loadHtml } from 'cheerio';
import fetch from 'node-fetch';
import fs from 'node:fs';
import path from 'node:path';
import TurndownService from 'turndown';
import { parseMarkdownStructuredArticle } from '../parsers/grok';
import { ArticleMetadata, ExternalCitation } from '../parsers/shared/types';
import { parseWikiArticle } from '../parsers/wiki';
import { paths } from '../shared/paths';
import { loadTopics, selectTopics, Topic } from '../shared/topics';

export type FetchSource = 'wiki' | 'grok' | 'both';

const WIKI_BASE_URL = 'https://en.wikipedia.org';
const WIKI_API = `${WIKI_BASE_URL}/w/api.php`;
const GROK_ENDPOINT = 'https://grokipedia.com/{slug}';
const GROK_API_ENDPOINT = 'https://grokipedia.com/api/page';
const USER_AGENT = 'GWALN-MVP/0.2 (+https://origintrail.io)';
const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
});

const normalizeMediaUrl = (src: string, baseUrl: string): string => {
  if (!src) return '';
  if (src.startsWith('http://') || src.startsWith('https://')) {
    return src;
  }
  if (src.startsWith('//')) {
    return `https:${src}`;
  }
  if (src.startsWith('/')) {
    return new URL(src, baseUrl).toString();
  }
  return new URL(src, baseUrl).toString();
};

const sanitizeArticleHtml = (html: string, baseUrl: string): { html: string; media: string[] } => {
  try {
    const $ = loadHtml(html);
    const mediaLinks = new Set<string>();
    $("style, script, noscript, link[rel='stylesheet']").remove();
    $(
      [
        '.mw-editsection',
        '.reference',
        'sup.reference',
        '.mw-empty-elt',
        '.mw-jump-link',
        'table.infobox',
        'table.vertical-navbox',
        'table.navbox',
        'table.metadata',
        'div#toc',
        '#toc',
        'div.shortdescription',
        'div.hatnote',
        'div.stub',
        'div.portal',
        'div.navbox',
        'header',
        'nav',
        'footer',
        'aside',
        '.sidebar',
        '.drawer',
        '.site-header',
        '.site-footer',
      ].join(', '),
    ).remove();
    $('a').each((_, element) => {
      const text = $(element).text();
      const href = $(element).attr('href');
      if (href && /#cite_note-/.test(href) && text?.trim().startsWith('[')) {
        $(element).replaceWith(text ?? '');
      } else {
        $(element).replaceWith(text ?? '');
      }
    });
    $('strong, b, em, i').each((_, element) => {
      const text = $(element).text();
      $(element).replaceWith(text ?? '');
    });
    $('img').each((_, element) => {
      const src = $(element).attr('src') ?? $(element).attr('data-src');
      if (src) {
        mediaLinks.add(normalizeMediaUrl(src, baseUrl));
      }
      $(element).remove();
    });
    $('*')
      .contents()
      .filter((_, node) => node.type === 'comment')
      .remove();
    const root = $('.mw-parser-output');
    const inner = root.length ? root.html() : $.root().html();
    if (!inner || !inner.trim()) {
      return { html, media: Array.from(mediaLinks) };
    }
    return { html: `<div>${inner.trim()}</div>`, media: Array.from(mediaLinks) };
  } catch {
    return { html, media: [] };
  }
};

const normalizeMarkdown = (markdown: string): string => {
  let output = markdown;
  output = output.replace(/\*{2}([^*]+)\*{2}/g, '$1');
  output = output.replace(/__([^_]+)__/g, '$1');
  output = output.replace(/\*([^*]+)\*/g, '$1');
  output = output.replace(/_([^_]+)_/g, '$1');
  output = output.replace(/`([^`]+)`/g, '$1');
  output = output.replace(/\{\{([^}]+)\}\}/g, '$1');
  output = output.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
  output = output.replace(/Portals:\n(?:-.*\n)+/g, '');
  output = output.replace(/\s+\n/g, '\n');
  output = output.replace(/\n{3,}/g, '\n\n');
  output = output.replace(/\[([^\]]+)]\(([^)\s]+(?:\s"[^"]+")?)\)/g, (_, text) => text);
  output = output.replace(/\\\[(\d+)\\\]/g, '');
  output = output.replace(/\[(\d+)\]/g, '');

  return output.trim();
};

const htmlToMarkdown = (html: string, baseUrl: string): string => {
  const { html: sanitized, media } = sanitizeArticleHtml(html, baseUrl);
  let markdown = turndown.turndown(sanitized).trim();
  markdown = normalizeMarkdown(markdown);
  if (media.length) {
    const uniqueMedia = Array.from(new Set(media));
    const filesBlock = ['## Files', ...uniqueMedia.map((url) => `- ${url}`)].join('\n');
    return `${markdown}\n\n${filesBlock}`.trim();
  }
  return markdown;
};

const looksLikeHtml = (value: string): boolean => /^<[^>]+>/.test(value.trim());

const writeParsedSnapshot = (dir: string, topic: Topic, payload: unknown): string => {
  paths.ensureDir(dir);
  const target = path.join(dir, `${topic.id}.parsed.json`);
  fs.writeFileSync(target, JSON.stringify(payload, null, 2), 'utf8');
  return target;
};

const fetchWithRetry = async (url: string): Promise<string> => {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!response.ok) {
    const snippet = (await response.text()).slice(0, 200);
    throw new Error(`HTTP ${response.status} ${response.statusText} (${snippet})`);
  }
  return await response.text();
};

const fetchWikiMetadata = async (topic: Topic): Promise<ArticleMetadata> => {
  const params = new URLSearchParams({
    action: 'query',
    prop: 'info|revisions',
    inprop: 'url',
    rvprop: 'ids|timestamp',
    rvlimit: '1',
    titles: topic.wikipedia_slug,
    format: 'json',
    formatversion: '2',
  });
  const url = `${WIKI_API}?${params.toString()}`;
  const raw = await fetchWithRetry(url);
  const payload = JSON.parse(raw) as {
    query?: {
      pages?: Array<{
        pageid?: number;
        title?: string;
        canonicalurl?: string;
        fullurl?: string;
        pagelanguage?: string;
        revisions?: Array<{ revid?: number; timestamp?: string }>;
      }>;
    };
  };
  const page = payload.query?.pages?.[0];
  if (!page) {
    throw new Error(`Unable to load metadata for Wikipedia page '${topic.wikipedia_slug}'`);
  }
  const revision = page.revisions?.[0];
  const lang = page.pagelanguage ?? 'en';
  return {
    source: 'wikipedia',
    pageId: `${lang}:${topic.wikipedia_slug}`,
    lang,
    title: page.title ?? topic.title,
    canonicalUrl:
      page.canonicalurl ?? page.fullurl ?? `https://en.wikipedia.org/wiki/${topic.wikipedia_slug}`,
    revisionId: revision?.revid ? String(revision.revid) : `${topic.wikipedia_slug}-unknown`,
    revisionTimestamp: revision?.timestamp ?? new Date().toISOString(),
  };
};

const fetchWikiWikitext = async (topic: Topic): Promise<{ url: string; wikitext: string }> => {
  const slug = topic.wikipedia_slug.replace(/\s+/g, '_');
  const url = `${WIKI_BASE_URL}/wiki/${encodeURIComponent(slug)}?action=raw`;
  const wikitext = await fetchWithRetry(url);
  return { url, wikitext };
};

interface GrokApiCitation {
  id?: string;
  title?: string;
  description?: string;
  url?: string;
  favicon?: string;
}

interface GrokApiResponse {
  page?: {
    citations?: GrokApiCitation[];
  };
}

const normalizeCitations = (entries: GrokApiCitation[] | undefined): ExternalCitation[] => {
  const normalized: ExternalCitation[] = [];
  if (!entries) return normalized;
  for (const entry of entries) {
    if (!entry?.url) continue;
    normalized.push({
      id: entry.id,
      title: entry.title ?? undefined,
      description: entry.description ?? undefined,
      url: entry.url,
      favicon: entry.favicon ?? undefined,
    });
  }
  return normalized;
};

const readLocalGrokCitations = (topic: Topic): ExternalCitation[] => {
  const filePath = path.join(paths.GROK_DIR, `${topic.id}.parsed.json`);
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const payload = JSON.parse(raw) as {
      references?: Array<{
        citation_id: string;
        raw?: string;
        normalized?: { title?: string | null; url?: string | null };
      }>;
    };
    const restored: ExternalCitation[] = [];
    for (const reference of payload.references ?? []) {
      const url = reference.normalized?.url ?? null;
      if (!url) continue;
      restored.push({
        id: reference.citation_id,
        title: reference.normalized?.title ?? undefined,
        description: reference.raw ?? undefined,
        url,
      });
    }
    return restored;
  } catch {
    return [];
  }
};

const fetchGrokCitations = async (topic: Topic): Promise<ExternalCitation[]> => {
  const slug = topic.grokipedia_slug.replace(/^\/+/, '').replace(/^page\//i, '');
  if (!slug) return [];
  const params = new URLSearchParams({
    slug,
    includeContent: 'false',
    validateLinks: 'true',
  });
  const apiUrl = `${GROK_API_ENDPOINT}?${params.toString()}`;
  try {
    const raw = await fetchWithRetry(apiUrl);
    const payload = JSON.parse(raw) as GrokApiResponse;
    return normalizeCitations(payload.page?.citations);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[grok] unable to load citations for ${topic.id}: ${message}`);
    return readLocalGrokCitations(topic);
  }
};

const fetchWiki = async (topic: Topic): Promise<void> => {
  const [wikitextPayload, metadata] = await Promise.all([
    fetchWikiWikitext(topic),
    fetchWikiMetadata(topic),
  ]);
  const structured = parseWikiArticle(topic, wikitextPayload.wikitext, metadata);
  const target = writeParsedSnapshot(paths.WIKI_DIR, topic, structured);
  console.log(`[wiki] saved ${topic.id} -> ${target}`);
};

export const stripGrokBanner = (markdown: string): string => {
  const lines = markdown.split(/\n+/).filter((line) => {
    const normalized = line.trim().toLowerCase();
    if (!normalized) return false;
    if (normalized.includes('fact-checked by grok')) return false;
    return !(normalized.includes('search ⌘k') || normalized.includes('search cmd+k'));
  });
  return lines.join('\n').trim();
};

const extractGrokContent = (raw: string, baseUrl: string): string => {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    const data = JSON.parse(trimmed) as {
      content?: string;
      body?: string;
      text?: string;
      html?: string;
    };
    const candidate = data.content ?? data.body ?? data.text ?? data.html;
    if (candidate) {
      return looksLikeHtml(candidate) ? htmlToMarkdown(candidate, baseUrl) : candidate;
    }
  } catch {
    /* not JSON – fall back to HTML */
  }

  if (looksLikeHtml(trimmed)) {
    return htmlToMarkdown(trimmed, baseUrl);
  }

  return trimmed;
};

const fetchGrok = async (topic: Topic): Promise<void> => {
  const slug = topic.grokipedia_slug.replace(/^\/+/, '');
  const url = GROK_ENDPOINT.replace('{slug}', slug);
  const raw = await fetchWithRetry(url);
  const citations = await fetchGrokCitations(topic);
  const baseUrl = (() => {
    try {
      return new URL(url).origin;
    } catch {
      return 'https://grokipedia.com';
    }
  })();
  const content = stripGrokBanner(extractGrokContent(raw, baseUrl));
  const markdown = `# ${topic.title}\n\n${content.trim()}`;
  const fetchedAt = new Date().toISOString();
  const metadata: ArticleMetadata = {
    source: 'grokipedia',
    pageId: `grok:${topic.id}`,
    lang: 'en',
    title: topic.title,
    canonicalUrl: url,
    revisionId: `grok-${fetchedAt}`,
    revisionTimestamp: fetchedAt,
  };
  const structured = parseMarkdownStructuredArticle(topic, markdown, metadata, {
    citations,
  });
  const target = writeParsedSnapshot(paths.GROK_DIR, topic, structured);
  console.log(`[grok] saved ${topic.id} -> ${target}`);
};

export const runFetchWorkflow = async (source: FetchSource, topicId?: string): Promise<void> => {
  const topics = loadTopics();
  const selection = selectTopics(topics, topicId);
  for (const topic of selection) {
    try {
      if (source === 'wiki') {
        await fetchWiki(topic);
      } else if (source === 'grok') {
        await fetchGrok(topic);
      } else if (source === 'both') {
        await fetchWiki(topic);
        await fetchGrok(topic);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${source}] failed ${topic.id}: ${message}`);
    }
  }
};
