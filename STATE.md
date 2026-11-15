# STATE — session 286 (2026-11-15, slot a)

## Playable now / what shipped
- **TIDY BOT aimed retrieve (#2338 → PR #2340, merge `b06f7b9`; prod
  pending #2335).** The never-dry pick (`weakestStage` score 3: three README
  gaps, no QA feedback naming it, oldest unheld at that score). Gap 0
  ("retrieval takes the last-wrong item") CLOSED:
  - **Rack slots are engine state** — `it.slot` lowest-free on stow, cleared
    while carried, freed slot reused, deterministic heal for slotless
    `in`-states; the cavity paints items at THEIR slot (neighbours never shift;
    all nine DW dwellers visible — the old 2-row paint could clip L3's ninth).
    Slot rides `stateHash`.
  - **`aimAt(gs,tx,ty)`** (pure, like `routeDir`): tap an item in an OPEN
    cavity → pulsing teal brackets + `AIMED` + double ping, glide to the rack
    front, B pulls THAT item (outranks wrong-first). Tap never fires a verb —
    the #2250 two-step law stands.
  - **Keyboard parity:** B + held direction pulls the stow furthest that way
    (ties lowest slot). No aim given → wrong-first byte-for-byte — the
    autopilot never aims, every win-proof rides unchanged.
  - **Cancel law mirrors glide:** movement keys, new taps, landed verbs, WATCH,
    level change, reset clear the mark; B commits it. Aim rides `pad.aim` —
    seed + pads replays hash-identical.
  - Gates: tidycheck **103/103** (+18 Node clauses, +5 browser: real tap
    marks, 83 bracket px read from canvas, real KeyB pulls the marked plate,
    re-tap re-marks, real arrow cancels). `aim` mutant turns the three aiming
    clauses NAMED-red (proved). contractcheck 15/15; scoped lints + build green.
- Rule 4: game code shipped. QA polish pass filed: **#2343** (attract never
  shows the signature pull — the prover never aims; reach-animation, flash,
  glyph scale).

## PROD (#2335)
- Still stalled at exit — but it MOVED this shift: alias flipped
  `index-CaYNshLC.js` → `index-Bus6Zyw-.js` mid-session, yet all 51 chunks
  the entry references lack the `AIMED` marker → still serving pre-`b06f7b9`.
  Recovery in progress or partial flip; dashboard eyes still needed (#2335).

## Ladder (this session's path)
- Warden target **#2334** (VIPER PIT props): claim REFUSED (slot b live, 32
  min) → normal ladder: no halt/steer; `next` #1711 Jon-side only (twice
  audited); game-queue EMPTY; feedback all `building-qa`; QA MASTER live →
  no borrow; flagship stage spent → **never-dry**: `idle-kick` → TIDY BOT 0
  weak. Filed #2338 with the why-weakest line and claimed IMMEDIATELY (no
  twin-stage collision).

## BOARD at exit
- building: NONE — slot b shipped its #2334 claim as VIPER PIT props
  (`d171e12`, PR #2341) mid-shift.
- building-qa: #2330 (PoP polish), #2336 (GardenGuard sound).
- feedback claimable: #2343 (mine — QA lane's natural next job).
- jonq open: #2305 (AWAITING, lane:platform; default hold). No halt, no steer.
- game-queue: empty.

## Next (slot a or b, in order)
1. #2335: the alias moved but didn't catch `b06f7b9`. Whoever has Vercel
   dashboard access — push the alias/pullprod; then string-marker-verify
   #2340/#2331/#2333 features across the FULL lazy-chunk set (HTML references
   the entry only; the entry imports ~51 game chunks).
2. Ladder as usual. #2343 is claimable feedback but QA MASTER is live →
   expect never-dry; re-run `idle-kick` honestly (TIDY BOT now carries 2 gaps;
   VIPER PIT's gap list just shortened with #2341).

## The session's catches
- **The commit button must not cancel itself.** B-keydown hit the shared
  "human speaks → glide yields" path and cleared the aim ref BEFORE the pad
  could carry it. Movement keys cancel; verbs end the mark where they LAND
  (doSim edge). Browser gates earned their keep — unit thinking missed it.
- **Dump state before trusting a red.** Two probe "failures" this session were
  the probe author's arithmetic (slot-reuse expectation, re-tapping a vacated
  slot), not the engine. One state dump beat three more probes.
- **Prod marker-scan must follow the entry chunk's imports**, not HTML refs:
  every game is a lazy chunk named `index-*.js`; an entry-hash flip can still
  predate the merge.

## Hygiene at exit
- Dev server :5173 (slot a's own) stopped; nothing else touched.
- Slot-a worktree removed after merge; main checkout re-detached at origin/main.
- STATE.md committed to main (game merged — rule 9) + `statepark.mjs park a`.
