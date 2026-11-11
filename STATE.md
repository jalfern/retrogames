# STATE — session 208 (2026-11-10, slot b)

## What shipped
**DEFENDER WATCH b21: dual-set witness + per-seed crash law** merged as
`b546d5f` (PR #1939, Part of #1637). WITNESS replays 40 seeds — witness
(2000+k*91) AND untuned holdout (5000+k*91): all survive 150 s, floors
pinned (witness min 7800 / holdout 1350), rescue pins raised 30→40
(measured 46/47), and the new law: **no seed loses two of three lives in a
patrol** (worst of 40 = 1). New sentinel mutant (terrain lift-off deleted)
dies under it; defendercheck 88/88 ×2, 17/17 mutants, watchcheck
--only defender 216/216. Route behavior UNCHANGED (sim diff comment-only).
No prod markers by design (game code byte-identical) — live page verified.

## The session's catch — the DF brain is at a knife-edge
Six hit-policing designs measured on the same 40 seeds, ALL rejected:
run-out guards (thr 10–20) starve the guns (104 waves → 17–33 — the kill
flow lives in the low band); momentum-braked elevators and a fresh-facing
fire gate BUY flow (best 125 waves, 55 rescues) but reshuffle one seed to
4500, inside b20's own reject band (3150–5850); dy-standoff + hot window
stalemates waves (15); duel-priority collapses the job list. The witness
dies exactly once per seed, EARLY (ticks 12–485), never late: the graze is
spawn-window paint-trades at ground level (fire window 15 < collision box
16 — whoever's collision resolves first decides), and seed outcomes are
chaotic — ANY rule nudge reshuffles the 20 runs and some seed always pays.
README carries the full table so b22+ doesn't re-litigate. LESSON: when a
system is chaotic, the win is pinning the LAW (floors + laws + holdout),
not chasing the metric — and a holdout set is what proves your pins are
law and not seed-fitting.

## Ladder trail
- TARGET #1932 REFUSED at claim (slot a held it, checkpoint 52 min) — slot a
  had ALREADY shipped it as #1935 mid-ladder; its session did the closeout.
  Don't chase, don't bookkeep another lane's issue.
- halt none; steer none; `next` #1711 hardware-stalled (audit-confirmed);
  game-queue empty; STATE-queued #1637 b21 claimed(b) → shipped. No jonq
  (no taste/priority call needed).

## Session bookkeeping
- #1637 stays `building` (rollout continues; b checkpoints fresh).
- :5178 vite runs from `~/Dev/retrogames-forge-watch-b21` (detached
  b546d5f after merge, node_modules symlinked) — reuse or kill next slot-b
  session before strictPort.
- Ladder evidence saved in #1637 comments cp1 + batch-21 SHIPPED note.

## Next queued (slot b)
1. Fresh ladder: warden TARGET, else halt/steer/next/queue games-first,
   then feedback only if no QA session is live (pgrep QA MASTER), else the
   flagship/never-dry rungs via scripts/lib/idle.mjs.
2. #1637 b22 candidates: other titles' watch gaps beat DF — the DF far-side
   interception AND the graze are both documented-closed-to-redesign until the
   sim's rescue window or speeds change (two batches of proof now).
3. QA-held items stay theirs (#1915/#1900/#1888/#1871 TMD, #1907 SI/DF,
   #1877 FB polish incl. freight/weight items, #1923 rail, #1925 carpet).

## Notes for the next slot-b session
- Run `node b21-baseline.mjs`-style dual-set measurement FIRST for any DF
  brain idea (scripts in /tmp/forge/b21-*.mjs, pattern: import sim, replay
  watchRoute over seedRng(2000+k*91) and 5000+k*91, count die/catch/wave
  events) — reject on floor bands exactly as b20/b21 did.
- `pkill -f watchcheck` before scoped watchcheck; `--only <slug>` always
  (bare positional runs the whole shelf).
- Prod recipe unchanged: new-marker + control-marker in ONE chunk — but for
  harness-only batches there are no markers; verify the page + say so.

## Open questions
- None. (No taste/priority call needed from Jon.)
