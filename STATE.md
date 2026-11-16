# STATE — session 300 (2026-11-15, slot a)

## Playable now / what shipped
- **BOULDER DASH: the multi-head amoeba (#2444 → PR #2450, merge `0486f6d`).**
  Live at jalfern.com/retrogames/boulder-dash — **FORK BASIN** is cave 7 (marker
  `FORK BASIN` verified in served chunks `index-CGUafQuW.js`/`index-DHxgeFru.js`).
  Never-dry pick (`weakestStage` score 4 — top of the unheld shelf; flagship stage
  spent). New variant `AMO_FORK`: a head **advances and plants a perpendicular
  sibling**, so one origin grows several independently-cornering fingers that wrap
  a pillar and enclose space — the signature BD blob, and the README's oldest gap
  ("rarer multi-head wave shapes are not here"). Distinct from #2428's mirrored
  vise (two *separate* waves); this is one creature, many heads.
  Containment law: ≤1 new head/wave/pass (`forked` ledger), hard-capped at
  `CFG.amoForkMax`=4, plus #2411 gens-expiry → fills its pocket, hits boundaries,
  dissolves; claims only EMPTY/DIAMOND. Zero RNG. `amoExt` gates the variant hash
  so the 5 pre-#2428 caves + GOO GALLERY stay byte-identical.
- Gates: **dashcheck 155/155** (new MULTI-HEAD section: fork birth, ≥2 heads/≥2
  headings, wrap-around-a-wall, hard cap, dissolve, FORK BASIN containment+win) +
  **168/168 mutants** (new `amoFork`) + **dashplay 42/42** (multi-head live: peak
  6 fronts/4 headings, dissolves 27→0, zero page errors) + lint:mario/fps/ai + build.
- DEV probe now reports `heads`/`headDirs` so QA can see the front count in-browser.

## Also this session (no own game — reconciled a stale claim)
- Warden target **#2428** was ALREADY shipped by **slot b** mid-session (PR #2436 /
  `6c4c2c6`, merged 02:25Z) but left `building`+OPEN because the PR body said
  *"closing … (#2428)"* in prose, not the `Closes #` keyword, and b died before
  step-8. My `forge-claim` re-grabbed the stale label (see catch below). I verified
  prod, credited b, closed #2428 (`shipped`), then shipped my OWN game (#2444) so
  the slot never ran dry. Net: my slot's game code this session = #2444 only.

## BOARD at exit
- building (lane:games): **empty** (#2428 and #2427 both resolved this window).
  game-queue: empty. `next`/`steer`: empty. waiting-jon: empty.
- building-qa / QA-polish: #2430, #2354 held. Fresh feedback: **#2438** (BD amoeba
  polish — I EXTENDED its scope to cover the #2444 fork tells/audio/finger-telegraph),
  #2434 (EXCITEBIKE pack feel).

## Next (slot a or b, in order)
1. Refresh the ladder; games `building` is empty, flagship spent (#2438 owns amoeba
   polish). Run `weakestStage` FRESH — it returns BOULDER DASH again only until
   #2438 is claimed. Likely real-mechanic runners-up (score 2): PrinceOfPersia
   (sky = presentation, SKIP for gameplay), GardenGuard solver gap (=harness, SKIP),
   ViperPit/Britannia/Open gaps. **Verify the picked gap is a mechanic a player
   notices before building (#2391)** — do NOT build a README honesty-disclosure note
   as "work" (the trap this session: weakestStage's BD pick was a disclosure, not a
   feature; I aimed at the actionable "multi-head" half).
2. Clean gameplay candidates: LodeRunnerLite vault-3 one-fewer-life slack; WWI
   Dogfight "Circus winnable at hp 1" (difficulty).
3. Re-file never-dry only after confirming nothing a flagship/QA owns is in the way.

## The session's catches
- **Two lanes collided because forge-claim's liveness regex has a gap.** It matches
  `^(QA|FORGE) \(slot\): (claimed|checkpoint)` — but slot b's checkpoint lines are
  bare `FORGE: <sha> pushed…` (NO `(slot)`), so they do NOT hold the lock. Combined
  with a merged-but-not-Closes'd PR leaving `building`, slot a legitimately re-claimed
  shipped work. Worth a harness fix: stamp the slot on every builder checkpoint, OR
  treat a bare `FORGE:`/`QA:` line as liveness too. Until then: after a claim,
  `git ls-remote` the branch + grep `origin/main` for a content marker BEFORE
  building — gone branch + feature-in-main = already shipped, reconcile and move on.
- **Carve-ops `[x,y]` with no tile type coerce to `0 = EMPTY`.** My first wrap-room
  fed wall coords without a type; the "wall" became air and slime walked through.
  Every carve op MUST carry its tile constant.
- **Amoeba head-cap must be a hard ceiling.** Gating forks on the previous pass's
  front-count let EVERY head fork in one pass (3→6→9). Fixed: one fork per wave per
  pass (`forked` ledger) → climbs to the cap and holds.
- **A sibling merge can purge your worktree mid-session.** When b squash-deleted
  `forge/bd-amoeba2`, the worktree-purge unregistered that dir while I sat in it →
  git/gh "not a repository". Pass `--repo` explicitly and re-checkout when a path
  vanishes.
- **Verify-from-the-other-side held again** (prod hashes ≠ local; pull the LIVE
  entry, extract its chunk list, grep chunks for a marker).

## Hygiene at exit
- Dev server 5173 stopped (own pid only); foreign ports untouched.
- Worktree retrogames-forge-bd-fork removed; branch gone via squash; main detached
  at origin/main (`0486f6d`). #2444 commented+shipped+closed; #2428 reconciled+closed.
- STATE.md committed to main (game merged this session) + parked slot a.
