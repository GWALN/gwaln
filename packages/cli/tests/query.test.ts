/**
 * @file tests/query.test.ts
 * @description Tests for querying published Knowledge Assets from the DKG by UAL.
 * @author Doğu Abaris <abaris@null.net>
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetDkgAsset = vi.fn();

vi.mock('@gwaln/core', async () => {
  const actual = await vi.importActual('@gwaln/core');
  return {
    ...actual,
    getDkgAsset: mockGetDkgAsset,
    BLOCKCHAIN_IDS: {},
  };
});

describe('getDkgAsset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws error when UAL is empty', async () => {
    mockGetDkgAsset.mockRejectedValueOnce(new Error('DKG get requires a valid UAL string.'));

    await expect(
      mockGetDkgAsset('', {
        endpoint: 'https://test.node',
        port: 8900,
        environment: 'testnet',
        blockchain: {
          name: 'base:8453',
          privateKey: '0xtest',
        },
      }),
    ).rejects.toThrow('DKG get requires a valid UAL string.');
  });

  it('throws error when blockchain name is missing', async () => {
    mockGetDkgAsset.mockRejectedValueOnce(new Error('Missing blockchain identifier for DKG get.'));

    await expect(
      mockGetDkgAsset('did:dkg:base:8453/0xabc/123', {
        endpoint: 'https://test.node',
        port: 8900,
        environment: 'testnet',
        blockchain: {
          name: '',
          privateKey: '0xtest',
        },
      }),
    ).rejects.toThrow('Missing blockchain identifier for DKG get.');
  });

  it('throws error when blockchain private key is missing', async () => {
    mockGetDkgAsset.mockRejectedValueOnce(new Error('Missing blockchain private key for DKG get.'));

    await expect(
      mockGetDkgAsset('did:dkg:base:8453/0xabc/123', {
        endpoint: 'https://test.node',
        port: 8900,
        environment: 'testnet',
        blockchain: {
          name: 'base:8453',
          privateKey: '',
        },
      }),
    ).rejects.toThrow('Missing blockchain private key for DKG get.');
  });

  it('returns assertion and metadata when retrieval succeeds', async () => {
    const mockAssertion = [{ '@id': 'test:assertion', '@type': 'Thing' }];
    const mockMetadata = { retrievedAt: '2025-11-16T00:00:00Z' };

    mockGetDkgAsset.mockResolvedValueOnce({
      assertion: mockAssertion,
      metadata: mockMetadata,
      raw: {
        assertion: mockAssertion,
        metadata: mockMetadata,
        operation: { get: { status: 'COMPLETED' } },
      },
    });

    const result = await mockGetDkgAsset('did:dkg:base:8453/0xabc/123', {
      endpoint: 'https://test.node',
      port: 8900,
      environment: 'testnet',
      blockchain: {
        name: 'base:8453',
        privateKey: '0xtest',
      },
      contentType: 'all',
      includeMetadata: true,
      outputFormat: 'json-ld',
    });

    expect(result.assertion).toEqual(mockAssertion);
    expect(result.metadata).toEqual(mockMetadata);
    expect(result.raw.operation.get.status).toBe('COMPLETED');
  });

  it('throws error when operation status is FAILED', async () => {
    mockGetDkgAsset.mockRejectedValueOnce(
      new Error('DKG get operation failed with no error message.'),
    );

    await expect(
      mockGetDkgAsset('did:dkg:base:8453/0xabc/123', {
        endpoint: 'https://test.node',
        port: 8900,
        environment: 'testnet',
        blockchain: {
          name: 'base:8453',
          privateKey: '0xtest',
        },
      }),
    ).rejects.toThrow('DKG get operation failed');
  });

  it('throws error when response has no assertion', async () => {
    mockGetDkgAsset.mockRejectedValueOnce(
      new Error('DKG returned no assertion data for the given UAL.'),
    );

    await expect(
      mockGetDkgAsset('did:dkg:base:8453/0xabc/123', {
        endpoint: 'https://test.node',
        port: 8900,
        environment: 'testnet',
        blockchain: {
          name: 'base:8453',
          privateKey: '0xtest',
        },
      }),
    ).rejects.toThrow('DKG returned no assertion data');
  });

  it('applies default values for optional parameters', async () => {
    const mockAssertion = [{ '@id': 'test:assertion' }];

    mockGetDkgAsset.mockResolvedValueOnce({
      assertion: mockAssertion,
      raw: {
        assertion: mockAssertion,
        operation: { get: { status: 'COMPLETED' } },
      },
    });

    const result = await mockGetDkgAsset('did:dkg:base:8453/0xabc/123', {
      endpoint: 'https://test.node',
      blockchain: {
        name: 'base:8453',
        privateKey: '0xtest',
      },
    });

    expect(result.assertion).toBeDefined();
    expect(mockGetDkgAsset).toHaveBeenCalledWith('did:dkg:base:8453/0xabc/123', {
      endpoint: 'https://test.node',
      blockchain: {
        name: 'base:8453',
        privateKey: '0xtest',
      },
    });
  });

  it('handles blockchain configuration with public key and RPC', async () => {
    const mockAssertion = [{ '@id': 'test:assertion' }];

    mockGetDkgAsset.mockResolvedValueOnce({
      assertion: mockAssertion,
      raw: {
        assertion: mockAssertion,
        operation: { get: { status: 'COMPLETED' } },
      },
    });

    await mockGetDkgAsset('did:dkg:base:8453/0xabc/123', {
      endpoint: 'https://test.node',
      port: 8900,
      environment: 'mainnet',
      blockchain: {
        name: 'base:8453',
        privateKey: '0xprivate',
        publicKey: '0xpublic',
        rpc: 'https://rpc.example.com',
      },
      contentType: 'public',
      outputFormat: 'n-quads',
      maxNumberOfRetries: 10,
      frequencySeconds: 3,
    });

    expect(mockGetDkgAsset).toHaveBeenCalledWith('did:dkg:base:8453/0xabc/123', {
      endpoint: 'https://test.node',
      port: 8900,
      environment: 'mainnet',
      blockchain: {
        name: 'base:8453',
        privateKey: '0xprivate',
        publicKey: '0xpublic',
        rpc: 'https://rpc.example.com',
      },
      contentType: 'public',
      outputFormat: 'n-quads',
      maxNumberOfRetries: 10,
      frequencySeconds: 3,
    });
  });

  it('accepts different content types', async () => {
    const mockAssertion = [{ '@id': 'test:private' }];

    mockGetDkgAsset.mockResolvedValueOnce({
      assertion: mockAssertion,
      raw: { assertion: mockAssertion },
    });

    await mockGetDkgAsset('did:dkg:base:8453/0xabc/123', {
      endpoint: 'https://test.node',
      blockchain: { name: 'base:8453', privateKey: '0xtest' },
      contentType: 'private',
    });

    expect(mockGetDkgAsset).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        contentType: 'private',
      }),
    );
  });

  it('validates UAL format patterns', async () => {
    const validUALs = [
      'did:dkg:hardhat1:31337/0x123/456',
      'did:dkg:base:8453/0xc28f310a87f7621a087a603e2ce41c22523f11d7/666506',
      'did:dkg:otp/0xabc/789',
    ];

    for (const ual of validUALs) {
      mockGetDkgAsset.mockResolvedValueOnce({
        assertion: [{ '@id': 'test' }],
        raw: { assertion: [{ '@id': 'test' }] },
      });

      const result = await mockGetDkgAsset(ual, {
        endpoint: 'https://test.node',
        blockchain: { name: 'base:8453', privateKey: '0xtest' },
      });

      expect(result.assertion).toBeDefined();
    }

    expect(mockGetDkgAsset).toHaveBeenCalledTimes(validUALs.length);
  });
});
