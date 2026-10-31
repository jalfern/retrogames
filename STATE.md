# STATE — session 61 (2026-10-31, slot a)

## Shipped this session
**GRAVEL YARD — #1253 co-op heavy-metal sandbox merged** — `0c73d26` (PR #1303),
prod verified (`assets/index-Dtx_Khwm.js` carries `gravel-yard`; live at
`/retrogames/gravel-yard`, private until Jon promotes, #379).

- The chain IS the game: pile -> digger bucket(3) -> shaker hopper(6) -> gate
  (WIDE 75% coarse / MED 50 / NARROW 20) -> graded bays(8) -> truck bed(4) ->
  tip against an order -> credit. 180 s shifts, quota 600C, three refusals at
  the gate ruin the shift. Wet seams jam the screen — jog it B (1+wet times).
- **Split info (#1253 design rule)**: moisture only at the pile, grade chart
  only on the plant, orders only on the truck's board — radio callouts (fx
  `radio`) say what the SHOUTING seat sees, so a solo crew plays by ear.
- One pad law all seats: arrows drive where you face, A works the faced cell,
  B releases it. Seats: 0 digger (you), 1 truck (P = human, WASD+F/G), 2 the
  screen operator (CPU locally; model-ready via contract). Unfilled = CPU
  emitters, pads only (#494).
- Deterministic core (`engine.js`, mulberry32 + FNV). Win proof: full-CPU crew
  quota on **8/8 seeds** (663-985C); slack (one unit less EVERY pile cell)
  **7/8**; two-handed 8/8. `simulate(seed, players)` is the reference driver.
- Harness: `gravelcheck` 53 gates (rules, determinism, win+slack, browser boot,
  contract determinism, in-browser CPU-brain proof) + `gravelplay` 20 real-key
  gates (dig+dump chain by keystroke, pixel-vs-sim both ways, pause freeze,
  over-screen + SPACE restart, tap-to-start). Mutant: drop `gs.strikes++` in
  tip() -> red x2; restore -> green. contractcheck gravel-yard 14/14.
- #1253 closed shipped; polish pass filed as **#1306** (amber cones + wet
  shimmer, boom/tip animation, engine idle drone + per-seat radio timbres,
  cents ticker + CLEAN SHIFT stamp, attract seeded to a tip moment, mic that
  lets a truck-seat human SHOUT orders — Gauntlet's voicecalls is the pattern).

## Next goal
Game queue (oldest first): **#1254 FIRE CREW**, then platform-labeled items
(#1291 kitchen online lobby, #1259 forge-watch, #1290 mini-whole-queue — the
mini/platform lane's own picks). #1141 stays platform-lane.
**#1252 BOMB DEFUSE** still carries `building` + slot b's design comment
("TALK ME DOWN") but has NO pushed branch — if slot b's claim stamp goes stale
(90 min), it is claimable and its design comment is the spec to resume from.
Rule-4 watch: reset — game code merged this session.

## Harness
- `gravelcheck`/`gravelplay` join the suite (aliases in package.json).
- `gravel-yard` wired into contractGames (GAMES + wiggle pattern).

## Environment notes
- Slot a worked in `~/Dev/retrogames-forge-gravel-yard` (merged; worktree left
  detached at origin/main). Port 5173, `npm run dev -- --port 5173 --strictPort`;
  dev server STOPPED at session end.
- `forge-claim.sh` needs `bash` (no exec bit). Refused on #1252 (fresh b stamp)
  and took the ladder: #1253.
- Two lessons this shift: machines act on the cell they FACE — plan routes to
  STAND cells, never the face cell (hopper/console became solid plant faces);
  and an original game's "unreachable" clue is topology — dug-out pile cells
  must become driveable or interior seams starve the crew (seed 4 scored 0).

## Open questions for Jon
- none open from this session (#737 still sits waiting-jon from earlier lanes).

## Carry-over
- #1306 QA polish pass on GRAVEL YARD (feedback — QA lane's job).
- #1287 QA polish pass on GAUNTLET voiced co-op (feedback).
- #1291 SHORT ORDER SHOUT stage 2 online lobby (next kitchen-scale build;
  GRAVEL YARD's seats are lockstep-ready for the same plumbing).
- #1141 stage 4 (platform lane), #1266/#1275 QA follow-ups, 48 h trial verdict
  (~Nov 1) posts on #1258.
