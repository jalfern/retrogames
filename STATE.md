# STATE — RetroGames forge

_Updated 2026-11-16 ~20:05 UTC by slot a (forge, `retrogames-forge-smashtv-no-mercy`), end of shift._

## Slot status
- **SMASH TV #2491 is SHIPPED.** Main gives **no spawn invulnerability** — first spawn and
  every respawn land exposed, `INVULN` is 0 at every spawn site. PR **#2492** squash-merged as
  **`30ea66d`** (5 files, +552/−108; verified present on current tip `e493001`, sim.js has the
  `#2491` zero-shield markers, planner has the lane-sound doctrine) and live at
  https://jalfern.com/retrogames/smash-tv. Worktree removed; issue closed completed + `shipped`.
- No game-code goal for slot a right now — take the next unswept ladder item (#2449 MAGIC
  CARPET has 3 items left, 4/7; the slot b Britannia lane owns #2494's follow-ups).
- **Main is GREEN** (`scripts/main-ok.sh`): the only recent nightly failure (43898004660) was
  `full-static`/goldentrace (#2501), already fixed on main by #2502. Two nightly reruns on
  `e6de70f` were in flight at this close (43940658280, 43941588463) — next lane, confirm one
  goes green and park; the umbrella #2498 can then close.

## What shipped this shift
- **SMASH TV — zero spawn invulnerability (#2491, PR #2492, merged `30ea66d`).**
  Branch commits `562861f` (game: shield zeroed everywhere, pin flips), `5d8e382` (seed-4
  corner stall: lane-sound duel doctrine), `1873948` (slack-1 camping: **open-door landing**
  `landX` — respawn lands on the nearest clear cell of the spawn row, body-physics not mercy;
  spawn-lean parking; dry-tank reload), `38777c8` (honest deathless recount {7,8}).
  Proof floor: sweep **9/9 solo, 9/9 co-op, slack 0–2 win, deathless {7,8}**;
  `npm run smashcheck` PASS 766 / `--mutate` PASS 817 — 4 mercyBack mutants (restore the
  shield any way you like, the pins see it) + 3 doctrine mutants (lane-sound deaf, loiter
  under spawns, reload never fires) all die; new deterministic dropped-barrel seat-law probe.
  `npm run smashplay` **42/42** live Chrome incl. respawn-under-fire gates (ring east of
  spawn). The zero-mercy law now matches the rest of the arcade (AGENTS.md).
  QA polish pass filed: **#2507** (SMASH TV zero-mercy playtest polish).

## Open questions for Jon
- **#2487** (jonq v2 CI `JON_KEY` Actions secret) still AWAITING — deadline 2026-11-18;
  default B = stays dormant.

## Next goals
1. Slot a: **next ladder item** at the next scheduled kick. Best candidates as of this close:
   #2449 MAGIC CARPET item 2 (`#SNAKE` 3×2 body, 20-tick tail — item 1 shipped in #2484),
   or #2483 MISSILE BATTLE items 5–6 (dome shatter VFX, four-tone victory fanfare — 4/6
   shipped). Britannia cottages (#2494) is slot b's.
2. QA lane: **#2507** SMASH TV zero-mercy playtest polish (barrel telegraph readability,
   respawn-camping CPU at low seeds, attract copy mentions "no mercy"?).
3. Confirm a nightly rerun goes green on main and close the umbrella **#2498** (its only real
   failure — goldentrace #2501 — is already fixed by #2502).

## Harness health (do not relearn these)
- `main-ok.sh` green. Last nightlies: 11-15 both green; the 11-16 red was `full-static`
  (goldentrace depth-1 CI checkout, #2501) fixed by #2502 — verified in `main` history.
- Lesson from this close: verify failure claims against the actual run/jobs before filing
  issues — a panic-threaded flake narrative produced one bogus issue (#2511, closed with
  retraction). Check `gh run view <id> --json jobs` first.
- Slot-a worktree removed cleanly; `npm run dev -- --port 5173 --strictPort` free again.
- smashcheck's mercyBack anchors live on exact sim.js comment strings — rewording `#2491`
  comments in sim.js breaks `--mutate`.

## Recent shipped
`e493001` MISSILE BATTLE two-tone refusal (#2509) · `4e92a92` MAGIC CARPET deep-arc wizards
(#2505) · `fba669e` VIPER PIT net-select polish (#2500) · `30ea66d` **SMASH TV no spawn
invulnerability — NO MERCY (#2491/#2492)** · `e6de70f` STATE (slot b) · `277c8a6` goldentrace
CI fix (#2502) · `3a7edb1` BRITANNIA cottage substance (#2497).
