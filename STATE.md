# STATE — session 41 (2026-10-28)

## Shipped this session
**TIDY BOT** (#1143, PR #1207, squash 15708df) — original household-chores robot, live
at https://jalfern.com/retrogames/tidy-bot. 320×240 dollhouse kitchen, 3 levels, all
art/audio synthesized. Containers really open: dishwasher rack slides out and **blocks the
floor**; fridge door swings down; open cavities show racks holding every stowed item, all
retrievable. Order matters: closed washer refuses cargo, empty washer refuses to start,
food-in-dishwasher is a wrong stow (−20). A = grab/place/open/close, B = throw/retrieve/
start. Gentle place pays tidy points; throws jam/spill/shatter but smashed dishes still
clear — no level bricks. Seeded autopilot drives attract + win proof (all 3 levels, 100%
tidy, seed-independent). `visibility: 'private'` (Jon promotes when he wants).

## Hard-won facts
- **The 26px HUD strip is real estate**: the fridge (top wall, y8) and both label tags were
  eaten by it; anything drawn at y<26 is invisible. Appliances now sit at y30+, tags below
  the appliance's max door extent (y+c.h+c.doorLen+2), chore sheet parked bottom-right
  corner where no grab route runs.
- **A checklist row that starts satisfied reads as a bug**: CLOSE ALL ticked before anything
  opened. Fixed with an `opened:{dw,fr}` latch per level — the row only ticks once each
  needed container has actually opened and everything is shut again (pure HUD truth, not a
  win condition).
- **`scripts/shot.mjs` presses ArrowRight by default** — "attract" screenshots were mid-play.
  Use `--no-start` to photograph attract/menus.
- ** jalfern 308→www applies to /assets too** — verifying prod bundles needs `curl -sL`,
  otherwise grep finds nothing in a 15-byte redirect body.
- Plant blocker shift (294→226, x) freed the chore-sheet corner; blockers moved with their
  art (PLANTS is sim-side).

## Harness
`npm run tidycheck` = 35 node + 9 browser gates (44): determinism (seed+pads = hash), win
on every seed, slack rule (one-fewer of every supply still winnable), STAND CLEAR door
refusal, pinch-escape, glass/throw economy; mutants `door/glass/run/tidy` each turn a named
gate red. contractcheck tidy-bot 15/15 incl. snapshot/restore round-trip (`opened` latched
through both).

## Next goal
`game-queue` is **empty** (1142, 1143 both shipped+closed). Next session follows FORGE
step-2 fallback: no idle studio — borrow ONE open `feedback` issue as a QA-style fix,
unless Jon has queued a new GAME: issue by then (he also still owes nothing on jonq).

## Environment notes
- Lane port used: 5175 (dev server stopped after shipping). Nightly bot 5199.
- Worktree `~/Dev/retrogames-forge-tidy-bot` is on the deleted remote branch's commits,
  npm ci'd — reset it (`fetch + detach origin/main`) and reuse for the next games claim.
- `qa-1138` worktree still holds local `main`: `gh pr merge` still MERGES but errors on the
  branch switch and skips remote-branch delete — follow with
  `git push origin --delete <branch> && git fetch && git checkout --detach origin/main`
  in the lane worktree (done this session; main checkout is at 15708df detached).

## Open questions for Jon
(none filed this session)

## Carry-over
- Rule 4: game code shipped (#1143) — streak reset, healthy.
- QA lane owns #1179/#1168/#1135/#1190/#1195; builder lanes stay out (Jon 2026-10-19).
