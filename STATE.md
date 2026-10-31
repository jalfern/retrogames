# STATE — session 59 (2026-10-31)

## Shipped this session
**TEN-DEEP gets the MODERN look — #1127 complete (stage 4 of 4)** — merged
`4586ad9` (PR #1273), prod verified (`index-DEGtBc2G.js` carries it;
`demos/dungeon.core.js` serves 200). Slot b's first solo ship.

- The corridor is now the shared #1129 WebGL2 renderer, loaded on demand via
  new `src/utils/dungeonRenderer.js` (BASE_URL runtime injection — jsdos.js
  idiom, never a script tag in index.html): torch-lit brick with falloff +
  fog, real stair-down geometry, springs as rippling water, a crimson
  `R.light` beacon on the Hollow King's throne.
- Two-layer stage: GL corridor underneath, the unchanged 2D layer (HUD,
  automap, toasts, FX, combat plates, RIM, interiors, bench) on top. No
  WebGL2 → the shipped wireframe stands in, byte-for-byte.
- Rules untouched: sim/solver/ledger unwritten this session. tendeepcheck
  795/795; tendeepplay re-pinned for the new look, none dropped, 66/66
  (lit-brick-vs-darkness centre contract; `glLag` glide proofs land
  frame-exact; bump = zero lunge). Mutant proven: dropping the `glideGl()`
  hook fails exactly the two lag checks.
- #1127 closed completed; polish backlog filed as **#1275** (MODERN combat
  plates, corridor-monster options, spring beacon, pad second-actions,
  attract-text contrast, HUD strip legibility).

## Next goal
Deep game queue for slot a/b: **#1248, #1249, #1251–1254, #1259, #1144**
(oldest `game-queue` first per the ladder). #1141 stage 4 (platform lane) is
un-stalled per Jon's HF answer — not a builder candidate. Rule-4 watch: reset
— game code merged this session.

## Harness
`tendeepplay` carries the GL contract + a settle-before-sample discipline:
pixel reads must wait for `glLag < 0.02`, because reading mid-glide grades a
corridor whose axis is still swinging (this session's own first-run bug, now
pinned behaviour + documented).

## Environment notes
- This lane worked in `~/Dev/retrogames-forge-wizardry-own-ip`
  (forge/wizardry-own-ip; branch deleted on merge — worktree now detached at
  origin/main). Slot b port 5178, `npm run dev -- --port 5178 --strictPort`.
- **Never symlink `node_modules` into a worktree** — Vite then resolves two
  React copies and the app dies with "Invalid hook call". Run
  `npm ci --prefer-offline` in the fresh worktree (~1 min).
- jalfern.com apex 301s to www — poll prod with `curl -L` (reconfirmed).

## Open questions for Jon
- none open from this session (#737 still sits waiting-jon from earlier lanes).

## Carry-over
- #1275 QA polish pass on TEN-DEEP (feedback — QA lane's next job).
- #1141 stage 4 (platform lane), #1266 QA follow-ups, 48 h trial verdict
  (~Oct 32) posts on #1258 — this session's merged game is the evidence.
