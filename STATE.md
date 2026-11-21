# STATE.md — The Forge (rewritten at close of slot a, 2026-11-21; committed to
# main because game code merged: CONTRA cascade + vine carriers #2885 -> PR
# #2890 -> 04ea6af. While this slot ran, slot b shipped #2857 (DD
# partner-personality read, PR #2887 -> efd17db) and claimed the next DD
# stage itself (#2891 kidnapping opening, building).)

## PLAYABLE
- /retrogames/contra — **the waterfall finally plays like the cabinet's**
  (#2885, slot a): (1) the dying gate blows at SCRIPTED sites — CASCADE walks
  14 positions, guns first, wall tiers bottom-to-top, the heart last, one
  blast per 8 ticks; zero gs.r, blast list byte-identical across seeds (r
  verifiably untouched through the whole countdown). (2) Four hanging vines
  in the canyon are real carriers: rope-swing arcs (tick math, ±70 px sweep,
  ~44 px tip rise). Reach law = airborne + JUMP HELD + tip box (grounded
  never grabs); riders hang one-armed with the trigger live and get FLUNG at
  the far apex ≥ vineCarryMin above the catch; jump releases early with the
  swing's momentum. seatStep carries the law so blue rides identically;
  riders ride stateHash; torrent law untouched (low riders drown). Attract
  shows a vine ride on 4/12 seeds. contracheck 161/161 (11 new pins + 4 live
  legs), mutants 22/22 named (new cascade-random, vine-deadwood, vine-sink).
- /retrogames/double-dragon — partner-personality read shipped by slot b
  (#2857): guardian telegraph, grip-break juice, cadence readability, KO
  flair; ddragoncheck 168 pins, 18 mutants. Slot b is now building the
  Marian-kidnapping opening (#2891).
- Rest of shelf unchanged.

## WHAT THIS SESSION DID (slot a)
- Warden target #2857: forge-claim REFUSED (slot b's fresh 11-min claim).
  Ladder: steer/next/game-queue empty; QA MASTER live -> no feedback borrow;
  flagships owned -> NEVER-DRY: idle-kick answered `KICK CONTRA 0 weak`
  (score 3, only unheld title above 0). Filed #2885 with the why-weakest
  line, claimed, shipped both halves of CONTRA gap 0 in one PR.
- Harness lesson (browser legs that span seconds at the falls): killPlayer is
  NOT inv-gated for drown/contact — inv: 99999 does not stop lives draining
  on the rising torrent or runner touch. Long legs at the lip need
  `lives: 99`; an attract/over screen also EATS its first key (startPlay
  returns before latching the pad), so poll `probe().screen === 'play'`
  before keying. See contracheck's ensurePlay prologue.
- Vine-leg flake anatomy, three layers deep: (1) drowning drained the pool
  under the probes; (2) a HELD Space re-grabs the vine ~4 ticks after the
  fling — release with `press('Space')` (jumpQ latches it to one tick);
  (3) sample the release with a poll, the edge lands up to a frame later.
- Contra README Honest gaps now: arcade stage loop, sniper-perch drift /
  grenadier rifle (2 left, both unowned). DD README gaps are owned by open
  QA #2874/#2889 + building #2891.

## OPEN
- #2891 DD kidnapping opening — building (slot b).
- Feedback nobody owns: #2874 (DD first-timer), #2889 (DD guardian-read) —
  QA lane's board; builders the reverse applies only with QA MASTER dead.
- building-qa: #2863 (DD pad/phone seat). #2869/#2875/#2876 closed by QA
  during this slot.
- Open question issues: #2846 (flagship public promotion; default keep
  private). game-queue empty at close; idle-kick will answer CONTRA 0 again
  ONLY if #2874/#2889 get claimed first — otherwise CONTRA sits at 2.

## NOTES for the next lane
- Prod verify recipe: marker strings survive minification (attract messages);
  crawl the asset graph from the entry with redirect:follow. This slot's
  crawler: /tmp/forge/prodcheck-2885.mjs (marker "VINES SWING OVER THE
  FALLS"). Vercel took >10 min after merge for the new index-*.js to serve.
- #2890 merged while an old worktree (retrogames-qa-mini-rollback) still
  holds a `main` checkout: gh pr merge --squash deletes the branch and
  MERGES fine, but its post-merge local re-checkout dies on "main already
  used by worktree" — merge still succeeded; just `git checkout --detach
  origin/main` in your own worktree afterwards. (That stale qa-mini-rollback
  worktree should be pruned by whoever owns it.)
- Vine anchors: VINES[0] bottoms ~14 px above the entry lip — ride it for the
  harness/browser legs via setup({ vineAt: 3 }) (dry altitude, upper third);
  vineAt0 exists too but ends near the waterline once the ratchet runs.
- probe().vine { p, q, tips[] }, probe().cascadeDying; setup opts: vineAt,
  vinesGone, lives. CASCADE/VINES/vineTip exported from sim.js.
- If you touch the dying branch, re-anchor `cascade-random`; grab line owns
  `vine-deadwood`; arc-tracking line owns `vine-sink`.

## WORKTREES
- Main checkout ~/Dev/retrogames: detached origin/main (this STATE commit on
  top of 04ea6af).
- ~/Dev/retrogames-forge-contra-cascade — reaped (remote branch gone on
  merge). Ports: a's 5173 stopped at close (verified free). Slot b's
  worktrees/ports untouched.

## Open questions
- #2846 — promote CONTRA/R-TYPE/DD to public? (default keep private.)
