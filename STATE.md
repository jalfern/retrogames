# STATE — forge board snapshot (slot a, 2026-11-27 — LEMMINGS-LITE water SHIPPED `109a6ec`)

## This session (slot a) — the pond lands
- **Shipped the warden's never-dry stage**: POLISH #3828 (filed+claimed this
  session after a dry ladder: no halt/steer, `next`=#1712 waiting-jon, queue
  empty, feedback #3244/#2971 waiting-jon, QA MASTER live → no borrow) →
  PR #3831, squash `109a6ec`, prod-verified (`Lemmings-D8cpbOQx.js` carries
  `drown`).
- **Water (#3828):** new WATER tile in sim.js — not ground; chest-or-feet in
  water drowns from ANY height (drown event beats splat). Dig stops at the
  surface, blasts leave ponds standing (dirt stays the only destructible).
  THE SPIRE gets a west-foot pond: the old free west-pacing of failed
  climbers is now a drain; spawn→spire route untouched. Renderer: two-tone
  water with clock-shifted surface band, cyan splash ring + foam at drown,
  corpses sink, soft splash+oooh synth; one attract line teaches it.
- **Proof:** lemcheck 129/129 (+14 §water pins incl. determinism over the new
  board); manual mutant (drown guard off) → 4 red → restored. lemplay 40/40
  real Chrome (+5: pond pixels blue 0.97, FF-held unmanaged board drowns 8/8,
  honest ledger, zero page errors). eslint + mario/fps/ai + build green.
- First README for the title: engine notes + honest gaps (blocker-wake, 3-tile
  fatal fall, OH-NO!, static water) → future idle-kick sees them parseGaps-
  honestly (4 open gaps verified parsed).

## Harness facts paid this session (keep so lanes stop re-paying)
- **Never `git checkout --` a file to undo a manual mutation when the file
  carries uncommitted work** — it ate the whole WATER sim.js once this session;
  rebuilt from context. Commit checkpoints FIRST (the rule already says so),
  restore mutants with the inverse edit.
- The warden's `KICK LEMMINGS-LITE -1 weak` at 17:12 was phantom-scored: open
  QA #3825 (POLARITY, feedback+building-qa) named "the Lemmings/LodeRunner
  convention" in its BODY — word-boundary (#3788) can't stop a whole-word
  *comparison* mention; #3825 shipped minutes later and idle-kick says NONE
  again. Same class as #3074/#3788; a body-mention still manufactures ±1 weak
  scores. Never-dry stayed honest here because the pick had real unfiled depth
  (no README, no water) — treat `-1 weak` as "look at this title", not as
  "a gap exists".
- Lemmings prod-check: game code lives in the lazy chunk — poll
  `Lemmings-*.js`, not `index-*.js`, for drown/WATER.
- Pond pixel proof: getImageData over the exact tile box (cols 0-3 rows 23-24
  @TS8) → blue fraction 0.97 through the real paint path.

## BOARD facts at close
- main tip `109a6ec` (this merge). Nightly green at pre-merge main-ok. Rule-4
  streak 0 (game code again and again).
- building/building-qa after close: NONE open. game-queue: empty (this stage
  consumed the only item). halt/steer: 0. feedback open: #3244, #2971 (both
  waiting-jon).
- jonq: #3791 AWAITING (deadline 11-29), #3516 AWAITING (deadline 11-28
  ~12:35Z — the sweep takes "done" then). No new questions this session.
- LEMMINGS-LITE now has 4 parsed open README gaps — idle-kick may legitimately
  KICK it again; #3828 owns none of them anymore.

## PLAYABLE on main right now
- LEMMINGS-LITE with water — stragglers drown in THE SPIRE pond:
  https://jalfern.com/retrogames/lemmings
- BUBBLE BOBBLE attract hint, DK fire oil, MINESWEEPER attract marquee,
  THE BARD'S TALE, PINBALL, SMASH-TV, KOI demo.

## Open questions (links only — #605)
- #3791 (dry shelf flagship title — AWAITING), #3516 (Arkanoid rung —
  AWAITING, defaults tomorrow).

## Next claims (for whoever is free)
1. LEMMINGS-LITE blocker-wake (oldest parsed gap) — but it needs a re-solve
   with levels, size it before claiming; OH-NO! cry is the cheap next rung.
2. #3440 closable by the platform lane (evidence posted earlier).
3. Expect #3516 to default at its deadline; nothing to do but let the sweep.

## Slot state at handoff
- :5173 to be stopped with `scripts/devstop.sh` at exit; other lanes' ports
  untouched all session.
- Worktree `retrogames-forge-lem-water` cleaned after STATE lands; node_modules
  was a symlink (dies with it).
- STATE commit allowed (game merged): lands via the docs PR opened with this
  report; merge only via `scripts/forge-merge.sh`.
