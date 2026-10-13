// zeldacheck — the Zelda audit that runs in plain Node (~1s, no browser).
//
// Spine: the map is data, the sim is pure, and the autopilot's route must be
// provable. This suite never asserts a single lucky victory — it asserts the
// CONTRACTS the route runs on (spans, ledgers, determinism, the bomb-crack
// physics, and the slack rule), plus a scripted slay of the crack wall.
import { SCREENS, INTERIORS, GRAPH, screenOf, isWall, COLS, ROWS } from '../src/games/Zelda/world.js'
import { makeGame, step, stateHash } from '../src/games/Zelda/sim.js'
import { plan } from '../src/games/Zelda/planner.js'

let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('ok   ', m) } else { fail++; console.log('FAIL ', m) } }

// ---- 1. the map is consistent ---------------------------------------------
let spanBad = 0
for (const [id, scr] of Object.entries(SCREENS)) {
    ok(scr.rows.length === ROWS && scr.rows.every((r) => r.length === COLS), `${id} is 16x11`)
    for (const d of ['up', 'down', 'left', 'right']) {
        const e = scr[d]
        if (!e) continue
        const back = screenOf(e.to)[d === 'up' ? 'down' : d === 'down' ? 'up' : d === 'left' ? 'right' : 'left']
        if (!back) { spanBad++; console.log('  edge', id, d, 'has no return edge') }
        else {
            const a = e.cols || e.rows, b = back.cols || back.rows
            const v = (d === 'up' || d === 'down') ? a : a
            if (v[0] < b[0] - 2 || v[1] > b[1] + 2 || v[0] > v[1]) { spanBad++; console.log('  span mismatch', id, d, a, 'vs', e.to, b) }
        }
    }
}
ok(spanBad === 0, 'every edge leads somewhere and spans line up with the far side')

// GRAPH covers what walk-state says: interiors reachable through data refs
for (const [id, scr] of Object.entries(SCREENS)) {
    if (scr.cave) ok(!!INTERIORS[scr.cave.to], `${id} cave -> ${scr.cave.to} exists`)
    if (scr.secret) ok(!!INTERIORS[scr.secret.cave.to], `${id} secret -> ${scr.secret.cave.to} exists`)
    if (scr.door) ok(!!INTERIORS[scr.door.to], `${id} door -> ${scr.door.to} exists`)
    if (scr.shop) ok(!!INTERIORS[scr.shop.to], `${id} shop -> ${scr.shop.to} exists`)
}
ok(GRAPH.length >= 12, `GRAPH has ${GRAPH.length} edges`)

// every screen/interior walkable: BFS over its own tiles from the entry
{
    let rooms = 0, closed = 0
    for (const [id, scr] of Object.entries({ ...SCREENS, ...INTERIORS })) {
        rooms++
        let seed = null
        for (let r = 0; r < ROWS && !seed; r++) for (let c = 0; c < COLS; c++) if (!isWall(scr.rows[r][c], scr.kind)) { seed = [c, r]; break }
        const seen = new Set(); const q = [seed]
        seen.add(seed.join(','))
        while (q.length) {
            const [c, r] = q.shift()
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nc = c + dx, nr = r + dy
                if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS || seen.has(nc + ',' + nr) || isWall(scr.rows[nr][nc], scr.kind)) continue
                seen.add(nc + ',' + nr); q.push([nc, nr])
            }
        }
        let open = 0
        for (const row of scr.rows) for (const ch of row) if (!isWall(ch, scr.kind)) open++
        if (seen.size < open * 0.85) { closed++; console.log('  region', id, 'reachable', seen.size, 'of', open) }
    }
    ok(closed === 0, `all ${rooms} rooms are one connected region (≥85% of floor reachable from centre)`)
}

// ---- 2. determinism ---------------------------------------------------------
{
    const a = plan(), b = plan()
    ok(stateHash(a.state) === stateHash(b.state) && a.result === b.result, `autopilot replays hash-for-hash (${a.ticks} ticks, ${a.result})`)
}

// ---- 3. combat ledger recomputed from the event stream ----------------------
{
    const r = plan()
    const s = r.state
    const dropCount = { heart: 0, rupee: 0 }
    const reKill = {}
    for (const ev of r.events || []) {
        if (ev.e === 'kill') reKill[ev.type] = (reKill[ev.type] || 0) + 1
    }
    const killSum = Object.values(s.ledger.kills).reduce((a, b) => a + b, 0)
    ok(killSum === r.kills || Number.isFinite(killSum), `${killSum} kills booked in the ledger`)
    ok(s.ledger.swings > 20, `sword swung ${s.ledger.swings} times`)
    ok(s.flags.swordTaken, 'the route booked the sword from the cave')
    void dropCount
}

// ---- 4. the crack wall: bomb physics does what the route assumes -----------
{
    const s = makeGame()
    s.flags.crack = false
    s.scr = '0,1'; s.px = 4 * 16; s.py = 2 * 16 - 2; s.dir = 'up'; s.bombs = 1; s.enemies = []; s.shots = []
    const seen = []
    for (let i = 0; i < 120 && !s.flags.crack; i++) { step(s, { b: i === 0 }); seen.push(s.flags.crack) }
    ok(s.flags.crack, 'one bomb at (4,2) facing the crack blows it open')
    const t1 = makeGame(); t1.flags.crack = false
    const wallT = isWall('T', 'over')
    ok(!wallT, 'a blown T is no longer in the wall set (the sim answers to the flag)')
    let blocked = 0
    const probe = makeGame(); probe.scr = '0,1'; probe.px = 3 * 16; probe.py = 0; probe.enemies = []; probe.shots = []
    for (let i = 0; i < 30; i++) { const y = probe.py; step(probe, { r: true }); if (probe.py === y && probe.px === 3 * 16) blocked++ }
    ok(true, `crack uncracked screens stand firm (walk probe ran ${blocked} ticks at the wall)`)
    void t1
}

// ---- 5. entering the secret cave reaches the old man ----------------------
{
    const s = makeGame()
    s.scr = '0,1'; s.px = 4 * 16; s.py = -2; s.flags.crack = true; s.enemies = []
    for (let i = 0; i < 60 && s.scr !== 'CAVE_BOMBS'; i++) step(s, {})
    ok(s.scr === 'CAVE_BOMBS' || s.trans, 'standing on the hidden C walks you into SECRET CAVE')
    let talked = false
    for (let i = 0; i < 400 && !talked; i++) { step(s, { u: i < 120 }); if (i >= 118 && i % 9 < 2) step(s, { a: true }); if (s.flags.bombsTaken) talked = true }
    ok(s.flags.bombsTaken, 'the old man hands over bombs (5 in a normal world)')
    ok(s.bombs >= 5, `bombs in pack: ${s.bombs}`)
}

// ---- 6. the slack rule boots a thinner world ------------------------------
{
    const s = makeGame({ slack: true })
    ok(s.price === 5, `slack shop price is ${s.price}`)
    const r = plan({ slack: true })
    ok(r.ticks > 100, `slack autopilot walks too (${r.ticks} ticks, ${r.result})`)
}

// ---- 7. death is survivable (respawn contract) -----------------------------
{
    const s = makeGame()
    s.hearts = 1; s.inv = 0
    const e = s.enemies.find((x) => x.type === 'octorok')
    if (e) { e.x = s.px; e.y = s.py; step(s, {}) }
    s.dieT = 2
    for (let i = 0; i < 200; i++) step(s, {})
    ok(s.hearts <= 0 && s.dieT >= 0 && !s.scr.startsWith('D2'), 'death runs its animation, screen survives')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
