# Revoked — an on-chain kill switch for AI agents with wallet access

**DEF CON 34 · Cryptocurrency Village Hackathon · solo entry ("Revoked")**

AI agents are getting keys and spending authority. KYA-OS (the DIF reference
implementation for agent identity) already scopes that authority with
DIDs + Ed25519-signed tool calls and W3C Delegation Credentials. This
weekend's build moves the **revocation truth on-chain**: the delegation's
StatusList2021 credential is anchored as a **cheqd DID-Linked Resource on
Cosmos testnet**, so an agent's spending authority can be killed in a way no
server — not even the issuer's — can quietly undo. The agent's very next
`wallet_send` is refused by the shipped verifier: `CREDENTIAL_REVOKED`,
funds never move.

> Status: hackathon in progress (Aug 6–9, 2026). Full submission README lands
> Saturday. Spec: [docs/SPEC-TDD.md](docs/SPEC-TDD.md) · Decisions:
> [docs/DECISIONS.md](docs/DECISIONS.md)

## What's new here vs. what shipped before

Everything in this repo is hackathon-weekend code, written against published
[`@kya-os/mcp@1.12.0`](https://www.npmjs.com/package/@kya-os/mcp) from npm —
no forks, no patched dependencies:

| New (this weekend) | Composes (shipped before Aug 6) |
|---|---|
| `src/cheqd-statuslist-resolver.ts` — on-chain StatusList2021 checks, fail-closed | `StatusListResolver` verifier seam, `DelegationCredentialVerifier` |
| `src/prepare-statuslist-dlr.ts` — vendored `StatusListCredential` DLR prep (upstream PR planned) | `prepareCheqdDlrResource`, cheqd registrar client + resolver |
| `src/statuslist-ops.ts` — build / re-sign / publish-as-new-version / wait-visible | `BitstringManager`, `canonicalizeJSON`, Ed25519 crypto provider |
| Operator scripts + `wallet_send` MCP tool + demo act (in progress) | `withKyaOs` middleware, scope matcher, proof generation |

## Quickstart

```bash
npm install
npm test                  # fail-closed matrix for the resolver + DLR prep

cp .env.example .env.local
npm run gen:accounts      # create agent + fee wallets (fund via testnet faucet)
npm run create:did        # mint the issuer's did:cheqd:testnet via staging registrar
npm run check:a           # WP0 gate: latest-version resolver semantics + latency
npm run check:b           # WP0 gate: cosmjs bank send on cheqd testnet
```

## License

Apache-2.0
