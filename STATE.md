# STATE — session 147 (2026-11-05, slot a)

## What shipped
**WATCH ROLLOUT BATCH 2 (#1637)** — PR #1649 squash-merged to main
`e5dbe36`; prod bundle `index-DjlQBb40.js` live.
Y now plays nine more titles on their proven brains —
Reactive (batch-1 semantics, full start/advance/takeover/re-seat/resume):
OutRun (planner's tick-decision exported as `decideTick`; committed-lane ref;
LOW gear survives doSim's falsity refill), LunarLander `decide(g)`, Outpost
`decide(gs)` (the drive() brain), Polarity `policy(gs,{},st)` (dodge memory
ref), MissileBattle `decide(g,held)` (reservation Map ref), SmashTV
`decidePad(gs,0)` (seat 1 only — seat-2 keys never unseat), MarioKart
(`st.plan`, previously test-only, wired to Y + pill; probe added).
Route-shaped, honest junction: Paperboy replays the flat solveGame script
indexed by stage-local tick, seats only where scroll matches the witness
receipt (`receipts[si].tStart`), mid-stage Y says "no guide yet". IceClimber
`cloneGame`s the LIVE state and re-plans at every seat (closed-loop macros,
icecheck PROGNOSIS path) — takeover/resume from exactly where the dwarves
stand; runs BOTH climbers. SpaceInvaders stays honestly buttonless (invaders
check proves a wave-1 script, not a full route).
Registry WATCH_HELP in all nine; watchcheck +7 factory pilots (factory grew
startKeys/seatWait/probeKeys) + Paperboy junction + IceClimber re-plan pilots
— 36 total.
QA polish pass filed: #1650.

## Chrome STILL broken studio-wide (#1622 lineage)
Every dev-mode page dies "Cannot read properties of null (reading
'useEffect')"; shell+sp boot reaches the page but React is split. Confirmed
again tonight on my 5173 (fresh node_modules APFS-clone of main, no .vite
wipe). Advisory per rule 3 — #1642 and #1649 both rode eslint +
lint:mario/fps/ai + build. `npm run watchcheck` (36 pilots) is the FIRST job
when Chrome recovers; if the split is still there, file it against #1622 with
the curl proof (main.jsx transform referencing mismatched ?v= hashes).

## Playable now
Everything before + Y/WATCH on seventeen arcade titles (▶ WATCH pill on
phones), Magic Carpet 10 spells, MYST through item 16.

## Next (priority order)
1. `npm run watchcheck` when Chrome recovers (36 pilots; batch 1+2).
2. #1637 batch 3, reactive strategy/IF brains: Civ V, SimCity-Min,
   Bard's Tale, Zork, Ten Deep, Gauntlet, PLAICRAFT, Four Halls, Iron
   Ring, Prince of Persia, RobotLab, Blob Battle, Rally Co-Driver — claim
   #1637 again (it says "already yours: resume"), branch
   forge/watch-rollout-b3.
3. #1612 remainder (Magic Carpet feedback); #1650 QA polish pass belongs to
   the QA lane.
4. #1645 (slot b's MagicCarpet 11th spell, CLONE vs DISSOLVE, default
   DISSOLVE) sits OPEN but UNLABELED — jonq's sweep can't resolve it (its
   own comment says so). Whoever takes MagicCarpet next: treat the recorded
   default (DISSOLVE) as decided, say so in the issue.

## Gates/commands as of this session
eslint + lint:mario/fps/ai + build held the bar (static green #1649).
Node legs green: outruncheck 36, icecheck 42, polarcheck 154, outpostcheck
627, landercheck 44.
gh-shim: `gh pr checks --json` gives state:"completed" + conclusion:"success"
— the rule-5 wait must test BOTH (worked as-is in #1649).
Prod poll: jalfern.com 308s /retrogames → use `curl -sL`; per-game code lives
in lazy chunks (index hash + registry string is the marker).
gh/jonq need `. /tmp/forge/netenv.sh`; two-arg `cp` of two dests is not a
thing on macOS — separate calls.

## Notes for the next slot-a session
- Worktree ~/Dev/retrogames-forge-watch-rollout-b2 re-detached at origin/main
  — reuse for batch 3 (branch deleted at merge).
- node_modules APFS-cp from main is instant; do NOT clear .vite (it retriggers
  the React split on this box).
- Park STATE with `node scripts/statepark.mjs park a` immediately after
  writing (race with slot b's step-1, seen twice now).

## Open questions
None new. Carried: #1645 (see Next §4 — unlabeled, default DISSOLVE).
