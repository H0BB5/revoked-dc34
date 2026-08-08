/**
 * The full verifier stack, wired for on-chain trust:
 *
 *   - issuer DID documents resolve from cheqd testnet (not our server)
 *   - Ed25519Signature2020 proofs verified over the JCS-canonicalized VC
 *   - revocation read from the on-chain StatusList2021 DLR, fail-closed
 *
 * Shared by verify-once.ts (the judge artifact) and the demo server.
 */
import {
  DelegationCredentialVerifier,
  canonicalizeJSON,
  type DelegationCredential,
} from '@kya-os/mcp';
import { CheqdDlrStatusListResolver, extractEd25519PublicKeyBase64 } from '../cheqd-statuslist-resolver.js';
import {
  cryptoProvider,
  gzipCompressor,
  gzipDecompressor,
  makeFetchProvider,
} from './wiring.js';

export function buildOnChainVerifier(options: { issuerDid: string; cacheTtlMs?: number }) {
  const fetchProvider = makeFetchProvider();
  const didResolver = {
    /**
     * Resolve, then synthesize `publicKeyJwk` (OKP/Ed25519) on any method that
     * only carries publicKeyMultibase/publicKeyBase58: the shipped verifier's
     * method lookup requires a JWK before it will invoke the signature check,
     * and cheqd DID documents publish multibase keys.
     */
    resolve: async (did: string) => {
      const doc = await fetchProvider.resolveDID(did);
      if (!doc?.verificationMethod) return doc;
      return {
        ...doc,
        verificationMethod: doc.verificationMethod.map((method) => {
          if ((method as { publicKeyJwk?: unknown }).publicKeyJwk) return method;
          const publicKeyBase64 = extractEd25519PublicKeyBase64(method);
          if (!publicKeyBase64) return method;
          const x = Buffer.from(publicKeyBase64, 'base64').toString('base64url');
          return { ...method, publicKeyJwk: { kty: 'OKP', crv: 'Ed25519', x } };
        }),
      };
    },
  };

  const statusListResolver = new CheqdDlrStatusListResolver({
    fetchProvider,
    didResolver,
    cryptoProvider,
    expectedIssuerDid: options.issuerDid,
    compressor: gzipCompressor,
    decompressor: gzipDecompressor,
    cacheTtlMs: options.cacheTtlMs ?? 0,
  });

  /**
   * Full Ed25519Signature2020 check, self-contained: resolve the ISSUER's DID
   * document (on-chain for did:cheqd), pick the proof's verification method,
   * verify over the canonicalized VC minus proof.
   */
  const signatureVerifier = async (vc: DelegationCredential, _publicKeyJwk: unknown) => {
    try {
      const proof = vc.proof;
      if (!proof?.proofValue) return { valid: false, reason: 'missing proofValue' };

      const issuerDid = typeof vc.issuer === 'string' ? vc.issuer : vc.issuer.id;
      const didDoc = await didResolver.resolve(issuerDid);
      if (!didDoc) return { valid: false, reason: `could not resolve issuer ${issuerDid}` };

      const unsigned: Record<string, unknown> = { ...vc };
      delete unsigned['proof'];
      const data = new TextEncoder().encode(canonicalizeJSON(unsigned));
      const signature = new Uint8Array(Buffer.from(proof.proofValue, 'base64url'));

      const methods = didDoc.verificationMethod ?? [];
      const candidates = proof.verificationMethod
        ? methods.filter((m) => m.id === proof.verificationMethod)
        : methods;

      for (const method of candidates) {
        const publicKeyBase64 = extractEd25519PublicKeyBase64(method);
        if (!publicKeyBase64) continue;
        if (await cryptoProvider.verify(data, signature, publicKeyBase64)) {
          return { valid: true };
        }
      }
      return { valid: false, reason: 'signature does not verify against the issuer DID document' };
    } catch (err) {
      return { valid: false, reason: `signature check error: ${err instanceof Error ? err.message : String(err)}` };
    }
  };

  const verifier = new DelegationCredentialVerifier({
    didResolver,
    signatureVerifier,
    statusListResolver,
  });

  return { verifier, statusListResolver, fetchProvider };
}
