/**
 * @file src/lib/dkg.ts
 * @description Thin wrapper around dkg.js for publishing Knowledge Assets directly via the SDK.
 *              Keeps the API surface similar to the removed MCP helper so commands remain simple.
 * @author Doğu Abaris <abaris@null.net>
 */

import DkgClient from 'dkg.js';
import { BLOCKCHAIN_IDS } from 'dkg.js/constants';

type DkgClientInstance = {
  asset: {
    create: (
      content: Record<string, unknown>,
      options?: Record<string, unknown>,
    ) => Promise<PublishResult>;
    get: (UAL: string, options?: Record<string, unknown>) => Promise<GetResult>;
  };
  graph: {
    query: (
      queryString: string,
      queryType: 'SELECT' | 'CONSTRUCT',
      options?: Record<string, unknown>,
    ) => Promise<unknown>;
  };
};

type DkgSdk = new (config: Record<string, unknown>) => DkgClientInstance;

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

export interface GetResult {
  assertion?: unknown;
  metadata?: unknown;
  operation?: {
    get?: {
      status?: string;
      errorMessage?: string;
    };
  };

  [key: string]: unknown;
}

export interface PublishJsonLdOptions extends DkgConnectionConfig {
  privacy: 'public' | 'private';
  epochsNum?: number;
  maxNumberOfRetries?: number;
  frequencySeconds?: number;
}

export interface GetAssetOptions extends DkgConnectionConfig {
  contentType?: 'public' | 'private' | 'all';
  state?: number;
  includeMetadata?: boolean;
  outputFormat?: 'n-quads' | 'json-ld';
  maxNumberOfRetries?: number;
  frequencySeconds?: number;
}

interface BlockchainConfig {
  name: string;
  privateKey: string;
  publicKey?: string;
  rpc?: string;
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

const buildBlockchainConfig = (blockchain: DkgConnectionConfig['blockchain']): BlockchainConfig => {
  const config: BlockchainConfig = {
    name: blockchain.name,
    privateKey: blockchain.privateKey,
  };

  if (blockchain.publicKey) {
    config.publicKey = blockchain.publicKey;
  }
  if (blockchain.rpc) {
    config.rpc = blockchain.rpc;
  }

  return config;
};

const createDkgClient = (
  options: DkgConnectionConfig & {
    maxNumberOfRetries?: number;
    frequencySeconds?: number;
  },
): DkgClientInstance => {
  const blockchainConfig = buildBlockchainConfig(options.blockchain);

  return new (DkgClient as unknown as DkgSdk)({
    endpoint: sanitizeEndpoint(options.endpoint),
    port: options.port ?? 8900,
    environment: options.environment,
    maxNumberOfRetries: options.maxNumberOfRetries,
    frequency: options.frequencySeconds,
    blockchain: blockchainConfig,
  });
};

const toError = (value: unknown): Error => {
  if (value instanceof Error) {
    return value;
  }
  if (typeof value === 'string') {
    return new Error(value);
  }

  return new Error('Unknown DKG error');
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

  const payload = wrapPayload(jsonld, options.privacy);
  const client = createDkgClient(options);

  console.log(`[dkg] Publishing to ${options.endpoint}:${options.port ?? 8900}`);
  console.log(`[dkg] Blockchain: ${options.blockchain.name}`);
  // console.log(`[dkg] RPC: ${blockchainConfig.rpc || 'SDK default'}`);
  // console.log(`[dkg] Max polling retries: ${options.maxNumberOfRetries}`);
  // console.log(`[dkg] Epochs: ${options.epochsNum ?? 6}`);

  try {
    const response = await client.asset.create(payload, {
      epochsNum: options.epochsNum ?? 6,
      maxNumberOfRetries: options.maxNumberOfRetries,
      frequency: options.frequencySeconds,
    });

    const ual = typeof response.UAL === 'string' ? response.UAL : null;
    // console.log(`[dkg] ✓ Success! Response:`, JSON.stringify(response, null, 2));

    return {
      ual,
      raw: response,
    };
  } catch (error) {
    console.error(`[dkg] ✗ Error details:`, error);
    throw toError(error);
  }
};

export const getDkgAsset = async (
  ual: string,
  options: GetAssetOptions,
): Promise<{ assertion: unknown; metadata?: unknown; raw: GetResult }> => {
  if (!ual) {
    throw new Error('DKG get requires a valid UAL string.');
  }

  if (!options.blockchain?.name) {
    throw new Error('Missing blockchain identifier for DKG get.');
  }

  if (!options.blockchain?.privateKey) {
    throw new Error('Missing blockchain private key for DKG get.');
  }

  const client = createDkgClient(options);

  console.log(`[dkg] Querying UAL: ${ual}`);
  console.log(`[dkg] Endpoint: ${options.endpoint}:${options.port ?? 8900}`);
  console.log(`[dkg] Blockchain: ${options.blockchain.name}`);

  try {
    const response = await client.asset.get(ual, {
      contentType: options.contentType ?? 'all',
      state: options.state,
      includeMetadata: options.includeMetadata ?? false,
      outputFormat: options.outputFormat ?? 'json-ld',
      maxNumberOfRetries: options.maxNumberOfRetries,
      frequency: options.frequencySeconds,
    });

    const operationStatus = response.operation?.get?.status?.toUpperCase();
    if (operationStatus === 'FAILED') {
      throw new Error(
        response.operation?.get?.errorMessage ?? 'DKG get operation failed with no error message.',
      );
    }

    if (!response.assertion) {
      throw new Error('DKG returned no assertion data for the given UAL.');
    }

    return {
      assertion: response.assertion,
      metadata: response.metadata,
      raw: response,
    };
  } catch (error) {
    console.error(`[dkg] ✗ Error details:`, error);
    throw toError(error);
  }
};

export const searchDkgAssetsByTopic = async (
  topicId: string,
  options: DkgConnectionConfig & {
    maxNumberOfRetries?: number;
    frequencySeconds?: number;
  },
): Promise<string | null> => {
  if (!topicId) {
    throw new Error('DKG search requires a valid topic ID.');
  }

  if (!options.blockchain?.name) {
    throw new Error('Missing blockchain identifier for DKG search.');
  }

  if (!options.blockchain?.privateKey) {
    throw new Error('Missing blockchain private key for DKG search.');
  }

  const client = createDkgClient(options);

  console.log(`[dkg] Searching DKG for topic: ${topicId}`);
  console.log(`[dkg] Endpoint: ${options.endpoint}:${options.port ?? 8900}`);

  try {
    const sparqlQuery = `
      PREFIX schema: <https://schema.org/>
      PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
      
      SELECT ?ual ?topicId ?dateCreated
      WHERE {
        ?subject schema:topic_id "${topicId}" .
        ?subject schema:dateCreated ?dateCreated .
        OPTIONAL { ?subject schema:topic_id ?topicId . }
        BIND(str(?subject) AS ?ual)
      }
      ORDER BY DESC(?dateCreated)
      LIMIT 1
    `;

    const result = await client.graph.query(sparqlQuery, 'SELECT', {
      maxNumberOfRetries: options.maxNumberOfRetries,
      frequency: options.frequencySeconds,
    });

    if (result && typeof result === 'object' && 'data' in result) {
      const data = result.data as {
        head?: { vars?: string[] };
        results?: { bindings?: Array<Record<string, { value: string }>> };
      };
      const bindings = data.results?.bindings;

      if (bindings && bindings.length > 0) {
        const ual = bindings[0].ual?.value;
        if (ual) {
          console.log(`[dkg] ✓ Found UAL: ${ual}`);
          return ual;
        }
      }
    }

    console.log(`[dkg] No published asset found for topic '${topicId}' on DKG.`);
    return null;
  } catch (error) {
    console.error(`[dkg] ✗ Search error:`, error);
    throw toError(error);
  }
};

export { BLOCKCHAIN_IDS };
