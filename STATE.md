# STATE — session 338 slot a close-out

## Shipped this session
- **PICK RUSH: BIN FILL METERS + FULL-BIN THUNK + CABLE WHIP — PR #2681 merged
  `6a72ce8`** (#2678, never-dry rung #1571; `idle-kick` answered
  `KICK PICK RUSH 0 weak` at `118cab3`). New `visuals.js`: each bin carries a
  tag-coloured ink column, landed pieces climb 1/12; at 12 the bin thunks
  (low sine+noise), flashes its rim in its tag colour, column wraps —
  `gs.binFill`/PIECES/hashes never see the wrap. Cable hangs on a light spring
  (ζ≈0.29): steady slides keep the ±4 tilt, reversals WHIP past it (+5.8 px
  at the painted centroid). Stepped in `doSim` + contract tick, NOT at paint
  rate. Contract carries binVis/binLamp/whip. pickcheck 49/49 Node (JUICE:
  exact cap, no double-thunk, restart heal, thunks===Σfloor(binFill/12),
  twin-seed SIM-CLEAN, overshoot/clamp/settle) + 24/24 Chrome (WHIP-SPRING/
  PIXELS/REST real-keyboard reversals + in-page paint recorder, METER,
  METER-FULL). Hand-mutants proven: `vis` 3 named gates red, `whip` 2.
  Prod driven clean on jalfern.com (attract 14,296 lit px, Space→play, 0 errs).
- **PRINCE OF PERSIA: honest-gap accounting — PR #2677 merged `118cab3`**
  (#2676, filed+shipped by this lane): #2670 claimed "README gap CLOSED" in
  its commit MESSAGE but never included README.md — the stale bullet had
  idle-kick answering `KICK PRINCE OF PERSIA 0 weak` forever. Struck with
  evidence; also split #2214's half-struck bullet so parseGaps counts only the
  genuinely open telegraphs gap. This un-jammed the picker: the next answer
  pointed at real work (#2678 above).

## Claims / board
- TARGET #1711: claimed per warden assignment, swept live, RELEASED to `next`
  with evidence comment — 14/14 store takes graded, nothing new since slot b's
  04:05Z sweep; line 3 (±50 ms) is purely human (all takes heard 0–2 claps,
  need 3); jonq #2652 AWAITING, default keeps waiting, nightly grader
  self-posts if a clap take lands. #2654 stays QA's.
- #2676 and #2678: filed by this lane, claimed, shipped, closed with evidence.
- Slot b shipped #2679 (Homebody drive-leg fix) mid-session; both lanes clean.

## Next queued
- Re-derive at the new main: `node scripts/idle-kick.mjs` — at `6a72ce8` it
  answered `KICK HOMEBODY 0 weak` (do NOT trust this line after any merge).
- #1711 wait-state unchanged: if a Jon take with ≥3 claps lands, `plaicraft:
  grade` self-posts the verdict → line 3 closes → #1712 promotes.

## Open questions (issues, not here — #605)
- #2652 (jonq, platform, AWAITING by Jon, deadline Nov 20 01:36Z) — phone
  take vs waiver for #1711 line 3; default keeps waiting, nightly self-grades.

## Catches for the next session (each cost probes this shift)
- **`contractHoldsLoop` stays locked after ANY contract `g.step` until
  `g.release()`.** A Chrome gate that resets then drives with REAL KEYS must
  call `g.release()` first — otherwise doSim is frozen and keyboard input
  moves nothing (my WHIP recorder sampled 18 dead frames before I read this).
- **Canvas never repaints inside a synchronous evaluate drive-loop.** Any gate
  sampling pixels after such a loop must wait a PAINTED frame (double-rAF +
  settle, the WAVE-INK fix) — the carried-CAN gate hit the #2136 family again
  with its fixed 34 ms wait; fixed in #2681.
- **Paint-rate juice starves on software render** (~12 fps): springs/animations
  stepped in paint barely reach half travel. Step at SIM rate (doSim +
  contract tick); paint only reads the value.
- **`parseGaps` drops ANY bullet containing "CLOSED by #N"** — a bullet with
  one closed sub-item silently buries its open siblings (#2214 hid the
  telegraphs; #2670's missing strike kicked PoP for days). Split bullets so
  each strike covers only what actually shipped.
- **Worktree teardown:** vite recreates `node_modules/` (as a real dir with
  `.vite/deps`) inside a symlinked-node_modules worktree; `rm -f` won't unlink
  it and the harness blocks `rm -rf`. Remove stray files bottom-up with
  `rm` + `rmdir` before `git worktree remove`, or the husk outlives the lane.
- Pick-tension precedent (#2678): when the formal oldest unowned gap is a
  pipeline task, #1571's "player-visible or it doesn't count" clause wins —
  take the shelf-honest feel remainder and state the tension in the issue.

## Lanes clean
- Main checkout detached at origin/main; this STATE commit rides alongside
  the merge (game shipped this session — rule-step-9 exception).
- :5173 dev server stopped at close; :5176/:5178 and all other lanes' ports
  untouched.
- Worktrees `retrogames-forge-pop-gapcount` and `retrogames-forge-pickrush-binlife`
  removed after merge; branches `forge/pop-gapcount`, `forge/pickrush-binlife`
  deleted (remote via squash-merge, local pruned).
