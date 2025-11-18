/**
 * @file src/commands/lookup.ts
 * @description CLI wiring for the lookup workflow. Business logic lives in `src/workflows/lookup-workflow.ts`.
 * @author Doğu Abaris <abaris@null.net>
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  runLookupWorkflow,
  addTopicToCatalog,
  type GrokipediaSearchResult,
  type WikipediaSearchResult,
} from '@gwaln/core';

type LookupCliOptions = {
  limit?: string;
};

const displayLocalTopic = (topic: {
  id: string;
  title: string;
  wikipedia_slug: string;
  grokipedia_slug: string;
  ual?: string;
  category?: string;
}): void => {
  console.log(chalk.green('[lookup] Topic found in local catalog:'));
  console.log(chalk.white(`  Title: ${topic.title}`));
  console.log(chalk.gray(`  ID: ${topic.id}`));
  console.log(chalk.gray(`  Wikipedia: ${topic.wikipedia_slug}`));
  console.log(chalk.gray(`  Grokipedia: ${topic.grokipedia_slug}`));
  if (topic.ual) {
    console.log(chalk.gray(`  UAL: ${topic.ual}`));
  }
  if (topic.category) {
    console.log(chalk.gray(`  Category: ${topic.category}`));
  }
};

const displaySearchResults = (
  grokResults: GrokipediaSearchResult[],
  wikiResults: WikipediaSearchResult[],
): void => {
  console.log(chalk.cyan('Grokipedia Results:'));
  if (grokResults.length > 0) {
    grokResults.forEach((result, idx) => {
      const slug = result.slug || result.url?.replace(/^https?:\/\/grokipedia\.com\//i, '') || '';
      console.log(chalk.gray(`  ${idx + 1}. ${result.title}${slug ? ` (${slug})` : ''}`));
    });
  } else {
    console.log(chalk.gray('  No results found'));
  }

  console.log(chalk.cyan('\nWikipedia Results:'));
  if (wikiResults.length > 0) {
    wikiResults.forEach((result, idx) => {
      console.log(chalk.gray(`  ${idx + 1}. ${result.title} (${result.key})`));
      if (result.description) {
        console.log(chalk.gray(`     ${result.description}`));
      }
    });
  } else {
    console.log(chalk.gray('  No results found'));
  }
};

const promptAndAddTopic = async (
  grokResults: GrokipediaSearchResult[],
  wikiResults: WikipediaSearchResult[],
): Promise<void> => {
  if (grokResults.length === 0 || wikiResults.length === 0) {
    if (grokResults.length === 0) {
      console.log(chalk.yellow('\n[lookup] Cannot add topic: no Grokipedia results found.'));
    } else {
      console.log(chalk.yellow('\n[lookup] Cannot add topic: no Wikipedia results found.'));
    }
    return;
  }

  const selectedGrok = grokResults[0];
  const selectedWiki = wikiResults[0];

  let grokSlug = selectedGrok.slug || selectedGrok.title.replace(/\s+/g, '_');
  if (!grokSlug.startsWith('page/')) {
    grokSlug = `page/${grokSlug}`;
  }

  const wikiSlug = selectedWiki.key;

  const newTopic = addTopicToCatalog({
    title: selectedWiki.title,
    wikipediaSlug: wikiSlug,
    grokipediaSlug: grokSlug,
  });

  console.log(chalk.green(`\n[lookup] Added topic "${newTopic.title}" to catalog`));
  console.log(chalk.gray(`  ID: ${newTopic.id}`));
  console.log(chalk.gray(`  Wikipedia: ${newTopic.wikipedia_slug}`));
  console.log(chalk.gray(`  Grokipedia: ${newTopic.grokipedia_slug}`));
};

const lookupCommand = new Command('lookup')
  .description('Lookup a topic in the catalog or search APIs to add it')
  .argument('<query>', 'Topic name or keyword to lookup')
  .option('--limit <number>', 'Number of search results to show', '5')
  .action(async (query: string, options: LookupCliOptions) => {
    const limit = parseInt(options.limit || '5', 10);

    console.log(chalk.cyan(`[lookup] Looking up "${query}"...\n`));

    const result = await runLookupWorkflow({
      query,
      searchApis: false,
      limit,
    });

    if (result.found && result.topic) {
      displayLocalTopic(result.topic);
      return;
    }

    console.log(chalk.yellow('[lookup] Topic not found in local catalog.'));
    console.log(chalk.cyan('[lookup] Searching Grokipedia and Wikipedia APIs...\n'));

    const searchResult = await runLookupWorkflow({
      query,
      searchApis: true,
      limit,
    });

    if (!searchResult.searchResults) {
      return;
    }

    const { grokipedia: grokResults, wikipedia: wikiResults } = searchResult.searchResults;

    if (grokResults.length === 0 && wikiResults.length === 0) {
      console.log(chalk.red('[lookup] No results found on either platform.'));
      return;
    }

    displaySearchResults(grokResults, wikiResults);
    await promptAndAddTopic(grokResults, wikiResults);
  });

export default lookupCommand;
