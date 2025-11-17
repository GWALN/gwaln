## GWALN analyzer overview

This page explains how the GWALN CLI ingests Wikipedia and
Grokipedia content, aligns claims, detects discrepancies, and prepares
reports for human review. Use this document when you need to understand
the internals or explain them to other contributors.

## Normalization workflow

### Snapshot fetchers

* `gwaln fetch wiki` downloads the wikitext of a topic using
  `?action=raw` and records revision metadata, canonical URLs, and page
  languages.
* `gwaln fetch grok` requests the Grokipedia article, converts HTML
  to Markdown with Turndown, removes Grok-specific header banners, and
  retrieves citation metadata through
  `https://grokipedia.com/api/page`.

The CLI stores both outputs under `data/wiki/<topic>.parsed.json` and
`data/grok/<topic>.parsed.json`.

### Structured parser (`src/lib/wiki-structured.ts`)

The parser converts each source into a shared `StructuredArticle`
representation:

* Lead and section blocks with identifiers, anchor names, levels, and
  parent references.
* Sentences with normalized text, token lists, citation/media references,
  and backreferences to claim records.
* Claims (one per sentence) that capture entity labels, normalized
  numbers, optional time hints, and supporting citations.
* Media registry entries (title, caption, alt text, usage context, and
  license placeholders).
* Reference store entries built from `<ref>` tags, Markdown links, and
  Grokipedia API citations.

The parser also removes leftover Grok header sentences to keep the
content scientific.

## Analyzer pipeline (`src/lib/analyzer.ts`)

### Sentence and section processing

1. Sentences are normalized to lowercase token arrays.
2. Hash sets determine which sentences appear in only one source.
3. The analyzer records total missing and extra sentences, while showing
   only the first five snippets for readability.
4. **Similarity metrics:**
   * **Word similarity:** Token overlap ratio between the two texts,
     measuring vocabulary overlap. This calculates how many words are
     shared between Wikipedia and Grokipedia regardless of sentence
     structure.
   * **Sentence similarity:** Proportion of matching sentences,
     combining identical sentences (full weight) and reworded
     sentences (50% weight). This measures structural alignment at the
     sentence level.
   * **N-gram overlap:** Uses shingle size 4 to capture contiguous
     phrase matches.

### Understanding similarity metrics

The analyzer computes two distinct similarity measurements to provide
comprehensive content comparison:

**Word similarity** measures lexical overlap—the proportion of shared
vocabulary between the two texts. A high word similarity (e.g., 81%)
indicates that both sources discuss the same topic using similar
terminology, even if the information is organized differently or
phrased distinctly.

**Sentence similarity** measures structural alignment—how many complete
sentences match between sources. This metric counts:

* Identical sentences at full weight (1.0)
* Reworded sentences at half weight (0.5)

A low sentence similarity (e.g., 0.2%) despite high word similarity
reveals that sources cover the same topic but express information
through different sentence structures. This distinction is critical:
two articles about the Moon may share 81% of their vocabulary (word
similarity) yet have nearly zero identical sentences (sentence
similarity 0.2%), indicating substantial editorial differences despite
topical overlap.

The HTML report displays both metrics in separate cards, with sentence
similarity positioned first to emphasize structural alignment. Users
can click the sentence similarity card to view identical and reworded
sentence pairs.

### Alignment helpers (`src/lib/alignment.ts`)

* **Sections:** headings are compared with cosine similarity
  (`string-similarity`). Matches above 0.7 get linked; unmatched headers
  become missing/extra sections.
* **Claims:** sentence text uses the same cosine check with a 0.65
  threshold. Unmatched Grok claims indicate hallucinations. Unmatched
  Wiki claims indicate missing context.

### Discrepancy detection (`src/lib/discrepancies.ts`)

* **Numeric differences:** the analyzer compares the first number in each
  aligned claim and flags deviations when
  `|a - b| / max(|a|, |b|)` exceeds 5% and units match.
* **Entity differences:** normalized entity sets (trimmed, lowercase) are
  compared using symmetric difference to catch missing actors or places.
* **Media and citation differences:** set comparisons reveal files or
  URLs present in only one source.

### Bias and hallucination cues

* MOS "words to watch" trigger events only when Grokipedia uses the term
  and Wikipedia does not.
* Subjectivity and polarity deltas come from token ratios in
  `src/lib/bias-metrics.ts`.
* Optional verification hooks call Gemini to cross-check bias events and
  confirm whether extra sentences cite valid references.

### Diff and highlights

`createTwoFilesPatch` produces a truncated unified diff for context.
`buildHighlights` stores short missing and extra snippets for the CLI and
HTML views.

### Structured output (`src/lib/structured-report.ts`)

Analyzer results land in the `gwaln.analysis/2` schema. Each JSON file includes:

* **Stats:** character counts, sentence totals, and missing/extra counts.
* **Similarity ratios:** structured as an object containing:
  * `word`: vocabulary overlap ratio (0.0 to 1.0)
  * `sentence`: sentence-level match ratio (0.0 to 1.0)
* Alignment arrays for sections and claims with similarity scores.
* Numeric and entity discrepancy lists.
* Bias metrics, bias/hallucination events, diff samples, and optional
  verifier responses.
* Confidence labels derived from word similarity and discrepancy density.

### Caching

Each run records the analyzer version, shingle size, and cache TTL.
`analysis/<topic>.json` files are cached through
`src/shared/analysis-cache.ts`. Entries stay "fresh" when:

* the `content_hash` (based on a MediaWiki-style hash of the combined
  wiki and Grok text) matches the current sources, and
* the timestamp falls within the TTL (72 hours by default).

When either condition fails, the analyzer recomputes the report.

## Presentation and publishing

* `gwaln show` prints a terminal summary and can open an HTML
  dashboard that surfaces the same metrics in a flat layout.
* `gwaln notes build` generates JSON-LD ClaimReviews with annotation
  targets referencing both sources.
* `gwaln notes publish` signs and uploads the ClaimReview to the
  OriginTrail DKG, records the returned UAL, and logs publish details.

## Typical workflow

```bash
gwaln fetch wiki --topic moon
gwaln fetch grok --topic moon
gwaln analyse --topic moon --force
gwaln show --topic moon --open-html
gwaln notes build --topic moon
gwaln notes publish --topic moon
```

Following these steps reproduces the entire pipeline from snapshot
capture through DKG publication.
