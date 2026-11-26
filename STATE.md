# STATE — forge board snapshot (slot a, 2026-11-26 — PONG gets the cabinet's switches)

## This session — TARGET refused, never-dry walked past two phantoms, shipped
- TARGET #3489 (ADVENTURE polish) REFUSED at claim — slot b held it fresh (8 min).
  Normal ladder: steer 0 · `next` #1712 waiting-jon (skipped) · game-queue empty ·
  feedback borrow BLOCKED (QA mini 5001 + QA studio 44139 live) · flagship stage
  spent → never-dry rung.
- `idle-kick` said `KICK PONG 0 weak`, then on re-run `KICK DEFENDER 0 weak` —
  DEFENDER's index 0 is the #3456 stage-4 NARRATIVE bullet whose open part is
  owned by QA #3497 (gaps 1–5: closed-arc history / "that IS the arcade law"
  by-design claims). Walked the scoreboard per the ADVENTURE-phantom precedent:
  honest weakest = **PONG, 5 unowned README gaps** (tie with ROGUE, older in
  registry order). Filed **#3502** with the why-weakest line, claimed, built.
- **SHIPPED (#3502 → PR #3504 → `5720b49`): PONG cabinet AUTO/RANGE switches.**
  Attract `SELECT GAME`: LEFT/RIGHT cycles EASY · NORMAL · HARD · 2P; any other
  key/tap starts with the pick; `?diff=N` pins. EASY = Easy RANGE (tracker 2.2,
  ±16 zone, **5.5 horizontal ceiling**); HARD = 4.5, ±5; 2P = no CPU, W/S drives
  the right paddle at PAD_SPEED (keyboard option; CPU stays default, no second
  pad). **NORMAL bit-identical** — pongcheck traces a 3000-tick match vs the
  pre-#3502 replay exactly, so the seedpin + 39/40 driver floor stand untouched.
- Proof: pongcheck **66/66** (+23 tier gates; measured & pinned — driver EASY
  **40/40** ceiling engages, NORMAL **39/40** seed 25 stands, HARD **38/40**
  seeds 13+25 fall; ordering law + determinism + 2P inert/drives) · mutants
  **13/13** (+4 tier: dead-select, dead-ceiling, AUTO-ignores-HUMAN, unplugged
  W) + **5/5** attract · NEW `npm run pongdrive` **18/18** real Chrome real keys
  (pixel-vs-logic paddle Δ0.3px, honest quit/restart, ?diff=4 legs, zero page
  errors) · watchcheck(pong) **318/318** · eslint + lint:pong/mario/fps/ai +
  build green · prod verified: `index-Bv_86iZy.js` carries `SELECT GAME`
  (jalfern asset paths REDIRECT — fetch with `curl -L`, a bare GET is 15 bytes).

## BOARD facts at close
- game-queue = 0 · building = #3489 (slot b; roam law BUILT on
  `forge/adventure-polish`, **draft WIP PR #3505** — resume via step 1b; their
  parked STATE (statepark 11:25Z) says one guide gap keeps it WIP) ·
  building-qa = #3497 · feedback = #3506 (new PONG polish pass: 2P quit-card
  honesty, tap-to-select, sound, bitmap numerals; by-design gaps quoted
  VERBATIM so the ownership matcher actually owns them) + #3497 + #3244 + #2971.
- Rule-4: slot a SHIPPED game code this session (#3504). No STALLED.
- #3502 closed (auto by merge) + `shipped` + live-URL comment.
- The idle-kick phantom class is still live (README narrative bullets count as
  gaps): ADVENTURE (#3489 item 5 owns the parseGaps fix) — DEFENDER now shows
  the same shape since the #3456 arc rewrote its Honest gaps with stage notes.

## PLAYABLE on main right now
- `/retrogames/pong` — NEW: pick your table — EASY (beginner ceiling), HARD,
  or 2P on arrows+W/S; NORMAL is the old table bit-for-bit.
- `/retrogames/defender` — stage-4 patrol + audio kit fanfare (#3498).
- `/retrogames/rogue` — staves + salvageable arrows at range.
- Plus prior shelf: adventure (19 rooms), grind-city waiting line, pinball
  chain-pin + flanks + smith, skyward rooms, tidal-rush, ssx, comet-drift
  pair, marble pair, galaga bee, mario-kart, ice-climber, pacman, mario,
  minesweeper/garden-guard/homebody, TIDY BOT, STARRY NIGHT, TOP SOLDIERS,
  DOUBLE DRAGON, RACCOON HEIST, spy-hunter, iron keep, missile, pucks, mines,
  zork, ultima, king's quest, Joust, Q*bert, forge board.

## Open questions (links only — #605)
- #3335 — QA: music-bus low-pass in AudioController (AWAITING, qa lane,
  deadline Nov 27; gates PINBALL tilt-muffle — do NOT implement until answer).
- #3054 — native TestFlight ports have no recorder/upload (AWAITING).
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).
- No new jonq questions this session (never-dry pick; no taste calls).

## Slot state at handoff
- Slot-a dev server :5173 stopped with scripts/devstop.sh at close.
- Worktree ~/Dev/retrogames-forge-pong-tiers pruned after this docs PR merges;
  main checkout stays detached at origin/main, never a checkout of main.
- Slot b parked STATE.md in the main checkout at 11:25Z (no merge in their
  session) — next step-1 reader parks it (already at STATE.parked.md; b's own
  park path carries the copy).

## Next claims (for whoever is free)
1. **Resume #3489 corpse first (step 1b)**: pushed `forge/adventure-polish`,
   draft PR #3505 — finish the guide gap its WIP note names, then merge.
2. Never-dry after this session: PONG's remaining README gaps are all
   #3506-owned (by-design ones quoted verbatim) → expect `KICK ROGUE … weak`
   (5 unowned: flee/energy, traps, Amulet win, class rolls, lamp) or
   PONG-free SPACE INVADERS (4). Run `node scripts/idle-kick.mjs` fresh and
   sanity-check the named index against the README before filing.
