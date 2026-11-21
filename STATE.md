# STATE.md — The Forge (rewritten at close of slot b, 2026-11-21; committed to
# main because game code merged: src/games/DoubleDragon/p2pad.js shipped in
# PR #2862 -> 7b2bc7c. Rule 4 keeps turning: #2850, #2853, #2855, #2856,
# #2862 — five game-code PRs in a row across the two slots.)

## PLAYABLE
- /retrogames/double-dragon — **a friend's own pad or phone takes the blue
  seat** (#2860, shipped this session): slot-2 input (2nd gamepad via #492,
  linked iPhone via ?pads=1/#893) drives Jimmy — d-pad walk · A jump · B kick ·
  square/triangle/LB punch; any input seats drop-in for the run, chime once;
  kb WASD+FGV unions untouched; solo declines. ddragoncheck 126/126,
  mutants 12/12 named, vpadcheck 714/714. Partner personality (guardian/
  release/cadence, #2855) unchanged underneath.
- /retrogames/contra — gate-pierce law (#2854 -> #2856), pod carriers (#2847).
  contracheck 126/126.
- /retrogames/r-type — S1–S4 + S4 wing polish (#2853).
- Rest of shelf unchanged.

## WHAT THIS SESSION DID (slot b)
- Warden target #1712 REFUSED at claim — slot a's `FORGE (a): claimed
  05:56Z` checkpoint ~9 min fresh, correct; slot a is building S2 adapters
  there. Ladder: no steer/halt; `next` empty (#1712 already building);
  game-queue empty; QA borrow closed (QA MASTER alive at 5176); flagship
  stage spent. NEVER-DRY rung: `weakestStage` scored DOUBLE DRAGON weakest
  at 8 (7 unowned README gaps + fb #2857; Contra held #2842). Filed POLISH
  #2860, claimed, shipped ~1h30m in one PR: p2pad.js pure merge + seat law,
  slotFieldsFrom/GamepadBridge gain `boost` (square/triangle/LB -> slot's
  third action; phone Y already lands there), slotActive counts boost,
  registry text, README laws + gap CLOSED. Filed QA polish pass **#2863**
  (2P-ready greeting, join juice, rumble parity, seat-release taste, phone
  labels). Prod verified via www chunk-crawl (marker `triangle/LB`).

## BOARD (at close)
- building: **#1712** (PLAICRAFT S2 — slot a's; its plan per claim comment:
  SHORT ORDER SHOUT + RALLY CO-DRIVER adapters). building-qa: **#2842**
  (CONTRA ceremony — QA's).
- game-queue: empty at close. DD README gaps #1..#6 remain unowned (chain
  scoring is the meatiest left); `idle-kick` will point the next free slot
  there — re-derive, don't trust this note.
- feedback (nobody-owned): **#2852** (CONTRA pod-carrier polish), **#2857**
  (DD partner-personality polish), **#2863** (DD pad/phone seat polish).
- Open jonq (link only): **#2844** (S2 fold ruling; default keep fold),
  **#2846** (flagship public promotion; default keep private).
- QA MASTER was alive mid-session at 5176 — leave that port.

## HARNESS NOTES FOR THE NEXT LANE
- **Fake-pad browser legs work** (ddragoncheck #2860 is the reference):
  `Object.defineProperty(navigator,'getGamepads',…)` AFTER page load is fine —
  GamepadBridge polls every rAF. Three traps: button array needs **17**
  entries (d-pad is buttons 12–15); the bridge slots by LIVE-list position,
  so return `[idlePad1, pad2]` — a lone pad in the array is pad 1 and will
  drive keyboard codes; `state()` lives on `__game` (exposeGame), NOT on the
  game's `__ddTest` hook (that cost one red run).
- Hash-equivalence recipe for seat merges: run the sim twice on one seed,
  feed the same scripted stream via kb booleans vs `pressSlot(2, …)` +
  `slotPad(2,'dpad')`, compare `stateHash` every tick — pins the whole
  translation table in one check. Seat the human explicitly in both runs or
  the drop-in divergence pollutes the stream.
- `boost` added to slotFieldsFrom/writeSlot/slotActive is additive —
  vpadcheck's exact-enumeration pins unaffected (714/714).
- ddragoncheck is now **126 checks**; cadence/one-voice pins from #2851 all
  still pass untouched. Browser-leg Z-key flake note from slot a still
  stands: rerun once before believing a fresh-HMR red.

## WORKTREES
- Main checkout ~/Dev/retrogames: detached origin/main (this STATE commit on
  top of 7b2bc7c lineage).
- `~/Dev/retrogames-forge-dd-p2pad` — finished; re-detached at origin/main;
  reap freely (remote branch gone on merge).
- Ports: b's 5178 stopped at close. QA studio 5176 = QA's, leave it.

## Open questions
- #2844 — PLAICRAFT S2 fold ruling (research lane's).
- #2846 — promote CONTRA/R-TYPE/DD to public? (default keep private.)
