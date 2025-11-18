/**
 * @file src/parsers/wiki/index.ts
 * @description Wikipedia wikitext parser entry point
 * @author Doğu Abaris <abaris@null.net>
 */

export { parseWikiArticle } from './parser';

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

export { stripInfobox, stripMetaTemplates } from './template-handler';

export {
  cleanSentenceText,
  normalizeText,
  tokenize,
  cleanWikiLinks,
  stripHtmlComments,
  stripTables,
  stripFileLinks,
} from './text-cleaner';

export { splitSentences } from './sentence-splitter';
