# FEEDBACK.md — live playtest log → work queue

**This file is a scratchpad for realtime voice feedback while playing.** Dictate while
playing; I transcribe, organise into blocks, turn each item into a proposal with a size, and
then execute the queue offline. Nothing here is a spec until it gets a ✅ decision.

## The loop

1. **You play and dictate.** Messy, half-sentences, "oh he saw me — oh wait, no". Don't
   clean it up, don't worry about whether it's actionable. I want the confusion verbatim,
   because the confusion *is* the data.
2. **I process** each entry into: what you said → what I think it means → the proposed fix →
   size (`S` < 30 min, `M` a few hours, `L` a session) → and whether it needs a decision
   from you or I can just do it.
3. **You mark the queue** — ✅ do it, ❌ not a problem, ↻ discuss. Anything unmarked I
   treat as "probably worth doing" and pick by value-per-token at night.
4. **I ship in the repo's normal way**: branch → PR → CI (`lint:heist` + `heistcheck`
   blocking) → squash-merge → Vercel. Every fix that can have a check gets a check, and the
   check gets mutation-proved (revert the fix, watch it go red). `raccoon_next.md` holds the
   standing state; this file is the rolling inbox.

Legend: `⏳` logged, unprocessed · `📋` processed, awaiting your mark · `✅` approved ·
`🚧` in progress · `🚀` shipped

---

## BLOCK A — CLARITY: "what am I supposed to do, and where is the thing?"

The single most important block in this file. You said: *"it's still not exactly clear how
I'm supposed to play this game"* — and then, standing at the pound with the game telling you
to chew a lock, *"I don't see a lock."*

### A1. There is no lock to chew. Draw it. `S` → 🚀 shipped 2026-09-16 (see Log)
> *"you need to draw the lock somehow, if I'm supposed to chew through the lock… I don't see
> a lock"* — correct. `makeCage()` builds bars, a roof, a floor and a sign. There is **no
> padlock mesh anywhere on the pound.** The vault has a wheel and a dial, so chewing *that*
> reads; the cage asks you to chew an object that does not exist, and the only cue is a line
> of HUD text.

Fix, and this generalises: **every interaction has a body in the world.**
- Add `makePadlock()` to `art.js`: shackle + body, brass, slightly emissive so it reads at
  night, ~0.28 m, hung on the cage door's two front bars.
- It gets chew-feedback: shake proportional to progress, sparks/particles on the last 30%,
  and it **falls off** (drops, tumbles, rests on the ground) when the chew completes.
- Same rule for the other verbs: the bin lid gets a visible latch when it's a hide spot, the
  gate gets a chain that snaps when the cart is full, a loot pile that's already been visited
  keeps an empty scuff instead of just vanishing.
- Check to add in `heistplay`: for every interaction the sim offers (`focus().kind`), there
  must be a mesh within 0.6 m of the focus point. That turns "the affordance is invisible"
  from a playtest finding into a build failure.

### A2. The help screen is being used — but is it readable? `M` → 📋
> *"I am using more of your help screen, so that's good."*

Good news: the controls card is now honest (the round-2 lie — `B / E: fling a shiny` when B
did nothing and F lured — is fixed and is now enforced by a Node check that fails the build
on any advertised key the engine doesn't handle). Open question, needs your eye: is the card
too wordy, and do you read it *during* play or only after you're stuck? Candidate: a one-line
in-world prompt at the current objective ("TAKE THE SACK — E", "CHEW THE LOCK — HOLD E"),
shown for the first job only, fading out once you've done it twice.

### A3. Objective text must name the object you're looking at `S` → ✅ probably
"CART FIRST. SHINY SECOND. PANIC THIRD." is a fun line and a bad instruction. The HUD
objective should reference what's in front of you, in the words the object itself uses, which
is also what makes A1's check meaningful.

---

## BLOCK B — CAMERA: algorithmic camera is hard, we are over-trusting it

> *"when I start, you're doing something with the algorithm where you're trying to move the
> camera automatically… keep in mind, auto camera stuff is pretty hard… we shouldn't overdo
> our expectations. But also his starting position is just sort of screwed up… it's super
> hard to get him out of where he starts, and it's really shaky, really generates sort of
> back and forth."*

Agreed on the principle: the auto-camera currently does four jobs (auto-face the open
direction at `start()`, shoulder-probe sliding, occlusion retreat, and climb-when-blocked)
and they interact. `heistplay` proves it never *buries* itself in a wall, but "not in a wall"
is not "feels good", and "back and forth" is the classic signature of a camera with no
hysteresis — the slide picks a bearing, that bearing immediately becomes the blocked one, and
it swings back.

### B1. Add hysteresis / dwell to the slide `S` → ✅ do it
Commit to a chosen slide bearing for ~0.7 s, and require the alternative to beat the current
bearing by a widening margin the longer we've held it. That is the standard cure for
camera-flicker in a corridor and it's ~10 lines in `updateCamera`.

### B2. Damp the climb, and stop climbing on a near-miss `S` → ✅ do it
Climbing when a wall clips the view is right; climbing on a graze makes the frame bob. Dead
zone on the block amount, and cap the climb rate so it can't jerk.

### B3. Move the crew out of the tight spot at spawn `S` → ✅ do it
If the camera has no room, no amount of algorithm fixes it — the *level* is wrong there.
Spawn currently sits in the corner of the yard next to the cart and a wall, which is the worst
place on the map to put a third-person camera. Either nudge the spawn cell or carve the yard a
metre wider, and `heistcheck` should then assert the spawn has N metres of camera clearance in
every direction (a new invariant, and it would have caught this without a playtest).

### B4. A quiet "recentre" that always works `S` → ✅ do it
`G` exists. Make it also reset the slide and the climb instantly, and add it to the touch pad,
because "the camera is doing the thing again" needs an answer a thumb can give.

### B5. Consider: turn off auto-face at start `S` → ↻ your call
`start()` casts 16 directions and faces the openest. It's the "something with the algorithm"
you noticed. It avoids a wall on frame one; it also feels like the game has an opinion. Might
simply want a fixed, hand-authored opening shot per job.

---

## BLOCK C — STEALTH FAIRNESS: the crew standing in a pile

> *"he saw one of my friends. So all of us raccoons start in the same spot — if I stay where
> my raccoon friends are, he will come, but he will always find the nearest raccoon, and I can
> kind of hide behind them."*

Sharp observation, and it's two separate problems wearing one hat:

### C1. The crew spawns stacked → spread them `S` → ✅ do it
Three raccoons in one square is why "hiding behind a friend" works at all: you can't be
separate from the crowd. Scatter the start across 3–4 m with the *same* objective visible from
each, and the trick stops being free. (`heistplay`'s spawn checks will need updating to match,
and `heistcheck` should pin the minimum pairwise spawn distance — a level invariant, not a
test detail.)

### C2. Should a guard bag the nearest raccoon, or the one he saw? `M` → ↻ discuss
The sim already tracks suspicion **per-watcher, per-prey**, so the machinery to have a guard
keep chasing the raccoon that *spooked* him exists — it's a policy change, not a rewrite. The
stealth-fairness question is genuinely a design call:
- **Nearest** = readable and mean. What you see happening is what happens.
- **Last-seen** = rewards the "send in the scout, sneak the loot" tactic the three-raccoon
  gimmick is *for*, and the HUD already sells it ("the heat chases whoever it last saw").

My proposal: last-seen for the first ~4 s of a chase (so the intended decoy play works), then
nearest (so a guard isn't pathologically dumb). Plus the HUD tag on the crew panel showing who
each guard is locked on, because right now this all happens invisibly in the sim.

### C3. Two in the cage, and it read fine ✅
> *"I see 2 of them in jail. You did manage to keep them as 2 raccoons, and they kind of fit."*

Confirmed working — the catch→switch→pound chain from round 2 holds up under real play. Keep
the cage capacity behaviour; if a third joins, make sure they don't Z-fight (worth one look).

---

## BLOCK D — CHARACTER: the raccoon works, the dog does not

> *"it's pretty clever and it does read as a raccoon, much better than your black cat or dog
> or whatever. We really have to fix that… the fact that they wiggle while it moves around
> helps a lot. The dog just looks really, really stiff."*

The win is unglamorous and it transfers: **the raccoon reads because the legs, tail and ears
move while it walks** — not because the mesh is detailed. The walkers (`makeWalker` /
`animWalker`: guard, cop, dog, cat) are currently near-rigid, which is why the dog reads as a
black brick on legs.

### D1. Give the walkers the raccoon's trick `M` → ✅ highest-value art item
Per-kind gait in `animWalker`, using the same apparatus the raccoon already has:
- **dog**: four-leg contralateral trot (diagonal pairs), spine flex, tail sweep, head bob,
  ears back at full sprint. Faster gait frequency than the raccoon. A dog's read *is* its gait.
- **guard/cop**: heavier two-beat walk, weight shift hip-to-hip, torch arm counter-swing,
  cap brim dipping, coat tails.
- **cat**: liquid slow walk, tail held high and curling, longer single-support phase — and make
  it bolt sideways with a hitch when it bolts.
- Cheap multiplier for all of them: a contact shadow blob (they currently shadow only from the
  moon light, so they skate on some surfaces).

### D2. Even the raccoon's legs can be better `S` → 📋
You said the wiggle helps "even though they don't work perfectly". Worth one honest pass: foot
plant on the down-beat (not just a sway), a tiny body bounce in the stride, and a distinct
crouch gait — right now crouching mostly just lowers the rig.

---

## BLOCK E — THE CITY: buildings are flat and primitive

> *"the buildings, the city, the escape, those buildings are pretty flat and primitive right
> now."*

Agreed, and it's the biggest remaining visual gap. Right now a wall is a merged box with a
brick texture — the *material* is good, the *silhouette* is empty, and from a chase camera 8 m
back a flat wall is a flat wall.

### E1. Break the facade silhouette `M` → ✅ biggest visual win per token
Instanced, cheap, procedural — all the parts are already in `art.js`:
- ledges and cornices at floor lines, window sills and lintels, a drip line;
- fire escapes (the alley diorama already builds one), AC units, drainpipes, meter boxes;
- graffiti/stencil decals and WANTED posters (both exist as textures) hung *near the route*,
  because they're also level-reading cues, not just decoration;
- varied wall heights per level so the skyline isn't a box.
Batching rule already proven here: one merged mesh per material, `InstancedMesh` for repeats —
the level is currently 43 meshes and must stay roughly there (check pinned).

### E2. The escape route is a dead end visually `S` → 📋
The gate is a rectangle in a wall. It should *read as the way out from across the yard*:
streetlight on it, a gap in the skyline, an alley mouth leading to it, a road sign. Half
signage, half geometry.

### E3. Rooftops and depth `L` → 📋
If the camera can see over a low wall it sees… nothing authored. Either fake street depth with
billboarded building plates or raise the whole boundary. Probably M once E1 lands.

---

## BLOCK F — GROUND, LIGHT, WEATHER: this part is already working

> *"I just had a flash of lightning and I could hear the thunder, that was great. And the fact
> that I can see the water on the ground — it would be really cool if we could give the floor
> some visual texture, graininess or something, and continue to play with the specular
> lighting. I could keep going forever."*

Keep everything here — the storm and the wet asphalt are the atmosphere of the game, and the
lightning is a *mechanic* (thunder masks footsteps), not just a light show.

### F1. Graininess on the floor `S` → ✅ cheap and high-impact
More grain, aggregate, cracks, oil staining, tyre marks, painted kerb lines, a drain grate.
Same tiles, more channels: a **normal/relief map** generated from the existing value noise, so
graininess shows up under the torch and the lightning rather than only in albedo.

### F2. Specular variety: wet everywhere, in different ways `M` → ✅
Right now wetness is roughly uniform. Make it spatial: puddles mirror, damp patches shimmer
faintly, dry patches are matte. Practically: bake a wetness mask into roughness +
metalness/`envMapIntensity` per texel. This is where "I could keep going forever" actually
pays — a rainy street that reflects differently under a lamp than under a moonlit wall is 80%
of the mood.

### F3. Storm beats are worth more than one flash `S` → 📋
Rolling thunder over 2–3 beats, rain density ramps, wind gust on the washing lines, and a
`masked` window per crack — so the storm becomes a rhythm you plan a run around. The weather
system already sets `masked`; it just needs more interesting weather.

### F4. Reflection of the raccoon in puddles `L` → 📋
Cheap trick (stretched, blurred sprite) or skip. Log it as the "nice if the rest is done" item.

---

## BLOCK G — CONTROLS: two keys per action is a UX decision I made and didn't explain

> *"you have a number of characters per control. F / B: fling a shiny. Does that mean either
> F or B works? It's a little confusing to me. And I'm also not sure that all the keys are
> working. Something's either my understanding of what they're supposed to do isn't what they
> actually do, or we're not capturing all the key press events."*

**Answer to the literal question: yes, either key works** — `F` and `B` both lure, `E`/`Space`/`Z`
all work, `Q`/`X` both switch, `Shift`/`R` both sprint. They're aliases, not a sequence. But
"F / B" is ambiguous notation and the honest fix is notational, not mechanical:
- Write it **"E (or Space)"** — the primary key first, the alias in parens. Keep one *primary*
  per action in every prompt; aliases belong in the card, not in the middle of a sentence.
- The card is also missing the scroll affordance if the list clips on a phone — worth a look.

### G1. But I don't believe "all keys work" yet — instrument it `S` → ✅ do it first
Your second suspicion is the important one, and I can't answer it by re-reading the code (I
already added a check that every advertised key is *handled*, and it's green — which only
proves the string exists, not that the key does what you expect while a guard is chasing you).
So: **key + action telemetry in DEV.** Every keydown prints a HUD/console line —
`B → LURE ✓ (shiny 2 left)` / `B → nothing in range` / `B → swallowed (paused)`. Reasons for
"nothing happened" get *names*: key not handled, action handled but no target, action blocked
by screen/phase, action consumed but failed a rule (no shinies, wrong distance, caged).

That distinction — "my key is broken" vs "the game refused and said nothing" — is the whole
complaint, and today the game is silent in all four cases. Then `heistplay` adds a check: every
action has a defined, distinct outcome in every phase, and each refusal produces a visible
message.

### G2. Failure silence is a design bug, not a UX nit `S` → ✅
"No shinies left", "too far", "somebody's watching", "you're in the pound" — each refused input
gets a short, specific, in-world reason. Same treatment for the mouse/touch pad.

---

## Today's shortlist (my ranking, once you've marked the above)

| # | Item | Block | Size | Why first | Status |
|---|---|---|---|---|---|
| 1 | Draw the padlock on the pound (+ affordance-vs-mesh check) | A1 | S | You could not do the thing the game told you to do | 🚀 done, 107 checks, 9 mutants |
| 2 | Make the world keep real time, then the camera at low fps | — (new) | S | CI was red and the laptop green: the sim ran at ~½ speed and the checks measured the runner | 🚀 done 2026-10-06 — camera green at 6 fps too; it exposed the sim putting the actor inside a wall at low frame rates, which is next |
| 3 | Slide hysteresis + climb damping + move/spread the spawn | B1–B3 | S | "shaky, back and forth" poisons every minute after — and B1 is now the *only* red `heistplay` has | ⏳ next |
| 4 | Spread the crew at spawn | C1 | S | Also fixes the free-hiding exploit | ⏳ next |
| 5 | Key + action telemetry, then name every refusal | G1–G2 | S | Settles "are the keys working?" with evidence | ⏳ |
| 6 | Dog / cat / guard gaits | D1 | M | The game's characters currently look stiff next to the raccoons | ⏳ |
| 7 | Facade detail on the walls | E1 | M | Biggest visual gap in a game that already looks good at night | ⏳ needs the mesh budget raised first |
| 8 | Floor grain + normal relief + specular variety | F1–F2 | M–S | The stuff you said you could keep going forever on | ⏳ |

## What's working — don't undo this
- **Raccoon rendering reads as a raccoon.** Keep the leg/tail/ear wiggle, protect it when
  reworking anything nearby.
- **Lightning + thunder + wet ground.** The mood is already there and it's *mechanical*.
- **The pound holds multiple raccoons and the job keeps going after an arrest** (round 2's fix
  survived real play).
- **The help screen is being read**, and it now tells the truth about keys.

## How I'll turn this into overnight work
Each ✅ becomes a branch with a check attached, merged when CI is green. I'll write a dated
entry here per item — what I did, what the check asserts, what I mutation-proved, and what I
couldn't fix and why — so the next playtest starts from a list of things to look at, not a
changelog.

---

## Log

### 2026-10-06 · — 🚀 the world was running in slow motion and the checks blamed the game

CI ran `heistplay` 94/104 red while the laptop was green, and the interesting part is that
*both were telling the truth about different games*. The fixed-timestep loop in `index.jsx`
capped catch-up at five ticks — 83 ms of world per frame — so at 6 fps the heist runs at
half speed and at 2 fps it runs at a sixth. The runner was rendering maybe 2–4 fps, so
"walked for one second" was 0.17 s of raccoon, "the vault door moved 0 m" was true of a door
that had been chewed for a fifth of its timer, and the torch check reported 21 s because the
stopwatch was the wall and the meter was the world.

What changed:

- **`MAX_CATCHUP = 250`** (15 ticks): real time down to 4 fps, and `heistplay` now says so
  out loud — `the sim keeps real time at this frame rate`, with the floor reported instead of
  asserted when the box cannot even draw 4 fps.
- **`npm run heistclock`** (`scripts/heistclock.mjs`) prints `loop / job x real time @ fps`
  per CDP CPU throttle. The old clamp: **0.59x @ 7 fps**. The new one: **1.00x @ 6 fps**.
  That is the whole bug in two lines, and it is now a command rather than an argument.
- **the harness speaks world seconds.** Every wait in `heistplay` is
  `window.__simSleep(0.3)` = 0.3 s *of raccoon* (wall sleep scaled by a measured EMA of the
  world rate, 150 ms floor), and every budget is read off `window.__gameTime()`. Five CPU
  throttles now run the same suite: `npm run heistplay -- --throttle 32` is 110/110 at 60 fps
  and 107–109/109 at ~17 fps — the residue is the camera section, which is intermittently
  honest there and is the next commit.
- **launch flags**: `--disable-background-timer-throttling`,
  `--disable-backgrounding-occluded-windows`, `--disable-renderer-backgrounding`, and *not*
  `--disable-frame-rate-limit` — that one spins rAF at 600 fps and stops `--throttle` from
  being a slow machine at all.

Three of the fixes were about the driver being a bad player rather than the game being wrong,
and all three showed up only once the world could move between polls:

- standing in a torch beam until spotted **lost the whole crew** before the pound test. The
  loop was watching `probe().caged`, which flips back to false a frame after an arrest
  because being caught hands you the next raccoon — the exact trap the CAUGHT section had
  already written down. Now it counts the pound, and it breaks on the `spotted` event instead
  of taking "two more samples", which was two crew bagged.
- the rescue section **looped over an empty list** on runs where nobody got caught, so two
  mutants ("chewing does not shake the lock", "a chew that frees one leaves the cage open")
  walked green through a whole suite. It now fills the pound to two itself and asserts it had
  a prisoner.
- the lock's "rattle" was measured as *any movement*: with the shake code switched off in the
  engine the suite still saw 0.32 m of shaking, which was the lock falling off. Now it is
  lateral, only while the lock is still hanging, and must change direction twice.

The mutant harness also had a live bug (`survived` after a rename — every run crashed at the
summary and the summary was the point), and its two survivors were both suite holes. Nine for
nine die now.

**And the runner itself was the next layer.** The first CI run *after* this branch said
`sim clock 0.14x real time at 1 fps`: GitHub's runners rasterise in software, and at 1100x700
with MSAA and shadow maps the game draws one frame a second there. 106/109 was the best that
was ever going to be available — a 1.5 s chew yields two or three samples of a shaking lock,
and a camera that slides over ten frames cannot settle in one. So `index.jsx` grew a
documented `?lite=1` path (no MSAA, no shadow maps, pixel ratio 1 — a real weak-phone option,
not a test-only back door), `heistplay` asks for it plus a 640x426 window when `CI` is set,
and it prints which pipeline it drove. Locally nothing changes; on a 64x-throttled laptop the
lite path holds **1.01x real time at 7 fps**. The rattle check also stopped demanding a
*reversal* when the frame rate cannot show one, and a self-inflicted bug came out with it
(the driver reset its own sample list while re-hunting for a torch, then reported `det=0`).

**Then the camera got its own round, because CI kept red-shaming two checks.** Four real
bugs came out of it, none of them visible at 60 fps: the retreat floor was tested *before* the
subtraction so the last step overshot into a fur close-up; the rig oscillated buried-clear
frame after frame (it now dwells on the last clear placement while this frame's is solid and
still a valid shot); the camera shake could jitter the rig straight back across the grid edge
it had just been pulled off; and the final gate only ran when the rig was *already* closer
than `MINVIEW`, so a point that came out of the retreat inside brick reached
`camera.position` untouched — it measures the bearing now, from the furthest the map allows
down to the 0.7 m fur floor. Mutant #10 covers the first, and it only exists at low frame
rates, which is why mutants can now carry `throttle: N`.

And the driver was still lying twice: the torch hunt scored candidates on the game's own
detection `rate` (because `los + cone + range` was parking the raccoon where the meter never
left zero) — but the *fastest* rate is "you died", so it now aims for ~0.8 s of meter and
prefers the further cell — and its cold start teleported blindly backwards for up to sixteen
steps until it landed on a guard, lost the crew to contact, and reported `det=0.00` as a
stealth failure. It only moves to cells the game calls safe. "The lock shakes while it is
being chewed" was passing *vacuously* over an empty rescue log; it now asserts a prisoner, the
engine's own rattle amplitude and a measured lateral swing, and demands a reversal only at
frame rates that can resolve one.

What is left is not the camera. In the north-west pocket at 6 fps the **raccoon itself** ends
up 8 cm inside `fur1` — `near()` says so — so every cell behind it is solid and a legal camera
does not exist. That is a movement question at low frame rates (`blocksMove`, the push-out),
with a reproduction in the job log, and it is the next commit. Full pipeline locally:
**110/110**. CI-shaped (lite, 6 fps): **107/109**, and the two reds are that corner, on purpose.

**Round 3, and the corner stopped winning.** After the hysteresis round CI still red two
camera checks at 5 fps, and the probe settled the argument: by the buried frame the *raccoon*
is 8 cm inside `fur1`. With the actor inside the mesh, every cell behind it is brick from
`MINVIEW` down to the fur floor — so the rig now takes the nearest legal cell in **any**
direction, nearest bearing first, instead of rendering texture with a HUD on it. Both reds are
gone at `--throttle 64` (**109/109**), the full pipeline is untouched at 60 (**110/110**), and
mutant #11 deletes the escape hatch and must go red at the throttle, because at 60 fps the
escape is never reached and the mutant would be equivalent by luck. What remains is the thing
the camera was being blamed for: how does `blocksMove` let a 60 Hz simulation put the actor
inside a wall?

**Still red, honestly:** at ~17 fps the shoulder rig buries itself one frame in five in the
north-west corner. I fixed the retreat loop's floor (it tested `allowed > 0.55` *before*
subtracting 0.35, so the last step landed at 0.35 m — a screen full of fur, and the check
agreed: `min 0.35 m`), but once the slid bearing is inside brick at every legal distance the
rig has nothing left to try. That is B1: hysteresis — remember the last clear placement and
keep it until a genuinely better bearing opens up. It is the next commit.

### 2026-09-16 · A1 🚀 every verb now has a body (+ the vault door was never a door)

**What I did.** `makePadlock()` and `makeChain()` in `art.js`: brass shackle-and-body, faintly
emissive so it survives a night map, hung on the pound's door face; a chain and padlock across
the getaway gate. The pound turns to face the approach (same open-cell scan the vault doors
use) so the lock is on the side you walk up to. Chewing shakes the lock harder as it gives,
fires brass filings past 60 %, and the lock comes off and tumbles to the ground; the gate chain
snaps off when the cart is full. Engine state: a chew that frees one of two **re-locks** the
cage (the pound is not open just because you opened it once), and an arrest re-hangs a lock
that was on the ground.

**What the check asserts.** `engine.affordance()` returns, for the verb currently on offer,
the point in the world it points at and the material that ought to be there — derived from
the *level and the verb*, never from the prop, so deleting the prop fails rather than moving
the goalpost. `__heistTest.afford()` measures to each mesh's **world bounding box** (the
level is merged into a dozen batches whose origins are the middle of the map, so an origin
distance test measures nothing). `heistplay` then walks every verb it meets on the route —
`take, deliver, chew, shiny, can, free` — and:

- the list of verbs it must visit is **scraped out of `focus()` in the engine source**, so a
  verb added later without a body fails the build instead of hiding;
- for `free` and `chew` the mesh must be *the lock* (material name), because cage bars are
  meshes too and none of them is chewable;
- the lock must jitter while chewed, be back on the door while anyone is still inside, and
  be on the ground when the pound is empty;
- the chain must be on the floor after the gate goes up;
- the vault plate must be centred in its cell (≤ 0.45 m), merged (1–4 meshes on the pivot),
  and must **move** (≥ 0.3 m) when the lock is chewed.

`heistplay` 81 → **107** assertions, all green. `heistcheck` unchanged at 303.

**What it found that I was not looking for.** The vault door had never been a door. Its
plate was offset by one door radius *before* `bakeMeshes`, which applies that offset twice
(geometry baked in world space, parent transforms it again on draw), so the plate drew
0.86 m outside its cell; and the door group was not marked `keep`, so the frame's bake
absorbed the plate into the static batch and `pivot.rotation.y` was rotating an empty group.
The chew made a HUD happy and a sound. Two `bakeMeshes` traps now written up in the game
README, because both will bite again.

**What I mutation-proved.** `npm run heistmutate` (new, tracked): nine mutants, each a fixed
bug put back by an anchored swap, each run through the real driver, each restored from a
`/tmp` copy. Seven died immediately. Two did not, and both were the harness's fault:

1. *hiding the padlock with `visible = false`* survived — `reset()` re-hangs every bit of
   hardware on a retry, so the flag was repaired before the driver ever moved. The honest
   mutant removes the lock from the cage group; that one kills five checks with
   `kind: free, want: padlock, hit: null, near: []`, which is "I don't see a lock" as data.
2. *measuring the plate by its object origin* survived a door that never opened, because a
   merged mesh's origin sits on the hinge. The check now measures the geometry bbox.

While writing #1 I also found `afford()` was checking `mesh.visible` on the leaf only, so
anything hidden inside an invisible parent still counted as "seen" — fixed (`drawn()` walks
the chain), pinned by its own check, because none of the route checks could see that bug.

**What I did not do, and why.** A1 also asked for a bin-latch on hide spots and an empty
scuff where a stolen pile used to be. Both are more meshes, the level is at 48 of a pinned
50, and the honest shape for either is one `InstancedMesh` toggled by scaling instances to
zero rather than a mesh each — that is now written in the game README's known gaps instead
of quietly budget-busting here.

