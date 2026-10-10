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

// Game Registry
// Theme 'dark' = white text (background is black)
// Theme 'light' = black text (background is white)
export const GAMES = [
    {
        path: '/mario',
        component: SuperMarioGame,
        label: 'SUPER MARIO BROS',
        theme: 'light',
        description: "The platformer that defined a genre. Run, jump and stomp your way through World 1-1 (overworld) and World 1-2 (underground). Grab the fire flower to become Fire Mario and throw fireballs, kick Koopa shells, and raise the flag.",
        controls: ['Arrow Left/Right: Move', 'Arrow Up / Shift / X: Run', 'Space / Z: Jump (hold for higher)', 'F / B: Throw fireball (when Fire Mario)', 'Reach the flagpole to clear 1-1, take the pipe to clear 1-2']
    },
    {
        path: '/mario-classic',
        component: SuperMarioClassicGame,
        label: 'SUPER MARIO BROS (ORIGINAL)',
        theme: 'light',
        hidden: true,
        description: "The original 'one-shot' build — the pristine first-pass engine generated in a single prompt by local Qwen 3.8, before any iteration. Reachable from the Options menu on the main Mario title screen (?).",
        controls: ['Arrow Left/Right: Move', 'Arrow Up / Shift / X: Run', 'Space / Z: Jump', '?: Options menu']
    },
    {
        path: '/ironkeep',
        component: IronKeepGame,
        label: 'IRONKEEP',
        theme: 'dark',
        description: 'A first-person dungeon shooter on a hand-written raycaster, in the spirit of Wolfenstein 3D. Three halls of a cursed keep stand between you and the open gate — crossbow bolts, repeater, and an occult lancer, against legionaries, hounds, occultists and the Warden. Every texture, sprite and note is generated at runtime; there are no assets.',
        controls: ['Arrow Keys / W: Move, Left/Right turn', 'A/D or Mouse: Strafe / look', 'Space / Click: Loose a bolt', 'Shift / B: Run', 'E: Open doors (gold + iron keys)', '1 2 3 / Q: Change weapon', '?: Pause and read the controls']
    },
    {
        path: '/raccoon-heist',
        component: RaccoonHeistGame,
        label: 'RACCOON HEIST',
        theme: 'dark',
        description: 'A 3D stealth caper. You run a crew of trash pandas through three night jobs — the corner bank, the museum of shiny things, and the manor of moonstone. Slip past torchlight, grab the loot one sack at a time, drop it in the getaway cart, and be over the gate before the heat peaks. Thunder masks your footsteps; the watchman never expects a raccoon to wait for lightning.',
        controls: ['Left stick / WASD: Move (the stick is camera-relative — pull back to retreat)', 'Drag right half / G: Orbit the camera · G recentres it behind you', 'E / Space / Z: Take loot, hide in a bin or the hedge, chew a lock — HOLD to keep chewing', 'F / B: Fling a shiny to lure a guard off your route', 'Q / X: Switch raccoon — the heat chases whoever it last saw', 'Shift / R: Sprint. Faster than a guard, and much louder', 'C: Crouch. Slower, nearly silent, and cover counts double', '?: Pause and read the controls']
    },
    {
        path: '/beezee',
        component: BeeGame,
        label: 'BEEZEE',
        theme: 'light',
        description: 'A first-person honeybee flier. Magic Carpet meets Bug\u2019s Life: drop into a summer meadow at knee-height for a bee, hover flower centers to drink nectar and dust pollen, and fly the load home to the hive before the sun sets. Some flowers only show their landing ring in ULTRAVIOLET — flip on your UV eyes and aim dead-center, because the wind absolutely will not aim for you. Webs, wasps, a bird, and the landlord\u2019s pet gecko all have opinions about your flight path.',
        controls: ['Arrows: Yaw left/right, climb/diving pitch', 'Space / Z / A button: Thrust (hold to fly — bees do not idle)', 'Shift / R: Sprint (faster, and wasps respect it)', 'V / UV button: Ultraviolet eyes — deep-cup flowers only answer to UV', 'Fly into the hive mouth to bank your nectar before sundown', '?: Pause and read the controls']
    },
    {
        path: '/lemmings',
        component: LemmingsGame,
        label: 'LEMMINGS-LITE',
        theme: 'dark',
        description: 'They walk, they fall, you decide otherwise. A stream of mindless lemmings shuffles out of a cave toward cliffs, voids and plugged steel doors — one key press assigns a skill to the nearest one: blocker, bomber, climber or digger. Four hand-carved levels, each proven solvable (and each skill proven load-bearing) by a solver that ships in the repo; the attract demo is that solution, replayed move for move. Fatal falls are the killer, and a tunnelling digger is the only safe way down.',
        controls: ['Arrow Keys: Move the assignment cursor (or drag on touch)', '1 2 3 4: pick BLOCKER / BOMBER / CLIMBER / DIGGER (B button cycles)', 'Space / A button / click: assign the skill to the nearest lemming', 'Get at least the OUT quota of lemmings into the door before the clock runs out', '?: Pause and read the controls']
    },
    {
        path: '/boulder-dash',
        component: BoulderDashGame,
        label: 'BOULDER DASH',
        theme: 'dark',
        description: 'Dig deep, grab the gems, and do not be under the rock when it drops. A cellular-automata cave: boulders and diamonds fall through the dirt you carve, a boulder crushes you while a dropped gem gives up and turns to dirt, and a firefly wanders its steel cell turning everything it touches into a chain of flame that steel alone respects. Four hand-carved caves, each proven winnable by a planner that ships in the repo (the attract demo is its route, replayed move for move); gather the gem quota, then reach the exit before the clock runs out.',
        controls: ['Arrow Keys / D-pad: Dig dirt and move (one cell per tap, hold to keep going)', 'Collect the GEM quota, then dig to the exit door', 'Boulders fall and crush you — read which rocks are actually moving', 'A gem that falls turns to dirt — do not cut the paydirt out from under it', 'The firefly burns everything but steel — the wall is your strategy', '?: Pause and read the controls']
    },
    {
        path: '/sonar',
        component: SonarGame,
        label: 'SONAR ABYSS',
        theme: 'dark',
        description: 'You only see what sound reveals. Pitch-black seeded sea caves: every PING sends a wavefront through the water, lighting rock and pearl exactly as it reaches them — sound does not cross stone, so pockets behind walls stay dark until the echo walks in through the door. The light fades in seconds; the map lives in your head. Pearls score, the teal swirl is the vent to the next, darker depth, and the eels out there are real whether or not you just heard one. Die, and the abyss reshuffles its seed.',
        controls: ['Arrow Keys / D-pad: Swim (one stroke per tap, hold to keep going)', 'Space / A button / tap: PING — see with sound', 'Lit cells FADE — remember the cave, then swim to the vent', 'Pearls score; the swirl marks the way down', 'Eels only show as fading sonar contacts — a remembered eel is not where it is', '?: Pause and read the controls']
    },
    {
        path: '/metroid',
        component: MetroidLiteGame,
        label: 'METROID-LITE',
        theme: 'dark',
        description: 'One hand-carved cave, three upgrades, and the way back is the way forward. The POWER BEAM melts cracked blocks, a dropped BOMB brings down green bulkheads, and the SPACE JUMP — a second push in mid-air — is the only thing that clears the two-jump shafts to the relic. Get strong in the order the cave allows: a ledge hop buys the beam, a shelf climb buys the bombs, and the beam pries open the bulkhead that hides the jump boots. Touch a beacon and the cave remembers you; die and it does not forget the doors you opened. The attract demo is the flow machine hunting its own proven route, tick for tick, behind three layers of parallax.',
        controls: ['Arrow Keys / D-pad: Move', 'Space / A: Jump — press it again in mid-air once you own the SPACE JUMP', 'X / B: FIRE the beam (once acquired) · hold DOWN + FIRE: drop a BOMB', 'Cracked orange blocks melt to beams; green bulkheads fall to bombs', 'Beacons save your progress and recharge your energy', '?: Pause and read the controls']
    },
    {
        path: '/momentum',
        component: MomentumRunnerGame,
        label: 'MOMENTUM RUNNER',
        theme: 'dark',
        description: 'Hold right and never stop. A hand-carved slope-runner where speed is the only currency: gravity pulls you faster downhill (angle-based collision projects your landing onto the slope), you jump the pits, and springs loft you over the wide ones. The vertical loop only holds you if you enter FAST — and the only rings that survive the far spike hang on its apex, so skimp on momentum and you fall. Three zones, every slope and loop proven clearable by an autopilot that ships in the repo; the attract demo is its own winning route, replayed tick for tick.',
        controls: ['Arrow Right / D-pad right: Build speed (flat running is too slow for the loop)', 'Arrow Left: Brake', 'Space / Z / Up / A: Jump pits — release early to land short, hold to fly far', 'Hit a hazard WITH rings: you stagger and lose them; WITHOUT: you fall back to the totem', 'Enter the loop fast enough (v² ≥ 5·g·r) or you peel off at the apex', '?: Pause and read the controls']
    },
    {
        path: '/ice-climber',
        component: IceClimberGame,
        label: 'ICE CLIMBER CO-OP',
        theme: 'dark',
        description: "Two climbers, one frozen massif, and every tile punched is gone forever. Hold UP under the ice and bore a shaft straight to the summit shelf, dodge the condor that owns the middle mountain's ledge (the ice column keeps a pocket it cannot reach), and take the carrot. But the last carrot hangs a head taller than any jump in the game: the only way up is one climber standing still while the other jumps onto their shoulders and jumps again — and a climber downed by the condor is only revived by a partner's touch. Alone, the summit is impossible. The attract demo is the autopilot's own proven co-op route, tick for tick.",
        controls: ['P1 (red): Arrow Left/Right: move · UP: punch upward through the ice · SPACE: jump', 'P2 (blue): A / D: move · W: punch upward · F: jump (the second pad on the screen drives P2)', 'Punching deletes ice FOREVER — the shaft you bore is your shaft', 'The condor owns its shelf: wait in the ice pocket, dash when its back is turned', 'The top carrot needs a climber-shaped stepladder — jump on your partner, then jump again', 'Touch a downed partner to revive them; lives are shared, the summit is not winnable solo', '?: Pause and read the controls'],
    },
    {
        path: '/pong',
        component: PongGame,
        label: 'PONG',
        theme: 'light',
        description: 'The classic table tennis arcade game. Defeat the AI by hitting the ball past their paddle.',
        controls: ['Arrow Up/Down: Move Left Paddle']
    },
    {
        path: '/invaders',
        component: SpaceInvadersGame,
        label: 'SPACE INVADERS',
        theme: 'light',
        description: 'Defend Earth from waves of descending aliens. Shoot them down before they land.',
        controls: ['Arrow Left/Right: Move', 'Space: Shoot']
    },
    {
        path: '/pacman',
        component: PacmanGame,
        label: 'PAC-MAN',
        theme: 'light',
        description: 'Navigate the maze, eat all the dots, and avoid the ghosts. Eat Power Pellets to turn the tables!',
        controls: ['Arrow Keys: Move']
    },
    {
        path: '/asteroids',
        component: AsteroidsGame,
        label: 'ASTEROIDS',
        theme: 'dark',
        description: 'Destroy asteroids and saucers. Watch out for debris!',
        controls: ['Arrow Up: Thrust', 'Arrow Left/Right: Rotate', 'Space: Shoot']
    },
    {
        path: '/donkeykong',
        component: DonkeyKongGame,
        label: 'DONKEY KONG',
        theme: 'dark',
        description: 'Climb the construction site to save the damsel from the giant ape.',
        controls: ['Arrow Left/Right: Move', 'Arrow Up/Down: Climb Ladder', 'Space: Jump']
    },
    {
        path: '/centipede',
        component: CentipedeGame,
        label: 'CENTIPEDE',
        theme: 'dark',
        description: 'Shoot the centipede as it winds down the screen. Avoid spiders and fleas.',
        controls: ['Arrow Keys: Move', 'Space: Shoot']
    },
    {
        path: '/defender',
        component: DefenderGame,
        label: 'DEFENDER',
        theme: 'dark',
        description: 'Protect the humanoids from abduction in this side-scrolling shooter.',
        controls: ['Arrow Keys: Move', 'Space: Shoot']
    },
    {
        path: '/pitfall',
        component: PitfallGame,
        label: 'PITFALL',
        theme: 'light',
        description: 'Navigate the jungle, jump over pits and crocs, and swing on vines to find the treasure.',
        controls: ['Arrow Left/Right: Run', 'Space: Jump', 'Arrow Up/Down: Climb Ladder']
    },
    {
        path: '/frogger',
        component: FroggerGame,
        label: 'FROGGER',
        theme: 'dark',
        description: 'Hop five lanes of traffic, ride the logs across the river, and fill all five lily pads before the clock runs out. Turtles nap — and the water never forgets. Every pad you fill brings faster traffic.',
        controls: ['Arrow Keys / D-Pad: Hop', 'Space / A button: Hop Forward', 'Tap the screen to start and restart', '?: Pause and read the controls']
    },
    {
        path: '/missilecommand',
        component: MissileCommandGame,
        label: 'MISSILE COMMAND',
        theme: 'dark',
        description: 'Defend your cities from incoming ICBMs.',
        controls: ['Mouse Move: Aim', 'Click: Fire ABM']
    },
    {
        path: '/adventure',
        component: AdventureGame,
        label: 'ADVENTURE',
        theme: 'dark',
        description: 'Explore a world of castles, dungeons, and dragons. Find the enchanted chalice and return it home.',
        controls: ['Arrow Keys: Move', 'Space: Drop Item']
    },
    {
        path: '/zork',
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
        component: ZorkII,
        label: 'ZORK II',
        theme: 'dark',
        sensors: ['transcript'],
        description: 'The Wizard of Frobozz. Continue your underground adventure, but beware the capricious Wizard who haunts these depths.',
        controls: ['Type commands: GO NORTH, TAKE LAMP, OPEN MAILBOX', 'LOOK: Examine surroundings', 'INVENTORY: Check items', 'SAVE / RESTORE: Save and load game']
    },
    {
        path: '/zork3',
        component: ZorkIII,
        label: 'ZORK III',
        theme: 'dark',
        sensors: ['transcript'],
        description: 'The Dungeon Master. The final chapter of the Zork trilogy. Prove your worth to become the Dungeon Master.',
        controls: ['Type commands: GO NORTH, TAKE LAMP, OPEN MAILBOX', 'LOOK: Examine surroundings', 'INVENTORY: Check items', 'SAVE / RESTORE: Save and load game']
    },
    {
        path: '/kingsquest',
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
        component: RogueGame,
        label: 'ROGUE',
        theme: 'dark',
        description: 'The original dungeon crawler. Descend through procedurally generated dungeons, battle monsters, collect treasure, and find the Amulet of Yendor. Permadeath — every run is unique.',
        controls: ['Arrow Keys / hjkl: Move', ',: Pick up', 'i: Inventory', 'q: Quaff potion', 'r: Read scroll', '>: Descend stairs', '?: Help']
    }
    ,
    {
        path: "/ultima1",
        component: Ultima1Game,
        label: "ULTIMA I",
        theme: "dark",
        description: "Richard Garriott's The First Age of Darkness (1986 DOS rewrite of the 1981 original). The game that started it all — explore the lands of Sosaria, defeat the evil wizard Mondain, and travel through time and space. Features dungeon crawling, overworld exploration, and even space combat.",
        controls: ["Arrow Keys: Move", "A: Attack", "C: Cast Spell", "D: Drop", "E: Enter", "F: Fire", "G: Get", "H: Hyper jump (space)", "I: Inform/Search", "O: Open", "R: Ready weapon", "S: Steal", "T: Transact", "U: Unlock", "W: Wear armor", "X: eXit", "Z: Ztats", "Q: Save and quit"]
    }
    ,
    {
        path: "/ultima2",
        component: Ultima2Game,
        label: "ULTIMA II",
        theme: "dark",
        description: "Richard Garriott landmark RPG: Revenge of the Enchantress (1982). Travel through time across Earths history to defeat the evil Minax. One of the earliest open-world RPGs.",
        controls: ["First time: create a character from the boot menu before pressing Play (\"No character on disk\" is the prompt, not an error)", "Arrow Keys: Move", "A: Attack", "C: Cast Spell", "G: Get/Pick Up", "T: Transact (buy/sell)", "O: Open", "Q: Quit/Save", "V: View Stats"]
    }
    ,
    {
        path: "/ultima4",
        component: Ultima4Game,
        label: "ULTIMA IV",
        theme: "dark",
        description: "Richard Garriott's Quest of the Avatar (1985). The first Ultima to shift from killing monsters to embodying virtue — honesty, compassion, valor, justice, sacrifice, honor, spirituality, humility. Explore Britannia, master the eight virtues, and become the Avatar. Widely considered one of the most influential RPGs ever made. This is the 1996 PC GAMES freeware release, officially distributed by Origin.",
        controls: ["At first gypsy encounter: answer the moral questions to determine your starting class", "Arrow Keys: Move", "A: Attack", "C: Cast Spell", "E: Enter (town/dungeon)", "G: Get Chest", "J: Jimmy lock", "L: Locate (look at map)", "M: Mix reagents", "O: Open door", "P: Peer at gem", "R: Ready weapon / Reagent", "S: Search", "T: Talk", "U: Use item", "W: Wear armor", "X: eXit (ship/horse)", "Y: Yell", "Z: Ztats (view stats)", "Q: Save and quit"]
    }
    ,
    {
        path: "/ultima3",
        component: Ultima3Game,
        label: "ULTIMA III",
        theme: "dark",
        description: "Richard Garriott's Exodus (1983). The first Ultima with a party system — assemble a team of four adventurers to defeat the mysterious Exodus, offspring of Mondain and Minax. Introduced party-based combat, character classes, and the foundations that would evolve into Ultima IV's virtue system.",
        controls: ["Arrow Keys: Move", "A: Attack", "B: Board/Dismount", "C: Cast Spell", "E: Enter town/dungeon", "F: Fire cannon", "G: Get chest", "H: Hand equipment", "K: Klimb", "L: Look", "O: Open", "R: Ready weapon", "T: Talk", "W: Wear armor", "X: eXit vehicle", "Z: Ztats (view stats)", "Q: Save and quit"]
    }
    ,
    {
        path: "/ultima5",
        component: Ultima5Game,
        label: "ULTIMA V",
        theme: "dark",
        description: "Richard Garriott's Warriors of Destiny (1988). Lord British has vanished and the tyrant Blackthorn has corrupted the virtues into oppressive laws. Lead the Avatar's party through a dark and morally complex Britannia. The last keyboard-driven Ultima and widely considered the series' storytelling peak. 1996 freeware distribution.",
        controls: ["Arrow Keys: Move", "A: Attack", "B: Board/Mount", "C: Cast Spell", "D: Descend", "E: Enter", "F: Fire", "G: Get", "I: Ignite torch", "J: Jimmy lock", "K: Klimb", "L: Look", "M: Mix reagents", "O: Open", "P: Push", "R: Ready weapon", "S: Search", "T: Talk", "U: Use item", "V: View (cycle views)", "W: Wear armor", "X: eXit", "Z: Ztats", "Q: Save and quit"]
    }

]