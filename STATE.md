# STATE — forge board snapshot (slot a, 2026-11-25 — PINBALL ball-ball collision SHIPPED (#3217/#3219))

## This session — one ship LANDED
- **#3217 DONE: PINBALL ball-to-ball collision shipped.** Warden target #3129 was
  REFUSED at claim time ("held by b, newest comment 12 min ago" — slot b was live
  inside it and shipped it as #3215 same day; nothing lost). Ladder: steer empty,
  `next` held #1712 (`waiting-jon` + `big-build` → skipped per #605), `game-queue`
  empty, `feedback` borrow blocked by TWO live `QA MASTER` sessions (studio 22559,
  mini 75044) → flagship stage spent (`idle-kick` answered weak) → **#1571
  never-dry**: `node scripts/idle-kick.mjs` → `KICK PINBALL 0 weak`.
- Filed it as its own issue first (**#3217**, `game-queue` + `lane:games`, why-weakest
  line included), claimed #3217, built it, shipped: **PR #3219 merged `7e510f8`**.
  Prod verified — `Pinball-C8YvFhdw.js` carries the `ballhit` resolver. Issue closed,
  `shipped` label. Play: /retrogames/pinball.
- What shipped: `packCollide` in the 240 Hz substep loop — equal-mass impulse along
  the contact normal (`BALL_E = 0.8`) + positional separation; a **magnet-pinned ball
  becomes a post** (free ball bounces off, pin never moves); diegetic steel clack
  pitched by impact + chrome sparks. **No scoring added** — physics and feel only.
  Generic engine primitive, rung-2/rung-3 tradition; tables stay data.
- Proof: `pinballcheck` 97→**109** green (head-on ±300→∓240 literals, chase pair
  500/100→140/460 transfer, energy never grows, soft touch silent, magnet-post with
  pin frozen, lone ball never clacks, 3-ball scramble deterministic). Mutant: dropping
  the `packCollide` call → `102/109`, restored green. `pinballplay` advisory 14/14.
  eslint + lint:mario/fps/ai + build green; nightly on the branch head `80417c2`
  **success**.

## PLAYABLE on main right now
- **`/retrogames/pinball`** — balls deflect balls; the magnet-pinned ball is a post.
- `/retrogames/marble-rush` + `/retrogames/comet-drift` **tilt grants** (#3129, slot b),
  `/retrogames/tidal-rush` moored sloops + bell buoy (#3159, QA lane),
  `/retrogames/skyward` thunderpass juice, `/retrogames/ice-climber` DOWN-as-verb,
  `/retrogames/marble-rush` ten shelves, grind-city, stomptown, short-order-shout, ssx,
  marble-madness, pacman, mario, minesweeper/garden-guard/homebody (POINTER pads),
  TIDY BOT, STARRY NIGHT, TOP SOLDIERS, DOUBLE DRAGON, RACCOON HEIST, spy-hunter,
  iron keep, galaga, missile, pucks, mines, zork, ultima, king's quest, Joust,
  Q*bert, forge board.

## Board watch (facts, not questions)
- Today's merges (slot a): #3219. Others: #3203 #3216 **#3215** #3219.
- `quarantine.json` is `{"checks": []}`. Nightly `45521147512` @ `80417c2`
  **completed success**; `45518266417` @ `a4ea5a1` success; `45518050439` @ `bf475aa`
  was in_progress at handoff.
- **PINBALL scored weakest (9) on `weakestStage`** and gap #0 is now CLOSED by #3217.
  Its two QA polish items **#3178** and **#3201** stay open and own the rest of the
  polish (attract show-off, multiball loudness, phone HUD, DMD legibility, orbit rail
  read, magnet/orbit mix) — builders must not take them (`feedback`, QA lane).
- **`pinballplay` game-over budget is Date-seeded flake-prone**: the "game ends after
  the balls run out" check fast-forwards 8000 ticks, and `freshSeed()` is
  `Date.now() >>> 0`. A long rally can legitimately exceed it. Node soak of 60
  choreographed seeds drained in ≤8433 ticks with zero survivors — so the sim drains,
  the check is just tight. If it reddens again on main, that's the cause (not a stuck
  ball); fix is the budget line in `scripts/pinballplay.mjs`, not `sim.js`.
- `game-queue` empty at handoff → next builder item = flagship/never-dry derivation
  (`node scripts/idle-kick.mjs`), don't trust memory.

## Open questions (links only — #605)
- #3054 — QA: native TestFlight ports have no recorder/upload; does the big build need one? (lane:qa, AWAITING)
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build; labeled `next`
  but `waiting-jon` + `lane:research`, so it is not a builder candidate — #605).

## Next queued
- `game-queue` empty → flagship/never-dry derivation. Re-run `idle-kick` at claim
  time; PINBALL's weak score dropped by the #3217 gap close, so expect another title
  (or PINBALL still, on a different gap — either is fine, own QA items excluded).

## Slot / board state at handoff
- Slot a: #3217 merged with full cleanup (`forge/pinball-ballcollide` remote branch
  gone, local branch deleted, lane re-detached at `origin/main`).
- Dev server :5173 stopped with `scripts/devstop.sh`. The stale `pinball-rung3`
  worktree's Vite server that squatted on :5173 was stopped the same way (by port).
- Two worktrees remain for reuse: `~/Dev/retrogames-forge-pinball-ballcollide`
  (merged, clean) and `~/Dev/retrogames-forge-state-a` (this STATE commit, merging now).
- Time-box: ~1 h 10 m of the 3 h slot used; one ship per session, so this lane exits.
