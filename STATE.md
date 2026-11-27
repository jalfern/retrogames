# STATE — forge board snapshot (slot b, 2026-11-27 — MC SAUCER POLISH SHIPPED `d6b7d36`)

## This session (slot b)
- TARGET #3638 (warden-assigned, QA polish pass on #3629's cruise saucers)
  CLAIMED first try → **SHIPPED via PR #3654 (`d6b7d36`)**. All five asks:
  - **Reserve rule** (the ask's heart): the watch buys the 125-point ferry only
    when the magazine left after the shot still covers every warhead the wave
    can still field (spawns left + cruise launches of ferries OTHER than the
    target; killing the target cancels its launches — the expert trade).
    §deep A/B sweep, 12 seeds × waves 6–10, bonus on vs off: the bonus never
    costs a city or a point; waves 6–8 pay every seed (36/36); 60/60 raids
    clear. At waves 9–10 the reserve never frees a shell — honest arithmetic,
    documented in README's honest gaps.
  - **Legibility**: cruise launches = orange 2px trails + warm tip (ICBM stays
    red); hull rx 18→21, dome r6→7, rim lights 4×3. Judged on real
    screenshots at device scale 1 AND pinned by pixel probes.
  - **Sound mix**: two-part warble at 0.16 (was buried 0.07), 180 Hz sawtooth
    cruise growl, 125 kill = deep thud + long noise + rising chirps (bigger
    than a warhead boom, the game's own hierarchy).
  - **Kill juice**: white flash 4 ticks + 6 seeded debris sparks; dice roll
    only on kills (impossible below wave 6) and juice never joins the
    wave-clear law — both pinned; waves 1..5 byte pins unchanged.
  - **Attract ad**: `attractFerry` crosses a ferry every 360 ticks
    (side/altitude alternate); the attract pilot leads it. Scripted by tick,
    NOT dice (seed-independence is a check) — determinism story intact.
- Proof: missilecmdcheck **60/0** (+11), `--mutant` **17/17 dead** (5 new),
  **mcsaucerdrive 11/11** (extended: attract-ad paint under DIM needs its own
  dim-shifted pixel family; a 1px trail at scale ~0.71 is AA blend — orange
  needed lineWidth 2; live 125 kill with juice sighting), watchcheck
  missilecommand **322/322**. eslint + lint:mario/fps/ai + build green.
- Prod verified (bundle hash carries the pass); #3638 closed as completed.

## BOARD facts at close
- main GREEN at `9d0f4ce` (my `d6b7d36` + one later merge). building:
  **#3630** (MC smart-bomb evasion + 2P — the mc-smartbomb lane, was at its
  merge). building-qa: #3649 (KOI portrait). game-queue: EMPTY — a free
  builder lands on the feedback borrow or the flagship/idle-kick rung (#1571).
- Rule-4 satisfied: game code merged as #3654.

## PLAYABLE on main right now
- MISSILE COMMAND — shoot the wave-6 satellite ferry: orange trails, crunch
  kill, and it crosses the ATTRACT screen as an ad:
  https://jalfern.com/retrogames/missilecommand
- DONKEY KONG corner-pair ladders. CENTIPEDE arcade sound grammar.

## Open questions (links only — #605)
- #3335 — QA music-bus low-pass (AWAITING, deadline Nov 27).
- #3516 — Arkanoid art rung (AWAITING, Nov 28).
- #3244 — (AWAITING, Nov 27). #2971 — contra polish. #1712 — PLAICRAFT S2.
- No new jonq questions this session (all calls measured, none of taste).

## Next claims (for whoever is free)
1. If #3630 merges, its QA follow-up files itself; otherwise game-queue is
   empty — run the ladder (feedback borrow → flagship → idle-kick).
2. Remaining MC honest gaps after #3630: bonus city every 10,000 (manual §5,
   fully sourced), field-of-fire arcs per battery.
3. Attract pilot now leads ferries with a 0.03 trigger — if QA wants the ad
   to hit the ferry reliably on screen, that knob is the dial.

## Slot state at handoff
- Slot-b dev server :5178 stopped via `scripts/devstop.sh` at close.
- Worktree ~/Dev/retrogames-forge-mc-saucer-polish DONE (#3654 merged; safe
  to prune — node_modules there is a symlink into the main checkout).
- This STATE ships via the docs PR; parked with `statepark.mjs park b`.
