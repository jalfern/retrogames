# STATE — session 324 slot b close-out

## Shipped this session
- **#2604 → PR #2607 merged (squash `511cdb4`, live). HOMEBODY — NEIGHBOURS
  SPAT (#2604): third-party grudge on the Fern/Ivy pair.** The #2070 cold war,
  mirrored onto `rel.neigh` with neighbour-appropriate signals, zero rng:
  while both hang and exactly one has an ear (`claim`) with the other inside
  gossip reach, the watched-but-unheard minutes count (`neiIgnore`); any peace
  resets it (free-together, both-claimed, out-of-ring, off-lot). 30 s
  (`NEIGH_IGNORE_T`) → SPAT: `rel.neigh −4`, `neiGrudge`, `neiSpats++`, 40 s
  CD mirror. Cold war = `updateNeighbours` returns before any pay (no chat/
  glance/meet — "proximity builds nothing, only absence cools" verbatim);
  resident chats untouched. Exit: absence thaws (`neiMending`), first shared
  unclaimed moment in ring pays `+2` (`NEIGH_MAKEUP`) + `makeup who:'neigh'`
  event — once, no content (win economy stays household's). Tells ride existing
  rails: #2070 crack + pair-named banner `FERN AND IVY SPAT!`,
  `THE NEIGHBOURS MADE UP ♥`, NEIGH row ash-teal while cold (HOUSE-row
  pattern), marquee line. `neiSpats/neiGrudge/neiMending` ride stateHash (the
  two clocks stay off, like `spatCd`).
  Gates: `peoplecheck` **751/751** (was 722; +29 NEIGH SPAT block: boundary
  exactness 29 s/30 s, drop-and-only-the-pair, event who+spot, three reset
  cases where 32 borrowed seconds cannot fire, cold-war silence on all three
  pays while resident chat survives, absence-thaw, reunion pay-once, SPAT_CD
  mirror, hash carries, seed-exact full quarrel, source pins). Mutant
  hand-proved: neuter the cold-war `return` → 3 silence gates + pin die by
  name; restore → 751/751. eslint + three scoped gates + build green.
  Prod verified: lazy chunk `index-DeRO84Bo.js` carries both markers.
  View remainder (pair puff/lean, pair sour beats, teal reunion sparkle) filed
  as a handoff comment on QA pass **#2599**; drive leg for the new banners
  owed (peoplecheck carries the law meanwhile, #2583 precedent).

## Next queued
- `game-queue` empty at close; `next` = **#1711** (lane:platform — games-lane
  no-op, precedent 314–322). `building`: #2579 (lane a holds; stage 2 gated on
  jonq #2585 AWAITING, default B, deadline 2026-11-19T10:55Z — resume per its
  last FORGE comment: A builds from `a002199` (`git fetch origin pull/2583/head`),
  B/default records decline + closes), #2603 (lane a — Excitebike pad EXIT).
  **Slot b holds nothing.** Slot a claimed #2579 at 14:03Z before this session
  could (this slot's claim was REFUSED — fresh holder).
- Idle-kick at close = **`KICK HOMEBODY 0 weak`** again — gap 0 stays PARTIAL
  on purpose (README bullet NOT marked CLOSED): the SPAT half shipped, the
  pair-ring-choreography and Miso/Pip-mediation halves remain, plus #2599
  naming. Next never-dry pick is Homebody gap 0's oldest still-open sub-item
  (pair ring choreography — hard; the QA handoff on #2599 item 1 is the
  paint-only variant). Recompute before claiming — lane a's #2603 and QA may
  reshuffle scores.

## Open questions (issues, not here — #605)
- None filed this lane. Lane-adjacent: **#2585** (AWAITING, gates #2579's
  stage 2, not held by this slot anymore). Lane-foreign: #2529 (lane:research).

## Catches for the next session (each cost probes this shift)
- **Long peoplecheck rigs kill the household.** Soaks share one run; parked
  residents starve → both faint → `done='lose'` FREEZES the world mid-section
  and every gate downstream fails with stale values. The #2604 block's `park`
  clamps needs ≥0.55 and every run stays under the hour-19 visitor exit
  (~60 s world). New long rigs: clamp needs, budget the day clock.
- **`git checkout -- <file>` after a hand-mutant reverts the WHOLE file**, not
  the mutant line — if the file carried uncommitted work it's gone (cost 4 min
  re-typing sim.js; this repo's own warning says the same for staging). Hand
  mutants: reverse-sed the exact line, then re-run.
- **`weakestStage` results move during a session** — #2601 flipped
  `building-qa` and #2603 appeared between two computations; idle-kick changed
  from EXCITEBIKE to HOMEBODY mid-ladder. Always re-run idle-kick right
  before filing (that's why the filed why-weakest line quotes its SHA).
- **zsh aborts a whole `&&` chain on one failed glob** (`rm -f dl_*` with no
  matches kills the line before `curl` runs) — `setopt NULL_GLOB` first in
  prod-verify one-liners. Prod asset URLs need `curl -L` too: a bare asset
  path answered "Redirecting..."@200 (15 bytes) — check `wc -c` before grep.
- New sim state rides stateHash only if discrete; clocks (ignore/cd timers)
  stay off like `spatCd` — the pin gate enforces it both ways.

## Lanes clean
- Main checkout detached at origin/main (`511cdb4`); STATE.md written here and
  committed to main via `forge/state-324-b` (game merged this session —
  #2552/#2556 shape).
- Worktree `~/Dev/retrogames-forge-homebody-neigh-spat` re-detached at
  origin/main, reusable (node_modules symlinked from main checkout — replace
  with a real install if the tree moves).
- :5178 dev server NOT left running (drive leg skipped; port free). Other
  lanes' ports untouched (:5173, :5174, :5176, :5179, :5199).
