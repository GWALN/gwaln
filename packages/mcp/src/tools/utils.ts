/**
 * @file src/tools/utils.ts
 * @description Shared utilities for MCP tools.
 */

export const textContent = (text: string) => [{ type: 'text' as const, text }];

export const createToolLogger = (): Pick<Console, 'log' | 'warn' | 'error'> => ({
  log: (...args) => console.log('[MCP]', ...args),
  warn: (...args) => console.warn('[MCP]', ...args),
  error: (...args) => console.error('[MCP]', ...args),
});
