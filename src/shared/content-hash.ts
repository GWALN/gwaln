/**
 * @file src/shared/content-hash.ts
 * @description Shared helpers for hashing paired article content. Keeping this
 *              logic standalone prevents circular dependencies between the
 *              analyzer and cache helpers.
 * @author Doğu Abaris <abaris@null.net>
 */

import crypto from 'node:crypto';
import { ANALYZER_VERSION } from './analyzer-config';

export const computeContentHash = (wikiRaw: string, grokRaw: string): string =>
  crypto
    .createHash('sha256')
    .update(wikiRaw)
    .update(grokRaw)
    .update(ANALYZER_VERSION)
    .digest('hex');
