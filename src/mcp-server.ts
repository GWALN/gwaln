/**
 * @file src/server.ts
 * @description Session-aware MCP server that mirrors the GWALN CLI workflows.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp';
import express, { type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import pkg from '../package.json';
import { initializePaymentMiddleware, PAYWALLED_TOOLS } from './lib/x402';
import { analyzeHandler, analyzeTool } from './tools/analyze';
import { fetchHandler, fetchTool } from './tools/fetch';
import { lookupHandler, lookupTool } from './tools/lookup';
import { notesHandler, notesTool } from './tools/notes';
import { publishHandler, publishTool } from './tools/publish';
import { queryHandler, queryTool } from './tools/query';
import { showHandler, showTool } from './tools/show';
import { createToolLogger } from './tools/utils';

interface McpSession {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
}

const sessions = new Map<string, McpSession>();

const registerWorkflowTools = (
  server: McpServer,
  logger: Pick<Console, 'log' | 'warn' | 'error'>,
): void => {
  const register = server.registerTool.bind(server);

  register(
    'fetch',
    fetchTool as unknown as Parameters<typeof register>[1],
    async (input: unknown) => await fetchHandler(input as z.infer<typeof fetchTool.inputSchema>),
  );
  register(
    'analyze',
    analyzeTool as unknown as Parameters<typeof register>[1],
    async (input: unknown) =>
      await analyzeHandler(input as z.infer<typeof analyzeTool.inputSchema>, logger),
  );
  register(
    'notes',
    notesTool as unknown as Parameters<typeof register>[1],
    async (input: unknown) => await notesHandler(input as z.infer<typeof notesTool.inputSchema>),
  );
  register(
    'publish',
    publishTool as unknown as Parameters<typeof register>[1],
    async (input: unknown) =>
      await publishHandler(input as z.infer<typeof publishTool.inputSchema>),
  );
  register(
    'query',
    queryTool as unknown as Parameters<typeof register>[1],
    async (input: unknown) => await queryHandler(input as z.infer<typeof queryTool.inputSchema>),
  );
  register(
    'show',
    showTool as unknown as Parameters<typeof register>[1],
    async (input: unknown) => await showHandler(input as z.infer<typeof showTool.inputSchema>),
  );
  register(
    'lookup',
    lookupTool as unknown as Parameters<typeof register>[1],
    async (input: unknown) => await lookupHandler(input as z.infer<typeof lookupTool.inputSchema>),
  );
};

const PORT = Number(process.env.GWALN_MCP_PORT ?? process.env.PORT ?? 3233);
const HOST = process.env.GWALN_MCP_HOST ?? '127.0.0.1';

const createServerSession = async (): Promise<McpSession> => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableDnsRebindingProtection: true,
  });

  transport.onclose = () => {
    if (transport.sessionId) {
      sessions.delete(transport.sessionId);
    }
  };

  const server = new McpServer({
    name: 'gwaln-mcp',
    version: pkg.version,
  });

  registerWorkflowTools(server, createToolLogger());

  await server.connect(transport);
  return { transport, server };
};

const app = express();
app.use((req, res, next) => {
  if (req.method === 'POST') {
    express.json({ limit: '2mb' })(req, res, next);
  } else {
    next();
  }
});

const handleMcpRequest = async (req: Request, res: Response): Promise<void> => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  let session = sessionId ? sessions.get(sessionId) : undefined;

  if (req.method === 'GET') {
    if (!session) {
      if (!res.headersSent) {
        res.status(400).json({
          error: 'Invalid session',
          message: 'No active MCP session. Initialize via POST first.',
        });
      }
      return;
    }
    try {
      await session.transport.handleRequest(req, res, undefined);
      return;
    } catch (error) {
      console.error('[mcp] Error handling GET request:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal MCP error' });
      }
      return;
    }
  }

  if (!session && req.body?.method === 'initialize') {
    try {
      session = await createServerSession();
    } catch (error) {
      console.error('[mcp] Failed to initialize session:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to initialize MCP server session.' });
      }
      return;
    }
  } else if (!session) {
    if (!res.headersSent) {
      res.status(400).json({
        error: 'Invalid session',
        message: 'No active MCP session. Call initialize first.',
      });
    }
    return;
  }

  try {
    await session.transport.handleRequest(req, res, req.body);
    if (session.transport.sessionId && !sessions.has(session.transport.sessionId)) {
      sessions.set(session.transport.sessionId, session);
      console.log('[mcp] Stored session:', session.transport.sessionId);
    }
  } catch (error) {
    console.error('[mcp] Error handling POST request:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal MCP error' });
    }
  }
};

const network = 'base';

initializePaymentMiddleware({
  host: HOST,
  port: PORT,
  amount: 10000, // $0.01 per request
  asset: 'USDC',
  network,
  description: 'GWALN MCP tools',
})
  .then((paymentMiddleware) => {
    app.post('/mcp', paymentMiddleware, handleMcpRequest);
    app.get('/mcp', handleMcpRequest);

    app
      .listen(PORT, HOST, () => {
        const url = `http://${HOST}:${PORT}/mcp`;
        console.log(`[mcp] Listening on ${url}`);
        console.log('[mcp] Use this URL in your MCP client configuration.');
        console.log(
          `[mcp] X402 MCP paywall enabled. Tools that require payment on network ${network}: ${PAYWALLED_TOOLS.join(', ')}.`,
        );
      })
      .on('error', (error) => {
        console.error('[mcp] Failed to start server:', error);
        process.exit(1);
      });
  })
  .catch((error) => {
    console.error('[mcp] Failed to initialize payment middleware:', error);
    process.exit(1);
  });
