## CivicLens analyzer overview

This page explains how the CivicLens CLI ingests Wikipedia and
Grokipedia content, aligns claims, detects discrepancies, and prepares
reports for human review. Use this document when you need to understand
the internals or explain them to other contributors.

## Normalization workflow

### Snapshot fetchers

- `civiclens fetch wiki` downloads the wikitext of a topic using
  `?action=raw` and records revision metadata, canonical URLs, and page
  languages.
- `civiclens fetch grok` requests the Grokipedia article, converts HTML
  to Markdown with Turndown, removes Grok-specific header banners, and
  retrieves citation metadata through
  `https://grokipedia.com/api/page`.

The CLI stores both outputs under `data/wiki/<topic>.parsed.json` and
`data/grok/<topic>.parsed.json`.

### Structured parser (`src/lib/wiki-structured.ts`)

The parser converts each source into a shared `StructuredArticle`
representation:

- Lead and section blocks with identifiers, anchor names, levels, and
  parent references.
- Sentences with normalized text, token lists, citation/media references,
  and backreferences to claim records.
- Claims (one per sentence) that capture entity labels, normalized
  numbers, optional time hints, and supporting citations.
- Media registry entries (title, caption, alt text, usage context, and
  license placeholders).
- Reference store entries built from `<ref>` tags, Markdown links, and
  Grokipedia API citations.

The parser also removes leftover Grok header sentences to keep the
content scientific.

## Analyzer pipeline (`src/lib/analyzer.ts`)

### Sentence and section processing

1. Sentences are normalized to lowercase token arrays.
2. Hash sets determine which sentences appear in only one source.
3. The analyzer records total missing and extra sentences, while showing
   only the first five snippets for readability.
4. Similarity ratio comes from token overlap; n-gram overlap uses
   shingle size 4 to capture contiguous matches.

### Alignment helpers (`src/lib/alignment.ts`)

- **Sections:** headings are compared with cosine similarity
  (`string-similarity`). Matches above 0.7 get linked; unmatched headers
  become missing/extra sections.
- **Claims:** sentence text uses the same cosine check with a 0.65
  threshold. Unmatched Grok claims indicate hallucinations. Unmatched
  Wiki claims indicate missing context.

### Discrepancy detection (`src/lib/discrepancies.ts`)

- **Numeric differences:** the analyzer compares the first number in each
  aligned claim and flags deviations when
  `|a - b| / max(|a|, |b|)` exceeds 5% and units match.
- **Entity differences:** normalized entity sets (trimmed, lowercase) are
  compared using symmetric difference to catch missing actors or places.
- **Media and citation differences:** set comparisons reveal files or
  URLs present in only one source.

### Bias and hallucination cues

- MOS "words to watch" trigger events only when Grokipedia uses the term
  and Wikipedia does not.
- Subjectivity and polarity deltas come from token ratios in
  `src/lib/bias-metrics.ts`.
- Optional verification hooks call Gemini to cross-check bias events and
  confirm whether extra sentences cite valid references.

### Diff and highlights

`createTwoFilesPatch` produces a truncated unified diff for context.
`buildHighlights` stores short missing and extra snippets for the CLI and
HTML views.

### Structured output (`src/lib/structured-report.ts`)

Analyzer results land in the `civiclens.analysis/2` schema. Each JSON file includes:

- Stats: character counts, sentence totals, similarity ratios, and
  missing/extra counts.
- Alignment arrays for sections and claims with similarity scores.
- Numeric and entity discrepancy lists.
- Bias metrics, bias/hallucination events, diff samples, and optional
  verifier responses.
- Confidence labels derived from similarity and discrepancy density.

### Caching

Each run records the analyzer version, shingle size, and cache TTL.
`analysis/<topic>.json` files are cached through
`src/shared/analysis-cache.ts`. Entries stay "fresh" when:

- the `content_hash` (based on a MediaWiki-style hash of the combined
  wiki and Grok text) matches the current sources, and
- the timestamp falls within the TTL (72 hours by default).

When either condition fails, the analyzer recomputes the report.

## Presentation and publishing

- `civiclens show` prints a terminal summary and can open an HTML
  dashboard that surfaces the same metrics in a flat layout.
- `civiclens notes build` generates JSON-LD ClaimReviews with annotation
  targets referencing both sources.
- `civiclens notes publish` signs and uploads the ClaimReview to the
  OriginTrail DKG, records the returned UAL, and logs publish details.

## Typical workflow

```bash
civiclens fetch wiki --topic moon
civiclens fetch grok --topic moon
civiclens analyse --topic moon --force
civiclens show --topic moon --open-html
civiclens notes build --topic moon
civiclens notes publish --topic moon
```

Following these steps reproduces the entire pipeline from snapshot
capture through DKG publication.
