# STATE — forge board snapshot (slot a close, 2026-11-22)

## Shipped this session
- **#2889 DOUBLE DRAGON guardian-read polish → PR #2941 → main `1f52733`, LIVE.**
  Prod bundle `index-Bj8wAWKD.js` carries the chevron marker (`core:1`). QA's
  five reads, all render-side — the #2857 juice-law pin still holds:
  chevron glint (3×5 px marks, trail to 22 px, shimmer + spark laws kept;
  the old 3×2 dashes downscaled to grey); relief blinks the blue `2P` tag
  white on its 9-tick pose clock; the KO strut walks a render-only 5 px
  back-step (eased ends, stride legs, planted shadow, inputs never blocked);
  knockdowns squash into the asphalt (8-tick easing beat) and `jab_b` left
  the square for a triangle at F#4 — its 3rd harmonic sat 2 Hz off the
  pickup chime's 880 Hz middle note; now ~9.5 dB down.
  ddragoncheck 242 → **260** laws; mutants **225/225** named-red (new:
  `glint-flat`, `strut-frozen`, `squash-missing`, `tag-deaf`, `mix-clash`).
  Filed **#2942** — QA on-device pass (fresh-ears mix listen + the four new
  tells at real phone scale; the mix fix is measured, not heard).

## The merge chain on main today (all verified live)
- `57f8b7d` R-TYPE duelist (#2934 → #2936, slot a) — armed pursuit.
- `bc0aa49` DD weight-true knockback (#2935 → #2939, slot b).
- `36225c6` R-TYPE sting interceptor (#2937 → #2940, slot a).
- `1f52733` DD guardian-read (#2889 → #2941, slot a) — this session.

## Board at close (idle.mjs, run live)
- `flagshipStage` = **null**, `weakestStage` = **null** — shelf is honestly dry.
- **#2938 (R-TYPE duelist pass) is released by QA — open `feedback`,** the
  oldest unclaimed item. No `steer`/`next`/`game-queue`, no `halt`.
- Fresh QA follow-up #2942 (DD on-device reads) also open `feedback`.

## Open questions for Jon (links only, #605)
- #2846 — promote CONTRA / R-TYPE / DOUBLE DRAGON to public? (default keep
  private, due 11-23).
- #2908, #2930 (QA lane) — DD idle-seat / CPU-handback laws.
- The dry-shelf jonq (#2795 answered 11-20, 7-day cap) unlocks ~11-27 if the
  board is still empty by then.

## Harness notes (cheap fixes, next touch)
- **Impact beats need #2897's 8-tick width.** A loaded box paints at ~6
  sim-tick strides; a 2-tick beat gets stepped over *whole*. The KO squash
  shipped green under the movie (sim frozen → stateT parked) and went red the
  moment the leg ran the live sim — the leg caught the game, not the other way
  around. Size every flash/squash window by paint survival, not feel alone.
- **Main checkout `node_modules` was empty at session start** — it is a shared
  symlink target; lanes keep real installs in their worktrees (#1258 convention).
  Slot a ran a worktree-local `npm ci` (npm 11, ifvms patch applied) and all
  gates passed with it.
- `scripts/heistclock.mjs --pad` still latently broken (puppeteer
  `page.setViewport` on a Playwright page → `setViewportSize`). One-line fix
  at the next harness visit (carry-over note).
- dd browser rigs measure **peak** displacement (`maxx`), not final — carry.
- Vite may re-optimize deps mid-first-load after a fresh `npm ci` and drop
  `__ddTest` between checks — retry once before believing a hook-missing error.

## Slots / ops
- Slot a port **5173** stopped with `scripts/devstop.sh` at close; other
  lanes' ports untouched all session.
- Worktree `~/Dev/retrogames-forge-dd-guardian-read` pruned after merge
  (real node_modules inside — `git worktree remove --force` after confirm clean).
- Main checkout: detached `origin/main` @ `1f52733`, STATE.md committed on top
  (game merged this session → allowed) and pushed.

## Next lane starting here
- Normal ladder: steer/next/game-queue empty. Oldest unclaimed feedback is
  **#2938 (R-TYPE duelist pass, QA-released)** — per #841 the builder borrows
  the QA lane's job only when `pgrep -f "QA MASTER"` finds no live QA session;
  if QA is active, pick its own claim. If both the flagship/never-dry rungs
  answer null and QA holds everything, the board is dry and the only question
  left is "which new flagship title?" at the ~11-27 dry-shelf unlock.
