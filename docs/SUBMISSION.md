# Final Submission Form — ready-to-paste answers

Submit by **Sat Aug 8, 22:00 PDT** (deadline is midnight; do not flirt with it).

| Field | Answer |
|---|---|
| Team name | **Revoked** |
| Members | Dylan Hobbs (solo) |
| Primary contact | dylan.hobbs@vouched.id |
| Project name | **REVOKED — an on-chain kill switch for AI agents with wallet access** |
| One-sentence summary | A kill switch for AI agents with wallet access: agents spend under cryptographically scoped, verifiable delegations (DIDs + Ed25519-signed tool calls), and that spending authority can be revoked on Cosmos — stopping a rogue or hijacked agent before it drains a wallet, with no server anyone has to trust. |
| Category | Security *(check the form's actual nine options at the village desk; nearest fit wins — Sovereignty/Survive if their four domains appear)* |
| Problem statement | AI agents are getting private keys and spending authority. Today there is no standard way to scope that authority cryptographically, and revocation — the thing that stops a hijacked agent mid-drain — lives on servers the issuer controls and can quietly rewrite. The next class of wallet-draining attacks won't be phishing links; it will be delegated agents whose authority nobody can verifiably kill. |
| Target audience | Wallet builders, agent-platform and MCP-server developers, custodians and issuers who need provable, non-repudiable revocation of agent authority. |
| Build description (Aug 6–9) | Moved KYA-OS delegation revocation from an issuer-hosted HTTPS endpoint to a StatusList2021 credential anchored as a cheqd DID-Linked Resource on Cosmos testnet. New this weekend, all in one repo against the published `@kya-os/mcp@1.12.0` npm package (no forks): an on-chain StatusListResolver (issuer-pinned, signature-verified against the on-chain DID document, fail-closed with a 22-test matrix), DLR publish/revoke operator tooling (each revocation = a new append-only resource version), a real MCP server whose `wallet_send` tool moves CHEQ on testnet under a 10-CHEQ in-credential cap, and a self-contained demo console. Measured live: revocation anchored in ~5–9 s, resolver-visible in ~550 ms, next agent call refused (`CREDENTIAL_REVOKED`) in ~550 ms — funds never move. Rehearsal also surfaced a real upstream bug (60 s verifier verdict cache masked fresh revocations), fixed in the demo and queued as a DIF PR. |
| Project status | Working demo — full loop live on cheqd testnet (issue → spend → revoke on-chain → refuse), judge-verifiable from a clean clone with zero secrets. |
| Tools / chains / protocols | cheqd testnet (Cosmos SDK) · cheqd DID registrar + universal resolver · DID-Linked Resources · W3C DID + Verifiable Credentials + StatusList2021 · KYA-OS / `@kya-os/mcp` (DIF) · Model Context Protocol (Streamable HTTP) · CosmJS · TypeScript |
| GitLab URL | *(fork + MR into their `hackathon-submissions`; mirror of github.com/H0BB5/revoked-dc34)* |
| Demo video URL | *(record Sat; public link, viewable logged-out, ≤3:00)* |
| Slides URL | *(docs/slides.html in the repo — export/host or share screen)* |
| Documentation URL | https://github.com/H0BB5/revoked-dc34#readme |

## Video shot list (≤3:00, screen capture of the act page)

1. 0:00–0:20 — page open: wordmark, AUTHORIZED seal, wallet balance, credential card (say the cap and index out loud).
2. 0:20–0:50 — `[1]` send 1 CHEQ → click the explorer link → real tx. Point at the signed receipt panel.
3. 0:50–1:05 — `[2]` 100 CHEQ → refusal; "the cap is in the credential, not the app."
4. 1:05–2:00 — `[3]` revoke → phase log with millisecond gutters → REVOKED slam. Open the status-list URL: the chain serving the new version.
5. 2:00–2:30 — `[4]` retry → `delegation_invalid: Credential revoked via StatusList2021` → FUNDS NEVER MOVED, balance unchanged.
6. 2:30–2:55 — README judge quickstart on screen: `verify:once` on a burned credential, zero secrets → CREDENTIAL_REVOKED. Close on the repo URL.
