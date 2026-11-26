# STATE — forge board snapshot (slot b, 2026-11-26 — ROGUE learns ranged combat)

## This session — TARGET taken by the other lane, never-dry found the shelf's next job
- TARGET #3482 was ALREADY done while I was booting: the previous slot-b session
  died after creating PR #3487 but before merging; slot a resumed it 08:54Z,
  merged 847311c 09:00Z, prod-verified and CLOSED #3482 (shipped) by 09:06Z.
  My TARGET claim answered "already yours: resume it" (stale b-liveness) — there
  was nothing to resume; I removed the misclaim `building` label my `--dry`
  test fired on merged PR #3490 (forge-claim has NO --dry flag — never pass one)
  and retracted on the issue. Slot a verified + filed the #3482 QA pass (#3489).
- Normal ladder: steer 0 · `next` #1712 waiting-jon (skipped) · game-queue
  #3456 REFUSED (held by live slot a, 28-min freshness) · feedback borrow
  BLOCKED (QA MASTER mini live) · flagship stage spent → never-dry kick said
  ADVENTURE, but every ADVENTURE gap is #3489-owned (paraphrase defeats the
  ownership matcher — #2910 + the parseGaps phantom item 5 of #3489). Walked
  the scoreboard myself: next unowned title = **ROGUE, 6 unowned gaps**.
- **SHIPPED (#3491 → PR #3495, squash 89770d6): ROGUE ranged combat.** Staves `/`
  (4 types,
  3–9 charges, crumble-at-zero) + counted arrow quivers on the original's
  single weapon/missile glyph `)` (refuses the `w` sword hand). `f` → missile
  menu → direction key fires: one arrow per throw, miss leaves it on the flight
  line to SALVAGE, quivers stack. Shots stop at rock/walls/closed doors, pass
  hidden doors (the creatures' 1980 law), stop at first body; d20 with
  steady-hand +2 replacing strength; xp via shared `grantExp`; all dice on the
  state-carried `randState` (interleaved replays byte-identical). Rings `=`,
  the staff-name cipher and the exact cart tables stay honestly on the gap list.
- Proof: roguecheck **102/102** (+26 ranged gates) · 4 mutants all die
  (through-body 3, charge 2, salvage-drop 4, wieldable 1) · NEW
  `npm run roguedrive` **12/12** real Chrome real keys (pinned seed 115:
  walk onto quiver, `,` up 8, f→a→l fires east, quiver 7, salvage back to 8,
  help teaches f, zero page errors) · watchcheck(rogue) 318/318 live ·
  feedbackcheck 291/291 · lint rogue/mario/fps/ai · build green.

## BOARD notes
- game-queue: #3456 stays slot a's (stage 4 hyperspace brief posted).
- ADVENTURE idle-kick is a PARAPHRASE phantom until #3489 item 5 (parseGaps
  `### Restored` counting) is fixed — expect the kick to name ADVENTURE until
  then; the honest next-weakest after ROGUE gaps is ROGUE again (5 left:
  flee/energy, traps, Amulet win, class rolls, lamp) or PONG/SPACE INVADERS.
- #3490 retraction comment documents the no-`--dry` lesson (#1258 hygiene).

## PLAYABLE on main right now
- `/retrogames/rogue` — NEW: fight at range — f throws salvageable arrows,
  zaps charged staves. `/retrogames/adventure` — Blue Castle + duplicate
  chalice. `/retrogames/defender` — stage-3 hunters. Plus prior shelf:
  grind-city waiting line, pinball chain-pin + flanks + smith, skyward rooms,
  tidal-rush, ssx, comet-drift pair, marble pair, galaga bee, mario-kart,
  ice-climber, pacman, mario, minesweeper/garden-guard/homebody, TIDY BOT,
  STARRY NIGHT, TOP SOLDIERS, DOUBLE DRAGON, RACCOON HEIST, spy-hunter,
  iron keep, missile, pucks, mines, zork, ultima, king's quest, Joust,
  Q*bert, forge board.

## Open questions (links only — #605)
- #3335 — QA: music-bus low-pass in AudioController (AWAITING, qa lane,
  deadline Nov 27 — not mine, do not pre-empt).
- #3054 — native TestFlight ports have no recorder/upload (AWAITING).
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).
- No new jonq questions this session (never-dry pick, no taste calls).

## Slot state at handoff
- Slot-b dev server (:5178) still up when the merge lands — stop it with
  `scripts/devstop.sh` at close; do not pattern-kill.
- Game merged ⇒ STATE ships via its own docs/state PR + `statepark.mjs park b`.
- Worktree ~/Dev/retrogames-forge-rogue-ranged removed after the docs merge;
  main checkout stays detached at origin/main, never a checkout of main.
- Rule-4: slot b SHIPPED game code this session (#3495). Time-box ~1h40m used.
