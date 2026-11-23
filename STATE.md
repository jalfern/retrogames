# STATE — forge board snapshot (slot b, 2026-11-23 — shipped)

## This session shipped
- **FIRE CREW — voices in the smoke** (#2994 POLISH, never-dry kick → PR #2996 →
  main `d85467e`, prod-verified: live chunk `FireCrew-CDiZoV02.js` carries the law).
  - Never-dry (NEVER-DRY #1571): idle-kick said `KICK FIRE CREW 0 weak` — it scored
    because the #1712 prod-line README bullet used `**DISCLAIMER — …:**` while
    `parseGaps` declines only the exact `**DISCLAIMER**` shape. A human-data decided
    state must not be built (#2488), so: marker normalized AND one real gameplay fix
    shipped with it. `firecrewcheck` now pins the README scores zero — the kick stops
    landing here; at close idle-kick answers **NONE** (whole shelf gap-free or held).
  - Game edge: `cryAt(g, seat)` + `helpCry(dist)` in sim.js — the information split's
    mirror law: still-hidden victims cry omni-directionally across their OWN floor,
    `CRY_RANGE = 5` tiles (light is directional/long, sound omni/short); found,
    carried, rescued, lost are silence; no voice crosses the decking. Per-seat like
    `lightAt` — on 3P only the seat in earshot hears. `step()` names a new voice once
    per victim, human seats only (`SOMEONE'S IN THERE - LISTEN`); cpu/seated-WATCH
    silent (#2989 law); shell fires specs on `CRY_BEATS = 30`. No direction named,
    no drawn marker — closing in stays the light's job. Pure/rng-free: hash-invisible
    `cried` flag, replay byte-exact, autopilot untouched.
  - Proof: firecrewcheck 228/0 (+27 incl. audible-but-unlit band as real geometry +
    6 src pins), firecrewplay DRIVE GREEN +7 real-tick legs (walk-in→cry, out of
    carry→silence, seated→ears shut, released→reopens), datasetcheck 84/84, lint×4
    + build. 5 mutants die by name (reach/hidden-only/decking/closeness/human-stamp;
    commands + measured kill counts in README).
  - QA briefed on #2994: per-seat earshot needs human 2P verification; ping-pong
    re-cry is law, card spam is bug; visual marker forbidden; runTo rates must not move.

## HAZARDS found this session (read before touching the main checkout)
- **The main checkout `~/Dev/retrogames` is CONTAMINATED with un-pushed live work**:
  dirty `src/games/Contra/{index,art}.js` + `scripts/contracheck.mjs` (the #2971
  touch-aware attract copy — `MESSAGES_TOUCH`), appeared ~01:50Z. The pushed
  `qa/contra-trainable-polish` (656f950) does NOT contain it. A QA session (#2971
  building-qa) is editing in the MAIN checkout instead of its worktree. NOBODY
  `git checkout -- .`, `git restore`, `clean`, or `add -A` there — it would destroy
  the only copy of that WIP. The QA lane should rescue it into its branch.
- **Two slot-b forge sessions ran at once** (#1782 family): this session (cry-smoke,
  claim #2994 01:12Z) plus a second claiming `FORGE (b)` for #2997 (FloorBoss
  solo-path echo) at 01:57Z, worktree `retrogames-forge-floorboss-echo` at
  `11a4e3d`, branch not yet pushed. Its claim stands (liveness newest-wins on #2997);
  do not double-claim that issue. If it died, it is a resumable corpse per step 1b.

## PLAYABLE on main right now (prod-verified)
- `/retrogames/fire-crew` — walk the hose in off the lit street and listen: the lost
  wail from the dark, closer-louder (this session).
- `/retrogames/floor-boss` — the drain rings its banked tap (#2992, slot a).

## Board at close
- `game-queue` empty; idle-kick: **NONE** — every unheld title is gap-free (the
  fire-crew marker fix closed the last scoring gap). STOP is legal; the only dry-queue
  question left for Jon is a new flagship title (not filed — a shipped shift is not
  the moment).
- `building`: #2997 (second slot-b session, see hazard). `feedback`: #2971 (contra,
  QA-held — and the owner of the contaminated files).
- `steer`/`next` empty. No `halt`.

## Open questions for Jon (links only, #605)
- (none open; none filed this session.)

## Harness notes (carry-overs)
- **Prod verify two ways:** jalfern.com 308-redirects to www.jalfern.com — use `-L`
  or www; and apostrophes are escaped in minified chunks (`SOMEONE\'S`), so pick
  apostrophe-free markers ("IN THERE - LISTEN" found the chunk first try).
- Rule-5 loop exit code lies when a QA worktree squats on local `main` (#2975 again):
  merge verified via PR state + origin/main; re-detach yourself (`git checkout --detach
  origin/main`) and `git branch -D` the local forge branch by hand.
- Consent-gate latency law holds; silence legs wait for msgT===0 before forcing
  (stale stamp mid-decay reads like a violation, #2989 lesson — applied in play legs).
- Mutant discipline: commit+push first (clean tree), run seds, verify named kills,
  restore, re-green 228/0 before shipping. README mutant docs must match MEASURED
  kill counts (silence-expecting gates pass vacuously — the pair gates are what die).

## Slots / ops
- Slot b port 5178: this session's dev server stopped via `scripts/devstop.sh 5178` ✓.
  (If the second slot-b session exists it could not bind 5178 — strictPort.)
- Worktree `retrogames-forge-firecrew-cry-smoke` removed after merge.
  `retrogames-forge-floorboss-echo` belongs to the OTHER session — untouched.
- Main checkout: detached at origin/main tip; STATE committed (game merged ✓) +
  `statepark.mjs park b`. The Contra dirt above remains uncommitted, untouched.
