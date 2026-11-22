# STATE.md — The Forge (rewritten at close of slot a, 2026-11-21; COMMITTED to
# main — a game merged this session.)

## PLAYABLE (new since last hand)
- /retrogames/contra — THE SECOND AIR LAYER is live (#2917 → PR #2918 →
  squash `c5f239e`): the parapet hangar grinds open before every sortie, an
  armoured gunship patrols the arena sky with lane-aimed SHALLOW strafe rounds
  (the hop is always the answer), three rounds take the hull (+400), pierce
  one-take, falls/winnable empty the sky. 213 pins, 29 mutants. Private
  until Jon promotes (#2846).
- /retrogames/r-type — QA's fixed-spot Double & Speed Up pods shipped
  mid-session (#2915 part 1 → PR #2916 → `9b68fac`); #2915 stays open for
  the rest of its plan.

## WHAT THIS SESSION DID (slot a) — shipped
- Resumed the #2917 corpse (draft PR #2918, sim core `c96442d`) per step 1b
  after the warden targeted it; refreshed the claim, then finished the layer:
  art (attack-plane gunship with damage stages; hangar mouth with ribbed
  shutter, chevron lintel, beacon, ember throat; fat fin-wake round), sound
  (door ratchet / lift-off chop / strafe report), 17 sim pins + 3 browser
  legs + `gunship-impervious` mutant, README gap closures + engine note.
- **The merge-blocker found and fixed (the session's real engineering).** The
  draft ramped sortie cadence by the FULL loop tempo k. The loop bank
  (autopilot seeds 1..12 at capped loops 4/9) then DIED on seeds 6 and 9 —
  the hull's shallow round arrives at the wall where there is no road, on top
  of the cannons' already-hot rearm. The draft PR's "loop bank unchanged"
  claim had only checked loops 2/3. Fix per the stage's own doctrine — bend
  the threat, never the brain: `sortieK = 1 + (k−1)/2` halves the ramp; loop
  1 byte-identical (k=1 → 1); bank clears 12/12 at 2/3/4/9. Law + finding
  are in the README and pinned (`sortieK` pin).
- Small sim hygiene found by the pins: the hangar door's grind now dies at
  the falls with the hull (`enterFalls`).
- Lessons hardened into pins this session: `gs.ev` must be cleared every tick
  in harness loops (a stale `gsfire` event made a law check blame a departed
  hull); arena floor is y=150, not the jungle's 196 (contact-law pin); the
  emergence pin must account for the hull moving on its spawn tick.

## OPEN
- building-qa: #2889, #2863 (DOUBLE DRAGON polish passes).
- #2915 (R-TYPE pods) — QA's multi-stage issue, still theirs.
- game-queue: EMPTY. Unowned feedback: none.
- #2910 (lane:platform) — parseGaps still blind to gaps inside CLOSED
  bullets; #2917's filing was the manual workaround, the fix is open.

## NOTES for the next lane
- `git fetch` first — QA ships fast (both #2916 lands mid-run).
- `node scripts/idle-kick.mjs` currently answers `KICK R-TYPE` — R-TYPE is
  no longer building-qa-held; follow the never-dry ladder from there.
- Cadence doctrine (now in CONTRA's README, worth re-reading before any
  loop-aware threat anywhere): a new threat's k-scaling is a dial; the
  autopilot bank at the CAP loop is the proof. Full-k is not automatically
  fair — test loops 4/9, not just 2/3.
- CONTRA's remaining README honest gaps are now only the long-shot cosmetic
  ones; the vertical set is complete. `gsFirstShot` (<~65 ticks at k=1) and
  "autopilot must not change" are the two pinned traps.
- Slot a's dev-port lessons from #2897 still stand (transient pixels need an
  8-tick plateau; patch the canvas counter before the start press; prod
  verification: jalfern's build has different hashes than local — enumerate
  the live entry's lazy chunks and grep for a unique sim marker, e.g.
  `gsHangarX`; the SPA 308s to www, use curl -L).

## WORKTREES
- Main checkout ~/Dev/retrogames: detached origin/main, clean; carries this
  STATE.md as the tip commit.
- ~/Dev/retrogames-forge-contra-air2: PR merged, branch deleted by the
  merge; the checkout sits detached at origin/main with deps installed —
  reusable by any lane or removable at leisure.
- Port 5173: this lane's dev server stopped via scripts/devstop.sh at close.

## Open questions
- #2846 — promote CONTRA/R-TYPE/DD to public? (default keep private, due 11-23.)
- #2908 (QA lane) — DD idle-P2 seat law (not ours, linked for the board).
