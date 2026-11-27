# STATE — forge board snapshot (slot a, 2026-11-26 — SMART BOMBS SHIPPED `038a986`)

## This session (slot a)
- TARGET #3630 CLAIMED (warden assignment). Shipped **slice 1: smart bombs +
  center-battery speed** → PR #3656, merged `038a986`. Slice 2 (2P alternating)
  re-queued on #3630 (game-queue) with a full handoff comment.
- Rules (manual+Wikipedia pinned, README §SMART BOMBS): entry wave 7 (§6 "after
  the 6th wave", one behind the ferry; die never rolls below the gate → waves
  1..6 byte-identical). Smart bomb senses blasts (60px) + incoming ABMs (70px),
  sidesteps 12 ticks, bends its trail. Blind spot §7 hint 3: aim ≤32px of the
  core at launch = undetectable = killable — the lead window a 28px/tick center
  ABM threads, a 15px/tick outer never can. Hard rule: ONLY center fireballs
  kill (25 pts). Watch answers smart bombs center-only, blind-solutions-only,
  via arcade 3-button law (`cmd.silo` cross-sector reach).
- **Integration with QA #3654 (landed mid-session):** `startWave(gs,
  {noSmart:true})` skips the arrivals AND their DIE — QA's deep-doctrine A/B
  (60 raids waves 6-10) replays bit-exact; their numbers stand untouched
  (stalls 0, cityCost 0, 36/36 paid). Center-speed is a wave flag (`smartWave`),
  not a wave compare, so it rides the same opt-out.
- Proof at merged head: missilecmdcheck **83/0** (+23 §smart), `--mutant`
  **24/24 dead** (7 new), **mcsmartdrive 10/10** live Chrome (real mouse
  blind-kill pays 25; probe↔core pixels; speed split 28/15), mcsaucerdrive
  11/11, watchcheck missilecommand **322/322**, lints + build green.
- Filed **#3665** `QA — MISSILE COMMAND: smart-bomb polish` (phone legibility
  of the bend, sound identity vs ferry, center-speed visibly-faster, pass-
  through sell, attract ad for the threat).
- Lesson kept hot: an extra seeded roll inside `startWave` is NOT isolated by
  zeroing the counters alone — dice move the stream (two deep-doctrine
  game-overs before the noSmart opt-out).

## BOARD facts at close
- main GREEN at `038a986` (nightly success; my merge is tip).
- building: #3661 (PAC-MAN progression), #3664 (CENTIPEDE mushroom revival).
  building-qa: #3657, #3645 (QA MASTER owns).
- game-queue: **#3630** = MC slice 2 (2P alternating; README Honest gaps item 1
  says how: manual §6 games 18-34, CPU default via gunnerStep, desktop-keyboard
  2P, both scores shown).
- Rule-4 satisfied: game code merged (#3656).

## PLAYABLE on main right now
- MISSILE COMMAND — wave 7+ sends evasive smart bombs; only the fast center
  battery can down them, crosshair ON them beats the dodge:
  https://jalfern.com/retrogames/missilecommand
- Saucer ferries wave 6+ (#3629/#3638 polish). DK corners, CENTIPEDE ladder.

## Open questions (links only — #605)
- #3516 — Arkanoid art rung (AWAITING, Nov 28).
- #3335 — QA music-bus low-pass (lane:qa, AWAITING Nov 27).
- #3244, #2971, #1712 — unchanged since last STATE.
- No new jonq questions this session (doctrine calls were measured, not taste).

## Next claims (for whoever is free)
1. game-queue #3630 slice 2 — 2P alternating (issue body holds the spec;
   gunnerStep is the ready-made CPU for the default seat; watch seat needs a
   per-player handoff at wave turns).
2. MC honest gaps after that: bonus city every 10k (manual §5 — fully sourced:
   reserve, end-of-wave deploy, jingle) — cheapest strong stage; then
   field-of-fire arcs per battery (replaces the |dx| click law wholesale).
3. #3615 (DK finale polish) stays QA's first grab.

## Slot state at handoff
- Slot-a dev server :5173 stopped via `scripts/devstop.sh` at close.
- Worktree ~/Dev/retrogames-forge-mc-smartbomb DONE (#3656 merged; safe to
  prune — node_modules is a symlink into the main checkout). Older
  ~/Dev/retrogames-forge-mc-saucers also prune-safe (STATE handoff last round).
- Main checkout detached at origin/main; STATE.md ships via the docs PR this
  park accompanies, and parks with `statepark.mjs park a`.
- Slip this session: one `pkill -f "5173"` — WRONG tool (lane prompts carry the
  port; AGENTS.md forbids pattern kills). Session survived; use devstop.sh
  only, always.
