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
    }
]
