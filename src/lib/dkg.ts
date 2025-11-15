/**
 * @file src/lib/dkg.ts
 * @description Thin wrapper around dkg.js for publishing Knowledge Assets directly via the SDK.
 *              Keeps the API surface similar to the removed MCP helper so commands remain simple.
 * @author Doğu Abaris <abaris@null.net>
 */

import DkgClient from 'dkg.js';
import { BLOCKCHAIN_IDS } from 'dkg.js/constants';

type DkgSdk = new (config: Record<string, unknown>) => {
  asset: {
    create: (
      content: Record<string, unknown>,
      options?: Record<string, unknown>,
    ) => Promise<PublishResult>;
  };
};

export type BlockchainName = (typeof BLOCKCHAIN_IDS)[keyof typeof BLOCKCHAIN_IDS] | string;

export interface DkgConnectionConfig {
  endpoint: string;
  port?: number;
  environment?: string;
  blockchain: {
    name: BlockchainName;
    privateKey: string;
    publicKey?: string;
    rpc?: string;
  };
}

export interface PublishResult {
  UAL?: string;

  [key: string]: unknown;
}

export interface PublishJsonLdOptions extends DkgConnectionConfig {
  privacy: 'public' | 'private';
  epochsNum?: number;
  maxNumberOfRetries?: number;
  frequencySeconds?: number;
}

const sanitizeEndpoint = (value: string): string => value.replace(/\/+$/, '');

const isAssetPayload = (payload: Record<string, unknown>): boolean =>
  typeof payload.public === 'object' || typeof payload.private === 'object';

const wrapPayload = (jsonld: Record<string, unknown>, privacy: 'public' | 'private') => {
  if (isAssetPayload(jsonld)) {
    return jsonld;
  }
  return privacy === 'public' ? { public: jsonld } : { private: jsonld };
};

export const publishJsonLdViaSdk = async (
  jsonld: Record<string, unknown>,
  options: PublishJsonLdOptions,
): Promise<{ ual: string | null; raw: PublishResult }> => {
  if (!jsonld || typeof jsonld !== 'object') {
    throw new Error('DKG publish requires a JSON-LD object payload.');
  }

  if (!options.blockchain?.name) {
    throw new Error('Missing blockchain identifier for DKG publish.');
  }

  if (!options.blockchain?.privateKey) {
    throw new Error('Missing blockchain private key for DKG publish.');
  }

  const client = new (DkgClient as unknown as DkgSdk)({
    endpoint: sanitizeEndpoint(options.endpoint),
    port: options.port ?? 8900,
    environment: options.environment,
    maxNumberOfRetries: options.maxNumberOfRetries,
    frequency: options.frequencySeconds,
    blockchain: {
      name: options.blockchain.name,
      privateKey: options.blockchain.privateKey,
      publicKey: options.blockchain.publicKey,
      rpc: options.blockchain.rpc,
    },
  });

  const payload = wrapPayload(jsonld, options.privacy);
  const response = await client.asset.create(payload, {
    epochsNum: options.epochsNum ?? 6,
    maxNumberOfRetries: options.maxNumberOfRetries,
    frequency: options.frequencySeconds,
  });

  const ual = typeof response.UAL === 'string' ? response.UAL : null;

  return {
    ual,
    raw: response,
  };
};

export { BLOCKCHAIN_IDS };
