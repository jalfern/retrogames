# STATE — 2026-10-24 forge session 11 (SHIPPED: MYST linking-book starfield)

## Shipped this session
- **MYST #1031 — linking-book starfield travel** (PR #1032, squash to main
  at 0a144ce; prod verified at https://jalfern.com/retrogames/myst — the
  starfield chunk `index-CTvnE9cN.js` is live on www.jalfern.com).
  Touching an Age book no longer cuts: page cover rushes up (Age ink +
  double-rule border), a seam of light opens, ~2.9 s (175 ticks) of swirling
  blue-white stars, then the Age resolves out of them. Six touch-points link
  (`link.js`): tower cogs book → Mechanical, fireplace → Selenitic, safe →
  Stoneship, cave wood door → Channelwood, plus Channelwood's hub book and
  landing panel (the Age keeps its own way home — and its own return flight).
  Keys + pad are muted mid-flight; `state.link/linkT` is pure sim drained by
  the loop's tick; the node swaps under the opaque cover and the overlay
  clears exactly on the arrival tick.
- Gates: mystcheck 439 pass; 8 new mutants (59/59 die). mystplay 48/48 incl.
  7 new live leap checks (overlay pixel density, mid-flight mute, resolve).
  Visual proof via shot at cover/seam/swirl/resolve. #1031 shipped+closed;
  QA follow-up filed as #1035 (feedback): other Ages' return panels still
  cut, brothers-book trap pulls still cut, seam wobble, arrival accel,
  cover SFX, DPR crispness.
- QA lane shipped #1034 (Selenitic sculpted dome) beside us this session.

## Next goal
- The honest picker (`scripts/lib/idle.mjs`, fresh from the post-merge
  READMEs) returns **null**: SSX/Emberwood/COMET DRIFT HD have zero open gaps
  and Myst's two README gaps are now CLOSED (#1031 linking books, #1034 dome
  sculpt by QA). #1033/#1034 shipped while we merged. So: unless Jon files a
  `steer`/`next` or the board gains a claimable `game-queue` item, **STOP is
  legal** for the next session (rule: only when every flagship gap is owned —
  they are). If QA files new Myst `feedback` (#1035 is theirs), the QA lane
  owns it; the builder stays clear.

## Board / harness status
- main = ac6d004; `main-ok` green; static is the only required check; Vercel
  prod healthy (MYST starfield link verified live).
- Open: #1035 feedback (MYST linking polish, lane:games — QA's to take),
  #838 epic unlabeled (not claimable), #737 waiting-jon, #549 parked.
  #1031 shipped+closed; #1033 (dome) shipped+closed by QA via #1034.
- This checkout detached at origin/main, clean (STATE.md committed by design —
  a game merged this session). Lane worktree
  `retrogames-forge-myst-linkbooks` removed; branch deleted.

## New harness lessons (this session)
- **An envelope takes ELAPSED, not countdown.** `linkEnvelope(gs.linkT)`
  (a remaining-ticks counter) inverted the whole fade — the early screenshots
  showed the world through a "supposedly opaque" cover. Pass
  `LINK_TICKS - gs.linkT`. Screenshotting every phase caught what 439 pure
  gates could not: the gates defined envelope on elapsed, the caller passed
  remaining, and both agreed with themselves.
- **Dev hooks that jump state must clear transient sim fields.** The solver
  parks left `link='stoneship'` stranded (the script never ticks it), so the
  mid-flight key guard blocked the rocket saddle in mystplay. goto/nearWheel/
  nearRocket/nearSpectator now zero link/linkT like solve() does.
- **The RAF loop must actually drive new transient states.** Adding a tick
  drain to dispatch is not enough — the loop only dispatched `tick` during the
  rocket ride. `if (gs.link) dispatch(gs,{t:'tick'})` in the sim step or the
  flight never ends.
- **Prod verification paths:** apex `/retrogames/myst` answers
  "Redirecting..." and www+slash 404s; the SPA lives at
  `www.jalfern.com/retrogames/myst` (no slash). Games are code-split — the
  new string is NOT in the entry chunk; grep the lazy chunks referenced by
  the entry (`./index-*.js` refs) for a marker like `data-linkfx`.

## Housekeeping owed
- Remote `forge/*` orphans (campfire-670, comet-hd-fallback,
  emberwood-grace/sprites/wyrm-tail, iphone-controller,
  ssx-cpu-riders-620/salis-arm) — deletion candidates once Jon or the warden
  confirms nothing is owed. Not deleted this session.
- No drive-id renames — replays remain valid.

## Open questions
- None (#605: nothing filed — the build followed the README gap verbatim).
