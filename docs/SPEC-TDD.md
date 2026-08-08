# TDD: On-Chain Revocation for KYA-OS — DEF CON 34 Cryptocurrency Village Hackathon

**Project name:** KYA-OS — Know Your Agent (solo entry: "Revoked")
**Category:** Security (fallback: Privacy)
**Deadline:** Submissions close **Saturday, Aug 8, 2026, 12:00 midnight PDT**. Presentations Sunday, Aug 9, 10:00 AM — **3 minutes**, in person or video.
**Author:** Dylan · **Status:** Draft for immediate execution · **Time budget:** ~30 working hours remaining

---

## 1. Goal

Move KYA-OS delegation revocation from an issuer-hosted HTTPS endpoint to a **cheqd DID-Linked Resource on Cosmos testnet**, and demo an AI agent's authority being revoked on-chain — with the agent's very next request refused by the shipped verifier.

One sentence for the submission form: *"A kill switch for AI agents with wallet access: agents spend under cryptographically scoped, verifiable delegations (DIDs + Ed25519-signed tool calls), and that spending authority can be revoked on Cosmos — stopping a rogue or hijacked agent before it drains a wallet, with no server anyone has to trust."*

**Framing rule (audience fit):** this Village's center of gravity is wallets and fund protection (see their wallet guides, Stack Wallet review section, and the "wallet safety intelligence" 1st-place archetype). The delegated action in every demo beat is therefore a **wallet spend**, not a vault read. Same architecture, their noun.

### Why this wins on their judging criteria

| Criterion | Our answer |
|---|---|
| Innovation in crypto advocacy | First DIF reference implementation anchoring AI-agent revocation on a Cosmos chain |
| Product clarity & usability | 2-line `withKyaOs()` migration; existing polished guided demo |
| Social / ecosystem impact | Accountability primitive for the AI-agent era; EU AI Act pilot lineage |
| Technical execution | Real testnet writes, fail-closed verifier, live attack theater |
| Demo quality & storytelling | "Watch me kill this agent on-chain" in act 3 |

---

## 2. Scope

### In scope (the hackathon delta — what was built Aug 6–9)

1. **`StatusListCredential` DLR artifact type** — small source addition to `src/integrations/cheqd/dlr.ts`.
2. **`CheqdDlrStatusListResolver`** — a `StatusListResolver` implementation that fetches the *latest* status-list VC version from the cheqd resolver and checks the bit. Plugs into the existing verifier seam; fail-closed semantics preserved.
3. **Operator scripts** — `publish-statuslist.ts` (initial publish) and `revoke.ts` (flip bit → publish new DLR version) under a new `examples/hackathon-dc34/` directory.
4. **`wallet_send` delegated tool** — an MCP tool that performs a real cheqd testnet bank transfer (cosmjs), gated by a `payments.transfer` scoped delegation with an amount cap. This is the action being authorized and revoked.
5. **Demo act** — new final act in the poc walkthrough: agent sends 1 testnet CHEQ (explorer link) → "Revoke on-chain" button → revocation tx (explorer link) → agent attempts second send → `CREDENTIAL_REVOKED`, funds never move.
6. **Submission packaging** — GitLab mirror, 3-minute video (backup + possible primary), form answers.

### Stretch (only if WP1–WP5 land by Sat ~16:00)

7. **Badge flourish** — agent key seed derived from / stored on the DC34 Baochip module (TRNG entropy or token-mode storage). Roadmap slide otherwise; see §8.

### Out of scope (say so in the presentation — honesty is a feature)

- Mainnet writes; fee-payer registrar deployment
- Raw Ed25519 signing from the badge over USB (roadmap; pending Discord/Matrix answer)
- Audit-trail checkpoints on-chain (natural follow-up, mention as roadmap)
- Any change to proof generation, canonicalization, or session code — **frozen**

---

## 3. Current state (verified against `main`, v1.12.0)

What already exists and must NOT be rebuilt:

| Component | Location | Status |
|---|---|---|
| cheqd DID resolver (`cheqdResolver`) | `src/integrations/cheqd/resolver.ts` | ✅ shipped, fail-closed |
| Registrar client: `create`, `update`, `create-resource`, client-managed-secret signing | `src/integrations/cheqd/registrar.ts` | ✅ shipped |
| Local Ed25519 registrar signer | `createLocalEd25519CheqdRegistrarSigner` | ✅ shipped |
| DLR prep/validation (`prepareCheqdDlrResource`, `buildCheqdDlrReference`) | `src/integrations/cheqd/dlr.ts` | ✅ shipped — but artifact types limited to 4 manifest types |
| Operator flow example (resolve → alsoKnownAs linkage → publish 4 DLRs) | `examples/cheqd-dlr/operator-flow.ts` | ✅ shipped, does real testnet writes |
| StatusList2021: bitstring, manager, storage, cascading revocation | `src/delegation/statuslist-manager.ts`, `bitstring.ts`, `cascading-revocation.ts` | ✅ shipped + e2e tests |
| Verifier revocation seam: `StatusListResolver.checkStatus()`, fail-closed when credentialStatus present but resolver absent | `src/delegation/vc-verification-checks.ts` (~L270), `with-kya-os.config-types.ts` (L71) | ✅ shipped — **this is the plug point** |
| Live demo server `did:web:demo-mcp.kya-os.ai` + `/status-list` + poc.kya-os.ai guided walkthrough | deployed | ✅ running |

**Consequence:** every cryptographic and network primitive exists. The delta is (a) one new artifact type, (b) one resolver class (~150 LoC), (c) two operator scripts (~mostly composing existing exports), (d) demo UI act, (e) packaging.

---

## 4. Target architecture

### 4.1 Data flow (after)

```
Issuer (Responsible Party)
  │ 1. issue DelegationCredential
  │    credentialStatus: {
  │      type: "StatusList2021Entry",
  │      statusListIndex: "94",
  │      statusListCredential: <cheqd resolver URL, version-independent>
  │    }
  ▼
Agent ──2. signed tool call (Ed25519 detached JWS)──► MCP Server (withKyaOs)
                                                        │ 3. verify gates
                                                        │    revocation gate →
                                                        ▼
                                       CheqdDlrStatusListResolver
                                                        │ 4. GET latest DLR version
                                                        ▼
                                cheqd testnet (Cosmos) ── resolver.cheqd.net
                                        ▲
Operator revoke.ts ──5. new DLR version (bit 94 = 1)────┘
                                                        │ 6. next request →
                                                        ▼
                                              CREDENTIAL_REVOKED (fail closed)
```

### 4.2 The version-independent URL (critical design decision)

cheqd DLR "updates" are **new resource versions under the same resourceName/resourceType** — not overwrites. Therefore `credentialStatus.statusListCredential` must NOT embed a resourceId. Use the name/type query form, which the cheqd resolver resolves to the **latest** version:

```
https://resolver.cheqd.net/1.0/identifiers/{did}?resourceName=kya-statuslist-demo&resourceType=StatusListCredential
```

Revocation then = publish new version; every verifier holding the old credential automatically sees the new list. Verify this behavior against staging **first thing** in WP0 — it is the one external assumption the design leans on.

### 4.3 Trust-model delta (the presentation's intellectual core)

| | Before (today, live) | After (hackathon) |
|---|---|---|
| Identity root | `did:web` → DNS + TLS + web host | `did:cheqd` on Cosmos testnet (did:web kept as alias via `alsoKnownAs` — already supported by `linkage.ts`) |
| Revocation truth | Issuer-hosted `/status-list` (issuer can lie / go down / be coerced) | On-chain DLR: append-only versions, globally readable, issuer cannot quietly unrevoke |
| Failure mode | Endpoint down → fail closed | Resolver down → fail closed (unchanged semantics) |

This is exactly the "residual trust" list from the existing walkthrough being retired. Frame it that way.

---

## 5. Work packages

### WP0 — Environment & assumption check (Fri evening, 1.5 h) 🔴 blocking

- [ ] cheqd testnet accounts — fund **two**: (a) the registrar fee-payer / issuer account, (b) a separate **agent wallet** the demo will spend from (separate mnemonic, so "the agent's wallet" is a real, distinct thing on the explorer). Faucet: cheqd Discord faucet or https://testnet-faucet.cheqd.io — confirm current URL. Get enough for ~20 registrar writes + ~20 demo sends.
- [ ] Confirm a working testnet RPC endpoint for cosmjs bank sends (e.g. `rpc.cheqd.network` testnet equivalent — verify from cheqd docs) and do one manual 1 CHEQ send from the agent wallet tonight
- [ ] Create or reuse a `did:cheqd:testnet:*` you control. Fast path: reuse `examples/cheqd-dlr/operator-flow.ts` env setup (`CHEQD_DID`, `CHEQD_KID`, `CHEQD_PRIVATE_KEY_BASE64`, registrar `https://did-registrar-staging.cheqd.net/1.0`)
- [ ] **Assumption check A:** publish any tiny test resource, then confirm the name/type resolver query returns it, publish v2, confirm the query now returns v2. Measure end-to-end latency (write → visible). Expect seconds; if minutes, the demo act needs a progress spinner, not a fake wait.
- [ ] **Assumption check B:** confirm resolver response caching. If `resolver.cheqd.net` caches aggressively, plan a cache-busting query param or a direct call pattern for the demo.
- [ ] Locate testnet explorer URL format for the tx (e.g. `https://testnet-explorer.cheqd.io/transactions/{hash}` — confirm) so the demo can deep-link.
- [ ] Register on their GitLab (`gitlab.com/cryptoadvocate`), confirm you can see the `hackathon-submissions` branch; ask host to add you if not.

**Gate:** if assumption A fails (no latest-version semantics), fallback design: statusListCredential URL = your own thin redirect endpoint that 302s to the latest resourceId (weaker story, still on-chain truth; be honest about the redirect in the demo).

### WP1 — `StatusListCredential` artifact type (Fri evening, 0.5 h)

File: `src/integrations/cheqd/dlr.ts`

```ts
export const CHEQD_DLR_ARTIFACT_TYPES = [
  'CapabilityManifest',
  'ConformanceManifest',
  'AccessHashManifest',
  'TrustConfigManifest',
  'StatusListCredential',   // + hackathon
] as const;
```

- MediaType: `application/vc+ld+json` (or `application/json` if validation is strict elsewhere — check `validateCheqdDlrArtifact`).
- [ ] Unit test alongside existing `src/integrations/cheqd/__tests__` patterns: valid artifact accepted, wrong type rejected, contentHash regex still enforced.
- Keep the diff surgical — this touches published library code; everything else lives in `examples/hackathon-dc34/`.

### WP2 — `CheqdDlrStatusListResolver` (Fri night, 2–3 h)

New file: `examples/hackathon-dc34/cheqd-statuslist-resolver.ts` (promote into `src/integrations/cheqd/` post-con if it proves out).

Contract: implement the existing `StatusListResolver` interface (`checkStatus(status: CredentialStatus): Promise<boolean>`).

Behavior:
1. Parse `status.statusListCredential` (the resolver URL from §4.2) + `statusListIndex`.
2. Fetch via the injected `FetchProvider` (reuse `RuntimeFetchProvider`; honors the fail-closed conventions).
3. Validate: response is a StatusList2021 VC, issuer DID matches expected issuer, `encodedList` present. **Reuse** `bitstring.ts` decode + the existing gzip/base64url handling from `statuslist-manager.ts` — do not reimplement.
4. Verify the VC signature against the issuer DID resolved via `cheqdResolver` (chain of trust stays cryptographic, not just "the chain said so").
5. Return bit at index. Any failure → throw / return revoked-equivalent per existing fail-closed convention in `vc-verification-checks.ts` (match what `chain-enforcement.ts` L236 expects).
6. Optional 10 s in-memory TTL cache with a `bypassCache` flag the demo uses right after revocation.

- [ ] Unit tests with a mocked FetchProvider: bit 0 → authorized; bit 1 → revoked; malformed VC → fail closed; network error → fail closed; wrong issuer → fail closed.

### WP3 — Operator scripts (Sat morning, 2–3 h)

Directory: `examples/hackathon-dc34/`

**`publish-statuslist.ts`**
1. Build a StatusList2021 VC via existing `StatusList2021Manager` + `vc-issuer.ts` (issuer = your cheqd DID, all bits 0).
2. `prepareCheqdDlrResource({ type: 'StatusListCredential', subjectDid: CHEQD_DID, content: signedVc, name: 'kya-statuslist-demo' })`.
3. Publish through `CheqdDidRegistrarClient.createResource` + local signer (copy the working pattern from `examples/cheqd-dlr/operator-flow.ts` verbatim).
4. Print: resolver URL (the version-independent form), resourceId, tx hash / explorer link.

**`issue-delegation.ts`**
- Issue the demo agent's DelegationCredential with scope `payments.transfer` and a constraint (e.g. `maxAmount: 10 CHEQ, network: testnet` — use the existing `scope-matcher.ts` constraint shape), `credentialStatus` pointing at the resolver URL, index **94** (the team-name bit — say it out loud in the demo).

**`wallet-send-tool.ts`** (+1.5–2 h; the audience-fit centerpiece)
- MCP tool `wallet_send({ to, amount })` wrapped with `kyaos.wrapWithDelegation('wallet_send', { scopeId: 'payments.transfer', ... })` + `wrapWithProof` — the exact pattern from the README's checkout example.
- Inside the handler: cosmjs `SigningStargateClient` bank send of `amount` CHEQ from the **agent wallet** on cheqd testnet; return the tx hash in the tool response so the proof binds it.
- Enforce the credential's amount cap in the delegation constraint check, not in the handler — the point is the credential constrains the agent, not app code.
- [ ] Manual test: send with valid credential succeeds (explorer shows tx); send with amount over cap → scope violation; send after revocation → CREDENTIAL_REVOKED.

**`revoke.ts`**
1. Fetch current list → flip index 94 via `StatusList2021Manager.revoke` semantics → re-sign VC.
2. Publish as **new version** (same name/type).
3. Poll the resolver until the new version is visible; print elapsed time + explorer link.
4. Exit code 0 only when visible — the demo UI shells this or calls the same function.

**`verify-once.ts`**
- One-shot: run the full verifier (existing `DelegationCredentialVerifier` + `CheqdDlrStatusListResolver`) against a signed request; print verdict JSON. This is your curl-able judge artifact.

- [ ] Integration test (testnet, tagged `@network`, excluded from CI): publish → verify ok → revoke → verify CREDENTIAL_REVOKED. This test IS the demo in code form; if it's green, the demo works.

### WP4 — Demo act (Sat afternoon, 3–4 h)

Extend the guided walkthrough (v4-guided lineage) with **Act: Kill the agent's wallet access**:

1. Panel shows: agent DID (`did:cheqd:testnet:…`), agent wallet address + live balance, delegation scope card ("may transfer ≤ 10 CHEQ, testnet"), bit 94 = 0.
2. Button **"Agent sends 1 CHEQ"** → runs the signed `wallet_send` → renders ✅ + explorer link to the transfer, balance ticks down. *"That's an AI agent moving funds under a scoped, signed, verifiable delegation."*
3. Button **"Revoke on-chain"** → backend runs `revoke.ts` logic → streams: *signing → submitting to Cosmos testnet → tx {hash} (explorer link) → waiting for resolver → visible in {n}s*.
4. Button **"Agent tries again"** → same signed send → `CREDENTIAL_REVOKED`, gate panel red, balance unchanged. Caption: *"Funds never moved. The issuer cannot quietly undo this — every verifier on earth reads the same chain."*
5. Optional beat if time: **"Agent tries to send 100 CHEQ"** with a valid credential → scope violation refusal. Shows the cap is cryptographic, not app logic.

Implementation notes:
- Backend: tiny Express/Hono route in the same demo server process; no new infra.
- Pre-provision 3–4 spare delegation credentials at indices 95–98 so you can run the act repeatedly (each revocation burns an index; re-issuing live is slow).
- A "reset" is just issuing against the next index — build a `next-demo-credential.ts` helper.
- Do not touch existing acts. Additive only.

### WP5 — Packaging & submission (Sat evening, 3 h) 🔴 hard deadline

- [ ] **GitLab mirror:** push the repo (or a `hackathon-dc34` snapshot) to their GitLab and open the merge into `hackathon-submissions` per their README. The submission form requires a GitLab URL.
- [ ] **README-HACKATHON.md** at repo root: what existed before Aug 6 / what was built Aug 6–8 (be explicit — the form asks), how to run, curl-able verification steps, explorer links to the actual demo txs.
- [ ] **3-minute video** (record even if presenting in person — it is the wifi-failure insurance and the form has a slot): screen capture of the demo acts per §7 script. Public link, no access request.
- [ ] **Slides URL** (form asks): 3 slides max — problem / what we built this weekend (trust-model delta table from §4.3) / roadmap (badge + mainnet + audit checkpoints).
- [ ] Submit the final form **by 22:00 Sat**, not 23:59. Vague organizers + midnight deadlines + conference wifi is how submissions die.

### WP6 — Badge stretch (only after WP5 is submittable)

Cheapest honest version, ~1 h: use the badge camera/QR loop or token mode to hold the recovery seed for the agent's cheqd key; show the badge in the presentation: *"the key that signs this agent's actions — and the one that revoked it — is protected by this year's badge."* If the Discord/Matrix thread yields a raw-signing pointer, timebox any attempt to **2 h hard stop**. Otherwise it is one roadmap sentence + the community thread screenshot.

---

## 6. Test plan

| Layer | What | When |
|---|---|---|
| Unit | dlr.ts artifact type; resolver checkStatus matrix (ok / revoked / malformed / network / wrong-issuer → fail closed) | With each WP |
| Integration (testnet) | publish → verify → revoke → verify-refused round trip (`@network` tag) | End of WP3; re-run after any change |
| E2E demo rehearsal | Full act sequence on the real page, twice, on conference wifi AND phone hotspot | Sat 18:00 |
| Regression | Existing test suite green — the published library changed (WP1), so `npm test` must pass untouched suites | Before mirror push |
| Judge-proofing | `verify-once.ts` from a clean clone on a second machine following only README-HACKATHON.md | Sat 19:00 |

---

## 7. The 3-minute script (target 2:45)

- **0:00–0:25 — Problem.** "The next wallet-draining attack won't be a phishing link — it'll be someone's AI agent. Agents are getting keys and spending authority, and there's no standard way to scope that authority or kill it in a way nobody can quietly undo. KYA-OS is the DIF reference implementation for agent identity — this weekend we gave it a wallet and put the kill switch on-chain."
- **0:25–1:10 — The agent spends, safely.** Agent's DID resolves from cheqd testnet, not our server. Agent sends 1 CHEQ under a credential scoped to ≤10 CHEQ — signed tool call, six verification gates, tx on the explorer. Then fast attack theater: tamper → refused, replay → refused, over-cap send → refused. "Every verdict is the shipped verifier. Nothing mocked."
- **1:10–2:15 — The kill switch.** Press Revoke. Tx hash → explorer on screen. "That's Cosmos accepting the revocation." Agent tries to spend again → CREDENTIAL_REVOKED, balance untouched. "Before this weekend you had to trust our web server to tell the truth about revocation. Now the truth is on a chain the issuer can't edit — a rogue agent gets stopped before funds move."
- **2:15–2:45 — Close.** "Open source, DIF working-group governance, and next: the agent's key lives in *this*" (hold up badge) "— hardware-backed identity in inspectable silicon. Repo QR. We're called Revoked — you just watched why."

Rehearse against a timer three times. Cut anything that makes it 3:05.

---

## 8. Risks & fallbacks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Resolver latest-version semantics differ from assumption | Low-med | WP0 check A on Friday; redirect-endpoint fallback designed in §WP0 |
| Registrar staging down / rate-limited during con | Med | Do all publishes early; keep 3 pre-published spare credential indices; screenshot + explorer links survive an outage |
| Resolver caching hides fresh revocation during demo | Med | WP0 check B; cache-bust param; worst case demo shows explorer first, resolver read second |
| Conference wifi dies mid-presentation | High (it's DEF CON) | Recorded video is a first-class submission format per their README — record Saturday regardless; phone hotspot as live backup |
| Testnet faucet dry / slow | Low | Get tokens Friday night, two accounts, ~20 writes + ~20 sends |
| cosmjs / testnet RPC friction (endpoint, gas denom, chain-id) | Med | One manual send **tonight** in WP0; if RPC fights you, fallback demo action is a registrar write "on behalf of" the agent — weaker, still on-chain |
| Badge rabbit hole eats Saturday | Med (it's you, at DEF CON, with new bunnie silicon) | Hard rule: badge work is forbidden until WP5 submit-ready; 2 h timebox after |
| Scope creep into audit-trail-on-chain | Med | One roadmap sentence. Nothing else. |
| Form/GitLab friction at 23:00 | Med | Mirror + draft form by 20:00 Sat; submit by 22:00 |

---

## 9. Timeline

**Friday (tonight)**
- 19:00–20:30 WP0 environment + assumption checks 🔴
- 20:30–21:00 WP1 artifact type + tests
- 21:00–23:30 WP2 resolver + unit tests
- 23:30 Post progress note in badge Discord thread if reply arrived; sleep

**Saturday**
- 09:00–11:00 WP3 operator scripts + testnet integration test green
- 11:00–12:30 `wallet_send` tool + scoped delegation + manual send/over-cap/revoked tests
- 12:30–13:00 First full manual round trip (spend → revoke → refused); commit; push GitHub
- 13:00–16:00 WP4 demo act (backend route → UI with balance panel → spare credentials → reset helper)
- 16:00–16:30 Buffer / lunch you forgot to eat
- 16:30–17:30 Record the 3-minute video (v1 — re-record only if something big lands after)
- 17:30–19:30 WP5: GitLab mirror, README-HACKATHON, slides, draft form
- 18:30 interleaved: E2E rehearsal ×2 on con wifi + hotspot
- 19:30–20:30 Judge-proofing clean-clone run; fix docs
- 20:30–22:00 **Submit.** Then, and only then: badge timebox
- 22:00–24:00 Slack for everything above running late (it will)

**Sunday**
- 09:00 Arrive, wifi check, hotspot armed, video queued as fallback
- 10:00 Present. End on the badge. Say the team name.

---

## 10. Definition of done

- [ ] Testnet integration test green: publish → verify ✅ → revoke → verify ❌ CREDENTIAL_REVOKED
- [ ] Demo act runs live twice consecutively without manual cleanup
- [ ] Explorer link in the demo resolves to the real revocation tx
- [ ] `npm test` fully green including untouched suites
- [ ] GitLab mirror + merge into `hackathon-submissions` visible
- [ ] Form submitted with: GitLab URL, video URL (public), slides URL, docs URL
- [ ] Video ≤ 3:00, viewable logged-out
- [ ] Clean-clone `verify-once.ts` works following only the hackathon README
