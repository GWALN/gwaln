![Image](https://github.com/user-attachments/assets/3152cf8b-b683-4acf-ab9d-e3bfd5dc0390)

> \[!NOTE]\
> Originally built for the **DKGcon2025 Hackathon** powered by OriginTrail.

## GWALN

This tool helps you compare Grokipedia and Wikipedia topics. It parses
structured snapshots, computes discrepancies, and drafts Community Notes
so that you can publish verifiable context on the OriginTrail DKG.

Project status: actively maintained.

### Basic functionality

GWALN CLI is intended for analysts and contributors who review
AI-generated encyclopedia content. It is meant to help them fetch topic
snapshots, analyze alignment gaps, and package Community Notes for
publication.

GWALN CLI reads wikitext and Grokipedia HTML, normalizes both into a
shared JSON schema, and runs an analyzer that aligns sections, claims,
and citations. The CLI then outputs structured analysis files, an HTML
report, and JSON-LD Community Notes. For more details about the
technical implementation, see [the developer
documentation](#developer-documentation).

### What GWALN CLI does not do

This tool cannot edit Grokipedia or Wikipedia. It does not have content
moderation powers and cannot publish to the OriginTrail DKG without
valid signing keys. Users still need to review the findings and decide
whether to publish.

## Prerequisites

Before using this tool, you should be familiar with:

* Basic command-line usage and Node.js tooling.
* OriginTrail concepts, including DKG nodes and Knowledge Assets.

You should have:

* Node.js 20.18.1 or later on macOS, Linux, or Windows
* Network access to a DKG edge node and sufficient blockchain funds if
  you plan to publish.
* Optional: a Google Gemini API key if you use automated bias
  verification.

## How to use GWALN CLI

### Configure the CLI

1. Install dependencies:

   ```bash
   npm install
   npm run build
   npm link   # optional
   ```

2. Run the setup wizard:

   ```bash
   gwaln init
   ```

   1. Provide your DKG endpoint, environment, and port.
   2. Supply blockchain identifiers and signing keys.
   3. Set publish defaults such as epochs, retries, and dry-run mode.

3. Confirm that `~/.gwaln/.gwalnrc.json` contains the expected values.

### Lookup and manage topics

#### Sync the topic catalog

Run the `topics` helper when you need to copy the bundled catalog or ingest a
custom JSON feed (local file or HTTPS endpoint). By default it writes to
`~/.gwaln/topics.json`.

```bash
gwaln topics sync
```

To pull from a remote or local feed:

```bash
gwaln topics sync \
  --source https://example.org/gwaln-topics.json \
  --output ~/analyst/topics.json
```

`--source` accepts either a path on disk or an HTTPS URL. Use `--output` if you
need to mirror the catalog elsewhere; the CLI still keeps `~/.gwaln/topics.json`
up to date for its own use.

#### Lookup topics

Before fetching snapshots, you can search for topics in your local
catalog or discover new ones using the lookup command.

1. Search for a topic in the local catalog:

   ```bash
   gwaln lookup "Moon"
   ```

   This checks if the topic exists in `~/.gwaln/topics.json` by title and displays
   its details if found.

2. Search both Grokipedia and Wikipedia APIs for a new topic:

   ```bash
   gwaln lookup "Bitcoin"
   ```

   If the topic is not found locally, it automatically searches both
   platforms and prompts you to select matching entries to add to
   `~/.gwaln/topics.json`.

3. Limit the number of search results:

   ```bash
   gwaln lookup "Blockchain" --limit 3
   ```

   The default limit is 5 results per platform.

### Fetch topic snapshots

1. Select a topic ID from `~/.gwaln/topics.json` (for example, `moon`).

2. Download raw Wikipedia data:

   ```bash
   gwaln fetch wiki --topic moon
   ```

3. Download the Grokipedia counterpart:

   ```bash
   gwaln fetch grok --topic moon
   ```

4. Verify that `~/.gwaln/data/wiki/<topic>.parsed.json` and
   `~/.gwaln/data/grok/<topic>.parsed.json` exist.

### Analyze and inspect results

1. Run the analyzer:

   ```bash
   gwaln analyse --topic moon
   ```

   To bypass cached results and regenerate even if inputs are unchanged:

   ```bash
   gwaln analyse --topic moon --force
   ```

   By default, bias cues are keyword-only. Enable transformer-based
   semantic bias detection (slower, downloads a model) when you need it:

   ```bash
   gwaln analyse --topic moon --force --semantic-bias
   ```

2. Review the terminal summary:

   ```bash
   gwaln show --topic moon
   ```

3. Generate an HTML dashboard for presentations:

   ```bash
   gwaln show --topic moon --open-html
   ```

4. Open `~/.gwaln/analysis/moon-report.html` in a browser to explore section
   alignment, numeric/entity discrepancies, bias cues, and diff samples.

### Draft and publish a Community Note

1. Create a ClaimReview draft:

   ```bash
   gwaln notes build \
     --topic moon \
     --summary "Grok omits the NASA mission context and adds speculative claims." \
     --accuracy 3 --completeness 3 --tone-bias 3 \
     --stake-token TRAC --stake-amount 0
   ```

2. Inspect the output in `~/.gwaln/notes/moon.json` and `~/.gwaln/notes/index.json`.

3. Publish to OriginTrail (ensure your config has live signing keys):

   ```bash
   gwaln notes publish --topic moon
   ```

4. Record the printed UAL for reporting.

### Use the MCP server

The same workflows are also available to AI agents via the Model Context
Protocol (see the [official docs](https://modelcontextprotocol.io/docs/getting-started/intro)).
This lets tools such as Claude Code, Cursor, and MCP Inspector call
`fetch`, `analyze`, `notes`, `publish`, `query` and `show` without duplicating
logic.

1. Start the stdio server:

   ```bash
   npm run mcp
   ```

   The process stays attached to your terminal so you can connect via an
   MCP-aware client (Claude Code, Cursor MCP configuration, or Inspector).

2. Register the server with your MCP client. For example, in MCP
   Inspector run `npx @modelcontextprotocol/inspector` and point it to
   the stdio process, or in Cursor add a “custom MCP server” that runs
   `npm run mcp`.

3. Typical agent flow:

   1. `fetch` with `source="both"` (or specify `wiki` / `grok`) to grab
      the on-disk snapshots for a topic.
   2. `analyze` with `topicId` (optionally `force`, `verifyCitations`,
      or Gemini settings) to produce/refresh `analysis/<topic>.json`.
   3. `show` with `topicId` (+ `renderHtml=true` if you want an HTML
      file path) to summarize the structured analysis + note draft.
   4. `notes` with `action="build"` to regenerate the Community Note for
      that topic; once reviewed, call `notes` with `action="publish"`
      and either supply `ual` or let it hit the DKG node.
   5. If you need to publish arbitrary JSON-LD assets (outside the note
      flow), call `publish` with either a `filePath` or inline `payload`.

Each MCP tool mirrors the CLI flags:

* `fetch`: `{ source?, topicId? }`
* `analyze`: `{ topicId?, force?, biasVerifier?, geminiKey?, geminiModel?, geminiSummary?, verifyCitations? }`
* `notes`: discriminated union for `build`, `publish`, or `status`
* `publish`: `{ filePath? , payload?, privacy?, endpoint?, environment?, ... }`
* `show`: `{ topicId, renderHtml? }`

Because the MCP server calls the same workflow modules as the CLI,
cached files, Gemini credentials, and `~/.gwaln/.gwalnrc.json` are honored
automatically.

The server reads DKG credentials and defaults from `~/.gwaln/.gwalnrc.json`
via the same `resolvePublishConfig` helper used by the CLI, so you never
have to expose secrets through the MCP request itself. Just keep the
config file up to date with `gwaln init`.

When you run `npm run mcp` the process spins up a single endpoint
(`POST /mcp`, default URL `http://127.0.0.1:3233/mcp`). MCP clients must
first call `initialize`; the server then creates a dedicated session
using the Model Context Protocol’s session headers and reuses it for the
subsequent `tools/list`, `tools/call`, etc. There are no extra discovery
routes—just point your MCP client at that one URL.

### Query a published Knowledge Asset

Retrieve previously published Community Notes from the DKG by topic title:

```bash
gwaln query --topic "Moon" --save moon-retrieved
```

The query command uses the DKG as the source of truth. It first checks for a local UAL cache, and if not found, searches the DKG directly using SPARQL to find the most recent published Community Note for the topic.

You can also query by UAL directly for advanced use cases:

```bash
gwaln query --ual "did:dkg:base:8453/0xc28f310a87f7621a087a603e2ce41c22523f11d7/666506" --save moon-retrieved
```

This retrieves the assertion and optional metadata, displays them in the terminal, and optionally saves the result to `~/.gwaln/data/dkg/moon-retrieved.json`. You can override connection settings with flags like `--endpoint`, `--blockchain`, or `--private-key`.

## Troubleshooting

`Analysis not found for topic`

* Run both `gwaln fetch wiki --topic <id>` and `gwaln fetch grok --topic <id>` before analyzing.

`DKG publish failed: UNAUTHORIZED`

* Ensure `~/.gwaln/.gwalnrc.json` contains valid `dkgPrivateKey`, `dkgPublicKey`, and endpoint values; confirm the key has sufficient balance on the target chain.

## How to get help and report issues

* Report issues at the GitHub issue tracker for this repository.
* Ask questions by opening a discussion or contacting the maintainers on
  the project chat. You can expect a response within one week.

## Developer documentation

### Technical implementation

To review the full analyzer pipeline, see
[docs/analyzer-overview.md](docs/analyzer-overview.md).

The CLI uses Node.js and Commander.js to expose subcommands. Parsing is
handled by a custom module that converts Wikipedia wikitext and
Grokipedia HTML into identical structured JSON (lead/sections, sentences,
claims, citations, media attachments). The analyzer stage:

* normalizes sentences into token sets and compares them to detect
  missing or extra context
* aligns sections and claims using cosine similarity from the
  `string-similarity` library
* computes numeric discrepancies via relative-difference heuristics and
  entity discrepancies via set symmetric differences
* flags bias/hallucination cues through lexicon scans plus
  subjectivity/polarity scoring

Optional verification hooks call the Gemini API for bias confirmation and
run citation checks against Grokipedia references.

### Code structure

* `src/commands/`: CLI entry points (`init`, `fetch`, `analyse`, `show`,
  `notes`, `topics`, `publish`, `query`).
* `src/lib/`: reusable modules including the parser, analyzer,
  discrepancies, bias metrics, and DKG helpers.
* `~/.gwaln/data/`: cached structured snapshots per topic.
* `~/.gwaln/analysis/`: analyzer outputs (JSON + HTML report).
* `~/.gwaln/notes/`: JSON-LD Community Notes and index metadata.

### Local development

#### Set up

1. Clone the repository and move into `gwaln/cli`.
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

1. Run `gwaln init` to create `~/.gwaln/.gwalnrc.json` and populate node, blockchain, and publish defaults.
2. All user data (topics, snapshots, analysis, notes) will be stored in `~/.gwaln/`.

#### Build and test

* Build:

  ```bash
  npm run build
  ```

* Run tests:

  ```bash
  npm test
  ```

#### Debugging

* `Analysis not found`: check `~/.gwaln/data/wiki` and `~/.gwaln/data/grok` for missing
  snapshots; rerun `gwaln fetch`.
* `Publish timeout`: increase `publishMaxRetries` in `~/.gwaln/.gwalnrc.json` or verify the DKG node
  endpoint is reachable; use `--dry-run` to ensure the payload is valid
  before retrying.

## How to contribute

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## Credits

Developed by Doğu Abaris, Damjan Dimitrov and contributors. The project builds on the
OriginTrail ecosystem and open-source libraries noted in `package.json`.

## License

GWALN is released under the [MIT License](LICENSE).
