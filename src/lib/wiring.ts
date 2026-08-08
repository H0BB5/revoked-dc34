/**
 * Shared wiring for the Revoked demo.
 *
 * Everything here composes PUBLIC exports of @kya-os/mcp@1.12.0 — no forks,
 * no patched dependencies. The hackathon delta lives in this repo only.
 */
import { config as loadDotenv } from 'dotenv';
import { gzip, gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import {
  NodeCryptoProvider,
  RuntimeFetchProvider,
  base64urlEncodeFromBytes,
  type VCSigningFunction,
} from '@kya-os/mcp';
import {
  CheqdDidRegistrarClient,
  cheqdResolver,
  createLocalEd25519CheqdRegistrarSigner,
  buildCheqdDlrReference,
} from '@kya-os/mcp/cheqd';

loadDotenv({ path: ['.env.local', '.env'], quiet: true });

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required (set it in .env.local)`);
  return value;
}

export function env(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const REGISTRAR_URL = env('CHEQD_REGISTRAR_URL', 'https://did-registrar-staging.cheqd.net/1.0');
export const RESOLVER_URL = env('CHEQD_RESOLVER_URL', 'https://resolver.cheqd.net');
export const STATUSLIST_NAME = env('STATUSLIST_NAME', 'kya-statuslist-demo');
export const STATUSLIST_RESOURCE_TYPE = 'StatusListCredential';

// ---------------------------------------------------------------------------
// GZIP compressor/decompressor (W3C StatusList2021 encodedList codec)
// ---------------------------------------------------------------------------

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export const gzipCompressor = {
  compress: async (data: Uint8Array): Promise<Uint8Array> =>
    new Uint8Array(await gzipAsync(data)),
};

export const gzipDecompressor = {
  decompress: async (data: Uint8Array): Promise<Uint8Array> =>
    new Uint8Array(await gunzipAsync(data)),
};

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

export const cryptoProvider = new NodeCryptoProvider();

export function makeFetchProvider(): RuntimeFetchProvider {
  return new RuntimeFetchProvider({
    didResolvers: {
      cheqd: cheqdResolver({ resolverUrl: RESOLVER_URL }),
    },
  });
}

// ---------------------------------------------------------------------------
// Issuer identity (the Responsible Party — signs delegations + status lists)
// ---------------------------------------------------------------------------

export interface IssuerIdentity {
  did: string;
  kid: string;
  privateKeyBase64: string;
}

export function loadIssuerIdentity(): IssuerIdentity {
  return {
    did: requiredEnv('CHEQD_DID'),
    kid: requiredEnv('CHEQD_KID'),
    privateKeyBase64: requiredEnv('CHEQD_PRIVATE_KEY_BASE64'),
  };
}

/** Ed25519Signature2020 signing function over the canonicalized VC. */
export function makeVcSigningFunction(privateKeyBase64: string): VCSigningFunction {
  return async (canonicalVC, _issuerDid, kid) => {
    const sig = await cryptoProvider.sign(
      new TextEncoder().encode(canonicalVC),
      privateKeyBase64,
    );
    return {
      type: 'Ed25519Signature2020',
      created: new Date().toISOString(),
      verificationMethod: kid,
      proofPurpose: 'assertionMethod',
      proofValue: base64urlEncodeFromBytes(sig),
    };
  };
}

// ---------------------------------------------------------------------------
// Registrar (client-managed-secret flow against cheqd staging)
// ---------------------------------------------------------------------------

export function makeRegistrar(fetchProvider: RuntimeFetchProvider) {
  return new CheqdDidRegistrarClient({
    registrarUrl: REGISTRAR_URL,
    fetchProvider,
  });
}

export function makeRegistrarSigner(identity: IssuerIdentity) {
  return createLocalEd25519CheqdRegistrarSigner({
    cryptoProvider,
    privateKey: identity.privateKeyBase64,
    verificationMethodId: identity.kid,
    signatureEncoding: 'base64url',
  });
}

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

/**
 * The VERSION-INDEPENDENT resolver URL for the status list (§4.2 of the spec):
 * name/type query form, which the cheqd resolver resolves to the LATEST
 * resource version. Revocation = publish a new version; every verifier holding
 * an old credential automatically reads the new list.
 */
export function statusListUrl(issuerDid: string): string {
  return buildCheqdDlrReference({
    did: issuerDid,
    resolverUrl: RESOLVER_URL,
    resourceName: STATUSLIST_NAME,
    resourceType: STATUSLIST_RESOURCE_TYPE,
  }).url;
}

export function explorerTxUrl(txHash: string): string {
  const template = env('EXPLORER_TX_URL', 'https://testnet-explorer.cheqd.io/transactions/{hash}');
  return template.replace('{hash}', txHash);
}
