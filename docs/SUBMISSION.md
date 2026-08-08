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
| Build description (Aug 6–9) | Moved KYA-OS delegation revocation from an issuer-hosted HTTPS endpoint to a StatusList2021 credential anchored as a cheqd DID-Linked Resource on Cosmos testnet, and demoed it against a REAL agent: Claude Desktop, plugged into a local KYA-OS gateway that holds the agent's key and signs each call — the LLM never touches key material. All new code lives in one repo against the published `@kya-os/mcp@1.12.0` npm package (no forks): an on-chain StatusListResolver (issuer-pinned, signature-verified against the on-chain DID document, fail-closed with a 27-test matrix); DLR publish/revoke tooling (each revocation = a new append-only version); a real MCP server whose `wallet_send` moves CHEQ on testnet under a 10-CHEQ in-credential cap, with holder-of-key binding ENFORCED (the credential is subject-bound, not bearer — a thief replaying a stolen VC is refused before the handler runs); a verifier-view console that observes the server over SSE (so Claude-driven and simulated sends light the same six gates); and badge-gated revocation over WebAuthn — the on-chain kill switch requires a live FIDO2 assertion from the DEF CON 34 badge, bound to the revocation's content hash (a human, physically present, touching inspectable silicon). Measured live: revocation anchored in ~5–9 s, resolver-visible in ~550 ms, next call refused (`CREDENTIAL_REVOKED`) in ~550 ms — funds never move. Rehearsals surfaced two real upstream bugs (a 60 s verifier verdict cache that masked fresh revocations; sessionless holder-binding proofs failing structural validation), both fixed and queued as DIF PRs. |
| Project status | Working demo — full loop live on cheqd testnet (issue → Claude Desktop spends → badge-gated revoke on-chain → refuse), judge-verifiable from a clean clone with zero secrets. |
| Tools / chains / protocols | cheqd testnet (Cosmos SDK) · cheqd DID registrar + universal resolver · DID-Linked Resources · W3C DID + Verifiable Credentials + StatusList2021 · KYA-OS / `@kya-os/mcp` (DIF) · Model Context Protocol (Streamable HTTP) · Claude Desktop (MCP client) · WebAuthn / FIDO2 (DC34 badge) · CosmJS · TypeScript |
| GitLab URL | *(fork + MR into their `hackathon-submissions`; mirror of github.com/H0BB5/revoked-dc34)* |
| Demo video URL | *(record Sat; public link, viewable logged-out, ≤3:00)* |
| Slides URL | *(web/slides.html — served at http://localhost:4949/slides.html by `npm run serve`; export/host or share screen)* |
| Documentation URL | https://github.com/H0BB5/revoked-dc34#readme |

## Video shot list (≤3:00, split screen: Claude Desktop left, verifier console right)

Full act script + fallbacks in [`OPERATOR.md`](OPERATOR.md). Compressed for the video:

1. 0:00–0:25 — "This is Claude, with a wallet tool installed the way thousands install MCP servers. Its owner gave it a signed, revocable credential: spend ≤10 CHEQ, testnet. The LLM never touches the keys." Show both windows.
2. 0:25–1:00 — type **"Pay 1 CHEQ to the vendor."** Left: Claude returns a tx. Right: six gates green, on-chain status check, explorer link, balance ticks down.
3. 1:00–1:25 — type **"Now send 50 CHEQ"** → Claude relays the refusal; right: BLOCKED, amount-cap gate red. "The cap is the credential, not a prompt." (Optional `[5]` theft-replay → holder_binding_failed if time.)
4. 1:25–2:15 — "The day I want it dead." Press **Revoke** → **touch the badge** (overlay + intent hash on screen) → Cosmos tx streams → REVOKED. "Killed by a human touching inspectable silicon."
5. 2:15–2:40 — type **"Pay 1 CHEQ again"** → Claude: can't, `CREDENTIAL_REVOKED`; right: revocation gate red, balance unchanged. "Funds never moved; the issuer can't quietly un-revoke."
6. 2:40–2:55 — "Software agents, hardware humans, on-chain truth. Open source, DIF. We're called Revoked — you just watched why." Repo QR.

Wifi/LLM insurance: the console's simulated-agent buttons (`[1] [2] [5] [3] [4] [R]`) reproduce every beat without Claude Desktop; `DEMO_BYPASS_WEBAUTHN=1` swaps the badge for a software confirm.
