# AI PLAN — making the computer play the hard games

> **Status: stage 0 shipped** (branch `ai-stage-0`), and it was not the quiet purge it looked
> like. Four live bugs surfaced, all invisible because **no check in this repo had ever opened a
> DOS title** — the harness covered Mario and IronKeep only:
>
> 1. **Every DOS title was broken in `npm run dev`.** `index.html` hard-required
>    `/retrogames/js-dos/js-dos.js`; Vite prepends the base to absolute URLs in `index.html`, so
>    the request became `/retrogames/retrogames/...`, the SPA fallback answered with **HTML at
>    status 200** (so it did not even look like a failure), and `window.Dos` stayed undefined.
>    King's Quest and Ultima I–V all rendered "DOSBox emulator failed to load" in dev while
>    working in production — which is precisely why nobody noticed. Fixed by loading js-dos on
>    demand (`src/utils/jsdos.js`), which also stops Pong downloading 300 KB + 1.4 MB of wasm.
> 2. **The keyboard capture captured nothing.** js-dos 8 binds keydown/keyup on **`window`**; the
>    old code patched `HTMLCanvasElement.prototype.addEventListener`, so the "call the emulator's
>    own handler" path never existed and every scripted press fell through to a DOM dispatch that
>    requires a user gesture. An agent could not have pressed a key if its life depended on it.
>    Captured now off `EventTarget.prototype`, before the emulator script runs.
> 3. **The canvas could not be read at all.** js-dos draws with WebGL without
>    `preserveDrawingBuffer`, so the buffer is cleared at composite: the game looks perfect while
>    `drawImage` / `getImageData` / `toDataURL` return solid black — measured 0 lit pixels of
>    64,000 on a canvas whose own element screenshot showed the intro. §5.3's `eye` arm was
>    OCR-ing black. `jsdos.js` now forces the flag before the emulator asks for a context, which
>    is what makes the A/B experiment possible at all.
> 4. **An unmoving frame is not a broken actuator.** King's Quest sits on the AGI copy-protection
>    box ("Cracked Version !!! Weiter mit ESC") where arrows do nothing *by design*. That cost a
>    session before `scripts/doscheck.mjs` learned to press ESC first — the Mario `?`-block lesson
>    for the third time: an unvalidated sensor quietly turns a working pipeline into a dead branch.
>
> Green now: `zorkcheck` 26/26 (Node, ~2 s, promoted to the **static** CI gate), `doscheck` 13/13,
> `lint:ai` / `lint:mario` / `lint:fps` / `build` clean, and `aicheck` 24/24 proves the spine's
> contract with fake brains — because **no brain is mounted on any title yet**, and a loop whose
> watchdog and rejection counter have never run is a loop whose guarantees are hypothetical. The
> Zork gate proves the sensor tracks five rooms and opens the window with **prose as the
> referee**; the walking brain that decides to go there is stage 1.
> Everything marked *(probed)* was verified on this machine; *(assumed)* needs a check first.
>
> **DECISION (agreed):** build **both** sensors — RAM-peek and pixels-only — behind one `sense()`
> interface, keep the brain sensor-agnostic, and **A/B them** (§5, §6). Not "which is better",
> which is confounded and boring: the experiment is *how much of the win is the sensor*. Also
> settled: **no engine swap** — DOSBox stays, so the AGI-interpreter question (§4.4) is closed.

## 1. What we actually have today

| Game | "AI" today | Where it runs | State access | Verified by |
|---|---|---|---|---|
| **Super Mario** | option 3 rule autopilot + option 4 neuroevolution GA | in-engine, in browser | **full** (it *is* the engine) | `autopilotcheck`, `evocheck`, `evoprobe` |
| **IronKeep** | enemy AI only; the *harness* drives it | in-engine | full | `fpscheck`, `keepplay` |
| **Rogue** | monster AI only | in-engine | full (grid, turn-based) | nothing |
| **Zork I/II/III** | **nothing** — reverted in `ec8b130` | used to be `dfrotz` + a bot on a Hetzner box | n/a | nothing |
| **King's Quest** | a "🤖 AI" button that is **dead code** | browser → `api/kq-ai-move` → Hetzner | **none** (canvas pixels only) | nothing |

Concrete findings from reading + probing the code:

* **The remote brain is gone.** `api/ai-move.js`, `api/kq-ai-move.js`, `api/zork-{state,command,map,pause,resume,restart}.js`
  all proxy to `5.78.145.117:3099` / `:3101`. Both ports did not answer when probed *(probed)*.
  So the King's Quest AI loop captures a screenshot, POSTs it nowhere useful, and retries every 5 s.
* **…and the URL is wrong too.** `src/games/KingsQuest/index.jsx` fetches `'/api/kq-ai-move'` —
  root-absolute, so under `basename="/retrogames"` it leaves this project entirely.
* **Nobody can reproduce either AI.** The bot lived off-repo (server-side `dfrotz`), so the "AI"
  is not in git, not in CI, and cannot be improved by whoever works here next. That is the real
  reason Zork got reverted to pure-client.
* **King's Quest carries ~150 lines of scar tissue** from the key-injection war (`testEsc`, the 🔑
  debug button, an rAF key queue, `fireToCanvases`, a 30 s `addEventListener` monkey-patch). The
  injection trick that *does* work (capturing js-dos' own keydown handler before `Dos()` boots)
  is worth keeping — the rest is noise.
* **`npm run lint` is red, `lint:mario` / `lint:fps` are the gates** — and neither covers Zork or
  King's Quest, so an AI change to either would be merged completely unlinted.

### The Mario lesson worth stealing

Mario's AI is trustworthy for exactly one reason: **it is measured.** `autopilotcheck` must clear
1-1 or CI fails; `evocheck` publishes an honest cold-start baseline table and no longer *infers*
a win from a fitness proxy (because a proxy once reported a flagpole clear a replay could not
reproduce). The two hard games have no measurement at all, which is why both attempts turned into
flailing demos. **Model + metric together, or don't ship it.**

## 2. Why these games are hard (and what that dictates)

| | Zork | King's Quest |
|---|---|---|
| Observability | **perfect, and textual** — the whole game is a transcript | pixels only, no supported memory read |
| Actuator | a string, via the Glk input callback we already own | synthetic key events into DOSBox, real-time |
| Simulatable headlessly? | **yes** — the Z-machine runs in Node, ~ms/move | no (needs DOSBox + a canvas) |
| Horizon | hundreds of moves, one locked door deep | thousands of steps across 5 screens of puzzles |
| Failure mode | wander forever, die in the dark | walk off a cliff, get eaten, soft-lock |
| Free lunch | **undo/save = free backtracking → search is legal** | none |

So the two games need different *senses*, but the same **architecture**: an explicit world model,
a library of skills with success tests, a scripted goal stack, and a metric that CI can fail on.
An LLM is a planner bolted on top of that — never the thing reading raw pixels at 5-second
intervals with 12 lines of memory. That is the design mistake both previous attempts made.

Two deliberate non-goals:

* **No server.** No Vercel function calling an off-repo box, no API key in the client, no shared
  global game state. Everything is in-process (browser for players, Node for checks).
* **No "AI" claim we can't back up.** Ship a progress bar and a score, not a buzzword. A scripted
  walkthrough that demonstrably wins is worth more than a neural net that wanders cutely.

## 3. Zork — do this first

Highest value per hour: the game is fully observable, deterministic, and headless-testable.

### 3.1 Architecture (`src/games/Zork/`)

```
agent/
  driver.js       step(cmd) -> {text, state}      wraps GlkAdapter's waitForInput + print
  world.js        rooms, exits, visited, contents, carry, score, moves, isDark
  skills.js       go(dir) take(o) open(o) put(o) lightLamp() flee() — each returns success/failure
  explore.js      BFS frontier exploration over world.exits
  plan.js         goal stack: lit light source → map → treasures → endgame script
  transcript.js   room-heading + description-hash room identity; response classification
```

Pure ES modules, zero React, zero DOM. The same `agent/` directory is imported by the browser
component **and** by `scripts/zorkcheck.mjs` in Node — one brain, two bodies.

*The control loop is already proven.* A throwaway Node probe (`ifvms` + our `GlkAdapter`) booted
the real `zork1.z3` and played it blind *(probed)*: `open mailbox → take leaflet → north → east →
open window → west (Kitchen) …`, reading the first line of every response. That probe *is* stage 0
of `zorkcheck.mjs`.

### 3.2 Layers, in the order worth building

1. **Sensor/world model.** Parse room headings ("Kitchen"), exit candidates, and the response
   taxonomy (`Taken.` / `You can't go that way.` / `It is pitch black.` / `Your lamp will not
   light`). Room identity = heading + normalised-description hash, which survives the prose noise
   that broke naive trackers. Persist the map to `localStorage` so a session keeps learning.
2. **Skills + success tests.** Every skill returns *did it work*, not just "I sent bytes". This
   is what makes the explorer debuggable and the check script possible.
3. **Explorer.** BFS over the frontier + always-carry-a-light + never-enter-a-dark-room-unlit +
   drop-junk-when-heavy + flee-from-thief/troll. This alone should map most of the map and pick up
   real points with no hand-authored walkthrough.
4. **Walkthrough (the honest part).** A data-driven strategy guide for what exploration cannot
   solve: the labyrinth, the school, the crypt, the treasures into the case.
   `walkthrough.js` = `{ require: {have:['egg'], at:'palace'}, do:[...] }`. Same pattern as Mario
   option 3 — a script that *proves* the engine works, and it is 100 % legitimate to write.
5. **Optional spike (time-boxed, 1 day).** Ground truth instead of prose: read the object tree
   straight out of the Z-machine. `ifvms` already ships everything needed
   (`runtime.js`: `get_parent/get_child/get_sibling/find_prop/get_prop/test_attr`;
   `text.js`: `decode/zscii_to_text/tokenise/parse_dict`) — but in our vendored copy
   `vm.objects === 1051` for a story whose object table sits at `0x2c12`, and `find_prop(1..10)`
   returns one constant, so the header offsets are wrong for this file *(probed)*. Either a small
   `patches/fix-ifvms-headers.cjs` (we already patch ifvms in `postinstall`) or ~80 lines of our
   own v3 object-table reader. Fallback is the transcript model, which works today.
6. **Optional, opt-in: an LLM planner.** Input = world model + inventory + score, output =
   `{skill, args}` **validated against the map before it is allowed to act** (a direction not in
   the map is rejected, the model never free-texts at the parser). Needs a product decision —
   where the model lives, who pays for tokens, and how a demo degrades offline.

### 3.3 `scripts/zorkcheck.mjs` — the best test we will ever have here

Runs **in Node, with no browser and no dev server**, against the real committed `.z3`, and drives
the same `GlkAdapter` and the same `TranscriptSensor` the browser mounts — one sensor, two
bodies. There is no walking brain yet, so it drives the story with a scripted walk plus a fuzz
phase and grades what the sensor believed. What it asserts today (26 checks):

* every command it ever sent was legal — the run fails if `Sorry, I don't know the word`
  appears anywhere, so "it sort of worked" cannot pass by guessing at the parser;
* **`open window` is proved by prose** (`nailed and boarded` before, absent after). A score bump
  is *not* accepted as proof — in this version opening the window is worth 0 points;
* the map stays a **tree** — a second arrival at a known room must name the same rooms on both
  sides, or the run fails (this build prints no room headings, so two rooms can read identically,
  and a silently-aliased map costs every frontier behind the merge);
* no dead-end retried, no move into a wall, no disambiguation blank;
* ≥ 4 rooms entered with names, and **no document title leaked into the map** (a real bug the
  first version shipped: the leaflet's title row parsed as a room name);
* the percept actually changes as the world changes, and the bot is the *real* module;
* a refused move is classified `blocked`, not `moved` (also a real bug it caught: the window
  message satisfied `You can't go that way.` because `Can't` sits in the character class);
* no Glk/VM error anywhere, score parsed from the status line, moves counted.

Because it is browser-free it is fast enough to add to the **static** CI job, which currently only
lints and builds. Sub-second-per-move AI regression: Mario can never have this, Zork can.

## 4. King's Quest — fix the senses before the brain

Order matters here. Solving KQ is not the first milestone; *being able to tell what happened* is.

1. **Canvas OCR (stage 1, ~1 day).** AGI draws its messages in a fixed 8×8 CGA font. Build a
   glyph atlas once (capture it from the running game, or from the CGA ROM in the bundle) and write
   `ocr(canvas) -> lines of text` plus `readStatus() -> {score, moves}`. Now the agent can tell
   "You can't go there" from "A bear is coming this way" — which is the entire difference between
   a state machine and a coin flip. Fully testable offline: `npm run shot` a known frame, assert
   the decoded string.
2. **Screen-graph / motor layer (stage 2).** KQ1 is a grid of screens joined at known x-offsets.
   Explore → fingerprint the frame (downsampled pixel hash, *not* OCR) → nodes and edges, with the
   lethal edges (cliff, maze, river) recorded as blocked until the solving item is held. On top of
   it: `walkTo(x)`, `climb()`, `openHere()`, `board()`, each verified by OCR + screen change.
3. **Walkthrough (stage 3).** The three-treasure chain as data with preconditions, driven by the
   same skill library. To be authored from the game's own logic rather than folklore — see 4.1.
4. **RAM-peek sensor (`sensors/ram.js`) — the privileged arm.** *Correction to my first draft:*
   I claimed DOSBox exposes no memory. I had only listed **function** exports (all minified: `_a`).
   *(probed)* **the linear memory is exported** — `pa` in `wdosbox.wasm`, `Ee` in `wdosbox-x.wasm`.
   So a page-load hook on `WebAssembly.instantiate*` captures `exports.pa`, and
   `new Uint8Array(mem.buffer)` is the whole guest DOS RAM: AGI's current room, ego x/y/dir/cue,
   the actor table, 256 global vars, 256 lvars per script, the parser's verb/noun slots.
   Two honest caveats: the RAM base has to be *found* (signature scan), and KQ1-specific encodings
   (inventory lives in per-object global-var slots invented by the game's own logic) have to be
   **derived empirically**, not trusted from folklore. Both are self-checking: prove the framebuffer
   you found in the heap matches the canvas pixel-for-pixel, and prove a var ticks only when the
   thing it claims to track actually happens. ½-day go/no-go spike, §7 stage 4.

   *Why not a JS AGI interpreter instead* — researched, then rejected:
   [AGILE](https://agi.sierra.games) *does* run KQ1 in the browser today, but *(measured)* it loads
   **20 MB of GWT-transpiled Java** (28 MB total, one 20 MB `cache.js`) and needs site-wide
   COOP/COEP (`require-corp`, verified in its headers) which is a hazard for the `jalfern.com`
   proxy; the engine is Java, so nothing of it lives in our lint/test harness.
   `r1sc/agi.js` is the only TS clean-room interpreter and it is a **2017** skeleton (no sound,
   dictionary incomplete, README admits missing specs). Everything serious is GPL. Verdict: keeping
   DOSBox and reading its memory is cheaper, and the visual result stays authentic.

### 4.1 Free, and nobody has done it yet: harvest the game offline

The AGI resources are committed in `public/games/kingsquest.jsdos`. A Node tool
(`scripts/kqharvest.mjs`) can decode `words.tok` (vocabulary/object names) and the `logic.*`
scripts (the `if isset(flagN)` conditions *are* the puzzle graph) into a documented puzzle map.
Build-time only, no runtime cost — and it turns "what does the AI need to know" from folklore into
a file we can review and diff.

### 4.2 `scripts/kqcheck.mjs`

Dev-server + Chrome (like `mariocheck`), asserting: OCR golden strings on captured frames;
walking right N times creates the expected map edge; the agent never crosses a blocked/lethal edge
without its item; score/moves parsed from the status line and increasing; frame-time budget.

## 5. Shared spine (`src/ai/`) and the sensor layer

The sensor boundary is the whole design, so it gets a named type instead of a loose method.

```js
// The ONLY thing a brain is allowed to see. Sensors fill it; the brain never touches
// the canvas, the heap, the DOM, or the transcript directly.
Percept = {
  room,                              // fingerprint/id, not a picture
  ego:      { x, y, dir, moving, conf },
  actors:  [{ id, x, y, view, loop, visible, conf }],
  inventory: [name],
  message: { text, conf },           // the language channel
  score, moves,
  ts, sensor: 'ram' | 'eye' | 'hybrid',
}
```

Three backends, same shape, **per-field confidence**:

| Backend | How | Strengths | What it cannot do |
|---|---|---|---|
| `ram` | `WebAssembly` memory hook → AGI systable + KQ var map | exact, free, instant | sees no picture; `var[41]==2` is meaningless until *we* map it |
| `eye` | canvas only: CGA 8×8 font atlas → `message`; **ego x/y by template-matching the ego VIEW sprites decoded out of our own bundle**; room by perceptual hash of the background band | the human-shaped experiment; no cheating channel | ego position is detection not truth; inventory must be inferred from history |
| `hybrid` | `ram` for state, OCR for language | likely the best *player* default | — |

The ego-by-template-match is what makes the arms comparable rather than "cheat vs handicapped":
we own the exact 8 CGA Graham sprites, so locating him in a frame is a matching problem with a
known answer, not a guess. Every field carrying `conf` is what makes the planner degrade honestly
(`conf 0.4` → rescan, do not commit to the climb) instead of acting on a confident fiction.

Zork gets the identical split, which is why this is architecture and not KQ scaffolding:
`sensors/transcript.js` (parse the prose, like a human reading) vs `sensors/zmachine.js` (object
tree via `ifvms` memory) — same `Percept`, same brain, same A/B machinery, and Zork is
**deterministic**, so it is the clean version of the experiment.

```js
// every game brain implements this
{ name, sense() -> Percept, skills -> {name: fn}, step() -> {skill, args}, metrics() -> {progress, notes} }
```

* `src/ai/loop.js` — event-driven tick (**not** the current fixed 5 s), stuck watchdog (N steps
  with no new state → backtrack / change policy), a ring buffer of `sense→decide→act→verdict`.
* `<AiBadge />` — the strip every game currently hand-rolls (state, last action, progress bar).
* `ai: { plays: true }` in the `GAMES` registry → the Arcade Menu can badge "🤖 PLAYS ITSELF",
  and each card can advertise the honest metric ("reached 42/350, mapped 27 rooms").
* `lint:ai` covering `src/ai src/games/Zork src/games/KingsQuest scripts` — added to the CI
  `static` job, so this code is finally inside a gate.

### Dead code to delete in the same pass

`api/` (all seven proxies), the Hetzner constants, `testEsc`/🔑/`fireToCanvases`/rAF queue in
King's Quest (move the working `addEventListener` capture to `src/utils/dosKeys.js` and restore it
after the first successful capture instead of on a 30 s timer), and the orphaned root-absolute
`/api/...` fetch. Add an AGENTS.md gotcha so the next person does not resurrect the tunnel.

## 6. A/B protocol — how to compare two senses that see different things

"Which sensor wins" is not a real question: `ram` is strictly stronger on facts, so it will win,
and the result will teach us nothing. The honest measurements:

1. **One swapped module.** Same brain, same skills, same walkthrough data, same step budget, same
   seed. Only `sense()` differs. If two things change, the run is worthless.
2. **The referee is always RAM.** Even in the `eye` arm we log what the heap actually said. That
   turns perception into a *scored* quantity: room-ID accuracy, ego position error in pixels, OCR
   exact-match rate — measured on the same run the agent is playing, not on a lab corpus.
3. **Shared currency.** Score delta, screens crossed, puzzle flags set, deaths, steps-to-goal,
   per-skill success rate. Never "did it look cool".
4. **Break it on purpose.** Inject synthetic OCR dropout (10 % / 30 %) into the `eye` arm to find
   where the policy collapses. *This* is the interesting result, and it is the argument for
   confidence-weighted percepts rather than a wish.
5. **Paired, repeated, counterbalanced.** DOSBox is not deterministic (`cycles=auto`), so: pin
   `cycles=fixed N` for the lab, run N≥10 trials per arm from the same saved state, report medians
   and spread, and alternate which arm goes first so warm-up/save-state bias cancels.
   Zork's A/B needs none of this — it is byte-for-byte reproducible.
6. **Label it in the UI.** The strip prints `SENSING: RAM | EYE | HYBRID`. No generic "🤖 AI"
   badge that lets a privileged run pass for a perceptive one. The AI diary (what it believed →
   what it did → what happened) is shown next to it.

Output: `scripts/kqab.mjs` + `scripts/zorkab.mjs` → JSONL run artifacts, a markdown table pasted
into the PR body, and the artifact uploaded by the manual CI job.

## 7. Stages — each one demoable, each one gated

| Stage | Work | Proof it worked |
|---|---|---|
| **0** ✅ | purge `api/` + KQ scar tissue; `src/ai/` spine; `__zorkTest`/`__kqTest` hooks; `lint:ai`; **plus** the four bug fixes above | `zorkcheck` 26/26 in Node; `doscheck` 13/13 in Chrome (ESC past the AGI box, arrows move Graham, Ultima I + Mario unaffected) |
| **1** ◐ | Zork brain: `agent/{skills,map,explorer}.js` — verb primitives, description-fingerprint map learned only by walking, assumed-edge verification, BFS frontier | **17 rooms, 42 walked edges, Kitchen entered, 23 assumptions tested, never died, never said an illegal word, stopped with a stated reason.** Gap: the lamp is not in hand yet (see below), so the dark half of the invariant is untested in anger |
| **2** | Zork walkthrough layer (treasures → case) | ≥ 1 treasure delivered, HUD progress bar, live demo |
| **3** | KQ `eye` sensor: CGA font OCR + ego sprite template-match + screen hash + screen graph | golden-string OCR test; ego position within ±8 px of the RAM oracle; ≥ 4 screens mapped by walking |
| **4** | `ram` spike (find RAM base, locate the framebuffer, validate against canvas) → `sensors/ram.js` + a derived, *tested* KQ var map | go/no-go in writing; every var in the map ships with an assertion proving what it means |
| **5** | A/B runner + first paired experiment ("reach the garden holding the egg", ≥10 trials/arm, `ram`/`eye`/`hybrid`) | medians + spread table, and a perception-accuracy curve under injected OCR noise |
| **6** | KQ motor macros + first treasure walkthrough, run in all three arms | score increases on camera; `kqcheck` in the manual CI job |
| **7** (opt) | Zork sensor A/B (transcript vs object tree — the deterministic version); LLM planner behind an opt-in toggle; Rogue autopilot (free once the spine exists) | Zork A/B reproducible byte-for-byte; planner accept/reject counts visible |

**Stage 2a (shipped): read the prose the game already gives us.** The Kitchen
returned `visible: []` with a bottle, a sack and a cake in it, because the parser
only understood *"there is X"* while Zork writes *"X is sitting on Y"* / *"On the Y
is X"*. A sensor wrong toward an empty room is worse than one that hallucinates:
the agent stops *wanting* things. Now parsed too: `X contains:` colon lists, and
**exit annotations** — per clause, so the lit passage west is not marked dark
alongside the dark staircase in the same sentence. Claims live in the **map**, per
room, forever, because Zork prints a long description once and re-entry is a stub;
`look` re-reads a room (asserted).

**Stage 1 was partly contaminated.** The brain phase inherited the scripted world —
mailbox emptied, **window already open** — so "it opened the window" was the
harness's doing, and the real cause was two rules with no `return` that could not
act at all. The brain phase now starts with `restart`, and it earns both verbs:

```
ok > open small window   With great effort, you open the window far enough to allow entry.
ok > open small window   Have your eyes checked.      <- and never a third time
```

**Stage 1 honest gaps.** (a) No lamp yet: the Kitchen's contents do not survive
the sensor's prose parsing (`parseVisible` does not capture "A homemade cake is
dying slowly on the peg" style furniture), so the agent has never been *told* a
lamp exists — the dark-room invariant is therefore enforced but unexercised.
(b) The shifting forest is still an admission of defeat, not a solution; the fix
is a landmark/orienteering skill, not a cleverer graph. (c) The brain runs only
in Node — mounting it in the browser needs input arbitration with a human who may
type mid-sentence, which is its own change.

**Execution order is not table order.** Stage `4a` (the `ram` spike) runs *before* stage 3, and
`4b` may follow it immediately if the spike is clean — the `ram` read is the oracle that grades
the `eye` sensor. Building the eye first and the referee afterwards would mean shipping a
perception system whose accuracy nobody can state.

Total to "two games play themselves, two sensors measured, in CI": **~6–7 focused days**.

> **Stage 2a (shipped): read the prose the game already gives us.** The Kitchen
returned `visible: []` with a bottle, a sack and a cake in it, because the parser
only understood *"there is X"* while Zork writes *"X is sitting on Y"* / *"On the Y
is X"*. A sensor wrong toward an empty room is worse than one that hallucinates:
the agent stops *wanting* things. Now parsed too: `X contains:` colon lists, and
**exit annotations** — per clause, so the lit passage west is not marked dark
alongside the dark staircase in the same sentence. Claims live in the **map**, per
room, forever, because Zork prints a long description once and re-entry is a stub;
`look` re-reads a room (asserted).

**Stage 1 was partly contaminated.** The brain phase inherited the scripted world —
mailbox emptied, **window already open** — so "it opened the window" was the
harness's doing, and the real cause was two rules with no `return` that could not
act at all. The brain phase now starts with `restart`, and it earns both verbs:

```
ok > open small window   With great effort, you open the window far enough to allow entry.
ok > open small window   Have your eyes checked.      <- and never a third time
```

**Stage 1 honest gaps.** (a) No lamp yet: the Kitchen's contents do not survive
the sensor's prose parsing (`parseVisible` does not capture "A homemade cake is
dying slowly on the peg" style furniture), so the agent has never been *told* a
lamp exists — the dark-room invariant is therefore enforced but unexercised.
(b) The shifting forest is still an admission of defeat, not a solution; the fix
is a landmark/orienteering skill, not a cleverer graph. (c) The brain runs only
in Node — mounting it in the browser needs input arbitration with a human who may
type mid-sentence, which is its own change.

**Execution order is not table order.** Build the `ram` spike (stage 4a) *before* the `eye`
> sensor (stage 3), because the oracle is what grades the eye arm — otherwise we ship a perception
> layer with no way to say whether it works, which is the exact trap §8 warns about. Safe order:
> 0 → 1 → 2 → **4a** → 3 → 4b → 5 → 6 → 7.

## 8. Risks

* **DOSBox is real-time and `cycles=auto`** → not deterministic. KQ checks must be tolerant
  (thresholds + retakes) and event-driven, or they will be the next flaky-test we disable.
* **OCR under scaling** — the canvas is letterboxed/`pixelated`; sample the internal 320×200 buffer,
  not the displayed element (this is the same HiDPI trap `evocheck` hit in Mario).
* **Long horizons expose one-bad-rule cascades.** Mario's `?`-block bug meant an entire fire branch
  had *never executed*. Mitigation: the ring buffer + per-skill success rate in the HUD, so a dead
  branch is visible instead of silently dead.
* **Zork's object-tree spike may fail** — fallback (transcript model) is already the plan's spine,
  so failure costs a day, not the milestone.
* **A confounded A/B is worse than no A/B.** If the brain, the budget or the start state differs
  between arms we will *still* produce a table, and it will still be wrong. Hence §6.1, and hence
  the run artifacts get committed with the result so the numbers can be re-derived.
* **Wrong RAM offsets fail silently, not loudly.** A stale offset reads *some* integer, which looks
  like a percept. Every mapped address must ship with the assertion that justified it (canvas-vs-
  framebuffer equality; "this var ticks when and only when the egg is taken"), and `kqcheck`
  re-runs those assertions — so an emulator update that shifts the heap breaks the build, not the AI.
* **`eye`-arm latency.** Font atlas + template match on a 320×200 buffer is cheap; doing it on the
  HiDPI-scaled displayed canvas is not. Sample the internal buffer, always.

> Mario precedent worth repeating verbatim: the `?`-block rule was aimed one tile early, so Mario
> sailed over the fire flower *every single run* and the entire fire branch had never executed.
> A silently wrong sensor is exactly the failure mode this design exists to catch.
* **LLM cost/latency/offline demo** — keep it optional and never load-bearing.

## 9. Questions for the review

1. ~~Interpreter or pixels?~~ **Settled: both sensors, one brain, no engine swap.**
2. Is an **LLM allowed in the loop at all** for a portfolio site? If yes: whose API key, budget,
   and does the demo have to work offline?
3. How much **honesty vs. mystique** on the UI? I'd print the metric ("AI: 42/350 points, 27 rooms
   mapped") right on the card — it reads as confidence and it stops us fooling ourselves.
4. Is `zorkcheck` in the **static** CI job acceptable (Node-only, fast) — i.e. do we want an AI
   gate that blocks merges, like `autopilotcheck` conceptually should?
5. Zork **I only**, or all three? I'd hard-scope to Zork I; II/III share the brain but each needs
   its own walkthrough and world data.
6. **Player default** — ship `hybrid` (best play, least pure) with `eye`/`ram` as a lab switch in
   OPTIONS? Recommendation: yes, hybrid by default, arm name printed in the strip at all times.
7. **How loud do we advertise the A/B result?** A table on the game card
   (`ram 100% · eye 71% rooms · eye+30% noise 38%`) is an interesting artefact *and* it is honest.
   The alternative — "an AI plays King's Quest" — is the version we'd keep having to defend.
