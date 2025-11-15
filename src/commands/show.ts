/**
 * @file src/commands/show.ts
 * @description Displays structured CivicLens analysis summaries and optionally renders a polished HTML report.
 *              The CLI view stays concise while the HTML export uses a richer layout suitable for sharing.
 * @author Doğu Abaris <abaris@null.net>
 */

import fs from "node:fs";
import path from "node:path";
import {spawn} from "node:child_process";
import {Command} from "commander";
import chalk from "chalk";
import {paths} from "../shared/paths";
import {loadNoteEntry, loadNotesIndex, NoteIndexEntry} from "../shared/notes";
import {loadTopics, Topic} from "../shared/topics";
import {
    coerceStructuredAnalysisReport,
    StructuredAnalysisReport
} from "../lib/structured-report";
import type {DiscrepancyRecord} from "../lib/analyzer";

type NotePayload = { entry: NoteIndexEntry | null; note: Record<string, unknown> | null };

const loadAnalysis = (topic: Topic): StructuredAnalysisReport => {
    const target = path.join(paths.ANALYSIS_DIR, `${topic.id}.json`);
    if (!fs.existsSync(target)) {
        throw new Error(`Analysis not found for topic '${topic.id}'. Run 'civiclens analyse --topic ${topic.id}' first.`);
    }
    const raw = fs.readFileSync(target, "utf8");
    const parsed = JSON.parse(raw) as StructuredAnalysisReport | Record<string, unknown>;
    return coerceStructuredAnalysisReport(topic, parsed as StructuredAnalysisReport);
};

const formatPercent = (ratio: number): string => `${(ratio * 100).toFixed(1)}%`;

const formatSnippet = (value: string): string => (value.length > 160 ? `${value.slice(0, 160)}…` : value);

const colorDiffLine = (line: string): string => {
    if (line.startsWith("+") && !line.startsWith("+++")) {
        return chalk.green(line);
    }
    if (line.startsWith("-") && !line.startsWith("---")) {
        return chalk.red(line);
    }
    if (line.startsWith("@@")) {
        return chalk.cyan(line);
    }
    if (line.startsWith("diff") || line.startsWith("---") || line.startsWith("+++")) {
        return chalk.magenta(line);
    }
    return line;
};

const printBulletSection = (title: string, color: (input: string) => string, items: string[]): void => {
    if (!items.length) return;
    console.log(color(`\n${title}`));
    items.forEach((item) => console.log(` • ${formatSnippet(item)}`));
};

const printAnalysis = (analysis: StructuredAnalysisReport): void => {
    const {topic, summary, comparison, discrepancies, attachments, bias_metrics: biasMetrics} = analysis;
    console.log(chalk.bold(`# ${topic.title} (${topic.id})`));
    console.log(chalk.gray(summary.headline));
    console.log(
        [
            `Similarity: ${formatPercent(summary.similarity_ratio)}`,
            `N-gram overlap: ${formatPercent(summary.ngram_overlap)}`,
            `Wiki chars: ${summary.wiki_char_count}`,
            `Grok chars: ${summary.grok_char_count}`,
            `Confidence: ${summary.confidence.label} (${summary.confidence.score.toFixed(2)})`
        ].join(" · ")
    );

    printBulletSection("Missing snippets (Wikipedia only)", chalk.yellow, comparison.sentences.missing);
    printBulletSection("Extra snippets (Grokipedia only)", chalk.cyan, comparison.sentences.extra);

    const structuralIssues = discrepancies.primary ?? [];
    if (structuralIssues.length) {
        console.log(chalk.bold("\nStructured discrepancies:"));
        structuralIssues.forEach((issue, idx) => {
            const evidence = issue.evidence ?? {};
            const wikiEvidence = evidence.wikipedia ? `\n   - Wikipedia: ${formatSnippet(evidence.wikipedia)}` : "";
            const grokEvidence = evidence.grokipedia ? `\n   - Grokipedia: ${formatSnippet(evidence.grokipedia)}` : "";
            console.log(` ${idx + 1}. [${issue.type}] ${issue.description}${wikiEvidence}${grokEvidence}`);
        });
    }

    const sectionsMissing = comparison.sections.missing ?? [];
    const sectionsExtra = comparison.sections.extra ?? [];
    if (sectionsMissing.length || sectionsExtra.length) {
        console.log(chalk.bold("\nSection inventory:"));
        if (sectionsMissing.length) {
            console.log(chalk.yellow(` - Missing (${sectionsMissing.length}): ${sectionsMissing.join(", ")}`));
        }
        if (sectionsExtra.length) {
            console.log(chalk.cyan(` - Extra (${sectionsExtra.length}): ${sectionsExtra.join(", ")}`));
        }
    }

    if (biasMetrics) {
        console.log(
            chalk.bold(
                `\nBias deltas → subjectivity: ${biasMetrics.subjectivity_delta.toFixed(3)}, polarity: ${biasMetrics.polarity_delta.toFixed(3)}`
            )
        );
    }

    if (discrepancies.bias.length) {
        printBulletSection("Bias cues", chalk.magenta, discrepancies.bias.map((event) => event.description ?? ""));
    }

    if (discrepancies.hallucinations.length) {
        printBulletSection(
            "Hallucination flags",
            chalk.red,
            discrepancies.hallucinations.map((event) => event.description ?? "")
        );
    }

    const diffSample = attachments.diff_sample ?? [];
    if (diffSample.length) {
        console.log(chalk.gray("\nDiff sample:"));
        diffSample.slice(0, 24).forEach((line) => console.log(colorDiffLine(line)));
    }

    const citationChecks = attachments.citation_verifications ?? [];
    if (citationChecks.length) {
        console.log(chalk.bold("\nCitation verification:"));
        citationChecks.forEach((entry) => {
            const url = entry.supporting_url ? ` (${entry.supporting_url})` : "";
            const message = entry.message ? ` — ${entry.message}` : "";
            console.log(` - [${entry.status}] ${formatSnippet(entry.sentence ?? "")}${url}${message}`);
        });
    }

    const biasVerifications = attachments.bias_verifications ?? [];
    if (biasVerifications.length) {
        console.log(chalk.bold("\nBias verification (external):"));
        biasVerifications.forEach((entry) => {
            const confidence =
                typeof entry.confidence === "number"
                    ? ` (confidence ${entry.confidence.toFixed(2)})`
                    : entry.confidence
                    ? ` (${entry.confidence})`
                    : "";
            console.log(
                ` - [${entry.provider}] event #${entry.event_index}: ${entry.verdict}${confidence}${
                    entry.rationale ? ` — ${formatSnippet(entry.rationale)}` : ""
                }`
            );
        });
    }

    if (attachments.gemini_summary?.text) {
        console.log(chalk.bold("\nGemini comparison summary:"));
        console.log(attachments.gemini_summary.text);
    }
};

const printNote = (topicId: string, payload?: NotePayload): void => {
    console.log(chalk.bold("\n# Community Note"));
    const {entry, note} = payload ?? loadNoteEntry(topicId);
    if (!entry) {
        console.log("No draft registered in notes/index.json yet.");
        return;
    }
    console.log(`- Status: ${entry.status ?? "unknown"}`);
    console.log(`- File: ${entry.file}`);
    console.log(`- UAL: ${entry.ual ?? "unpublished"}`);
    if (!note) {
        console.log("Draft file missing—copy template.json to begin.");
        return;
    }
    const rating = (note["reviewRating"] as Record<string, unknown>) ?? {};
    console.log(`Summary: ${(rating["ratingExplanation"] as string) ?? "n/a"}`);
    const trust = (note["civicLensTrust"] as Record<string, unknown>) ?? {};
    const scores = {
        accuracy: trust["accuracy"],
        completeness: trust["completeness"],
        tone_bias: trust["tone_bias"]
    };
    if (Object.keys(scores).length) {
        console.log(
            `Trust scores -> accuracy: ${scores["accuracy"] ?? "?"}, completeness: ${scores["completeness"] ?? "?"}, tone/bias: ${
                scores["tone_bias"] ?? "?"
            }`
        );
    }
    const stake = trust["stake"] as Record<string, unknown> | undefined;
    if (stake) {
        console.log(`Stake: ${stake["amount"] ?? 0} ${stake["token"] ?? "TRAC"}`);
    }
    const annotations = (note["hasPart"] as Array<Record<string, unknown>>) ?? [];
    annotations.forEach((issue, idx) => {
        const body = issue.body as Record<string, string> | undefined;
        const target = issue.target as Array<Record<string, unknown>> | undefined;
        const wikiTarget = target?.find((t) => (t.source as string)?.includes("wikipedia"));
        const grokTarget = target?.find((t) => (t.source as string)?.includes("grokipedia"));
        console.log(
            `- ${idx + 1}. [${issue.classification ?? "annotation"}] ${body?.value ?? ""}\n   Wikipedia: ${
                wikiTarget?.source ?? "n/a"
            }\n   Grokipedia: ${grokTarget?.source ?? "n/a"}`
        );
    });
};

const escapeHtml = (value: string): string =>
    value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

const renderList = (title: string, items: string[], tone: "missing" | "extra"): string => {
    if (!items.length) return "";
    const listItems = items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    return `<section class="card list-block ${tone}">
      <div class="tile-title">${escapeHtml(title)}</div>
      <ul>${listItems}</ul>
    </section>`;
};

const renderAlignmentTable = (analysis: StructuredAnalysisReport): string => {
    const rows = analysis.comparison.sections.alignment
        .slice(0, 8)
        .map(
            (record) => `<tr>
        <td>${escapeHtml(record.wikipedia?.heading ?? "—")}</td>
        <td>${escapeHtml(record.grokipedia?.heading ?? "—")}</td>
        <td>${formatPercent(record.similarity)}</td>
      </tr>`
        )
        .join("");
    if (!rows) return "";
    return `<section class="card">
      <div class="card-title">Section alignment</div>
      <table>
        <thead><tr><th>Wikipedia</th><th>Grokipedia</th><th>Similarity</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
};

const renderDiscrepancyList = (title: string, issues: DiscrepancyRecord[], tone: "neutral" | "alert"): string => {
    if (!issues.length) return "";
    const color = tone === "alert" ? "var(--rose-600)" : "var(--slate-700)";
    const list = issues
        .map((issue, idx) => {
            const evidence = issue.evidence ?? {};
            const wiki = evidence.wikipedia ? `<div class="evidence"><strong>Wikipedia</strong>: ${escapeHtml(evidence.wikipedia)}</div>` : "";
            const grok =
                evidence.grokipedia ? `<div class="evidence"><strong>Grokipedia</strong>: ${escapeHtml(evidence.grokipedia)}</div>` : "";
            return `<li>
          <span class="issue-label">${idx + 1}. [${escapeHtml(issue.type)}]</span> ${escapeHtml(issue.description ?? "")}
          ${wiki}${grok}
        </li>`;
        })
        .join("");
    return `<section class="card">
      <div class="card-title" style="color:${color}">${escapeHtml(title)}</div>
      <ol>${list}</ol>
    </section>`;
};

const renderBiasPanel = (analysis: StructuredAnalysisReport): string => {
    const metrics = analysis.bias_metrics;
    const listLoadedTerms = (label: string, entries: Record<string, number>): string => {
        if (!entries || !Object.keys(entries).length) return `<p class="muted">${escapeHtml(label)}: n/a</p>`;
        const items = Object.entries(entries)
            .map(([term, count]) => `<li>${escapeHtml(term)} <span>${count}</span></li>`)
            .join("");
        return `<div><h4>${escapeHtml(label)}</h4><ul class="tag-list">${items}</ul></div>`;
    };
    return `<section class="card bias">
      <div class="card-title">Bias metrics</div>
      <div class="bias-grid">
        <div>
          <p>Subjectivity delta</p>
          <strong>${metrics.subjectivity_delta.toFixed(3)}</strong>
        </div>
        <div>
          <p>Polarity delta</p>
          <strong>${metrics.polarity_delta.toFixed(3)}</strong>
        </div>
      </div>
      <div class="bias-tags">
        ${listLoadedTerms("Grokipedia loaded terms", metrics.loaded_terms_grok)}
        ${listLoadedTerms("Wikipedia loaded terms", metrics.loaded_terms_wiki)}
      </div>
    </section>`;
};

const renderDiffSample = (analysis: StructuredAnalysisReport): string => {
    const diffLines = analysis.attachments.diff_sample ?? [];
    if (!diffLines.length) return "";
    return `<section class="card">
      <div class="card-title">Diff sample</div>
      <pre>${escapeHtml(diffLines.slice(0, 40).join("\n"))}</pre>
    </section>`;
};

const renderVerifications = (analysis: StructuredAnalysisReport): string => {
    const citationChecks = analysis.attachments.citation_verifications ?? [];
    const biasChecks = analysis.attachments.bias_verifications ?? [];
    const blocks: string[] = [];
    if (citationChecks.length) {
        const list = citationChecks
            .map(
                (entry) => `<li>
            <strong>[${escapeHtml(entry.status)}]</strong> ${escapeHtml(entry.sentence ?? "")}
            ${entry.supporting_url ? `<div class="evidence">${escapeHtml(entry.supporting_url)}</div>` : ""}
            ${entry.message ? `<div class="evidence">${escapeHtml(entry.message)}</div>` : ""}
          </li>`
            )
            .join("");
        blocks.push(
            `<section class="card">
          <div class="card-title">Citation verification</div>
          <ul>${list}</ul>
        </section>`
        );
    }
    if (biasChecks.length) {
        const list = biasChecks
            .map(
                (entry) => `<li>
            <strong>${escapeHtml(entry.provider)}</strong> · ${escapeHtml(entry.verdict)}
            ${entry.confidence ? `<span class="muted">(confidence ${escapeHtml(String(entry.confidence))})</span>` : ""}
            ${entry.rationale ? `<div class="evidence">${escapeHtml(entry.rationale)}</div>` : ""}
          </li>`
            )
            .join("");
        blocks.push(
            `<section class="card">
          <div class="card-title">Bias verification</div>
          <ul>${list}</ul>
        </section>`
        );
    }
    return blocks.join("");
};

const renderNoteCard = (notePayload: NotePayload | undefined): string => {
    const entry = notePayload?.entry;
    const note = notePayload?.note;
    if (!entry || !note) {
        return `<section class="card">
      <div class="card-title">Community Note</div>
      <p class="muted">No draft registered in notes/index.json yet.</p>
    </section>`;
    }
    const summary = ((note["reviewRating"] as Record<string, unknown>)?.["ratingExplanation"] as string) ?? "n/a";
    return `<section class="card">
      <div class="card-title">Community Note (${escapeHtml(entry.status ?? "draft")})</div>
      <p>${escapeHtml(summary)}</p>
      <p class="muted">File: ${escapeHtml(entry.file)} • UAL: ${escapeHtml(entry.ual ?? "unpublished")}</p>
    </section>`;
};

const renderHtmlReport = (
    analysis: StructuredAnalysisReport,
    notePayload: NotePayload,
    notesIndexUpdatedAt: string | null
): string => {
    const {topic, summary, comparison, discrepancies} = analysis;
    const totalSentences = summary.sentences_reviewed;
    const statsCards = [
        {
            label: "Similarity",
            value: formatPercent(summary.similarity_ratio),
            detail: "Aligned content",
            progress: summary.similarity_ratio
        },
        {
            label: "N-gram overlap",
            value: formatPercent(summary.ngram_overlap),
            detail: "Shared phrasing",
            progress: summary.ngram_overlap
        },
        {
            label: "Sentences reviewed",
            value: String(totalSentences),
            detail: `Wiki ${summary.wiki_sentence_count} • Grok ${summary.grok_sentence_count}`,
            progress: totalSentences > 0 ? Math.min(1, totalSentences / Math.max(summary.wiki_sentence_count, summary.grok_sentence_count, 1)) : 0
        },
        {
            label: "Confidence",
            value: summary.confidence.label.replace(/_/g, " "),
            detail: `${summary.confidence.score.toFixed(2)} score`,
            progress: Math.min(1, Math.max(0, summary.confidence.score))
        }
    ]
        .map(
            (card) => `<div class="kpi-card">
      <p>${escapeHtml(card.label)}</p>
      <strong>${escapeHtml(card.value)}</strong>
      <div class="subtext">${escapeHtml(card.detail)}</div>
      <div class="progress"><span style="width:${(Math.min(1, Math.max(0, card.progress ?? 0)) * 100).toFixed(1)}%"></span></div>
    </div>`
        )
        .join("");

    const footer = notesIndexUpdatedAt
        ? `<footer>Notes index last updated at: ${escapeHtml(notesIndexUpdatedAt)}</footer>`
        : "<footer>CivicLens CLI report</footer>";

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>CivicLens Report • ${escapeHtml(topic.title)}</title>
    <style>
      :root {
        font-family: "IBM Plex Sans", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #111820;
        --muted: #5e646f;
        --border: #d0d5df;
        --surface: #ffffff;
        --slate: #182335;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 32px 0 48px;
        background: #f4f5f7;
        font-feature-settings: "tnum" 1;
      }
      .page {
        max-width: 1440px;
        margin: 0 auto;
        padding: 0 32px;
      }
      header {
        background: var(--surface);
        border: 1px solid var(--border);
        padding: 28px 32px;
        margin-bottom: 24px;
      }
      header h1 {
        margin: 0;
        font-size: 2rem;
      }
      header p {
        margin: 6px 0 0;
        color: var(--muted);
      }
      .kpi-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 12px;
        margin-top: 24px;
      }
      .kpi-card {
        border: 1px solid var(--border);
        padding: 12px 14px;
        background: #f7f8fa;
      }
      .kpi-card p {
        margin: 0;
        font-size: 0.85rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--muted);
      }
      .kpi-card strong {
        display: block;
        font-size: 1.5rem;
        margin-top: 4px;
        color: var(--slate);
      }
      .kpi-card .subtext {
        font-size: 0.85rem;
        color: #6c7483;
        margin-top: 2px;
      }
      .kpi-card .progress {
        height: 4px;
        margin-top: 10px;
        background: #e2e6ef;
      }
      .kpi-card .progress span {
        display: block;
        height: 100%;
        background: #5b6a82;
      }
      main {
        display: flex;
        flex-direction: column;
        gap: 18px;
      }
      .dashboard-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
        gap: 18px;
      }
      .card {
        background: var(--surface);
        border: 1px solid var(--border);
        padding: 18px 20px;
      }
      .card .card-title,
      .card .tile-title,
      .card h3 {
        margin: 0 0 10px;
        font-size: 0.9rem;
        letter-spacing: 0.06em;
        color: var(--slate);
        text-transform: uppercase;
      }
      ul, ol {
        margin: 0;
        padding-left: 18px;
      }
      li {
        margin-bottom: 6px;
        line-height: 1.45;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.95rem;
      }
      th, td {
        text-align: left;
        padding: 6px 0;
        border-bottom: 1px solid #e6e8ef;
      }
      th {
        font-size: 0.78rem;
        color: var(--muted);
        letter-spacing: 0.05em;
      }
      .bias-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 10px;
      }
      .bias-grid div {
        border: 1px solid var(--border);
        padding: 10px 12px;
        background: #f7f8fa;
      }
      .bias-tags {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        gap: 10px;
        margin-top: 12px;
      }
      .tag-list {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      .tag-list li {
        border: 1px solid var(--border);
        padding: 4px 10px;
        margin: 4px 0;
        font-size: 0.82rem;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      pre {
        background: #1a1f2b;
        color: #f2f3f5;
        padding: 14px;
        font-size: 0.82rem;
        overflow-x: auto;
      }
      .muted { color: var(--muted); }
      .list-block.missing,
      .list-block.extra {
        background: #f9f9fb;
      }
      footer {
        margin-top: 24px;
        text-align: center;
        color: var(--muted);
        font-size: 0.85rem;
      }
    </style>
  </head>
  <body>
    <div class="page">
      <header>
        <h1>${escapeHtml(topic.title)}</h1>
        <p>${escapeHtml(summary.headline)}</p>
        <p>${escapeHtml(topic.urls.wikipedia)} • ${escapeHtml(topic.urls.grokipedia)}</p>
        <div class="cards-grid">${statsCards}</div>
      </header>
      <main>
        <section class="kpi-grid">${statsCards}</section>
        <section class="dashboard-grid">
          ${renderList(
              `Missing snippets (Wikipedia, total ${summary.missing_sentence_count})`,
              comparison.sentences.missing,
              "missing"
          )}
          ${renderList(
              `Extra snippets (Grokipedia, total ${summary.extra_sentence_count})`,
              comparison.sentences.extra,
              "extra"
          )}
          ${renderAlignmentTable(analysis)}
          ${renderDiscrepancyList("Core discrepancies", discrepancies.primary, "neutral")}
          ${renderBiasPanel(analysis)}
          ${renderDiscrepancyList("Hallucination cues", discrepancies.hallucinations, "alert")}
          ${renderDiffSample(analysis)}
          ${renderVerifications(analysis)}
          ${renderNoteCard(notePayload)}
        </section>
      </main>
      ${footer}
    </div>
  </body>
</html>`;
};

const writeHtmlReport = (topicId: string, html: string): string => {
    paths.ensureDir(paths.ANALYSIS_DIR);
    const target = path.join(paths.ANALYSIS_DIR, `${topicId}-report.html`);
    fs.writeFileSync(target, html, "utf8");
    return target;
};

const openInBrowser = (filePath: string): Promise<void> =>
    new Promise((resolve, reject) => {
        let command: string;
        let args: string[];
        if (process.platform === "darwin") {
            command = "open";
            args = [filePath];
        } else if (process.platform === "win32") {
            command = "cmd";
            args = ["/c", "start", "", filePath];
        } else {
            command = "xdg-open";
            args = [filePath];
        }
        try {
            const child = spawn(command, args, {detached: true, stdio: "ignore"});
            child.once("spawn", () => resolve());
            child.on("error", (error) => reject(new Error(`Failed to open browser for ${filePath}: ${(error as Error).message}`)));
            child.unref();
        } catch (error) {
            reject(new Error(`Failed to open browser for ${filePath}: ${(error as Error).message}`));
        }
    });

interface ShowOptions {
    topic: string;
    openHtml?: boolean;
}

const showCommand = new Command("show")
    .description("Display analysis + community note for a topic")
    .requiredOption("-t, --topic <id>", "Topic identifier")
    .option("--open-html", "Render an HTML report and open it in your browser")
    .action(async (options: ShowOptions) => {
        const topics = loadTopics();
        const topic = topics[options.topic];
        if (!topic) {
            throw new Error(`Unknown topic '${options.topic}'.`);
        }
        const analysis = loadAnalysis(topic);
        const notePayload = loadNoteEntry(topic.id);
        const notesIndex = loadNotesIndex();
        printAnalysis(analysis);
        printNote(topic.id, notePayload);
        if (notesIndex?.updated_at) {
            console.log(`\nNotes index last updated at: ${notesIndex.updated_at}`);
        }
        if (options.openHtml) {
            const html = renderHtmlReport(analysis, notePayload, notesIndex?.updated_at ?? null);
            const target = writeHtmlReport(topic.id, html);
            try {
                await openInBrowser(target);
                console.log(chalk.green(`\nOpened HTML report at ${target}`));
            } catch (error) {
                console.error(chalk.red(`Failed to open browser: ${(error as Error).message}`));
                console.log(`HTML report saved at ${target}`);
            }
        }
    });

export default showCommand;
