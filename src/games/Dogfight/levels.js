// WWI DOGFIGHT — two carved patrols. A mission is a spawn contract, not a
// map: geometry here is altitude and bearing, the two currencies a fixed-wing
// pilot actually spends. Everything is deterministic — no seed, no shuffle.
//
// The issue's muscle lives in these numbers:
//   - player starts LOWER than the bandits: every patrol opens by BUYING
//     height with speed (a zoom climb), so the energy budget is played from
//     tick one, not read off a stat sheet,
//   - spawns sit well inside the arena so the first merge happens centre-patrol,
//   - enemy `skill` is the gun-gate tightness and roll gain — two honest
//     degrees of danger, both auditable.

export const MISSION_COUNT = 2

const BASE = {
    arena: { cx: 0, cz: 0, r: 850 },
    minAlt: 60,
}

const SPECS = [
    {
        name: 'DAWN PATROL',
        brief: 'Two Albatroses cross the line low-coupled. Climb to meet them — with your gun.',
        clock: 170,
        player: { x: 0, y: 150, z: -280, yaw: 0, belt: 200, hp: 4 },
        enemies: [
            { x: -120, y: 210, z: 240, yaw: Math.PI + 0.10, skill: 1 },
            { x: 130, y: 195, z: 300, yaw: Math.PI - 0.14, skill: 0 },
        ],
    },
    {
        name: 'THE CIRCUS',
        brief: 'Three of them, on the sun side, a hundred metres up. The Flying Circus does not share the sky.',
        clock: 200,
        player: { x: 0, y: 130, z: -320, yaw: 0, belt: 240, hp: 4 },
        enemies: [
            { x: -210, y: 215, z: 300, yaw: Math.PI + 0.25, skill: 1 },
            { x: 10, y: 245, z: 350, yaw: Math.PI - 0.05, skill: 1 },
            { x: 220, y: 205, z: 280, yaw: Math.PI - 0.30, skill: 0 },
        ],
    },
]

export function buildMission(i) {
    const idx = ((i % MISSION_COUNT) + MISSION_COUNT) % MISSION_COUNT
    const s = SPECS[idx]
    const m = structuredClone({ ...BASE, ...s })
    // honest construction: the contract the harness re-checks, asserted here
    // first so a bad edit fails at the source rather than in a red check far away
    if (m.player.y <= m.minAlt) throw new Error(`${m.name}: player spawns under the deck`)
    if (Math.hypot(m.player.x - m.arena.cx, m.player.z - m.arena.cz) > m.arena.r) throw new Error(`${m.name}: player spawns outside the patrol box`)
    if (!m.enemies.length) throw new Error(`${m.name}: a patrol with no bandits is a holiday`)
    for (const e of m.enemies) {
        if (e.y <= m.minAlt) throw new Error(`${m.name}: bandit spawns under the deck`)
        if (Math.hypot(e.x - m.arena.cx, e.z - m.arena.cz) > m.arena.r) throw new Error(`${m.name}: bandit spawns outside the patrol box`)
        if (e.y <= m.player.y) throw new Error(`${m.name}: the player must BUY altitude — every bandit spawns above the scout`)
    }
    return m
}
