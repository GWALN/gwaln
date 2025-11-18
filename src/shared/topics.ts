/**
 * @file src/shared/topics.ts
 * @description Topic loading + selection helpers shared across CLI commands.
 * @author Doğu Abaris <abaris@null.net>
 */

import fs from 'node:fs';
import { paths } from './paths';

export interface Topic {
  id: string;
  title: string;
  wikipedia_slug: string;
  grokipedia_slug: string;
  ual?: string;
  category?: string;
}

export type TopicMap = Record<string, Topic>;

export const loadTopics = (): TopicMap => {
  paths.ensureTopics();

  const raw = fs.readFileSync(paths.TOPICS, 'utf8');
  const list = JSON.parse(raw) as Topic[];
  return Object.fromEntries(list.map((topic) => [topic.id, topic]));
};

export const selectTopics = (topics: TopicMap, targetId?: string): Topic[] => {
  if (targetId) {
    const topic = topics[targetId];
    if (!topic) {
      throw new Error(
        `Unknown topic id '${targetId}'. Available: ${Object.keys(topics).join(', ')}`,
      );
    }
    return [topic];
  }
  return Object.values(topics);
};

export const topicUrls = (topic: Topic): { wikipedia: string; grokipedia: string } => ({
  wikipedia: `https://en.wikipedia.org/wiki/${topic.wikipedia_slug}`,
  grokipedia: `https://grokipedia.com/${topic.grokipedia_slug.replace(/^\/+/, '')}`,
});

export const writeTopics = (topics: Topic[]): void => {
  const sorted = [...topics].sort((a, b) => a.title.localeCompare(b.title));
  fs.writeFileSync(paths.TOPICS, JSON.stringify(sorted, null, 2), 'utf8');
};
