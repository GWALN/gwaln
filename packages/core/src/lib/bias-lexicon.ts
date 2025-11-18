/**
 * @file src/lib/bias-lexicon.ts
 * @description Canonical list of "words to watch" categories used for lightweight bias detection.
 * @author Doğu Abaris <abaris@null.net>
 */

export interface BiasPattern {
  label: string;
  regex: RegExp;
}

export interface BiasCategory {
  id: string;
  label: string;
  description: string;
  reference: string;
  severity: number;
  patterns: BiasPattern[];
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const wordPattern = (word: string): BiasPattern => ({
  label: word,
  regex: new RegExp(`\\b${escapeRegExp(word)}\\b`, 'i'),
});

const phrasePattern = (phrase: string): BiasPattern => ({
  label: phrase,
  regex: new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'i'),
});

const suffixPattern = (label: string, expression: RegExp): BiasPattern => ({
  label,
  regex: expression,
});

export const biasCategories: BiasCategory[] = [
  {
    id: 'puffery',
    label: 'Peacock / puffery terms',
    description: 'Replace promotional adjectives with sourced facts (Wikipedia MOS:PUFFERY).',
    reference: 'MOS:PUFFERY',
    severity: 2,
    patterns: [
      'legendary',
      'iconic',
      'visionary',
      'outstanding',
      'celebrated',
      'award-winning',
      'landmark',
      'cutting-edge',
      'innovative',
      'revolutionary',
      'extraordinary',
      'brilliant',
      'renowned',
      'remarkable',
      'prestigious',
      'world-class',
      'virtuoso',
      'pioneering',
      'phenomenal',
      'prominent',
      'best',
      'greatest',
    ].map(wordPattern),
  },
  {
    id: 'contentious_labels',
    label: 'Contentious labels',
    description: 'Value-laden labels need neutral wording or attribution (Wikipedia MOS:LABEL).',
    reference: 'MOS:LABEL',
    severity: 3,
    patterns: [
      ...[
        'cult',
        'racist',
        'sexist',
        'homophobic',
        'transphobic',
        'misogynistic',
        'extremist',
        'denialist',
        'terrorist',
        'freedom fighter',
        'bigot',
        'myth',
        'neo-nazi',
        'controversial',
        'perverted',
        'fundamentalist',
        'heretic',
        'sect',
        'conspiracy',
      ].map(wordPattern),
      suffixPattern('-gate suffix', /\b[a-z0-9]+gate\b/i),
      suffixPattern('pseudo- prefix', /\bpseudo[a-z0-9-]+\b/i),
    ],
  },
  {
    id: 'weasel_words',
    label: 'Weasel wording',
    description:
      'Vague attributions should be replaced with concrete sourcing (Wikipedia MOS:WEASEL).',
    reference: 'MOS:WEASEL',
    severity: 2,
    patterns: [
      'some people say',
      'many people',
      'many scholars',
      'it is believed',
      'many are of the opinion',
      'most feel',
      'experts declare',
      'it is widely thought',
      'it is often said',
      'scientists claim',
      'research has shown',
      'it is often reported',
      'officially',
      'widely regarded',
    ].map(phrasePattern),
  },
  {
    id: 'expressions_of_doubt',
    label: 'Expressions of doubt',
    description:
      "Terms such as 'alleged' or 'so-called' should be sourced (Wikipedia MOS:ALLEGED).",
    reference: 'MOS:ALLEGED',
    severity: 2,
    patterns: ['supposed', 'apparent', 'purported', 'alleged', 'accused', 'so-called'].map(
      wordPattern,
    ),
  },
  {
    id: 'editorializing',
    label: 'Editorializing adverbs',
    description:
      "Avoid instructive adverbs like 'clearly' or 'of course' unless quoting a source (Wikipedia MOS:EDITORIAL).",
    reference: 'MOS:EDITORIAL',
    severity: 1,
    patterns: [
      'notably',
      'interestingly',
      'essentially',
      'utterly',
      'actually',
      'only',
      'clearly',
      'obviously',
      'naturally',
      'of course',
      'fortunately',
      'unfortunately',
      'happily',
      'sadly',
      'tragically',
      'arguably',
    ].map(wordPattern),
  },
];
