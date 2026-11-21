# STATE.md — The Forge (rewritten at close of slot b, 2026-11-21; committed to
# main because game code merged: DOUBLE DRAGON chain scoring #2882 -> PR #2883
# -> 3d407b4. Rule 4 keeps turning: #2850, #2853, #2855, #2856, #2862,
# #2872, #2879, #2883 — eight game-code PRs in a row across the two slots.)

## PLAYABLE
- /retrogames/double-dragon — **the board pays flurries** (#2882, shipped
  this slot): consecutive takes multiply the payout — 1st KO ×1, then ×2 ×3,
  cap ×4 (Abobo pays 4000 at the cap). A take is a fighter KO or a barrel/
  crate splinter; pickups/stage bonuses/rescue pay flat (pinned). The chain
  dies the moment a seat eats a blow or the ~3 s window lapses; stage
  transitions carry the score, never the streak. HUD popup rides a ×N tag,
  hot chain wears a blinking tag, escalations ring a rising blip. chain/
  chainT ride stateHash — zero gs.r. ddragoncheck 153/153 (15 new pins),
  mutants 16/16 named (new: chain-frozen).
- /retrogames/contra — gate-pierce law (#2854 -> #2856), pod carriers +
  pod polish (#2847, #2852 -> #2872), gate-housings (#2880 -> #2881).
  contracheck 135/135.
- /retrogames/r-type — S1–S4 + S4 wing polish (#2853).
- Rest of shelf unchanged.

## WHAT THIS SESSION DID (slot b — the double-kick, #1258 watch)
- The warden judged slot b idle at 21:32Z and kicked a session — **slot b was
  not dead**: the 21:07Z session (same target #2882, claim fresh, checkpoint
  4f385ae at 21:24) was alive mid-suite. Two slot-b sessions then shared one
  issue, one worktree and port 5178 for ~10 min. Outcome benign: the live
  builder finished first (PR #2883 merged 21:37:44Z, prod-verified, labels,
  close, STATE a1acd5d all by it); this lane's push died on the already-
  deleted branch ref — force-with-lease + one-merge-on-ref kept both lanes
  honest. This lane's distinct contribution: an independent full gate of the
  exact shipped commits (eslint + 3 lint gates, ddragoncheck 153/153 twice —
  pre- and post-rebase, mutants 16/16 named, build green) and confirmation
  that step 8 landed. No duplicate PR/STATE was pushed over the twin's.
- Lesson for idle-detection: a quiet issue ≠ dead lane — the 21:24 checkpoint
  was 8 min old when the kick fired. A lane mid-suite is silent by design;
  warden idle rules should age the newest checkpoint comment and slot-port
  liveness together before killing.

## BOARD (at close)
- building: none. building-qa: #2869 (FROGGER zigzag), #2875 (BOULDER DASH
  first-timer), #2876 (ZORK I first-timer).
- game-queue: empty, and the shelf derives **dry**: weakestStage null,
  neverDrySlots [] (every gap on every unheld title is owned; the DD README
  gaps after chain are owned by open QA #2874/#2863/#2857). If the next free
  slot re-derives dry, the only legal dry move is the one-per-lane-per-week
  `jonq ask` "which new flagship title?" — check the week budget first.
- feedback (nobody-owned): #2874, #2863, #2857 (all DOUBLE DRAGON) — the QA
  lane's job; step 8b polish pass stays waived for DD while they stand.
- Open jonq (link only): #2846 (flagship public promotion; default keep
  private).

## HARNESS NOTES FOR THE NEXT LANE
- **A fresh worktree needs `ln -sfn ~/Dev/retrogames/node_modules`** — eslint
  dies ERR_MODULE_NOT_FOUND @eslint/js until then (established lane pattern).
- **Both-banks-die browser legs flake on a fresh worktree's first HMR
  compile** (as #2877 predicted); rerun once before believing — 153/153 clean
  second time.
- **Pushing a body onto a live fixture enemy**: Billy's kick is live ~19
  ticks after a scripted KO — idle until `billy.state==='idle'` or the
  pushed attacker bowls down mute (cost one red run).
- **Camera clamp bites stage fixtures**: after enterStage2, walking past
  x>640 needs `gs.camX = 640` first (the #2877 end-cam trick).
- 2d pixel legs (querySelector canvas @ width 320), fake-pad recipe, castPx
  export, stage-banner pixel poll: unchanged from #2877/#2882 notes.
- ddragoncheck is now **153 checks**; every pre-#2882 pin untouched (isolated
  KOs still pay exact base — chain starts at ×1).

## WORKTREES
- Main checkout ~/Dev/retrogames: detached origin/main (this STATE commit on
  top of the 3d407b4 lineage).
- `~/Dev/retrogames-forge-dd-chain` — reaped (remote branch gone on merge).
- Ports: b's 5178 stopped at close (verified free). QA nodes live on
  5174/5176/5179 — leave them. Slot a's dev server — leave it.

## Open questions
- #2846 — promote CONTRA/R-TYPE/DD to public? (default keep private.)
