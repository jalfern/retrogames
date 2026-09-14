// IRONKEEP self-verifying check.
//
// Two halves:
//
//  1. GEOMETRY (node, no browser). Every level is carved from solid rock, which
//     makes leaks impossible — but it does not make a level *completable*. This
//     audit walks each map with a key-gated fixed-point BFS and asserts the exit
//     and every prop are reachable given only the doors whose keys are themselves
//     reachable. That is the one class of bug a screenshot cannot show: a gold key
//     sealed behind the gold door it opens, or a guard standing inside a wall.
//
//  2. GAMEPLAY (system Chrome via window.__keepTest). Attract/pause/touch
//     regressions, collision, the hitscan, pickups, locked doors, enemy pathing
//     without line of sight, the level-clear path, the death/lives loop, and a
//     frame-time budget for a 320x200 software renderer.
//
// Simulation is driven with __keepTest.step(n) after freeze(true), so movement
// and AI assertions are exact instead of frame-rate lottery.
//
// Usage:
//   npm run fpscheck
//   node scripts/fpscheck.mjs [--url <url>] [--max-ms 20]
//
// Prereqs: `npm install`, a running `npm run dev`.

import { opt, requireDevServer, launch, openGame, Report, KEEP_URL_DEFAULT } from './lib/harness.mjs'

const args = process.argv.slice(2)
const url = opt(args, '--url', KEEP_URL_DEFAULT)
const maxMs = +opt(args, '--max-ms', 20)

const { LEVELS } = await import('../src/games/IronKeep/levels.js')

// --------------------------------------------------------------- geometry
// A tile is walkable if it is floor, an unlocked door, or a locked door whose
// key the walker already holds. 'X' (exit) is solid: reaching a *neighbour*
// of the exit is a win, because the player triggers it by walking into it.
function reachable(L, have) {
    const start = [L.start.x | 0, L.start.y | 0]
    const seen = new Set([start[1] * L.w + start[0]])
    const q = [start]
    const open = (c) => c === '.' || c === 'D'
        || (c === 'L' && have.has('I')) || (c === 'G' && have.has('G'))
    while (q.length) {
        const [x, y] = q.shift()
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, ny = y + dy
            if (nx < 0 || ny < 0 || nx >= L.w || ny >= L.h) continue
            const i = ny * L.w + nx
            if (seen.has(i) || !open(L.rows[ny][nx])) continue
            seen.add(i)
            q.push([nx, ny])
        }
    }
    return seen
}

function auditLevel(L) {
    const bad = []
    if (L.rows.length !== L.h) bad.push(`height ${L.rows.length} != ${L.h}`)
    for (let y = 0; y < L.h; y++) {
        if (L.rows[y].length !== L.w) bad.push(`row ${y} is ${L.rows[y].length} wide, expected ${L.w}`)
    }
    // The carved map must be sealed: no floor on the outer ring, or the raycaster
    // would cast into the void and the player could step out of the world.
    for (let x = 0; x < L.w; x++) {
        if (L.rows[0][x] === '.' || L.rows[L.h - 1][x] === '.') bad.push(`leaky floor on the top/bottom ring at x=${x}`)
    }
    for (let y = 0; y < L.h; y++) {
        if (L.rows[y][0] === '.' || L.rows[y][L.w - 1] === '.') bad.push(`leaky floor on the left/right ring at y=${y}`)
    }
    const sx = L.start.x | 0, sy = L.start.y | 0
    if (L.rows[sy][sx] !== '.') bad.push('player start is not on floor')

    const [ex, ey] = L.exit
    if (L.rows[ey][ex] !== 'X') bad.push('exit tile is not an X')
    const exitOpen = [[1, 0], [-1, 0], [0, 1], [0, -1]]
        .some(([dx, dy]) => L.rows[ey + dy]?.[ex + dx] === '.')
    if (!exitOpen) bad.push('exit has no floor neighbour')

    for (const p of L.props) {
        if (L.rows[p.y | 0]?.[p.x | 0] !== '.') bad.push(`${p.t} at ${p.x},${p.y} is not on floor`)
    }

    for (const d of L.doors) {
        const c = L.rows[d.y][d.x]
        if (c !== 'D' && c !== 'L' && c !== 'G') bad.push(`door at ${d.x},${d.y} is '${c}' in the grid`)
    }

    // Key-gated fixed point: keep re-walking until the key set stops growing, so
    // "key behind its own door" is caught instead of silently assumed reachable.
    const have = new Set()
    let seen = reachable(L, have)
    for (let pass = 0; pass < 6; pass++) {
        let grew = false
        for (const p of L.props) {
            const k = p.t === 'keyGold' ? 'G' : p.t === 'keyIron' ? 'I' : null
            if (k && !have.has(k) && seen.has((p.y | 0) * L.w + (p.x | 0))) { have.add(k); grew = true }
        }
        if (!grew) break
        seen = reachable(L, have)
    }
    if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has((ey + dy) * L.w + (ex + dx)))) {
        bad.push(`exit at ${ex},${ey} is unreachable with keys {${[...have].join('') || 'none'}}`)
    }
    for (const p of L.props) {
        if (!seen.has((p.y | 0) * L.w + (p.x | 0))) bad.push(`${p.t} at ${p.x},${p.y} is unreachable`)
    }
    if (!L.props.some(p => ['grunt', 'hound', 'mage', 'boss'].includes(p.t))) bad.push('no enemies in the level')

    return { bad, have, floor: seen.size }
}

// ------------------------------------------------------------------- runner
await requireDevServer(url)
const browser = await launch()
const r = new Report('fpscheck')

console.log('\n--- level geometry ---')
for (let i = 0; i < LEVELS.length; i++) {
    const L = LEVELS[i]
    const { bad, have, floor } = auditLevel(L)
    r.check(`${L.name}: completable`, bad.length === 0,
        bad.length ? bad.join('; ') : `${floor} tiles, keys {${[...have].join('') || 'none'}}`)
}

const page = await openGame(browser, { url, hook: '__keepTest' })
const errors = []
page.on('pageerror', e => errors.push(e.message))
const fresh = async () => {
    await page.goto(url, { waitUntil: 'load' })
    await page.waitForFunction(() => !!window.__keepTest, null, { timeout: 15000 })
    await page.waitForTimeout(250)
}
await fresh()

const st = () => page.evaluate(() => window.__keepTest.state())
const call = (fn, ...a) => page.evaluate(([f, args]) => window.__keepTest[f](...args), [fn, a])

// 1. Attract mode, and the lone-modifier rule the Mario check guards too.
await r.check('boots into attract mode', (await st()).mode === 'attract', `mode=${(await st()).mode}`)
await page.keyboard.press('Shift')
await page.waitForTimeout(150)
await r.check('lone Shift does not start the game', (await st()).mode === 'attract')
const padAttract = await page.locator('span:text-is("A")').count()
await r.check('gamepad hidden on the title screen', padAttract === 0, `found ${padAttract}`)

// 2. '?' opens the shared pause overlay (and the gamepad must stay hidden).
await page.keyboard.press('?')
await page.waitForTimeout(250)
await r.check("'?' opens the pause overlay", await page.getByRole('heading', { name: 'CONTROLS' }).isVisible())
await page.keyboard.press('?')
await page.waitForTimeout(200)
await r.check("'?' resumes", !(await page.getByRole('heading', { name: 'CONTROLS' }).isVisible().catch(() => false)))

// 3. Start: real keypress leaves attract, music starts, gamepad appears.
await page.keyboard.press('ArrowRight')
await page.waitForTimeout(500)
let s = await st()
await r.check('a key starts the first hall', s.mode === 'play' && s.level === 0, `mode=${s.mode} level=${s.level}`)
await r.check('dungeon music is playing', !!s.music?.playing && s.music.track === 'keep', JSON.stringify(s.music))
await r.check('gamepad shown during play', (await page.locator('span:text-is("A")').count()) > 0)

// Audio: same spirit as audcheck — the analyser tap must show signal. Sampled as a
// max because a chiptune peak is discrete-note sampling luck, not a stable level.
let peak = 0
for (let i = 0; i < 14; i++) { peak = Math.max(peak, await call('peak')); await page.waitForTimeout(60) }
await r.check('audio engine outputs signal', peak > 0, `analyser peak ${peak}`)

const art = await call('art')
await r.check('art generated at runtime', art.sprites >= 20 && art.textures >= 10 && art.weapons === 3,
    `${art.sprites} sprites / ${art.textures} textures / ${art.weapons} guns`)

// 3b. Tap-fire regression (found by keyboard playtest): a keydown+keyup that both
// land between two 60Hz samples used to be swallowed, so a quick tap did nothing.
{
    const pre = (await st()).ammo
    for (let i = 0; i < 3; i++) { await page.keyboard.press('Space'); await page.waitForTimeout(500) }
    const post = (await st()).ammo
    await r.check('a quick tap still fires', post < pre, `bolts ${pre} -> ${post}`)
}

// 4. Deterministic simulation: freeze the loop, seed the RNG, drive update() by hand.
await call('freeze', true)
await call('seed', 20260117)
await call('setHealth', 9999)      // immortal while the geometry tests run

// 4a. Walls are walls. Facing east from the courtyard, the body radius stops you
// flush against the tile at x=10 — short of it, never through it.
await call('warp', 8.5, 19.5, 0)
await call('input', 'fwd', 1); await call('step', 150); await call('input', 'fwd', 0)
s = await st()
await r.check('cannot walk through a wall', s.x > 9.4 && s.x < 9.85, `x=${s.x.toFixed(2)} (limit 9.72)`)

// 4b. Walking north: through the courtyard door (which must slide open on push).
await call('warp', 5.5, 19.5, -Math.PI / 2)
await call('input', 'fwd', 1); await call('step', 200); await call('input', 'fwd', 0)
s = await st()
const door = s.doors.find(d => d.x === 5 && d.y === 11)
await r.check('forward movement works', s.y < 13, `y=${s.y.toFixed(2)}`)
await r.check('pushing a door opens it', !!door && door.open > 0.5, JSON.stringify(door))

// 4c. Locked doors refuse you, and name the key you are missing.
await call('warp', 17.5, 13.5, -Math.PI / 2)
await call('input', 'fwd', 1); await call('step', 90); await call('input', 'fwd', 0)
s = await st()
const gold = s.doors.find(d => d.x === 17 && d.y === 12)
await r.check('gold door stays shut without the key', !!gold && gold.open === 0, JSON.stringify(gold))
await r.check('and says so', /GOLD KEY/.test(s.msg), `msg="${s.msg}"`)

await call('give')
await call('input', 'fwd', 1); await call('step', 120); await call('input', 'fwd', 0)
s = await st()
const gold2 = s.doors.find(d => d.x === 17 && d.y === 12)
await r.check('gold door opens with the key', !!gold2 && gold2.open > 0.5, JSON.stringify(gold2))

// 5. Hitscan: three bolts into a legionary at close range must put him down.
await call('warp', 5.5, 19.0, -Math.PI / 2)
const gid = await call('spawn', 'grunt', 5.5, 16.0)
const byId = async (id) => (await call('list')).find(e => e.id === id)
const before = await byId(gid)
const scoreBefore = (await st()).score
for (let i = 0; i < 6; i++) { await call('shoot'); await call('step', 30) }
const after = await byId(gid)
s = await st()
await r.check('bolts wound and kill', before.state !== 'dead' && after.state === 'dead',
    `hp ${before.hp} -> ${after.hp} state=${after.state}`)
await r.check('a kill scores', s.score >= scoreBefore + 100, `score=${s.score}`)

// 6. Pickups.
const bolts = (await call('props')).find(p => p.kind === 'bolts' && !p.gone)
const ammoBefore = (await st()).ammo
await call('warp', bolts.x, bolts.y, 0)
await call('step', 4)
s = await st()
await r.check('walking over bolts resupplies', s.ammo > ammoBefore, `${ammoBefore} -> ${s.ammo}`)

// 7. Pathing without line of sight: a hound around a corner, woken by gunfire,
// must find the corridor door and come through it. Greedy steering fails here.
await call('setHealth', 9999)               // the keep is lethal; stay out of the tally
await call('warp', 3.5, 20.5, 0)
const hid = await call('spawn', 'hound', 13.5, 20.5)
const d0 = Math.hypot(13.5 - 3.5, 20.5 - 20.5)
await call('shoot')                       // noise wakes him; he still cannot see you
await call('step', 480)
const hd = await byId(hid)
const still = await st()
await r.check('still alive and in the same hall', still.mode === 'play' && still.level === 0, `mode=${still.mode}`)
const d1 = hd ? Math.hypot(hd.x - 3.5, hd.y - 20.5) : -1
await r.check('hound paths to you through a door with no LOS', hd && d1 < 3,
    `${d0.toFixed(1)} -> ${d1.toFixed(1)} tiles, awake=${hd?.awake}`)

// 8. The exit ends the hall and loads the next one.
await call('setHealth', 9999)
await call('warp', 26.5, 7.5, 0)
await call('input', 'fwd', 1); await call('step', 60); await call('input', 'fwd', 0)
s = await st()
await r.check('touching the exit clears the hall', s.mode === 'clear', `mode=${s.mode}`)
await call('step', 200)
s = await st()
await r.check('next hall loads', s.level === 1 && s.mode === 'play', `level=${s.level} mode=${s.mode}`)

// 9. Death costs a life and restarts the hall; the last one is game over.
const livesBefore = (await st()).lives
await call('setHealth', 5); await call('hurt', 50)
await r.check('damage to zero starts the death', (await st()).mode === 'dying')
await call('step', 120)
s = await st()
await r.check('a life is spent and the hall restarts',
    s.mode === 'play' && s.lives === livesBefore - 1 && s.health === 100,
    `mode=${s.mode} lives=${livesBefore}->${s.lives} hp=${s.health}`)
for (let i = 0; i < 5 && (await st()).mode !== 'dead'; i++) {
    await call('setHealth', 1); await call('hurt', 50); await call('step', 150)
}
await r.check('out of lives is game over', (await st()).mode === 'dead')
await page.keyboard.press('Space')
await page.waitForTimeout(200)
await r.check('game over returns to the title', (await st()).mode === 'attract')

// 10. The finale: the Warden must wake when it sees you, be killable by the
// lancer, and the last exit must end the game rather than hang on the fanfare.
await call('freeze', true)
await call('gotoLevel', 2)
await call('setHealth', 9999)
await call('give')
await call('seed', 5150)
const boss = (await call('list')).find(e => e.kind === 'boss')
await r.check('the black hall has a warden', !!boss, boss ? `hp=${boss.hp}` : 'missing')
await call('warp', 16.5, 16.5, 0)
await call('step', 40)
const bwake = (await byId(boss.id))
await r.check('the warden wakes when it sees you', !!bwake && bwake.awake, `awake=${bwake?.awake}`)
await call('setWeapon', 2)
let bstate = bwake
for (let i = 0; i < 16 && bstate.state !== 'dead'; i++) {
    await call('shoot'); await call('step', 70)
    bstate = await byId(boss.id)
}
await r.check('the warden dies to the lancer', bstate.state === 'dead', `hp=${bstate.hp}`)
s = await st()
await r.check('slaying it scores like a finale', s.score >= 3000, `score=${s.score}`)
await call('warp', 30.5, 6.5, 0)
await call('input', 'fwd', 1); await call('step', 60); await call('input', 'fwd', 0)
await r.check('the last door opens the way out', (await st()).mode === 'clear')
await call('step', 220)
s = await st()
await r.check('the game ends (no hang on the fanfare)', s.mode === 'win', `mode=${s.mode}`)

// 11. Frame budget for the software renderer (320x200, unwarmed).
await page.keyboard.press('Space')      // win screen -> title
await call('start')
await call('freeze', false)
await page.waitForTimeout(1500)
const perf = await call('perf')
await r.check(`renders under ${maxMs}ms/frame`, perf.avg < maxMs, `avg=${perf.avg}ms max=${perf.max}ms over ${perf.n} frames`)

await r.check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
await page.screenshot({ path: 'scripts/.shots/keep-play.png' })

await r.exit(browser)
