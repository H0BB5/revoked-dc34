# Final Submission Form — ready-to-paste answers

Form: https://docs.google.com/forms/d/e/1FAIpQLScxpTjg4JKjx1FBoV0PrVSCtC6_ov1VS8mhbXja6IrEUpft4w/viewform
Submit by **Sat Aug 8, 22:00 PDT** (deadline is midnight; don't flirt with it).

> The form has **no live-app / hosted-URL field** — only GitLab, video, slides,
> docs (all optional), and in-person-vs-video. So we do NOT deploy; the demo
> runs locally and the video is the insurance.

Fields in form order:

| # | Field (required?) | Answer |
|---|---|---|
| 1 | Team Name *(req)* | **Revoked** |
| 2 | Members + primary contact name, email, phone *(req)* | Dylan Hobbs (solo) · dylan.hobbs@vouched.id · **‹your phone›** |
| 3 | Project Name *(req)* | **REVOKED — an on-chain kill switch for AI agents with wallet access** |
| 4 | One-sentence summary *(req, short)* | A hardware-triggered, on-chain kill switch for AI agents with wallet access: agents spend under signed, scoped, revocable credentials, and a human touching the DEF CON badge revokes that authority on Cosmos — stopping a rogue agent before it drains a wallet. |
| 5 | Category *(req, choose one)* | **Security** — *(or "Wallet Tooling" to lean into the village's wallet-safety center of gravity; both defensible. Security is the honest core.)* |
| 6 | Problem + who it's for *(req)* | AI agents are getting keys and spending authority. There's no standard way to scope that authority cryptographically, and revocation — the thing that stops a hijacked agent mid-drain — lives on servers the issuer controls and can quietly rewrite. The next wallet-drainer won't be a phishing link; it'll be someone's agent. For: wallet builders, agent-platform / MCP developers, and custodians who need provable, non-repudiable revocation of agent authority. |
| 7 | What you built Aug 6–9 *(req)* | *(paste the build description below)* |
| 8 | Project status *(req, choose one)* | **Demo ready** |
| 9 | Tools/chains/protocols *(req, multi-select)* | **GitLab** + **Other** — in Other, type: *cheqd testnet (Cosmos), DID-Linked Resources, W3C DID/VC/StatusList2021, Model Context Protocol, Claude Desktop, WebAuthn/FIDO2 (DC34 badge), CosmJS, KYA-OS/@kya-os/mcp (DIF), TypeScript* |
| 10 | GitLab Repository URL *(opt)* | *(the fork/mirror URL — mirror of github.com/H0BB5/revoked-dc34)* |
| 11 | Demo Video URL *(opt)* | *(public, logged-out, ≤3:00 — record Sat)* |
| 12 | Presentation Slides URL *(opt)* | *(optional; skip, or export web/slides.html to Google Slides. You're presenting in person, so screen-share it instead.)* |
| 13 | Documentation URL *(opt)* | https://github.com/H0BB5/revoked-dc34#readme *(or the GitLab README)* |
| 14 | Sunday presentation mode *(req)* | **In person** *(still upload the video in #11 as wifi insurance)* |
| 15 | If video: shareable link + checkboxes *(conditional)* | n/a if In person; otherwise the #11 link |

## Field 7 — build description (paste verbatim)

Moved KYA-OS delegation revocation from an issuer-hosted HTTPS endpoint to a StatusList2021 credential anchored as a cheqd DID-Linked Resource on Cosmos testnet, and demoed it against a REAL agent: Claude Desktop, plugged into a local KYA-OS gateway that holds the agent's key and signs each call — the LLM never touches key material. All new code is in one repo against the published @kya-os/mcp@1.12.0 npm package (no forks): an on-chain StatusListResolver (issuer-pinned, signature-verified against the on-chain DID document, fail-closed, 27-test matrix); DLR publish/revoke tooling (each revocation = a new append-only version); a real MCP server whose wallet_send moves CHEQ on testnet under a 10-CHEQ in-credential cap, with holder-of-key binding ENFORCED (the credential is subject-bound, not bearer — a thief replaying a stolen VC is refused before the handler runs); a verifier-view console observing the server over SSE (Claude-driven and simulated sends light the same six gates); and badge-gated revocation over WebAuthn — the on-chain kill switch requires a live FIDO2 assertion from the DEF CON 34 badge, bound to the revocation's content hash (a human, physically present, touching inspectable silicon). Measured live on testnet: revocation anchored in ~5–9s, resolver-visible in ~550ms, next call refused (CREDENTIAL_REVOKED) in ~550ms — funds never move. Rehearsals surfaced two real upstream bugs (a 60s verifier verdict cache that masked fresh revocations; sessionless holder-binding proofs failing structural validation), both fixed and queued as DIF PRs.

## Video shot list (≤3:00, split screen: Claude Desktop left, verifier console right)

Full act script + fallbacks in [`OPERATOR.md`](OPERATOR.md). Compressed for the video:

1. 0:00–0:25 — "This is Claude, with a wallet tool installed the way thousands install MCP servers. Its owner gave it a signed, revocable credential: spend ≤10 CHEQ, testnet. The LLM never touches the keys." Show both windows.
2. 0:25–1:00 — type **"Pay 1 CHEQ to the vendor."** Left: Claude returns a tx. Right: six gates green, on-chain status check, explorer link, balance ticks down.
3. 1:00–1:25 — type **"Now send 50 CHEQ"** → Claude relays the refusal; right: BLOCKED, amount-cap gate red. "The cap is the credential, not a prompt." (Optional `[5]` theft-replay → holder_binding_failed if time.)
4. 1:25–2:15 — "The day I want it dead." Press **Revoke** → **touch the badge** (overlay + intent hash on screen) → Cosmos tx streams → REVOKED. "Killed by a human touching inspectable silicon."
5. 2:15–2:40 — type **"Pay 1 CHEQ again"** → Claude: can't, `CREDENTIAL_REVOKED`; right: revocation gate red, balance unchanged. "Funds never moved; the issuer can't quietly un-revoke."
6. 2:40–2:55 — "Software agents, hardware humans, on-chain truth. Open source, DIF. We're called Revoked — you just watched why." Repo QR.

Wifi/LLM insurance: the console's simulated-agent buttons (`[1] [2] [5] [3] [4] [R]`) reproduce every beat without Claude Desktop; `DEMO_BYPASS_WEBAUTHN=1` swaps the badge for a software confirm.
