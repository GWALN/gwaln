/**
 * @file src/tools/publish.ts
 * @description MCP tool for publishing arbitrary JSON-LD.
 */

import { z } from 'zod';
import { loadJsonLdFromFile, publishJsonLdAsset } from '../workflows/publish-workflow';
import { textContent } from './utils';

export const PublishInputSchema = z
  .object({
    filePath: z.string().optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
    privacy: z.enum(['public', 'private']).optional(),
    endpoint: z.string().optional(),
    environment: z.string().optional(),
    port: z.number().optional(),
    blockchain: z.string().optional(),
    privateKey: z.string().optional(),
    publicKey: z.string().optional(),
    rpcUrl: z.string().optional(),
    epochsNum: z.number().optional(),
    maxRetries: z.number().optional(),
    frequencySeconds: z.number().optional(),
    dryRun: z.boolean().optional(),
  })
  .refine((value) => Boolean(value.filePath || value.payload), {
    message: 'Provide either filePath or payload.',
    path: ['filePath'],
  });

export const publishTool = {
  title: 'Publish JSON-LD Knowledge Assets to Decentralized Knowledge Graph (DKG)',
  description:
    'Publishes any valid JSON-LD Knowledge Asset to the DKG (Decentralized Knowledge Graph) using the DKG SDK. Accepts JSON-LD payloads either inline or from a file path. Supports public and private asset publishing. Returns a UAL (Universal Asset Locator) that uniquely identifies the published asset on the blockchain, along with dataset root information. Supports dry-run mode to validate payloads without publishing. Use this to publish custom structured knowledge assets to the decentralized network.',
  inputSchema: PublishInputSchema,
};

export const publishHandler = async (input: z.infer<typeof PublishInputSchema>) => {
  const payload =
    input.payload ??
    loadJsonLdFromFile(
      input.filePath ??
        (() => {
          throw new Error('filePath is required when inline payload is not provided.');
        })(),
    );
  const result = await publishJsonLdAsset({
    ...input,
    payload,
    privacy: input.privacy ?? 'private',
  });
  if (result.dryRun) {
    return {
      content: textContent('[publish] Dry-run complete. Payload echoed in structured content.'),
      structuredContent: { dryRun: true, payload: result.payload },
    };
  }
  return {
    content: textContent(
      `[publish] Knowledge Asset published. ${result.ual ? `UAL: ${result.ual}` : 'UAL missing.'}`,
    ),
    structuredContent: {
      dryRun: false,
      ual: result.ual,
      datasetRoot: result.datasetRoot ?? null,
    },
  };
};
