import PongGame from '../games/Pong'
import SpaceInvadersGame from '../games/SpaceInvaders'
import PacmanGame from '../games/Pacman'
import AsteroidsGame from '../games/Asteroids'
import DonkeyKongGame from '../games/DonkeyKong'
import CentipedeGame from '../games/Centipede'
import DefenderGame from '../games/Defender'
import PitfallGame from '../games/Pitfall'
import MissileCommandGame from '../games/MissileCommand'
import AdventureGame from '../games/Adventure'
import { ZorkI, ZorkII, ZorkIII } from '../games/Zork'
import KingsQuestGame from '../games/KingsQuest'
import RogueGame from '../games/Rogue'
import Ultima1Game from '../games/Ultima1'
import Ultima2Game from '../games/Ultima2'
import Ultima3Game from '../games/Ultima3'
import Ultima4Game from '../games/Ultima4'
import Ultima5Game from '../games/Ultima5'

// Game Registry
// Theme 'dark' = white text (background is black)
// Theme 'light' = black text (background is white)
export const GAMES = [
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
        description: 'The Great Underground Empire. Explore a vast underground world full of treasures, puzzles, and dangers. Watch out for Grues.',
        controls: ['Type commands: GO NORTH, TAKE LAMP, OPEN MAILBOX', 'LOOK: Examine surroundings', 'INVENTORY: Check items', 'SAVE / RESTORE: Save and load game']
    },
    {
        path: '/zork2',
        component: ZorkII,
        label: 'ZORK II',
        theme: 'dark',
        description: 'The Wizard of Frobozz. Continue your underground adventure, but beware the capricious Wizard who haunts these depths.',
        controls: ['Type commands: GO NORTH, TAKE LAMP, OPEN MAILBOX', 'LOOK: Examine surroundings', 'INVENTORY: Check items', 'SAVE / RESTORE: Save and load game']
    },
    {
        path: '/zork3',
        component: ZorkIII,
        label: 'ZORK III',
        theme: 'dark',
        description: 'The Dungeon Master. The final chapter of the Zork trilogy. Prove your worth to become the Dungeon Master.',
        controls: ['Type commands: GO NORTH, TAKE LAMP, OPEN MAILBOX', 'LOOK: Examine surroundings', 'INVENTORY: Check items', 'SAVE / RESTORE: Save and load game']
    },
    {
        path: '/kingsquest',
        component: KingsQuestGame,
        label: "KING'S QUEST",
        theme: 'dark',
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