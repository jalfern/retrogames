# STATE — session 305 (2026-11-16, slot a)

## Playable now / what shipped
- **BOULDER DASH wall momentum (#2468 → PR #2471, merge `60ecb2b`).**
  LIVE at jalfern.com/retrogames/boulder-dash (verified: "SLIDERS LEDGE" in
  `assets/index-BlREe5nI.js` on www ~30 min after merge — proxy cache).
  Cave 10 **SLIDERS LEDGE** in production:
  - **The combo:** a wall shoved off a ledge KEEPS SLIDING along the floor it
    lands on until something blocks it — the original's most-loved squash.
    Shove law at spawn only (boulders stay dead-weight; a boulder that later
    becomes a falling wall carries no arm); straight-down falls teach no
    direction (no drift); doused, crushed or flattening kills the arm.
  - **Byte-safe opt-in:** `momentum:` cave flag → `CFG.wallMomentum`; when off
    the sim takes the exact pre-#2468 path (pins: old caves' stateHash identical
    across both flag values). Same pattern as #2444's `multiHead`.
  - **Load-bearing cave:** the exit bolt sits at corridor end; without momentum
    the player's only wall parks in the mouth (the #1571 complaint verbatim)
    and the planner STRANDS; with it, one shove from 2 tiles clears the bolt —
    the proof is the delta, not a demo. Gems live in side pockets (see catches).
- **#1711 PLAICRAFT S1 — collision, resolved fairly, still open (slot b).**
  I claimed #1711 step 1b (clap-coach re-arm after the #2462 refactor); slot
  b's resumed session pushed the same fix 9 min later and its PR #2466 merged
  first (`12a7fe7`). I adopted + tested it (store graded: nothing new to
  grade), posted the handoff on #1711 releasing steps 2–4 to b, and moved to
  the ladder myself. Acceptance stays open: Jon's phone takes on the in-app
  store (`DEV_PORT=<own> npm run plaicraft:grade` grades and posts itself).

## Gates (all green, #2471)
- dashcheck **270/270** (was 241): +29 momentum pins — spawn-law truth table
  (8 dirs × ground/void), armed→live carry-over, douse/crush/flatten death,
  blocked dies (wall + player both), drift guard 60k ticks, legacy byte-parity.
- mutants **286/286** (was 270 + 16): the new `wallMomentum` mutant caught.
- dashplay **65/65** live: SLIDERS LEDGE playable (0 deaths, 0 stuck), slide
  with NO actuator held (the combo fires on its own), old-cave regression,
  slide-sfx tick + mom probe.
- eslint + lint:mario/fps/ai + build + attractcheck (694) green; `static`
  green on CI; Vercel production deploy Ready (`retrogames-b2eepef78`).

## BOARD at exit
- game-queue / next / steer / waiting-jon: empty. building: #1711 (slot b,
  big-build), #2470 (HOMEBODY action-queue polish, lane:games — taken).
- #2468 shipped+closed this session.
- building-qa (QA's own): #2449, #2460. Ladder refused them to builder
  lanes while QA sessions are live — expected.
- amoeba honesty: multi-head + drift shipped; the SPLIT law stays un-specced
  until originals are read — inverting the drift is invention, not the game.

## Next (slot a or b, in order)
1. Fresh ladder → flagship stage → weakestStage (never dry). After #2468 the
   BoulderDash shelf is 4 gaps, all check-only or original-blocked — expect
   it to sink.
2. #1711 steps 2–4 are b's (handoff comment on the issue). If a fresh
   gauntlet take lands in the store, grade it.
3. Session 304's harness-doc fix still open (FORGE step 8: index-hash polling
   lies for lazy-chunk changes — this session re-confirmed the OTHER half:
   BoulderDash ships IN the index chunk, so the hash DOES move; per-game
   verify = grep the chunk the live index names, then check the alias).

## The session's catches
- **Claims are advisory; branches are truth.** Slot b silently resumed #1711
  from its own stale claim and merged #2466 while mine was mid-review. Before
  claiming, `gh pr list --head <branch>` + check if a remote branch already
  exists; if another lane beat you, adopt, credit, release — don't duplicate.
- **A gem is a DOOR in the planner, not a corridor.** A gem mid-corridor made
  the BFS call the exit unreachable (stranded); and gem-at-tick-1 fell
  straight into a pit the "gem not above hole" invariant missed because the
  gem spawns where the gem is. Gems go in dead-end pockets, floor below,
  no void below the pocket.
- **`npm ci --dry-run` lies about `.bin`.** Main checkout's node_modules/.bin
  was empty (playwright "Executable doesn't exist"). Fix: `cp -Rc
  <working-worktree>/node_modules .` — a symlinked .node_modules breaks
  `npm run`; a real copy works.
- **Live assertions need the world's timing, not the player's.** dashplay's
  exit-walk check failed 3× at 3500 ms — a 20-tick boulder slide (333 ms)
  lands the crush on the player's path; 6000 ms is the right slack for a
  scripted 2 m run.
- **Vercel deploy URLs are SSO-walled** — prod verification = jalfern.com
  only, and it proxies with a ~30 min cache; a NOT_FOUND for a new content
  hash means the alias hasn't flipped yet, not a bad deploy.
