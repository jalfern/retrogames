# STATE — forge board snapshot (slot a, 2026-11-23 — the tidy bot gets a paper world)

## This session — SHIPPED
- **#3078 TIDY BOT — the reimagined skin, "PAPERCRAFT DIORAMA"** (PR #3085,
  squash-merged `4d3b6f3`): a full-art alternate skin, zero gameplay delta
  (rules/controls/difficulty/chore list/timings/sensors untouched — the classic
  painters moved verbatim into `src/games/TidyBot/art.js`, only constants and
  draw primitives changed). The world becomes a handmade papercraft diorama:
  mint paper floor tiles with white cut-gaps, kraft-cardboard walls with fold
  creases, tomato-cloth and gingham tablecloths, sticky-note chore tags with
  folded corners, a washi-tape HUD, popsicle-stick bot body with brass-brad
  eye, washi dust puffs and a paper-crown flourish. Selection: `?style=
  reimagine(d)`, a `STYLE: CLASSIC/PAPERCRAFT` pill (tap or `T`), persisted in
  localStorage. **Classic is and stays the default** — promotion is Jon's call;
  rollback = not promoting. Live: https://jalfern.com/retrogames/tidybot?style=reimagined
  (prod chunk verified to carry the skin).
- **Harness on both skins**: `tidycheck` grew a Skins section — classic pixel
  golden (raw bytes, `45e625d7`, proves the verbatim move), paper golden
  (perceptual, `33dfb942`), teal-at-bot/red-at-tray pixel laws on BOTH skins,
  live toggle state+repaint, zero page errors; the existing pixel laws run on
  classic only via `?style=classic` pin (they run with and without the pill).
  Full tidycheck **145/145**; node-only 109/109; lint gates + build green;
  mutation proof: nudging one classic tile colour turns the golden gate red.
- **#3086 filed** — `feedback`: papercraft polish backlog (gingham strength,
  attract card corners, corrugation peek at tile 0/1, stove dial dots, confetti
  particles, paper-crinkle sound). QA lane picks it up; builder lanes don't (#10
  of FORGE-QA).

## Harness lesson (the big one) — pixel goldens vs Chromium raster drift
- Raw-byte `getImageData`/`toDataURL` goldens **cannot survive a page's draw
  history**: the same code renders ±1 on curved strokes depending on whether the
  page already drove the game, and getImageData adds a colour-space round-trip
  vs toDataURL (5712 bytes differing by 1 on a byte-identical classic re-test).
  Classic's golden was already marginal (one 318-vs-319 channel nudge = 324
  mismatches pre-existing). **Policy now written into tidycheck + README**:
  skin goldens are frozen at fresh-load contexts as a downsampled+quantised
  perceptual signature (32×32, 6-bit/channel), tolerant only to ±1 raster
  drift, and mutation-guarded in CI (proved this session). Spatial truth stays
  behavioral: the per-object pixel laws sample raw pixels and pass on both skins.
- DEV hook `__game.quiet()` pins draw-deterministic frames (clears parts/fx/
  shake/flash/pullAnim/ringPop/flourish+timer) — the tool any future skin or
  pixel-golden work needs. `step(0)` actually steps ONE tick (pad defaults to
  n=1) — a run of `step(0)` is NOT a no-op. `flourish` is attract-only;
  `makeGame` must scrub it (item-id aliasing — a bot carrying flourish is
  invisible to physics but repaints the attract card forever).

## Rule 4
- Streak RESET: #3085 changed `src/games/**` (game art). Last four merges before
  it were harness/lane chores; this session put game code on main again.

## PLAYABLE on main right now
- **NEW: `/retrogames/tidybot?style=reimagined`** — the papercraft diorama.
- `/retrogames/demos/starry-night.html` — STARRY NIGHT demo (#3082, last hand).
- CONTRA through `TOP SOLDIERS` + canopy frogmen (#3067), RACCOON HEIST museum,
  spy-hunter chase, iron keep, mario, galaga, missile, pucks, mines, zork,
 ultima, king's quest, frogger-like Joust, Q*bert, heist-forge board.

## Open questions (links only — #605)
- #3054 — QA: native TestFlight ports have no recorder/upload; does the big build need one?
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).
- #3079 — rule-4 same-source kicks: dry-shelf candidates (Jon's 48 h deadline Nov 26;
  anchor moved — #3082/#3085 are game code; factual update posted).

## Next queued (ladder is thin — these are candidates, not claims)
- #3086 papercraft polish is `feedback`, not `building` — QA lane owns it.
- If idle-kick answers NONE next tick, that is legal STOP; do NOT re-invent a
  fifth CONTRA rung (Jon's call on #3079 pending).

## Slot / board state at handoff
- Slot a merged this session; #3078 closed (shipped). No PRs of mine open.
- `waiting-jon` open: #3054, #2971, #1712. `building`: none. `feedback` fresh: #3086.
- Main tip at handoff: `4d3b6f3`. This lane's worktree re-detached there;
  remote branch `forge/tidybot-reimagined` deleted.
