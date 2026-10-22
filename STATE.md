# STATE — 2026-10-21 forge pm #5

## Shipped this session
- **#738 EMBERWOOD — original HD-2D action-adventure → prod** (PR #751 squash
  `6bfca16`; Vercel SUCCESS + production deployment at `6bfca16`; route
  `/retrogames/emberwood` answers 200). Jon's "fancier Zelda-like that's OURS"
  (no Nintendo names/art/music): hero Ash, the vale of Emberwood, embers currency,
  bosses Bramble Maw + Cinder Wyrm. MODERN bar.
  - Full first slice: 2x2 overworld + town shop (potion/arrows/bombs/shield),
    tap-A slash / **hold-A draw bow / B bomb / C drink**, 6 monster species each
    with its own AI (cinderling/bat/spitter/husk-front-armour/wisp-phase/sprig-lurk),
    two item-gated dungeons (keys, locked+big door, push-block→plate, cracked walls,
    far arrow-switches gated on dungeon-1's bow), hearts+containers, death→respawn
    with progress, win overlay.
  - HD-2D three.js stage: tilted ortho diorama, sun+hemi+real shadow maps, torch
    point-lights + hero lantern in dark, ACES exposure, animated water, bloom +
    tilt-shift focus on hero, vignette. `?lite=1` skips post/shadows.
  - Pure seeded `sim.js` (mulberry32) — renderer/contract/attract-bot/Node harness
    all drive ONE module; same seed ⇒ byte-identical hash trajectory (asserted).
  - `solver.js` proves dungeon finishability with only the items owned at that point:
    full win WITH bombs; **bow unreachable without bombs** (crack gates it); bare kit
    can't clear bow-gated d2; slack keys≥doors+1, arrows≥switches+1.
  - Harness `npm run emberwoodcheck` = **61 gates green**: maps/species/solver
    gating+slack/determinism + per-rule mechanics + Chrome leg (start, walk, real
    contract ticks, forced death/restart, canvas lit via contract `frame()`, zero
    page/console errors). Mutation-proven: removing solver bomb-gate reds 3 gates;
    restore → green. Registry `visibility:'private'` (#379), own lazy chunk, pad/B,
    PauseOverlay, DebugKit (+ live PROGNOSIS), `exposeGame`+contractcheck.
  - Gates: lint:mario/fps/ai clean, build green, main-ok green.

## The lesson of the session
- three.js r155+: point/spot lights use candela units — the diorama rendered
  near-black until lights were bumped to 4–7 candela AND `toneMapping=ACESFilmic`
  with a Z-up stage. First-pass HD-2D must be screenshot-eyeballed, not just
  "does frame() have light >0". A Y-up mental model on a +Z-up board frames the
  whole diorama off-camera → all-black, no error. Diagnose with a pixel histogram
  (max luminance), not just a blank-check.
- Never `getContext('2d')` on a live WebGL canvas in a probe — it corrupts the
  context ("existing context of a different type"). Read pixels via contract
  `frame()` (toDataURL) instead.

## Next goal
- Oldest game-queue: (check `gh issue list --label game-queue`). If empty, borrow
  the QA lane per FORGE step 2 — but QA is live (#752 EMBERWOOD polish just filed).
  EMBERWOOD polish = **#752** (QA lane owns it; builder lanes stay on game code).

## Board / harness status
- main: `6bfca16` (#751). Nightly green pre-merge; no freeze.
- Rule 4 satisfied (new game code shipped). Rule 7: no new jonq (no taste calls).
- Polish pass filed: **#752** (QA EMBERWOOD).
- Prod note: jalfern.com proxy serves a cached main bundle without the EMBERWOOD
  label string yet (same host-index staleness as #696/#694); merge+Vercel+prod-alias
  at `6bfca16` all confirmed.
- Worktrees to prune: forge/emberfall-738 branch (merged); this state-* branch's
  worktree dir ~/Dev/retrogames-forge-emberfall-738 (has its own node_modules install).

## Open questions (links only, #605)
- #698 demos driver ownership — AWAITING (default: demos queue holds for Jon's
  answer re driver; builder still takes queue items per #635-A).
- #691 land #690 harness-fix exception — AWAITING (lane:qa's call).
- #687 needs-approval; #696/#694 host index staleness — platform lanes'.

## Open threads
- #752 QA EMBERWOOD polish (brighten vale, tree sprites, attract solver-route bot,
  music bed, swipe-arc/hit-stop juice). Plus older QA: #747 STORM, #713 CREDITS,
  #695 CAMPFIRE, #685 SSX, #702/#704 SHORE/OCEAN — QA lane.
