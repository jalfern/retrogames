# STATE — session 289 (2026-11-15, slot b)

## Playable now / what shipped
- **FLOOR BOSS gets a career ladder (#2346 → PR #2349, merge `02dd5ca`).**
  Clearing the quota clocks you into the NEXT shift instead of ending the run.
  `shiftParams(n)` is the whole ladder, pure in n: quota +200/rung, order wire
  540→380 (rush 320→220), deadlines −4%/rung (floor 0.72), wear −15/rung
  (floor −70). Quota law moved to EARNINGS-vs-rung (`score − shiftBase ≥
  quota(n)`; shift 1 = bit-identical to the old absolute law). `nextShift`:
  floor persists (hires/racks/freight-in-gripper), bots wear-reset, strike
  sheet new, orders/pad/belt/truck clean, escrow follows freight out (#1921).
  Fired/short ends the career; every cleared night banks. HUD `SHIFT n` + bank
  tally, earnings bar, rung-named win screen, BEST SHIFT→BEST RUN, contract
  pad-A advance, DebugKit rungs. Measured ramp: autopilot banks 5–8 nights
  across 5 seeds, then the ladder out-earns it — winnable early, bites late.
- Gates at ship: floorbosscheck 431→462 (+31: params/caps/clamp, three HEAD
  parity traces literal-embedded, earnings quota, nextShift carry law, hash/
  state rungs, 5 career ramps, 10 UI pins). Mutants killed: `--mutate-ladder`,
  `--mutate-advance`, `--mutate-bank`. floorbossplay 36/36 real keys (win →
  Enter → live shift 2, career 1689, quota 1200; short ends run; clean
  restart). lint v/mario/fps/ai + eslint + build green. Prod verified: ladder
  markers in `assets/index-CkxdkbMr.js` (entry `index-BYQmNat0.js`), live at
  jalfern.com/retrogames/floorboss.
- Rule 4: game code shipped.

## Ladder (this session's path)
- Warden target **#1711**: claim REFUSED — slot a holds the liveness namespace
  (claimed 11:14Z, released 11:17Z; their fresh audit twice: store 7 takes all
  graded, `/status writeKey:false`, jonq #2305 AWAITING). Jon-side-only; not
  re-litigated, went to the ladder per the slot notes.
- No halt/steer; game-queue empty; feedback all `building-qa` (#2336, #2330)
  or with live QA MASTER sessions on mini/mini2/studio → no borrow; flagship
  stage spent (`flagshipStage` null).
- Never-dry: `weakestStage` → BRITANNIA (score 3, oldest). Audited its gap 0
  against the ORIGINAL data before building: boarding-free is Ultima IV's real
  rule (`AVATAR.EXE` ships SHIPSHOR/SHIPSEA transition tilesets + bare
  `Board:` prompt; every gold string belongs to town NPC dialogs). Gaps 1–2
  are stage-2 milestones / check-only → nothing shippable as stage-1 gameplay.
  Audit filed as **#2353** (feedback; also owns the gap so future picks aim
  elsewhere) and cross-posted on **#2345** (slot a shipped Britannia tolls —
  QA should weigh the strings before polishing them).
- Next weakest: FLOOR BOSS (score 3) — oldest unowned gap = one-shift template.
  Filed POLISH **#2346**, claimed, shipped.

## BOARD at exit
- building: NONE. game-queue: empty.
- building-qa: **#2336** (GardenGuard), **#2330** (PoP polish).
- feedback: **#2352** (FloorBoss polish pass — mine: clock-in ceremony,
  carry-over rules text, rung pricing, per-rung rush watch, deepest-shift
  board), **#2353** (Britannia audit note — mine), #2343 (TidyBot attract,
  expect the QA lanes at it).
- jonq open: **#2305** (lane:platform, AWAITING, deadline 11-17, default hold
  — not ours to wait on).
- #1711 `next` — Jon-side remainder unchanged: his phone claptest (#2156) +
  `wrangler secret put SESSION_WRITE_KEY` → then the #2093 relabel one-off.
  No halt, no steer.

## Next (slot a or b, in order)
1. Ladder as usual. #1711: verify `/status` + store fresh at claim time; a
   clap-test take on the store means grade it + post #1711/#2156; a writeKey
   lands → execute the #2093 relabel one-off (only after jonq #2305 answers).
2. never-dry scores moved: FloorBoss gap 0 shipped (its two leftovers are
   big — 2P seats, aisle physics) and #2352 names it; Britannia gap 0 now
   owned by #2353. Candidates: SHORT ORDER SHOUT, GRAVEL YARD, TALK ME DOWN,
   BOMB DEFUSE (score 3 each), or whatever QA files after its sweep. Read
   #2353 before touching any Britannia gap.
3. Prod markers: entry HTML names the entry chunk only — walk its ~60 chunks
   with STRING-LITERAL markers (identifiers minify away; see catches).

## The session's catches
- **Zero-footprint proofs must survive their own hash.** Once `stateHash`
  gains bits, pre-change hash literals can't be reused. Extract the pre-PR
  engine (`git show HEAD:path`, re-point its imports), diff BEHAVIOR
  side-by-side per tick, and embed literal behavior traces (tick:score:shipped:
  expired marks) as the portable parity pin — that's what floorbosscheck now
  carries vs HEAD `359e062`.
- **Prod markers: literals, not identifiers.** Minification keeps
  `'NIGHTS BANKED'`/`'shiftstart'` but renames `shiftParams`/`nextShift` —
  scan chunks for strings or you'll pollute the poll forever.
- **Commit before mutants.** mutateguard refuses a `--mutate` run on a dirty
  tree (#2047 law, by design): the guard's refusal, not a bug — commit the
  gate first, then plant.
- **Old copy leaks design.** FloorBoss's over screen already promised "PRESS
  ANY KEY FOR THE NEXT SHIFT" when no next shift existed. The ladder inherited
  the promise — and `floorbossplay` pinned the old win→attract law, so a flow
  change must re-pin its own play suite in the same PR.
- **Warden pings go stale; the claim script is the authority.** The target
  ping repeated #1711 twice after slot a's fresh releases; claim-time liveness
  correctly refused — trust `forge-claim.sh`, not the prompt.

## Hygiene at exit
- Dev server 5178 stopped; foreign ports (5173/5174/5179) untouched.
- Slot-b forge worktree removed; branch `forge/fb-ladder` gone via squash;
  main checkout detached at origin/main. STATE committed to main (game merged
  — rule 9) + statepark slot b.
