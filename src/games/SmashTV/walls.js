// SMASH TV — wall paint decisions (pure, no DOM). drawWalls in index.jsx renders
// exactly these: a two-tone chrome checkerboard with mortar seams, a per-room
// neon top edge (one broadcast accent per arena, the Gauntlet material-tint idea
// scaled to nine rooms), and rivets that catch a highlight.

// chrome tones for the checkerboard, the mortar seam, the panel drop-shadow, and
// the rivet body + the highlight pixel that catches the studio light
export const CHROME = {
    baseA: '#3a4361',
    baseB: '#282f45',
    mortar: '#161b2a',
    shade: 'rgba(0,0,0,0.5)',
    rivet: '#6b78a0',
    rivetHi: '#c3cce8',
}

// one neon top-edge tint per arena (index = room 0..8). Bonus rooms glow green,
// the kill floor runs hot, THE ANNOUNCER's room burns gold.
export const NEON_TOP = [
    '#5dc8ff', // 0 DOME OF THE CAMERAS
    '#8fb0ff', // 1 TURRET ALLEY
    '#ffd23f', // 2 THE GRANADIERS
    '#8fff9f', // 3 BONUS! RUN, CONTESTANTS, RUN!
    '#e08fff', // 4 HEAVY WEATHER
    '#ff8a3f', // 5 THE KILL FLOOR
    '#8fff9f', // 6 BONUS! THE AUDIENCE DEMANDS IT
    '#ff5d5d', // 7 GAUNTLET OF THE STARS
    '#ffd23f', // 8 THE ANNOUNCER
]

// the paint plan for one interior wall cell. `neon` is the room's top-edge tint
// (callers pass NEON_TOP[roomIdx]); `on` picks which chrome tone the cell takes.
export function wallCell(c, r, neon) {
    const on = (c + r) % 2 === 0
    return {
        on,
        base: on ? CHROME.baseA : CHROME.baseB,
        neon,
        mortar: CHROME.mortar,
        rivet: CHROME.rivet,
        rivetHi: CHROME.rivetHi,
    }
}

// the border-frame rivet: a body that catches a highlight on its top-left pixel
export const borderRivet = { body: '#3d4a66', hi: '#c3cce8' }
