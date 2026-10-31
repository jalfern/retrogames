# STATE — session 61 (2026-10-30, slot a)

## Shipped this session
**SHORT ORDER SHOUT — #1248 original co-op kitchen merged** — `582fe58`
(PR #1288), prod verified (chunk `ShortOrderShout-wr98i1J.js` live at
`/retrogames/short-order-shout`, the URL is in the issue's ship comment).

- Original IP (Jon's call: no Overcooked name/art). 13×7 deterministic grid
  kitchen: 1–4 cooks sit across a pass counter, order tickets on timers, take
  raw → boil/melt → plate → serve across the counter; split-firewall layout
  makes handoffs the only fast path — coordination you must TALK through.
- Every seat is a slot (#494): humans share one keyboard (arrows+Enter seat 1,
  WASD+F seat 2, pad for touch) or a CPU partner fills the rest. Pure
  deterministic core (seeded mulberry32, FNV hash per tick) so a trained model
  takes a seat later: `gameContract` + `__sosTest` + 2×5 sensors
  (`sos.<seat>.seen` / `sos.<seat>.todo`) + `sos.calls` voice channel, all
  recorded by rec/v2 (#1247); no-op actions stay 0 so expert pads can be
  one-hot and `expert_state=1`.
- Juice: fire spreads and boils over if untended (bucket → douse), dirty
  dishes poison plates, tips feed the streak multiplier, 3 timed-out tickets
  strike out; NES diner look, fully synthesized sound, attract mode with two
  CPU cooks performing a real sim.
- Online lobby (remote seats over the relay) is deliberately stage 2 —
  **filed #1291** (engine already treats remote input as `pads[seat]`,
  deterministic sim is lockstep-ready).
- Harness: `soscheck` 36 gates (node rules/determinism/win + browser feel/
  HUD/recording — solo slack gate PROVES the partner matters); `sosplay`
  11 gates driving real KeyboardEvents incl. pixel/state agreement. Mutant
  proven: neuter boil-over → check red, restore → green.

## Next goal
Game queue (oldest first per the ladder): **#1252 BOMB DEFUSE, #1253 GRAVEL
YARD, #1254 FIRE CREW, #1259 forge-watch hardening, #1144 follow-ups**.
Rule-4 watch: reset — game code merged this session.

## Harness
- New aliases `npm run soscheck` / `npm run sosplay`; ShortOrderShout added to
  `contractcheck`'s GAMES (contract 6/6 on-device).

## Environment notes
- Slot a worked in `~/Dev/retrogames-forge-coop-kitchen` (branch merged,
  worktree detached at origin/main). Port 5173, `npm run dev -- --port 5173
  --strictPort`; dev server stopped at session end.
- A zombie dev server from the merged floor-boss worktree (session 59) was
  squatting on 5173 at session start — killed it (pid was serving the old
  detached checkout). Lanes: after a merge, `git checkout --detach origin/main`
  in the worktree before anything else; `gh pr merge --delete-branch` checks
  the deleted branch out and git refuses to remove the worktree.
- STATE.md commits go straight to main only when a game merged this session
  (verified with session 60's `d74f60f`).

## Open questions for Jon
- none open from this session (#737 still sits waiting-jon from earlier lanes).

## Carry-over
- #1291 SHORT ORDER SHOUT stage 2 — online kitchen lobby (game-queue).
- #1292 QA polish pass for SHORT ORDER SHOUT (feedback — QA lane's job).
- #1287 QA polish on GAUNTLET voice co-op; #1141 stage 4 (platform lane),
  #1266/#1275 QA follow-ups, 48 h trial verdict (~Nov 1) posts on #1258.
