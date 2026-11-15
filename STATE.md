# STATE — session 283 (2026-11-15, slot a)

## Playable now / what shipped
- **TEN-DEEP bestiary colours (salvage, PR #2325 → merge at exit).** The
  shared renderer documented sprite `tint` since #1129 but the shader never
  read it — slot b's live `view.js` passes per-mob tints and every mob drew
  in three raw atlas greys/greens. `uTint` now multiplies the lit core
  (white default: deepglass byte-identical). tendeepcheck 9651/9651 with
  two contract pins + `mut tint unwired: caught`; lints+build green.
- **PLAICRAFT S1 (#1711) re-checked & released** (first ~35 min): store
  unchanged (7 takes, all graded; no claptest take yet), `/status`
  `writeKey:false`, jonq #2305 AWAITING (default: hold). All remaining
  lines Jon-side; label back to `next` per audit item 5.
- Rule 4: game code shipped (renderer fix).

## The lane-race postmortem (the session's headline)
- weakestStage named TEN-DEEP on BOTH slots. Slot b filed #2315 at 06:37Z;
  this lane filed #2318 minutes later; both built the same gap in parallel.
  Slot b merged first (#2319 visible packs + #2323 sim-side patrol) and was
  strictly wider (real roaming movement — which my design deliberately left
  open to keep the solver accounting). My PR #2322 went CONFLICTING → closed
  unmerged with a full write-up. **#2318 retitled to the salvage, shipped as
  #2325.** Fix idea for the board (someone else's call): never-dry stages
  should `forge-claim` their self-filed issue IMMEDIATELY after create —
  the label is the only cross-slot exclusion signal, and the create→claim
  window (this lane: ~2 min) is where twin stages breed.

## BOARD at exit
- game-queue: empty (my #2318 → shipped). building: #1711 back to `next`
  (Jon-side). building-qa: #2313, #2314 (QA lane).
- jonq open: #2305 (AWAITING, write key → relabel one-off; default hold).
- **Slot b harness debt found:** `tendeepcheck --mutate` on origin/main
  `fff8515`: `sprung ambushes never clear` mutant SURVIVES (+1 more),
  reproduced on untouched main — #2321's SIGHTED gates don't all bite.
  Noted on #2318; fix belongs to the #2321 lane or QA.
- No halt, no steer.

## Next (slot a or b, in order)
1. Ladder as usual; expect never-dry again. Weakest candidates (score 3,
   registry order, minus whatever lanes claim): PRINCE OF PERSIA, GARDEN
   GUARD, VIPER PIT, BRITANNIA, FLOOR BOSS, SHORT ORDER SHOUT… (run
   `weakestStage` — TEN-DEEP now owned/gap-free of the visible-pack line).
2. Fix the #2321 mutant survivors above before adding more SIGHTED gates.
3. jonq #2305 answered → execute the #2093 relabel one-off + grade Jon's
   claptest take when it lands (closes #2156 + the ±50 ms line).

## The session's catches
- **API comments are promises; check the shader.** `tint` shipped in the
  #1129 docs with zero implementation — two lanes then wrote tint data
  believing it. A contract pin (wired + default) belongs with every
  documented uniform.
- **Brightness means don't survive torch falloff.** A 36×20 mean over the
  corridor centre gave Δ5–13 for a whole pack; counting >100-channel pixels
  against a dark hall gave 1363 → 0. Gate on the distribution, not the mean.
- **Advisory reds that reproduce on untouched main are not yours** — the
  A/B (main checkout, own port 5191) takes minutes and ends the argument.

## Hygiene at exit
- Dev server :5173 stopped (slot a's own; others untouched). Temp :5191
  stopped.
- Slot-a worktrees removed after merge; main checkout re-detached at
  origin/main.
- STATE.md: commit to main iff #2325 merged (say why in it if not) +
  `statepark.mjs park a`.
