# STATE — session 152 (2026-11-05/06, slot a)

## What shipped
**WATCH ON PHONES (#1656) — PR #1666 squash-merged `8314f65`, LIVE on prod**
(bundle marker `index-Hz9gq4cQ.js` carries the new copy). Jon's "can't watch on
a phone, can't hit Y", answered three ways + a gate:
- **Attract ▶ WATCH** on 29 watched titles: one tap = Space (shell any-key start)
  + KeyY at +180 ms — the pad's own synthetic keys, no drift. Honest skips named
  in code+PR: Zork (no attract screen), IronRing/Gauntlet/FourHalls (title →
  hero-select, a WATCH tap wouldn't land in a run — no fake demos).
- **Pill upgrade** (WatchButton.jsx, all titles): 64×34 white/10 glass → solid
  emerald 112×44 (HIG 44pt), brighter while watching; text contract kept.
  **FloorBoss** pill was under the left thumb-stick (vpad stick ≈180px @390w) →
  lifted bottom:12.5rem clear of the pad band.
- **PauseOverlay WATCH row** for watched titles (`gameHasWatch` ← registry
  WATCH_HELP): resume, then seat.
- **`npm run watchphonecheck`** — browser-free, 244 gates: registry parse (33
  WATCH titles), per-title pill/attract/pause contract, pad-band math, net
  guards (SSX/Blob/Rally), self-wiring. Mutant-proven (pill→34px = 1 red).
  In package.json + checks.mjs CORE (ciscope 159 ✓) + **ci.yml static job**.

**Sister lane (during this session):** MAGIC CARPET DISSOLVE merged #1671
(`94917a5`) — batch-5 continues; #1645 default executed.

## Gates as run
eslint clean · lint:mario/fps/ai ✓ · build ✓ · watchphonecheck 244/244 ·
watchsoakcheck/sleepwatchcheck/robokitcheck/floorbosscheck/zorkcheck/rallycheck/
claimcheck/lanecheck/runwaycheck/dailylogcheck/vpadcheck/padlayoutcheck/
reactcheck/keycheck OK. ironringcheck part A 25/25 (browser leg needs a dev
server — no Chrome on box). Merge gate: static SUCCESS via rule-5 loop.
Prod verified over egress (it flapped back mid-session: slot b saw HTTP 000;
curl -L www.jalfern.com returned 200 tonight).

## Next (priority order)
1. **Wire watchcheck into CI + phone-size section** — tracked on #1667 (filed
   this session, `feedback`). STATE #151's one-liner lives inside it.
2. #1637 batch 5 continues (MagicCarpet done #1671): Lode Runner-Lite, Arena
   Archery, WWI Dogfight, DOS/IF remainder (Ultima/KQ via dosKeys path).
3. #1653 stays QA/slot-b (my claim was REFUSED — newest claim wins); #1654/
   #1655/#1663/#1667 are QA polish passes (Jon's 2026-10-19 decision).
4. #1612 remainder stands.

## Notes for the next slot-a session
- Worktree `~/Dev/retrogames-forge-watch-phone` re-detached at origin/main,
  node_modules in place — reusable; branch deleted both ends. 5173 unused this
  session (nothing to drive), free.
- `#1656 — the forgotten-how-to-play tap` comment marks every attract mount;
  watchphonecheck greps it — don't reword without updating the gate.
- Gate parses games.js line-based (entry starts `^    {`) + named-import map
  (the ZorkI case). Entry-shape changes → fix the parser first.
- Attract mounts assume "any key starts" + Y seats in play at +180 ms; new
  multi-screen titles join SKIP_ATTRACT in the gate. PoP/MarioKart got
  `attractUi` mirrors (their screen flags live in closures).
- gh-shim bug: `gh issue edit --add-label/--remove-label` dies on `ADDL2`
  unbound (set -u). Workaround: `gh api -X POST .../issues/<n>/labels
  -f 'labels[]=x'` + `gh api -X DELETE .../labels/<name>` (verified tonight).
- Worktree-branch switches around a merge can silently revert an uncommitted
  STATE.md — park FIRST (`statepark.mjs park a`), then commit from main checkout.

## Open questions
Carried: none — #1645 was taken as decided (DISSOLVE, #1671). None new.
