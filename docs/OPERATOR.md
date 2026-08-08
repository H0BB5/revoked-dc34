# Operator runbook — everything that needs your hands

Code is done and pushed. This is the human checklist: stage setup, the act, fallbacks, and the submission tasks only you can do.

## Demo topology (three things on screen)

```
┌─────────────────────┐     ┌──────────────────────────┐     ┌──────────────┐
│  Claude Desktop      │     │  Verifier console        │     │  DC34 badge  │
│  (the AGENT — brain) │     │  localhost:4949          │     │  (FIDO2)     │
│  you type here       │     │  the gates light up here │     │  you touch   │
└─────────┬───────────┘     └────────────▲─────────────┘     └──────┬───────┘
          │ MCP (stdio)                   │ SSE (observes)           │ WebAuthn
          ▼                               │                          │
   kya-wallet gateway ── signed wallet_send ──► Protected server ◄───┘ (revoke)
   (holds agent key + VC)                       (verifier + wallet)
```

Left window = Claude Desktop. Right window = the console (verifier's view). The badge is on your chest.

## One-time setup (do the non-badge parts tonight)

### 1. Protected server + console
```bash
cd ~/@kya-os/revoked-dc34
npm run serve            # http://localhost:4949  (leave running)
```

### 2. Claude Desktop as the agent
1. Merge `docs/claude_desktop_config.json` into `~/Library/Application Support/Claude/claude_desktop_config.json` (the `kya-wallet` entry; path is already absolute).
2. **Fully quit and reopen** Claude Desktop.
3. New chat → confirm the `kya-wallet` tools appear (wallet_send, check_balance).
4. Test: type **"Check my wallet balance"**, then **"Pay 1 CHEQ to the vendor."** The right screen should light green and a tx hash should come back in chat.
   - If the tools don't appear: the gateway logs to stderr; run `npm run gateway:probe -- --amount 1` in a terminal to confirm the chain works independent of Claude Desktop, then recheck the config path + restart.
   - Remote-connector alternative (if you prefer HTTP over stdio): `npm run gateway -- --http` (port 4950) and add a custom connector to `http://localhost:4950/mcp`. stdio is the more reliable local path.

### 3. Badge (OPTIONAL — Saturday night, after submission is draft-ready; 3h timebox)
Preconditions first (cut the feature if any fails — badge stays a roadmap slide, demo uses software revoke):
- **P1** Badge enumerates as a FIDO2 key at `https://webauthn.io` (register + authenticate there).
- **P2** Chrome offers the *external* key, not laptop Touch ID (the `allowCredentials` pin usually forces this).
- **P3** Origin serves over a WebAuthn-valid context (localhost is fine over http; a hosted origin needs https + set `WEBAUTHN_RP_ID`/`WEBAUTHN_ORIGIN`).
- **P4** Latest badge firmware.

Then register (one time):
```bash
BADGE_SETUP=1 npm run serve
# open http://localhost:4949/badge-setup.html → "Register this badge" → touch it
```
Then arm it:
```bash
BADGE_WEBAUTHN=1 npm run serve     # revocation now requires the badge
```
On stage the console's Revoke shows the "touch the badge" overlay automatically (it reads `badgeRequired` from `/api/state`).

## The act (target 2:45) — split screen

| Beat | You do | Left (Claude) | Right (console) |
|---|---|---|---|
| 1. Setup | narrate | chat open | AUTHORIZED-ready, credential card, balance |
| 2. Spend | type **"Pay 1 CHEQ to the vendor"** | Claude calls wallet_send, shows tx | 6 gates green, tx + explorer, balance ticks down |
| 3. Cap | type **"Now send 50 CHEQ"** | Claude relays refusal | BLOCKED, amount-cap gate red |
| 4. Kill | press **Revoke** → **touch badge** | — | "touch badge" overlay → Cosmos tx streams → REVOKED |
| 5. Dead | type **"Pay 1 CHEQ again"** | Claude: can't, revoked | revocation gate red, balance unchanged |
| 6. Close | badge line + repo QR | — | — |

Symmetry line (say it, don't do it — issuance is pre-done): *"Authority begins and ends with hardware."*

## Fallbacks (each removes one failure mode)

- **Claude misbehaves / no wifi for the LLM** → drive the same path with the console's simulated-agent buttons (`[1]` send, `[2]` over-cap, `[5]` theft, `[3]` revoke, `[4]` retry). Identical gates/verdicts — the console observes the same server.
- **Badge misbehaves on stage** → `DEMO_BYPASS_WEBAUTHN=1 npm run serve`; Revoke becomes a software confirm (still real on-chain), no ceremony.
- **Venue wifi dies entirely** → the recorded video is a first-class submission format. Record it Saturday regardless.
- **Testnet/registrar hiccup** → you have spare indices to ~120; `npm run publish:statuslist -- --force` re-arms a fresh all-clear list if needed.

## Env flag reference

| Flag | Effect |
|---|---|
| `BADGE_WEBAUTHN=1` | Revocation requires a registered badge assertion |
| `DEMO_BYPASS_WEBAUTHN=1` | Force software revoke even if the above is set (stage safety switch) |
| `BADGE_SETUP=1` | Enable the `/badge-setup.html` registration routes |
| `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN` | For a hosted origin (default localhost) |
| `DEMO_PORT` (4949) / `GATEWAY_PORT` (4950) | Ports |

## Still only-you tasks (not code)

- [ ] **GitLab**: register at gitlab.com/cryptoadvocate, fork, open the MR into `hackathon-submissions`, ping the host. Mirror is `github.com/H0BB5/revoked-dc34`. Do this tonight.
- [ ] **Video** ≤3:00, public/logged-out — shot list in `docs/SUBMISSION.md`. Record Saturday after the first clean run.
- [ ] **Form** by Sat 22:00 — answers ready in `docs/SUBMISSION.md`.
- [ ] Rehearse the split-screen physically (window sizes, fonts readable at 3 m) — twice on con wifi, once on hotspot.

## Pre-flight (Sunday, 09:00)

- [ ] `npm run serve` up; `/api/state` returns; index has a clear bit (or `npm run publish:statuslist -- --force` + reset)
- [ ] Claude Desktop chat pre-opened, tools present, one successful test send done
- [ ] Badge registered + `BADGE_WEBAUTHN=1` (or accept the bypass path), badge on your chest
- [ ] Video queued as the offline fallback; hotspot armed
- [ ] Say the team name. End on the badge.
