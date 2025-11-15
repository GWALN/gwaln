/**
 * @file src/lib/bias-metrics.ts
 * @description Simple heuristic-based bias measurements (subjectivity, polarity, loaded language).
 * @author Doğu Abaris <abaris@null.net>
 */

const loadedTerms = [
  'alarmist',
  'agenda',
  'bias',
  'woke',
  'skeptic',
  'critics say',
  'so-called',
  'mainstream media',
  'propaganda',
  'controversial',
  'exaggerated',
  'allegedly',
  'reportedly',
  'rumored',
];

const positiveWords = [
  'reliable',
  'credible',
  'scientific',
  'robust',
  'well-established',
  'trusted',
];
const negativeWords = ['fraud', 'hoax', 'fake', 'biased', 'corrupt', 'politicized'];

const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

const scorePolarity = (tokens: string[]): number => {
  let score = 0;
  tokens.forEach((token) => {
    if (positiveWords.includes(token)) score += 1;
    if (negativeWords.includes(token)) score -= 1;
  });
  return score / Math.max(tokens.length, 1);
};

const scoreSubjectivity = (tokens: string[]): number => {
  const subjective = tokens.filter(
    (token) => positiveWords.includes(token) || negativeWords.includes(token),
  );
  return subjective.length / Math.max(tokens.length, 1);
};

const countLoadedTerms = (text: string): Record<string, number> => {
  const counts: Record<string, number> = {};
  loadedTerms.forEach((term) => {
    const pattern = new RegExp(`\\b${term.replace(/\s+/g, '\\s+')}\\b`, 'gi');
    const matches = text.match(pattern);
    if (matches?.length) {
      counts[term] = matches.length;
    }
  });
  return counts;
};

export interface BiasMetrics {
  subjectivity_delta: number;
  polarity_delta: number;
  loaded_terms_grok: Record<string, number>;
  loaded_terms_wiki: Record<string, number>;
}

export const computeBiasMetrics = (wikiText: string, grokText: string): BiasMetrics => {
  const wikiTokens = tokenize(wikiText);
  const grokTokens = tokenize(grokText);
  const wikiSubjectivity = scoreSubjectivity(wikiTokens);
  const grokSubjectivity = scoreSubjectivity(grokTokens);
  const wikiPolarity = scorePolarity(wikiTokens);
  const grokPolarity = scorePolarity(grokTokens);
  return {
    subjectivity_delta: Number((grokSubjectivity - wikiSubjectivity).toFixed(3)),
    polarity_delta: Number((grokPolarity - wikiPolarity).toFixed(3)),
    loaded_terms_grok: countLoadedTerms(grokText),
    loaded_terms_wiki: countLoadedTerms(wikiText),
  };
};
