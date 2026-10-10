# STATE.md — 2026-10-10 (Sonar Abyss session end)

## Where things stand
**SONAR ABYSS is LIVE at jalfern.com/retrogames/sonar** (#67, PR #95,
squash c144144). Fourth forged game, 20th title. A hidden-information roguelike:
pitch-black seeded sea caves, SPACE emits a sonar ping whose wavefront spreads
BFS through water only — rock never conducts — lighting each cell exactly as
the front arrives, fading to black in seconds. Eels are drawn ONLY as contact
blips where a wavefront physically touched them; the renderer's eel loop
literally has no live-eel path. Pearls score, the vent descends, death rerolls
the seed. Attract demo is the planner's proven route replayed ping for ping.

| since last STATE | what |
|---|---|
| #67 / PR #95 | **SONAR ABYSS shipped** — knowledge/truth split sim → space-time planner → Node info-audit (174 checks, 6 mutants caught) → real-key Chrome (18/18) → merge → prod verify, one session |

## The loop in one breath
launchd → `scripts/forge.sh` → `opencode run` → claim (`next` > oldest
`game-queue`) → build per AGENTS.md → harness that provably fails → real-input
Chrome play → merge ONLY via
`gh pr checks --watch --fail-fast && gh pr merge --squash --delete-branch` →
verify prod bundle → relabel `shipped` + comment URL → rewrite this file.

## What's playable NOW
20 playable titles + 9 emulated classics at jalfern.com/retrogames, plus
`/forge`. Queue heads (oldest first): **#68 Metroid-lite → #69 Momentum
Runner → #70 Ice Climber Co-op → … → #82 BensMagicBugLife**
(`gh issue list --label game-queue`).

## What SONAR ABYSS is, in one line
`src/games/Sonar/{sim.js, index.jsx}`: pure-Node sim (seeded mulberry32 caves
— 7 fixed fallback chambers guarantee connectivity for EVERY seed, so the CI
gate can never be flaky — BFS wavefront reveal with per-tick buckets, a
knowledge layer `mem/blips` separate from truth, deterministic ping-pong eel
patrols) + space-time planner + 20 Hz canvas shell that paints knowledge
only. `npm run sonarcheck` is the new CI gate (with `lint:sonar`): INTEGRITY
(every lit cell == independently recomputed BFS arrival; rock faces via their
lit neighbour; sound-shadowed cells NEVER lit), OCCLUSION (a sealed pocket
inside the blast radius stays dark ~23 ticks until the echo walks the long way
in — Euclid would light it in 4), DECAY, hidden-eel counting, blips graded
against live truth at the firing tick, generation reachability + eel-route
walkability, 5 seeds × 4 depths crossed by the planner with ZERO hits,
determinism + tamper probe. `--mutate`: wavefront/decay/blipOnly/carve/eelKill/
descend — **all 6 caught**. `npm run sonarplay` is Chrome with real keys only —
18/18: fog renders as measured-black pixels, a real SPACE ping lights 1→144
cells, arrows cross a cave and descend, an eel kill goes through the real
collision loop (the rig only re-routes truth), new seed after death, zero
errors; the fog check mutation-failed exactly when the renderer was edited to
paint unknown water.

## Flags for Jon (hard-won, cheap to read)
- **Every red this session was the harness or the shadow, not the caves** —
  again. The planner died because its eel-timeline shadow *double-applied the
  current tick's transition* and bounced route endpoints differently from
  `step()`; the fix was making the shadow the exact same code path, and the
  lesson is general: a predictive model that disagrees with the sim by one
  tick is a collision model written by a liar. The two `sonarcheck` reds were
  grading blips after the eel already stepped (compare at the firing tick,
  allow one route hop) and demanding hidden-eels during a metronome-pinging
  demo (sample the un-pinged opening seconds instead). `sonarplay`'s one red
  was asserting a wall-clock threshold on a world-time cooldown — the heist
  lesson again, third game running.
- **Space-time planning paid for itself.** The naive "block the eel's next
  cell" heuristic deadlocked corridors AND died anyway; (cell × move-window)
  BFS against a precomputed eel timeline crossed 20/20 seeds×depths untouched
  at ~35 ms/cave.
- **The winnability contract holds**: hazards are real (a rigged approach eats
  a life through the genuine loop) but the planned route never dies, so the
  gate never gambles on dodging.
- Streak check (AGENTS #4): last three PRs all changed `src/games/**`
  (#93 Lemmings, #94 Boulder Dash, #95 Sonar). Streak clean.
- Dev server stopped; tree clean; `origin/main` = c144144.

## Three questions for Jon
1. The fog is honest: with metronome pings most of an already-mapped room
   stays lit (fade 4.5 s vs ping 1.5 s). Want the fade shortened (~2.5 s) so
   memory matters more than pinging, or keep it — the phone-player's casual
   path — and let hardcore runs just ping less?
2. Depth 4 exists but the ladder loops back to depth 1 with your score. Is
   "endless descent, escalating eels, your score as the only ceiling" the
   roguelike shape you want, or should depth 4 be a true win with a board?
3. #68 Metroid-lite is the queue head (side-scroll + ability-gated world =
   real overlap with SuperMario's engine debt). Build it on the Mario physics
   or carve a fresh platformer core so Mario stays untouched?
