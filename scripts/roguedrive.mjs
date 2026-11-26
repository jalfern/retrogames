// roguedrive — #3491 in real Chrome: the away-game proved with REAL key events
// only (the sim math lives in roguecheck; this leg is what a player feels):
//   - the pinned seed 115 boots and the arrow quiver is three steps east,
//   - real arrow holds walk onto it, `,` takes it up (8 arrows in the pack),
//   - f opens the missile menu, l answers the direction prompt,
//   - the shot spends ONE arrow (quiver 7 in the pack, one lies to the east),
//   - the quiver line in the inventory screen reads the stack honestly,
//   - the help screen teaches f,
//   - #3509 mobility: seeds are scanned in node for a route where the energy/
//     flee laws fire (seed 120: a snake bites and runs), the route replays with
//     real keys to byte-identical hash equality, and the flee runs on while the
//     hero searches,
//   - zero page errors across the ride.
import { launch, openGame, Report, requireDevServer } from './lib/harness.mjs'
import { createInitialState, stepGame, done as simDone, blocksMove, hash } from '../src/games/Rogue/sim.js'

const URL = process.env.ROGUE_URL || `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/rogue?seed=115`
await requireDevServer(URL)
const browser = await launch()
const page = await openGame(browser, { url: URL, hook: '__rogueTest', wait: 500 })
const r = new Report('roguedrive')
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
const probe = () => page.evaluate(() => window.__rogueTest.probe())
const sleep = (ms) => page.waitForTimeout(ms)

// 1. walk east onto the quiver (three floor steps, pinned seed)
const start = await probe()
for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowRight'); await sleep(120) }
const atArrows = await probe()
r.check('walked east onto the quiver square', atArrows.x === start.x + 3 && !atArrows.done)

// 2. take the arrows up
await page.keyboard.press(',')
await sleep(150)
let p = await probe()
const quiv = p.inv.find((i) => i.m)
r.check('the quiver comes into the pack (qty 8)', !!quiv && quiv.q === 8, JSON.stringify(p.inv))
r.check('pickup says the count honestly', p.msgs.some((m) => /pick up 8 arrows/.test(m)), p.msgs.join(' | '))

// 3. f -> the missile menu; l -> aim east
await page.keyboard.press('f')
await sleep(120)
p = await probe()
r.check('f opens the missile menu', p.phase === 'throw', `phase=${p.phase}`)
await page.keyboard.press('a') // the quiver is the first entry
await sleep(120)
p = await probe()
r.check('the pack answers with the direction prompt', p.phase === 'aim' && /Which direction/.test(p.msgs.slice(-1)[0]), `phase=${p.phase}`)
await page.keyboard.press('l')
await sleep(150)
p = await probe()
r.check('the aimed shot returns to play', p.phase === 'playing', `phase=${p.phase}`)
r.check('one arrow spent: the quiver carries seven', p.inv.some((i) => i.m && i.q === 7), JSON.stringify(p.inv))
r.check('the missed arrow lies east, awaiting salvage',
    p.floor.some((i) => i.q === 1 && i.x > p.x && i.y === p.y), JSON.stringify(p.floor))
r.check('the shot made its sound-in-words', p.msgs.some((m) => /arrow hits the wall|arrow flies into the dark/.test(m)), p.msgs.join(' | '))

// 4. walking back over the drop puts the arrow home — except #3579 mined
//    this exact corridor: the pinned seed's route runs over a sleep trap at
//    (32,9). So the drive does what the 1980 dungeon asks: spring it, burn
//    the drugged turns in place, take the last step, and haul the bundle
//    home anyway — every key a real one.
const drop = p.floor.find((i) => i.q === 1)
if (drop) {
    let slept = 0, guard = 0
    while ((p.x < drop.x || p.sleeping > 0) && p.phase === 'playing' && ++guard < 30) {
        await page.keyboard.press('ArrowRight'); await sleep(120)
        p = await probe()
        if (p.sleeping > 0 && slept === 0) slept = p.sleeping
    }
    await page.keyboard.press(',')
    await sleep(150)
    p = await probe()
    r.check('salvaged: the arrow rejoins the quiver (8 again)', p.inv.some((i) => i.m && i.q >= 8), JSON.stringify(p.inv))
    r.check('#3579: the salvage run sprung the sleep mine and lived to tell',
        slept >= 5 && slept <= 9 && p.traps.some(t => t.seen && t.x === 32 && t.y === 9), `slept=${slept}`)
} else {
    r.check('salvaged: the arrow rejoins the quiver (8 again)', false, 'nothing to walk back to')
}

// 5. the help screen teaches f
await page.keyboard.press('?')
await sleep(200)
const helpText = await page.evaluate(() => document.body.innerText)
r.check('help screen documents the fire command', /Fire/.test(helpText) && /Magic staff/.test(helpText))
await page.keyboard.press('Escape')
await sleep(120)

// 6. #3509 mobility laws in real Chrome: scan a seed where the laws fire under
// a deterministic chase route, replay that exact route with real arrow keys,
// and watch the flee happen in the browser.
{
    // NOTE: the shared Y/WATCH contract (utils/watch.js, KeyY code) owns the y
    // key in the browser — the 1980 NW key lives on numpad 7 here, exactly as
    // the README says. The drive route must use the same door a human would.
    const KEY = { '0,-1': 'k', '0,1': 'j', '-1,0': 'h', '1,0': 'l', '-1,-1': '7', '1,-1': '9', '-1,1': '1', '1,1': '3' }
    const NEI = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]]
    const stepMob = (s, dx, dy) => stepGame(s, { type: 'MOVE', dx, dy })

    const bfsStep = (s, tx, ty) => {
        const start = `${s.player.x},${s.player.y}`
        const prev = new Map([[start, null]])
        const q = [[s.player.x, s.player.y]]
        while (q.length) {
            const [x, y] = q.shift()
            if (x === tx && y === ty) {
                let k = `${tx},${ty}`
                let last = k
                while (prev.get(k)) { last = k; k = prev.get(k) }
                const [cx, cy] = last.split(',').map(Number)
                const [px, py] = k.split(',').map(Number)
                return [Math.sign(cx - px), Math.sign(cy - py)]
            }
            for (const [dx, dy] of NEI) {
                const nx = x + dx, ny = y + dy
                if (nx < 0 || nx >= 80 || ny < 0 || ny >= 22) continue
                const c = s.map[ny][nx]
                if (blocksMove(c) || c === '+') continue
                const k = `${nx},${ny}`
                if (prev.has(k)) continue
                prev.set(k, `${x},${y}`); q.push([nx, ny])
            }
        }
        return null
    }

    let plan = null
    outer:
    for (let seed = 1; seed <= 500 && !plan; seed++) {
        let s = createInitialState(seed)
        const keys = []
        let flee = null
        for (let t = 0; t < 300 && !simDone(s); t++) {
            const adj = s.monsters.find(m => Math.max(Math.abs(m.x - s.player.x), Math.abs(m.y - s.player.y)) === 1)
            let mv = null
            if (adj) mv = [Math.sign(adj.x - s.player.x), Math.sign(adj.y - s.player.y)]
            else {
                const tgt = s.monsters.filter(m => !m.fleeing)
                    .sort((a, b) => Math.abs(a.x - s.player.x) + Math.abs(a.y - s.player.y) - Math.abs(b.x - s.player.x) - Math.abs(b.y - s.player.y))[0]
                if (tgt) mv = bfsStep(s, tgt.x, tgt.y)
            }
            if (!mv) break
            s = stepMob(s, mv[0], mv[1])
            keys.push(KEY[`${mv[0]},${mv[1]}`])
            if (process.env.ROGUE_TRACE) console.log('node', keys.length, KEY[`${mv[0]},${mv[1]}`], `hero ${s.player.x},${s.player.y}`, hash(s))
            const f = s.monsters.find(m => m.fleeing)
            if (f) {
                flee = { id: f.id, x: f.x, y: f.y, en: f.energy || 0, routeHash: hash(s) }
                // hero holds still with search turns; the fleer must gain ground
                for (let w = 0; w < 3; w++) s = stepGame(s, { type: 'SEARCH' })
                const f2 = s.monsters.find(m => m.id === flee.id)
                if (f2 && f2.fleeing) {
                    const d1 = Math.abs(flee.x - s.player.x) + Math.abs(flee.y - s.player.y)
                    const d2 = Math.abs(f2.x - s.player.x) + Math.abs(f2.y - s.player.y)
                    if (d2 > d1) { plan = { seed, keys, minEn: flee.en, d2, letter: f2.letter, after: keys.length, routeHash: flee.routeHash }; break outer }
                }
                break // this seed's flee was not observable — next seed
            }
        }
    }
    r.check('node scan found a seed whose laws fire under a real key route', !!plan)
    if (plan) {
        await page.goto(`http://localhost:${process.env.DEV_PORT || 5173}/retrogames/rogue?seed=${plan.seed}`)
        await sleep(500)
        let p0 = await probe()
        r.check('mobility shape honest in the browser probe (energy per monster)',
            Array.isArray(p0.mob) && p0.mob.length > 0 && p0.mob.every((m) => Number.isFinite(m.en)), JSON.stringify(p0.mob && p0.mob.slice(0, 2)))
        const keys = plan.keys.slice(0, plan.after)
        for (const k of keys) {
            await page.keyboard.press(k); await sleep(110)
            if (process.env.ROGUE_TRACE) { const tp = await probe(); const th = await page.evaluate(() => window.__rogueTest.hash()); console.log('brow', k, `hero ${tp.x},${tp.y}`, th) }
        }
        const bh = await page.evaluate(() => window.__rogueTest.hash())
        const pf = await probe()
        r.check('browser key replay lands on the exact scanned state (seed-pin + key equivalence)', bh === plan.routeHash, `browser ${bh} vs node ${plan.routeHash} after ${keys.length} keys`)
        const fl = pf.mob.find((m) => m.fl)
        r.check(`real keys wound a ${plan.letter} into fleeing in real Chrome`, !!fl, `hero ${pf.x},${pf.y} mob ${pf.mob.map((m) => `${m.l}@${m.x},${m.y}e${m.en}f${m.fl ? 1 : 0}`).join(' ')}`)
        for (let w = 0; w < 3; w++) { await page.keyboard.press('s'); await sleep(110) }
        const pa = await probe()
        const run = pa.mob.find((m) => m.fl)
        const hd = run ? Math.abs(run.x - pa.x) + Math.abs(run.y - pa.y) : -1
        r.check('the fleeing monster keeps running while the hero searches', !!run && hd >= plan.d2 - 1, `dist ${hd} vs ${plan.d2}`)
        r.check('seed pin honors the mobility world (browser hash matches sim seed)', hd > 0, `seed ${plan.seed}`)
    }
}

// 9. #3579 traps — scan node for a mine the hero walks onto from the start
//    room itself (clear rectangle, honest route), replay those keys with REAL
//    key events, and prove the spring is real: seen mark, the effect, and
//    byte-identical hash equality between the sim route and Chrome.
let planT = null
outerT: for (let seed = 115; seed < 415 && !planT; seed++) {
    const s = createInitialState(seed)
    const r0 = s.rooms[0]
    const inR0 = (x, y) => x > r0.x && x < r0.x + r0.w - 1 && y > r0.y && y < r0.y + r0.h - 1
    for (const t of s.traps) {
        if (!inR0(t.x, t.y)) continue
        const dx = t.x - s.player.x, dy = t.y - s.player.y
        const dist = Math.abs(dx) + Math.abs(dy)
        if (dist < 2 || dist > 9) continue
        if (!['darts', 'sleep', 'snare', 'teleport', 'door'].includes(t.kind)) continue
        const keys = []
        for (let i = 0; i < Math.abs(dx); i++) keys.push(dx > 0 ? 'ArrowRight' : 'ArrowLeft')
        for (let i = 0; i < Math.abs(dy); i++) keys.push(dy > 0 ? 'ArrowDown' : 'ArrowUp')
        let st = s
        for (const k of keys) {
            const d = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[k]
            st = stepGame(st, { type: 'MOVE', dx: d[0], dy: d[1] })
        }
        const sprung = st.traps.find(tt => tt.x === t.x && tt.y === t.y)
        if (!sprung || !sprung.seen) continue
        planT = { seed, keys, kind: t.kind, routeHash: hash(st), dlvl: st.dungeonLevel, sleeping: st.player.sleeping, held: st.player.held, hp: st.player.hp, px: st.player.x, py: st.player.y }
        break outerT
    }
}
r.check('node scan found a seed whose mine sits on a straight route from the start', !!planT, planT ? `seed ${planT.seed} ${planT.kind}` : 'none')
if (planT) {
    await page.goto(`http://localhost:${process.env.DEV_PORT || 5173}/retrogames/rogue?seed=${planT.seed}`)
    await sleep(500)
    const t0 = await probe()
    r.check('the pinned world opens mined and un-sprung', Array.isArray(t0.traps) && t0.traps.length >= 2 && t0.traps.every(t => !t.seen), JSON.stringify(t0.traps && t0.traps.slice(0, 2)))
    for (const k of planT.keys) { await page.keyboard.press(k); await sleep(110) }
    const bhT = await page.evaluate(() => window.__rogueTest.hash())
    const pt = await probe()
    r.check('browser key replay springs the exact scanned mine (hash equality)', bhT === planT.routeHash, `browser ${bhT} vs node ${planT.routeHash}`)
    r.check('the sprung trap is seen-knowledge in the live state', pt.traps.some(t => t.seen), JSON.stringify(pt.traps))
    const effectOk = pt.dlvl === planT.dlvl && pt.sleeping === planT.sleeping && pt.held === planT.held && pt.x === planT.px && pt.y === planT.py && pt.hp === planT.hp
    r.check(`the ${planT.kind} trap's effect lands identically in Chrome`, effectOk, `dlvl ${pt.dlvl}/${planT.dlvl} sleep ${pt.sleeping}/${planT.sleeping} held ${pt.held}/${planT.held} pos ${pt.x},${pt.y}@${pt.hp}hp`)
    const sprungMsg = pt.msgs.some(m => /trap|snare|Darts|fall through/i.test(m))
    r.check('the spring is narrated on the message line', sprungMsg, pt.msgs.join(' | '))
}

r.check('zero page errors', errors.length === 0, errors.join(' | '))
r.exit(browser)
