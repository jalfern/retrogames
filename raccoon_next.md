# RACCOON HEIST — state of play and next steps

**Handoff doc.** Written at the end of playtest round 2 so a fresh session can start
without re-deriving anything. Read `src/games/RaccoonHeist/README.md` for the design
contract (file boundaries, carving, the three sim rules) and `notes.md` for the history of
what broke and what each fix cost. This file is only: *where we are, and what to do next.*

## Where we are

- **Live in production:** https://www.jalfern.com/retrogames/raccoon-heist
  (also on a phone — the touch pad auto-enables; `?pad=1` shows it on desktop).
- **Branches:** none open. Merged: **#45** (the actor was never in the wall — signed depth
  seams, guards through `blocked()`, the suite stops blaming its runner) and **#46** (one
  driver for the Zork agent, bounded prompt wait, `zorkuicheck` speaks the game's clock).
  Before those: PRs #38–#44. The one CI red left is §0a below.
- **Gates, all green:** `npm run heistcheck` **303** · `npm run heistplay` **121/121** at 60
  fps, and at `--throttle 64` (this box manages **2–3 fps**, under the suite's own floor)
  **120/120 + 1 documented SKIP** — see trap 14, the suite now refuses to file a slow
  runner against the game ·
  `npm run heistclock` **1.00x @ 6 fps** · `npm run heistmutate` **13/14 mutants die**, the
  14th survives as documented (the retreat-floor overshoot, covered by the escape hatch) ·
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
| `scripts/heistplay.mjs` | ~1050 | Chrome plays job 1 (122 assertions) |
| `scripts/cornerprobe.mjs` | ~150 | "who is inside the wall — the body or the camera?" Signed metres per rendered frame. Not a gate; the instrument you reach for when the camera section goes red |
| `scripts/heistcheck.mjs` | 288 | Node level audit + the grid-sampler contract |
| `scripts/heistmutate.mjs` | ~230 | fourteen fixed bugs, put back on purpose, one at a time (two need a CPU throttle to exist) |

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
| `RADIUS` (engine) | 0.32 m | it *is* the animal: `blocked()` measures the world against it, so a smaller number is a raccoon standing inside a lamppost while every collider check reads clean | "a raccoon is 0.64 m wide" (must stop 0.32 m outside what it hit, ± one 0.08 m step) |
| `move()` | every body | the raccoon, every guard, both cops and the cat step through `move()`/`blocked()`. The waypoint branch used to step straight at cell centres, so watchmen walked through furniture | "a guard stops at the furniture instead of clipping it", and `npm run cornerprobe` for the argument |
| camera | `MINVIEW` 2.1 m, shoulder `sh` 0.55 rad ×5 (±158°), `need` 3.1 m, retreat floor **0.6 m on the step** | pulled-in cameras bury themselves in brick; testing the floor *before* the subtraction let the last step land at 0.35 m | "PRESSED AGAINST A WALL" (5 checks) |
| `FIXED_DT` / `MAX_CATCHUP` | 1/60 s, 250 ms of world per frame | real time down to **4 fps**; five ticks (83 ms) meant half speed at 6 fps and the CI reds were the machine | "the sim keeps real time at this frame rate" + `npm run heistclock` |
| affordance tolerance | 0.6 m, and the mesh must be *the lock* for `free`/`chew` | a verb whose object is not drawn is the "I don't see a lock" bug | "EVERY VERB HAS A BODY" + the coverage gate that scrapes `focus()` |
| chew times | vault 1.6 s, padlock 1.5 s (× `def.grab`) | the lock must give faster than the vault: inside the pound, the clock is the enemy | "a rescue is desperate, not a chore" (300 ms–4 s) |
| level meshes | **48 of a pinned 50** | the padlock, the chain and the gate padlock cannot merge with the cage or the gate (they have to move) | "level geometry stays batched" — E1 (facades) must raise this pin on purpose |

18. **"Five metres due west" is a formula, not a sightline.** The point-blank stage put its
    guard at `me.x - 5` and asked whether the meter moved. On the runner that was inside a wall,
    `losWorld` said no for six straight seconds, and the suite filed `meter reached 0` as
    "detection broken at 4 fps" — while the laptop, whose earlier sections leave the crew
    standing somewhere else at 60 fps, was green. It now tries eight directions and three
    ranges and keeps the first placement the GAME calls clean (`los && inCone && inRange`); if
    all 24 fail it says so with a reason per placement. **Ask the sim where a watcher can see;
    never compute it and hope.** Same lesson as the camo cone and the verb ray: a fact the
    engine can be asked is a fact that must be asked.

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
12. **A scene-graph interrogator cannot answer a collision question.** `near()`'s nearest
    mesh to a raccoon is a piece of its own rig (`fur1` = crew 1's fur), which is how "8 cm
    inside a wall at 6 fps" got written into a handoff doc and chased for a round. Rigs are
    tagged (`userData.rig`) and skipped; the collision question goes to `bodyDepth()`.
    Related trap, same commit: a check written on `grid` (how deep the *collider* overlaps)
    passed `RADIUS = 0.02`, because a smaller collider is still stopped at the surface —
    `wall` (centre-to-brick) and the pinned 0.32 m waist are the two that can actually fail.
13. **A harness that moves the world must put it back.** Staging the lamppost guard fifteen
    metres off his patrol route broke the *next* two sections (the torch-spotting budget and
    the getaway), and the failure looked exactly like "the torch check is flaky".
    `watcherAt` / `restoreWatcher` exist now, "the staged guard went home" is itself a check,
    and any new warp-the-world section starts by snapshotting.
14. **A check written in seconds is a measurement of the machine the moment the machine
    stops keeping seconds.** `heistplay` has asserted ~40 time-shaped checks since the
    catch-up cap, and reported "frame rate under the floor" as an *info* line while doing
    it. At 2–3 fps that produced a 21-red cascade with the game untouched: the driver
    stood in a torch beam, a guard redraws once per frame (0.33 m of cone-arc at 3 fps),
    so the meter never left zero — so nobody was spotted, so nobody was bagged, so the
    pound was empty for the rescue section, so the job busted before the cart, so
    `afford()` returned null, and the report read "the grab button is broken". Three
    rules now: `claim()` turns a FAILURE into a **SKIP** only once the floor has been
    breached (re-measured per section by `pace`) and only for checks shaped like seconds;
    structural claims (is this cell solid, does this verb have a mesh) are never
    downgraded, because a slow box still answers those honestly; and the job is *revived*
    between sections if the runner beat it, with the number it revived printed. A SKIP is
    not a pass and the tally says how many there were — that is the whole difference
    between an honest green and a lie.


15. **A mutant that survives at *every* frame rate is a report about the code.** The
    fourteenth mutant undid "sample the cone across the arc it swept" and stayed green at
    60 fps, at 32x and at 64x. I had it written up as "this laptop cannot reproduce the CI
    runner" — an unreproducible-machine story, which is the most comfortable kind of wrong.
    `grep` finished it in one move: the mutated line read `w.yawFrom`, and **nothing anywhere
    assigned `yawFrom`**, so `?? yawEnd` made the arc zero, `slices` was always 1, and the
    mutant compared an expression with itself. The engine change is reverted (dead code with
    a green test on it is worse than no code, because it comes with a causal story), and the
    CI failure it claimed to explain was a row of driver bugs wearing one hat — the first
    four found from the log, the next two only by running on the runner itself: polling `det`
    after the alert wipes it, polling the meter of a raccoon in a sack, parking the courier
    within grabbing range of the guard being measured, and a cart section that "emptied the
    yard" by teleport — where a patrol is a route and routes walk home. **Before blaming a
    machine for a surviving mutant, ask what makes the mutated line run.
16. **A staged guard is a loan, and an ALERT guard at three metres is a bagging.** The check
    written to defend trap 13 ("a harness that moves the world must put it back") broke it two
    screens below the rule: it warped an alert guard into the map, forgot him, and he hunted the
    courier through the next two sections — filed as `cargo sticks to the raccoon (held: null)`,
    a red about the GRAB button. Its replacement then got its own actor caged, because alert
    guards close and swing inside a second, so the pound reached the rescue section already full
    and was reported as "the pound does not open". Both are now asserted rather than trusted:
    **five metres, everybody else parked**, and `the staged guard went home and took nobody with
    him` (zero left alert, zero crew bagged by the stage direction). And before any section
    drives a raccoon, `ensureFree()` puts any prisoner back on their feet — a caged actor ignores
    `moveTo` and `tap` completely, which is what "the grab button is broken" actually meant.**

## Next steps, ranked

### 0. ~~The raccoon walks into the mesh at 6 fps~~ — closed: it never did, and `near()` was the bug
The accusation was `"the actor is 8 cm inside fur1"`. `fur1` is crew 1's **fur material**:
the raccoon's own forearm. `near()` lists meshes near the actor sorted by distance, and the
nearest mesh to any actor is a piece of its own rig — a metre of spheres around the point
that is its feet. Every number in the report was real; the inference from "0.08 m from a fur
mesh" to "8 cm inside a wall" was the invention, and a round of camera work went to a wall
nobody had walked into.

The collision model is asked directly now (`engine.bodyDepth()`, `t.depth()` / `t.depths()`,
`npm run cornerprobe`), in signed metres, three columns because the failures have different
owners: `wall` (centre→brick: the **walking** question), `grid` (how deep the 0.32 m
collider overlaps brick) and `cam` (the rig). Measured at 5 fps in that corner over 70 frames
of walking backwards into it: centre bottoms out at **exactly 0.32 m**, collider touching,
never through, zero buried camera frames. `heistplay` pins it, and three mutants prove the
pins bite.

**What the instrument found instead: the guards were ghosts.** The `pathBetween` branch of
`updateWatchers` did `w.x += …` without asking `blocked()`, and the grid is only half the
collision model — watchmen slid through lampposts, hydrants and bins while the raccoon could
not touch one. Six rounds missed it because the chase branch *did* ask, so the only guard
who ever got close to furniture had already caught you. Now every body in the game steps
through `move()`, and `heistplay` stages the pathing branch on purpose ("A GUARD WALKS
AROUND THE LAMPPOST"). Next: the same instrument over jobs 2 and 3, which have never been
played at all (§2).

### 0a. Two things still steer per FRAME, not per second (the last CI reds)

`main`'s browser suite is green except `heistplay`, and the remaining reds are **not** the
21-red cascade this branch already killed. On the runner the world keeps real time
(`1x real time at 5 fps`) — above the floor, so nothing is downgraded — and three checks
fail that both a 60 fps laptop and a 2–3 fps throttled box pass:

- `the rig opens up as soon as there is room` — best settled gap **1.35 m while the log
  prints `clear 6` behind the rig**. The bearing probe and the hysteresis
  (`st.camClearPt`) are per-frame snapshots; at one frame per 200 ms the bearing has slid
  half a corridor between the probe and the placement, so the rig keeps accepting last
  frame's close spot.
- `standing in a torch beam raises suspicion` — **peak meter 0.00**. `why()` says
  `rate 1.25`, the driver stands there, and the cone has turned past that cell before the
  next accumulator tick. The driver's re-hunt then resets the sample window, so the
  assertion sees an empty window rather than a game that never noticed (which is why the
  check prints `last window` now).

Both have the same shape as the catch-up-cap bug this file already documents, one layer up:
the *simulation* is on a fixed timestep, but the **camera bearing and the watcher's cone
sweep ease per frame**, so they run at a rate that depends on the renderer. The fix is a
world-rate accumulator (or `1 - exp(-k·dt)` smoothing) in `engine.js`'s rig and
`updateWatchers`, and the proof is `heistplay` going green on the runner at 5 fps *and*
`heistclock` holding 1.00x — not a raised threshold. Reproduce with
`node scripts/heistplay.mjs --throttle 16` and read the `corner … /side …` line: a `side`
that swings more than ~0.3 rad between samples is the bearing outrunning the probe.

Order of work: cone first (it gates the stealth chain — nothing gets spotted, so nothing
gets bagged, so the pound is empty and the cart section inherits a bust), camera second
(it is one check and one easing constant).

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

### 4b. ~~`zorkuicheck` is load-sensitive~~ → closed: it was a real wedge, and the loop was driving itself twice
One CI run red three checks — *"it maps real ground in the browser, not only in Node" (1 rooms)*
and the input-lock pair — and a re-run of the same commit was 12/12. The check was right to
complain; "load-sensitive" was the wrong noun. Two bugs, both found with `npm run zorkpulse`
under CPU spinners:

- **Two drivers.** `startAi` ran `while (loop.running) await loop.tick()` *and*
  `loop.start()`, which arms `AgentLoop`'s own timer chain. Ticks at twice the rate the
  loop's own 600 ms action gap allows was the first tell; the rest is two `agentSend`s
  racing for the one pending prompt, a `resume()` arriving at a machine that is not asking,
  and an interpreter that then waits for a keystroke nobody sends — with `aiRunning()`
  still reporting true. `frz` climbing while `en=Y` on the probe is exactly that state.
- **A wait with no bound.** The actuator polled for the prompt forever, so a wedge looked
  like an agent who was thinking. It is bounded by the machine's own measured
  command→prompt rhythm now (`max(3 s, 8 × median)`, capped at 20 s), and overruns count in
  `aiActuator()` and stop the loop *with a reason*.

The check keeps the lesson: budgets in the agent's **turns** (wall time is only a stall
detector), arbitration sampled repeatedly while the loop is demonstrably driving rather than
glimpsed once, `--throttle N` to reproduce a busy runner, and a stalled loop dumps its own
diagnostics into the failure line. 12/12 clean, 12/12 under ten spinners, and neutering
`takeOver()` still turns four checks red — a load-proof check that no longer bites would be
a worse trade than the flake.

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
npm run heistmutate            # fourteen fixed bugs put back, one at a time; ~40 min (`--dry` checks anchors)
npm run cornerprobe            # -- --throttle 64: per-frame signed depth of body vs camera in the pinch corner
npm run lint:heist             # eslint over the game + shared shell + scripts
npm run shot -- --url "http://localhost:5173/retrogames/raccoon-heist" --out scripts/.shots/x.png \
  --steps '[{"down":"Enter","wait":1200},{"up":"Enter","wait":300}]'
```

**Debugging in the page** (`__heistTest`, DEV only): `why()` prints every nearby watcher's
`los / align / cover / light / rate / det` — the fastest way to answer "why can't he see me";
`camClear()` prints `inside` (camera in geometry — unplayable) vs `clear` (framing);
`watchers()` includes `cool` and `chasing`; `near()` lists nearby meshes with material names
for "why is there a box in my spawn".
