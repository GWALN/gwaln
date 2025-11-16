/**
 * @file src/commands/notes.ts
 * @description Builds Community Notes JSON-LD payloads from analyzer output, updates the notes index,
 *              and publishes notes to the DKG (build/publish/subcommands).
 * @author Doğu Abaris <abaris@null.net>
 */

import { Command } from 'commander';
import ora from 'ora';
import {
  buildNoteDraft,
  type BuildNoteInput,
  publishNoteDraft,
  type PublishNoteInput,
} from '../workflows/notes-workflow';

interface BuildCLIOptions {
  topic: string;
  summary?: string;
  accuracy?: string;
  completeness?: string;
  toneBias?: string;
  stakeToken?: string;
  stakeAmount?: string;
  reviewerName?: string;
  reviewerId?: string;
}

interface PublishCLIOptions {
  topic: string;
  ual?: string;
  endpoint?: string;
  environment?: string;
  port?: number;
  blockchain?: string;
  privateKey?: string;
  publicKey?: string;
  rpc?: string;
  epochs?: number;
  maxRetries?: number;
  pollFrequency?: number;
  dryRun?: boolean;
}

const parseNumber = (value?: string): number | undefined => {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const notesCommand = new Command('notes').description('Community Note helpers');

notesCommand
  .command('build')
  .description('Generate or update the JSON-LD Community Note for a topic')
  .requiredOption('-t, --topic <id>', 'Topic identifier')
  .option('--summary <text>', 'Override the auto-generated summary')
  .option('--accuracy <score>', 'Accuracy score 0-5')
  .option('--completeness <score>', 'Completeness score 0-5')
  .option('--tone-bias <score>', 'Tone/bias score 0-5')
  .option('--stake-token <symbol>', 'Token symbol for trust stake', 'TRAC')
  .option('--stake-amount <number>', 'Stake amount', '0')
  .option('--reviewer-name <string>', 'Reviewer/organization name', 'CivicLens')
  .option('--reviewer-id <string>', 'Reviewer DID/identifier')
  .action((options: BuildCLIOptions) => {
    const input: BuildNoteInput = {
      topicId: options.topic,
      summary: options.summary,
      accuracy: parseNumber(options.accuracy),
      completeness: parseNumber(options.completeness),
      toneBias: parseNumber(options.toneBias),
      stakeToken: options.stakeToken,
      stakeAmount: parseNumber(options.stakeAmount),
      reviewerName: options.reviewerName,
      reviewerId: options.reviewerId,
    };
    const result = buildNoteDraft(input);
    console.log(`[notes] Built Community Note for ${result.topicId} at ${result.filePath}`);
  });

notesCommand
  .command('publish')
  .description('Publish a Community Note via the DKG SDK (or record an existing UAL)')
  .requiredOption('-t, --topic <id>', 'Topic identifier')
  .option('--ual <ual>', 'Use a manually obtained UAL instead of calling the DKG node')
  .option('--endpoint <url>', 'Override DKG node URL')
  .option('--environment <env>', 'Override DKG environment (devnet|testnet|mainnet|development)')
  .option('--port <number>', 'Override DKG node port', (value) => Number(value))
  .option('--blockchain <id>', 'Override blockchain identifier (e.g., hardhat1:31337)')
  .option('--private-key <hex>', 'Override blockchain private key')
  .option('--public-key <hex>', 'Override blockchain public key')
  .option('--rpc <url>', 'Override blockchain RPC URL')
  .option('--epochs <number>', 'Override default publish epochs', (value) => Number(value))
  .option('--max-retries <number>', 'Maximum publish polling retries', (value) => Number(value))
  .option('--poll-frequency <number>', 'Seconds between publish polling attempts', (value) =>
    Number(value),
  )
  .option('--dry-run', 'Skip publish and print payload')
  .action(async (options: PublishCLIOptions) => {
    let spinner: ora.Ora | undefined;
    const shouldSpin = !options.ual && !options.dryRun;
    try {
      if (options.ual) {
        console.log(`[notes] Recording provided UAL for ${options.topic}: ${options.ual}`);
      } else if (shouldSpin) {
        spinner = ora(`[notes] Publishing ${options.topic} via configured DKG node`).start();
      }
      const input: PublishNoteInput = {
        ...options,
        topicId: options.topic,
        rpcUrl: options.rpc,
        epochsNum: options.epochs,
        frequencySeconds: options.pollFrequency,
      };
      const result = await publishNoteDraft(input);
      if (!options.ual && result.dryRun) {
        spinner?.stop();
        console.log(`[notes] Dry-run enabled for ${options.topic}. Payload:`);
        console.log(JSON.stringify(result.note, null, 2));
      } else if (spinner) {
        spinner.succeed(
          result.ual
            ? `[notes] DKG publish completed. UAL: ${result.ual}`
            : '[notes] DKG publish completed. UAL not included in response.',
        );
      }
      if (result.logPath) {
        console.log(`[notes] Saved DKG response to ${result.logPath}`);
      }
    } catch (error) {
      const message = (error as Error).message?.trim() || 'Unknown error';
      spinner?.fail(`[notes] DKG publish failed: ${message}`);
      console.error(`[notes] Publish failed: ${message}`);
      process.exitCode = 1;
    }
  });

export default notesCommand;
