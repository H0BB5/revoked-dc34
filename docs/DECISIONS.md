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
