// COMET DRIFT GP — the COMET CUP (#1737). Pure points rules for a three-race
// grand prix, the #419 "not yet" cups. Nothing from the sim lives here: the
// shell hands over the LIVE classification (kart name + place, exactly the
// ordering the end screen shows when the player's flag drops) and the standings
// are derived from those boards. Deterministic — the same three boards always
// make the same cup, so Node can audit the whole mode without a browser.

export const CUP = {
    name: 'COMET CUP',
    // course ids in order (resolved against COURSES in track.js): dust, bowl,
    // triple-apex dunes — the GP arc, oldest course first.
    courses: ['gulch', 'sandbank', 'corkscomb'],
    // points per finishing position (place-1 indexes), whole seven-kart field.
    // Classic arcade GP spacing: a win is worth more than two thirds, so the
    // leader can be chased but not caught by a single lucky run.
    points: [10, 8, 6, 4, 3, 2, 1],
}

export const CUP_RACES = CUP.courses.length

export function makeCup() {
    return { raceIdx: 0, pts: {}, results: [] }
}

// board = [{ name, place }] — the live classification when the player finishes.
// Awards points, records the race, advances the index. A place beyond the
// points table scores nothing. Returns the cup for chaining.
export function tally(cup, board, courseShort) {
    const rows = [...board].sort((a, b) => a.place - b.place)
    for (const r of rows) {
        cup.pts[r.name] = (cup.pts[r.name] || 0) + (CUP.points[r.place - 1] || 0)
    }
    cup.results.push({ course: String(courseShort || ''), board: rows.map((r) => ({ name: r.name, place: r.place })) })
    cup.raceIdx += 1
    return cup
}

// Standings: points desc, then wins desc, then best single finish, then name.
export function standings(cup) {
    const rows = Object.keys(cup.pts).map((name) => {
        let wins = 0
        let best = Number.MAX_SAFE_INTEGER
        for (const r of cup.results) {
            const line = r.board.find((b) => b.name === name)
            if (!line) continue
            if (line.place === 1) wins += 1
            if (line.place < best) best = line.place
        }
        return { name, pts: cup.pts[name], wins, best }
    })
    rows.sort((a, b) => b.pts - a.pts || b.wins - a.wins || a.best - b.best || (a.name < b.name ? -1 : 1))
    return rows
}

export const leaderName = (cup) => (standings(cup)[0] || {}).name || null
export const cupDone = (cup) => cup.raceIdx >= CUP_RACES
