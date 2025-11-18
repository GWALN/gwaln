/**
 * @file src/shared/config.ts
 * @description Handles persistent GWALN CLI configuration (.gwalnrc.json).
 * @author Doğu Abaris <abaris@null.net>
 */

import { BLOCKCHAIN_IDS } from 'dkg.js/constants';
import fs from 'node:fs';
import path from 'node:path';
import { paths } from './paths';

export type GWALNConfig = {
  dkgEdgeNodeUrl?: string;
  dkgEnvironment?: string;
  dkgGraphId?: string;
  dkgNodePort?: number;
  dkgBlockchainId?: string;
  dkgPublicKey?: string;
  dkgPrivateKey?: string;
  dkgRpcUrl?: string;
  publishDryRun?: boolean;
  publishEpochs?: number;
  publishMaxRetries?: number;
  publishPollFrequencySeconds?: number;
  geminiApiKey?: string;
  geminiModel?: string;
};

export const CONFIG_PATH = path.join(paths.ROOT, '.gwalnrc.json');

const cleanUrl = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  return value.trim().replace(/\/+$/, '');
};

const FALLBACK_BLOCKCHAIN = BLOCKCHAIN_IDS.HARDHAT_1;
const FALLBACK_ENVIRONMENT = 'devnet';
const FALLBACK_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const FALLBACK_PUBLIC_KEY = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const FALLBACK_PORT = 8900;
const FALLBACK_EPOCHS = 6;
const FALLBACK_PUBLISH_MAX_RETRIES = 60;
const FALLBACK_PUBLISH_POLL_FREQUENCY = 5;

const BLOCKCHAIN_ALIASES: Record<string, string> = {
  neuroweb: BLOCKCHAIN_IDS.NEUROWEB_TESTNET,
  'neuroweb-testnet': BLOCKCHAIN_IDS.NEUROWEB_TESTNET,
  'otp:20430': BLOCKCHAIN_IDS.NEUROWEB_TESTNET,
  'neuroweb-mainnet': BLOCKCHAIN_IDS.NEUROWEB_MAINNET,
  'otp:2043': BLOCKCHAIN_IDS.NEUROWEB_MAINNET,
  base: BLOCKCHAIN_IDS.BASE_TESTNET,
  'base-testnet': BLOCKCHAIN_IDS.BASE_TESTNET,
  'base-mainnet': BLOCKCHAIN_IDS.BASE_MAINNET,
  'base:84532': BLOCKCHAIN_IDS.BASE_TESTNET,
  'base:8453': BLOCKCHAIN_IDS.BASE_MAINNET,
  gnosis: BLOCKCHAIN_IDS.GNOSIS_TESTNET,
  'gnosis-testnet': BLOCKCHAIN_IDS.GNOSIS_TESTNET,
  'gnosis-mainnet': BLOCKCHAIN_IDS.GNOSIS_MAINNET,
  'gnosis:10200': BLOCKCHAIN_IDS.GNOSIS_TESTNET,
  'gnosis:100': BLOCKCHAIN_IDS.GNOSIS_MAINNET,
  hardhat: BLOCKCHAIN_IDS.HARDHAT_1,
  hardhat1: BLOCKCHAIN_IDS.HARDHAT_1,
  hardhat2: BLOCKCHAIN_IDS.HARDHAT_2,
  'hardhat1:31337': BLOCKCHAIN_IDS.HARDHAT_1,
  'hardhat2:31337': BLOCKCHAIN_IDS.HARDHAT_2,
};

const BLOCKCHAIN_RPC_FALLBACKS: Record<string, string> = {
  [BLOCKCHAIN_IDS.NEUROWEB_TESTNET]: 'https://lofar-testnet.origin-trail.network',
  [BLOCKCHAIN_IDS.NEUROWEB_MAINNET]: 'https://astrosat-parachain-rpc.origin-trail.network',
  [BLOCKCHAIN_IDS.BASE_TESTNET]: 'https://sepolia.base.org',
  [BLOCKCHAIN_IDS.BASE_MAINNET]: 'https://mainnet.base.org',
  [BLOCKCHAIN_IDS.GNOSIS_TESTNET]: 'https://rpc.chiadochain.net',
  [BLOCKCHAIN_IDS.GNOSIS_MAINNET]: 'https://rpc.gnosischain.com/',
};

const normalizeBlockchain = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed.length) return undefined;
  const alias = BLOCKCHAIN_ALIASES[trimmed.toLowerCase()];
  return alias ?? trimmed;
};

const normalizeKey = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

const readFile = (): GWALNConfig => {
  if (!fs.existsSync(CONFIG_PATH)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(raw) as GWALNConfig;
  } catch {
    return {};
  }
};

export const readConfig = (): GWALNConfig => readFile();

export const writeConfig = (update: Partial<GWALNConfig>): GWALNConfig => {
  const current = readFile();
  const next: GWALNConfig = {
    ...current,
    ...update,
  };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf8');
  return next;
};

export interface PublishConfigOverrides {
  endpoint?: string;
  graphId?: string;
  environment?: string;
  port?: number;
  blockchain?: string;
  publicKey?: string;
  privateKey?: string;
  rpcUrl?: string;
  epochsNum?: number;
  maxRetries?: number;
  frequencySeconds?: number;
  dryRun?: boolean;
}

export const resolvePublishConfig = (
  overrides: PublishConfigOverrides = {},
): Required<Pick<PublishConfigOverrides, 'endpoint'>> & {
  graphId?: string;
  environment: string;
  port: number;
  blockchain: string;
  privateKey: string;
  publicKey: string;
  rpcUrl?: string;
  epochsNum: number;
  maxRetries: number;
  frequencySeconds: number;
  dryRun: boolean;
} => {
  const cfg = readFile();
  const endpoint = cleanUrl(overrides.endpoint) ?? cleanUrl(cfg.dkgEdgeNodeUrl);

  if (!endpoint) {
    throw new Error("No DKG endpoint configured. Run 'gwaln init' or pass --endpoint explicitly.");
  }

  const environment = (
    overrides.environment ??
    cfg.dkgEnvironment ??
    FALLBACK_ENVIRONMENT
  ).toLowerCase();
  const port = overrides.port ?? cfg.dkgNodePort ?? FALLBACK_PORT;
  const blockchain =
    normalizeBlockchain(overrides.blockchain ?? cfg.dkgBlockchainId) ?? FALLBACK_BLOCKCHAIN;
  const privateKey =
    normalizeKey(overrides.privateKey ?? cfg.dkgPrivateKey) ?? FALLBACK_PRIVATE_KEY;
  const publicKey = normalizeKey(overrides.publicKey ?? cfg.dkgPublicKey) ?? FALLBACK_PUBLIC_KEY;
  const rpcUrl =
    cleanUrl(overrides.rpcUrl ?? cfg.dkgRpcUrl) ?? BLOCKCHAIN_RPC_FALLBACKS[blockchain];
  const epochsNum = overrides.epochsNum ?? cfg.publishEpochs ?? FALLBACK_EPOCHS;
  const maxRetries = overrides.maxRetries ?? cfg.publishMaxRetries ?? FALLBACK_PUBLISH_MAX_RETRIES;
  const frequencySeconds =
    overrides.frequencySeconds ??
    cfg.publishPollFrequencySeconds ??
    FALLBACK_PUBLISH_POLL_FREQUENCY;

  if (!privateKey) {
    throw new Error('No private key configured. Provide --private-key or update .gwalnrc.json.');
  }

  return {
    endpoint,
    graphId: overrides.graphId ?? cfg.dkgGraphId ?? undefined,
    environment,
    port,
    blockchain,
    privateKey,
    publicKey,
    rpcUrl,
    epochsNum,
    maxRetries,
    frequencySeconds,
    dryRun: overrides.dryRun ?? cfg.publishDryRun ?? false,
  };
};
