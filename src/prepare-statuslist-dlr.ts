/**
 * Vendored DLR preparation for the `StatusListCredential` artifact type.
 *
 * @kya-os/mcp@1.12.0 ships `prepareCheqdDlrResource` with four manifest
 * artifact types; `StatusListCredential` is not yet among them. The type
 * restriction there is input validation on the publish path only, so rather
 * than fork the library mid-hackathon, this module performs the identical
 * canonicalize → hash → resource-body preparation for a StatusList2021 VC.
 *
 * Upstream plan: add `StatusListCredential` to `CHEQD_DLR_ARTIFACT_TYPES` in
 * @kya-os/mcp via a DIF working-group PR; this file then deletes in favor of
 * the shipped `prepareCheqdDlrResource`.
 *
 * Semantics mirrored from src/integrations/cheqd/dlr.ts (v1.12.0):
 *   - content is JCS-canonicalized (json-canonicalize via canonicalizeJSON)
 *   - contentHash = `sha256:<64 hex>` over the canonical bytes
 *   - resource body: { name, type, data: base64(canonical), mediaType, version }
 */
import { canonicalizeJSON, type StatusList2021Credential } from '@kya-os/mcp';
import type { CheqdCreateResourceBody } from '@kya-os/mcp/cheqd';
import { cryptoProvider, STATUSLIST_RESOURCE_TYPE } from './lib/wiring.js';

const SHA256_HASH_REGEX = /^sha256:[a-f0-9]{64}$/;

export interface PreparedStatusListDlr {
  resource: CheqdCreateResourceBody;
  contentHash: string;
  canonicalContent: string;
}

export interface PrepareStatusListDlrOptions {
  /** The SIGNED StatusList2021 VC to anchor on-chain. */
  credential: StatusList2021Credential;
  /** Resource name — stable across versions (the version-independent handle). */
  name: string;
  /** Monotonic version marker for this publication (e.g. an ISO timestamp). */
  version: string;
}

export async function prepareStatusListDlrResource(
  options: PrepareStatusListDlrOptions,
): Promise<PreparedStatusListDlr> {
  const { credential, name, version } = options;

  if (!credential.proof) {
    throw new Error('Refusing to publish an UNSIGNED status list credential');
  }
  if (!credential.credentialSubject?.encodedList) {
    throw new Error('Status list credential is missing credentialSubject.encodedList');
  }

  const canonicalContent = canonicalizeJSON(credential);
  const contentBytes = new TextEncoder().encode(canonicalContent);
  const contentHash = await cryptoProvider.hash(contentBytes);

  if (!SHA256_HASH_REGEX.test(contentHash)) {
    throw new Error('DLR content hash must match sha256:<64 hex chars>');
  }

  return {
    resource: {
      name,
      type: STATUSLIST_RESOURCE_TYPE,
      data: Buffer.from(contentBytes).toString('base64'),
      version,
      mediaType: 'application/json',
    },
    contentHash,
    canonicalContent,
  };
}
