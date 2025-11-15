## CivicLens CLI

This tool helps you compare Grokipedia and Wikipedia topics. It parses
structured snapshots, computes discrepancies, and drafts Community Notes
so that you can publish verifiable context on the OriginTrail DKG.

Project status: actively maintained.

### Basic functionality

CivicLens CLI is intended for analysts and contributors who review
AI-generated encyclopedia content. It is meant to help them fetch topic
snapshots, analyze alignment gaps, and package Community Notes for
publication.

CivicLens CLI reads wikitext and Grokipedia HTML, normalizes both into a
shared JSON schema, and runs an analyzer that aligns sections, claims,
and citations. The CLI then outputs structured analysis files, an HTML
report, and JSON-LD Community Notes. For more details about the
technical implementation, see [the developer
documentation](#developer-documentation).

### What CivicLens CLI does not do

This tool cannot edit Grokipedia or Wikipedia. It does not have content
moderation powers and cannot publish to the OriginTrail DKG without
valid signing keys. Users still need to review the findings and decide
whether to publish.

## Prerequisites

Before using this tool, you should be familiar with:

- Basic command-line usage and Node.js tooling.
- OriginTrail concepts, including DKG nodes and Knowledge Assets.

You should have:

- Node.js 18 or later on macOS, Linux, or Windows.
- Network access to a DKG edge node and sufficient blockchain funds if
  you plan to publish.
- Optional: a Google Gemini API key if you use automated bias
  verification.

## How to use CivicLens CLI

### Configure the CLI

1. Install dependencies:

   ```bash
   npm install
   npm run build
   npm link   # optional
   ```

2. Run the setup wizard:

   ```bash
   civiclens init
   ```

   1. Provide your DKG endpoint, environment, and port.
   2. Supply blockchain identifiers and signing keys.
   3. Set publish defaults such as epochs, retries, and dry-run mode.

3. Confirm that `.civiclensrc.json` contains the expected values.

### Fetch topic snapshots

1. Select a topic ID from `topics.json` (for example, `moon`).
2. Download raw Wikipedia data:

   ```bash
   civiclens fetch wiki --topic moon
   ```

3. Download the Grokipedia counterpart:

   ```bash
   civiclens fetch grok --topic moon
   ```

4. Verify that `data/wiki/<topic>.parsed.json` and
   `data/grok/<topic>.parsed.json` exist.

### Analyze and inspect results

1. Run the analyzer:

   ```bash
   civiclens analyse --topic moon --force
   ```

2. Review the terminal summary:

   ```bash
   civiclens show --topic moon
   ```

3. Generate an HTML dashboard for presentations:

   ```bash
   civiclens show --topic moon --open-html
   ```

4. Open `analysis/moon-report.html` in a browser to explore section
   alignment, numeric/entity discrepancies, bias cues, and diff samples.

### Draft and publish a Community Note

1. Create a ClaimReview draft:

   ```bash
   civiclens notes build \
     --topic moon \
     --summary "Grok omits the NASA mission context and adds speculative claims." \
     --accuracy 3 --completeness 3 --tone-bias 3 \
     --stake-token TRAC --stake-amount 0
   ```

2. Inspect the output in `notes/moon.json` and `notes/index.json`.
3. Publish to OriginTrail (ensure your config has live signing keys):

   ```bash
   civiclens notes publish --topic moon
   ```

4. Record the printed UAL for reporting.

## Troubleshooting

`Analysis not found for topic`  
- Run both `civiclens fetch wiki --topic <id>` and `civiclens fetch grok --topic <id>` before analyzing.

`DKG publish failed: UNAUTHORIZED`  
- Ensure `.civiclensrc.json` contains valid `dkgPrivateKey`, `dkgPublicKey`, and endpoint values; confirm the key has sufficient balance on the target chain.

## How to get help and report issues

- Report issues at the GitHub issue tracker for this repository.
- Ask questions by opening a discussion or contacting the maintainers on
  the project chat. You can expect a response within one week.

## Developer documentation

### Technical implementation

To review the full analyzer pipeline, see
[docs/analyzer-overview.md](docs/analyzer-overview.md).

The CLI uses Node.js and Commander.js to expose subcommands. Parsing is
handled by a custom module that converts Wikipedia wikitext and
Grokipedia HTML into identical structured JSON (lead/sections, sentences,
claims, citations, media attachments). The analyzer stage:

- normalizes sentences into token sets and compares them to detect
  missing or extra context
- aligns sections and claims using cosine similarity from the
  `string-similarity` library
- computes numeric discrepancies via relative-difference heuristics and
  entity discrepancies via set symmetric differences
- flags bias/hallucination cues through lexicon scans plus
  subjectivity/polarity scoring

Optional verification hooks call the Gemini API for bias confirmation and
run citation checks against Grokipedia references.

### Code structure

- `src/commands/`: CLI entry points (`init`, `fetch`, `analyse`, `show`,
  `notes`, `topics`, `publish`).
- `src/lib/`: reusable modules including the parser, analyzer,
  discrepancies, bias metrics, and DKG helpers.
- `data/`: cached structured snapshots per topic.
- `analysis/`: analyzer outputs (JSON + HTML report).
- `notes/`: JSON-LD Community Notes and index metadata.

### Local development

#### Set up

1. Clone the repository and move into `civiclens/cli`.
2. Install dependencies with `npm install`.

#### Install

1. Build TypeScript sources:

   ```bash
   npm run build
   ```

2. Link the CLI locally (optional):

   ```bash
   npm link
   ```

#### Configure

1. Copy or create `.civiclensrc.json`.
2. Run `civiclens init` to populate node, blockchain, and publish
   defaults.

#### Build and test

- Build:

  ```bash
  npm run build
  ```

- Run tests:

  ```bash
  npm test
  ```

#### Debugging

- `Analysis not found`: check `data/wiki` and `data/grok` for missing
  snapshots; rerun `civiclens fetch`.
- `Publish timeout`: increase `publishMaxRetries` or verify the DKG node
  endpoint is reachable; use `--dry-run` to ensure the payload is valid
  before retrying.

## How to contribute

The CivicLens CLI maintainers welcome contributions.

- Bug fixes and documentation improvements.
- Enhancements to the parser, analyzer, or HTML report.

### Contribution process

1. Read the repository’s Code of Conduct and follow the coding
   conventions (TypeScript + ESLint).
2. Fork the repository, create a feature branch, and commit changes.
3. Run `npm test` and `npm run build`.
4. Open a pull request describing the change and linking to any relevant
   issues.

## Credits

Developed by Doğu Abaris and contributors. The project builds on the
OriginTrail ecosystem and open-source libraries noted in `package.json`.

## License

See the [LICENSE](LICENSE) file for details.
