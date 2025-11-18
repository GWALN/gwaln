/**
 * @file src/commands/init.ts
 * @description Interactive/non-interactive configuration. Captures DKG endpoint, blockchain keys,
 *              graph IDs, publish defaults, and Gemini credentials in `.gwalnrc.json`.
 * @author Doğu Abaris <abaris@null.net>
 */

import chalk from 'chalk';
import { Command } from 'commander';
import prompts from 'prompts';
import { CONFIG_PATH, readConfig, writeConfig } from '@gwaln/core';

type InitOptions = {
  endpoint?: string;
  environment?: string;
  graphId?: string;
  port?: number;
  blockchain?: string;
  privateKey?: string;
  publicKey?: string;
  rpc?: string;
  epochs?: number;
  maxRetries?: number;
  pollFrequency?: number;
  dryRun?: boolean;
  live?: boolean;
};

const normalize = (value?: string | null) =>
  value && value.trim().length ? value.trim() : undefined;
const normalizeUrl = (value?: string | null) =>
  value && value.trim().length ? value.trim().replace(/\/+$/, '') : undefined;
const FALLBACK_PORT = 8900;
const FALLBACK_BLOCKCHAIN = 'hardhat1:31337';
const FALLBACK_ENVIRONMENT = 'devnet';
const FALLBACK_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const FALLBACK_PUBLIC_KEY = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const FALLBACK_EPOCHS = 6;
const FALLBACK_MAX_RETRIES = 60;
const FALLBACK_POLL_FREQUENCY = 5;

const initCommand = new Command('init')
  .description('Configure default DKG endpoints, blockchain keys, and publish settings')
  .option('--endpoint <url>', 'DKG Edge Node base URL')
  .option('--environment <env>', 'DKG environment (development|devnet|testnet|mainnet)')
  .option('--graph-id <id>', 'Default graph identifier')
  .option('--port <number>', 'DKG node port', (value) => Number(value))
  .option('--blockchain <id>', 'Blockchain identifier, e.g., hardhat1:31337')
  .option('--private-key <hex>', 'Blockchain private key used for publishing')
  .option('--public-key <hex>', 'Blockchain public key override (optional)')
  .option('--rpc <url>', 'Custom blockchain RPC URL (optional)')
  .option('--epochs <number>', 'Default epochs to retain published assets', (value) =>
    Number(value),
  )
  .option('--max-retries <number>', 'Maximum publish polling retries', (value) => Number(value))
  .option('--poll-frequency <number>', 'Seconds between publish polling attempts', (value) =>
    Number(value),
  )
  .option('--dry-run', 'Enable publish dry-run mode by default')
  .option('--live', 'Disable publish dry-run mode (publish live by default)')
  .action(async (options: InitOptions) => {
    if (options.dryRun && options.live) {
      console.error(chalk.red('[error] --dry-run and --live cannot be used together.'));
      process.exit(1);
    }

    const existing = readConfig();
    const onCancel = () => {
      console.log(chalk.yellow('Initialization cancelled.'));
      process.exit(1);
    };

    const responses = await prompts(
      [
        {
          type: options.endpoint ? null : 'text',
          name: 'endpoint',
          message: 'DKG Edge Node URL',
          initial: existing.dkgEdgeNodeUrl ?? 'http://localhost:9200',
          validate: (value: string) =>
            value && value.trim().length ? true : 'Endpoint is required.',
        },
        {
          type: options.environment ? null : 'select',
          name: 'environment',
          message: 'DKG environment',
          initial: existing.dkgEnvironment ?? FALLBACK_ENVIRONMENT,
          choices: [
            { title: 'development', value: 'development' },
            { title: 'devnet', value: 'devnet' },
            { title: 'testnet', value: 'testnet' },
            { title: 'mainnet', value: 'mainnet' },
          ],
        },
        {
          type: options.port !== undefined ? null : 'number',
          name: 'port',
          message: 'DKG node port',
          initial: existing.dkgNodePort ?? FALLBACK_PORT,
          validate: (value: number) => (Number.isFinite(value) ? true : 'Port must be numeric.'),
        },
        {
          type: options.blockchain ? null : 'text',
          name: 'blockchain',
          message: 'Blockchain identifier (hardhat/base/gnosis/...)',
          initial: existing.dkgBlockchainId ?? FALLBACK_BLOCKCHAIN,
          validate: (value: string) =>
            value && value.trim().length ? true : 'Blockchain is required.',
        },
        {
          type: options.privateKey ? null : 'password',
          name: 'privateKey',
          message: 'Blockchain private key',
          initial: existing.dkgPrivateKey ?? FALLBACK_PRIVATE_KEY,
          validate: (value: string) =>
            value && value.trim().length ? true : 'Private key is required.',
        },
        {
          type: options.publicKey ? null : 'text',
          name: 'publicKey',
          message: 'Blockchain public key (optional)',
          initial: existing.dkgPublicKey ?? FALLBACK_PUBLIC_KEY,
        },
        {
          type: options.rpc ? null : 'text',
          name: 'rpcUrl',
          message: 'Custom RPC URL (optional)',
          initial: existing.dkgRpcUrl ?? '',
        },
        {
          type: options.epochs !== undefined ? null : 'number',
          name: 'publishEpochs',
          message: 'Default epochs to retain assets',
          initial: existing.publishEpochs ?? FALLBACK_EPOCHS,
          validate: (value: number) => (value > 0 ? true : 'Epochs must be greater than zero.'),
        },
        {
          type: options.maxRetries !== undefined ? null : 'number',
          name: 'publishMaxRetries',
          message: 'Max retries while waiting for node operations',
          initial: existing.publishMaxRetries ?? FALLBACK_MAX_RETRIES,
          validate: (value: number) => (value > 0 ? true : 'Retries must be greater than zero.'),
        },
        {
          type: options.pollFrequency !== undefined ? null : 'number',
          name: 'publishPollFrequencySeconds',
          message: 'Seconds between polling attempts',
          initial: existing.publishPollFrequencySeconds ?? FALLBACK_POLL_FREQUENCY,
          validate: (value: number) => (value > 0 ? true : 'Frequency must be greater than zero.'),
        },
        {
          type: options.graphId ? null : 'text',
          name: 'graphId',
          message: 'Default graph ID',
          initial: existing.dkgGraphId ?? 'default-graph',
        },
        {
          type: options.dryRun !== undefined || options.live !== undefined ? null : 'toggle',
          name: 'publishDryRun',
          message: 'Enable publish dry-run mode by default?',
          active: 'yes',
          inactive: 'no',
          initial: existing.publishDryRun ?? false,
        },
      ],
      { onCancel },
    );

    const endpoint = normalizeUrl(options.endpoint) ?? normalizeUrl(responses.endpoint);
    if (!endpoint) {
      console.error(chalk.red('[error] DKG Node URL is required.'));
      process.exit(1);
    }

    const environment =
      normalize(options.environment) ??
      normalize(responses.environment) ??
      existing.dkgEnvironment ??
      FALLBACK_ENVIRONMENT;
    const graphId = normalize(options.graphId) ?? normalize(responses.graphId) ?? 'default-graph';
    const port = options.port ?? responses.port ?? existing.dkgNodePort ?? FALLBACK_PORT;
    const blockchain =
      normalize(options.blockchain) ??
      normalize(responses.blockchain) ??
      existing.dkgBlockchainId ??
      FALLBACK_BLOCKCHAIN;
    const privateKey =
      normalize(options.privateKey) ??
      normalize(responses.privateKey) ??
      existing.dkgPrivateKey ??
      FALLBACK_PRIVATE_KEY;
    const publicKey =
      normalize(options.publicKey) ??
      normalize(responses.publicKey) ??
      existing.dkgPublicKey ??
      FALLBACK_PUBLIC_KEY;
    const rpcUrl =
      normalizeUrl(options.rpc) ?? normalizeUrl(responses.rpcUrl) ?? existing.dkgRpcUrl;
    const publishEpochs =
      options.epochs ?? responses.publishEpochs ?? existing.publishEpochs ?? FALLBACK_EPOCHS;
    const publishMaxRetries =
      options.maxRetries ??
      responses.publishMaxRetries ??
      existing.publishMaxRetries ??
      FALLBACK_MAX_RETRIES;
    const publishPollFrequency =
      options.pollFrequency ??
      responses.publishPollFrequencySeconds ??
      existing.publishPollFrequencySeconds ??
      FALLBACK_POLL_FREQUENCY;
    const publishDryRun =
      options.dryRun === true
        ? true
        : options.live === true
          ? false
          : typeof responses.publishDryRun === 'boolean'
            ? responses.publishDryRun
            : (existing.publishDryRun ?? false);
    const updated = writeConfig({
      dkgEdgeNodeUrl: endpoint,
      dkgEnvironment: environment,
      dkgGraphId: graphId,
      dkgNodePort: Number(port) || FALLBACK_PORT,
      dkgBlockchainId: blockchain,
      dkgPrivateKey: privateKey,
      dkgPublicKey: publicKey,
      dkgRpcUrl: rpcUrl,
      publishEpochs: Number(publishEpochs) || FALLBACK_EPOCHS,
      publishMaxRetries: Number(publishMaxRetries) || FALLBACK_MAX_RETRIES,
      publishPollFrequencySeconds: Number(publishPollFrequency) || FALLBACK_POLL_FREQUENCY,
      publishDryRun,
    });

    console.log(chalk.green('GWALN CLI configured successfully.'));
    console.log(chalk.gray(`   Saved to ${CONFIG_PATH}`));
    console.log(
      [
        '',
        'Current defaults:',
        `  • Node: ${updated.dkgEdgeNodeUrl}:${updated.dkgNodePort ?? FALLBACK_PORT}`,
        `  • Environment: ${updated.dkgEnvironment ?? environment}`,
        `  • Blockchain: ${updated.dkgBlockchainId ?? FALLBACK_BLOCKCHAIN}`,
        `  • Graph ID: ${updated.dkgGraphId ?? 'default-graph'}`,
        `  • Publish dry-run: ${updated.publishDryRun ? 'enabled' : 'disabled'}`,
        `  • Publish epochs: ${updated.publishEpochs ?? FALLBACK_EPOCHS}`,
        `  • Publish retries: ${updated.publishMaxRetries ?? FALLBACK_MAX_RETRIES}`,
        `  • Poll frequency: ${updated.publishPollFrequencySeconds ?? FALLBACK_POLL_FREQUENCY}s`,
        '',
      ].join('\n'),
    );
  });

export default initCommand;
