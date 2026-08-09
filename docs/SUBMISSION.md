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

Verbal-bookend flow — the badge appears ONCE, at the kill. Full act script + fallbacks in [`OPERATOR.md`](OPERATOR.md). Turn on presenter mode (`P`) so the simulated-agent buttons are hidden on camera.

1. 0:00–0:30 — **Set the scene:** "Quick version: this is a kill switch for AI agents that can spend money. This is Claude, and I've given it a wallet so it can pay vendors and settle invoices — but not my keys; a signed, revocable permission: up to 10 CHEQ a transfer, testnet, nothing else. If it misbehaves, I revoke that permission — not on our server where we could quietly fudge it, but on **Cosmos**, a public blockchain anyone can check. And revoking takes hardware: the DEF CON badge you're wearing doubles as a security key (lift it). Watch a good day — then when it's compromised." Show both windows.
2. 0:30–0:45 — "First it checks the books." type **"Claude, how much is in my wallet?"** → Claude reads the balance.
3. 0:45–1:10 — "It settles an invoice — 5 CHEQ to the vendor, within policy." type **"Claude, pay 5 CHEQ to the vendor."** Right: six gates green, **AUTHORIZED**, explorer link, balance drops.
4. 1:10–1:35 — "Now it tries 11 — the cap's in the signed credential, not app code." type **"Now pay 11 CHEQ."** → **BLOCKED · SCOPE_CONSTRAINT_VIOLATED** (amber), amount-cap gate red.
5. 1:35–2:20 — **The 3 a.m. scenario:** "It's been prompt-injected — making *individually valid* payments, draining the treasury one legit-looking transfer at a time. No input gate catches that; every request checks out. You need it dead — not a password an attacker can phish, this." Press **Revoke** → **touch the badge** → **REVOKED**, on-chain resource + credId fingerprint on screen.
6. 2:20–2:45 — type **"How much is in the wallet?"** → still reads; then **"Pay 1 CHEQ."** → **DENIED · CREDENTIAL_REVOKED**, balance **unchanged — funds never moved**. "Revocation is surgical: it can still look — the balance is public — but it cannot move a token."
7. 2:45–2:55 — "Granted under hardware, killed by hardware — no silent, keyboard-only override. Software agents, hardware humans, on-chain truth. We're called Revoked." Repo QR.

Wifi/LLM insurance: the console's simulated-agent buttons (`[1]` send · `[2]` over-cap · `[5]` theft · `[3]` revoke · `[4]` retry · `[R]` reset) reproduce every beat without Claude Desktop; `DEMO_BYPASS_WEBAUTHN=1` swaps the badge for a software confirm; `C` toggles high-contrast for a washed-out projector.
