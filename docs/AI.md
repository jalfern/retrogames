# The AI spine — sensors, brains, and the Zork explorer

Moved verbatim from `AGENTS.md` on 2026-10-14. AGENTS.md keeps a one-line pointer here.

### AI agents (`src/ai/`) — and what is deliberately *not* in here

There is **no remote AI backend**. Two earlier agents shipped pointing at a Hetzner box
(`5.78.145.117:3099` / `:3101`) that no longer answers, so both "🤖 AI" buttons on the site were
dead — King's Quest was screenshotting itself, POSTing a JPEG to a dead host, parsing an `answer`
field, and its parse-failure fallback **summoned the game's debug wizard** (`testEsc`, which
Types `DEBUG` then `F7`/`F9`). All of `api/*.js` is deleted. Any brain in this repo runs **in the
tab, locally, from on-site code**; if a server-side brain ever comes back it lives in a cloneable
repo and its URL is an env var, never a hardcoded IP.

The spine (reasoning and the staged plan in `docs/archive/qwen-run-2026-09/AI-PLAN.md`):

- `src/ai/percept.js` — the one interface between sensors and brains: a `Percept` with a
  **per-field confidence**. Brains never touch canvas / heap / DOM / transcript directly, and no
  field is optional — a hole must show as `null` + `conf: 0`, never as a missing key.
- `src/ai/arms.js` — `transcript` (Zork: the prose *is* the state) / `eye` (pixels + OCR) /
  `ram` (peek the emulator) / `hybrid` (default where a game declares both). Precedence
  `window.__aiSensor` → `?sensor=eye` → `localStorage['arcade.ai.sensor']` → default, so an A/B
  run is a query param rather than a rebuild. `components/AiBadge.jsx` always prints the arm,
  and `games.js`' `sensors:` list is the ceiling — the badge cannot claim a sense the game lacks.
- `src/ai/loop.js` — `AgentLoop`: one tick = percept → decide → act → settle. Owns the move
  budget, the stuck watchdog, and a counter for **rejected unknown skills**: a brain naming a
  skill the game does not implement must fail loudly, because that is exactly how both old
  agents died silently (unknown intent → parse fallback → debug wizard).
- `src/games/<Game>/sensors/` and `src/games/<Game>/agent/` — per-game sensors and brains.
  `src/games/Zork/agent/` is the first brain (see below). **No title plays itself in the
  browser yet** — the Zork brain runs in Node only, and the King's Quest strip prints
  `SENSING: NOT IMPLEMENTED` instead of pretending otherwise. `scripts/aicheck.mjs` is what keeps
  the spine honest in the meantime — it runs `AgentLoop` against fake brains that reproduce the
  failures this repo has already lived through, so the watchdog and the rejection counter are
  proven before there is a brain to protect.
- `src/games/Zork/sensors/transcript.js` — prose → `Percept`: room heading, verdict (`moved` /
  `blocked` / `taken` / `deadend` / `ambiguous`), exits, darkness, score, inventory. A room name
  is accepted only from a heading row actually printed after a *move*, so a document title (the
  leaflet) or a complaint cannot become a room — that was a real bug the first version shipped.
- `src/utils/dosKeys.js` is the *only* DOS key path, so the harness, the agent and the player's
  fingers share one codebase (a harness that cheats with frozen frames cannot pass for play).

### The Zork brain (`src/games/Zork/agent/`)

`map.js` + `skills.js` + `explorer.js`. Three things about it are load-bearing and
non-obvious; all three were learned by the map being wrong, not by design:

- **Rooms are identified by their DESCRIPTION, not their name.** Zork heads two
  different rooms "Forest" (and two more "Forest Path"), and its Clearing
  physically **moves** ("the clearing spins in the forest, and when it stops, you
  are somewhere different"). Keying on the heading merged the twins, so the map
  inherited an exit from the wrong room and the explorer walked forever toward a
  direction that room did not have, while its own map insisted the way was open.
  Identity is now a fingerprint of the room's first sentence; a heading is a
  *candidate*. Same-named rooms that disagree get `Forest#2`, and past
  `MAX_TWINS` the area is declared **unstable** — the map admits it cannot hold
  that ground, and the agent stops and says so rather than inventing rooms.
- **An edge belongs to the room you stood in.** The first version filed the walk
  onto the destination (`Kitchen --north--> Kitchen`), so origins never recorded
  attempts, `untried()` kept offering the same way, and the agent paced one
  corridor until the watchdog stopped it.
- **A refusal that is not phrased as a refusal still counts.** "The forest becomes
  impenetrable to the north." / "Storm-tossed trees block your way." are clean
  *no*s with no "can't" in them, so the prose classifier said `ok`, the direction
  stayed on the frontier, and the agent asked twenty times. The map no longer
  consults the prose: **asked to go that way and did not arrive ⇒ the way is
  closed.** Derived from the model, not from the phrasing.

**Two rules shipped dead for a whole stage.** Rules 3 and 3b (`open` what is shut;
`open` the noun blocking a refused way) set state and **fell through without a
`return`**, so they could never act — and the suite still "proved" the brain opened
the Kitchen window, because the scripted warm-up had opened it and the inherited
world looked like the brain's work. Both fixed, and load-bearing:

- The brain phase begins with Zork's own `restart`. **A check that hands the agent
  a world its script already unlocked proves nothing.**
- Refusals are derived from *state*, not prose: an ask that changes nothing
  perceptible (`snap()`) is finished, whatever the game said. The regex of
  refusals died to *"Have your eyes checked."* — you cannot enumerate a text
  adventure's sarcasm.

**There is no `WANT` list anymore.** Stage 1 shipped
`const WANT = ['lamp', 'lantern', 'matches']` — a walkthrough smuggled in through the
*goal* rather than the route, while we took credit for the agent "looking for a light
source". Gone. The goal is now derived: the map holds exits **the game itself called
dark** and nothing in hand burns (`needLight`), and the run must produce a receipt —
`fired at 2 dark way(s), game had mentioned a light: false`. Two gates enforce that
no noun ever enters a command unless the game printed it first, in an earlier **live**
reply (95 commands, all traceable). Fixtures may not lie to the arm either: the
`turn on lamp` probe used to leave `lit = true` for the whole brain run, which
switched the grue rule off, because every dark check ANDs with `!lit` — a fixture
that lies to the sensor is worse than one that lies to the check, so the harness now
resets the sensor when it restarts the world.

Assumed edges (the reverse of a walked move) are hypotheses and the brain
*verifies* them — that is how it got indoors at all: east from North of House
filed `west → North of House` as a guess, west from Behind House is actually a
window, and testing the guess is what led to `open window` → **the Kitchen**.
The run reports `verified=N` so "evidence vs guesswork" is a number.

Two rules the next stage must keep. **The parser is gated, the map is not:** legality may come
from `games.js`-style vocabulary, but a room may only be entered by walking into it, an unknown
exit stays unknown (never `#ng` — in Zork that is a legal *spell*), and two rooms that read
identically are not aliased. Refusing to merge costs one re-walk; merging silently deletes every
frontier behind the merge. And **prose is the referee**: `open window` is proved by
`nailed and boarded` disappearing, never by a score bump — in Zork I that move is worth 0 points.
