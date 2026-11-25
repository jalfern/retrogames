# STATE — forge board snapshot (slot a, 2026-11-25 — THE PLAZA THINKS)

## This session — one ship, landed
- Warden TARGET **#3336** REFUSED at claim (slot b live, newest checkpoint 12 min old).
  Normal ladder: no steer, `next` #1712 waiting-jon, `game-queue` empty, QA MASTER
  live → no borrow; flagship stage spent (all six READMEs gap-free) → NEVER-DRY:
  `weakestStage` = **GRIND CITY, score 2** (Pinball ties but held by #3336; Skyward
  6 held by #3375). Oldest unowned gap: "The bot's line is fixed" — the rung
  last session's STATE predicted. Filed **#3394**, claimed, shipped **`6335e70`
  (PR #3400)**; issue closed shipped.
- **The thinking bot** (`search.js`, style v3): route stays scripted (`drive()` mirrors
  the planner), tricks become SEARCH — candidate press-schedules rolled through the
  real `sim.step` on a full clone, scored (banked pts, letters +400, grind +120,
  displacement, tick cost), best committed. **PROVEN AIR**: a gap pop commits only
  when the rollout clears the trench; a rail pop only when it latches. Pure planning
  ⇒ deterministic attract; witness v0 byte-identical.
- The searched line wins seeds 7/3/42/101/999, zero bails, 29 s, all letters + gap,
  and banks **Flip + Manual180 the script never throws** — 20702 vs witness 18910.
  Attract rotation now `% STYLE_N` (4 styles); `?style=n` shifts the origin for drivers.

## Proof
- grindcheck ALL GREEN (+16 pins: clone purity by per-tick deep-diff, search
  determinism, different-than-witness, five-seed win + deeper-than-witness, clone/
  proven-air/wiring laws) — **22/22 mutants die** (new `clone`, `need`, `sched`,
  `searchwire`; `variety`/`bankline` strings updated for STYLE_N + thinks branch).
- gcdrive **DRIVE GREEN, 68 legs (+4)** at :5173 — style routing, live nSearch/
  nCommit counters, scored bail-free thinking attract, zero page errors. Output kept
  at /tmp/forge/gcdrive-a.log.
- eslint + 3 scoped gates + build green; main-ok green at claim and merge.
- Prod verified: served chunk `GrindCity-DYHfR0Zl.js` contains `thinks`.

## Harness lessons (worth one line each)
- **Value a rollout by what it can SEE**: searcher wins died until rollouts could
  bank letters (E gates the route; K arrives ~120 ticks after a coping landing).
  Horizon/post caps are the search's honesty radius — score it like the game scores.
- **PROVEN AIR fixed the "lands in the trench" class**: a schedule that merely scores
  well is not a plan; require the outcome flag (`r.gap`, `r.grindHit`) at commit.
- `__grindTest.state()` has NO `attract` field (that's `exposeGame`) — a drive leg
  gating on `st.attract` breaks at sample 1; use `screen === 'attract'` there.
- macOS has no `setsid`; a dev server must be started with the harness background
  mechanism or a plain `nohup … &` from a surviving shell — mine died once mid-session.
- The bot's waypoint radii complete in flight; landing x shifts (~1 m = letter E
  clipped at r1.5) move the whole downstream line — trust per-tick traces, not
  hand-ballistics (three hand-calc probes were all wrong, rule 8).

## PLAYABLE on main right now
- `/retrogames/grind-city` — every 4th attract loop the plaza thinks (searched
  flips/manuals, proven air); plus all-time bank, `?line=` share links, roof line +
  secret bowl, rail grabs, three cams + free orbit, the A-minor bed.
- `/retrogames/skyward` go-around + flare credit; `/retrogames/tidal-rush` phone HUD;
  `/retrogames/pinball` SOLO bed + TABLE SMITH (+ slot b's bed-tail work landed);
  galaga bee, mario-kart, ice-climber, marble-rush, comet-drift pair, ssx,
  marble-madness, pacman, mario, minesweeper/garden-guard/homebody, TIDY BOT,
  STARRY NIGHT, TOP SOLDIERS, DOUBLE DRAGON, RACCOON HEIST, spy-hunter, iron keep,
  missile, pucks, mines, zork, ultima, king's quest, Joust, Q*bert, forge board.

## Board watch (facts, not questions)
- `game-queue` EMPTY at my close; `next` #1712 waiting-jon. Main moved under me
  (edb2f43) — slot b merged its pinball work while mine waited on `static`.
- **#3401 filed** (feedback): QA thinking-bot tail — style tell, throttle at
  `?style=3`, phone widths, slow-lip best-effort fallback (<5 m/s lip arrival is
  theoretical: the witness line never arrives that slow).
- Open QA tails still: #3379, #3344/#3362/#3370, #3368, #3329, #3290 items 5–7,
  #3244/#2971 (waiting-jon). `building-qa`: #3375 (skyward).
- Next builder claim: ladder empty again — doubt rule before filing; grind-city's
  remaining README gap is the `snapshot/restore` #391 note (contract plumbing, not a
  gameplay fix) unless the queue refills first.

## Open questions (links only — #605)
- #3335 — QA: music-bus low-pass in AudioController (AWAITING, qa lane).
- #3054 — QA: native TestFlight ports have no recorder/upload (AWAITING).
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).
- No new jonq questions filed this session.

## Slot state at handoff
- Slot a: dev :5173 stopped via scripts/devstop.sh; worktree
  `~/Dev/retrogames-forge-grind-search-bot` detached clean at origin/main by
  mergeclean — remove when convenient.
- Game merged this session ⇒ this STATE.md ships via its own docs/state PR; parked
  at /tmp/forge/STATE.a.parked.md via statepark.
- Time-box: ~3 h at ship — the two dev-server restarts and the slow-lip horizon
  archaeology ate the margin.
