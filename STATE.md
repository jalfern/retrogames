# STATE — Forge (last: session 268, slot b, 2026-11-14)

## SHIPPED THIS SESSION
- **PICK RUSH: per-shift ambience — #2234 via PR #2237** (squash **ee10390**,
  static SUCCESS, prod-verified chunk `index-DmwFWObq.js` carries early/glass/
  graveyard eras at jalfern.com/retrogames/pick-rush): the night now changes
  character — shifts 1–2 quiet floor (distant forklift chirps, far metal rolls),
  shift 3 glass era (pneumatic hiss + belt-speed sub-harmonic wakes), shift 4
  graveyard peak (relay chatter); beeps tighten 540→420→330 ticks; hum bed
  deepens 0.05→0.07 per shift; whistle gets an air-brake whoosh. Pure module
  `ambience.js` — sim/autopilot/hash never see it; attract/over silent, mute
  honoured. Harness: pickcheck **+9 AMB gates** (5 Node + 4 Chrome),
  **36/36 node, 17/17 browser**; can-fail proven `PICK_MUT=amb` → 2 NAMED red.
  - Pick path (never-dry #1571): ladder/next/steer/game-queue empty, QA lane
    live (borrow off), flagship stage SPENT (every SSX/Emberwood/COMET HD/Myst
    README gap CLOSED) → `weakestStage` scored PICK RUSH 5 (top of shelf).
    Gap #0 skipped honestly: episode-export wiring is invisible data work (and
    its "waits on #1141" note is stale — kit shipped); README corrected.
- **#1711 (warden target, claimed and held):** cp1 audit posted — all remaining
  lines Jon-side: his 3 takes (#2156), read-key file jonq **#2218** (AWAITING,
  due 11-16), and NEW **jonq #2233**: deploy `SESSION_WRITE_KEY` (wrangler) —
  audit #2142 orders it BEFORE #2218's file; `/status writeKey:false` live.
  relabel #2093 still waits on that. Issue stays `building` (lane:platform).

## LESSONS (the expensive kind)
- **Release the contract before a live-rAF gate.** The FIRE gate drives via
  `__game.step` and leaves `contractHoldsLoop()` set — my live-beep wait timed
  out until I added `__game.release()`. Any new Chrome gate that needs real
  frames after a contract section must release first.
- **Restore the screen for downstream gates.** My section left the game in
  `play`; the WAVE-INK marquee gate expects attract and went red. End your
  section the way you found it (over-card walk: set end → Space).
- **Prod verification on jalfern: scan the entry's chunk list, not the hash.**
  CI hashes ≠ local hashes sometimes, and games ride lazy chunks; grep every
  chunk referenced from the live entry for a runtime string of yours
  (`graveyard`) instead of waiting on your local `index-*.js` name.
- Vercel deployment URLs are auth-protected — `curl` gets the dashboard, not
  the app. Verify through jalfern.com only.
- Three lanes' Chrome at once makes timing gates (WAVE-INK, PIXELS) flake —
  green on every rerun here; rerun once, per law, no thresholds touched.

## BOARD
- #1711 `building` (b) — remaining ALL Jon-side: #2156 takes, #2218, #2233,
  then the relabel one-off (relay/README has the command).
- QA lane very busy on HOMEBODY/STRIDELINE: shipped #2236, #2239 this window
  (#2154 closed); #2135 was `building-qa` at 13:17Z. Open `feedback`: HOMEBODY
  passes #2200/#2209, PICK RUSH polish #2223 (still QA's; my ambience
  PR notes the remaining #2223 items are visual), claptest flake #2136 (detail).
- Nightly: main-ok at claim AND merge; QA merged ee10390..f704bf8 after me.
  No quarantine entries, no steer/halt seen.

## NEXT (next slot)
1. Check jonq: **#2218 / #2233 answered?** If either is answered/defaulted,
   execute: write-key deployed + file exists → run the relabel one-off, then
   `npm run plaicraft:grade` on your slot port to grade any takes that landed;
   greens on 3 human takes → close #2156 and the S1 acceptance lines on #1711.
2. Ladder likely thin again — flagship stage spent; expect weakestStage.
   Next-weakest after PICK RUSH was TIDY BOT / TALK ME DOWN (4 unowned gaps
   each, tie → older registry = TIDY BOT). Verify scores fresh; don't trust
   this line — re-run `weakestStage` (label objects need `.name` mapping —
   heldDirs expects strings).
3. #2136: claptest synth ±50ms flake — the SKIP-on-slow-box fix shipped in
   #2229; check whether closing needs only a pointer comment.

## QUESTIONS FOR JON
- #2218 (read key file) and **#2233 (SESSION_WRITE_KEY deploy)** — both
  lane:platform, both open; #2233 outranks by ordering risk. (STATE.md never
  carries the questions — read the issues.)

## HOUSEKEEPING
- Main checkout detached at latest origin/main; STATE.md committed this session
  (a forge game merged) via `git push origin HEAD:main`.
- Vite :5178 RUNNING from `retrogames-forge-pickrush-ambience` (slot b port —
  reuse or kill next session; its tree re-detached at origin/main).
- Prunable worktrees when idle: retrogames-qa-2205, forge-plaicraft-* etc.
  (branches gone; `git worktree prune` won't remove dirs, `remove` does).
