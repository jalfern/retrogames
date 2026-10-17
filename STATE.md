# STATE — 2026-10-17 (forge session — CIV V polish #5 SHIPPED: mobile perf pass)

## This session (#375 item 5, PR #415, merged 05d8745)
- Claimed #375 (only `game-queue`; no `next`). #398 still HELD — no answer to
  the 3-strikes question anywhere (the "jalfern" holding comment on #398 is
  the previous session's own note; `gh` auth IS jalfern — do NOT read it as
  Jon's ruling).
- **Lite pipeline** `?lite=1` (Heist doctrine, no shadows exist here): MSAA off,
  dpr capped to 1; scene graph untouched. `civplay` +4 checks: hook boots on
  lite, world still paints (readPixels), backing store dpr≤1, no errors (65).
- **Allocation-free frame loop** (art.js): module-constant Color lerp targets
  (was `new Color` per owned tile per frame), integer rolling rebuild
  signatures (was per-frame `map().join()`), and the sigs no longer carry
  `gs.turn` — the board used to rebuild EVERY city/camp/wonder EVERY turn;
  now only on real change. Reach-ring cache + single `connectedResources`
  per HUD sync (index.jsx).
- **Catch-up cap 8 → 16** (index.jsx): with 8 the world lost real time below
  ~7.5 fps (frame-floor lesson). Turn-based sim is cheap; world keeps seconds
  to ~4 fps now.
- **`scripts/civclock.mjs`** (new, `npm run civclock`, in lint:civ): late
  board = `__civTest.clock(30)` (autopilot t30 + crowns disarmed 1e9 + musket
  line/keel), fps/loop/p50/p95 at throttle 1/4/8, full vs lite. Gate:
  loop ≥0.9x at full speed.
- Proof: civcheck 533/533; lint civ/mario/fps/ai + build green; civclock loop
  1.00–1.10x everywhere; **mutant** (30ms spin in `animateUnits`) → clock red
  (0.55x, exit 1) → restored. CI green FIRST try. Prod: CivV chunk
  `index-B2-LKuMv.js` (hash-identical to local build) carries `has("lite")`.
- **Big instrument truth**: headless Chrome on macOS presents ~13–20 fps for
  ANY page — a bare three.js canvas clearing one color measures ~13 fps here
  (measured with /tmp probe; probe since deleted). CivV's own JS was already
  only ~3ms/frame. So fps is the machine; only loop-ratio is the game. Never
  write civplay/civclock checks that assert fps.

## Still open / held
- **#398** (contract batch 2): HELD for Jon — Missile Battle smoke flake
  (3-strikes). Branch `forge/contract-rollout-b2` intact (b2afe8a). If Jon
  says accept: from that branch `gh pr checks 398 --watch --fail-fast && gh pr
  merge --squash --delete-branch`, verify prod, relabel #391.
- **#375** requeued `game-queue`: items 1–5 shipped; **item 6 looks already
  shipped** by the seed-4 coastal civplay rework (README mutant #3 reds it) —
  commented, asked Jon to close or append.
- **#391** keeps `building`+`stalled`: batch 3 bases on main AFTER #398
  merges. Candidates: Lemmings, Sonar, Outpost, Polarity, Dogfight, SmashTV.
- Advisory flake (pre-existing, not ours): civplay "peace ends the war and
  starts the truce clock" fails ~1 in 3 — Venice can re-declare war inside the
  same turn window as the peace press. Rule 3: don't spend a PR on it unless
  Jon asks.

## GOAL — next session
1. If Jon answers #398: merge from branch (rerun smoke first if accept) +
   verify prod + relabel #391. Else leave held.
2. If Jon closes #375 and queue is empty: nothing to forge — check the QA
   lane per FORGE.md step 2 (borrow `feedback` only if no live `QA MASTER`),
   else STOP with a report.
3. If #375 gets a new item, take it.

## Notes for whoever picks this up
- Main checkout detached at 05d8745, clean. Lane worktree
  `~/Dev/retrogames-forge-civv-perf` (node_modules symlink to main) kept for
  context. Many stale `retrogames-forge-*`/`retrogames-qa-*` worktrees —
  prune when convenient (`git worktree remove --force` + `git worktree prune`).
- `gh pr checks --watch` hung silently on #414-style pending static again;
  polling `--json name,state --jq 'select(.name=="static")|.state'` until
  SUCCESS then running the rule-5 chain works cleanly (this gh build has no
  `conclusion` field).
- Latent bug (not ours): sim not deterministic past turn 40; `clock`/§33/§37
  all stay inside the shipped clock. Keep new scene builders ≤ t40.
- `clock` DEV hook mutates module CFG (crowns to 1e9, turnLimit 999) — page-
  scoped, DEV-only; never run pixel/probe determinism checks after clock() on
  the same page.
- Prod-verify pattern that worked: fetch jalfern index, scan referenced
  `index-*.js` for `Cockpit`+`Stasis`, `LC_ALL=C grep -a` literals ("lite"
  survives minify); compare chunk hash with local `npm run build` output.
- Dev server was started this session and killed at the end — still check
  :5173 before reuse.

## Three questions for Jon
1. #398 still yours: accept the Missile Battle smoke flake (rerun+merge) or
   make `smoke` continue-on-error so advisory flakes can't wedge rule-5?
2. #375: item 6 appears already shipped (seed-4 coastal keel). Close the
   umbrella, or append item 6-verified + anything new?
3. Headless-Chrome presents ~13–20 fps for ANY page on macOS runners — want a
   QA-lane note in docs/HARNESS.md so nobody chases "fps" regressions that are
   the runner, and the loop-ratio becomes the standard browser perf gate?
