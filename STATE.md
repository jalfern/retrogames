# STATE — 2026-10-24 forge session 9 (MYST's sphere learned to dream)

## Shipped this session
- **#1024 → main (PR #1026 squash dc137b2)** — **MYST: Spectator age-visions**,
  live at `https://www.jalfern.com/retrogames/myst`.
  - Honest idle pick: Myst README gap #0 (the sphere was a still list).
  - Game code: new `src/games/Myst/visions.js` — four circular glass lenses,
    one per Age, painted at runtime: Selenitic's green storm (dome, sounding
    rings, timed lightning), Stoneship's teal swell (low sun, rocking ship),
    Mechanical's forge (glow, two meshed gears, sparks), Channelwood's cloud
    world (drifting banks, falls, star-wheel silhouette). Every pixel a pure
    function of world time; unlinked Ages churn sealed grey. Pure
    `spectatorViews(s)` reads the `link_<age>` flags; RAF paints while the
    panel is open.
  - **Bug fixed en route**: `link_channelwood` was never set by any route —
    the star-panel solve now fires `link:channelwood` (like the safe's
    `link:stoneship`), so HUD + sphere finally know the fourth Age.
  - Harness: mystcheck **378/0** (+20: purity, seal order, monotonic thaw,
    painter determinism via recording-ctx stub), `--mutate` **45/45 die** (+3:
    forgetful sphere, no-vision lenses, frozen vision); mystplay **37/37**
    live (+8: sealed = zero-chroma pixels inside the glass; linked lenses
    provably move between clock instants); mystviewcheck 85/85; lint + build
    green. Prod content-verified: chunk index-BoD0m1ya.js carries
    `data-vision` on www.jalfern.com.
- Parallel lanes while we ran: QA shipped **CDHD ruts (#1015 → PR #1025)**
  and claimed **Myst star-wheel feel pass (#1022, `building-qa`)** — QA is
  INSIDE Myst now.
- Filed **#1027** (QA lane: Spectator polish — phone lens scale, sealed-vs-
  dim-storm contrast, per-age thaw sound, flash pacing, attract shot).

## Next goal
- The idle picker's only unowned flagship gap left is **Myst gap #1: "Ages'
  books link straight from their home node; there is no linking-book
  animation with the starfield travel."** — but Myst is QA-held (#1022
  `building-qa`), so a builder must NOT touch it this instant.
- Next session: re-run the picker. If #1022 has shipped (Myst free), file
  `POLISH — MYST: linking-book starfield travel animation` (game-queue +
  lane:games), claim, build it. If QA still holds Myst and the board has no
  claimable `next`/`steer`/queue item, every flagship gap is owned or
  QA-held → **STOP is legal** (say so; don't invent work).

## Board / harness status
- main = dc137b2; main-ok green; static SUCCESS (required check only);
  Vercel prod verified.
- Worktrees: main checkout `~/Dev/retrogames` detached — refresh it to
  origin/main (`git fetch && git checkout --detach origin/main`).
  `retrogames-forge-myst-spectator` (detached dc137b2) — prune with the
  standing list.

## New harness lessons (this session)
- **A pixel discriminator must exclude shared chrome.** Brightness failed the
  sealed/linked test because the brass rim + specular sweep light every pane
  equally; judge *chroma inside* the lens (max−min > 24, r < 0.82·R), never
  brightness, when frames share a border.
- **Thin features starve sparse samples.** A 2px arc at stride-92px hit ~4
  pixels — flaky lit-counts. Stride 4px made every count agree 4/4.
- **Link flags are a contract every consumer keeps.** Channelwood was a fully
  walkable Age whose `link_` flag no code ever set — invisible to the HUD all
  along. Grep `link_` assignments whenever an Age's route changes.
- **`gh pr merge --delete-branch` flips the worktree onto local `main`** —
  re-detach immediately (rule, and delete the stray local `main`).

## Housekeeping owed
- Prune when idle: standing list (momentum-courses, iphone-controller, ssx-*,
  emberwood-*, comet-hd-*, coral-reef, people-sim, campfire-670,
  forge-model-library, qa-863*, qa-973*) + forge-myst-spectator + detached
  leftovers.
- No drive-id renames this session — pre-#1026 replays still valid.

## Open questions
- None (#605: nothing filed this session).
