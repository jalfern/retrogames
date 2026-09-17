# RACCOON HEIST — state of play and next steps

**Handoff doc.** Written at the end of playtest round 2 so a fresh session can start
without re-deriving anything. Read `src/games/RaccoonHeist/README.md` for the design
contract (file boundaries, carving, the three sim rules) and `notes.md` for the history of
what broke and what each fix cost. This file is only: *where we are, and what to do next.*

## Where we are

- **Live in production:** https://www.jalfern.com/retrogames/raccoon-heist
  (also on a phone — the touch pad auto-enables; `?pad=1` shows it on desktop).
- **Branch:** `heist-frame-rate-clock` (PR pending) — the world now keeps real time at any
  frame rate the browser can draw at 4 fps or better. Previously merged: PRs #38–#43.
- **Gates, all green:** `npm run heistcheck` **303** · `npm run heistplay` **110** at 60 fps
  and **109/109** at `--throttle 64` (~6 fps, the CI pipeline) ·
  `npm run heistclock` **1.00x @ 6 fps** · `npm run heistmutate` **11/11 mutants die** ·
  `npm run lint:heist` clean ·
  `npm run lint:mario` clean (shared shell untouched-but-covered).
  `lint:heist` + `heistcheck` are in the blocking CI `static` job; `heistplay` is in the
  manual `verify` job (headless Chrome) and should be promoted to `pull_request` once the
  browser suite has been green a few times. `heistmutate` is a hand tool (~20 min): it is
  how every new check here gets believed.
- **Round-3 playtest should look at:** the pound door (there is a padlock now — it shakes,
  then falls off), the vault door (it has never opened before this week), the gate chain
  coming off when the cart is full, and whether the brass reads at night where you actually
  stand. Level 2 and 3 still have never been *played*.
- **A green `heistplay` run is a full job:** walks with a thumb vector, steals, gets spotted
  in <1 s, gets arrested, is handed a crewmate who can still walk, chews two friends out of
  the pound (2.4 s / 1.8 s), loads all four piles, raises the gate, clears the job — and it
  now reports the frame rate it did that at, because a pass on a machine that cannot keep
  real time is not a pass.

### Shape of the code (7.6k lines, all runtime-generated art and audio — no assets)

| File | Lines | Owns |
|---|---|---|
| `engine.js` | 1646 | the simulation: movement, AI, detection, heat, loot, camera rig, lock hardware |
| `art.js` | 1672 | every texture, material, rig and prop, generated at runtime |
| `index.jsx` | 993 | renderer, input (`KEYMAP`), HUD, screens, `__heistTest` |
| `world.js` | 555 | grid → scene: merging, instancing, the **collider list** |
| `levels.js` | 530 | the three maps, carved; pure Node, no THREE |
| `stealth.js` | 212 | pure sight/noise/gait/score maths; pure Node |
| `audio.js` | 276 | three heat-reactive beds + ~20 SFX, synthesized |
| `alley.js` | 252 | the attract diorama |
| `scripts/heistplay.mjs` | 972 | Chrome plays job 1 (107 assertions) |
| `scripts/heistcheck.mjs` | 288 | Node level audit + the grid-sampler contract |
| `scripts/heistmutate.mjs` | ~200 | eleven fixed bugs, put back on purpose, one at a time (two need a CPU throttle to exist) |

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
| camera | `MINVIEW` 2.1 m, shoulder `sh` 0.55 rad ×5 (±158°), `need` 3.1 m, retreat floor **0.6 m on the step** | pulled-in cameras bury themselves in brick; testing the floor *before* the subtraction let the last step land at 0.35 m | "PRESSED AGAINST A WALL" (5 checks) |
| `FIXED_DT` / `MAX_CATCHUP` | 1/60 s, 250 ms of world per frame | real time down to **4 fps**; five ticks (83 ms) meant half speed at 6 fps and the CI reds were the machine | "the sim keeps real time at this frame rate" + `npm run heistclock` |
| affordance tolerance | 0.6 m, and the mesh must be *the lock* for `free`/`chew` | a verb whose object is not drawn is the "I don't see a lock" bug | "EVERY VERB HAS A BODY" + the coverage gate that scrapes `focus()` |
| chew times | vault 1.6 s, padlock 1.5 s (× `def.grab`) | the lock must give faster than the vault: inside the pound, the clock is the enemy | "a rescue is desperate, not a chore" (300 ms–4 s) |
| level meshes | **48 of a pinned 50** | the padlock, the chain and the gate padlock cannot merge with the cage or the gate (they have to move) | "level geometry stays batched" — E1 (facades) must raise this pin on purpose |

## Traps that have already bitten

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
   active raccoon is never caged for long. The driver hit this **three** times, and the
   third was the expensive one: standing in a torch beam until spotted watched `caged`, kept
   going after a good arrest, and lost the whole crew before the pound test.
6. **Screens are React state; the engine can disagree.** The frame loop feeds the sim
   nothing while a result card is up, so a driver that "revives" a busted job must also
   `t.goto('play')` or it taps into a paused game and blames the grab button.
7. Never `git push` to `main`. It happened once (round 1); recover by branching `HEAD`,
   pushing, PR-ing, and `git branch -f main origin/main`.
8. **`bakeMeshes(node)` bakes a child's *world* matrix into its geometry, and the parent
   then transforms it again on draw.** Offset a hinged sub-assembly before baking and the
   offset lands twice — the vault plate drew one door radius (0.86 m) outside its cell for
   the entire life of the game. And `userData.keep` on a node disables baking *of that
   node*, not just of its parent's bake: omit it and the frame's bake swallows the door so
   the group the engine rotates is empty; set it too early and the plate stays seven draw
   calls. Bake the node, move it onto its hinge, set `keep`, bake the parent. Both are
   pinned by geometry (bbox centre, bbox travel), not by a screenshot.
9. **`mesh.visible` is not "is this drawn"** — a mesh inside an invisible parent answers
   `true` while rendering nowhere, so an affordance check written that way survives the
   mutation that hides the affordance. Walk the parent chain (`drawn()` in `index.jsx`).
   Related: a mutation that sets a flag `reset()` repairs before play is not a mutation; hide
   the thing from the scene graph instead.
10. **Below ~12 fps the world runs in slow motion, and the harness blames the game.** A
    fixed-timestep loop that simulates at most five ticks per frame can only ever hand the
    world 83 ms per frame — at 6 fps that is half speed, guards and job clock included.
    CI was 94/104 while the laptop was green, and every red was a check written in wall
    seconds. So: waits in `heistplay` are `__simSleep(worldSeconds)`, budgets are
    `__gameTime()`, the cap is 250 ms, and `npm run heistclock -- --throttle 1,8,32,64` is
    the instrument that decides who is lying. Measured: old clamp **0.59x @ 7 fps**, new
    **1.00x @ 6 fps**.
11. **A section that loops over "things that happened" can silently be a no-op.** The rescue
    suite iterated `rescue.log`; on runs where nobody got caught that list was empty and the
    suite reported a clean bill of health having tested nothing — two mutants walked green
    through it. Same family: measuring the lock's "rattle" as *any* movement scored 0.32 m
    for a lock that had just fallen off. Loop over things that happened only with a check
    that they happened, and make the driver arrange for them.

## Next steps, ranked

### 0. The raccoon walks into the mesh at 6 fps — the camera is innocent now, the sim is not
Two camera checks still red at `--throttle 64`, and the probe says why: by the buried frame the
*actor* is 8 cm inside `fur1`, so every cell behind it is solid from `MINVIEW` down to the 0.7 m
fur floor and a legal camera does not exist. Round 4 fixed the four things that were actually
the camera — a retreat that floored on the loop test instead of the step, the buried↔clear
oscillation (hysteresis on the last clear placement), a shake that could cross the grid edge it
had just been pulled off, and a final gate that only ran when the rig was already inside
`MINVIEW` — and killed both the jam and the oscillation. The rest is movement: how does a 60 Hz
simulation let `blocksMove` end with the actor inside a wall? Start at `near()` and the
push-out, not at the camera.

### 0b. Camera polish still owed (B2/B4)
At ~17 fps (`--throttle 32`) the shoulder rig spends one frame in five inside brick in the
north-west corner. The retreat loop now has a 0.6 m floor on the *step*, so it can no longer
end up 0.35 m behind your ear — but once the slid bearing is inside geometry at every legal
distance there is nothing left in the frame to do. What it needs is memory: keep the last
placement that was clear, and only leave it when a probe finds a bearing that is clear at a
real distance. That is B1 in `FEEDBACK.md`, and it is also the fix for "shaky, back and
forth" in the corner, which is the same oscillation seen at 60 fps.

### 1. Play it yourself and tell me what's wrong (highest value)
No harness can judge feel. Specifically: does the guard feel dangerous or unfair, is the
stick good, is the camera readable in the museum corridors, does job 1 take too long.
Round 3 has three new things to look at that no check can judge: whether the padlock is
legible from where you actually stand while chewing it, whether the vault door (which opens
for the first time this week) now reads as a door, and whether the chain hitting the floor
registers as "go" or as noise.

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
- **Affordance hardware exists only for the pound and the gate.** A hide-spot bin has no
  latch and a stolen pile leaves no scuff where it was — both deliberately deferred: the
  level is at 48 of a pinned 50 meshes, and the right shape is one `InstancedMesh` per kind
  scaled to zero, not a mesh each.
- **Cat is a distraction, not a system** — bolts when seen, has no stash and no reward for
  following it.
- **Lasers are timing gates**, not destructible; no fusebox.
- **No save/progress/settings**, no colourblind cone palette, no between-job score card.
- **Fur blows out** under open lamplight (fill dialed to 2.2, still bright).
- `npm run lint` (whole repo) still has ~740 pre-existing errors in the DOS/IF adapters —
  deliberately not a gate; don't "fix" it as a drive-by.

### 6. Housekeeping
- Promote `heistplay` to `pull_request` in CI once the manual browser job is green ~3 times —
  and note that `the sim keeps real time at this frame rate` is the check that tells you
  whether a runner is fit to answer *any* timing question, so look at its line first when a
  browser run goes red.
- Draw calls: level 48 meshes / scene ~120. The cast is ~155 small meshes (articulated rigs
  can't batch without skinning) — if it ever needs to come down, merge per-material static
  children inside each rig, keeping anything in `userData.anim` unmerged.

## Commands

```bash
npm run dev                    # :5173 — required by heistplay and shot
npm run heistcheck             # Node, ~1 s: levels + stealth model contract
npm run heistcheck -- --map 2  # ASCII dump of a job
npm run heistcheck -- --mutate # seal the vault; the audit MUST go red
npm run heistplay              # Chrome plays job 1: 110 assertions, writes scripts/.shots/h20-play.png
npm run heistplay -- --throttle 32   # same suite on a 32x slower CPU (~17 fps) — CI-shaped
npm run heistclock             # world rate @ fps, one line per CPU throttle (`-- --throttle 1,8,32,64`)
npm run heistmutate            # eleven fixed bugs put back, one at a time; ~30 min (`--dry` checks anchors)
npm run lint:heist             # eslint over the game + shared shell + scripts
npm run shot -- --url "http://localhost:5173/retrogames/raccoon-heist" --out scripts/.shots/x.png \
  --steps '[{"down":"Enter","wait":1200},{"up":"Enter","wait":300}]'
```

**Debugging in the page** (`__heistTest`, DEV only): `why()` prints every nearby watcher's
`los / align / cover / light / rate / det` — the fastest way to answer "why can't he see me";
`camClear()` prints `inside` (camera in geometry — unplayable) vs `clear` (framing);
`watchers()` includes `cool` and `chasing`; `near()` lists nearby meshes with material names
for "why is there a box in my spawn".
