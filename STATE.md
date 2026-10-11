# STATE.md — 2026-10-10 (Galaga session end)

## Where things stand
**#71 GAME 07 — GALAGA IS LIVE at jalfern.com/retrogames/galaga** (PR #123,
squash 848018d, `shipped` label, issue auto-closed). Arcade is 24 titles.
**Next session: claim #72 Polarity Shooter** (queue head).
No unlabeled `GAME —` issues remain beyond the queue; nothing carries `next`.

| since last STATE | what |
|---|---|
| #71 / `forge-galaga` | Four-module shooter: `paths.js` (every flight a named sampled path), `waves.js` (SWARM/BOSSES/GUARD stage scripts), `sim.js` (pure `step(state,input)`, zero `Math.random`, behavior tree captive→beam→roster), `planner.js` (autopilot; its proven run IS the attract demo). Capture chain is the feature: beam → captive escort → shoot your own escort → catch pod → DOUBLE. |
| harnesses | `galactcheck` 71 Node checks + 4 mutants (`--mutate`); `galactplay` 20 Chrome checks, real keys only. Both in CI static (lint:galaga + galactcheck) / verify tier. |

## What is playable right now
- jalfern.com/retrogames/galaga — verified on PROD with a real keypress in a
  real browser: canvas 224×288, fighter pixels at the physics x, zero errors.
- The attract screen plays the autopilot's proven run tick-for-tick.

## What changed this session (the parts that matter next time)
- **A surviving mutant is about the test again.** `diveMin=inf` survived
  because ONE dive is observable without the cadence rule; the probe now
  demands ≥3 dives before it may pass. The `rescued` probe baseline failed
  because the stage banner ignores fallers — probes must wait for `phase=play`
  or they mutate code that never ran.
- **Node-pass ≠ browser-alive.** galactplay caught two shell bugs Node
  structurally cannot see: (a) `tickDemo` resumed a game holding `end`, so
  `over → attract → doSim(dead)` bounced back to `over` on the next tick —
  now tickDemo replaces the sim the instant it sees `end`; (b) pixel checks
  sampled inside the respawn blink frame. Harness wait loops must first wait
  for `player.state==='alive'` (stage banners make the fighter inert ~4 s).
- **Rigs must not be killed by the game while waiting for a rare scripted
  event.** The browser capture test pinned the player at 3 lives to await a
  pt≥700 beam; divers ended the game first. Rig `lives: 9` for chain probes.
- Beam band honesty: `bandX` is exposed by `probe()` only while the band is
  open, and the browser test steers by that + canvas pixels, not by peeking
  at the path — same information the player has.

## Gates (all green at merge)
13 scoped lints (new `lint:galaga`) · `galactcheck` 71/71 + 4/4 mutants in CI
static · `galactplay` 20/20 local Chrome · aicheck 24 · zorkcheck 55 ·
build ✓ · prod browser check ✓ (also: telemetry.sh +x piggybacked, launchd
needs it — committed with mode 755).

## Next (for the next session — do NOT re-debug these here)
1. Claim **#72 Polarity Shooter** (queue head). Same lane: pure sim,
   attract = proven run, `lint:polar` + a Node check proven red, a real-keys
   browser pass. Reuse galactcheck's mutation discipline verbatim (print the
   mutated line; probes wait for `play` phase; demand observable frequency).
2. Galaga is shipped — do not polish it. Its gates: `lint:galaga` +
   `galactcheck` (static), `galactplay` (manual tier, needs dev server).
3. If the attract demo ever freezes: `probe().tick` frozen = the proven-run
   planner broke; frozen only after a death = `tickDemo` end-guard (see
   above) regressed.

## Three questions for Jon
1. galactplay takes ~4 min real time (the beam alone is ~16 world-seconds).
   Fine in the manual `verify` tier, too slow for static — OK to keep it
   manual forever, or want a `?lite` fast-forward knob for CI browser runs?
2. The `smoke` job was green before `static` finished — does it actually
   deploy-check the branch, or the previous prod? It passed on my PR before
   the Galaga code was anywhere near prod.
3. Queue is thin after #72: want the Forge board to start drafting candidate
   GAME issues itself (queue bin can hold drafts), or stay manual?

## Lineage
AGENTS.md honored: read STATE first, ff-only pull + prune, claimed queue head
#71 with claim comment + design note, one game, ~6 checkpoint pushes with
FORGE comments, harness proven able-to-fail (4 mutants caught, 2 honest
survival post-mortems above), merge only via
`gh pr checks --watch --fail-fast && gh pr merge --squash --delete-branch`,
prod verified in a real browser (real keypress drew the fighter), STATE
rewritten on main (game merged → allowed). Rule 4 satisfied: five sessions of
game code in a row — this one IS game code (`src/games/Galaga/**`).
