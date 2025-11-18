/**
 * @file src/commands/query.ts
 * @description Queries the DKG to retrieve published Knowledge Assets by topic or UAL.
 * @author Doğu Abaris <abaris@null.net>
 */

import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { runQueryWorkflow } from '@gwaln/core';

interface QueryOptions {
  topic?: string;
  ual?: string;
  endpoint?: string;
  environment?: string;
  port?: number;
  blockchain?: string;
  privateKey?: string;
  publicKey?: string;
  rpc?: string;
  contentType?: 'public' | 'private' | 'all';
  includeMetadata?: boolean;
  outputFormat?: 'n-quads' | 'json-ld';
  maxRetries?: number;
  pollFrequency?: number;
  save?: string;
}

const queryCommand = new Command('query')
  .description('Query the DKG to retrieve published Knowledge Assets by topic or UAL')
  .option('--topic <title>', 'Topic title to query (e.g., "Moon")')
  .option('--ual <ual>', 'Universal Asset Locator to query directly')
  .option('--endpoint <url>', 'Override DKG node URL')
  .option('--environment <env>', 'Override DKG environment (devnet|testnet|mainnet|development)')
  .option('--port <number>', 'Override DKG node port', (value) => Number(value))
  .option('--blockchain <id>', 'Override blockchain identifier (e.g., hardhat1:31337)')
  .option('--private-key <hex>', 'Override blockchain private key')
  .option('--public-key <hex>', 'Override blockchain public key')
  .option('--rpc <url>', 'Override blockchain RPC URL')
  .option('--content-type <type>', 'Content type to retrieve: public, private, or all', 'all')
  .option('--include-metadata', 'Include metadata in the response')
  .option('--output-format <format>', 'Output format: json-ld or n-quads', 'json-ld')
  .option('--max-retries <number>', 'Maximum query polling retries', (value) => Number(value))
  .option('--poll-frequency <number>', 'Seconds between query polling attempts', (value) =>
    Number(value),
  )
  .option('--save <filename>', 'Save the retrieved assertion to a file in data/dkg/')
  .action(async (options: QueryOptions) => {
    const spinner = ora('[query] Retrieving asset from DKG...').start();

    try {
      const result = await runQueryWorkflow(options);

      spinner.succeed(
        `[query] Successfully retrieved${result.topicTitle ? ` ${result.topicTitle}` : ' asset'} from DKG`,
      );

      console.log(chalk.bold('\n# Retrieved Assertion'));
      console.log(JSON.stringify(result.assertion, null, 2));

      if (result.metadata) {
        console.log(chalk.bold('\n# Metadata'));
        console.log(JSON.stringify(result.metadata, null, 2));
      }

      if (result.savedPath) {
        console.log(chalk.green(`\n✓ Saved to ${result.savedPath}`));
      }
    } catch (error) {
      const message = (error as Error).message?.trim() || 'Unknown error';
      spinner.fail(`[query] Failed to retrieve asset: ${message}`);
      console.error(chalk.red(`\n✗ Error: ${message}`));
      process.exitCode = 1;
    }
  });

export default queryCommand;
