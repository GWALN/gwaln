import { describe, it, expect } from 'vitest';
import { parseWikiArticle } from '../src/parsers/wiki';

const mockTopic = {
  id: 'test',
  title: 'Test',
  wikipedia_slug: 'Test',
  grokipedia_slug: 'page/Test',
};

const mockMetadata = {
  source: 'wikipedia' as const,
  pageId: 'test',
  lang: 'en',
  title: 'Test',
  canonicalUrl: 'https://en.wikipedia.org/wiki/Test',
  revisionId: '1',
  revisionTimestamp: '2024-01-01T00:00:00Z',
};

describe('Convert template handling', () => {
  it('should convert {{Convert|120|mm|abbr=on}} to "120 mm (4.7 in)"', () => {
    const wikitext = `==Cooling==
The console's cooling system uses a double-sided intake fan that is {{Convert|120|mm|abbr=on}} in diameter and {{Convert|45|mm|abbr=on}} thick, paired with a large [[heat sink]] utilizing a [[heat pipe]] design that Sony claims has a "shape and airflow [which] make it possible to achieve the same performance as a [[vapor chamber]]".`;

    const result = parseWikiArticle(mockTopic, wikitext, mockMetadata);

    const allSentences: string[] = [];
    result.sections.forEach((section) => {
      section.paragraphs.forEach((para) => {
        para.sentences.forEach((sent) => {
          allSentences.push(sent.text);
        });
      });
    });

    const coolingSentence = allSentences.find((s) => s.includes('cooling system'));

    expect(coolingSentence).toBeDefined();
    expect(coolingSentence).toContain('120 mm');
    expect(coolingSentence).toContain('4.7 in');
    expect(coolingSentence).toContain('45 mm');
    expect(coolingSentence).toContain('1.8 in');

    const expected =
      'The console\'s cooling system uses a double-sided intake fan that is 120 mm (4.7 in) in diameter and 45 mm (1.8 in) thick, paired with a large heat sink utilizing a heat pipe design that Sony claims has a "shape and airflow [which] make it possible to achieve the same performance as a vapor chamber".';
    expect(coolingSentence).toBe(expected);
  });

  it('should handle {{cvt|825|GB}} template', () => {
    const wikitext = `==Storage==
The PlayStation 5 features {{cvt|825|GB}} of built-in solid-state storage.`;

    const result = parseWikiArticle(mockTopic, wikitext, mockMetadata);

    const allSentences: string[] = [];
    result.sections.forEach((section) => {
      section.paragraphs.forEach((para) => {
        para.sentences.forEach((sent) => {
          allSentences.push(sent.text);
        });
      });
    });

    const storageSentence = allSentences.find((s) => s.includes('storage'));

    expect(storageSentence).toBeDefined();
    expect(storageSentence).toContain('825');
    expect(storageSentence).toContain('GB');
  });
});
