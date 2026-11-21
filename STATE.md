# STATE.md — The Forge (rewritten at close of slot b, 2026-11-21; committed to
# main because game code merged: DOUBLE DRAGON chain scoring #2882 -> PR #2883
# -> 3d407b4. Rule 4 keeps turning: #2850, #2853, #2855, #2856, #2862,
# #2872, #2879, #2883 — eight game-code PRs in a row across the two slots.)

## PLAYABLE
- /retrogames/double-dragon — **the board pays flurries** (#2882, shipped this
  session): consecutive takes multiply the payout — 1st KO ×1, then ×2 ×3, cap
  ×4 (Abobo pays 4000 at the cap). A take is a fighter KO or a barrel/crate
  splinter; pickups/stage bonuses/rescue pay flat (pinned). The chain dies the
  moment a seat eats a blow or the ~3 s window lapses; stage transitions carry
  the score, never the streak. HUD popup rides a ×N tag, hot chain wears a
  blinking tag, escalations ring a rising blip. chain/chainT ride stateHash —
  zero gs.r. ddragoncheck 153/153 (15 new pins), mutants 16/16 named
  (new: chain-frozen).
- /retrogames/contra — gate-pierce law (#2854 -> #2856), pod carriers +
  pod polish (#2847, #2852 -> #2872). contracheck 135/135.
- /retrogames/r-type — S1–S4 + S4 wing polish (#2853).
- Rest of shelf unchanged.

## WHAT THIS SESSION DID (slot b)
- Warden target #2880 (CONTRA gate guns) was REFUSED at claim — slot a held it
  live; slot a shipped it mid-my-session (PR #2881 -> 9461289). Normal ladder
  after the refusal: no steer/halt, next/game-queue empty, QA MASTER alive
  (3 nodes) so feedback borrow closed, flagship stage spent. NEVER-DRY rung:
  weakestStage scored DOUBLE DRAGON weakest at 8 (5 unowned README gaps + fb
  #2857/#2863/#2874 naming it). Oldest unowned gap = chain scoring. Filed
  POLISH #2882, claimed, shipped in ~40 min of build.
- QA polish pass NOT filed (step 8b waived): DD already carries three open
  feedback items — #2857, #2863, #2874 — the polish round is owned.

## BOARD (at close)
- building: none (my #2882 merged; #2880 shipped by slot a as #2881).
  building-qa: #2869 (FROGGER zigzag), #2875 (BOULDER DASH first-timer),
  #2876 (ZORK I first-timer).
- game-queue: empty at close. DD README gaps #2..#6 remain unowned (Marian's
  kidnapping cutscene is the meatiest left). `idle-kick` will point the next
  free slot — re-derive, don't trust this note.
- feedback (nobody-owned): #2874, #2863, #2857 (all DOUBLE DRAGON).
- Open jonq (link only): #2846 (flagship public promotion; default keep
  private). #2844 (S2 fold/attribution) was ruled CLOSED this shift.

## HARNESS NOTES FOR THE NEXT LANE
- **A fresh worktree needs `ln -sfn ~/Dev/retrogames/node_modules`** — eslint
  dies ERR_MODULE_NOT_FOUND @eslint/js until then (established lane pattern).
- **Both-banks-die browser legs flaked exactly as #2877's note predicted** on
  first run in this fresh worktree; rerun once — 153/153 clean second time.
- **Pushing a body onto a live fixture enemy**: after a scripted KO, Billy's
  kick is live for ~19 ticks — a freshly-pushed attacker gets bowled `down`
  (harmless-looking but mute). Idle until `billy.state==='idle'` first (this
  cost one red run).
- **Camera clamp bites stage fixtures**: after enterStage2 camX resets low;
  walking Billy to x>640 requires `gs.camX = 640` (the #2877 end-cam trick).
- 2d pixel legs, fake-pad recipe, castPx export: unchanged from #2877 notes.
- ddragoncheck is now **153 checks**; every pre-#2882 pin untouched (isolated
  KOs still pay exact base — chain starts at ×1).

## WORKTREES
- Main checkout ~/Dev/retrogames: detached origin/main (this STATE commit on
  top of the 3d407b4 lineage).
- `~/Dev/retrogames-forge-dd-chain` — finished; re-detached at origin/main;
  reap freely (remote branch gone on merge).
- Ports: b's 5178 stopped at close with scripts/devstop.sh. QA nodes live on
  5174/5176/5179 — leave them. Slot a's dev server — leave it.

## Open questions
- #2846 — promote CONTRA/R-TYPE/DD to public? (default keep private.)
