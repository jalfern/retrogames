# STATE — session 335 slot a close-out (THE BAY RIDES THE STAMP)

Slot-a run ~03:33–04:25Z. Warden TARGET #1711: claim REFUSED at attempt 1
(b live, newest comment 18 min old). Normal ladder: steer/next empty (#1711
held), game-queue empty, the only `feedback` (#2654) was QA's live
`building-qa` (#2661 mid-flight) → flagship stage SPENT (every SSX/Emberwood/
COMET DRIFT HD/Myst gap CLOSED or DISCLAIMER'd) → NEVER-DRY rung: `weakestStage`
picked EXCITEBIKE (score 2). Filed POLISH #2665 with the why-weakest line,
claimed, shipped game code. AGENTS rule 4 satisfied.

## Shipped this session
- **#2665 EXCITEBIKE bay stamp — PR #2668 squash `eaae573`** (static SUCCESS;
  prod verified: the live chunk carrying `excitebike.lap-tip.v1` holds both new
  markers). The EDIT TRACK cursor now rides the splash cursor's little bike
  (RIDE palette — black tyres, yellow rims, red body, white helmet) seated on
  the surface at the cursor, bobbing two frames at the splash cadence
  (`BOB_TICKS`=15 ↔ svg `bikebob 0.5s steps(1)` — bay and menu beat as one
  clock), hiding under ERASE where the red X owns the ground. Ghost silhouette +
  fit bar stay the legality proof — the stamp is identity, not verdict. The
  palette strip speaks its kinds: every label paints in its `KIND_COLOR`
  (grey chalk gone; #2651 layout byte-stable, selection keeps wash+bold).
  Laws live ONCE in `custom.js` (`bikeBob`/`KIND_COLOR`/`toolLabelColor`),
  `index.jsx` paints and takes a `bayPaint` receipt via the probe.
  Proof: excitecheck **480/480** (+11; hand-mutant `%2`→`%3` on `bikeBob`
  died on 2 named pins), exciteplay **165/165** (+5: 55 exact RIDE-red px in a
  cursor-seated window, sprite centroid flips exactly −1 px per parity flip,
  ERASE window zero-red, per-label paint-time `fillStyle` receipt + WATER-blue
  hue px in the dark band); lint:mario/fps/ai + build green; visual shot
  reviewed (stamp reads as a mini bike at a glance). Sim/codec/receipts:
  untouched — presentation law only.
- README gap bookkeeping: gap-1 CLOSED; gap-0's VS-mode lap clause got the
  **DISCLAIMER** marker (#2488 doctrine — decided state: #2625 already gave
  the designer the lap choice, exact VS range is operator lore). EXCITEBIKE
  now scores 0 on `weakestStage` — honest-gaps list empty again.

## Claims / board
- #1711 stayed b's (it shipped its #2664 gate mid-shift, `dc82757`).
- #2665 claimed → shipped → closed; QA #2661 merged right after (`aa6c8f6`).
- game-queue empty at close; steer/next empty. No new jonq filed (nothing
  taste/priority-grade; #2652 platform-lane still AWAITING — never waited).

## Next queued
- Re-run `node scripts/idle-kick.mjs` at whatever tip is current — the pick
  has moved (EXCITEBIKE's two gaps are resolved now; #2654 closed; flagship
  stage still spent). Do NOT trust this file for the pick.
- QA lanes own the polish backlogs; builders stay on game code.

## Open questions (issues, not here — #605)
- #2652 (jonq, platform lane, AWAITING, deadline 2026-11-20) — Jon's phone
  take vs waiving the phone shape for #1711 line 3. Not this lane's to answer.

## Catches for the next session (each cost probes this shift)
- **The start-line gate poisons whole-stage red scans.** `PAL.gate` red
  (#e40000) paints at the banner — an open-field exact-red scan read n=196 at
  centroid (43,90) and false-failed three bay gates. Window pixel gates around
  the paint-time receipt instead (25x24 at the cursor seat).
- **6 px label glyphs AA to zero exact pixels.** Never exact-match small text
  colours; prove colour identity with the paint-time `ctx.fillStyle` receipt
  (capture what actually hit the canvas) plus one hue class no background can
  fake (WATER-blue in the dark strip band).
- **`gh pr merge --delete-branch` removes the worktree dir out from under a
  session whose cwd it is.** If the session was `session_move`d into the
  worktree, move it back to the main checkout BEFORE merging (or expect every
  later tool call to die "Working directory does not exist").
- Prod-verify URL builders can themselves hit the retrogames/retrogames trap —
  strip a leading `/retrogames/` (or any repeated prefix) from hrefs before
  joining. First BFS answered 0 sightings from this, not from a missing deploy.
- The rule-5 merge loop still can't start before CI registers checks — one
  `gh pr checks` peek (IN_PROGRESS seen) before the loop; the empty-array
  null.state instant-fail is still lurking for the unwary.

## Lanes clean
- Main checkout detached at `origin/main`; STATE.md lands via its own STATE PR
  (game merged, so step 9 allows it); parked slot-scoped then shared.
- :5173 stopped (mine); foreign ports untouched. My worktree gone with the
  merge (gh), pruned; foreign worktrees untouched.
