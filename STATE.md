# STATE — forge board snapshot (slot a, 2026-11-26 — DEFENDER'S PLANET WAKES UP, #3456 stage 2)

## This session — a fidelity bug bigger than the arc it served
- Warden TARGET #3456 claimed (resume: stage 1 landed mid-session as 787b1b4 via
  #3465 — merged 05:35Z while I tuned; worktree cleanup detached it, repaired,
  branch continued). Slot-a's own report from last session read from
  /tmp/forge/STATE.a.parked.md (statepark verified).
- MAIN CHECKOUT CORPSE: the #3453 wrap-seam work (defendercheck+sim+README) sat
  uncommitted in ~/Dev/retrogames at session start (QA-mini's, mtimes fresh).
  Named on #3453 with the new consequence: `git checkout --detach origin/main`
  now REFUSES there (git protecting it). Slot a committed/stashed/reverted
  nothing. QA landed it as c7138a2 (#3466) during this session — corpse resolved
  by its owner.
- **THE FIND:** `hunt`-state mutants NEVER integrated position (movement block is
  lander-only). Mutants were STATUES since the port while the README swore
  "chases you". Fixed (#3472). Every seasons-long "mutant kill" was flying into a
  fixture; WITNESS ever measured a half-dead planet.

## Stage 2 shipped on the branch (PR #3472, Part of #3456)
- Route: sink+terrain-rise climb margins, canyon turn, U/D interlock + pulsed
  descents, valley delivery veto, hover-kill, fresh-facing gate (haulers EXEMPT —
  rescue law outranks the duel, law-test pins it), turn-and-brace vs astern
  hunters, crossfire bail (guns independent of target), cargo-lift,
  hauler-outranks-brace.
- Honest vs REAL hunters: survived 19+16/20 (baseline 0+1), banks 9650/5950,
  waves 20+20, catches 49+47, delivers 37+36. Terrain deaths 48+49 -> 2+4.
  diedHauling 12+11 = the NEXT gap (stage 3 brief).
- WITNESS re-pinned per issue item 3: banks >=6000/4000, waves >=15, rescues
  >=25/20, mortality tripwire FLIPPED overs>=15 -> overs<=5 && livesLost>=20
  (survival progress breaks the old form by design; zero deaths stays the bug).
  Copy claim "patrol survives" stays RETIRED until both sets 20/20 honestly.
- Gates: defendercheck 128/0, lint mario/fps/ai, build, defenderplay 17/17
  (one flake: dead-state bomb suppression timing — rerun clean once per law).

## PLAYABLE on main right now
- `/retrogames/defender` — stage 1 watchmeasure lands after #3465; mutants begin
  honestly hunting the moment #3472 merges. Plus prior shelf: pinball chain-pin,
  skyward spectate, asteroid clamp, tidal-rush, ssx, comet-drift, marble pair,
  galaga bee, mario-kart, ice-climber, pacman, mario, minesweeper/garden-guard/
  homebody, TIDY BOT, STARRY NIGHT, TOP SOLDIERS, DOUBLE DRAGON, RACCOON HEIST,
  spy-hunter, iron keep, missile, pucks, mines, zork, ultima, king's quest,
  Joust, Q*bert, adventure, forge board.

## Board watch (facts)
- #3456 OPEN after #3472 (multistage, Part of): stage 3 = diedHauling (elevators
  get hunted; 12+11) + the last-hunter endgame + survival copy claim when 20/20.
  Post that brief on the issue at merge verify.
- Slot b live this session (omlxtapb); QA-mini/QA-studio live; #3453 shipped by
  its owner mid-session. My :5173 dev server stopped at close via devstop.sh.
- WITNESS pins are DETERMINISTIC floors, now much higher — any future route
  regression shows in red with names, not vibes.

## Open questions (links only — #605)
- #3335 — QA: music-bus low-pass (AWAITING, qa lane — not mine).
- #3054 — native TestFlight recorder (AWAITING).
- #1712 — PLAICRAFT S2 versioned dataset (waiting-jon).
- No new jonq questions this session (statue fix + re-pin were measurement, not
  taste; the arc continues on the board).

## Slot state at handoff
- #3472 MERGED (79482be) — prod verified (deployed bundle embeds the merge sha;
  Vercel success on 79482be). #3456 relabeled `game-queue` with the stage 3
  brief posted; survival copy claim stays retired until 20 + 20 honest.
- STATE ships via docs/state PR (game merged this session); lane worktree detached
  clean at origin/main; slot-a dev :5173 stopped via scripts/devstop.sh.
- #1430 note: slot b's step-1 reverted my STATE.md in the shared main checkout
  mid-closeout; the slot-scoped park is what saved the report — its first-run
  hazard documented, this is the shape it protects against.
