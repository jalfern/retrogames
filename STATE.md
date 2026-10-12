# STATE.md — 2026-10-12 (WWI DOGFIGHT session end)

## Where things stand
**#79 GAME 15 — WWI DOGFIGHT IS LIVE at jalfern.com/retrogames/dogfight**
(PR #160, squash `08e8297`, `shipped`, issue closed; prod lazy chunk
`index-DAVroScq.js` fetched from jalfern.com and grepped for the patrol
names — DAWN PATROL/THE CIRCUS. Arcade lists 35 titles.)
**Next session: claim #82 BensMagicBugLife** — oldest `game-queue` entry
(`gh issue list --label game-queue`; then #118 Minesweeper, #143 Paperboy,
#152 Wizardry). No `next` label exists.

| this session | what |
|---|---|
| #79 / `forge-dogfight` | Built from zero: `sim.js` pure 30 Hz `step` (zero random, energy ledger `v'=T−d−g·sinγ`, stall drops the nose, P-D bandits with Circus doctrine — one lead guns at 300 m, wingmen at 140); `levels.js` two patrols that MUST spawn bandits above the scout (the opening zoom climb is the first transaction); `index.jsx` chase cam on the sim's own attitude, instrument DOM from sim state, attract = `recordMission` witness. |
| harnesses | `dogfightcheck` 62 checks + **7 mutants, in CI `--mutate`** (stall/flat-tracers/frictionless/eternal-belt/BB-gun/no-elevator/anaemic-bank — all die); `dogfightplay` 18 Chrome real-key checks, green locally AND at `DOG_LITE=1 --throttle 16`. Gates: `lint:dog` + `dogfightcheck --mutate` static, `dogfightplay` smoke. |

## What is playable right now
- jalfern.com/retrogames/dogfight — two patrols, stall contract, belt
  economy, receipt-gated Vickers; the autopilot wins Dawn Patrol in ~55 s
  at hp 3 and The Circus in ~106 s at hp 1 (that one is meant to be close).
- Ledgers exact EVERY tick in sim and browser:
  `belt + flying + hit + missed == total`, per plane.

## What changed this session (the parts that matter next time)
- **`NaN > 0` is false — a missing spawn field disarms the enemy and the
  sky looks PEACEFUL, not broken.** Bandit specs had no `belt`, so `e.belt >
  0` never opened the gate and no check went red. Two fixes came out of it:
  spawn defaults in the plane factory (`belt: src.belt ?? 240`), and the
  per-tick `finiteOk` + "bandits fired >0" audits in `dogfightcheck`. Fake
  danger is as bad as a frozen sim; audit that the guns BARK.
- **A scratch lab that clears the foes freezes the world via the win
  condition** (tick 1 = "patrol cleared", every later step a no-op, and the
  physics probes judge a statue and still pass construction). Repark them
  6 km away instead.
- **P-only aiming limit-cycles across the gun gate forever** — pitch and
  bank both integrate their command. The bandits were honest until they were
  given a D-term (last-tick attitude as the derivative); before that the
  merge was gun-free theatre even with the gates wide.
- **ω = tan φ / v must stay unbendable enough that SPEED buys turn rate**
  (clamp ~0.85, not 0.5): with a flat clamp both sides circle identically
  and nothing converges; the pilot's turn-throttle ("speed is the argument")
  is only honest if slowing down actually tightens the circle.
- **A pixels-vs-state probe must sample while the subject is in frame** —
  the first sight-loop judged bandits after the merge had put them behind
  the camera (`project` returned null, "0/0 projections" read as failure of
  the RENDER). Test projections against a fresh spawn, steering with real
  keys between samples.
- Bandit doctrine (lead-only fire) was the honest difficulty fix for 3v1 —
  the alternative was buffing the player, which is lying about the ledger.

## Gates (all green at merge, PR #160)
lint:mario/fps/ai/dog ✓ · `dogfightcheck` 83/83 + 7/7 mutants (CI runs
`--mutate`) ✓ · `dogfightplay` 18/18 local AND 16x-lite ✓ · static ✓ 2m6s ·
smoke ✓ 4m49s (first try) · build ✓ · prod 200 + patrol names found in the
live chunk.

## Next (for the next session — do NOT re-debug these here)
1. Claim #82 BensMagicBugLife (oldest queue head; then #118 Minesweeper,
   #143 Paperboy, #152 Wizardry). Same drill: design comment first, one
   game, harness that can fail, slack rule, merge only via
   `--watch --fail-fast` then squash.
2. WWI Dogfight is shipped — do not polish. Honest gaps in
   `src/games/Dogfight/README.md` (pilot fires ~5 rounds because receipts
   are honest; no gun jams). If The Circus feels unfair to Jon, the honest
   knob is the lead's gun range (300 m), never the player's hull.
3. If `dogfightplay` flakes on CI, widen sampling windows, not assertions;
   the bandit-pixel check samples a fresh spawn twice by design — give it
   the steer-and-resample loop, don't drop it.

## Three questions for Jon
1. `dogfightplay` also passed CI smoke first try (two browser drivers now
   do). Promote the smoke job to automatic-on-PR, or is headless audio
   still the blocker? (state.md asked this last session — #79's session.)
2. The Circus ends at hp 1 on the autopilot's witness. Is "won by a
   thread" the right feel for the arcade's hardest mission, or should the
   lead's gun range drop 300→260 so a human's sloppy lead survives one
   more pass?
3. Q/E throttle has no touch DOWN (the TH button is throttle UP only).
   Extend VirtualControls with a third mapped code, or is cruise-enough on
   a phone (the game is winnable with E never tapped — verified)?

## Lineage
AGENTS.md honored: read STATE first, one game (#79, oldest queue head),
design comment posted before code, 5 checkpoint pushes each with its issue
comment, harness proven able-to-fail (7/7 mutants IN CI), merge only via
`gh pr checks --watch --fail-fast && gh pr merge --squash --delete-branch`,
prod verified from the live chunk, STATE via this commit. Rule 4: ten
straight sessions touching `src/games/**`. Ran ~3h.
