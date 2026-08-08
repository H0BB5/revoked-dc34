#!/usr/bin/env npx tsx
/**
 * Create the issuer's did:cheqd:testnet DID via the cheqd staging registrar
 * (client-managed-secret flow — the Ed25519 key never leaves this machine).
 *
 * Writes CHEQD_DID / CHEQD_KID / CHEQD_PRIVATE_KEY_BASE64 to .env.local.
 * Idempotent: refuses to overwrite an existing identity unless --force.
 */
import { randomUUID } from 'node:crypto';
import { base58Encode } from '@kya-os/mcp';
import {
  cryptoProvider,
  makeFetchProvider,
  makeRegistrar,
} from '../src/lib/wiring.js';
import { createLocalEd25519CheqdRegistrarSigner } from '@kya-os/mcp/cheqd';
import { readEnvLocal, writeEnvLocal } from './lib/env-local.js';

const ED25519_MULTICODEC = Buffer.from([0xed, 0x01]);

async function main() {
  const existing = readEnvLocal();
  if (existing['CHEQD_DID'] && !process.argv.includes('--force')) {
    console.log(`CHEQD_DID already set (${existing['CHEQD_DID']}). Use --force to replace.`);
    return;
  }

  const keyPair = await cryptoProvider.generateKeyPair();
  const publicKeyBytes = Buffer.from(keyPair.publicKey, 'base64');
  const publicKeyMultibase = 'z' + base58Encode(
    new Uint8Array(Buffer.concat([ED25519_MULTICODEC, publicKeyBytes])),
  );

  const did = `did:cheqd:testnet:${randomUUID()}`;
  const kid = `${did}#key-1`;

  const didDocument = {
    id: did,
    verificationMethod: [
      {
        id: kid,
        type: 'Ed25519VerificationKey2020',
        controller: did,
        publicKeyMultibase,
      },
    ],
    authentication: [kid],
    assertionMethod: [kid],
  };

  const fetchProvider = makeFetchProvider();
  const registrar = makeRegistrar(fetchProvider);
  const signer = createLocalEd25519CheqdRegistrarSigner({
    cryptoProvider,
    privateKey: keyPair.privateKey,
    verificationMethodId: kid,
    signatureEncoding: 'base64url',
  });

  console.log(`Creating ${did} via staging registrar…`);
  const result = await registrar.createDid({
    didDocument,
    signer,
    verificationMethodId: kid,
    options: { network: 'testnet' },
  });

  if (!result.success) {
    console.error(`Create failed at stage "${result.stage}": ${result.reason ?? 'unknown'}`);
    console.error(JSON.stringify(result.response ?? {}, null, 2).slice(0, 3000));
    process.exit(1);
  }

  console.log('Registrar reports finished. Confirming resolution…');
  const resolved = await fetchProvider.resolveDID(did);
  if (!resolved) {
    console.error('DID created but did not resolve yet — retry resolution in a few seconds.');
  } else {
    console.log(`Resolved ${did} ✓`);
  }

  writeEnvLocal(
    {
      CHEQD_DID: did,
      CHEQD_KID: kid,
      CHEQD_PRIVATE_KEY_BASE64: keyPair.privateKey,
      CHEQD_PUBLIC_KEY_BASE64: keyPair.publicKey,
    },
    { overwrite: process.argv.includes('--force') },
  );
  console.log('Identity written to .env.local (0600).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
