/**
 * @file src/types/dkg-js.d.ts
 * @description Minimal ambient declarations so TypeScript accepts the external dkg.js SDK imports.
 * @author Doğu Abaris <abaris@null.net>
 */

declare module 'dkg.js' {
  const DkgClient: new (config: Record<string, unknown>) => {
    asset: {
      create: (
        content: Record<string, unknown>,
        options?: Record<string, unknown>,
      ) => Promise<Record<string, unknown>>;
    };
  };
  export default DkgClient;
}

declare module 'dkg.js/constants' {
  export const BLOCKCHAIN_IDS: Record<string, string>;
}
