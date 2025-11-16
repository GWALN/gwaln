/**
 * @file src/commands/fetch.ts
 * @description CLI wiring for the fetch workflow. Business logic lives in `src/workflows/fetch-workflow.ts`.
 */

import { Command } from 'commander';
import { runFetchWorkflow } from '../workflows/fetch-workflow';

type FetchCliOptions = { topic?: string };

const fetchCommand = new Command('fetch').description(
  'Download topic content from Grokipedia and Wikipedia for offline comparison',
);

const registerSubcommand = (source: 'wiki' | 'grok', description: string): void => {
  fetchCommand
    .command(source)
    .description(description)
    .option('-t, --topic <id>', 'Topic identifier (default: all topics)')
    .action(async (options: FetchCliOptions) => {
      await runFetchWorkflow(source, options.topic);
    });
};

registerSubcommand('wiki', 'Fetch articles from Wikipedia');
registerSubcommand('grok', 'Fetch articles from Grokipedia');

export default fetchCommand;
