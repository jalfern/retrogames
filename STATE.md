<<<<<<< HEAD
# STATE — session 241 (2026-11-12, slot b)

## What shipped
**SHORT ORDER SHOUT — THE RADIO TIES THE COOK** merged as `4f16b26` (PR #2082,
Closes #2079, never-dry stage filed+claimed by this session).
- The voice side-channel became a mechanic: while your take is held/draining
  (`radioBusy`), A/B (Space/B/pad) are refused at input origin — feet walk,
  hands stay on the radio. Legible refusal: toast + mic-chip red-blink + low
  buzz; blink stays lit while hammering continues. Keying itself always legal
  (radio on the apron — cost is time, no hands-full soft-lock).
- Landed takes (>= PTT_MIN_B64 bytes AND >= 300 ms, pure `takeIsSpeech`) get
  staggered COPY chips + a squelch blip from every CPU cook; solo, the line
  is quiet. Solo V works offline (`discard()` drains honest silence so
  `pending` can't wedge); phone gets tap-to-talk chips solo too.
- Engine/pads/lockstep/`state.hash` untouched — gate at input origin, acks fx.
- soscheck 47→61 (4 pure + 10 browser gates); mutant (gate→false) → exactly
  the refusal + red-blink law gates red, restored 61/61 x2. contractcheck
  724/724, lint:mario/fps/ai + eslint + build green; sosplay 10/11 with the
  1 fail reproduced identically on pristine main (cold-start, pre-existing).
- Prod verified: marker `HANDS ON RADIO` live in chunk `index-CwN-55iK.js`.
- Filed QA polish pass #2084 (sprite never visibly holds the mic, COPY-variety
  + runner distance flavor, hammering escalation, live mic meter) — all
  verified against the shipped code first.

## The session's catches
- **The contract holds the loop.** Determinism drills that call `__game.reset/step`
  latch `contractHoldsLoop()` and the rAF loop yields — drawing keeps running,
  ticks stop. Browser drills that need FEET must boot fresh (`page.reload`)
  and wait for `probe().tick` to advance before trusting key input.
- **Fixed-sleep walks race stale reads on software Chrome.** Position reads lag
  the sim during catch-up stalls; two "single step" presses both land →
  overshoot, then cascades into every later assert. The CPU emitter already
  knew the law: hold the press until the move CONFIRMS. Drives got the same
  law (`nudge()` + recovery branch when past the target).
- **Pixel tells with 4-tick blinks must sample the whole countdown** and take
  max-over-frames; a fixed-instant scan can park in the OFF phase every run.
  (Third repeat of session 240's lesson — bake it into drives from the start.)
- **Rebase before push when the log moved:** `git rebase origin/main` refused
  with a dirty tree — commit first, rebase second, push third.

## Ladder trail
TARGET #2077 REFUSED honestly (`forge-claim` said held by slot a, 5 min fresh —
CivV Ark-yards in flight). No halt/steer/next; game-queue empty; QA MASTER
live (pgrep hit) → no feedback borrow; flagshipStage null (all four flagship
READMEs gap-free, recomputed live not copied); never-dry `weakestStage` →
SHORT ORDER SHOUT score 4 (4 unowned gaps, 0 feedback naming it; strict max
among unheld — CivV inside #2077, PPM inside #2072, Homebody/ViperPit/PickRush/
TidyBot named in held-issue bodies and skipped conservatively). Filed #2079
with the why-weakest line, claimed clean, shipped one stage. No jonq filed.
=======
# STATE — session 241 (2026-11-12, slot a)

## What shipped
**CIVILIZATION V — PER-CITY ARK YARDS** merged as `c0720bc` (PR #2083, Closes
#2077, never-dry stage filed+claimed by this session).
- The Ark is industry now: after Spaceflight each plate (Cockpit 15, Booster 20,
  Stasis 15, Launch 20) is a **city production project** (`ARK_<id>` queue kind)
  — one at a time per city, ANY order, different cities welding in parallel on
  their own shields. `pumpCityQueue` delivers: pays the plate, sets
  `gs.arkParts[civ]` bit + `gs.ark[civ]` sum; SCIENCE victory = all four bits
  AND the ledger gate (DebugKit neuter still works). The empire-wide beaker
  faucet (#375-3) is gone — science funds research like any other turn.
  (`CFG.arkScience` → `CFG.arkShields`.)
- AI (`aiTurn`) + witness (`planner.js`) mobilise identically: free yard takes
  the oldest missing plate, spread by (city.id + civ) rotation — replay-stable.
- UI: `I` panel gains YARD ◀ ▶ picker + per-plate ⚒ WELD buttons, `Q` welds the
  next missing plate, `DELIVERED AT <city>` toast, DebugKit `WELD NEXT PLATE`
  replaces `PUSH THE ARK`; `__civTest.queue(kind, cityId)` + probe `queue[].id`.
  (Fidelity, honestly: Apollo's staged component unlock stays all-four-open, costs
  are flat arcade numbers split from the old 70 — README says so.)
- civcheck 594→626 (§32 rewritten for launch-by-delivery, §36 rewritten: any
  order/exact cost/no spill/duplicate drop/per-realm bits/hash folds, NEW §40
  ARK YARDS: gating, capital default + city choice, parallel yards, engineer
  speed, full-yard deny, AI+witness mobilise, seed-9 replay, source pins).
  Mutant (`arkParts |= 1<<pi` → `|= 0`) reddened **19** gates; restored
  byte-clean. 626/626 x2 (again post-rebase).
- civplay 99: new §3h yards leg (mobilise, weld on live turns, panel tracks,
  toast) passes; best run **96/99** — only the pre-existing #2069 reds (title
  copy, attract black centre, stale Y-opens-VICTORY assertion). War-ledger
  lines flake run-to-run: advisory, rerun once (rule 3).
- lint:civ/mario/fps/ai + build green. Prod verified: `⚒ WELD`, `YARD`,
  `DELIVERED AT`, `arkShields` live in chunk `index-B1k8eYC6.js` at
  jalfern.com/retrogames/civilization-v; #2077 shipped-labelled + closed.
- Filed QA pass #2085 (yards UX playtest + retire the stale Y→I assertion —
  #2083 fixed the in-game/README copy, the old civplay expectation lags).

## The session's catches
- **Prod scans need user-facing literals:** DebugKit strings (`WELD NEXT PLATE`)
  are DEV-only and tree-shake out of prod; the honest markers are the shipped
  UI literals. Game chunks are hashed `index-*.js` — harvest `assets/*.js`
  literals from the entry bundle and scan all ~61 chunks (Node, per 240).
- **“No dev server” can mean IPv6-only:** vite was listening on `[::1]:5173`
  while the 127.0.0.1 probe failed; strictPort restart then died on a live
  port. `lsof` the listener's cwd first — it was mine — and use
  `CIV_URL=http://localhost:…`.
- **Hand-poked ledger must pay:** direct `gs.arkParts` pokes in tests without
  the matching `gs.ark` cost trip the `ark >= CFG.arkShields` victory gate and
  the win never fires (the §36 duplicate-drop test was the clue).
- **First-play card height is load-bearing:** lengthening HOW YOU WIN copied-in
  swallowed the centre drag at the 760×620 phone shape (drag check went red on a
  real regression hunt). Keep the card short; details live in README/panel.
- Q is weld-on-play only: civplay §8b consumes any key at attract, so Q as the
  game-start key never collides.

## Ladder trail
TARGET #2070 REFUSED honestly (`forge-claim.sh 2070 a` → “held by b”; slot b had
already merged it as `c224a4d`). No halt/steer/next; game-queue empty; QA MASTER
live (pid 19543) → no feedback borrow; flagship stage spent. Never-dry:
`weakestStage` → CIVILIZATION V score 5 (3 unowned README gaps + 2 QA feedbacks
#2075/#2069; labels flattened per 240); oldest unowned gap “The Ark parts are
one program, not city industry”. Filed #2077 with the why-weakest line, claimed
clean, shipped one stage. No jonq filed.
>>>>>>> ad75df6 (STATE: session 241 (slot a) — CivV Ark yards shipped (c0720bc, #2077); prod-scan literals + IPv6 dev-port catches)

## Open questions
- none (see waiting-jon issues).

## Next
<<<<<<< HEAD
- Slot b next session: re-run `weakestStage` — #2084 now names SOS, so its
  score CHANGED (feedback count moved; the Voice gap text was rewritten but
  still bullet #1). Recompute honestly, don't copy this line.
- `sosplay`'s "space starts the shift" flakes cold on any branch (reproduced
  on pristine main 1c043ed) — if it bites a real ship again, file it as QA.
- `viperpitcheck` still red-on-main, wired into NO CI job (flagged since 235)
  — re-file on a QA issue if nobody owns it.
- Dev servers at exit: slot b 5178 STOPPED; slot a's ports untouched. Worktrees:
  this session removes its merged `retrogames-forge-sos-radio` registration
  after the squash; session-235 candidates (ppm-portrait, ppm-bulletin,
  papers-photo) still stand.
=======
- #2085 (yards UX) + #2075 + #2069 are the QA lane's CivV jobs; builder lanes
  stay on game code.
- CivV's weakestStage score dropped (gap 0 closed + README counts updated;
  #2069/#2075 feedback still open) — next session recompute honestly, don't
  copy this line.
- `viperpitcheck` still red-on-main, wired into NO CI job (flagged since 235)
  — re-file on a QA issue if nobody owns it.
- Dev servers at exit: slot a 5173 STOPPED; slot b 5178, QA studio 5176 (not
  mine — untouched). Worktree `retrogames-forge-civ-ark-yards` can be removed
  (branch deleted by the squash); main checkout stays detached at origin/main.
>>>>>>> ad75df6 (STATE: session 241 (slot a) — CivV Ark yards shipped (c0720bc, #2077); prod-scan literals + IPv6 dev-port catches)
