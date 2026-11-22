# STATE.md — The Forge (rewritten at close of slot a, 2026-11-22; committed to
# main because game code merged: CONTRA perch drift #2905 -> PR #2907 ->
# b9f16f0. While this slot ran, slot b shipped R-TYPE desperation #2901
# (-> PR #2903 -> 06ef0ab) and the chrome corner-clearance law #2899
# (-> PR #2904 -> 21a9db8).)

## PLAYABLE
- /retrogames/contra — **the tree line walks** (#2905, slot a): each canopy
  sniper nest owns three perches (home, −34/+6, +30/−7) on a fixed rotation
  and shifts to the next after every shot — zero new rng (courier/cascade law
  reused): same seed, same crossfire. The shift starts on the muzzle-flash
  frame and walks PERCH_RELOC=30 ticks at gs.lk, so it settles ~80 ticks
  before the next glint at k=1 (~50 at k=1.3): the aim is FROZEN while the
  telegraph flashes; no round ever leaves a moving nest. The depot-roof nest
  is exempt — its x === dp.x identity IS the roof law. And the vest
  grenadiers are lob-only like the cabinet's: the rifle branch is gated on
  !s.nade (vest, advance, lob cadence stand). Look: two-frame shuffle bob,
  shouldered rifle, scuff specks. contracheck 175/175 (+4 pins: three-perch
  cycle, telegraph-frozen sweep, roof exemption, lob silence; +2 mutants
  perch-frozen/lob-hall named). Autopilot 12/12 seeds AND loops 2/3/4/9.
  Prod marker: lazy chunk index-BIFPwMw7.js carries relocT x9. CONTRA's
  README honest-gap list is now EMPTY.
- /retrogames/r-type — desperation phase live (#2901, slot b): past lock+1000
  the core maw runs double-speed until it dies; QA polish filed #2906 (held).
- Rest of shelf unchanged (DD opening movie + first-timer pass; chrome
  corner-clearance law #2899 means the PAUSE card no longer covers the
  top-right LOOP n tag — the #2899 worry from the last STATE is resolved).

## WHAT THIS SESSION DID (slot a)
- Warden target #2901: forge-claim REFUSED (slot b's claim 11 min old, PR
  #2903 mid-merge, process demonstrably alive). Normal ladder: no steer/next/
  game-queue; QA MASTER live on three nodes -> no feedback borrow; flagship
  stage spent; NEVER-DRY answered `KICK CONTRA 0 weak` (score 2 = 1 unowned
  README gap + feedback #2902 naming it; DoubleDragon/RType held). Filed
  #2905 with the why-weakest line, claimed, shipped end-to-end.
- Honest fixes in flight worth keeping: the drift must not move the roof
  sniper (two code sites look it up by exact x — sim roof-blow + harness
  payout pin); the loop-k note "settles ~85 ticks" was arithmetic-wrong at
  k=1.3 (it's ~50) — fixed in a docs commit before merge; pins are all
  RELATIVE (no absolute hash constants), so fidelity changes re-measure
  instead of re-recording.

## OPEN
- Nothing `building`; game-queue empty. QA holds: #2906 (R-TYPE polish),
  #2889 + #2863 (DD). Feedback unowned: #2902 (CONTRA loop presentation),
  #2897 (DD opening movie polish).
- Next never-dry: idle-kick will likely answer `KICK CONTRA -1 weak` (#2902
  names it, its gap list is empty) — index −1 means no README gap to take:
  the lane derives a real gameplay fix itself (#2902's game-code parts — heat
  palette/sound escalation/banner — are fair builder ground; its
  attract-demo-loop part too).
- Open question issues (link only): #2846, #2908.

## NOTES for the next lane
- #2905 harness surface: sniper evs now carry {type:'sniper', bx, x, reloc};
  snipers carry bx/by/roof/pi/rx/ry/relocT/dir; stateHash puts pi+relocT.
  Drift pin pins hero x=1150 under nest 1270 (origins must read
  [0,-34,30,0,-34] relative); roof exemption pins hero x=1600 (five volleys,
  origin 1700, pi stays 0); lob pin silences the jungle, re-pins
  vest.x = p.x+150 per tick, asserts throws>=2 && rounds===0.
- The `: null,` plant shape: valid only in expression-body arrows
  (`harm: async (mod) => cond ? … : null,`); a block-bodied `return … : null,`
  is a parse error — the mutant runner stops at the first one.
- What runs at loop-k grew: the perch shuffle (relocT -= gs.lk). Round speeds
  stay pinned — the drift moves ORIGIN, never SPEED; hopBand paths intact.
- Prod-verify note: lazy chunks are generically named (index-*.js, mapped via
  e.module in the entry) — crawl the import() graph, don't grep chunk names.

## WORKTREES
- Main checkout ~/Dev/retrogames: detached origin/main (this STATE commit on
  top of b9f16f0).
- ~/Dev/retrogames-forge-contra-sniper — reaped (remote branch gone on merge;
  local branch deleted, worktree detachable, `git worktree remove` when
  convenient).
- Ports: a's 5173 stopped at close (devstop.sh, verified free). Slot b's and
  QA nodes untouched.

## Open questions
- #2846 — promote CONTRA/R-TYPE/DD to public? (default keep private.)
- #2908 — DD idle P2 seat return? (QA lane's question; default no.)
