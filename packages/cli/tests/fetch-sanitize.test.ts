/**
 * @file tests/fetch-sanitize.test.ts
 * @description Ensures Grokipedia banners are stripped before parsing structured content.
 * @author Doğu Abaris <abaris@null.net>
 */

import { describe, expect, it } from 'vitest';
import { stripGrokBanner } from '@gwaln/core';

describe('stripGrokBanner', () => {
  it('removes fact-check header rows while preserving prose', () => {
    const input = `Moon Search ⌘K Fact-checked by Grok 2 weeks ago

The Moon is Earth's only natural satellite.

## History
Narrative.`;
    const output = stripGrokBanner(input);
    expect(output).toContain("The Moon is Earth's only natural satellite.");
    expect(output).toContain('## History');
    expect(output.toLowerCase()).not.toContain('fact-checked by grok');
    expect(output.toLowerCase()).not.toContain('search ⌘k');
  });
});
