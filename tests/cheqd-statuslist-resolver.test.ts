/**
 * Fail-closed matrix for CheqdDlrStatusListResolver.
 *
 * Everything unprovable must THROW (the verifier maps a throw to a
 * status_unresolvable DENY); only a verified, well-formed, issuer-pinned,
 * signature-valid list may answer, and then strictly by its bit.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { base58Encode, type CredentialStatus, type StatusList2021Credential } from '@kya-os/mcp';
import {
  CheqdDlrStatusListResolver,
  extractEd25519PublicKeyBase64,
} from '../src/cheqd-statuslist-resolver.js';
import {
  buildInitialStatusListCredential,
  resignWithBit,
} from '../src/statuslist-ops.js';
import {
  cryptoProvider,
  gzipCompressor,
  gzipDecompressor,
  makeVcSigningFunction,
  type IssuerIdentity,
} from '../src/lib/wiring.js';

const DID = 'did:cheqd:testnet:11111111-2222-3333-4444-555555555555';
const KID = `${DID}#key-1`;
const URL = `https://resolver.cheqd.net/1.0/identifiers/${DID}?resourceName=kya-statuslist-demo&resourceType=StatusListCredential`;
const INDEX = 94;

let identity: IssuerIdentity;
let publicKeyBase64: string;
let listClear: StatusList2021Credential;
let listRevoked: StatusList2021Credential;

function status(overrides: Partial<CredentialStatus> = {}): CredentialStatus {
  return {
    id: `${URL}#${INDEX}`,
    type: 'StatusList2021Entry',
    statusPurpose: 'revocation',
    statusListIndex: String(INDEX),
    statusListCredential: URL,
    ...overrides,
  };
}

function didDocFor(did: string, pubB64: string) {
  const multibase = 'z' + base58Encode(
    new Uint8Array(Buffer.concat([Buffer.from([0xed, 0x01]), Buffer.from(pubB64, 'base64')])),
  );
  return {
    id: did,
    verificationMethod: [
      { id: `${did}#key-1`, type: 'Ed25519VerificationKey2020', controller: did, publicKeyMultibase: multibase },
    ],
  };
}

function makeResolver(options: {
  body?: unknown;
  httpStatus?: number;
  reject?: boolean;
  expectedIssuerDid?: string;
  cacheTtlMs?: number;
  fetchLog?: Array<{ url: string; headers: Record<string, string> }>;
}) {
  return new CheqdDlrStatusListResolver({
    fetchProvider: {
      fetch: async (url: string, init?: Record<string, unknown>) => {
        options.fetchLog?.push({ url, headers: (init?.['headers'] ?? {}) as Record<string, string> });
        if (options.reject) throw new Error('network down');
        return {
          ok: (options.httpStatus ?? 200) < 400,
          status: options.httpStatus ?? 200,
          json: async () => options.body,
        };
      },
    },
    didResolver: { resolve: async () => didDocFor(DID, publicKeyBase64) },
    cryptoProvider,
    expectedIssuerDid: options.expectedIssuerDid ?? DID,
    compressor: gzipCompressor,
    decompressor: gzipDecompressor,
    cacheTtlMs: options.cacheTtlMs ?? 0,
  });
}

beforeAll(async () => {
  const keyPair = await cryptoProvider.generateKeyPair();
  publicKeyBase64 = keyPair.publicKey;
  identity = { did: DID, kid: KID, privateKeyBase64: keyPair.privateKey };
  const signingFunction = makeVcSigningFunction(keyPair.privateKey);

  listClear = await buildInitialStatusListCredential({ identity, signingFunction, url: URL });
  listRevoked = await resignWithBit({
    credential: listClear, index: INDEX, revoked: true, identity, signingFunction,
  });
});

describe('CheqdDlrStatusListResolver — verdicts', () => {
  it('returns false (authorized) when the bit is clear', async () => {
    await expect(makeResolver({ body: listClear }).checkStatus(status())).resolves.toBe(false);
  });

  it('returns true (revoked) when the bit is set', async () => {
    await expect(makeResolver({ body: listRevoked }).checkStatus(status())).resolves.toBe(true);
  });

  it('other indices remain unaffected by a single revocation', async () => {
    await expect(
      makeResolver({ body: listRevoked }).checkStatus(status({ statusListIndex: '95', id: `${URL}#95` })),
    ).resolves.toBe(false);
  });
});

describe('CheqdDlrStatusListResolver — fail closed', () => {
  it('rejects on network error', async () => {
    await expect(makeResolver({ reject: true }).checkStatus(status())).rejects.toThrow('network down');
  });

  it('rejects on HTTP error', async () => {
    await expect(makeResolver({ body: listClear, httpStatus: 502 }).checkStatus(status()))
      .rejects.toThrow('HTTP 502');
  });

  it('rejects a malformed list (missing encodedList)', async () => {
    const malformed = structuredClone(listClear) as Record<string, unknown>;
    delete (malformed['credentialSubject'] as Record<string, unknown>)['encodedList'];
    await expect(makeResolver({ body: malformed }).checkStatus(status()))
      .rejects.toThrow('malformed');
  });

  it('rejects an unsigned list', async () => {
    const unsigned = structuredClone(listClear) as Record<string, unknown>;
    delete unsigned['proof'];
    await expect(makeResolver({ body: unsigned }).checkStatus(status()))
      .rejects.toThrow('unsigned');
  });

  it('rejects a list from the wrong issuer', async () => {
    await expect(
      makeResolver({ body: listClear, expectedIssuerDid: 'did:cheqd:testnet:evil' }).checkStatus(status()),
    ).rejects.toThrow('not the expected issuer');
  });

  it('rejects a TAMPERED list (bit flipped without re-signing)', async () => {
    const tampered = structuredClone(listClear);
    tampered.credentialSubject.encodedList = listRevoked.credentialSubject.encodedList;
    await expect(makeResolver({ body: tampered }).checkStatus(status()))
      .rejects.toThrow('signature verification FAILED');
  });

  it('rejects a status purpose mismatch', async () => {
    await expect(
      makeResolver({ body: listClear }).checkStatus(status({ statusPurpose: 'suspension' })),
    ).rejects.toThrow('purpose mismatch');
  });

  it('rejects non-canonical / malformed indices', async () => {
    for (const bad of ['abc', '-1', '0x2A', '1e3', '42abc', ' 94', '']) {
      await expect(
        makeResolver({ body: listClear }).checkStatus(status({ statusListIndex: bad })),
      ).rejects.toThrow('canonical non-negative decimal');
    }
  });

  it('rejects an unsafe-integer index', async () => {
    await expect(
      makeResolver({ body: listClear }).checkStatus(status({ statusListIndex: '9007199254740993' })),
    ).rejects.toThrow('safe integer');
  });

  it('rejects an out-of-range index', async () => {
    await expect(
      makeResolver({ body: listClear }).checkStatus(status({ statusListIndex: '99999999' })),
    ).rejects.toThrow('out of range');
  });

  it('rejects a non-https statusListCredential', async () => {
    await expect(
      makeResolver({ body: listClear }).checkStatus(status({ statusListCredential: 'http://x' })),
    ).rejects.toThrow('https');
  });
});

describe('CheqdDlrStatusListResolver — caching', () => {
  it('caches within TTL and re-fetches with no-cache headers after invalidateCache()', async () => {
    const fetchLog: Array<{ url: string; headers: Record<string, string> }> = [];
    const resolver = makeResolver({ body: listClear, cacheTtlMs: 60_000, fetchLog });

    await resolver.checkStatus(status());
    await resolver.checkStatus(status());
    expect(fetchLog).toHaveLength(1);

    resolver.invalidateCache();
    await resolver.checkStatus(status());
    expect(fetchLog).toHaveLength(2);
    // the URL must stay untouched — the cheqd resolver 400s on unknown params
    expect(fetchLog[1]!.url).toBe(URL);
    expect(fetchLog[1]!.headers['Cache-Control']).toBe('no-cache');
  });
});

describe('extractEd25519PublicKeyBase64', () => {
  it('decodes multicodec-prefixed publicKeyMultibase', () => {
    const doc = didDocFor(DID, publicKeyBase64);
    expect(extractEd25519PublicKeyBase64(doc.verificationMethod[0]!)).toBe(publicKeyBase64);
  });

  it('decodes raw publicKeyBase58', () => {
    const raw = Buffer.from(publicKeyBase64, 'base64');
    const b58 = base58Encode(new Uint8Array(raw));
    expect(extractEd25519PublicKeyBase64({ publicKeyBase58: b58 })).toBe(publicKeyBase64);
  });

  it('returns undefined for wrong-length keys', () => {
    expect(extractEd25519PublicKeyBase64({ publicKeyBase58: base58Encode(new Uint8Array(16)) }))
      .toBeUndefined();
  });
});
