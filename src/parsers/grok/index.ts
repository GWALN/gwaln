/**
 * @file src/parsers/grok/index.ts
 * @description Grokipedia Markdown parser entry point
 * @author Doğu Abaris <abaris@null.net>
 */

export { parseMarkdownStructuredArticle } from './parser';

export type {
  ArticleMetadata,
  StructuredArticle,
  StructuredLead,
  StructuredParagraph,
  StructuredSentence,
  StructuredSection,
  StructuredMedia,
  StructuredClaim,
  ExternalCitation,
} from './parser';
