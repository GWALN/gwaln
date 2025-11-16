/**
 * @file src/commands/query.ts
 * @description Queries the DKG to retrieve published Knowledge Assets by topic or UAL.
 * @author Doğu Abaris <abaris@null.net>
 */

import chalk from 'chalk';
import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import ora from 'ora';
import { getDkgAsset, searchDkgAssetsByTopic } from '../lib/dkg';
import { resolvePublishConfig } from '../shared/config';
import { loadNoteEntry } from '../shared/notes';
import { paths } from '../shared/paths';
import { loadTopics } from '../shared/topics';

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
    if (!options.topic && !options.ual) {
      console.error(chalk.red('Error: Either --topic or --ual must be specified.'));
      process.exitCode = 1;
      return;
    }

    if (options.topic && options.ual) {
      console.error(chalk.red('Error: Cannot specify both --topic and --ual. Choose one.'));
      process.exitCode = 1;
      return;
    }

    const spinner = ora('[query] Retrieving asset from DKG...').start();

    let ual: string;
    let topicTitle: string | undefined;

    if (options.topic) {
      try {
        const topics = loadTopics();

        const topicEntry = Object.values(topics).find(
          (t) => t.title.toLowerCase() === options.topic!.toLowerCase(),
        );

        if (!topicEntry) {
          const availableTitles = Object.values(topics)
            .map((t) => t.title)
            .join(', ');
          spinner.fail(
            `[query] Topic '${options.topic}' not found. Available topics: ${availableTitles}`,
          );
          process.exitCode = 1;
          return;
        }

        topicTitle = topicEntry.title;
        const topicId = topicEntry.id;
        spinner.text = `[query] Looking up ${topicTitle}...`;

        const { entry } = loadNoteEntry(topicId);
        if (entry && entry.status === 'published' && entry.ual) {
          console.log(chalk.gray(`[query] Found local UAL cache for ${topicTitle}`));
          ual = entry.ual;
        } else {
          spinner.text = `[query] Searching DKG for ${topicTitle}...`;

          const publishConfig = resolvePublishConfig({
            endpoint: options.endpoint,
            environment: options.environment,
            port: options.port,
            blockchain: options.blockchain,
            privateKey: options.privateKey,
            publicKey: options.publicKey,
            rpcUrl: options.rpc,
            maxRetries: options.maxRetries,
            frequencySeconds: options.pollFrequency,
          });

          const foundUal = await searchDkgAssetsByTopic(topicId, {
            endpoint: publishConfig.endpoint,
            port: publishConfig.port,
            environment: publishConfig.environment,
            blockchain: {
              name: publishConfig.blockchain,
              privateKey: publishConfig.privateKey,
              publicKey: publishConfig.publicKey,
              rpc: publishConfig.rpcUrl,
            },
            maxNumberOfRetries: publishConfig.maxRetries,
            frequencySeconds: publishConfig.frequencySeconds,
          });

          if (!foundUal) {
            spinner.fail(
              `[query] No published Community Note found for topic '${topicTitle}' on DKG.`,
            );
            console.log(
              chalk.yellow(
                `\nHint: Publish a Community Note first with 'civiclens notes publish --topic ${topicId}'.`,
              ),
            );
            process.exitCode = 1;
            return;
          }

          ual = foundUal;
        }

        spinner.text = `[query] Retrieving ${topicTitle} from DKG...`;
      } catch (error) {
        spinner.fail(`[query] Failed to resolve topic: ${(error as Error).message}`);
        process.exitCode = 1;
        return;
      }
    } else {
      ual = options.ual!;
    }

    try {
      const publishConfig = resolvePublishConfig({
        endpoint: options.endpoint,
        environment: options.environment,
        port: options.port,
        blockchain: options.blockchain,
        privateKey: options.privateKey,
        publicKey: options.publicKey,
        rpcUrl: options.rpc,
        maxRetries: options.maxRetries,
        frequencySeconds: options.pollFrequency,
      });

      const contentType = options.contentType as 'public' | 'private' | 'all' | undefined;
      const outputFormat = options.outputFormat as 'n-quads' | 'json-ld' | undefined;

      const result = await getDkgAsset(ual, {
        endpoint: publishConfig.endpoint,
        port: publishConfig.port,
        environment: publishConfig.environment,
        blockchain: {
          name: publishConfig.blockchain,
          privateKey: publishConfig.privateKey,
          publicKey: publishConfig.publicKey,
          rpc: publishConfig.rpcUrl,
        },
        contentType: contentType ?? 'all',
        includeMetadata: options.includeMetadata ?? false,
        outputFormat: outputFormat ?? 'json-ld',
        maxNumberOfRetries: publishConfig.maxRetries,
        frequencySeconds: publishConfig.frequencySeconds,
      });

      spinner.succeed(
        `[query] Successfully retrieved${topicTitle ? ` ${topicTitle}` : ' asset'} from DKG`,
      );

      console.log(chalk.bold('\n# Retrieved Assertion'));
      console.log(JSON.stringify(result.assertion, null, 2));

      if (result.metadata) {
        console.log(chalk.bold('\n# Metadata'));
        console.log(JSON.stringify(result.metadata, null, 2));
      }

      if (options.save) {
        const dkgDir = path.join(paths.DATA_DIR, 'dkg');
        fs.mkdirSync(dkgDir, { recursive: true });
        const filename = options.save.endsWith('.json') ? options.save : `${options.save}.json`;
        const savePath = path.join(dkgDir, filename);

        const saveData: Record<string, unknown> = {
          ual,
          retrieved_at: new Date().toISOString(),
          assertion: result.assertion,
        };

        if (topicTitle) {
          saveData.topic = topicTitle;
        }

        if (result.metadata) {
          saveData.metadata = result.metadata;
        }

        fs.writeFileSync(savePath, JSON.stringify(saveData, null, 2), 'utf8');
        console.log(chalk.green(`\n✓ Saved to ${savePath}`));
      }
    } catch (error) {
      const message = (error as Error).message?.trim() || 'Unknown error';
      spinner.fail(`[query] Failed to retrieve asset: ${message}`);
      console.error(chalk.red(`\n✗ Error: ${message}`));
      process.exitCode = 1;
    }
  });

export default queryCommand;
