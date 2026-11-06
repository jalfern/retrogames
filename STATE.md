# STATE — session 145 (2026-11-05, slot a)
<!-- parked-after-conflict: slot b committed session-146 STATE to this checkout
     mid-wrap; both lanes shipped tonight (#1642 slot a, #1639 slot b). Slot b's
     report survives via /tmp/forge/STATE.b.parked.md; this one is the slot-a
     handoff, canonical also at /tmp/forge/STATE.a.parked.md -->

## What shipped
**WATCH ROLLOUT BATCH 1 (#1637)** — PR #1642 squash-merged to main
`fd90145`; prod bundle `index-D8qwhHTe.js` live (Vercel green).
Y now plays eight classic-arcade titles on their proven reactive brains —
QBert `plan(gs)`, Joust `plan(gs)`, Galaga `policy(gs,{dodge})`, Tempest
`decide(gs,{id})`, Dig Dug `decide(gs)`, Bubble Bobble `decide(gs,0)`
(seat 1 only — friends keep theirs), Spy Hunter `decide(gs)`, Arkanoid
`decide(gs)`. Real sim at real speed; any key/pad/tap takes over exactly
where the watcher was; Y re-seats mid-run; new runs release the stick.
WATCH_HELP in all eight registry lists; badge+pill chrome shared from the
pilots; DEV hooks expose `watching()`.
Harness: `watchcheck` arcade pilot factory — 9 assertions per game
(start/advance/hold/takeover/re-seat/resume/release). Advance predicates
are prover-only: Tempest & Spy Hunter hold lives (idle dies there),
Arkanoid scores (idle never launches the ball).

## STUDIO-WIDE BROWSER BREAKAGE (tonight) — not branch-specific
Every dev-mode page dies at App.jsx:240 "Invalid hook call / more than
one copy of React" in chromeboot shell+sp — PROVEN against slot b's own
live server (5178) as well as mine (5173). Server-side proof, no browser
needed: one transform of main.jsx references react.js?v=X AND
react-dom_client.js?v=Y — two optimization rounds in one split graph.
Rebuilds (--force, fresh cache from main) all reproduce it. Browser
suites are advisory (rule 3); #1642 rode eslint + lint:mario/fps/ai +
build green. First job when Chrome recovers: `npm run watchcheck`
(27 pilots incl. the 8 new).

## Playable now
Everything before + Y/WATCH in the eight batch-1 classics (▶ WATCH pill
on phones); Magic Carpet 10 spells (#1639, slot b); MYST through item 16.

## Next (priority order)
1. Studio dev-server React split — if it survives to the next session,
   file it (QA/platform) with the curl proof; one pass, no Vite bisect.
2. #1637 batch 2, script-replay brains (resume = script-index junction or
   honest decline): OutRun, LunarLander, Paperboy, IceClimber, Smash TV,
   Mario Kart, Outpost, Polarity, Missile Battle, Space Invaders.
3. #1637 batch 3, reactive strategy/IF brains: Civ V, SimCity-Min,
   Bard's Tale, Zork, Ten Deep, Gauntlet, PLAICRAFT, Four Halls, Iron
   Ring, Prince of Persia, RobotLab, Blob Battle, Rally Co-Driver.
4. #1612 remainder (Magic Carpet feedback).

## Gates/commands as of this session
eslint + lint:mario/fps/ai + build held the bar (static green #1642).
gh-shim caveat: `gh pr checks --json` gives state:"completed" +
conclusion:"success" — the rule-5 loop's [ $s = SUCCESS ] test HANGS
under the shim; also test conclusion (as done at #1642).
pgrep dead (sysmond gone) — trace port owners via lsof + ps chains.
Plain `git push` fine; gh/jonq need `. /tmp/forge/netenv.sh`.

## Notes for the next slot-a session
- Worktree ~/Dev/retrogames-forge-watch-rollout-b1 re-detached at
  origin/main — reusable for batch 2 (branch deleted at merge).
- node_modules APFS-cp from main is instant; clearing .vite currently
  re-triggers the React split on this box.
- Worktree step-1 races both slots' STATE — always park with
  `statepark.mjs park <slot>` immediately after writing.

## Open questions
None.
