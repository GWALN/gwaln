/**
 * @file src/lib/x402.ts
 * @description X402 payment middleware for MCP server on NeuroWeb testnet.
 * Implements the x402 payment standard: https://x402.gitbook.io/x402
 */

import { type NextFunction, type Request, type Response } from 'express';
import { readConfig } from '../shared/config';

export interface X402Config {
  host: string;
  port: number;
  amount?: string; // Amount in TRAC tokens (with 18 decimals)
  asset?: string; // Token contract address
  networkId?: string; // Network chain identifier (e.g., otp:20430)
  networkName?: string; // Network display name (e.g., neuroweb-testnet)
  facilitatorURL?: string;
  description?: string;
}

export interface X402PaymentInfo {
  maxAmountRequired: string;
  resource: string;
  description: string;
  payTo: string;
  asset: string;
  network: string;
}

export interface X402PaymentHeader {
  scheme: string;
  amount: string;
  asset: string;
  network: string;
  nonce: string;
  signature: string;
  from: string;
}

export const BYPASS_PAYMENT_METHODS = [
  'initialize',
  'initialized',
  'notifications/initialized',
  'tools/list',
  'prompts/list',
  'resources/list',
] as const;

export const PAYWALLED_TOOLS = ['query', 'publish', 'lookup'] as const;

export const NEUROWEB_TESTNET_ID = 'otp:20430';
export const NEUROWEB_TESTNET_NAME = 'neuroweb-testnet';
export const TRAC_TOKEN_ADDRESS = '0xFfFFFFff00000000000000000000000000000001';
export const TRAC_AMOUNT = '1000000000000000000'; // 1 TRAC with 18 decimals

/**
 * Parse the X-Payment header from the request
 */
function parsePaymentHeader(header: string): X402PaymentHeader | null {
  try {
    // Expected format: scheme amount=<amount> asset=<asset> network=<network> nonce=<nonce> signature=<signature> from=<from>
    const parts = header.split(' ');
    const scheme = parts[0];
    const params: Record<string, string> = {};

    for (let i = 1; i < parts.length; i++) {
      const [key, value] = parts[i].split('=');
      if (key && value) {
        params[key] = value;
      }
    }

    if (
      !params.amount ||
      !params.asset ||
      !params.network ||
      !params.nonce ||
      !params.signature ||
      !params.from
    ) {
      return null;
    }

    return {
      scheme,
      amount: params.amount,
      asset: params.asset,
      network: params.network,
      nonce: params.nonce,
      signature: params.signature,
      from: params.from,
    };
  } catch {
    return null;
  }
}

/**
 * Verify payment with the facilitator
 */
async function verifyPayment(
  paymentHeader: X402PaymentHeader,
  facilitatorURL: string,
  expectedAmount: string,
  expectedAsset: string,
  expectedNetwork: string,
  payTo: string,
): Promise<boolean> {
  try {
    const verifyResponse = await fetch(`${facilitatorURL}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        scheme: paymentHeader.scheme,
        amount: paymentHeader.amount,
        asset: paymentHeader.asset,
        network: paymentHeader.network,
        nonce: paymentHeader.nonce,
        signature: paymentHeader.signature,
        from: paymentHeader.from,
        payTo,
        expectedAmount,
        expectedAsset,
        expectedNetwork,
      }),
    });

    if (!verifyResponse.ok) {
      console.error('Payment verification failed:', await verifyResponse.text());
      return false;
    }

    const verifyResult = await verifyResponse.json();
    return verifyResult.valid === true;
  } catch (error) {
    console.error('Error verifying payment:', error);
    return false;
  }
}

/**
 * Settle payment with the facilitator
 */
async function settlePayment(
  paymentHeader: X402PaymentHeader,
  facilitatorURL: string,
  payTo: string,
): Promise<boolean> {
  try {
    const settleResponse = await fetch(`${facilitatorURL}/settle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        scheme: paymentHeader.scheme,
        amount: paymentHeader.amount,
        asset: paymentHeader.asset,
        network: paymentHeader.network,
        nonce: paymentHeader.nonce,
        signature: paymentHeader.signature,
        from: paymentHeader.from,
        payTo,
      }),
    });

    if (!settleResponse.ok) {
      console.error('Payment settlement failed:', await settleResponse.text());
      return false;
    }

    const settleResult = await settleResponse.json();
    return settleResult.settled === true;
  } catch (error) {
    console.error('Error settling payment:', error);
    return false;
  }
}

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
  const facilitatorURL = config.facilitatorURL ?? 'https://api.cdp.coinbase.com/platform/v2/x402';
  const amount = config.amount ?? TRAC_AMOUNT;
  const asset = config.asset ?? TRAC_TOKEN_ADDRESS;
  const networkId = config.networkId ?? NEUROWEB_TESTNET_ID;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (req.body?.method && BYPASS_PAYMENT_METHODS.includes(req.body.method)) {
      next();
      return;
    }

    let isPaywalled = false;
    let toolDescription = config.description ?? 'GWALN MCP tool access';

    if (req.body?.method === 'tools/call') {
      const toolName = req.body?.params?.name;
      if (toolName && PAYWALLED_TOOLS.includes(toolName)) {
        isPaywalled = true;
        toolDescription = `Access to ${toolName} tool requires payment`;
      }
    }

    if (!isPaywalled) {
      next();
      return;
    }

    const paymentHeaderValue = req.headers['x-payment'] as string | undefined;

    if (!paymentHeaderValue) {
      const paymentInfo: X402PaymentInfo = {
        maxAmountRequired: amount,
        resource: baseUrl,
        description: toolDescription,
        payTo: walletAddress,
        asset,
        network: networkId,
      };

      res.status(402).json(paymentInfo);
      return;
    }

    const paymentHeader = parsePaymentHeader(paymentHeaderValue);
    if (!paymentHeader) {
      res.status(400).json({
        error: 'Invalid payment header format',
      });
      return;
    }

    const isVerified = await verifyPayment(
      paymentHeader,
      facilitatorURL,
      amount,
      asset,
      networkId,
      walletAddress,
    );

    if (!isVerified) {
      res.status(402).json({
        error: 'Payment verification failed',
        paymentInfo: {
          maxAmountRequired: amount,
          resource: baseUrl,
          description: toolDescription,
          payTo: walletAddress,
          asset,
          network: networkId,
        },
      });
      return;
    }

    const isSettled = await settlePayment(paymentHeader, facilitatorURL, walletAddress);

    if (!isSettled) {
      res.status(500).json({
        error: 'Payment settlement failed',
      });
      return;
    }

    next();
  };
};
