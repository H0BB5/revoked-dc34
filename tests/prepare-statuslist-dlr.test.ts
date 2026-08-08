/**
 * Vendored StatusListCredential DLR prep — must mirror the library's
 * prepareCheqdDlrResource semantics (canonicalize → sha256 contentHash →
 * base64 data) for the one artifact type the library doesn't ship yet.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { canonicalizeJSON, type StatusList2021Credential } from '@kya-os/mcp';
import { prepareStatusListDlrResource } from '../src/prepare-statuslist-dlr.js';
import { buildInitialStatusListCredential } from '../src/statuslist-ops.js';
import { cryptoProvider, makeVcSigningFunction, type IssuerIdentity } from '../src/lib/wiring.js';

const DID = 'did:cheqd:testnet:99999999-8888-7777-6666-555555555555';
const URL = `https://resolver.cheqd.net/1.0/identifiers/${DID}?resourceName=kya-statuslist-demo&resourceType=StatusListCredential`;

let credential: StatusList2021Credential;

beforeAll(async () => {
  const keyPair = await cryptoProvider.generateKeyPair();
  const identity: IssuerIdentity = { did: DID, kid: `${DID}#key-1`, privateKeyBase64: keyPair.privateKey };
  credential = await buildInitialStatusListCredential({
    identity,
    signingFunction: makeVcSigningFunction(keyPair.privateKey),
    url: URL,
  });
});

describe('prepareStatusListDlrResource', () => {
  it('produces a StatusListCredential resource whose data round-trips to the canonical VC', async () => {
    const prepared = await prepareStatusListDlrResource({
      credential, name: 'kya-statuslist-demo', version: 'v-test-1',
    });

    expect(prepared.resource.type).toBe('StatusListCredential');
    expect(prepared.resource.name).toBe('kya-statuslist-demo');
    expect(prepared.resource.version).toBe('v-test-1');
    expect(prepared.resource.mediaType).toBe('application/json');

    const decoded = Buffer.from(prepared.resource.data, 'base64').toString('utf-8');
    expect(decoded).toBe(prepared.canonicalContent);
    expect(decoded).toBe(canonicalizeJSON(credential));

    const reparsed = JSON.parse(decoded) as StatusList2021Credential;
    expect(reparsed.credentialSubject.encodedList).toBe(credential.credentialSubject.encodedList);
    expect(reparsed.proof).toBeDefined();
  });

  it('contentHash matches the library convention (sha256:<64 hex> over canonical bytes)', async () => {
    const prepared = await prepareStatusListDlrResource({
      credential, name: 'kya-statuslist-demo', version: 'v-test-2',
    });
    expect(prepared.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    const recomputed = await cryptoProvider.hash(new TextEncoder().encode(prepared.canonicalContent));
    expect(prepared.contentHash).toBe(recomputed);
  });

  it('refuses an unsigned credential', async () => {
    const unsigned = structuredClone(credential) as Record<string, unknown>;
    delete unsigned['proof'];
    await expect(prepareStatusListDlrResource({
      credential: unsigned as unknown as StatusList2021Credential,
      name: 'x', version: 'v',
    })).rejects.toThrow('UNSIGNED');
  });

  it('refuses a credential without encodedList', async () => {
    const broken = structuredClone(credential) as unknown as StatusList2021Credential;
    (broken.credentialSubject as Record<string, unknown>)['encodedList'] = '';
    await expect(prepareStatusListDlrResource({
      credential: broken, name: 'x', version: 'v',
    })).rejects.toThrow('encodedList');
  });
});
