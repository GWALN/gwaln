/**
 * @file src/commands/show.ts
 * @description Displays structured CivicLens analysis summaries and optionally renders a polished HTML report.
 *              The CLI view stays concise while the HTML export uses a richer layout suitable for sharing.
 * @author Doğu Abaris <abaris@null.net>
 */

import chalk from 'chalk';
import { Command } from 'commander';
import { spawn } from 'node:child_process';
import { StructuredAnalysisReport } from '../lib/structured-report';
import { NoteIndexEntry } from '../shared/notes';
import {
  loadShowContext,
  renderAndWriteHtmlReport,
  type ShowContext,
} from '../workflows/show-workflow';

type NotePayload = { entry: NoteIndexEntry | null; note: Record<string, unknown> | null };

const formatPercent = (ratio: number): string => `${(ratio * 100).toFixed(1)}%`;

const formatSnippet = (value: string): string =>
  value.length > 160 ? `${value.slice(0, 160)}…` : value;

const colorDiffLine = (line: string): string => {
  if (line.startsWith('+') && !line.startsWith('+++')) {
    return chalk.green(line);
  }
  if (line.startsWith('-') && !line.startsWith('---')) {
    return chalk.red(line);
  }
  if (line.startsWith('@@')) {
    return chalk.cyan(line);
  }
  if (line.startsWith('diff') || line.startsWith('---') || line.startsWith('+++')) {
    return chalk.magenta(line);
  }
  return line;
};

const printBulletSection = (
  title: string,
  color: (input: string) => string,
  items: string[],
): void => {
  if (!items.length) return;
  console.log(color(`\n${title}`));
  items.forEach((item) => console.log(` | ${formatSnippet(item)}`));
};

const printAnalysis = (analysis: StructuredAnalysisReport): void => {
  const {
    topic,
    summary,
    comparison,
    discrepancies,
    attachments,
    bias_metrics: biasMetrics,
    meta,
  } = analysis;
  console.log(chalk.bold(`# ${topic.title} (${topic.id})`));
  console.log(chalk.gray(summary.headline));
  console.log(
    [
      `Word similarity: ${formatPercent(summary.similarity_ratio.word)}`,
      `Sentence similarity: ${formatPercent(summary.similarity_ratio.sentence)}`,
      `N-gram overlap: ${formatPercent(summary.ngram_overlap)}`,
      `Wiki chars: ${summary.wiki_char_count}`,
      `Grok chars: ${summary.grok_char_count}`,
      `Confidence: ${summary.confidence.label} (${summary.confidence.score.toFixed(2)})`,
    ].join(' · '),
  );
  console.log(
    chalk.gray(
      `Analysis window: ${meta.analysis_window.wiki_analyzed_chars.toLocaleString()} wiki chars, ${meta.analysis_window.grok_analyzed_chars.toLocaleString()} grok chars (${meta.analysis_window.source_note})`,
    ),
  );

  printBulletSection(
    'Missing snippets (Wikipedia only)',
    chalk.yellow,
    comparison.sentences.missing,
  );
  printBulletSection('Extra snippets (Grokipedia only)', chalk.cyan, comparison.sentences.extra);

  const structuralIssues = discrepancies.primary ?? [];
  if (structuralIssues.length) {
    console.log(chalk.bold('\nStructured discrepancies:'));
    structuralIssues.forEach((issue, idx) => {
      const evidence = issue.evidence ?? {};
      const wikiEvidence = evidence.wikipedia
        ? `\n   - Wikipedia: ${formatSnippet(evidence.wikipedia)}`
        : '';
      const grokEvidence = evidence.grokipedia
        ? `\n   - Grokipedia: ${formatSnippet(evidence.grokipedia)}`
        : '';
      console.log(
        ` ${idx + 1}. [${issue.type}] ${issue.description}${wikiEvidence}${grokEvidence}`,
      );
    });
  }

  const sectionsMissing = comparison.sections.missing ?? [];
  const sectionsExtra = comparison.sections.extra ?? [];
  if (sectionsMissing.length || sectionsExtra.length) {
    console.log(chalk.bold('\nSection inventory:'));
    if (sectionsMissing.length) {
      console.log(
        chalk.yellow(` - Missing (${sectionsMissing.length}): ${sectionsMissing.join(', ')}`),
      );
    }
    if (sectionsExtra.length) {
      console.log(chalk.cyan(` - Extra (${sectionsExtra.length}): ${sectionsExtra.join(', ')}`));
    }
  }

  if (biasMetrics) {
    console.log(
      chalk.bold(
        `\nBias deltas → subjectivity: ${biasMetrics.subjectivity_delta.toFixed(3)}, polarity: ${biasMetrics.polarity_delta.toFixed(3)}`,
      ),
    );
  }

  if (discrepancies.bias.length) {
    printBulletSection(
      'Bias cues',
      chalk.magenta,
      discrepancies.bias.map((event) => event.description ?? ''),
    );
  }

  if (discrepancies.hallucinations.length) {
    printBulletSection(
      'Hallucination flags',
      chalk.red,
      discrepancies.hallucinations.map((event) => event.description ?? ''),
    );
  }

  const diffSample = attachments.diff_sample ?? [];
  if (diffSample.length) {
    console.log(chalk.gray('\nDiff sample:'));
    diffSample.slice(0, 24).forEach((line) => console.log(colorDiffLine(line)));
  }

  const citationChecks = attachments.citation_verifications ?? [];
  if (citationChecks.length) {
    console.log(chalk.bold('\nCitation verification:'));
    citationChecks.forEach((entry) => {
      const url = entry.supporting_url ? ` (${entry.supporting_url})` : '';
      const message = entry.message ? ` - ${entry.message}` : '';
      console.log(` - [${entry.status}] ${formatSnippet(entry.sentence ?? '')}${url}${message}`);
    });
  }

  const biasVerifications = attachments.bias_verifications ?? [];
  if (biasVerifications.length) {
    console.log(chalk.bold('\nBias verification (external):'));
    biasVerifications.forEach((entry) => {
      const confidence =
        typeof entry.confidence === 'number'
          ? ` (confidence ${entry.confidence.toFixed(2)})`
          : entry.confidence
            ? ` (${entry.confidence})`
            : '';
      console.log(
        ` - [${entry.provider}] event #${entry.event_index}: ${entry.verdict}${confidence}${
          entry.rationale ? ` - ${formatSnippet(entry.rationale)}` : ''
        }`,
      );
    });
  }

  if (attachments.gemini_summary?.text) {
    console.log(chalk.bold('\nGemini comparison summary:'));
    console.log(attachments.gemini_summary.text);
  }
};

const printNote = (topicId: string, payload: NotePayload): void => {
  console.log(chalk.bold('\n# Community Note'));
  const { entry, note } = payload;
  if (!entry) {
    console.log('No draft registered in notes/index.json yet.');
    return;
  }
  console.log(`- Status: ${entry.status ?? 'unknown'}`);
  console.log(`- File: ${entry.file}`);
  console.log(`- UAL: ${entry.ual ?? 'unpublished'}`);
  if (!note) {
    console.log('Draft file missing-copy template.json to begin.');
    return;
  }
  const rating = (note['reviewRating'] as Record<string, unknown>) ?? {};
  console.log(`Summary: ${(rating['ratingExplanation'] as string) ?? 'n/a'}`);
  const trust = (note['civicLensTrust'] as Record<string, unknown>) ?? {};
  const scores = {
    accuracy: trust['accuracy'],
    completeness: trust['completeness'],
    tone_bias: trust['tone_bias'],
  };
  if (Object.keys(scores).length) {
    console.log(
      `Trust scores -> accuracy: ${scores['accuracy'] ?? '?'}, completeness: ${scores['completeness'] ?? '?'}, tone/bias: ${
        scores['tone_bias'] ?? '?'
      }`,
    );
  }
  const stake = trust['stake'] as Record<string, unknown> | undefined;
  if (stake) {
    console.log(`Stake: ${stake['amount'] ?? 0} ${stake['token'] ?? 'TRAC'}`);
  }
  const annotations = (note['hasPart'] as Array<Record<string, unknown>>) ?? [];
  annotations.forEach((issue, idx) => {
    const body = issue.body as Record<string, string> | undefined;
    const target = issue.target as Array<Record<string, unknown>> | undefined;
    const wikiTarget = target?.find((t) => (t.source as string)?.includes('wikipedia'));
    const grokTarget = target?.find((t) => (t.source as string)?.includes('grokipedia'));
    console.log(
      `- ${idx + 1}. [${issue.classification ?? 'annotation'}] ${body?.value ?? ''}\n   Wikipedia: ${
        wikiTarget?.source ?? 'n/a'
      }\n   Grokipedia: ${grokTarget?.source ?? 'n/a'}`,
    );
  });
};

const openInBrowser = (filePath: string): Promise<void> =>
  new Promise((resolve, reject) => {
    let command: string;
    let args: string[];
    if (process.platform === 'darwin') {
      command = 'open';
      args = [filePath];
    } else if (process.platform === 'win32') {
      command = 'cmd';
      args = ['/c', 'start', '', filePath];
    } else {
      command = 'xdg-open';
      args = [filePath];
    }
    try {
      const child = spawn(command, args, { detached: true, stdio: 'ignore' });
      child.once('spawn', () => resolve());
      child.on('error', (error) =>
        reject(new Error(`Failed to open browser for ${filePath}: ${(error as Error).message}`)),
      );
      child.unref();
    } catch (error) {
      reject(new Error(`Failed to open browser for ${filePath}: ${(error as Error).message}`));
    }
  });

interface ShowOptions {
  topic: string;
  openHtml?: boolean;
}

const showCommand = new Command('show')
  .description('Display analysis + community note for a topic')
  .requiredOption('-t, --topic <id>', 'Topic identifier')
  .option('--open-html', 'Render an HTML report and open it in your browser')
  .action(async (options: ShowOptions) => {
    const context: ShowContext = loadShowContext(options.topic);
    const notePayload = context.noteEntry;
    const notesIndex = context.notesIndex;
    printAnalysis(context.analysis);
    printNote(context.topic.id, notePayload);
    if (notesIndex?.updated_at) {
      console.log(`\nNotes index last updated at: ${notesIndex.updated_at}`);
    }
    if (options.openHtml) {
      const { filePath: target } = renderAndWriteHtmlReport(context.topic.id, context);
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
