/**
 * @file src/shared/notes.ts
 * @description Utilities for loading Community Note drafts and their index metadata.
 * @author Doğu Abaris <abaris@null.net>
 */

import fs from 'node:fs';
import path from 'node:path';
import { paths } from './paths';

export interface StakeInfo {
  token: string;
  amount: number;
}

export interface NoteIndexEntry {
  topic_id: string;
  topic_title: string;
  file: string;
  status: 'draft' | 'published';
  analysis_file: string;
  generated_at: string;
  published_at?: string | null;
  ual?: string | null;
  stake?: StakeInfo;
}

export interface NotesIndex {
  notes: NoteIndexEntry[];
  updated_at: string | null;
}

const emptyIndex = (): NotesIndex => ({
  notes: [],
  updated_at: null,
});

export const loadNotesIndex = (): NotesIndex | null => {
  if (!fs.existsSync(paths.NOTES_INDEX)) {
    return null;
  }
  const raw = fs.readFileSync(paths.NOTES_INDEX, 'utf8');
  return JSON.parse(raw) as NotesIndex;
};

const writeNotesIndex = (index: NotesIndex): void => {
  fs.mkdirSync(path.dirname(paths.NOTES_INDEX), { recursive: true });
  fs.writeFileSync(paths.NOTES_INDEX, JSON.stringify(index, null, 2), 'utf8');
};

export const upsertNoteIndexEntry = (
  topicId: string,
  mutator: (existing: NoteIndexEntry | null) => NoteIndexEntry,
): NoteIndexEntry => {
  const index = loadNotesIndex() ?? emptyIndex();
  const existingIdx = index.notes.findIndex((entry) => entry.topic_id === topicId);
  const existing = existingIdx >= 0 ? index.notes[existingIdx] : null;
  const nextEntry = mutator(existing);
  if (!nextEntry.file) {
    throw new Error('Note entry must specify a file path.');
  }
  if (existingIdx >= 0) {
    index.notes[existingIdx] = nextEntry;
  } else {
    index.notes.push(nextEntry);
  }
  index.updated_at = new Date().toISOString();
  writeNotesIndex(index);
  return nextEntry;
};

export const loadNoteEntry = (
  topicId: string,
): {
  entry: NoteIndexEntry | null;
  note: Record<string, unknown> | null;
} => {
  const index = loadNotesIndex();
  if (!index) {
    return { entry: null, note: null };
  }
  const entry = index.notes.find((note) => note.topic_id === topicId) ?? null;
  if (!entry) {
    return { entry: null, note: null };
  }
  const notePath = path.join(paths.NOTES_DIR, entry.file);
  if (!fs.existsSync(notePath)) {
    return { entry, note: null };
  }
  const raw = fs.readFileSync(notePath, 'utf8');
  return { entry, note: JSON.parse(raw) };
};
