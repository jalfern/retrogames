# STATE.md — The Forge (rewritten at close of slot a, 2026-11-21; committed to
# main because game code merged: DOUBLE DRAGON S2 trainable #1712-part -> PR
# #2878 -> 420ae96, plus the red-main watchcheck fix #2871 -> 10ffd45.)

## PLAYABLE
- /retrogames/double-dragon — now TRAINABLE-ON-ARRIVAL (#2878, slot a): the S2
  consent gate (#1711) goes up before seed-birth, decline still plays; consented
  runs bank every consumed pad pair (`armLiveCapture` + `recordLiveTick`), the
  drop-in tick rides `rules.seat2At`, and `doubleDragonRows` feeds it to the
  PLAICRAFT builder — DD is the 6th trainable game. datasetcheck 64/64
  (571-row scripted take, seat-1 begins AT seat2At, tamper + mutant 8 red),
  ddragoncheck 126/126, recordcheck 281/281, vpadcheck 714/714.
- /retrogames/frogger — watchcheck pilot rides its certified seed 1776 (#2871,
  the #601 red-main fix; ~1-in-60 random seeds hit the river zigzag stall and
  starve the leg — Node sweep 25/1500, e.g. 3910). Planner stall-breaker owned
  by #2869.
- Rest of shelf unchanged.

## WHAT THIS SESSION DID (slot a)
- Red main 44914600702: root-caused to watchcheck's frogger pilot rolling a
  random start seed; pinned it (precedent smash-tv #2531), proved two mutants
  red, froggercheck 35/35. #2871 -> 10ffd45 (main green again; nightly rerun
  44937167937 then went cancelled-by-newer-push — main-ok rc=0).
- Warden target #1712 (S2 dataset): made DOUBLE DRAGON trainable in one PR
  #2878 -> 420ae96. New `src/games/DoubleDragon/model.js` (60 features:
  camera-window masking with crest honesty, per-seat honest zeros, prev-pad
  incl. boost); punch rides the canonical `boost` one-pad channel
  (DIGITAL_FIELDS/PAD_FIELDS additive).
- Harness lesson worth repeating: this Mac's store probe comes back LIVE, so the
  consent gate RISES on scripted starts and swallows every key until clicked.
  Any new browser check on a gate-bearing game must include the NO THANKS
  defuse helper (copy gauntletplay/touchselectcheck; #2091 — decline, never
  grant). ddragoncheck now does.

## OPEN
- #1712 stays open: acceptance still needs real friend takes (someone GRANTING
  consent on a real device) — DD can now bank them; fold/attribution ruling is
  #2844 (open jonq).
- #2869 — frogger planner zigzag (feedback -> building-qa): proper fix is a
  lane-alternating planner, traces on the issue.
- #2846 — flagship public promotion (AWAITING, not lane a).
- Open question issues: none from this session.

## NOTES for the next lane
- `?seed=` pins DD too (seedFromQuery); `__ddTest` hook API is probe/setup/tick;
  browser leg defuses the gate once per page (fresh context per page = fresh LS).
- Vite dev on this box answers /api/store via proxy → probe.sessions TRUE in
  dev; CI Chrome sees the store silent (gate never rises there — checks must
  work both ways; the defuse helper no-ops when the gate is absent).
- prod verify after this STATE push: bundle marker `seat2At` in the DD chunk at
  jalfern.com — confirmed in preview of #2878; production sweep at close.
