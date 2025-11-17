/**
 * @file src/lib/x402.ts
 * @description X402 payment middleware for MCP server using Corbits and Faremeter.
 */

import { evm } from '@faremeter/info';
import { express as faremeter } from '@faremeter/middleware';
import { type NextFunction, type Request, type Response } from 'express';
import { readConfig } from '../shared/config';

export interface X402Config {
  host: string;
  port: number;
  amount?: number;
  asset?: 'USDC';
  network?: 'base';
  facilitatorURL?: string;
  description?: string;
}

export const BYPASS_PAYMENT_METHODS = [
  'initialize',
  'initialized',
  'notifications/initialized',
  'tools/list',
  'prompts/list',
  'resources/list',
] as const;

export const PAYWALLED_TOOLS = ['query', 'publish'] as const;

/**
 * Create MCP x402 payment middleware that only requires payment for specific tools.
 * @returns Express middleware function
 */
export const initializePaymentMiddleware = async (
  config: X402Config,
): Promise<(req: Request, res: Response, next: NextFunction) => void> => {
  const gwalnConfig = readConfig();
  const walletAddress = gwalnConfig.dkgPublicKey;

  if (!walletAddress) {
    throw new Error(
      'No wallet address configured. Set dkgPublicKey in .gwalnrc.json or run "gwaln init".',
    );
  }

  const baseUrl = `http://${config.host}:${config.port}/mcp`;

  const paywalledMiddleware = await faremeter.createMiddleware({
    facilitatorURL: config.facilitatorURL ?? 'https://facilitator.corbits.dev',
    accepts: [
      {
        ...evm.x402Exact({
          network: config.network ?? 'base',
          asset: config.asset ?? 'USDC',
          amount: config.amount ?? 10000, // $0.01 per request
          payTo: walletAddress,
        }),
        resource: baseUrl,
        description: config.description ?? 'GWALN MCP tools',
      },
    ],
  });

  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.body?.method && BYPASS_PAYMENT_METHODS.includes(req.body.method)) {
      next();
      return;
    }

    if (req.body?.method === 'tools/call') {
      const toolName = req.body?.params?.name;
      if (toolName && PAYWALLED_TOOLS.includes(toolName)) {
        paywalledMiddleware!(req, res, next);
        return;
      }
    }

    next();
  };
};
