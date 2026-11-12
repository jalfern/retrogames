# STATE — session 238 (2026-11-11, slot a)

## What shipped
**CIVILIZATION V LEARNS NAVAL SUPPLY** — merged as `d6ef8b5` (PR #2068, Closes #2065).
TARGET #2063 was REFUSED (slot b held it, claim 7 min fresh — honest yield), so the
ladder ran: no halt/steer/next, game-queue empty, live QA MASTER up (borrow blocked),
flagship stage spent (all four flagship READMEs fully CLOSED-marked) → NEVER-DRY rung:
`idle-kick` answered `KICK CIVILIZATION V 0 weak` (score 4 = 4 unowned README gaps,
no feedback naming it, ties to oldest). Filed #2065 with the why-weakest line, claimed,
built, shipped.
The law: a hull is SUPPLIED within `CFG.navalSupply` (6) sea steps of a friendly port
(own/overlord/vassal coastal cities, allied-CS harbours; enemy and non-allied never).
Unsupplied hulls wear `CFG.navalAttrition` (10) HP at end of turn, never heal afloat,
and attrition alone sinks a hull with its hold (`shipLost` why:'supply' + the drown
cargo fold). Pure derivation (`portsOfRealm`/`suppliedSea`/`hullSupplied`) — no new
stored state; wear lands in `u.hp`, already hash-folded. Tells: HUD chip
`⚠ OUT OF SUPPLY −10/TURN`, pulsing amber ring on far hulls, log line, help-card line.
Honesty (#237 doctrine, in the README): Civ V has no attrition at sea — its real law
is heals-on-friendly-territory-only with borders reaching water; the extension ships
labelled as ours.
Proof: civcheck §39 +35 checks → **594/594**; mutant (`wear → hp -= 0`) died on 7 §39
checks; lint:civ/mario/fps/ai + build green; civplay 93/96 = EXACT parity with a
pristine origin/main worktree (3 pre-existing reds filed as #2069 for QA). Prod:
`index-B8rdHCjS.js` lazy-loads chunk `index-DenACxGQ.js` carrying the supply literals;
live at `https://jalfern.com/retrogames/civilization-v`.

## The session's catches
- **Inherited red blocks the required check.** #2068's static failed attractcheck:
  slot b's #2064 vault hint shipped as a second raw `<p>` in LRL's attract (rule 6:
  the press prompt is the only raw paragraph); #2068 was just the first PR over it.
  Fix = one-line p→span (`WATCH_ATTRACT_HINT` two lines above is the precedent):
  separate PR #2073 (attractcheck 694/694, lodecheck 134/134), merged, my branch
  rebased onto it. When static reds on files your diff never touched, suspect main,
  prove it on a pristine worktree, fix separately, then rebase.
- **`gh pr merge` local bookkeeping dies on a held `main`.** #2073's merge left its
  worktree on `main`, so #2068's merge threw `'main' is already used by worktree`
  AFTER the API merge succeeded. Recovery: `checkout --detach` + `worktree remove`
  the dead lane, `gh pr view` to confirm merged, `git push origin --delete <branch>`.
  Re-detach immediately after every merge — the playbook law, now with the exact
  failure signature.
- **attractcheck is not in nightly** — main-ok.sh stayed green through a red-main
  attract rule; only PR static sees it. README verify counts were stale (533/547 vs
  actual 559→594); now honest.

## Ladder trail
TARGET #2063 claim REFUSED ("held by b, newest claim 7 min") → normal ladder →
never-dry pick; filed-then-claimed #2065 per #1571. No halt/steer/next anywhere; no
jonq filed (nothing taste-grade); QA borrow blocked by live QA MASTER (pgrep).
Step 8b skipped with reason: this shipped stage WAS the polish round for the sea gap;
remaining CIV gaps live in the README ledger for future weakest scoring.

## Open questions
- none (see waiting-jon issues).

## Next
- #2069 (filed this session): civplay's 3 red-on-main checks — attract copy drift
  (goal not named on the card since the b31 rewrite; #406 law), black-centre pixel
  read (needs §406 buffer-read treatment, `unseenMin` is the pattern), Y-from-attract
  VICTORY probe. QA lane's call.
- CIV owed honestly: the naval tactics stack (ranged port bombardment from the water,
  promotions) + three other README gaps — next weakest-score material.
- PPM drain law stands (session 230). #2045/#2036 remain open harness improvements,
  unowned. Slot b's open items ride its STATE.
- Housekeeping: dev server slot a 5173 STOPPED at exit; `~/Dev/retrogames-forge-civ-supply-sea`
  and `~/Dev/retrogames-forge-lrl-attract-span` removed (branches died with squashes);
  main checkout detached at `d6ef8b5` + STATE commit.
