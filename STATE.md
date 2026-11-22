# STATE — forge board snapshot (slot a, 2026-11-22 — shipped)

## This session shipped
- **DOUBLE DRAGON — the carrier rotation** (#2944 → PR #2946 → main `ae96529`,
  prod-verified — `goon_lashwind` present in the served chunk). The later arcade
  waves fight back: whip carriers (14-tick raised-loop windup, snap at reach 34 /
  depth 9, crack-flash on the bite, point-blank folds to knuckles), stick carriers
  actually swing (+7 px over bare knuckles, wood-whistle telegraph), escalation
  kept honest (Walnuts wave 1 bare, wave 3 = whip man beside Abobo; the yard
  opens steel, second wave knife+whip), KO pays the leather into the reward loop,
  carries + windup `atkKind` ride `stateHash`, autopilot leaves the lane at the
  wider read. 12 pins + 4 mutants (`leather-short`, `carrier-thrift`,
  `escalation-flat`, `loop-cheap`); ddragoncheck 281/281, mutants 249/249,
  winnable 12/12 + 12/12 + co-op 6/6.
- **Cross-lane note:** slot b's #2947 (same gap) closed UNMERGED after mine
  landed, then slot b shipped the duel's steel retrieval (#2948 → PR #2949 →
  `b1aeaa8`) — DD's last README gap. Both lanes inside `DoubleDragon/sim.js`
  today, sequential, no conflict; read slot b's close at `63658cb` for its
  carry-over harness notes (browser-leg flakes, art.js local CFG, inv=999999
  silencing casters — all still current).

## PLAYABLE on main right now (prod-verified; private until Jon promotes #2846)
- `/retrogames/double-dragon` — carrier rotations + duel steel retrieval on top
  of the guardian-read/knockback/movie stack. 281 laws / 250 mutants.
- `/retrogames/r-type` — duelist pursuit + sting interceptors.

## Board at close
- `game-queue` empty; `feedback` = **#2938** (R-TYPE duelist polish — QA
  RELEASED it mid-session, plain feedback now); `building` = #1712 only
  (lane:research big-build, not game code); `building-qa` = none, but THREE
  `QA MASTER` sessions were live at close (studio/mini/mini2) — expect #2938
  back under `building-qa` within the hour.
- `idle-kick.mjs` on origin/main = **KICK R-TYPE 0** (phase-2 volley pre-dodge;
  #2938's items don't own it). DD's README is gap-free (DISCLAIMER only).
- 3 jonq AWAITING: #2846 (promote flagships, due 11-23 — TOMORROW, default keep
  private), #2908/#2930 (QA lane DD seat laws, due 11-24).

## Next lane starting here
- Ladder first: halt/steer/next all clear, queue empty → oldest feedback #2938
  — but the borrow is gated OFF while `pgrep -f "QA MASTER"` finds a live QA
  session (it did at this close); if QA took it, the rung is KICK R-TYPE 0
  — and once #2938 is `building-qa`, R-TYPE is QA-held, skip it, and re-derive
  (`weakestStage` will look past the empty DD to the rest of the shelf).
- If the whole shelf reads owned and QA holds everything, do NOT burn the
  session: STOP is legal; dry-shelf jonq unlocks ~11-27 (#2795 cap).

## Open questions for Jon (links only, #605)
- #2846 — promote CONTRA / R-TYPE / DOUBLE DRAGON to public? (due 11-23,
  default keep private).
- #2908, #2930 (QA lane) — DD idle-seat / CPU-handback laws (due 11-24).

## Harness notes (new this session; slot b's at `63658cb` also stand)
- Browser legs flaked across two full runs under dual-lane machine load
  (#2889 tag-ink white=0 once; game-over drain legs once) and 281/281 came
  back clean on unchanged code — rule-3 flake, rerun once, move on. The
  required gate `static` was green on the merge.
- `flagshipStage`/`weakestStage` return the index within the FILTERED gap list
  and read READMEs from the CHECKOUT you run in — a worktree at an older
  commit re-kicks gaps main already closed. Run idle-kick from a fresh
  origin/main checkout before believing it.
- Hash additions (carries/atkKind) shift every dd state hash — all existing
  pins are relative, so they held; any future ABSOLUTE hash pin must be
  re-derived after gameplay changes.
- Never merge with `git push origin forge-<slug>` — dd branches are
  `forge/<slug>` (slash), and `npm run dev` fails silently in a fresh worktree
  without its own `npm ci` (the main checkout's node_modules is empty).

## Slots / ops
- Slot a port 5173 STOPPED with `scripts/devstop.sh` at close; other lanes'
  ports untouched (5178 was slot b's, stopped by b).
- Worktree `~/Dev/retrogames-forge-dd-weapons` left detached at origin/main
  (`forge/dd-weapons` deleted by the squash-merge).
- STATE.md committed straight to main here — allowed only because a forge game
  merged this session (#2946); slot-parked to /tmp/forge/STATE.a.parked.md.
