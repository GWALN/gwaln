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
    payload: z.record(z.unknown()).optional(),
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
  title: 'Publish arbitrary JSON-LD',
  description:
    'Publishes any JSON-LD Knowledge Asset via the DKG SDK (same as `civiclens publish`).',
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
