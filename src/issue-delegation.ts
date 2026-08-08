#!/usr/bin/env npx tsx
/**
 * Issue the demo agent's DelegationCredential:
 *
 *   issuer  = the Responsible Party's did:cheqd:testnet (on-chain identity)
 *   subject = the agent's did:key (its Ed25519 tool-call signing key)
 *   scope   = payments.transfer, capped at 10 CHEQ on cheqd testnet —
 *             the cap lives IN the credential, not in app code
 *   status  = StatusList2021Entry pointing at the ON-CHAIN list
 *             (version-independent cheqd resolver URL), index 94 by default
 *             — the team-name bit. Spares 95–98 reset the demo.
 *
 * Usage: npm run issue:delegation [-- --index 95]
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  DelegationCredentialIssuer,
  generateDidKeyFromBase64,
  type CredentialStatus,
} from '@kya-os/mcp';
import {
  cryptoProvider,
  env,
  loadIssuerIdentity,
  makeVcSigningFunction,
  statusListUrl,
} from './lib/wiring.js';
import { readEnvLocal, writeEnvLocal } from '../scripts/lib/env-local.js';

export const MAX_AMOUNT_NCHEQ = 10_000_000_000n; // 10 CHEQ — say it out loud in the demo

const VAR_DIR = path.resolve(process.cwd(), 'var');

async function ensureAgentIdentity(): Promise<{ did: string; privateKeyBase64: string }> {
  const existing = readEnvLocal();
  if (existing['AGENT_DID'] && existing['AGENT_ED25519_PRIVATE_KEY_BASE64']) {
    return { did: existing['AGENT_DID'], privateKeyBase64: existing['AGENT_ED25519_PRIVATE_KEY_BASE64'] };
  }
  const keyPair = await cryptoProvider.generateKeyPair();
  const did = generateDidKeyFromBase64(keyPair.publicKey);
  writeEnvLocal({
    AGENT_DID: did,
    AGENT_ED25519_PRIVATE_KEY_BASE64: keyPair.privateKey,
    AGENT_ED25519_PUBLIC_KEY_BASE64: keyPair.publicKey,
  });
  console.log(`Generated agent signing identity: ${did}`);
  return { did, privateKeyBase64: keyPair.privateKey };
}

export async function issueDelegationAt(index: string): Promise<{ file: string; subject: string }> {
  if (!/^[0-9]+$/.test(index)) throw new Error(`index must be a non-negative decimal, got "${index}"`);
  const identity = loadIssuerIdentity();
  const signingFunction = makeVcSigningFunction(identity.privateKeyBase64);
  const issuer = new DelegationCredentialIssuer(
    {
      getDid: () => identity.did,
      getKeyId: () => identity.kid,
      getPrivateKey: () => identity.privateKeyBase64,
    },
    signingFunction,
  );

  const agent = await ensureAgentIdentity();
  const url = statusListUrl(identity.did);

  const credentialStatus: CredentialStatus = {
    id: `${url}#${index}`,
    type: 'StatusList2021Entry',
    statusPurpose: 'revocation',
    statusListIndex: index,
    statusListCredential: url,
  };

  const nowSec = Math.floor(Date.now() / 1000);
  const vc = await issuer.createAndIssueDelegation(
    {
      id: `revoked-dc34-${index}-${Date.now()}`,
      issuerDid: identity.did,
      subjectDid: agent.did,
      constraints: {
        scopes: ['payments.transfer'],
        notBefore: nowSec - 60,
        notAfter: nowSec + 48 * 3600,
        crisp: {
          scopes: [
            {
              resource: 'payments.transfer',
              matcher: 'exact',
              constraints: {
                maxAmountNcheq: MAX_AMOUNT_NCHEQ.toString(),
                denom: 'ncheq',
                network: 'cheqd-testnet',
              },
            },
          ],
        },
      },
      metadata: { tool: 'wallet_send', event: 'defcon-34-crypto-village' },
    },
    { credentialStatus },
  );

  fs.mkdirSync(VAR_DIR, { recursive: true });
  const outPath = path.join(VAR_DIR, `delegation-${index}.json`);
  fs.writeFileSync(outPath, JSON.stringify(vc, null, 2));

  console.log(JSON.stringify({
    file: outPath,
    issuer: identity.did,
    subject: agent.did,
    scope: 'payments.transfer',
    maxAmount: '10 CHEQ (in-credential cap)',
    statusListIndex: index,
    statusListCredential: url,
  }, null, 2));

  return { file: outPath, subject: agent.did };
}

const isMain = process.argv[1]?.endsWith('issue-delegation.ts');
if (isMain) {
  const indexArg = process.argv.indexOf('--index');
  const index = indexArg > -1 ? process.argv[indexArg + 1]! : env('STATUSLIST_INDEX', '94');
  issueDelegationAt(index).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
