// STOMPTOWN autopilot — the attract demo and the pilot stompcheck grades are the
// SAME brain: walk to the nearest standing tower, punch its facade until it falls,
// eat when hurt. Pure function of the sim state, so seed + autopilot replays to
// identical hashes; the harness proves the game is winnable through this pilot.

export function plan(gs) {
    const p = gs.player
    if (gs.end || gs.state !== 'play' || p.reverting || p.stunT > 0) return {}

    // hurt and a meal within reach: the combo says eat
    if (p.hp < 85) {
        for (const c of gs.civilians) {
            if (!c.corpse && Math.abs(c.x - p.x) < 90) return { b: gs.tick % 6 === 0 }
        }
    }

    const standing = gs.buildings.filter((b) => b.alive && !b.crumbling)
    if (!standing.length) return {}
    let b = standing[0]
    for (const s of standing) if (Math.abs(s.x + s.w / 2 - p.x) < Math.abs(b.x + b.w / 2 - p.x)) b = s

    if (p.climb) {
        // peel off the wall with the away-push
        return p.climbSide === -1 ? { left: true } : { right: true }
    }

    const onLeft = p.x <= b.x + b.w / 2
    const tx = onLeft ? b.x - p.w / 2 - 8 : b.x + b.w + p.w / 2 + 8
    const dx = tx - p.x
    if (dx > 12) return { right: true }
    if (dx < -12) return { left: true }
    return { a: gs.tick % 8 === 0 }
}
