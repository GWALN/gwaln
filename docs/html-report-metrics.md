# HTML report metrics guide

When you run `gwaln show --topic <topic> --open-html`, GWALN generates an
interactive HTML report comparing Wikipedia and Grokipedia articles. This
guide explains each metric displayed in that report.

## Who should read this

This guide is for:

* Researchers analyzing article discrepancies
* Fact-checkers reviewing content quality
* Contributors who need to understand what the metrics mean
* Anyone wanting to interpret GWALN analysis results

## Prerequisites

Before reading this guide, you should:

* Have run `gwaln analyse` on at least one topic
* Know how to open the HTML report with `gwaln show --open-html`
* Understand that GWALN compares Wikipedia (source of truth) against
  Grokipedia

## Similarity metrics

The HTML report displays three types of similarity metrics that measure
how closely the articles align.

### Word similarity

**What it measures**: Vocabulary overlap between Wikipedia and
Grokipedia using Jaccard similarity.

**How it works**: The analyzer counts unique words in each article,
then calculates what percentage of words appear in both:

```
word_similarity = shared_words / total_unique_words
```

**In the report**: You'll see a percentage (e.g., "81%") showing
vocabulary overlap.

**What it means**:

* High word similarity (≥80%): Articles use similar vocabulary and
  likely discuss the same topics
* Medium word similarity (50-80%): Articles share some common terms
  but may have different focus areas
* Low word similarity (<50%): Articles discuss different topics or
  use very different terminology

**Example**: If Wikipedia's article on "Moon" contains 500 unique
words and Grokipedia's contains 450 unique words, with 400 words
appearing in both, the word similarity is 400/550 = 72.7%.

### Sentence similarity

**What it measures**: Structural alignment at the sentence level.

**How it works**: The analyzer compares every sentence between both
articles. Sentences are categorized as:

* **Identical**: Exact matches after normalization (full weight: 1.0)
* **Reworded**: Similar meaning with ≥65% text similarity (half
  weight: 0.5)
* **Unique**: No corresponding sentence found (weight: 0)

The formula combines these:

```
sentence_similarity = (identical_count × 1.0 + reworded_count × 0.5) / total_sentences
```

**In the report**: You'll see a percentage showing sentence-level
matches. Click the card to view specific identical and reworded
sentence pairs.

**What it means**:

* High sentence similarity (≥70%): Most sentences match or are
  closely reworded
* Medium sentence similarity (30-70%): Some sentences match, but many
  are unique to each source
* Low sentence similarity (<30%): Few sentences match; articles are
  structured very differently

**Important distinction**: You can have high word similarity (81%)
but low sentence similarity (0.2%). This means both articles discuss
the same topic using similar vocabulary, but express information
through completely different sentence structures.

### N-gram overlap

**What it measures**: Phrase-level similarity using 4-word sequences
(called "shingles").

**How it works**: The analyzer slides a 4-word window across both
articles and counts matching sequences:

```
ngram_overlap = common_4word_sequences / total_unique_4word_sequences
```

**Configuration**: The shingle size is set to 4 words
(`SHINGLE_SIZE = 4`).

**In the report**: You'll see a percentage indicating phrase-level
similarity.

**What it means**:

* High n-gram overlap (≥85%): Articles share many identical phrases
  beyond individual words
* Medium n-gram overlap (50-85%): Some phrases match, but articles
  are partially reworded
* Low n-gram overlap (<50%): Few phrases match; extensive rewriting
  or different content

**Why it matters**: N-gram overlap detects paraphrasing better than
word similarity alone. Two articles might use the same words but
arrange them differently.

## Confidence score and labels

The current confidence score expresses how strongly the analyzer believes
the articles **diverge**. A score near 0.0 means “near-identical /
likely copied,” and a score near 1.0 means “independent or divergent
content.” Very high similarity will naturally push the score down.

> Note: Bias cues in the default CLI run come from the keyword detector.
> Semantic transformer-based bias checks are opt-in (`--semantic-bias`)
> and take longer because they load a model.

### How the score is calculated (current behavior)

The score starts at `1 - sentence_similarity`, then applies boosts or
penalties:

* Penalize very high sentence similarity (copying signal).
* Penalize very high word similarity when sentence similarity is low
  (possible paraphrase copying).
* Penalize near-identical section structure; small boost for very
  different section structure.
* Penalize large counts of identical sentences.
* Boost for many extra Grokipedia sentences.
* Boost for many truly missing Wikipedia sentences.
* Penalize factual errors, bias cues, and hallucination cues.

The final value is clamped to `[0, 1]` and rendered as a percentage in
the HTML report: higher = “more confident this is divergent,” lower =
“likely copied or closely aligned.”

### Understanding confidence labels

Labels are assigned using sentence similarity and n-gram overlap:

#### Aligned

**Criteria**:

* Sentence similarity ≥ 94%
* N-gram overlap ≥ 88%
* Zero factual errors

**What it means**: Articles are nearly identical. Grokipedia closely
follows Wikipedia with minimal or no differences.

**Recommended action**: Minimal review needed. Periodically
re-analyze to detect future changes.

#### Possible divergence

**Criteria**:

* Word similarity ≥ 85%
* N-gram overlap ≥ 78%
* Does not meet "aligned" criteria (may have factual errors)

**What it means**: Articles are similar with some differences.
Grokipedia generally aligns with Wikipedia but has notable
variations.

**Recommended action**: Review flagged discrepancies. Check if
differences are acceptable paraphrasing or potential issues.

#### Suspected divergence

**Criteria**: Does not meet thresholds for "aligned" or "possible
divergence"

**What it means**: Significant differences detected. Articles may
contain different information, missing context, or factual errors.

**Recommended action**: Conduct thorough manual review. Investigate
all discrepancies, especially numeric and entity differences.

## Bias detection metrics

The analyzer detects three types of bias indicators in Grokipedia
content.

### Subjectivity delta

**What it measures**: Difference in subjective (opinion-based)
language between articles.

**How it's calculated**:

```
subjectivity_delta = |grokipedia_subjectivity - wikipedia_subjectivity|
```

Each article receives a subjectivity score (0 to 1) based on the
proportion of subjective terms.

**In the report**: You'll see a number between 0 and 1.

**What it means**:

* 0.0 - 0.1: Both articles use similar levels of objective language
* 0.1 - 0.3: Noticeable difference in subjectivity; review flagged
  sentences
* 0.3+: Significant difference; one article is much more
  opinion-based

**What to look for**: If Grokipedia has higher subjectivity, it may
contain editorial opinions rather than encyclopedic facts.

### Polarity delta

**What it measures**: Difference in sentiment (positive or negative
tone) between articles.

**How it's calculated**:

```
polarity_delta = |grokipedia_polarity - wikipedia_polarity|
```

Each article receives a polarity score (-1 to +1) where negative is
negative tone, positive is positive tone, and 0 is neutral.

**In the report**: You'll see a number between 0 and 2 (maximum
possible difference).

**What it means**:

* 0.0 - 0.2: Similar tone in both articles
* 0.2 - 0.5: Noticeable tonal difference; check for biased framing
* 0.5+: Significant tonal difference; one article may be promoting
  or criticizing the subject

**What to look for**: Large differences may indicate biased framing
or promotional language.

### Loaded terms

**What it detects**: Words that may indicate bias, based on
Wikipedia's Manual of Style "Words to Watch" guidelines.

**Categories of flagged terms**:

| Category       | Examples                                                       | Why it's flagged                     |
|----------------|----------------------------------------------------------------|--------------------------------------|
| Peacock terms  | "iconic", "legendary", "landmark", "prestigious"               | Promotes subject without evidence    |
| Weasel words   | "some people say", "critics say", "reportedly", "many believe" | Vague attribution; hides sources     |
| Editorializing | "bias", "propaganda", "so-called", "alleged", "controversial"  | Suggests opinion rather than fact    |
| Sensationalism | "alarmist", "exaggerated", "shocking", "outrageous"            | Emotional language; lacks neutrality |

**In the report**: You'll see a count of each loaded term found in
both Wikipedia and Grokipedia.

**What to look for**:

* Terms appearing in Grokipedia but NOT in Wikipedia are flagged as
  bias events
* If Wikipedia also uses the term, it's not flagged (may be
  acceptable in context)
* Higher counts in Grokipedia suggest non-neutral language

**Example**: If Grokipedia describes the Moon as "iconic" 3 times
but Wikipedia never uses that word, it's flagged as potential
peacock language.

## Content difference metrics

These metrics show what content is missing, added, or reworded
between sources.

### Missing sentences

**What it shows**: Sentences present in Wikipedia but absent from
Grokipedia.

**How it's calculated**: The analyzer finds sentences unique to
Wikipedia, excluding those that were reworded:

```
missing = wikipedia_sentences - (wikipedia_sentences ∩ grokipedia_sentences)
missing = missing - reworded_sentences
```

**In the report**: You'll see a count and sample sentences. The full
list is available in the "Missing Content" section.

**What it means**: Grokipedia may have incomplete coverage of the
topic.

**What to look for**:

* Are the missing sentences critical facts?
* Does their absence change the article's meaning?
* Is Grokipedia providing an incomplete picture?

### Extra sentences

**What it shows**: Sentences in Grokipedia that don't appear in
Wikipedia.

**How it's calculated**: The analyzer finds sentences unique to
Grokipedia, excluding reworded content:

```
extra = grokipedia_sentences - (wikipedia_sentences ∩ grokipedia_sentences)
extra = extra - reworded_sentences
```

**In the report**: You'll see a count and sample sentences. The full
list appears in the "Extra Content" section.

**What it means**: Grokipedia contains original content not found in
Wikipedia. This could be:

* Legitimate additional information from other sources
* AI-generated content (hallucinations)
* Errors or fabricated facts

**What to look for**:

* Are the extra sentences supported by citations?
* Do they contain factual errors?
* Are they flagged as hallucinations?

### Reworded sentences

**What it shows**: Sentences that convey similar information using
different wording.

**How it's detected**: The analyzer compares every unique sentence
and flags pairs with ≥65% similarity (but not exact matches).

**Detection threshold**: `REWORD_SIMILARITY_THRESHOLD = 0.65`

**In the report**: You'll see a count of reworded pairs. Click the
sentence similarity card to view specific examples.

**What it means**: Grokipedia paraphrased Wikipedia content rather
than copying it exactly or creating entirely new content.

**What to look for**: Check if paraphrasing changed the meaning or
introduced errors.

## Discrepancy types

The analyzer detects three specific types of factual discrepancies.

### Numeric discrepancies

**What it flags**: Numbers that differ by more than 5% between
sources.

**How it's detected**: For each aligned claim (sentence pair), the
analyzer compares the first number in each:

```
relative_difference = |wikipedia_value - grokipedia_value| / max(|wikipedia_value|, |grokipedia_value|)
```

If the difference ≥ 0.05 (5%) and units match, it's flagged.

**In the report**: You'll see a list showing:

* Wikipedia value (e.g., "1737 km")
* Grokipedia value (e.g., "1500 km")
* Relative difference (e.g., "13.6%")
* Description of the discrepancy

**What it means**: Numerical accuracy is critical for encyclopedic
content. Differences likely indicate errors.

**Example**:

* Wikipedia: "The Moon has a mean radius of 1737 km"
* Grokipedia: "The Moon has a mean radius of 1500 km"
* Difference: |1737 - 1500| / 1737 = 13.6% → Flagged

**What to look for**: Verify which source is correct by checking
authoritative references.

### Entity discrepancies

**What it compares**: Named entities (people, places, organizations)
mentioned in aligned claims.

**How it's detected**: For each aligned claim pair, the analyzer
normalizes entity names (trim, lowercase) and compares sets using
symmetric difference.

**In the report**: You'll see lists showing:

* Entities in Wikipedia but not Grokipedia (missing)
* Entities in Grokipedia but not Wikipedia (extra)

**What it means**: Entity differences can reveal:

* Factual errors (wrong person, place, or organization)
* Incomplete information (missing key actors)
* Different interpretations (conflicting sources)

**Example**:

* Wikipedia: "The giant impact hypothesis describes Theia striking
  Earth"
* Grokipedia: "The giant impact hypothesis describes Mars colliding
  with Earth"
* Discrepancy: "Theia" vs "Mars" → Flagged

**What to look for**: Verify which entities are correct according to
authoritative sources.

### Hallucination flags

**What it detects**: Grokipedia claims that have low similarity
(15-60%) to any Wikipedia sentence, suggesting potential AI-generated
content.

**How it's detected**:

* Claim appears only in Grokipedia
* Similarity to closest Wikipedia sentence: 0.15 ≤ similarity < 0.6
* May contain numeric values or entities not found in Wikipedia

**In the report**: You'll see flagged sentences with low similarity
scores.

**What it means**: These claims may be:

* Fabricated or "hallucinated" by AI
* From different sources not reflected in Wikipedia
* Misinterpretations of Wikipedia content

**What to look for**:

* Does the claim have supporting citations?
* Can you verify the information from authoritative sources?
* Is it consistent with known facts?

## Section and claim alignment

These metrics show how well the article structure aligns between
sources.

### Section alignment

**What it measures**: How well section headings match between
Wikipedia and Grokipedia.

**How it works**: The analyzer normalizes section headings (trim,
lowercase) and compares them using Dice coefficient similarity with
the `string-similarity` library.

**Threshold**: Sections with ≥70% similarity are considered aligned
(`SECTION_THRESHOLD = 0.7`).

**In the report**: You'll see an alignment visualization showing:

* Matched sections with similarity scores
* Wikipedia sections missing in Grokipedia
* Extra Grokipedia sections not in Wikipedia

**What it means**: Similar structure suggests consistent topic
coverage. Misaligned sections may indicate:

* Different organizational approaches
* Missing or extra topics
* Renamed sections with similar content

### Claim alignment

**What it measures**: How individual claims (sentences with entities
and numbers) align between articles.

**How it works**: The analyzer compares normalized claim text using
Dice coefficient similarity.

**Threshold**: Claims with ≥65% similarity are considered aligned
(`CLAIM_THRESHOLD = 0.65`).

**In the report**: You'll see alignment data used to detect numeric
and entity discrepancies.

**What it means**: Aligned claims enable direct comparison of:

* Numeric values (for discrepancy detection)
* Entity mentions (for consistency checking)
* Factual assertions (for verification)

**Why it matters**: Without aligned claims, the analyzer can't
compare specific facts between sources.

## Additional report features

### Character counts

**What it shows**: Total character count in each article.

**Why it matters**: Provides a quick size comparison. Significant
differences may indicate missing or extra content.

### Sentences reviewed

**What it shows**: Total number of unique sentences analyzed across
both sources.

**Why it matters**: Helps you understand the scope of the analysis.

### Citation comparison

**What it shows**: URLs cited in each article.

**How it's displayed**:

* Shared citations (appear in both articles)
* Missing citations (in Wikipedia but not Grokipedia)
* Extra citations (in Grokipedia but not Wikipedia)

**Why it matters**: Citation alignment indicates whether both
articles rely on similar sources.

### Publication status

**What it shows**: Whether the Grokipedia article has been published
to the OriginTrail Decentralized Knowledge Graph (DKG).

**Status indicators**:

* **Green badge**: "Published | UAL: \[address]" - Article is
  published on-chain with a Universal Asset Locator
* **Gray badge**: "Not published yet" - Analysis exists only locally

**Why it matters**: Published analyses are immutably stored on-chain
and can be referenced by their UAL.

## How GWALN ensures accuracy

### Complete analysis

GWALN processes full article content without sampling or truncation.
Every sentence, claim, and entity is analyzed.

### Deterministic calculations

Running the same comparison twice produces identical results. The
analyzer uses consistent algorithms and thresholds.

### Unit testing

Core metrics are tested in `tests/confidence.test.ts` with 24 test
cases covering:

* Perfect matches (confidence = 1.0)
* Various similarity scenarios
* Edge cases and boundaries
* Penalty calculations

### Persistent storage

Analysis results are saved to `~/.gwaln/analysis/<topic>.json` for
future reference and caching.

### Cache validation

Cached results stay fresh when:

* Content hash matches (no source changes)
* Timestamp is within 72 hours (`CACHE_TTL_HOURS = 72`)

When either condition fails, GWALN recomputes the entire analysis.

## Interpreting your results

### For aligned articles

**Confidence**: ≥0.85 with "aligned" label

**What to do**:

* Review any flagged discrepancies (even in aligned articles)
* Set up periodic re-analysis to detect future changes
* Consider the analysis reliable for fact-checking purposes

### For articles with possible divergence

**Confidence**: 0.70-0.85 with "possible\_divergence" label

**What to do**:

* Review all numeric and entity discrepancies
* Check bias metrics for loaded terms
* Investigate reworded sentences to ensure meaning wasn't changed
* Verify extra content with citations

### For articles with suspected divergence

**Confidence**: <0.70 with "suspected\_divergence" label

**What to do**:

* Conduct thorough manual review
* Prioritize numeric discrepancies and hallucination flags
* Check all bias events
* Verify extra content against authoritative sources
* Document findings before using either article as a reference

## Next steps

After reviewing the HTML report:

1. **Review flagged content**: Start with suspected divergence
   articles, then possible divergence
2. **Investigate high bias metrics**: Check subjectivity delta >0.2,
   polarity delta >0.3, or multiple loaded terms
3. **Verify numeric discrepancies**: Cross-reference numbers with
   authoritative sources
4. **Check hallucination flags**: Verify extra content with
   citations or external references
5. **Compare missing/extra content**: Assess whether Grokipedia
   provides complete coverage
6. **Re-analyze periodically**: For aligned articles, run
   `gwaln analyse --force` monthly to detect changes

## See also

* [GWALN Analyzer Overview](./analyzer-overview.md) - Technical
  implementation details
* [Main README](../README.md) - Getting started with GWALN
* [Wikipedia Manual of Style: Words to Watch](https://en.wikipedia.org/wiki/Wikipedia:Manual_of_Style/Words_to_watch) -
  Bias detection guidelines

## Getting help

If you have questions about specific metrics or need help
interpreting results, please refer to the [main GWALN
documentation](../README.md) or open an issue on GitHub.
