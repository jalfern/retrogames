# STATE — session 209 (2026-11-10, slot a)

## What shipped
**PAPERS, PLEASE-MIN: PORTRAIT — the photo on the paper is an inspectable
rule** merged as `be5b07b` (PR #1941, closes #1938 — never-dry POLISH stage
I filed this session, weakestStage score 4, oldest title at 4 in registry
order): every passport carries a mini painted photo; `PORTRAIT` compares
structural features (hair cut, face width, glasses, facial hair) against the
face at the counter and denies with human-readable evidence naming the
feature. Forgers flip EXACTLY ONE feature; a 7th trap species — the
aged photo (grey hair, same face) — keeps colors non-evidentiary. Face
descriptor `{skin,hairC,shirtC,style,narrow,glasses,must}` feeds
`drawFace` for BOTH the booth face and the passport photo (an honest paper
paints byte-identical faces at two scales — `__ppTest.portraitPix()` is
the DEV pixel probe). DAY_RULES now nine laws; `WALL.top` 44→38 keeps the
day-7 wanted sheet at y=356 above the SCALE-box law y=358. No contract
change (additive fields only). Harness: paperscheck 8482/8482 + 3 new
named mutants (rule deleted / trap de-aged / color convicts) all die;
papersplay 25/25 incl. band-lit forge denial (narrow 211px), honest
total-0 parity, and painted-photo-in-beige-frame gates; determinism check
now replays the week's OWN trap pick instead of a hard-coded index.
Shelf gates: watchcheck 212/212, contractcheck 682/682, attractcheck 694,
vpadcheck 701/701, lint:papers/mario/fps/ai, build green. QA polish pass
filed as #1943.

## The session's lessons
- **Design inside the pinned laws, not against them.** My issue planned a
  day-6 PORTRAIT wake; the +1-rule-per-day growth law has no free slot
  (day 6 owns IDREQ, day 7 CURFEW). Riding from day 1 is the honest
  design (photo-vs-face needs no teaching) and kept every growth/fit law
  intact — deviation posted on the issue per #237.
- **A pixel gate that runs during an animation of the PREVIOUS subject
  passes vacuously.** My first photo-paint gate sampled mid-stamp, when
  the counter still shows the judged document — it lit 5016/5016 "photo
  px" on a dark no-papers box. Shape that works: press two docs, wait the
  stamp ticks OUT (30 ticks ≈ 500 ms; a ~180 ms eval loop never clears
  them), then sample — and require BOTH subject pixels AND the surrounding
  frame color, so a wrong-region sample cannot pass.
- **Probe probe-probe, once:** the stamp object outlives its animation —
  probe reports `stamp.ticks`, and gates must read `ticks <= 0`, not
  truthiness of the object.
- **Prod two-marker recipe caveat for lazy games:** the entry chunk names
  shared `index-*` chunks only; enumerate EVERY `assets/<name>-<hash>.js`
  referenced in the entry text, and note jalfern.com answers
  `/retrogames` (no slash) with "Redirecting..." — curl needs -L, node
  fetch follows fine.

## Session bookkeeping
- Ladder: TARGET #1637 REFUSED (b held it, claimed 27 min — b shipped DF
  b21 #1939 mid-ladder, #1637 stays building/b); no halt/steer; `next`
  #1711 hardware-stalled (R2 jonq #1730 timed out to Hold, acceptance
  needs Jon's phone); game-queue empty; feedback owned by live QA session
  (pgrep QA MASTER alive); flagship READMEs gap-free; never-dry: TMD(8)
  held, FloorBoss/DF etc held or lower — PapersPleaseMin(4) oldest-at-4 →
  filed #1938, claimed(a), shipped+CLOSED.
- :5173 dev server runs from `~/Dev/retrogames-forge-ppm-portrait`
  (detached be5b07b, node_modules symlinked) — reuse or kill before
  strictPort next slot-a session. Worktree kept; branch deleted by merge.
- No jonq (nothing taste/priority/hard-to-undo).

## Next queued (slot a)
1. Fresh ladder: warden TARGET, else halt/steer/next/queue games-first;
   feedback only with no live QA session; else flagship/never-dry via
   scripts/lib/idle.mjs.
2. Never-dry candidates after this stage: papers-please's own remaining
   gap now scores lower; several titles sit at 4 (lode/smash/civ/homebody/
   viper/britannia/pick/tidy/shout/floor-boss/bomb-defuse) — tie breaks
   by registry order; lode-runner-lite is the oldest unheld at 4.
3. QA owns #1943 (PPM portrait round), #1915/#1900/#1888/#1871 (TMD),
   #1906/#1907 (SI/DF), #1877 (FB), #1923 (rail), #1925 (carpet),
   #1829 (Britannia), #1812 (DF), #1748 (CI smoke) — leave to the QA lane.

## Notes for the next slot-a session
- paperscheck's determinism check replays genWeek's own trap pick — if you
  touch TRAPS or genWeek rotation, it self-adapts; don't re-hardcode.
- PORTRAIT bands count DIFFERENCES, so overlapping bands may co-light on
  one break; only the named feature's band is load-bearing in gates.
- main-ok `nightly cancelled` = pass quirk; two-marker recipe refined
  above (lazy game chunks, redirect page) — worked verbatim.

## Open questions
- None. (No taste/priority call needed from Jon.)
