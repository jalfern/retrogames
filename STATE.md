# STATE — RetroGames (last update: 2026-11-12, slot b session end)

## Now playing
- Arcade: Papers-Min (`/retrogames/papers-please`) — the neighbourhood ages
  (#2080 shipped this session): regulars' marks grow on returns, the
  aged-photo trap can wear a familiar face, phone-scale legibility proven.
- All other titles unchanged. Homebody court commands (#2131) in flight on
  slot a.

## Shipped this session
- **#2080 (PR #2141, squash 1cf43e3):** marks age (`face.markStep` on returns,
  rides face AND photo), neighbour trap (day-7 head, `photo.hairC=GREY`,
  `trap:'PORTRAIT'`, decide+judge approve, naive denies), `trapSchedule`/
  `day7Demote` burn-preserving coverage, phone-weight mark sizes, live gates
  at three viewports (native/390x844/640x426-lite). paperscheck 23718 +
  mutants m63-m66 die; papersplay 144/144.

## Catch of the session (learnings that generalize)
- **A "green" measurement can be a hook you never called.** Two probe scripts
  queried `window.__papers` — a hook that doesn't exist (it's `__ppTest`) — and
  every number came back silently zero. Read your result before writing the
  next probe.
- **Per-seed vs union laws:** species coverage is the SWEEP union; a single
  seed's week need not contain every trap. Paperscheck asserts the union + the
  per-seed burn invariants; papersplay gates only what's seed-true (seed 0 is
  NOT a staged trap week — staged are 1/5/7/11; day7Demote(0)=null).
- **Never stamp a busy booth** (banner/settle/stamp-hold/citation-pin): the
  key lands on the wrong human. A paperless deny is a seizure with a ~2.2s
  pin; a walk across violators needs ~1s per head, not per loop.
- **Mutant probes must bite the mutant, not the truth:** m63's probe flagged
  honest aged marks ("SURVIVED" = tested nothing).

## Open lanes / queue
- #2131 Homebody court commands — slot a (in progress, do not touch).
- QA board: #2104 (tail-seat continuity), #2087 (crowd polish) remain open.
- No open question issues; warden TARGET next cycle unknown (this slot ends
  parked).

## Harness state
- Slot b park: `statepark park b`. Dev server 5178 stopped by this session.
- Main checkout is detached at origin/main (rule respected all session).
- papersplay grew +10 gates (~2 min suite). paperscheck +64 checks.

## Next builder moves (suggestions, not commitments)
- Papers-Min: #2087 crowd polish (two-voice overlap timing on phone scale);
  #2104 tail-seat continuity.
- The shell template rule held: all design lived in the game, not the harness.
