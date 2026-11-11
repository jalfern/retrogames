# STATE — session 232 (2026-11-11, slot a)

## What shipped
**SMASH TV: HEAT-SEEKER + FLAMER — the two missing original guns.** Merged as
`8e981db` (PR #2037, Closes #2032 — the warden's TARGET; claim was already
slot a's, refreshed at take). This session resumed `forge/smash-guns` found at
`39db2f3` and added the live layer + number consistency: six new `smashplay`
browser gates (seeker locks nearest heat at launch, curves at the 0.16 rad/tick
cap and lands its two points, warhead pixels mid-curve; flamer three-pellet
puff, one point on first contact, hard ~45 px reach, fire painted-then-gone),
and registry text + renderer comment fixed from "thirty pixels" to the ~45 px
law (`FLAME_LIFE` 20 × speed 2.2). Post-merge follow-ups `#2042`/`#2043`
(gate reads the snapped warhead; warhead snaps to pixel grid) landed the same
evening; **re-verified on final main**: smashcheck PASS 683, smashplay 34/34
live, lint gates + eslint + build green, prod entry chunk `index-BpUW5u-L.js`
carries HEAT-SEEKER + missileFizzle → https://jalfern.com/retrogames/smash-tv.
#2032 shipped+closed (labels moved, live URL posted). Step 8b not filed: this
was a polish stage on an existing title, and SMASH TV's QA pile (#2028/#1978/
#2011 pan-framing) is already open.

## The session's catches
- **Corpse inference can be wrong — filed #2045.** Claim 19:12Z + push 20:12Z
  + zero checkpoint comments read as a dead session; the slot-a session that
  made them was alive (vite orphan ppid=1 sealed the misread), and the warden
  had also put TARGET #2032 on slot b (20:09Z) and on slot a again (20:29Z —
  me). Three lanes overlapped one issue; #2037's squash was won seconds before
  my rule-5 loop ("already merged" — re-check what landed, don't assume your
  merge won). No work lost: `599ea8d` (my gates) is inside `8e981db`. Before
  killing a listener on your own port: check the worktree/branch it serves.
- **Debris ages on DRAW frames, not sim ticks.** A tight `stepWith` loop
  starves the painter, so kill-burst particles never decayed and poisoned a
  pixel gone-check. Wait real `raf()`s (~30) before post-effect pixel probes.
- **Sprite palettes collide with feature colors.** The turret dish blinks
  `#ffd23f/#ff8a3f` — identical to fire. Pixel gates must sample short of
  enemy sprites or clear the board first.
- **First-contact ≠ dwell damage.** Fire dwells ~6 ticks × 3 pellets on a
  body (contact-range king). Like smashcheck, live gates pin the FIRST hp drop
  (one point), not end-of-stream hp.

## Ladder trail
TARGET #2032 mine → resumed 39db2f3 (see crossings above) → gates → shipped.
No halt, no steer. `next` #1711: no new binding beyond Jon's 19:14Z post
(executed by session 231/b — #2040 shipped). game-queue empty; QA borrow
skipped (QA MASTER live on studio; never double-claim). flagshipStage null.
No jonq filed (#2045 is an observation issue, not a question; jonq: none open
games-lane).

## Open questions
- none (see waiting-jon issues).

## Next
- #1637: b29 shipped `#2034`. Read the issue's last FORGE comment before
  claiming — it lists which WATCH batches the rollout still owes.
- PPM drain law still stands (session 230): do not re-pick PPM at weakestStage
  while its 8-open feedback pile + #2020 sit unowned.
- SMASH TV's open QA feedbacks (#2028/#1978/#2011, pan/framing) belong to the
  QA lane; builders leave them unless directly asked.
- #2045 (this shift): lane liveness crossings — slot-scoped park READ + server
  liveness beside the comment clock are open harness improvements.
- Dev servers: slot a 5173 stopped at exit; slot b 5178; QA studio 5176. The
  `~/Dev/retrogames-forge-smash-guns` worktree was left on `forge/smash-snap`
  (merged #2043) — restore found state before touching it. `--mutate` only in
  an exclusive window ≥20 min.
