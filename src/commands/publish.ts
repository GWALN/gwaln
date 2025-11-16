/**
 * @file src/commands/publish.ts
 * @description Publishes arbitrary JSON-LD payloads (Community Notes or otherwise) to a DKG node
 *              using the same signing workflow as `notes publish`.
 * @author Doğu Abaris <abaris@null.net>
 */

import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';

import pkg from '../../package.json';
import { loadJsonLdFromFile, publishJsonLdAsset } from '../workflows/publish-workflow';

type PublishCLIOptions = {
  privacy?: string;
  endpoint?: string;
  environment?: string;
  port?: number;
  blockchain?: string;
  publicKey?: string;
  privateKey?: string;
  rpc?: string;
  epochs?: number;
  maxRetries?: number;
  pollFrequency?: number;
  dryRun?: boolean;
};

const publishCommand = new Command('publish')
  .description('Publish a JSON-LD Knowledge Asset from a file')
  .argument('<file>', 'Path to the JSON-LD file to publish')
  .option('--privacy <mode>', 'Specify asset privacy (public|private)', 'private')
  .option('--endpoint <url>', 'Override the DKG endpoint URL')
  .option(
    '--environment <env>',
    'Override the DKG environment (devnet|testnet|mainnet|development)',
  )
  .option('--port <number>', 'Override the DKG node port', (value) => Number(value))
  .option('--blockchain <id>', 'Specify blockchain identifier, e.g., hardhat1:31337')
  .option('--public-key <hex>', 'Override the blockchain public key')
  .option('--private-key <hex>', 'Override the blockchain private key')
  .option('--rpc <url>', 'Provide a custom blockchain RPC URL')
  .option('--epochs <number>', 'Number of epochs to retain the asset', (value) => Number(value))
  .option('--max-retries <number>', 'Maximum publish polling retries', (value) => Number(value))
  .option('--poll-frequency <number>', 'Seconds between publish polling attempts', (value) =>
    Number(value),
  )
  .option('--dry-run', 'Print payload instead of publishing')
  .action(async (filePath: string, options: PublishCLIOptions) => {
    const jsonld = loadJsonLdFromFile(filePath);
    console.log(
      chalk.cyan(
        `Publishing Knowledge Asset from '${filePath}' (privacy: ${options.privacy ?? 'private'})...`,
      ),
    );
    const spinnerLabel = `Publishing via configured DKG node (privacy: ${options.privacy ?? 'private'})`;
    const shouldSpin = !(options.dryRun ?? false);
    let spinner: ora.Ora | undefined;
    if (shouldSpin) {
      spinner = ora(spinnerLabel).start();
    }

    try {
      const result = await publishJsonLdAsset({
        ...options,
        payload: jsonld as Record<string, unknown>,
        privacy: (options.privacy as 'public' | 'private' | undefined) ?? 'private',
        rpcUrl: options.rpc,
        epochsNum: options.epochs,
        frequencySeconds: options.pollFrequency,
      });

      if (result.dryRun) {
        spinner?.stop();
        console.log(chalk.yellow('Dry-run enabled. Payload below:'));
        console.log(JSON.stringify(result.payload, null, 2));
        return;
      }

      spinner?.succeed('Knowledge Asset published successfully.');
      if (result.ual) {
        console.log(chalk.bold(`UAL: ${result.ual}`));
      }
      if (result.datasetRoot) {
        console.log(chalk.gray(`datasetRoot: ${result.datasetRoot}`));
      }
      console.log(chalk.gray(`CLI: civiclens-cli@${pkg.version}`));
    } catch (error) {
      spinner?.fail('DKG publish failed.');
      console.error(chalk.red('Error publishing asset:'), (error as Error).message);
      process.exitCode = 1;
    }
  });

export default publishCommand;
