#!/usr/bin/env npx tsx
/**
 * One-shot verification — the judge artifact.
 *
 * Runs the SHIPPED DelegationCredentialVerifier (nothing mocked) against a
 * delegation credential, with issuer identity AND revocation status both
 * resolved from cheqd testnet. Prints the verdict JSON; exit 0 iff valid.
 *
 * Usage: npm run verify:once [-- --index 94 | --file var/delegation-94.json]
 */
import fs from 'node:fs';
import path from 'node:path';
import type { DelegationCredential } from '@kya-os/mcp';
import { buildOnChainVerifier } from './lib/verifier.js';
import { env, loadIssuerIdentity } from './lib/wiring.js';

async function main() {
  const fileArg = process.argv.indexOf('--file');
  const indexArg = process.argv.indexOf('--index');
  const index = indexArg > -1 ? process.argv[indexArg + 1]! : env('STATUSLIST_INDEX', '94');
  const file = fileArg > -1
    ? process.argv[fileArg + 1]!
    : path.resolve(process.cwd(), 'var', `delegation-${index}.json`);

  if (!fs.existsSync(file)) {
    throw new Error(`No credential at ${file} — run: npm run issue:delegation -- --index ${index}`);
  }
  const vc = JSON.parse(fs.readFileSync(file, 'utf-8')) as DelegationCredential;

  const identity = loadIssuerIdentity();
  const { verifier } = buildOnChainVerifier({ issuerDid: identity.did });

  const started = Date.now();
  const result = await verifier.verifyDelegationCredential(vc, { skipCache: true });
  const elapsedMs = Date.now() - started;

  const verdict = result.valid
    ? 'AUTHORIZED'
    : result.statusOutcome === 'revoked'
      ? 'CREDENTIAL_REVOKED'
      : `DENIED (${result.statusOutcome ?? result.stage})`;

  console.log(JSON.stringify({
    verdict,
    valid: result.valid,
    reason: result.reason,
    statusOutcome: result.statusOutcome,
    checks: result.checks,
    stage: result.stage,
    elapsedMs,
    credential: {
      file,
      issuer: typeof vc.issuer === 'string' ? vc.issuer : vc.issuer.id,
      subject: vc.credentialSubject?.id,
      statusListIndex: vc.credentialStatus?.statusListIndex,
      statusListCredential: vc.credentialStatus?.statusListCredential,
    },
  }, null, 2));

  process.exit(result.valid ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
