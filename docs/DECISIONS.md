# Decisions — deltas from the TDD (docs/SPEC-TDD.md)

Decided Friday evening with the TDD as baseline. The TDD governs unless
overridden here.

## D1 — Standalone repo, not the DIF repo

The build lives in `revoked-dc34`, consuming published `@kya-os/mcp@1.12.0`
from npm. The DIF repo (`@kya-os/mcp`) is governed — CODEOWNERS, DCO,
working-group review — and gets no experimental commits against a hackathon
deadline. Judges clone ONE thing; the GitLab mirror is this repo verbatim.
Verified before deciding: the package is live on npm and both shipped example
dirs import exclusively from the public surface (`@kya-os/mcp`,
`@kya-os/mcp/cheqd`), so nothing internal is needed.

## D2 — WP1 (library artifact-type edit) replaced by a vendored prep

`prepareCheqdDlrResource`'s four-type restriction is input validation on the
publish path, and our publish script is its only caller. So
`src/prepare-statuslist-dlr.ts` vendors the identical canonicalize → hash →
resource-body prep for the `StatusListCredential` type. No fork, no patched
dependency. Upstream plan: PR `StatusListCredential` into
`CHEQD_DLR_ARTIFACT_TYPES` via DIF review next week — named in the submission
as "upstreaming"; governance is part of the story.

## D3 — Demo act ships self-contained in this repo (`web/` + `src/server.ts`)

Judges clone one repo and everything runs; no deploy dependency, hotspot-
friendly. The live guided walkthrough (`kya-os-poc-demo`,
poc.kya-os.ai) LINKS to it — porting the act into the walkthrough is
spare-time stretch, not on the critical path.

## D4 — Resolver design (WP2)

`CheqdDlrStatusListResolver` implements the shipped `StatusListResolver` seam
(`checkStatus` true = revoked; any anomaly throws → verifier denies as
`status_unresolvable`). Trust stays cryptographic: the fetched list's
Ed25519Signature2020 proof is verified against the issuer's DID document
resolved from the chain — issuer-pinned, purpose-parity-checked, strict
index parsing mirrored from `StatusList2021Manager`. Bit reads reuse
`BitstringManager` — no reimplemented crypto anywhere in this repo.

## D5 — Amount cap enforcement

`wrapWithDelegation` enforces scope; it has no per-arg constraint hook. The
spend cap lives in the CREDENTIAL (`constraints.crisp.scopes[].constraints`)
and a thin guard module validates the requested amount against the SAME
credential the gate verified, before the cosmjs send runs. The demo beat
"agent tries to send over cap → refused" reads the cap from the credential,
never from app config.

## D6 — Schedule amendments (risk-shaped)

- GitLab fork + stub MR into `hackathon-submissions` TONIGHT, not Saturday.
- Rough backup video immediately after the first full round trip (~Sat
  12:30); the polished 16:30 take replaces it if it lands.
- Assumption check A runs before any further build (TDD gate, endorsed).

## D7 — Claude Desktop as the live agent, via a gateway (WP-A)

The agent is Claude Desktop, not a bespoke client. A local `kya-wallet`
gateway (`src/gateway.ts`) holds the agent's did:key + VC and signs each
outbound `wallet_send`; Claude sees a clean tool surface with no crypto args.
The LLM never touches key material — itself a talking point. The gateway
exposes BOTH stdio (Claude Desktop's reliable local path) and streamable-http
(the "remote connector tomorrow" story); the TDD specified http, but stdio is
the bulletproof local integration, so we ship both and let the venue choose.
Env/paths anchor to the repo (`REPO_ROOT`), because Claude Desktop spawns the
gateway with an arbitrary cwd.

## D8 — Console is a verifier VIEW over SSE (WP-B)

The protected server broadcasts every `wallet_send` verdict (with a six-gate
`checks` object mapped to the middleware's real gate order) over `/api/events`.
The console renders from that stream, so a send driven by Claude Desktop lights
the same gates as the simulated-agent buttons — one emission point, both paths
identical. The buttons remain as the wifi/LLM-failure fallback.

## D9 — Badge gates revocation, feature-flagged, fail-safe (WP-C)

Badge-gated revocation is OFF by default and force-bypassable
(`DEMO_BYPASS_WEBAUTHN`), so it can never block submission. When on
(`BADGE_WEBAUTHN=1` + a registered credential), `/api/revoke` is two-phase and
the WebAuthn challenge IS `sha256(canonical revocation intent)` — the assertion
is bound to THIS revocation, not a generic login. No valid touch → 403 →
nothing published (fail-safe). We do NOT overclaim: the badge authorizes the
operator action; it does not hold the agent's Ed25519 key or sign the registrar
tx (that's roadmap). Native WebAuthn in the browser keeps the console
dependency-free/offline; `@simplewebauthn/server` handles verification.
The live badge ceremony is the one thing untestable without hardware — the
operator's Saturday P1–P4 + registration step (see OPERATOR.md).

## D10 — Custody boundary is physical: the gateway never loads the funds wallet

Originally the gateway read `AGENT_MNEMONIC` to show the balance in
`check_balance` — so on one laptop it could see the funds secret, making the
"gateway holds only the authority key" claim true for *signing* but not for
*secret access*. Closed it: `check_balance` now reads the balance from the
protected server (`/api/state`), and the gateway no longer imports the wallet
module at all. Proven by the import graph — the gateway → agent.js path has
zero references to `AGENT_MNEMONIC` or `wallet-send-tool`. So the wallet
(funds) lives ONLY on the protected server (the executor that also enforces
revocation — the reason the kill switch works); the gateway holds ONLY the
agent's did:key authority key; Claude holds neither. Logical boundary is now a
physical one, and it survives a judge asking "where does the wallet live?".
