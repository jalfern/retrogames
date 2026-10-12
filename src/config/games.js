import PongGame from '../games/Pong'
import SpaceInvadersGame from '../games/SpaceInvaders'
import PacmanGame from '../games/Pacman'
import AsteroidsGame from '../games/Asteroids'
import DonkeyKongGame from '../games/DonkeyKong'
import CentipedeGame from '../games/Centipede'
import DefenderGame from '../games/Defender'
import PitfallGame from '../games/Pitfall'
import FroggerGame from '../games/Frogger'
import MissileCommandGame from '../games/MissileCommand'
import AdventureGame from '../games/Adventure'
import SuperMarioGame from '../games/SuperMario'
import SuperMarioClassicGame from '../games/SuperMarioClassic'
import IronKeepGame from '../games/IronKeep'
import { ZorkI, ZorkII, ZorkIII } from '../games/Zork'
import KingsQuestGame from '../games/KingsQuest'
import RogueGame from '../games/Rogue'
import Ultima1Game from '../games/Ultima1'
import Ultima2Game from '../games/Ultima2'
import Ultima3Game from '../games/Ultima3'
import Ultima4Game from '../games/Ultima4'
import Ultima5Game from '../games/Ultima5'
import { lazy } from 'react'

// RACCOON HEIST is lazy-loaded, and that is the js-dos lesson applied to a bundle
// instead of a <script>: three.js is ~150 KB gzip and Pong has no business
// downloading it. A `lazy()` route component means Vite emits a separate chunk that
// only fetches when someone actually opens the 3D title.
const RaccoonHeistGame = lazy(() => import('../games/RaccoonHeist'))
// Same lesson, second pupil: BEEZEE is the other three.js title, and Pong is
// still not paying for a 3D engine.
const BeeGame = lazy(() => import('../games/Beezee'))
// Third pupil of the same lesson: Lemmings is 2D canvas but its solver runs in
// the tab for the attract replay, so keep it out of the main chunk too.
const LemmingsGame = lazy(() => import('../games/Lemmings'))
// Boulder Dash too: the planner runs in the tab to drive the attract demo, and
// the caves are a compiled grid, so it earns its own chunk.
const BoulderDashGame = lazy(() => import('../games/BoulderDash'))
// Sonar Abyss: same lesson — its planner scripts the attract demo and the
// caves are generated at load, so it keeps its own chunk.
const SonarGame = lazy(() => import('../games/Sonar'))
// MetroidLite: same lesson — the attract demo is the flow machine's own
// proven route, so the planner ships in its chunk.
const MetroidLiteGame = lazy(() => import('../games/MetroidLite'))
// Momentum Runner: the attract demo is the autopilot's own proven route and
// the angle-physics sim is its own chunk, so it lazy-loads like the others.
const MomentumRunnerGame = lazy(() => import('../games/MomentumRunner'))
// Ice Climber Co-op: same lesson — the attract demo is the co-op autopilot's
// own proven three-mountain route, so the planner rides in its chunk.
const IceClimberGame = lazy(() => import('../games/IceClimber'))
// Galaga: same lesson again — the attract demo is the autopilot's own proven
// run, and the path library it shares with the harness rides in its chunk.
const GalagaGame = lazy(() => import('../games/Galaga'))
// Polarity: same lesson — the attract demo is the autopilot's own proven run,
// and the fairness scanner it shares with the harness IS the autopilot.
const PolarityGame = lazy(() => import('../games/Polarity'))
// Missile Battle: same lane again — pure step(state,input), zero Math.random,
// the attract demo is the autopilot's proven run, and the slack rule grades it.
const MissileBattleGame = lazy(() => import('../games/MissileBattle'))
const SimCityMinGame = lazy(() => import('../games/SimCityMin'))
const OutpostGame = lazy(() => import('../games/Outpost'))
// Papers-Please-Min: same lesson — the fairness prover it shares with the
// harness (rules.js/gen.js are the SAME code the booth plays with) rides
// in its own chunk.
const PapersPleaseMinGame = lazy(() => import('../games/PapersPleaseMin'))
// Lode Runner-Lite: same lesson — the solver that scripts the attract demo and
// the deterministic sim it shares with the harness ride in its own chunk.
const LodeRunnerLiteGame = lazy(() => import('../games/LodeRunnerLite'))
// Arena Archery: same lesson again — the autopilot that proves the attract
// demo's match rides in the chunk, together with the pure sim the harness
// imports unchanged in Node.
const ArenaArcheryGame = lazy(() => import('../games/ArenaArchery'))
// Minesweeper: same lesson — the fairness referee that certifies every board
// guess-free is the SAME module the Node harness audits and the attract
// autopilot plays through, so it rides in its own chunk.
const MinesweeperGame = lazy(() => import('../games/Minesweeper'))
// WWI Dogfight: third three.js pupil of the same lesson — Pong is still not
// paying for a 3D engine, and the autopilot that scripts the attract patrol
// (plus the pure flight sim the Node harness audits) rides in its chunk.
const DogfightGame = lazy(() => import('../games/Dogfight'))
// PAPERBOY: same lesson — the route solver that scripts the attract demo is
// the SAME module the Node harness audits, so it rides in its own chunk.
const PaperboyGame = lazy(() => import('../games/Paperboy'))
// WIZARDRY: same lesson — the seeded floors and the solver that proves them
// winnable (and re-proves them with slack supplies deleted) ride in the
// game's own chunk; wizcheck imports those modules unchanged in Node.
const WizardryGame = lazy(() => import('../games/Wizardry'))
// SPY HUNTER: same lesson — the scripted stages and the simulative autopilot
// that proves them (and scripts/huntercheck.mjs audits) ride in their own
// chunk; the harness imports sim/script/planner unchanged in Node.
const SpyHunterGame = lazy(() => import('../games/SpyHunter'))

// Game Registry
// Theme 'dark' = white text (background is black)
// Theme 'light' = black text (background is white)
export const GAMES = [
    {
        path: '/mario',
        builtBy: 'qwen',
        component: SuperMarioGame,
        label: 'SUPER MARIO BROS',
        theme: 'light',
        description: "The platformer that defined a genre. Run, jump and stomp your way through World 1-1 (overworld) and World 1-2 (underground). Grab the fire flower to become Fire Mario and throw fireballs, kick Koopa shells, and raise the flag.",
        controls: ['Arrow Left/Right: Move', 'Arrow Up / Shift / X: Run', 'Space / Z: Jump (hold for higher)', 'F / B: Throw fireball (when Fire Mario)', 'Reach the flagpole to clear 1-1, take the pipe to clear 1-2']
    },
    {
        path: '/mario-classic',
        builtBy: 'qwen',
        component: SuperMarioClassicGame,
        label: 'SUPER MARIO BROS (ORIGINAL)',
        theme: 'light',
        hidden: true,
        description: "The original 'one-shot' build — the pristine first-pass engine generated in a single prompt by local Qwen 3.8, before any iteration. Reachable from the Options menu on the main Mario title screen (?).",
        controls: ['Arrow Left/Right: Move', 'Arrow Up / Shift / X: Run', 'Space / Z: Jump', '?: Options menu']
    },
    {
        path: '/ironkeep',
        builtBy: 'qwen',
        component: IronKeepGame,
        label: 'IRONKEEP',
        theme: 'dark',
        description: 'A first-person dungeon shooter on a hand-written raycaster, in the spirit of Wolfenstein 3D. Three halls of a cursed keep stand between you and the open gate — crossbow bolts, repeater, and an occult lancer, against legionaries, hounds, occultists and the Warden. Every texture, sprite and note is generated at runtime; there are no assets.',
        controls: ['Arrow Keys / W: Move, Left/Right turn', 'A/D or Mouse: Strafe / look', 'Space / Click: Loose a bolt', 'Shift / B: Run', 'E: Open doors (gold + iron keys)', '1 2 3 / Q: Change weapon', '?: Pause and read the controls']
    },
    {
        path: '/raccoon-heist',
        builtBy: 'qwen',
        component: RaccoonHeistGame,
        label: 'RACCOON HEIST',
        theme: 'dark',
        description: 'A 3D stealth caper. You run a crew of trash pandas through three night jobs — the corner bank, the museum of shiny things, and the manor of moonstone. Slip past torchlight, grab the loot one sack at a time, drop it in the getaway cart, and be over the gate before the heat peaks. Thunder masks your footsteps; the watchman never expects a raccoon to wait for lightning.',
        controls: ['Left stick / WASD: Move (the stick is camera-relative — pull back to retreat)', 'Drag right half / G: Orbit the camera · G recentres it behind you', 'E / Space / Z: Take loot, hide in a bin or the hedge, chew a lock — HOLD to keep chewing', 'F / B: Fling a shiny to lure a guard off your route', 'Q / X: Switch raccoon — the heat chases whoever it last saw', 'Shift / R: Sprint. Faster than a guard, and much louder', 'C: Crouch. Slower, nearly silent, and cover counts double', '?: Pause and read the controls']
    },
    {
        path: '/beezee',
        builtBy: 'forge',
        component: BeeGame,
        label: 'BEEZEE',
        theme: 'light',
        description: 'A first-person honeybee flier. Magic Carpet meets Bug\u2019s Life: drop into a summer meadow at knee-height for a bee, hover flower centers to drink nectar and dust pollen, and fly the load home to the hive before the sun sets. Some flowers only show their landing ring in ULTRAVIOLET — flip on your UV eyes and aim dead-center, because the wind absolutely will not aim for you. Webs, wasps, a bird, and the landlord\u2019s pet gecko all have opinions about your flight path.',
        controls: ['Arrows: Yaw left/right, climb/diving pitch', 'Space / Z / A button: Thrust (hold to fly — bees do not idle)', 'Shift / R: Sprint (faster, and wasps respect it)', 'V / UV button: Ultraviolet eyes — deep-cup flowers only answer to UV', 'Fly into the hive mouth to bank your nectar before sundown', '?: Pause and read the controls']
    },
    {
        path: '/lemmings',
        builtBy: 'forge',
        component: LemmingsGame,
        label: 'LEMMINGS-LITE',
        theme: 'dark',
        description: 'They walk, they fall, you decide otherwise. A stream of mindless lemmings shuffles out of a cave toward cliffs, voids and plugged steel doors — one key press assigns a skill to the nearest one: blocker, bomber, climber or digger. Four hand-carved levels, each proven solvable (and each skill proven load-bearing) by a solver that ships in the repo; the attract demo is that solution, replayed move for move. Fatal falls are the killer, and a tunnelling digger is the only safe way down.',
        controls: ['Arrow Keys: Move the assignment cursor (or drag on touch)', '1 2 3 4: pick BLOCKER / BOMBER / CLIMBER / DIGGER (B button cycles)', 'Space / A button / click: assign the skill to the nearest lemming', 'Get at least the OUT quota of lemmings into the door before the clock runs out', '?: Pause and read the controls']
    },
    {
        path: '/boulder-dash',
        builtBy: 'forge',
        component: BoulderDashGame,
        label: 'BOULDER DASH',
        theme: 'dark',
        description: 'Dig deep, grab the gems, and do not be under the rock when it drops. A cellular-automata cave: boulders and diamonds fall through the dirt you carve, a boulder crushes you while a dropped gem gives up and turns to dirt, and a firefly wanders its steel cell turning everything it touches into a chain of flame that steel alone respects. Four hand-carved caves, each proven winnable by a planner that ships in the repo (the attract demo is its route, replayed move for move); gather the gem quota, then reach the exit before the clock runs out.',
        controls: ['Arrow Keys / D-pad: Dig dirt and move (one cell per tap, hold to keep going)', 'Collect the GEM quota, then dig to the exit door', 'Boulders fall and crush you — read which rocks are actually moving', 'A gem that falls turns to dirt — do not cut the paydirt out from under it', 'The firefly burns everything but steel — the wall is your strategy', '?: Pause and read the controls']
    },
    {
        path: '/sonar',
        builtBy: 'forge',
        component: SonarGame,
        label: 'SONAR ABYSS',
        theme: 'dark',
        description: 'You only see what sound reveals. Pitch-black seeded sea caves: every PING sends a wavefront through the water, lighting rock and pearl exactly as it reaches them — sound does not cross stone, so pockets behind walls stay dark until the echo walks in through the door. The light fades in seconds; the map lives in your head. Pearls score, the teal swirl is the vent to the next, darker depth, and the eels out there are real whether or not you just heard one. Die, and the abyss reshuffles its seed.',
        controls: ['Arrow Keys / D-pad: Swim (one stroke per tap, hold to keep going)', 'Space / A button / tap: PING — see with sound', 'Lit cells FADE — remember the cave, then swim to the vent', 'Pearls score; the swirl marks the way down', 'Eels only show as fading sonar contacts — a remembered eel is not where it is', '?: Pause and read the controls']
    },
    {
        path: '/metroid',
        builtBy: 'forge',
        component: MetroidLiteGame,
        label: 'METROID-LITE',
        theme: 'dark',
        description: 'One hand-carved cave, three upgrades, and the way back is the way forward. The POWER BEAM melts cracked blocks, a dropped BOMB brings down green bulkheads, and the SPACE JUMP — a second push in mid-air — is the only thing that clears the two-jump shafts to the relic. Get strong in the order the cave allows: a ledge hop buys the beam, a shelf climb buys the bombs, and the beam pries open the bulkhead that hides the jump boots. Touch a beacon and the cave remembers you; die and it does not forget the doors you opened. The attract demo is the flow machine hunting its own proven route, tick for tick, behind three layers of parallax.',
        controls: ['Arrow Keys / D-pad: Move', 'Space / A: Jump — press it again in mid-air once you own the SPACE JUMP', 'X / B: FIRE the beam (once acquired) · hold DOWN + FIRE: drop a BOMB', 'Cracked orange blocks melt to beams; green bulkheads fall to bombs', 'Beacons save your progress and recharge your energy', '?: Pause and read the controls']
    },
    {
        path: '/momentum',
        builtBy: 'forge',
        component: MomentumRunnerGame,
        label: 'MOMENTUM RUNNER',
        theme: 'dark',
        description: 'Hold right and never stop. A hand-carved slope-runner where speed is the only currency: gravity pulls you faster downhill (angle-based collision projects your landing onto the slope), you jump the pits, and springs loft you over the wide ones. The vertical loop only holds you if you enter FAST — and the only rings that survive the far spike hang on its apex, so skimp on momentum and you fall. Three zones, every slope and loop proven clearable by an autopilot that ships in the repo; the attract demo is its own winning route, replayed tick for tick.',
        controls: ['Arrow Right / D-pad right: Build speed (flat running is too slow for the loop)', 'Arrow Left: Brake', 'Space / Z / Up / A: Jump pits — release early to land short, hold to fly far', 'Hit a hazard WITH rings: you stagger and lose them; WITHOUT: you fall back to the totem', 'Enter the loop fast enough (v² ≥ 5·g·r) or you peel off at the apex', '?: Pause and read the controls']
    },
    {
        path: '/ice-climber',
        builtBy: 'forge',
        component: IceClimberGame,
        label: 'ICE CLIMBER CO-OP',
        theme: 'dark',
        description: "Two climbers, one frozen massif, and every tile punched is gone forever. Hold UP under the ice and bore a shaft straight to the summit shelf, dodge the condor that owns the middle mountain's ledge (the ice column keeps a pocket it cannot reach), and take the carrot. But the last carrot hangs a head taller than any jump in the game: the only way up is one climber standing still while the other jumps onto their shoulders and jumps again — and a climber downed by the condor is only revived by a partner's touch. Alone, the summit is impossible. The attract demo is the autopilot's own proven co-op route, tick for tick.",
        controls: ['P1 (red): Arrow Left/Right: move · UP: punch upward through the ice · SPACE: jump', 'P2 (blue): A / D: move · W: punch upward · F: jump (the second pad on the screen drives P2)', 'Punching deletes ice FOREVER — the shaft you bore is your shaft', 'The condor owns its shelf: wait in the ice pocket, dash when its back is turned', 'The top carrot needs a climber-shaped stepladder — jump on your partner, then jump again', 'Touch a downed partner to revive them; lives are shared, the summit is not winnable solo', '?: Pause and read the controls'],
    },
    {
        path: '/galaga',
        builtBy: 'forge',
        component: GalagaGame,
        label: 'GALAGA',
        theme: 'dark',
        description: 'The fighting formation of the bee species. Every dive is a SCRIPTED flight path — readable, dodgeable, and audited tick by tick by the harness that ships with this repo. The red Flagship drops a tractor beam: dodge it or lose a fighter. A captured fighter flies the next stage as an escort — shoot your own escort down and CATCH the falling fighter to win a DOUBLE fighter. Three challenging stages; the attract demo is the autopilot\'s own proven run, tick for tick.',
        controls: ['Arrow Keys / D-pad: Fly (you own the bottom band — the walls are death traps)', 'Space / A: Fire (two shots — a DOUBLE fighter fires two PAIRS)', 'Divers hunt your lane: read the path, dodge early, not last-second', 'The Flagship\'s tractor beam captures you — dodge it, or let it take you and win the fighter back', '?: Pause and read the controls'],
    },
    {
        path: '/polarity',
        builtBy: 'forge',
        component: PolarityGame,
        label: 'POLARITY',
        theme: 'dark',
        description: 'Two colors, one pilot. An Ikaruga-like shooter where the constant decision is which color to BE: bullets of your color are absorbed and charge the flux meter (a full charge plus a flip = FLUX NOVA), the opposite color kills you — and your shots only kill the opposite color. Walls and storms are telegraphed by the script and audited tick-by-tick by the fairness scanner that ships in the repo: every telegraph has BOTH a position answer and a polarity answer. The REACTOR core answers only to shots opposite its spinning shell, one color per quota, so the flip is the win condition. The attract demo is the autopilot\'s own proven run, tick for tick.',
        controls: ['Arrow Keys / D-pad: Fly the bottom band', 'Space / A: Fire (your shots only kill the OPPOSITE color)', 'X / B button: FLIP POLARITY — the whole game is this one decision', 'Same-color fire is absorbed and charges FLUX — a full charge plus a flip nukes everything except the core shell', 'Telegraph lines mark incoming walls (find the gap) and storms (colorless — move)', 'The clock never wipes a stage: stall it and you pay a fighter and run it again', '?: Pause and read the controls'],
    },
    {
        path: '/missile-battle',
        builtBy: 'forge',
        component: MissileBattleGame,
        label: 'MISSILE BATTLE',
        theme: 'dark',
        description: 'Missile Command done honestly: every warhead that ever falls is named in a SCRIPT — tick, column, target, split — audited offline by a Node harness that also re-solves every wave with one fewer interceptor in every battery (the slack rule) and freezes Math.random to prove nothing here is luck. ICBMs MIRV into siblings that converge on one crater, bombers drop on the run, smart bombs weave; your blast chains, so the answer to saturation is geometry. Three barrages; between waves the cities rebuild; lose all six and the map goes dark. The attract demo is the autopilot\'s own proven run, tick for tick.',
        controls: ['TAP the sky / arrows + Space: put an interceptor exactly there — the nearest battery in range fires it', 'The blast kills anything it touches and every kill chains a smaller blast — clusters die together', 'Warheads SPLIT, bombers DROP, smart bombs WEAVE — all scripted, all readable, never random', '10 interceptors per battery per wave; the outer batteries have limited arcs, the center covers the map', '?: Pause and read the controls'],
    },
    {
        path: '/simcity-min',
        builtBy: 'forge',
        component: SimCityMinGame,
        label: 'SIMCITY-MIN',
        theme: 'dark',
        description: 'A city on a fixed-timestep ledger: power travels the ROAD graph (a plant with no wire to your block lights nothing), residents follow JOBS (zone housing without factories and the census stays empty), and the yearly budget must balance with no random bumps to save you. Three maps — a green field, a strip mine with a dead grid, a town the script torches twice and then walks a tornado through. Reach the charter population before the deadline. Every fire, every spread, every dollar is audited offline by a Node harness that also replays each map with one fewer plant, one fewer station and $150 less — the slack rule — and Math.random is banned at import time. The attract demo is the autopilot\'s own proven run, tick for tick.',
        controls: ['Arrows / D-pad: move the cursor', 'Space / A: place the selected tool on the cursor (streets first — power rides the wires)', 'T / B: cycle tool — ROAD, PLANT, RES, COM, IND, PARK, FIRE, DOZE', '[ and ]: nudge the tax — 7% pays best, greed empties the blocks', 'Tap the map to place; ? pauses. 1·2·3 on the title pick a map'],
    },
    {
        path: '/outpost',
        builtBy: 'forge',
        component: OutpostGame,
        label: 'OUTPOST',
        theme: 'dark',
        description: 'A dwarf-style colony in ASCII, three procedurally-carved depths deep. You are the foreman — you never touch a dwarf: you designate DIG / FARM / RALLY jobs, and idle colonists claim them off a priority queue and A-star to them across the walk graph. Plots ripen, bushes fall to the pick, hauls feed the depot, and every dwarf eats on a hunger clock — an unfed dwarf dies and their job returns to the queue. The beacon stairs sleep in a SEALED rock room: the tunnel front is computed by a 0-1 BFS through stone, and the shortest dig is provable. Every seed is audited offline by a Node harness: generator reachability, A* path-optimality against BFS, job-claim conservation (deaths return claims), a food ledger exact to the unit — and the slack rule: each seed still clears with one fewer dwarf and one fewer ration. The attract demo is the autopilot\'s own proven run, tick for tick.',
        controls: ['Arrows / D-pad: move the foreman\'s cursor', 'Space / A: post the selected job on the cursor', 'T / B: cycle tool — DIG the rock, FARM the soil, RALLY the beacon stairs', 'Rally stands every living dwarf on the stairs — that is the one state that descends', 'Keep the depot fed: ripe o-plots and bushes * are jobs the world posts for you', 'Tap to designate; ? pauses. 1-4 on the title pick a depth seed'],
    },
    {
        path: '/papers-please',
        builtBy: 'forge',
        component: PapersPleaseMinGame,
        label: 'PAPERS, PLEASE-MIN',
        theme: 'dark',
        description: 'Seven days at the border gate of a small gray country. Each entrant slides papers under the glass; the wall carries the law of the day — entry list, wanted sheet, calendar, a scale that reads the truth under their feet. ADMIT or DENY: the booth never hides its evidence, and every generated paper in the game is PROVEN decidable by a Node harness that re-judges each applicant twice (booth vs truth) and proves a careless eye still clears every day — the six traps (expires-TODAY, same-name-on-the-sheet, foreign-looking city, ID height, child without ID, ID weight) are placed on purpose. One new rule wakes every morning; three mistakes demote you.',
        controls: ['A / SPACE / tap left: ADMIT the entrant', 'D / B button / tap right: DENY the entrant', 'Read the wall first: date, RULEBOOK, ENTRY LIST, WANTED sheet, SCALE', 'Expired BEFORE today is void — expiring TODAY is still valid', 'Wanted means name AND passport number; children are exempt from the ID rule', 'Day 7 wakes the CURFEW: a passport needs seven days of grace', '?: Pause and read the rules'],
    },
    {
        path: '/lode-runner',
        builtBy: 'forge',
        component: LodeRunnerLiteGame,
        label: 'LODE RUNNER-LITE',
        theme: 'dark',
        description: 'Three hand-carved vaults of concrete, brick and rope, in the 1983 rules. There is no jump: you run, climb, hang on ropes and fall. Dig diagonally into the floor and a hole opens — it lasts about five seconds, then the brick grows back and whatever is inside it when it closes dies. Guards hunt you over the same physics graph you move on, fall into your holes, sit it out and climb back out, and lift the gold you must win back. Take every gold and the hidden ladder appears at the top of the screen: climb off to clear the vault. Every vault is proven winnable by the real no-jump solver with guards live, and the sim is pure (level, input-script): the attract demo is that proven witness replayed tick-for-tick, your last run haunts the next one as a ghost, and a Node harness replays your commands down to the state hash.',
        controls: ['Arrows / D-pad: run, climb ladders, swing under rope', 'Face a way and push DOWN: dig the brick diagonally below you', 'No jump — lure a guard into a hole; it refills in 5s and buries what is inside', 'Guards fall in your holes, climb out, and lift gold you must win back', 'Take every gold * to reveal the hidden ladder at the top; climb off to clear', '?: pause · R on the end screen replays that vault beside your ghost'],
    },
    {
        path: '/dogfight',
        builtBy: 'forge',
        component: DogfightGame,
        label: 'WWI DOGFIGHT',
        theme: 'dark',
        description: 'A fixed-wing scout over the line: altitude is ammunition and speed is the coin you pay it in. The energy model is the game — thrust minus drag minus gravity along the flight path; bank to turn (there is no rudder miracle), and below the ASI\u2019s white arc the wing quits and the nose drops itself. The synchronized Vickers is belt-fed and finite, tracers drop at 400 m/s, and the autopilot that scripts the attract demo only fires rounds its own bullet integrator PROVES will arrive. Two patrols, one honest sky: a Node harness pins trim to the closed form, the stall contract, the zoom ledger, the round count every tick, and re-fights both patrols with 20 fewer rounds and 40 fewer metres of altitude (the slack rule) \u2014 and wins anyway.',
        controls: ['\u2191/\u2193: pull and push (pulling spends AIRSPEED to buy ALTITUDE \u2014 watch the ASI)', '\u2190/\u2192: bank the wings \u2014 the bank turns you; tighter and slower turns bite harder', 'SPACE: fire the synchronized Vickers \u2014 lead the bandit, the tracers drop', 'Q/E (or the TH button): throttle. Full throttle is not always the fast way home', 'Below the stall arc the nose falls by itself \u2014 push over before the deck does it for you', '?: pause and read the instruments']
    },
    {
        path: '/paperboy',
        builtBy: 'forge',
        component: PaperboyGame,
        label: 'PAPERBOY',
        theme: 'light',
        description: 'The paper round, rebuilt like an NES cartridge that never existed — pseudo-3D road, runtime art and audio, and a route the SOLVER has proven. Steer with the handlebars, pedal up and down, and hurl papers at the doorsteps: a paper only counts if you are LEANED toward it when you cross its door, and the door window is the one consumable — the harness re-proves every route at full throttle AND at a crawl with the windows tighter and zero spare papers. Carts sweep the crossings behind their noses (you cannot out-steer one), dogs lunge from the kerb past centre, and the attract demo is the autopilot\'s own proven ride, tick for tick. Three routes, 77 doors.',
        controls: ['Arrows / D-pad: steer the handlebars; UP mashes the pedals, DOWN crawls', 'SPACE / A: throw a paper toward your lean (you must be leaned that way at the door!)', 'F / B button: hurl one down the lane — the only answer to a lunging dog', 'Cross carts only AHEAD of their nose, and hug a dog\'s own kerb after it launches', '?: pause and read the rules'],
    },
    {
        path: '/wizardry',
        builtBy: 'forge',
        component: WizardryGame,
        label: 'WIZARDRY',
        theme: 'dark',
        description: 'The 1981 dungeon, rebuilt honest: a party of six crawls three seeded mazes in shaded wireframe first person, fighting turn-based ledger combat where every point of damage is booked and recomputed by the harness that ships with this repo. Firebolt, heal, potions and MP springs are the resource puzzle — the whole campaign is PROVEN winnable by the autopilot (the thing demoing on this title screen is that proof, live), and re-proven with one fewer potion and one fewer spring than the proof consumes. Kill the Lich on Level 3. Death is real; every run reshuffles nothing — the dungeon is the same maze the harness audited.',
        controls: ['Arrows / D-pad: walk and turn in the corridor', 'SPACE / A: USE — stairs down, drink at a spring, touch the throne (that wakes the Lich)', 'In battle: SPACE attack · F / B: FIREBOLT · H heal the most wounded · P drink a potion · L flee (not from the Lich)', 'In battle the arrows pick your TARGET — burn the caster first', '?: pause and read the rules'],
    },
    {
        path: '/spy-hunter',
        component: SpyHunterGame,
        label: 'SPY HUNTER',
        theme: 'dark',
        description: 'The G-6155 against two hand-scripted stages of the original arcade highway — every spawn is a named event a Node harness audits BEFORE you drive on it, so "readable" is a proof, not a vibe. Three lanes of Killers that match your speed and fire back, Road Lakers painting oil that spins you, a Sweeper that shoves you into the oil, a helicopter walking bombs down your lane, and the gunboat in the river the road cannon can never reach — that one is the missiles\' job. Shoot the Supporter to drop GUN/MISSILE/repair crates and catch the drop; every stage ends with the 2000-point bonus car. The attract demo is the autopilot\'s own proven run, tick for tick — and the campaign is re-proven with one fewer missile, one fewer life, and with no missiles at all.',
        controls: ['Arrows / D-pad: steer across three lanes — grass kills slowly, the wall kills fast', 'SPACE / A: machine gun — watch the HEAT gauge, an overheated gun is a parked car', 'X / B: homing MISSILE — the gunboat in the river only answers to these', 'Shoot the white SUPPORTER, then catch its crate: GUN, MISSILE or repair', 'Oil spins you; Sweepers push you toward it — never sit in the oil lane with traffic coming', '?: pause and read the rules'],
    },
    {
        path: '/arena-archery',
        builtBy: 'forge',
        component: ArenaArcheryGame,
        label: 'ARENA ARCHERY',
        theme: 'dark',
        description: 'A TowerFall-like duel on a hand-carved night arena: one stick moves and aims, hold to draw, release to loose a ballistic arrow whose 45° range is exactly r = v²/g. And every arrow that misses STICKS — stuck arrows knock out the next arrow that crosses them (cover that builds up as the duel runs) and refill your quiver when you walk over and pull them out: leave it as terrain, or take the ammo. Solo against an autopilot bot, or a local 2-player duel on one keyboard (WASD+F for player two, with a second touch pad). First to 3 wins; the attract demo is the autopilot’s own proven match, replayed tick for tick through the same pure sim a Node harness audits — arrow ledger exact, replay hash-for-hash.',
        controls: ['P1 Arrows / first pad: move, aim, UP jumps (and UP+draw is the 45° lob)', 'SPACE / A: hold to draw — release to loose; charge sets velocity, and the arc lands where the math says', 'P2 (duel mode): A/D move, W jump+lob, S aim down, F draw — the second on-screen pad drives P2', 'Quiver is finite: walk over a stuck arrow to PULL it back — or leave it to eat the next shot', 'First to 3 points takes the arena; 1 = solo vs bot, 2 = duel on the title'],
    },
    {
        path: '/minesweeper',
        builtBy: 'forge',
        component: MinesweeperGame,
        label: 'MINESWEEPER',
        theme: 'dark',
        description: 'The office classic, rebuilt so it never lies to you: every board is generated under a zero-guess fairness gate — the same referee a Node harness audits — so logic alone ALWAYS clears it. No 50/50 endgames, no dead ends, no luck. And the gate double-proves: every board must also close with chording FORBIDDEN (the slack rule), and every dig the autopilot makes in the attract demo carries the RULE that derived it as safe. Cursor-played so one code path serves keyboard and phone; three densities, from COLT to GENERAL.',
        controls: ['Arrows / WASD / d-pad: move the cursor', 'SPACE / A / tap a cell: dig (a number with matching flags chords the rest open)', 'B / SHIFT / ⚑: plant or lift a flag', 'A wrong flag chordeS into a mine — flags are a claim, not a shield', '1/2/3 on the marquee: COLT 9×9, SAPPER 16×12, GENERAL 22×13', '?: pause and read the rules']
    },
    {
        path: '/pong',
        builtBy: 'claude',
        component: PongGame,
        label: 'PONG',
        theme: 'light',
        description: 'The classic table tennis arcade game. Defeat the AI by hitting the ball past their paddle.',
        controls: ['Arrow Up/Down: Move Left Paddle']
    },
    {
        path: '/invaders',
        builtBy: 'claude',
        component: SpaceInvadersGame,
        label: 'SPACE INVADERS',
        theme: 'light',
        description: 'Defend Earth from waves of descending aliens. Shoot them down before they land.',
        controls: ['Arrow Left/Right: Move', 'Space: Shoot']
    },
    {
        path: '/pacman',
        builtBy: 'claude',
        component: PacmanGame,
        label: 'PAC-MAN',
        theme: 'light',
        description: 'Navigate the maze, eat all the dots, and avoid the ghosts. Eat Power Pellets to turn the tables!',
        controls: ['Arrow Keys: Move']
    },
    {
        path: '/asteroids',
        builtBy: 'claude',
        component: AsteroidsGame,
        label: 'ASTEROIDS',
        theme: 'dark',
        description: 'Destroy asteroids and saucers. Watch out for debris!',
        controls: ['Arrow Up: Thrust', 'Arrow Left/Right: Rotate', 'Space: Shoot']
    },
    {
        path: '/donkeykong',
        builtBy: 'claude',
        component: DonkeyKongGame,
        label: 'DONKEY KONG',
        theme: 'dark',
        description: 'Climb the construction site to save the damsel from the giant ape.',
        controls: ['Arrow Left/Right: Move', 'Arrow Up/Down: Climb Ladder', 'Space: Jump']
    },
    {
        path: '/centipede',
        builtBy: 'claude',
        component: CentipedeGame,
        label: 'CENTIPEDE',
        theme: 'dark',
        description: 'Shoot the centipede as it winds down the screen. Avoid spiders and fleas.',
        controls: ['Arrow Keys: Move', 'Space: Shoot']
    },
    {
        path: '/defender',
        builtBy: 'claude',
        component: DefenderGame,
        label: 'DEFENDER',
        theme: 'dark',
        description: 'Protect the humanoids from abduction in this side-scrolling shooter.',
        controls: ['Arrow Keys: Move', 'Space: Shoot']
    },
    {
        path: '/pitfall',
        builtBy: 'claude',
        component: PitfallGame,
        label: 'PITFALL',
        theme: 'light',
        description: 'Navigate the jungle, jump over pits and crocs, and swing on vines to find the treasure.',
        controls: ['Arrow Left/Right: Run', 'Space: Jump', 'Arrow Up/Down: Climb Ladder']
    },
    {
        path: '/frogger',
        builtBy: 'forge',
        component: FroggerGame,
        label: 'FROGGER',
        theme: 'dark',
        description: 'Hop five lanes of traffic, ride the logs across the river, and fill all five lily pads before the clock runs out. Turtles nap — and the water never forgets. Every pad you fill brings faster traffic.',
        controls: ['Arrow Keys / D-Pad: Hop', 'Space / A button: Hop Forward', 'Tap the screen to start and restart', '?: Pause and read the controls']
    },
    {
        path: '/missilecommand',
        builtBy: 'claude',
        component: MissileCommandGame,
        label: 'MISSILE COMMAND',
        theme: 'dark',
        description: 'Defend your cities from incoming ICBMs.',
        controls: ['Mouse Move: Aim', 'Click: Fire ABM']
    },
    {
        path: '/adventure',
        builtBy: 'claude',
        component: AdventureGame,
        label: 'ADVENTURE',
        theme: 'dark',
        description: 'Explore a world of castles, dungeons, and dragons. Find the enchanted chalice and return it home.',
        controls: ['Arrow Keys: Move', 'Space: Drop Item']
    },
    {
        path: '/zork',
        builtBy: 'claude',
        component: ZorkI,
        label: 'ZORK I',
        theme: 'dark',
        // Which sensor arms the AI can use on this title (src/ai/arms.js). The
        // transcript arm — read the prose like a person does — is the only one
        // that exists today; 'ram' (the Z-machine object tree) and 'hybrid'
        // arrive with AI-PLAN §7 stage 4a/4b.
        sensors: ['transcript'],
        description: 'The Great Underground Empire. Explore a vast underground world full of treasures, puzzles, and dangers. Watch out for Grues.',
        controls: ['Type commands: GO NORTH, TAKE LAMP, OPEN MAILBOX', 'LOOK: Examine surroundings', 'INVENTORY: Check items', 'SAVE / RESTORE: Save and load game']
    },
    {
        path: '/zork2',
        builtBy: 'claude',
        component: ZorkII,
        label: 'ZORK II',
        theme: 'dark',
        sensors: ['transcript'],
        description: 'The Wizard of Frobozz. Continue your underground adventure, but beware the capricious Wizard who haunts these depths.',
        controls: ['Type commands: GO NORTH, TAKE LAMP, OPEN MAILBOX', 'LOOK: Examine surroundings', 'INVENTORY: Check items', 'SAVE / RESTORE: Save and load game']
    },
    {
        path: '/zork3',
        builtBy: 'claude',
        component: ZorkIII,
        label: 'ZORK III',
        theme: 'dark',
        sensors: ['transcript'],
        description: 'The Dungeon Master. The final chapter of the Zork trilogy. Prove your worth to become the Dungeon Master.',
        controls: ['Type commands: GO NORTH, TAKE LAMP, OPEN MAILBOX', 'LOOK: Examine surroundings', 'INVENTORY: Check items', 'SAVE / RESTORE: Save and load game']
    },
    {
        path: '/kingsquest',
        builtBy: 'claude',
        component: KingsQuestGame,
        label: "KING'S QUEST",
        theme: 'dark',
        // Declared empty ON PURPOSE: no sensor is implemented for this title yet.
        // `eye` joins when stage 3's OCR + ego sprite match go green, `ram` when
        // the stage 4a spike validates a framebuffer against the canvas. The badge
        // reads NOT IMPLEMENTED until then, so the UI cannot advertise an eye the
        // game does not have (the old AI did exactly that, for months).
        sensors: [],
        description: "Roberta Williams' groundbreaking graphic adventure. Guide Sir Graham through the kingdom of Daventry to recover three stolen treasures and claim the throne.",
        controls: ['Arrow Keys: Move Sir Graham', 'Type commands: LOOK, TAKE, OPEN, TALK', 'F5: Save Game', 'F7: Restore Game']
    }    ,
    {
        path: '/rogue',
        builtBy: 'claude',
        component: RogueGame,
        label: 'ROGUE',
        theme: 'dark',
        description: 'The original dungeon crawler. Descend through procedurally generated dungeons, battle monsters, collect treasure, and find the Amulet of Yendor. Permadeath — every run is unique.',
        controls: ['Arrow Keys / hjkl: Move', ',: Pick up', 'i: Inventory', 'q: Quaff potion', 'r: Read scroll', '>: Descend stairs', '?: Help']
    }
    ,
    {
        path: "/ultima1",
        builtBy: 'claude',
        component: Ultima1Game,
        label: "ULTIMA I",
        theme: "dark",
        description: "Richard Garriott's The First Age of Darkness (1986 DOS rewrite of the 1981 original). The game that started it all — explore the lands of Sosaria, defeat the evil wizard Mondain, and travel through time and space. Features dungeon crawling, overworld exploration, and even space combat.",
        controls: ["Arrow Keys: Move", "A: Attack", "C: Cast Spell", "D: Drop", "E: Enter", "F: Fire", "G: Get", "H: Hyper jump (space)", "I: Inform/Search", "O: Open", "R: Ready weapon", "S: Steal", "T: Transact", "U: Unlock", "W: Wear armor", "X: eXit", "Z: Ztats", "Q: Save and quit"]
    }
    ,
    {
        path: "/ultima2",
        builtBy: 'claude',
        component: Ultima2Game,
        label: "ULTIMA II",
        theme: "dark",
        description: "Richard Garriott landmark RPG: Revenge of the Enchantress (1982). Travel through time across Earths history to defeat the evil Minax. One of the earliest open-world RPGs.",
        controls: ["First time: create a character from the boot menu before pressing Play (\"No character on disk\" is the prompt, not an error)", "Arrow Keys: Move", "A: Attack", "C: Cast Spell", "G: Get/Pick Up", "T: Transact (buy/sell)", "O: Open", "Q: Quit/Save", "V: View Stats"]
    }
    ,
    {
        path: "/ultima4",
        builtBy: 'claude',
        component: Ultima4Game,
        label: "ULTIMA IV",
        theme: "dark",
        description: "Richard Garriott's Quest of the Avatar (1985). The first Ultima to shift from killing monsters to embodying virtue — honesty, compassion, valor, justice, sacrifice, honor, spirituality, humility. Explore Britannia, master the eight virtues, and become the Avatar. Widely considered one of the most influential RPGs ever made. This is the 1996 PC GAMES freeware release, officially distributed by Origin.",
        controls: ["At first gypsy encounter: answer the moral questions to determine your starting class", "Arrow Keys: Move", "A: Attack", "C: Cast Spell", "E: Enter (town/dungeon)", "G: Get Chest", "J: Jimmy lock", "L: Locate (look at map)", "M: Mix reagents", "O: Open door", "P: Peer at gem", "R: Ready weapon / Reagent", "S: Search", "T: Talk", "U: Use item", "W: Wear armor", "X: eXit (ship/horse)", "Y: Yell", "Z: Ztats (view stats)", "Q: Save and quit"]
    }
    ,
    {
        path: "/ultima3",
        builtBy: 'claude',
        component: Ultima3Game,
        label: "ULTIMA III",
        theme: "dark",
        description: "Richard Garriott's Exodus (1983). The first Ultima with a party system — assemble a team of four adventurers to defeat the mysterious Exodus, offspring of Mondain and Minax. Introduced party-based combat, character classes, and the foundations that would evolve into Ultima IV's virtue system.",
        controls: ["Arrow Keys: Move", "A: Attack", "B: Board/Dismount", "C: Cast Spell", "E: Enter town/dungeon", "F: Fire cannon", "G: Get chest", "H: Hand equipment", "K: Klimb", "L: Look", "O: Open", "R: Ready weapon", "T: Talk", "W: Wear armor", "X: eXit vehicle", "Z: Ztats (view stats)", "Q: Save and quit"]
    }
    ,
    {
        path: "/ultima5",
        builtBy: 'claude',
        component: Ultima5Game,
        label: "ULTIMA V",
        theme: "dark",
        description: "Richard Garriott's Warriors of Destiny (1988). Lord British has vanished and the tyrant Blackthorn has corrupted the virtues into oppressive laws. Lead the Avatar's party through a dark and morally complex Britannia. The last keyboard-driven Ultima and widely considered the series' storytelling peak. 1996 freeware distribution.",
        controls: ["Arrow Keys: Move", "A: Attack", "B: Board/Mount", "C: Cast Spell", "D: Descend", "E: Enter", "F: Fire", "G: Get", "I: Ignite torch", "J: Jimmy lock", "K: Klimb", "L: Look", "M: Mix reagents", "O: Open", "P: Push", "R: Ready weapon", "S: Search", "T: Talk", "U: Use item", "V: View (cycle views)", "W: Wear armor", "X: eXit", "Z: Ztats", "Q: Save and quit"]
    }

]