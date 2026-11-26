# STATE — Forge status (slot a)

## Shift report — 26 Nov 2026, 03:15Z (slot a, ~1.2 h)
**Goal:** ADVENTURE never-dry stage (#3441, self-filed). **Shipped:** PR #3444
(merge `f782759`) — seam law: a living, jaw-open dragon aligned on a doorway
follows the dot through a room warp at the mirror entry; bite/sword-turn are
judged inside the new room; multi-dragon rooms now reachable. **Closed:** #3441.
Production verified (seam law visible in `index-BlipdWRI.js`).

**TARGET note:** warden pointed #3432 at slot a — REFUSED (slot b held and had
already shipped it: PR #3437 merged 02:04Z, issue auto-closed, `building` label
stranded). Normal ladder then found nothing claimable (queue empty, #1712 is
waiting-jon, live QA session owns the feedback borrow) and the flagship stage is
spent — but the NEVER-DRY pick needed care, see the measurement bug below.

### The measurement find (#3440) — read this before trusting idle-kick
`scripts/lib/idle.mjs:parseRegistry` matches only brace-imports and `lazy()` —
every statically-imported game (all of `games.js:1-19`) is invisible: 21 titles off
the shelf, incl. ADVENTURE (15 unowned gaps), Rogue/Defender (6 each), Frogger.
Idle-kick's `KICK PINBALL 0 weak` was a phantom (gap 0 declines action against
open decision #3335, whose jonq default is keep-level-only — that kick would have
burned this session). Corrected pick: ADVENTURE at 15. Evidence posted on #2910;
fix (regex + re-calibration) owned by **#3440** (lane:platform). Until #3440
lands, derive weakestStage by hand (corrected shelf: Adventure 15 > Rogue/Defender
6 > DonkeyKong/MissileCommand/Centipede/Asteroids/Pong 4–5 > visible-shelf 0–1).

### What landed (#3441)
- `sim.js`: seam law in `tryTransition` (all five branches incl. gate→foyer);
  alignment = shared gap column/row ± `DRAGON_FOLLOW_SLACK`; passability implied
  by the dot's own crossing (barriers open for the run); arithmetic only, no dice.
- `adventurecheck` 196/196 (+10 gates: real-walk heels-bite repro, no-dice hash
  pair, misalignment/jaw-shut stay, left-seam mirror, sword-turn slay, foyer
  follow) + 3 new mutants — all 52 mutants die. Skilled-route playtest still 98%.
- Real-Chrome drive (`shot.mjs` ?seed=4241, real keys): start→run→walk, drawn dot
  matches input position, zero page/console errors.

### Board hygiene done this shift (tails left by earlier dead sessions)
- **#3195 verified-fixed + closed** (GrindCity dvh landed in #3193; nobody said
  Closes; dvhcheck 7/7, quarantine already empty).
- **#3432** prod-verified (`Pinball-fm41zBdE.js` carries rampL/kbL/KICKBACK),
  URL commented, `building`→`shipped`.
- 8b polish passes finally filed: **#3446 PINBALL**, **#3447 SKYWARD** (+ #3441's
  own follow-ups folded into #3447).

### Board (03:15Z)
- `game-queue`: empty. `next`: #1712 (waiting-jon). `building`: none.
  `building-qa`: #3419, #3436. `feedback`: #2971/#3244 (waiting-jon), #3446,
  #3447, plus QA-held above. New platform items: **#3440** (idle-kick blind shelf),
  #2910 updated with tonight's three phantom classes.
- ADVENTURE still carries 14 unowned honest gaps → the corrected weak pick stays
  ADVENTURE next dry kick (gap 1: the duplicated chalice / Blue Castle).

### Known / residue
- `adventure-playtest` route failure mode "no bridge" (2%) pre-exists this change.
- Slot b's sessions keep dying after merge before post-steps (#3432 labels, 8b) —
  the auto-close via `Closes #n` helped this time; consider warden sweep for
  closed-but-`building` issues (#3013 family).

## Open questions (none filed this session)
- #3335 (lane:qa, AWAITING, due 27 Nov) gates PINBALL's tilt-muffle — not mine;
  do NOT implement against it until answered/defaulted.
