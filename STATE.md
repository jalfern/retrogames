# STATE.md — The Forge (rewritten at slot a close, 2026-11-22; COMMITTED: game
# code merged this session — R-TYPE Options-launch, PR #2926 → 03dfd39.)

## PLAYABLE (main)
- /retrogames/r-type — OPTIONS-LAUNCH is live (#2925 → PR #2926 → 03dfd39):
  N (seat one; M alternate) and H (seat two) hurl every DOCKED orb forward as
  a one-shot drone at 4 px/tick, straight down its lane. Soft Bydo eat the hit
  and the orb with it (pod damage 3, carries score, spills carriers); armour
  (slab/dread/fortress/tank) refuses and burns it like the shell; the horizon
  spends what nothing else did. Flying orbs fire nothing — the #2919 wall
  travels with the throw. Spend the pair and the armour slot opens: the next O
  pod re-arms a fresh pair (500, not a spare's 1000) — trade, not tax. Wrecks
  strip docked AND airborne orbs (power-armour law untouched); seats throw
  their own pairs (S4). Zero rng; fly bit rides stateHash; pressed streams
  replay hash-for-hash. rtypecheck 199/199 (18 new #2925 laws) + 20 named
  mutants red-and-named (new: launch-deaf, rearm-deaf). Prod verified
  (optlaunch in index-5kKFKIvP.js).
  Fidelity interpretation (#237, recorded on the issue): cabinet shares one
  launch button shell+orbs; B is already POD here, so the throw got its own
  verb per seat's cluster; the gap's word DISPOSABLE = no mid-flight recall.
- /retrogames/r-type — Half-Capsule H (#2922 → 03dfd39's parent chain),
  Options pods (#2919), Double/Speed pods (#2915), full SSE loops on the shelf
  (private until Jon promotes — #379).
- /retrogames/contra — hangar sorties + fixed-spot pods; /retrogames/double-
  dragon — opening movie + seat greet/join rumble (#2863 → 99a9852, QA lane).

## WHAT THIS SESSION DID (slot a)
- Ladder empty (steer/next/game-queue none; feedback #2889/#2863 QA-held; live
  QA sessions on mini/mini2 → no borrow). idle-kick answered `KICK R-TYPE 0` →
  filed POLISH #2925 (game-queue + lane:games), claimed via forge-claim.sh,
  built in `forge/rtype-optslaunch`, gated (eslint, lint:mario/fps/ai, build,
  rtypecheck 199/199 sim+browser incl. real KeyN through the shell, mutants
  195/195), merged rule-5, prod-verified, shipped label, issue closed.
- Winnability re-measured: solo 7/12 (floor ≥4), co-op 11/12 (floor ≥6) — the
  autopilot never throws, floors untouched by design.
- Registry controls gained two discoverable lines (O capsule + THROW); pad keeps
  POD (Jon's no-second-pad rule) — mobile throw recorded as an honest gap.

## OPEN
- building: #2931 "R-TYPE: the throw for the thumb" (phone-pad Option-launch,
  THROW = KeyN) — filed and claimed AFTER my merge (not ours; likely slot b).
  It closes the keyboard-only gap I left; whoever holds it: the sim verb is
  already pad `l` (contract button +l, setup throwOptions, probe optsFly) —
  wiring the pad is pure shell work.
- building-qa: #2889 + #2863 (DD polish) still with QA (#2863 shipped 99a9852,
  label trail may lag).
- game-queue empty otherwise; R-TYPE README honest gaps (duelist, carrier
  interceptors, Phase-2 salvo pre-dodge, wing auto-shell, dark-seat life) stay
  unowned — the shelf is not dry.

## NOTES for the next lane
- Throw keys: seat one KeyN/KeyM, seat two KeyH (press-latched like podQ;
  cleared in startPlay/reset). VirtualControls untouched (POD/KeyB).
- Mutant anchors added this stage: `if (!frozen && sAlive && lPress && s.opts) {`
  (launch-deaf) and `if (!os.length) ent.opts = null // the armour is gone; …`
  (rearm-deaf) — both unique strings; the older twin-collapse/speed-deaf order
  is undisturbed.
- Orb law worth keeping: px/py written once per tick (refreshOptsOn owns fly
  motion: `if (o.fly) { o.px += OPT.launch; continue }`); optDrones spends
  (soft→ram+boom+optspent, armour→strain+optspent, edge→optspent); empty
  array ⇒ opts=null so takeSpecial re-arms. Inbound orbs cannot be thrown
  (throw answers only docked). `optAnn` stays juice, never hashed.
- The 308 note stands: curl -L jalfern routes; R-Type code lives in a lazy
  index-* chunk — verify deploys by grepping chunk bodies (optlaunch);
  tip-moves after merge change chunk names — enumerate from the live entry.
- Dry-shelf jonq ask unlocks ~11-27 (#2795 answered 11-20; 7-day rule).

## WORKTREES
- Main checkout ~/Dev/retrogames: detached origin/main @ 99a9852, this STATE.md
  committed on top (game merged → allowed) and pushed.
- ~/Dev/retrogames-forge-rtype-optslaunch: this lane's worktree, branch
  forge/rtype-optslaunch squash-merged and deleted on remote; worktree can be
  pruned (`git worktree remove --force ~/Dev/retrogames-forge-rtype-optslaunch`
  — it holds node_modules/dist).
- Port 5173 stopped with scripts/devstop.sh at close. Other lanes' ports
  (5174/5179 + slot b's) untouched all session.

## Open questions
- #2846 — promote CONTRA/R-TYPE/DOUBLE DRAGON to public? (default keep
  private, due 11-23 — Jon.)
- #2908 (QA lane) — DD idle-P2 seat law (not ours, linked for the board).
- No new question filed this session — the board had work; nothing taste-level
  needed Jon.
