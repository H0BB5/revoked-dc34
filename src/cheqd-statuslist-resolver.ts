/**
 * CheqdDlrStatusListResolver — StatusList2021 revocation checks against a
 * cheqd DID-Linked Resource on Cosmos testnet.
 *
 * Implements the `StatusListResolver` seam from @kya-os/mcp (`checkStatus`
 * returns TRUE when the credential's bit is set, i.e. revoked). Plugs into
 * `DelegationCredentialVerifier` / `withKyaOs`'s delegation config unchanged —
 * the verifier already denies fail-closed when this resolver throws
 * (`status_unresolvable`) or returns true (`revoked`).
 *
 * Trust model: the status list's URL is the cheqd resolver's version-
 * independent name/type query, which always serves the LATEST resource
 * version. The chain provides availability + append-only history; the
 * cryptographic root stays the issuer's Ed25519 signature over the VC,
 * verified here against the issuer's DID document — itself resolved from
 * the chain. "The chain said so" is never sufficient on its own.
 *
 * Fail-closed matrix (all throw → verifier denies as status_unresolvable):
 *   network error, non-200, malformed VC, wrong issuer, purpose mismatch,
 *   bad signature, unresolvable issuer DID, out-of-range/malformed index.
 */
import {
  BitstringManager,
  canonicalizeJSON,
  base58Decode,
  type CredentialStatus,
  type StatusList2021Credential,
} from '@kya-os/mcp';

interface FetchLike {
  fetch(url: string, init?: Record<string, unknown>): Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
  }>;
}

interface DidResolverLike {
  resolve(did: string): Promise<{
    verificationMethod?: Array<{
      id: string;
      type: string;
      publicKeyMultibase?: string;
      publicKeyBase58?: string;
    }>;
  } | null>;
}

interface CryptoVerifierLike {
  verify(data: Uint8Array, signature: Uint8Array, publicKeyBase64: string): Promise<boolean>;
}

interface Codec {
  compress(data: Uint8Array): Promise<Uint8Array>;
}
interface Decodec {
  decompress(data: Uint8Array): Promise<Uint8Array>;
}

export interface CheqdDlrStatusListResolverOptions {
  fetchProvider: FetchLike;
  /** Resolves the status list ISSUER's DID document (did:cheqd, on-chain). */
  didResolver: DidResolverLike;
  cryptoProvider: CryptoVerifierLike;
  /** Only status lists issued (and signed) by this DID are trusted. */
  expectedIssuerDid: string;
  compressor: Codec;
  decompressor: Decodec;
  /** In-memory TTL for the fetched list; 0 disables caching. Default 10s. */
  cacheTtlMs?: number;
  /**
   * Query param appended (with a timestamp value) to defeat resolver-side
   * caches right after a revocation. Set to null if the resolver rejects
   * unknown params. Default '_'.
   */
  cacheBustParam?: string | null;
}

const ED25519_MULTICODEC = new Uint8Array([0xed, 0x01]);

export class CheqdDlrStatusListResolver {
  private readonly opts: Required<Pick<CheqdDlrStatusListResolverOptions, 'cacheTtlMs' | 'cacheBustParam'>> &
    CheqdDlrStatusListResolverOptions;
  private cache = new Map<string, { at: number; credential: StatusList2021Credential }>();
  private bustNextFetch = false;

  constructor(options: CheqdDlrStatusListResolverOptions) {
    this.opts = {
      cacheTtlMs: 10_000,
      cacheBustParam: '_',
      ...options,
    };
  }

  /** Drop the cached list and defeat upstream caches on the next fetch. */
  invalidateCache(): void {
    this.cache.clear();
    this.bustNextFetch = true;
  }

  /** TRUE = revoked. Throws on anything unprovable — the verifier fails closed. */
  async checkStatus(status: CredentialStatus): Promise<boolean> {
    const url = status.statusListCredential;
    if (typeof url !== 'string' || !/^https:\/\//.test(url)) {
      throw new Error('credentialStatus.statusListCredential must be an https URL');
    }

    // Strict decimal, fail-closed — mirrors StatusList2021Manager.checkStatus:
    // parseInt would read "0x2A" as 0 and NaN slips past range guards.
    if (!/^[0-9]+$/.test(status.statusListIndex)) {
      throw new Error(`Invalid statusListIndex "${status.statusListIndex}" — must be a canonical non-negative decimal`);
    }
    const index = Number(status.statusListIndex);
    if (!Number.isSafeInteger(index)) {
      throw new Error(`statusListIndex "${status.statusListIndex}" exceeds the safe integer range`);
    }

    const credential = await this.fetchAndVerifyList(url);

    // Purpose parity, fail-closed: a clear bit on the WRONG KIND of list would
    // report "not revoked" from a list that never tracked revocation.
    if (credential.credentialSubject.statusPurpose !== status.statusPurpose) {
      throw new Error(
        `Status purpose mismatch: list is "${credential.credentialSubject.statusPurpose}", ` +
        `credential expects "${status.statusPurpose}"`,
      );
    }

    const bits = await BitstringManager.decode(
      credential.credentialSubject.encodedList,
      this.opts.compressor,
      this.opts.decompressor,
    );
    return bits.getBit(index);
  }

  private async fetchAndVerifyList(url: string): Promise<StatusList2021Credential> {
    const cached = this.cache.get(url);
    if (cached && this.opts.cacheTtlMs > 0 && Date.now() - cached.at < this.opts.cacheTtlMs) {
      return cached.credential;
    }

    let fetchUrl = url;
    if (this.bustNextFetch && this.opts.cacheBustParam) {
      const sep = url.includes('?') ? '&' : '?';
      fetchUrl = `${url}${sep}${this.opts.cacheBustParam}=${Date.now()}`;
    }

    const response = await this.opts.fetchProvider.fetch(fetchUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`Status list fetch failed: HTTP ${response.status} for ${url}`);
    }

    const body = (await response.json()) as StatusList2021Credential;
    this.assertShape(body);
    this.assertIssuer(body);
    await this.assertSignature(body);

    this.bustNextFetch = false;
    this.cache.set(url, { at: Date.now(), credential: body });
    return body;
  }

  private assertShape(vc: StatusList2021Credential): void {
    const types = Array.isArray(vc?.type) ? vc.type : [];
    if (!types.includes('StatusList2021Credential')) {
      throw new Error('Fetched resource is not a StatusList2021Credential');
    }
    const subject = vc.credentialSubject;
    if (subject?.type !== 'StatusList2021' || typeof subject.encodedList !== 'string' || subject.encodedList.length === 0) {
      throw new Error('Status list credentialSubject is malformed (missing StatusList2021 encodedList)');
    }
    if (!vc.proof || typeof vc.proof !== 'object') {
      throw new Error('Status list credential is unsigned');
    }
  }

  private assertIssuer(vc: StatusList2021Credential): void {
    const issuer = typeof vc.issuer === 'string' ? vc.issuer : vc.issuer?.id;
    if (issuer !== this.opts.expectedIssuerDid) {
      throw new Error(
        `Status list issuer "${issuer}" is not the expected issuer "${this.opts.expectedIssuerDid}"`,
      );
    }
  }

  /**
   * Verify the Ed25519Signature2020 proof over the JCS-canonicalized VC (minus
   * proof) against the issuer's on-chain DID document. Chain of trust stays
   * cryptographic — not just "the resolver returned it".
   */
  private async assertSignature(vc: StatusList2021Credential): Promise<void> {
    const proof = vc.proof as Record<string, unknown>;
    const proofValue = proof['proofValue'];
    if (typeof proofValue !== 'string' || proofValue.length === 0) {
      throw new Error('Status list proof is missing proofValue');
    }

    const unsigned: Record<string, unknown> = { ...vc };
    delete unsigned['proof'];
    const data = new TextEncoder().encode(canonicalizeJSON(unsigned));
    const signature = new Uint8Array(Buffer.from(proofValue, 'base64url'));

    const didDoc = await this.opts.didResolver.resolve(this.opts.expectedIssuerDid);
    if (!didDoc) {
      throw new Error(`Could not resolve issuer DID ${this.opts.expectedIssuerDid}`);
    }

    const verificationMethodId = typeof proof['verificationMethod'] === 'string'
      ? proof['verificationMethod']
      : undefined;
    const methods = didDoc.verificationMethod ?? [];
    const candidates = verificationMethodId
      ? methods.filter((m) => m.id === verificationMethodId)
      : methods;
    if (candidates.length === 0) {
      throw new Error(
        `Issuer DID document has no verification method matching "${verificationMethodId ?? '(any)'}"`,
      );
    }

    for (const method of candidates) {
      const publicKeyBase64 = extractEd25519PublicKeyBase64(method);
      if (!publicKeyBase64) continue;
      if (await this.opts.cryptoProvider.verify(data, signature, publicKeyBase64)) {
        return;
      }
    }
    throw new Error('Status list signature verification FAILED against the issuer DID document');
  }
}

/**
 * Extract a raw Ed25519 public key (base64) from a DID verification method.
 * Supports `publicKeyMultibase` (z-base58btc, with or without the 0xed01
 * multicodec prefix) and raw `publicKeyBase58`.
 */
export function extractEd25519PublicKeyBase64(method: {
  publicKeyMultibase?: string;
  publicKeyBase58?: string;
}): string | undefined {
  let raw: Uint8Array | undefined;

  if (method.publicKeyMultibase?.startsWith('z')) {
    const decoded = base58Decode(method.publicKeyMultibase.slice(1));
    raw = decoded.length === 34 &&
      decoded[0] === ED25519_MULTICODEC[0] &&
      decoded[1] === ED25519_MULTICODEC[1]
      ? decoded.slice(2)
      : decoded;
  } else if (method.publicKeyBase58) {
    raw = base58Decode(method.publicKeyBase58);
  }

  if (!raw || raw.length !== 32) return undefined;
  return Buffer.from(raw).toString('base64');
}
