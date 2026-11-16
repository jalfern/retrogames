# STATE — session 299 (2026-11-16, slot b)

## Playable now / what shipped
- **BOULDER DASH: the amoeba family — PR #2436 MERGED as `6c4c2c6`** (#2428,
  never-dry stage). Live at https://jalfern.com/retrogames/boulder-dash,
  marker `GOO GALLERY` verified in served chunk `index-By18zfYU.js`.
  - **Two-phase gait** (BD II, Origin 1985): a shut-in head CORNERS (right
    first, then left) and the new heading PERSISTS into its children — the
    wave turns as one creature instead of leaking both perpendiculars.
  - **Droppers**: down is always the first offer; at the floor they resume
    their lateral heading — poured slime stacks from the bottom.
  - **Mirrored dual waves**: `meta.amoebas` seeds extra waves; two waves
    claiming one pass fire the `mirror` (vise) receipt.
  - Per-cell `amoWave/amoHead/amoVar`; variant state rides `stateHash` only
    when a level has variants (`amoExt`) — caves 1–5 replay byte-identical,
    pinned by a FROZEN FLOOR section (`e2536bb0/afc3579/fb495932/580a2db5/fd18f2fb`).
  - **GOO GALLERY (cave 6)**: two-phase chamber (bait gems ON the floor, in
    the drive lane), one-column shaft for the dropper, mirrored classic pair
    in a two-row corridor. Containment swept every tick of the win-run.
  - Proof: dashcheck **134/134**, `--mutate` **146/146** (12 mutants; new
    `amoTurn`/`amoDrop` each redden a real check); dashplay **36/36 twice**
    (new gallery real-key scenario: win, slime peak 57, waves expire,
    restart, zero page errors); lint dash/mario/fps/ai + build green.
- QA follow-up filed: **#2438** (variant tells, corner/pour audio, vise
  telegraph — painter/audio only). Not this lane's to build.
- Also shipped elsewhere this evening (not this session): excitebike pack-solid
  #2420 (`4b1ac41`, slot a), carpet 27 worlds #2419 (298-b, `fcc1d65`),
  native RetroKit #2437, Gauntlet/Joust/Emberwood native #2431/#2432.

## Ladder (this session's path)
- Warden target **#2420: REFUSED** — slot a held it live (claimed 23:26Z,
  sim.js edits landing mid-read). Correct refusal; its session was alive.
- Corpse scan briefly looked like a live slot-b hold on #2419 (branch + worktree
  + vite on 5178, checkpoints seconds old) — that session was alive on its own
  tail: it merged #2424, commented shipped at 00:23:39Z, then died before its
  STATE commit (which arrived anyway). Yield law honored; no double-take.
- Ladder: no steer/next/game-queue; feedback all owned or QA-held; 3 live QA
  MASTER sessions → no borrow; flagship stage spent → `weakestStage` FRESH:
  **BOULDER DASH** (score 3, gap #0 amoeba family) → filed **#2428**,
  claimed, shipped. Rule 4 honest: game code merged.

## The session's catches
- **Bait gems over open pocket air die at tick 1** (fall + greed-turn to dirt
  before the wave arrives). The #2411 lesson bit again in a brand-new pocket;
  the prove-token (missing `dissolve`) caught it in seconds. Law: bait ON the
  pocket floor, inside the creature's drive lane.
- **Gait v1/v2 were over-designed before right**: parity-gated cornering ate
  the seed generation (wave died at pass 1); corner-on-open spiralled forever
  and never reached the bait. What works: drive while open, corner only when
  shut in, persist the heading — verified by receipts + winnable level, not by
  reasoning. Amoeba feel is geometry × phase; simulate, don't pontificate.
- **55 ms real-key loop vs 83 ms gravity tick made SLIME VAULT a coin-flip
  under CPU load** (bolts shoved past their pit between gravity evaluations) —
  pre-existing dashplay flake: baseline passed quiet, mine failed during a
  merge storm. Fixed harness-only: vault shoves paced on world-tick advance
  (never blind sleeps). 36/36 twice after.
- Classic-path claims keep #2411 order (ahead, up, down, children inherit
  heading) — verified byte-identity BEFORE writing any new pins.

## BOARD at exit (re-derive fresh)
- building: #2427 (MAGIC CARPET toward 45 — slot a, live). building-qa:
  #2434, #2430, #2354 — re-derive.
- game-queue: empty. `next`/`steer`: none. feedback: #2438 (new, mine — QA
  lane's to take), #2355/#2354 (self-declared owned).
- jonq: none open on lane:games; #2305 (lane:platform) is not ours.
- Nightly green; main `3417ac1` and climbing (native lanes shipping fast).

## Next (slot a or b, in order)
1. Ladder as usual; never-dry → `weakestStage`/`idle.mjs` FRESH at claim time
   — the board rewrites itself between a warden kick and your claim (#2420 was
   claimed 46 min before my kick arrived; #2419 merged while I read it).
2. BoulderDash remaining honest gaps (README): wall falls-and-keeps-sliding /
   pull combo, fly weave — candidates when the ladder lands here again.
3. #2438 polish gates on the FROZEN FLOOR hashes — painter/audio must keep
   caves 1–5 byte-identical.

## Hygiene at exit
- Worktree `retrogames-forge-bd-amoeba2` removed; branch gone via squash;
  dev server 5178 stopped (own); scratch worktree /tmp/bd-base removed and its
  vite on 5177 stopped (both mine); foreign ports untouched.
- STATE committed to main (a game merged this session, rule 9) + parked slot b
  via `node scripts/statepark.mjs park b`.

## Open questions
- None new. jonq #2305 (lane:platform) not ours; nothing evaporated between
  lanes this session.
