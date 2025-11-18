/**
 * @file src/parsers/shared/types.ts
 * @description Shared types for Wikipedia and Grokipedia parsers
 * @author Doğu Abaris <abaris@null.net>
 */

export interface ArticleMetadata {
  source: 'wikipedia' | 'grokipedia';
  pageId: string;
  lang: string;
  title: string;
  canonicalUrl: string;
  revisionId: string;
  revisionTimestamp: string;
}

export interface ExternalCitation {
  id?: string;
  title?: string;
  description?: string;
  url: string;
  favicon?: string | null;
}

export interface StructuredSentence {
  sentence_id: string;
  text: string;
  normalized_text: string;
  tokens: string[];
  citation_ids: string[];
  media_ids: string[];
  claim_ids: string[];
}

export interface StructuredParagraph {
  para_id: string;
  sentences: StructuredSentence[];
}

export interface StructuredLead {
  text_range: { start_offset: number; end_offset: number };
  paragraphs: StructuredParagraph[];
}

export interface StructuredSection {
  section_id: string;
  heading: string;
  level: number;
  anchor: string;
  parent_section_id?: string;
  media_ids?: string[];
  paragraphs: StructuredParagraph[];
}

export interface StructuredMediaUsage {
  context: string;
  section_id: string | null;
  sentence_id: string | null;
}

export interface StructuredMedia {
  media_id: string;
  title: string;
  type: 'image' | 'audio' | 'video' | 'unknown';
  origin: 'infobox' | 'body';
  caption: string | null;
  alt_text: string | null;
  license: {
    name: string | null;
    short_name: string | null;
    url: string | null;
  };
  usage: StructuredMediaUsage[];
}

export interface StructuredReference {
  citation_id: string;
  name: string | null;
  raw: string;
  normalized: {
    type: string | null;
    title: string | null;
    publisher?: string | null;
    journal?: string | null;
    year: number | null;
    url: string | null;
    doi?: string | null;
  };
}

export interface StructuredClaim {
  claim_id: string;
  text: string;
  normalized_text: string;
  entities: Array<{ label: string; type: string | null; qid: string | null }>;
  time: { unit: string; value: number } | null;
  numbers: Array<{ raw: string; value: number; unit: string | null }>;
  citation_ids: string[];
}

export interface StructuredArticle {
  source: 'wikipedia' | 'grokipedia';
  page_id: string;
  lang: string;
  title: string;
  canonical_url: string;
  revision: { id: string; timestamp: string };
  lead: StructuredLead;
  sections: StructuredSection[];
  media: StructuredMedia[];
  references: StructuredReference[];
  claims: StructuredClaim[];
}

export interface ParsedTemplate {
  name: string;
  params: string[];
  raw: string;
  startIndex: number;
  endIndex: number;
}

export interface SentenceSlice {
  text: string;
  start: number;
  end: number;
}
