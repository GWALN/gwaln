/**
 * @file src/workflows/show-workflow.ts
 * @description Shared helpers for loading GWALN analysis + note data.
 */

import fs from 'node:fs';
import path from 'node:path';
import { renderHtmlReport } from '../lib/html-renderer';
import { coerceStructuredAnalysisReport, StructuredAnalysisReport } from '../lib/structured-report';
import { loadNoteEntry, loadNotesIndex, type NotesIndex } from '../shared/notes';
import { paths } from '../shared/paths';
import { loadTopics, Topic } from '../shared/topics';

const ensureTopic = (topicId: string): Topic => {
  const topics = loadTopics();
  const topic = topics[topicId];
  if (!topic) {
    throw new Error(`Unknown topic '${topicId}'.`);
  }
  return topic;
};

export const loadAnalysisReport = (topicId: string): StructuredAnalysisReport => {
  const topic = ensureTopic(topicId);
  const target = path.join(paths.ANALYSIS_DIR, `${topic.id}.json`);
  if (!fs.existsSync(target)) {
    throw new Error(
      `Analysis not found for topic '${topic.id}'. Run 'gwaln analyse --topic ${topic.id}' first.`,
    );
  }
  const raw = fs.readFileSync(target, 'utf8');
  const parsed = JSON.parse(raw) as StructuredAnalysisReport | Record<string, unknown>;
  return coerceStructuredAnalysisReport(topic, parsed as StructuredAnalysisReport);
};

export interface ShowContext {
  topic: Topic;
  analysis: StructuredAnalysisReport;
  noteEntry: ReturnType<typeof loadNoteEntry>;
  notesIndex: NotesIndex | null;
}

export const loadShowContext = (topicId: string): ShowContext => {
  const topic = ensureTopic(topicId);
  const analysis = loadAnalysisReport(topicId);
  const noteEntry = loadNoteEntry(topic.id);
  const notesIndex = loadNotesIndex();
  return {
    topic,
    analysis,
    noteEntry,
    notesIndex,
  };
};

export const writeHtmlAnalysisReport = (topicId: string, html: string): string => {
  paths.ensureDir(paths.ANALYSIS_DIR);
  const target = path.join(paths.ANALYSIS_DIR, `${topicId}-report.html`);
  fs.writeFileSync(target, html, 'utf8');

  const templateDir = path.join(__dirname, '../templates');
  const logoSource = path.join(templateDir, 'gwaln-logo.svg');
  const faviconSource = path.join(templateDir, 'favicon.svg');
  const logoTarget = path.join(paths.ANALYSIS_DIR, 'gwaln-logo.svg');
  const faviconTarget = path.join(paths.ANALYSIS_DIR, 'favicon.svg');

  if (fs.existsSync(logoSource)) {
    fs.copyFileSync(logoSource, logoTarget);
  }
  if (fs.existsSync(faviconSource)) {
    fs.copyFileSync(faviconSource, faviconTarget);
  }

  return target;
};

export const renderAndWriteHtmlReport = (
  topicId: string,
  context: ShowContext,
): { html: string; filePath: string } => {
  const html = renderHtmlReport(
    context.analysis,
    context.noteEntry,
    context.notesIndex?.updated_at ?? null,
  );
  const filePath = writeHtmlAnalysisReport(topicId, html);
  return { html, filePath };
};
