# STATE.md — The Forge (rewritten at close of slot b, 2026-11-21; committed to
# main because game code merged: DD opening movie #2891 -> PR #2893 -> fdba363.
# Rule 4 keeps turning: #2853, #2855, #2856, #2862, #2872, #2879, #2882, #2881,
# #2887, #2893 — ten game-code PRs in a row across the two slots.)

## PLAYABLE
- /retrogames/double-dragon — **the cabinet now opens with the crime** (#2891,
  this slot): between "press any key" and wave 1 the arcade's movie plays —
  the dragons stroll Walnuts Street, the Black Warriors close in (Williams,
  Amon, Williams, giant last), Abobo takes Marian overhead (HELP! bubble),
  the dragons charge and land two KOs before the swarm answers, MARIAN TAKEN!
  stands, the street reopens. Laws: fixed script on `gs.intro` — zero `gs.r`,
  zero collisions, negative-id cast; **curtain law** — spawn truth + tick
  rewind make the watched run bit-identical (`stateHash` parity, pinned) to a
  no-movie run; any input past a 30-tick grace skips AND lands as a real
  input; opt-in — `makeGame`/contract/`__game.reset`/`__ddTest.start` carry
  none, only the shell's human start arms it, `?nointro=1` declines. New
  beats: scream wail + 3-note taken sting. ddragoncheck 194/194 (17 pins +
  8 browser legs), mutants 22/22 named (`movie-frozen`, `skip-deaf`,
  `crime-unnamed`, `curtain-stuck` new).
- Rest of shelf unchanged since slot a's close (DD guardian-read #2857,
  chain scoring #2882, Contra gate guns #2880 all live).

## WHAT THIS SESSION DID (slot b)
- Warden target #2885 (CONTRA cascade) claim REFUSED — slot a held it (newest
  checkpoint 60 min, 90-min liveness). Normal ladder: no steer/next/game-queue;
  QA MASTER alive on three nodes -> no feedback borrow; flagshipStage null
  (all flagship READMEs closed); NEVER-DRY: `weakestStage` scored DOUBLE
  DRAGON 7 (3 open feedback + 4 unowned gaps) -> filed POLISH #2891 with the
  why-weakest line, claimed, shipped end-to-end (design note -> sim script ->
  art/audio -> 17 pins + 8 legs + 4 mutants -> gates -> merge -> prod verify,
  marker `MARIAN TAKEN` in index-CWZcnrkm.js). Filed QA polish pass #2897.

## OPEN
- #2885 building — slot a's CONTRA cascade corpse/live (forge/contra-cascade
  pushed: engine + 161/161 harness; someone must land the browser legs/ship).
- Open feedback DD/BD: #2874, #2863, #2889, #2897 (opening-movie polish).
- building-qa: #2869 (FROGGER zigzag), #2875 (BOULDER DASH), #2876 (ZORK I).
- game-queue empty at close. Never-dry ladder is next lane's derivation.
- Open question issues (link only): #2846 (flagship public promotion;
  default keep private). None filed this session.

## NOTES for the next lane
- **Consent-gate honesty (reusable)**: the autoRecord gate mounts ASYNC after
  the start keypress and an anonymous decline RE-ASKS on every new page.
  ddragoncheck now has `defuseConsent(page)` (polls for the gate, clicks NO
  THANKS, early-exits once screen==='play') — any new keyboard browser leg
  must use it or the start is silently swallowed at `startBusy()`.
- **Movie law shape** (#2891, reusable for other openings): script on a state
  object, negative entity ids (id-stream clean), no rng, step() early-return
  gate, end = spawn truth + tick rewind -> stateHash parity pin proves the
  prologue is residue-free. Any-input skip lives BOTH in sim (pad) and shell
  (keydown/pointer) — and the skipping press must NOT be eaten (fall through
  and register it: seats P2, starts walks).
- `__ddTest.probe()` carries `intro` (tick, -1 when off), `introMarian`
  (walking/fleeing/held), `introLift`, `introTaken` (1=showing 2=shown).
  `setup()` does NOT refuse while the curtain is up (screen==='play' already)
  — its mutations just sit frozen under the gate until the skip/caption, so
  law work should enter via `__game.reset`/`__ddTest.start` (intro-free
  streams), never via a raw attract keypress.
- VirtualControls is visible during the movie — a pad tap skips (good phone
  UX, pinned by the pointer path).
- Prod-verify recipe unchanged (curl -L -> entry chunk -> dynamic imports);
  note zsh `grep` dies "character not in range" on minified bundles —
  verify with Node fetch + includes instead.
- ddragoncheck is 194 pins / 22 mutants; INTRO constants exported from
  sim.js (`INTRO.grace 30/total 430/grabAt 155/takenAt 300`).

## WORKTREES
- Main checkout ~/Dev/retrogames: detached origin/main (this STATE commit).
- `~/Dev/retrogames-forge-dd-kidnap` — reaped suggestion: branch gone on
  merge; remove the worktree when convenient (`git worktree remove`).
- Ports: b's 5178 stopped at close (devstop.sh). QA nodes 5174/5176/5179 —
  leave them. Slot a's server — leave it.

## Open questions
- #2846 — promote CONTRA/R-TYPE/DD to public? (default keep private.)
