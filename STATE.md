# STATE — 2026-10-22 forge session (mirror fix)

## Shipped this session
- **#772 EMBERWOOD mirrored diorama → prod** (PR #775 squash `6f28d23`).
  Jon on iPhone: press right, hero walked left; town house sat top-RIGHT
  (tile data says top-left). Root cause = camera math: +Z-up stage, ortho cam
  south-above looking north-down with `up=(0,-1,0)` → north-on-top but
  screen-right = world −X (the whole view mirrored).
  - Fix = VIEW, not input: `FX(x) = SW*TS - x` applied to every view-space x in
    `render.js` (camera-follow, tiles/props, plates/switches/chests/doors/
    cracks/NPCs, torches+sun, hero/enemies/drops/projectiles/blocks/particles +
    blob shadows, tilt-shift focus). Removed the art.js hero right→left swap and
    the `scale.x=-1` hero flip (both were mirror compensation). `screenPos()` +
    `heroPos()` exposed on `__emberwoodTest` for QA.
  - Drive-by: `setFocus` passed `-hero.y` (focus off-screen → vale-wide blur);
    now passes hero.y. Helps town legibility (#773) though not the brightness
    half of that issue.
  - Harness: +4 chrome gates in `emberwoodcheck` (east-right 0.33<0.70,
    north-top, hold-right → world +43px east dir=right, projected screen x
    0.513→0.638). **Mutation-proven**: `FX = x => x` reds exactly the two x
    gates with Jon's mirror signature (0.486→0.361), vertical gates stay green.
  - Gates: eslint + lint:mario/fps/ai + build green; full check 76/76
    (node 64, chrome 12), zero page/console errors.
  - Prod verify: upstream `retrogames-psi.vercel.app` EMBERWOOD chunk
    `index-CPcmEIa0.js` contains the FX-wrapped sun (`(-80),200,150`) — fix is
    live. jalfern.com proxy still caches the old index hash (known #696/#694
    host-index staleness; refreshes on cache expiry).

## The lesson of the session
- A tilted +Z-up ortho stage viewed from above with `camera.up=(0,-1,0)` is
  north-on-top but X-MIRRORED. Any pixel-art game on this rig needs its
  orientation asserted, not assumed: gate "east tile projects right" +
  "holding right increases PROJECTED screen x" (world coords alone can't see
  the mirror). Symptom lookalike: sprite-flip hacks appear in art/ render to
  "fix" facing — that's the tell someone fought the mirror instead of the view.

## Next goal
- game-queue is EMPTY; `next` holds **#773** (iPhone overworld near-black +
  HUD overlaps shell buttons + thin play band). That's the next session's
  claim (oldest `next`), plus it may share air with the brightness/exposure
  chain (ACES + candela lights at `?lite` on WebKit; the focus-blur fix above
  already helps). HUD overlap = index.jsx absolute HUD vs VirtualControls zone.

## Board / harness status
- main: `6f28d23` (#775). Nightly green pre-merge; no freeze. Rule 4 ok
  (game code shipped). Rule 7: no new jonq — no taste calls.
- jonq lane:games: nothing AWAITING (#635/#634/#633 ANSWERED and executed).
- QA lane owns: #752 EMBERWOOD polish, #747 STORM, #713 CREDITS, #695 CAMPFIRE,
  #685 SSX, #702/#704 SHORE/OCEAN.
- Worktree to prune: `~/Dev/retrogames-forge-emberwood-mirror-772`
  (merged branch + its node_modules). Vite dev server killed.

## Open questions (links only, #605)
- none open for lane:games. (Other lanes: #698 demos-driver hold honored;
  #691 answered — lane:qa's call.)

## Open threads
- #773 next up (builder). #752 QA EMBERWOOD polish still open (brighten vale,
  tree sprites, attract solver-route bot, music bed, swipe-arc/hit-stop juice).
