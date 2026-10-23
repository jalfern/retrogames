# STATE — 2026-10-23 forge session (SSX front-flip shipped)

## Shipped this session
- **#871 → main (squash 55296e5, static SUCCESS)** — first flagship polish
  stage under the brand-new #841 idle rule (board empty + QA live ⇒ no borrow ⇒
  flagship stage). `scripts/lib/idle.mjs` `flagshipStage` picked **SSX** (Jon's
  order), honest gaps parsed from the README, not memory.
  - The top README gap (index 0, "CPU riders miss lines #791 slice 10") read as
    **already shipped** — verified live (`sim.js:397-413` line-bobble + dust,
    `index.jsx:319` event). STATE.md flagged this exact risk: verified, pruned.
  - Stage = the next genuinely-open game-code gap: **front-flip reaches phones.**
    Touch trick pad fed `KeyZ` (backflip) only; `KeyC`→`sim flip=2` (negative
    direction, scored/animated at `sim.js:187`) was keyboard-only.
  - `src/games/SSX/index.jsx` — add `FRNT→KeyC` to the trick pad (same
    `pressTrick` synthesis; `index.jsx:495` already mapped `KeyC`→flip=2).
  - `scripts/ssxmodelcheck.mjs` — assert 4 buttons (`KeyX,KeyZ,KeyC,KeyV`),
    prove FRNT reaches the held-key set, and drive a real mid-air front-flip
    (flip ledger negative) from the touch button.
  - `src/games/SSX/README.md` — prune 4 shipped honest-gaps (line-bobble #791
    s10, snow geometry/attract #310/#791, grab naming #6, doubles #8); rewrite
    the flip gap for shipped FRNT. 3 honest gaps remain.
  - Live: https://jalfern.com/retrogames/ssx — FRNT confirmed in the deployed
    SSX chunk (`index-CqxyVlWk.js`).

## Verification
- `ssxcheck` 220/220 (Node rule gate, unchanged).
- `ssxmodelcheck` 57/57, incl. `FRNT … FRONT-flip … flip -52`.
- **Mutant:** drop `KeyC` from the flip mapping (`index.jsx:495`) →
  `FRNT … flip ledger goes negative` FAILs (`flip 0`); restored → green.
  (An unrelated `paused scene stable` line flaked once during the mutant run —
  advisory, green on both clean runs.)
- `lint:ssx` clean, `npm run build` green. #871 closed shipped.

## Next goal
- Re-run `flagshipStage` against today's board. SSX now has 3 honest gaps, in
  order: **[0] no physical analogue stick** (steer depth = drag/ramp, flip =
  discrete taps), [1] no `ssxplay` browser-drive harness, [2] CPU livery
  decals are static-offset not IK. **Careful:** [0] is a design/taste call
  (add a real touch stick vs keep arcade taps) — likely a `jonq ask`, not a
  blind build; [1] is harness (does NOT count for rule 4). If SSX's first
  unowned gap resolves to harness, prefer the next flagship whose oldest gap is
  game code.
- QA lane holds `building-qa`: **#863 (BLOB BATTLE)** only. Never touch a game
  QA is inside (idle `heldGames` skip).

## Board / harness status
- main green at 55296e5; no freeze; no `halt`; queue/next/steer empty at claim.
- Rule 4 satisfied: SSX game code merged this session (breaks the recent
  docs-only streak).
- `jonq` lane:games: nothing AWAITING, nothing filed this session (mechanical).
- **Deploy dependency (Jon, unchanged):** real internet play needs the relay
  worker redeployed on Cloudflare (#825); online pairs ride the local test relay
  meanwhile.
- QA lane owns: #863 BLOB, #858/#854/#851 shipped, #831 STORM, #833 audio,
  #832 OCEAN, #752 EMBERWOOD, #680/#702 SHORE.

## Open questions
- none this session (lane:games). See #843/#825 (lane:qa, AWAITING).

## Housekeeping owed
- Worktree `~/Dev/retrogames-forge-ssx-flip-touch` re-detached at origin/main
  with a node_modules symlink — safe to prune (as are the older SSX/QA trees).
- No QA polish pass filed for #871: SSX is not a new title (step 8b targets new
  games) and its remaining honest gaps already live in the README, which is the
  source `flagshipStage` reads — a duplicate QA feedback issue would be noise.
- Idle rule note (for next session / warden): `flagshipStage` returns the oldest
  unowned gap regardless of harness-vs-game; if it hands you a `ssxplay`-style
  harness gap, treat rule 4 (game code) as the tie-breaker.
