/**
 * @file src/mcp/server.ts
 * @description Session-aware MCP server that mirrors the CivicLens CLI workflows.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp';
import express, { type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import pkg from '../../package.json';
import { loadNoteEntry } from '../shared/notes';
import {
  resolveBiasVerifierOptions,
  resolveGeminiSummaryOptions,
  runAnalyzeWorkflow,
} from '../workflows/analyze-workflow';
import { runFetchWorkflow, type FetchSource } from '../workflows/fetch-workflow';
import { buildNoteDraft, publishNoteDraft } from '../workflows/notes-workflow';
import { loadJsonLdFromFile, publishJsonLdAsset } from '../workflows/publish-workflow';
import { loadShowContext, renderAndWriteHtmlReport } from '../workflows/show-workflow';

interface McpSession {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
}

const sessions = new Map<string, McpSession>();
const textContent = (text: string) => [{ type: 'text' as const, text }];

const createToolLogger = (): Pick<Console, 'log' | 'warn' | 'error'> => ({
  log: (...args) => console.log('[MCP]', ...args),
  warn: (...args) => console.warn('[MCP]', ...args),
  error: (...args) => console.error('[MCP]', ...args),
});

const registerWorkflowTools = (
  server: McpServer,
  logger: Pick<Console, 'log' | 'warn' | 'error'>,
): void => {
  const register = server.registerTool.bind(server);

  const FetchInputSchema = z.object({
    source: z.enum(['wiki', 'grok', 'both']).optional(),
    topicId: z.string().optional(),
  });

  register(
    'fetch',
    {
      title: 'Fetch structured snapshots',
      description:
        'Downloads Grokipedia and/or Wikipedia content for a topic (same as `civiclens fetch`).',
      inputSchema: FetchInputSchema,
    },
    async (input: z.infer<typeof FetchInputSchema>) => {
      const { source, topicId } = input;
      const selectedSource = source ?? 'both';
      const sources: FetchSource[] =
        selectedSource === 'both' ? ['wiki', 'grok'] : [selectedSource];
      const payload = [];
      for (const selected of sources) {
        const results = await runFetchWorkflow(selected, topicId);
        payload.push({ source: selected, results });
      }
      return {
        content: textContent(
          `[fetch] Completed fetch for ${sources.join('+')} (topic: ${topicId ?? 'all topics'}).`,
        ),
        structuredContent: { topicId: topicId ?? null, sources: payload },
      };
    },
  );

  const AnalyzeInputSchema = z.object({
    topicId: z.string().optional(),
    force: z.boolean().optional(),
    biasVerifier: z.enum(['gemini']).optional(),
    geminiKey: z.string().optional(),
    geminiModel: z.string().optional(),
    geminiSummary: z.boolean().optional(),
    verifyCitations: z.boolean().optional(),
  });

  register(
    'analyze',
    {
      title: 'Run CivicLens analysis',
      description:
        'Reuses or regenerates Grokipedia vs Wikipedia comparisons (same as `civiclens analyse`).',
      inputSchema: AnalyzeInputSchema,
    },
    async (input: z.infer<typeof AnalyzeInputSchema>) => {
      const verifier = input.biasVerifier
        ? resolveBiasVerifierOptions({
            biasVerifier: input.biasVerifier,
            geminiKey: input.geminiKey,
            geminiModel: input.geminiModel,
          })
        : null;
      const summary =
        input.geminiSummary === true
          ? resolveGeminiSummaryOptions({
              geminiKey: input.geminiKey,
              geminiModel: input.geminiModel,
            })
          : null;
      const results = await runAnalyzeWorkflow({
        topicId: input.topicId,
        force: input.force,
        biasVerifier: verifier,
        summary,
        verifyCitations: input.verifyCitations,
        logger,
      });
      return {
        content: textContent(
          `[analyse] Completed for ${input.topicId ?? 'all topics'} (${results.length} topic(s)).`,
        ),
        structuredContent: { topicId: input.topicId ?? null, results },
      };
    },
  );

  const NotesInputSchema = z.object({
    action: z.enum(['build', 'publish', 'status']),
    topicId: z.string(),
    summary: z.string().optional(),
    accuracy: z.number().min(0).max(5).optional(),
    completeness: z.number().min(0).max(5).optional(),
    toneBias: z.number().min(0).max(5).optional(),
    stakeToken: z.string().optional(),
    stakeAmount: z.number().optional(),
    reviewerName: z.string().optional(),
    reviewerId: z.string().optional(),
    ual: z.string().optional(),
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
  });

  register(
    'notes',
    {
      title: 'Manage Community Notes',
      description:
        'Builds, publishes, or inspects Community Notes derived from analysis (maps to `civiclens notes`).',
      inputSchema: NotesInputSchema,
    },
    async (input: z.infer<typeof NotesInputSchema>) => {
      if (input.action === 'build') {
        const result = buildNoteDraft({
          topicId: input.topicId,
          summary: input.summary,
          accuracy: input.accuracy,
          completeness: input.completeness,
          toneBias: input.toneBias,
          stakeToken: input.stakeToken,
          stakeAmount: input.stakeAmount,
          reviewerName: input.reviewerName,
          reviewerId: input.reviewerId,
        });
        return {
          content: textContent(`[notes] Built draft for ${result.topicId} at ${result.filePath}.`),
          structuredContent: {
            topicId: result.topicId,
            filePath: result.filePath,
            entry: result.entry,
          },
        };
      }

      if (input.action === 'publish') {
        const result = await publishNoteDraft({
          topicId: input.topicId,
          ual: input.ual,
          endpoint: input.endpoint,
          environment: input.environment,
          port: input.port,
          blockchain: input.blockchain,
          privateKey: input.privateKey,
          publicKey: input.publicKey,
          rpcUrl: input.rpcUrl,
          epochsNum: input.epochsNum,
          maxRetries: input.maxRetries,
          frequencySeconds: input.frequencySeconds,
          dryRun: input.dryRun,
        });
        const prefix = result.dryRun ? '[notes] Dry-run' : '[notes] Publish';
        const suffix = result.ual
          ? `UAL: ${result.ual}`
          : result.dryRun
            ? 'payload echoed in structuredContent'
            : 'UAL missing from DKG response';
        return {
          content: textContent(`${prefix} complete for ${result.topicId}. ${suffix}.`),
          structuredContent: {
            topicId: result.topicId,
            entry: result.entry,
            dryRun: result.dryRun,
            ual: result.ual,
            noteFile: result.noteFile,
            logPath: result.logPath ?? null,
          },
        };
      }

      const payload = loadNoteEntry(input.topicId);
      return {
        content: textContent(
          payload.entry
            ? `[notes] Loaded status for ${input.topicId} (${payload.entry.status}).`
            : `[notes] No note draft found for ${input.topicId}.`,
        ),
        structuredContent: {
          topicId: input.topicId,
          entry: payload.entry,
          note: payload.note,
        },
      };
    },
  );

  const PublishInputSchema = z
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

  register(
    'publish',
    {
      title: 'Publish arbitrary JSON-LD',
      description:
        'Publishes any JSON-LD Knowledge Asset via the DKG SDK (same as `civiclens publish`).',
      inputSchema: PublishInputSchema,
    },
    async (input: z.infer<typeof PublishInputSchema>) => {
      const payload =
        input.payload ??
        loadJsonLdFromFile(
          input.filePath ??
            (() => {
              throw new Error('filePath is required when inline payload is not provided.');
            })(),
        );
      const result = await publishJsonLdAsset({
        payload,
        privacy: input.privacy ?? 'private',
        endpoint: input.endpoint,
        environment: input.environment,
        port: input.port,
        blockchain: input.blockchain,
        privateKey: input.privateKey,
        publicKey: input.publicKey,
        rpcUrl: input.rpcUrl,
        epochsNum: input.epochsNum,
        maxRetries: input.maxRetries,
        frequencySeconds: input.frequencySeconds,
        dryRun: input.dryRun,
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
    },
  );

  const ShowInputSchema = z.object({
    topicId: z.string(),
    renderHtml: z.boolean().optional(),
  });

  register(
    'show',
    {
      title: 'Show CivicLens analysis',
      description:
        'Loads structured analysis, note drafts, and optionally renders the HTML report (same as `civiclens show`).',
      inputSchema: ShowInputSchema,
    },
    async (input: z.infer<typeof ShowInputSchema>) => {
      const context = loadShowContext(input.topicId);
      let htmlPath: string | null = null;
      if (input.renderHtml) {
        const { filePath } = renderAndWriteHtmlReport(input.topicId, context);
        htmlPath = filePath;
      }
      return {
        content: textContent(
          `[show] Loaded analysis + notes for ${input.topicId}${htmlPath ? ` (html: ${htmlPath})` : ''}.`,
        ),
        structuredContent: {
          topic: context.topic,
          summary: context.analysis.summary,
          noteEntry: context.noteEntry.entry,
          noteDraft: context.noteEntry.note,
          notesIndexUpdatedAt: context.notesIndex?.updated_at ?? null,
          htmlPath,
        },
      };
    },
  );
};

const PORT = Number(process.env.CIVICLENS_MCP_PORT ?? process.env.PORT ?? 3233);
const HOST = process.env.CIVICLENS_MCP_HOST ?? '127.0.0.1';

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
    name: 'civiclens-mcp',
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

app.post('/mcp', handleMcpRequest);
app.get('/mcp', handleMcpRequest);

app
  .listen(PORT, HOST, () => {
    const url = `http://${HOST}:${PORT}/mcp`;
    console.log(`[mcp] Listening on ${url}`);
    console.log('[mcp] Use this URL in your MCP client configuration.');
  })
  .on('error', (error) => {
    console.error('[mcp] Failed to start server:', error);
    process.exit(1);
  });
