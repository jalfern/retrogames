# STATE — session 268 (2026-11-14, slot a)

## Playable now / what shipped
- **HOMEBODY got a SPEED DIAL** (merge `cb3e3a6`, PR #2230, closes #2227):
  pause / normal / fast / fastest, The Sims (PC 2000) style. Gears
  `SPEED_MULT=[0,1,2,4]` live in sim.js (`setSpeed` clamp, `cycleSpeed` wrap,
  `attractSpeed` teach law); `s.speed` rides `stateHash`; a new street resets
  to NORMAL. One driver, one fixed dt — the rAF loop buys gear-many world
  steps per tick, so decay/schedules/visits/cries/purrs all ride plain
  `advance`; gear 0 stands the world still. Keys `1`-`4` outside buy mode
  (inside, digits keep the #2222 card law), `,` `.` cycle+wrap everywhere,
  panel pips tappable (`DIAL`+`speedHit`, gold pip, pulsing pause pip — no
  third VirtualControls button). Court release freezes with the world; the
  attract demo hurries 08:00–10:00 to teach it (+ marquee line).
  Proof: peoplecheck **330/330** (12 sim gates + 10 pins), homebodydrive
  **61/61** zero page errors, contractcheck 724/724, lint gates + build green.
  Mutants: loop multiplier neutered → drive pause-gate RED (clock walked
  8.1→8.2 while "paused"); `mix(s.speed)` dropped → peoplecheck 329/1 exactly
  the hash gate; both restored.
  Prod-verified: served entry `index-GZyYCA-t.js`, Homebody chunk
  `index-FZE5lLCs.js` carries the dial marquee (PAUSED/FASTEST labels are
  DEV-probe strings, tree-shaken from prod; logic ships).
- **The TARGET was already shipped:** warden aimed my slot at #2222; claim
  answered "already yours: resume it" — but the issuing session (267) was
  mid-merge, not dead: #2226 landed (`91b1ca8`) ~3 min into my session and its
  STATE commit followed. Stale idle-kick ≠ corpse; when the TARGET merges, run
  the ladder, don't re-drive a landing merge.

## Ladder
- No steer/next, game-queue empty, QA-borrow blocked (QA MASTER live),
  flagship stage SPENT (every SSX/Emberwood/CometDriftHD/Myst gap owned) →
  never-dry `weakestStage` = HOMEBODY score 7 (4 open QA naming it +
  3 unowned gaps). Oldest gap (bonds-line PARTIAL) sanity-skipped: every
  clause records shipped work, tail owned by #2209 (same ruling as #2222).
  Took the next unowned — "no skippable-speed control" (STATE 267 NEXT#1
  named it). Filed #2227 with the why-weakest line, claimed, shipped in-session.

## BOARD at exit
- #2227 closed+shipped (auto-closed by PR `Closes #2227`; labels corrected).
- Fresh queue item for the next kick: **#2234 POLISH — PICK RUSH: per-shift
  ambience** (game-queue, lane:games — claimable the normal way).
- QA holds #2214 (PickRush polish); #2205/#2224 closed via #2229/#2232 (slot b/studio).
  #2209 got a
  dial-polish addendum from this session (pip tap sizes, pause ghost, cue
  shrillness, attract-caption).
- jonq: #2218/#2233 AWAITING (lane:platform — plaicraft key-file tails).
  Nothing new for lane:games; none filed this session.
- Nightly (schedule) last completed SUCCESS; main-ok green at exit. Advisory
  PR smokes flaked on #2230 post-merge (static passed — rule 3, noise).

## Next (slot a or b, in order)
1. **#2234** PICK RUSH per-shift ambience — oldest game-queue item, take it the
   normal way (claim + worktree).
2. If Jon answers #2218/#2233: plaicraft grade/key-deploy tails belong to the
   platform lane — only if the warden assigns them to a builder slot.
3. Ladder then: `weakestStage` again (Homebody day/night clause, Myst gaps).

## The session's catches
- **A stale idle-kick can point at a merge in flight.** Verify against the
  board before resuming a "corpse"; a pushed branch ahead of main that IS the
  pending merge needs no second driver.
- **Keys that multiply time must be consumed above the multiplier.** Consume
  the dial below the world-step loop and pause eats the very keys meant to
  release it. (Banked in Homebody README §Speed dial.)
- `hour` probes round to 0.1h — a fast/slow clock gate needs ≥0.5 s windows or
  it flakes at granularity (two such fixes were test bugs, not game bugs).
- Buy mode has its own #1806 time-out (`advance` stands still behind the
  counter) — the dial's law there is "state answers and survives"; pinned.
- **Prod verify has two false-red traps:** jalfern.com's edge held `HIT age>2000`
  for ~35 min after merge while the Production deployment was already SUCCESS
  (`gh api repos/jalfern/retrogames/deployments` = the honest mid-window answer);
  and the lazy-chunk sweep must cover ALL `assets/*.js` names (`art-*`, `sim-*`…),
  not just `index-*` — the game's marquee lives in a plain-`index` chunk but
  names vary per build. DEV-only strings are tree-shaken from prod — verify on
  player-visible strings only.

## Hygiene at exit
- Dev server on :5173 (mine) STOPPED; no other lane's port touched.
- Worktree `~/Dev/retrogames-forge-homebody-speed` — branch merged/deleted by
  squash, re-detached to origin/main. Old merged slot worktrees (homebody-stores
  etc.) are tidy-candidates.
- STATE committed to main legitimately (#2230 merged this session) + parked to
  the slot-a path. No open jonq questions from this lane.
