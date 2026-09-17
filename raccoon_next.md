# RACCOON HEIST — state of play and next steps

**Handoff doc.** Written at the end of playtest round 2 so a fresh session can start
without re-deriving anything. Read `src/games/RaccoonHeist/README.md` for the design
contract (file boundaries, carving, the three sim rules) and `notes.md` for the history of
what broke and what each fix cost. This file is only: *where we are, and what to do next.*

## Where we are

- **Live in production:** https://www.jalfern.com/retrogames/raccoon-heist
  (also on a phone — the touch pad auto-enables; `?pad=1` shows it on desktop).
- **Branch:** `main` @ `3dc142d`. Nothing uncommitted, nothing unmerged. PRs #38–#40 merged
  and squash-merged per the repo workflow.
- **Gates, all green:** `npm run heistcheck` **303** · `npm run heistplay` **81** ·
  `npm run lint:heist` clean · `npm run lint:mario` clean (shared shell untouched-but-covered).
  `lint:heist` + `heistcheck` are in the blocking CI `static` job; `heistplay` is in the
  manual `verify` job (headless Chrome) and should be promoted to `pull_request` once the
  browser suite has been green a few times.
- **A green `heistplay` run is a full job:** walks with a thumb vector, steals, gets spotted
  in <1 s, gets arrested, is handed a crewmate who can still walk, chews two friends out of
  the pound (2.4 s / 1.8 s), loads all four piles, raises the gate, clears the job.

### Shape of the code (6.9k lines, all runtime-generated art and audio — no assets)

| File | Lines | Owns |
|---|---|---|
| `engine.js` | 1471 | the simulation: movement, AI, detection, heat, loot, camera rig |
| `art.js` | 1587 | every texture, material, rig and prop, generated at runtime |
| `index.jsx` | 954 | renderer, input (`KEYMAP`), HUD, screens, `__heistTest` |
| `world.js` | 547 | grid → scene: merging, instancing, the **collider list** |
| `levels.js` | 530 | the three maps, carved; pure Node, no THREE |
| `stealth.js` | 212 | pure sight/noise/gait/score maths; pure Node |
| `audio.js` | 276 | three heat-reactive beds + ~20 SFX, synthesized |
| `alley.js` | 252 | the attract diorama |
| `scripts/heistplay.mjs` | 761 | Chrome plays job 1 (81 assertions) |
| `scripts/heistcheck.mjs` | 288 | Node level audit + the grid-sampler contract |

### The numbers that are load-bearing

Change one of these and a named check fails — that's deliberate, and each was picked from a
playtest report, not from taste.

| Constant | Value | Why | Enforced by |
|---|---|---|---|
| `CELL` (levels) | 2.2 m | at 1 m a corridor is a toilet booth and no chase camera fits | direction + collision checks |
| `detectRate` base (stealth) | `4.6·align / max(2.6, d·0.8)` | ~1.1 s to be spotted at 5 m in a torch; the old `2.6/dist` took 2.4 s | "torch at working range… inside the budget" (distance-scaled) |
| `CHASE` (engine) | guard 3.4 / dog 4.4 / cop 3.55 | a raccoon **walks at 2.75** — anything under that and walking is safety | arrest checks in `heistplay` |
| `moveProfile` speeds | walk 2.75 / sprint 5.0 / crouch 1.35 | sprint is the only escape and it's loud (noise 8.5) + costs wind | stamina + arrest checks |
| `w.cool` after a bagging | 2.8 s | a guard tying a sack is not reaching for the next raccoon | "job survives an arrest" |
| catch reach | 1.15 m (dog 1.25, surprised 0.85) | was 0.62 m — a handshake; "I was on top of him" | "alerted guard who reaches you bags you" |
| prop colliders | hydrant 0.34, box 0.5, can 0.42, lamp 0.26, cart 0.78, **pallets none** | grid-only collision meant walking through furniture; you can step over a pallet | "nothing walks through a prop" (stops at r + `RADIUS` = 0.74 m) |
| camera | `MINVIEW` 2.1 m, shoulder `sh` 0.55 rad ×5 (±158°), `need` 3.1 m, retreat floor 0.55 | pulled-in cameras bury themselves in brick | "PRESSED AGAINST A WALL" (5 checks) |

## Traps that have already bitten twice

1. **Cell space vs metres.** `losWorld`/`castWorld` take metres and walk a cell-indexed
   grid. Every step must be `/ CELL`. When the world was rescaled to 2.2 m this was missed
   and *every distance was 2.2× too large*: the camera buried itself in walls, guards saw
   through the last metre of every doorway. `heistcheck`'s "THE GRID SAMPLER" section now
   asserts clearance **in metres** per level (restoring the bug fails 9 checks). Also:
   `castWorld`'s direction argument is a **unit vector**, `losWorld`'s is a delta — I got
   that wrong separately.
2. **`git checkout <path>` on a dirty tree** destroyed a session of uncommitted
   `engine.js` while reverting a mutation. Revert mutations with a `/tmp` copy
   (`cp /tmp/e.good.js …`), and commit before experimenting.
3. **A driver that lies about its own input teaches nothing.** The touch pad speaks screen
   coordinates (thumb-up = negative DOM y) and `index.jsx` negates it; the first direction
   test pushed `stick(0,1)` meaning "forward" and correctly walked backwards. Use the
   `thumb(dx, dyUp)` helper in `heistplay`.
4. **Checks that can't fail.** Every new check must be mutation-proved before it's believed.
   Already proven: inverted strafe sign → 3 direction checks red; empty collider list →
   collision checks red (33 m walked through a lamppost); `0.62` catch reach → arrest check
   red; old `detectRate` → timing check red (2.4 s vs a 1.43 s budget); old sampler → 9
   `heistcheck` checks red. Also `npm run heistcheck -- --mutate` (seals the vault, the
   audit *must* complain).
5. **Watch the cage count, not `probe().caged`.** Being caught switches `active`, so the
   active raccoon is never caged for long. The driver hit this twice.
6. **Screens are React state; the engine can disagree.** The frame loop feeds the sim
   nothing while a result card is up, so a driver that "revives" a busted job must also
   `t.goto('play')` or it taps into a paused game and blames the grab button.
7. Never `git push` to `main`. It happened once (round 1); recover by branching `HEAD`,
   pushing, PR-ing, and `git branch -f main origin/main`.

## Next steps, ranked

### 1. Play it yourself and tell me what's wrong (highest value)
No harness can judge feel. Specifically: does the guard feel dangerous or unfair, is the
stick good, is the camera readable in the museum corridors, does job 1 take too long.

### 2. Jobs 2 and 3 have never been *played*
They're audited (`heistcheck` covers reachability/cover/patrols/lasers) but `heistplay`
only drives job 1. Highest-value code task: make `heistplay` take a job argument
(`npm run heistplay -- --job 2`) and play all three. Job 2 is the museum (lasers + a locked
office + inside/outside patrol routes); job 3 is the manor (dogs, storm/thunder masking,
the moonstone). Expect real map bugs — job 1's audit found 20 on its first run.

### 3. A player who only walks has never been tested
The driver teleports. Add a *no-teleport* mode to `heistplay`: a path of thumb inputs only,
walking the real route from spawn → loot → cart → gate. That's the closest thing to a human
run and it would catch stuck corners, unreachable-by-walking loot, and dead zones.

### 4. Guards never speak
Alerts are visual + musical only. Voice blips ("Oi!"), or even just a per-kind bark icon
over the guard's head (the `icon()` + `makeIconTex` machinery already exists: `?`, `!`,
paw, `zzz`, ear). Cheap, big character win.

### 5. Smaller known gaps
- **Cat is a distraction, not a system** — bolts when seen, has no stash and no reward for
  following it.
- **Lasers are timing gates**, not destructible; no fusebox.
- **No save/progress/settings**, no colourblind cone palette, no between-job score card.
- **Fur blows out** under open lamplight (fill dialed to 2.2, still bright).
- `npm run lint` (whole repo) still has ~740 pre-existing errors in the DOS/IF adapters —
  deliberately not a gate; don't "fix" it as a drive-by.

### 6. Housekeeping
- Promote `heistplay` to `pull_request` in CI once the manual browser job is green ~3 times.
- Draw calls: level 43 meshes / scene ~120. The cast is ~155 small meshes (articulated rigs
  can't batch without skinning) — if it ever needs to come down, merge per-material static
  children inside each rig, keeping anything in `userData.anim` unmerged.

## Commands

```bash
npm run dev                    # :5173 — required by heistplay and shot
npm run heistcheck             # Node, ~1 s: levels + stealth model contract
npm run heistcheck -- --map 2  # ASCII dump of a job
npm run heistcheck -- --mutate # seal the vault; the audit MUST go red
npm run heistplay              # Chrome plays job 1: 81 assertions, writes scripts/.shots/h20-play.png
npm run lint:heist             # eslint over the game + shared shell + scripts
npm run shot -- --url "http://localhost:5173/retrogames/raccoon-heist" --out scripts/.shots/x.png \
  --steps '[{"down":"Enter","wait":1200},{"up":"Enter","wait":300}]'
```

**Debugging in the page** (`__heistTest`, DEV only): `why()` prints every nearby watcher's
`los / align / cover / light / rate / det` — the fastest way to answer "why can't he see me";
`camClear()` prints `inside` (camera in geometry — unplayable) vs `clear` (framing);
`watchers()` includes `cool` and `chasing`; `near()` lists nearby meshes with material names
for "why is there a box in my spawn".
