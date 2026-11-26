# STATE — forge board snapshot (slot a, 2026-11-26 — ADVENTURE seam follow SHIPPED: #3552 closed)

## Slot a ran TWO sessions today (warden double-kick, #1782 pattern)
- Builder session (kicked by the 1258 prompt, TARGET #3536): REFUSED at claim — slot b
  held #3536 fresh (they shipped it as #3550). Ladder: steer 0 · `next` #1712
  waiting-jon (skipped) · game-queue empty · zero unclaimed feedback · QA MASTER live
  → flagship spent → never-dry: `KICK ADVENTURE 0 weak`. Rule-8 audit BEFORE building:
  the 13-gap score was stale (variant-selector shipped in #1572, silent-cart was a
  note, nine `### Restored` bullets parsed as gaps — #3558 now fixes the parser too).
  Filed + claimed **#3552**, built at `~/Dev/retrogames-forge-adventure-seam`:
  exact sprite-rect seam admission + 7 pins + slack-regression mutant + README hygiene
  (parseGaps 13→1). Held through the red-main freeze (#3557 fixed attractcheck);
  rebased to f8598a8. Its watch-chain then died on an API rate-limit 403.
- Resume session (warden's "builder a idle" kick at 17:17 — the builder was alive,
  see handoff note): step-1b found #3552 as a pushed slot-a corpse, claim said
  "already yours: resume", re-verified main-ok + the rule-5 chain and merged.
- **SHIPPED (#3552 → PR #3560 merged as `8490932`):** `seamFollow` admits a hunting
  dragon only when its `DRAGON_BOX` sprite rect genuinely overlaps the doorway rect
  (x∈(50,100) vertical, y∈(60,120) side) — no more phase-following through solid
  stone beside the door. Mirror entry, parallel axis and jaw gate untouched;
  `DRAGON_FOLLOW_SLACK` deleted.

## Proof at ship
- adventurecheck **223/0** (+7 §3552 pins) · all **60 mutants die** (incl. the new
  slack-regression plant) · advedrive **10/10** real Chrome zero page errors ·
  feedbackcheck **291/291** (seed pins unmoved) · CI `static` pass at head f8598a8
  + scope + Vercel; prod live: https://jalfern.com/retrogames/adventure (200).
- Advisory `smoke` failed twice (its rerun too) — the same red #3559 carried across
  lanes today; flake pattern, not chased (rule 3), noted for the next smoke owner.
- Builder lessons (each once): a timed-out foreground `--mutant` leaves its plant() in
  the tree and IGNORES SIGTERM while spawning children — kill -9 the parent pid (check
  lsof cwd = own worktree), `git checkout --`, rm stale `.mutant-running`; a cold Vite
  dev server starves fixed-ms key holds (first advedrive leg flaked — byte-swap probe
  proved it wasn't the change); long `gh run watch` chains can eat the shared API
  rate budget — prefer single `gh pr checks --watch` on the PR instead.

## ASTEROIDS handoff (#3553 is slot b's, PR #3559 open)
- b's fix for the two surviving driver mutants landed on its branch (fast wave-floor
  raise). Full-tree mutant truth from the pre-yield run: **27/29** — survivors were
  `rollout dodges too late` (threat window <45→<2) and `the driver's eye forgets the
  wrap`. Pre-yield work uncommitted (tree reverted by b's resume — correct liveness):
  deterministic eye gates, measured **116/0**: export `scan` + `wrapDelta` from sim.js
  (zero behaviour change), pin ttc=12 is THE threat under `< 45`, ttc=45.5 is drift,
  wrapDelta(±590,600)=∓10. Both survivors die on these deterministically. If b's
  sweep floors prove flaky at full scale, adopt these instead — detail on #3553.

## BOARD facts at close
- building: #3553 (slot b). building-qa: #3547 INVADERS, #3533 DEFENDER 2p.
- game-queue empty · steer empty · `next` #1712 (waiting-jon).
- feedback open: #2971, #3244 (both waiting-jon) · #3547, #3533 (QA holds).
- Rule-4 satisfied: game code merged this session (`8490932`).

## PLAYABLE on main right now
- ADVENTURE with honest doorway-overlap seam follow — https://jalfern.com/retrogames/adventure
- PONG cabinet voice + block numerals, DEFENDER wall veto, INVADERS wave laws.

## Open questions (links only — #605)
- #3335 — QA music-bus low-pass (AWAITING, deadline Nov 27; PINBALL gate).
- #3516 — Arkanoid art rung (AWAITING, Nov 28).
- #3054 — TestFlight recorder; #2971 — contra polish; #1712 — PLAICRAFT S2.
- No new jonq questions this session (no taste calls).

## Slot state at handoff
- Main checkout detached at origin/main (`8490932`); STATE.md ships via this docs PR.
- forge-adventure-seam worktree auto-pruned by mergeclean (it was clean) — gone.
  (Its node_modules was a SYMLINK to the main checkout's install — nothing leaked.)
- forge-asteroids-aim-ease worktree belongs to the LIVE slot-b session — never touch.
- Slot-a dev server (:5173) was stopped via `scripts/devstop.sh` at the builder's
  close; :5178 is slot b's server — do not stop.

## Next claims (for whoever is free)
1. When b lands #3553 the ladder is empty → never-dry rung. Flagship stage (#841) in
   Jon's order — derive with idle.mjs (post-#3558 parseGaps is honest, and ADVENTURE's
   README is now clean: one real gap, the gate-rite manual); skip building-qa holds.
2. Biggest unowned flagship gap on word-of-mouth: DOUBLE DRAGON two-player alternating
   turns (desktop-keyboard option; CPU stays the phone default, Jon's ruling) — verify
   against idle.mjs output before claiming.
3. When jonq answers land (#3335 Nov 27, #3516 Nov 28), execute them at the next claim.
