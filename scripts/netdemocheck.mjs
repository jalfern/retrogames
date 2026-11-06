// netdemocheck — Node gates for the net-driven attract demo (#1641):
// plaicraft-bc/v1 sits seat 2 of the attract game and PLAYS it live beside
// the reactive expert pilot — no plan(), no script replay. The demo's caption
// on screen claims HELD-OUT 8/8, so the gates re-run every held-out seed
// through the shipped driver: a claim on screen a check cannot re-prove is
// the lie this file exists to catch. This does NOT re-score the model (no
// selection happens here — the weights are frozen, shipped, and the same
// claim already lives in data/plaicraft/results.json); it proves the demo
// keeps the promise on the exact boards the attract cycles.
//
// Proves: the driver boots net-seated, cycles the held-out board, all 8
// seeds win, the seat provably moves the sim (dead weights diverge), the
// run is deterministic, a throwing policy falls back (sticky) while the
// planner replay route still completes, and the shell's honesty glue —
// caption switch, demo-win banner, finish() guard, select-seat guard — is
// where the issue says it must be.
//
// Usage: npm run netdemocheck

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { step, stateHash } from '../src/games/Gauntlet/sim.js'
import { plan } from '../src/games/Gauntlet/planner.js'
import { createModelPolicy } from '../src/games/Gauntlet/model.js'
import { createNetDemo, DEMO_SEEDS } from '../src/games/Gauntlet/netdemo.js'
import { HELDOUT_SEEDS } from './plaicraft-export.mjs'
import { POLICY } from '../src/games/Gauntlet/policy.js'
const attract = await import('../src/games/Gauntlet/attract.js')

const ok = []
const check = (name, cond, info = '') => { ok.push(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); return cond }
const src = (p) => readFileSync(resolve(p), 'utf8')

const jsx = src('src/games/Gauntlet/index.jsx')

// Drive one demo run to the end through THE shipped driver (same call sites
// the browser loop uses): returns the finished state and the tick count.
function driveDemo(seed, opts = {}) {
    const demo = createNetDemo(opts)
    const gs = demo.newGame(seed)
    while (!gs.end && gs.tick < 30000) {
        const d = demo.advance(gs)
        if (!d) return { gs, broken: demo.broken }
        step(gs, d.inp, d.pInp)
        gs.events.length = 0
    }
    return { gs, broken: demo.broken }
}

// 1 — the board matches the pipeline: the demo cycles the very seeds the
// 8/8 claim was made on, and the claim's own record exists.
check('demo seeds mirror the held-out set', JSON.stringify(DEMO_SEEDS) === JSON.stringify(HELDOUT_SEEDS), DEMO_SEEDS.join(','))
{
    const results = JSON.parse(src('data/plaicraft/results.json'))
    const h = results.rollout.heldout
    check('the on-screen 8/8 claim matches results.json', h.wins.model === h.wins.of && h.wins.of === DEMO_SEEDS.length,
        `recorded ${h.wins.model}/${h.wins.of}`)
}

// 2 — boots net-seated; newGame cycles the whole board; a pinned seed wins.
{
    const d = createNetDemo()
    const seeds = []
    for (let i = 0; i < DEMO_SEEDS.length; i++) { const gs = d.newGame(); check(`cycle seed ${i}`, gs.seed === DEMO_SEEDS[i] && d.seed === DEMO_SEEDS[i], `gs ${gs.seed} demo ${d.seed}`); seeds.push(gs.seed) }
    const pinned = d.newGame(7)
    check('newGame(seed) pins a board', pinned.seed === 7)
    const gs = createNetDemo().newGame()
    check('demo boots with the brain seated', gs.partnerOn === true && gs.partnerMode === 'model' && gs.topDown === true && !!gs.partner)
}

// 3 — the seat is REAL play: the net moves its hero around (a scripted pad
// stream could not be re-deciding), and it is the net specifically — swap in
// dead weights and the world diverges; run it twice and it does not.
{
    const demo = createNetDemo()
    const gs = demo.newGame(101)
    let px = gs.partner.x, py = gs.partner.y
    let dist = 0, swings = 0
    // first blood lands between tick ~400 and ~2100 across the board, so the
    // honest window is the whole opening level, not 600 ticks.
    while (gs.tick < 6000 && !gs.end) {
        const d = demo.advance(gs)
        if (!d) break
        step(gs, d.inp, d.pInp)
        dist += Math.hypot(gs.partner.x - px, gs.partner.y - py); px = gs.partner.x; py = gs.partner.y
        if (d.pInp && d.pInp.sword) swings++
        gs.events.length = 0
    }
    check('net partner moves and swings (seed 101)', dist > 10 && swings > 0, `moved ${dist.toFixed(1)} cells, ${swings} swing pulses`)
    const h1 = driveDemo(101, {}).gs
    const hash1 = stateHash(h1)
    const dead = { arch: POLICY.arch, w: POLICY.w.map(() => 0), b: POLICY.b.map(() => 0) }
    const h2 = driveDemo(101, { createPolicy: () => createModelPolicy(dead) }).gs
    check('the net (not the sim alone) steers the board', stateHash(h2) !== hash1, `net vs dead weights diverge at ${h1.tick}/${h2.tick}`)
}

// 4 — determinism: same seed, same brains, tick-for-tick identical worlds.
{
    const a = driveDemo(100).gs, b = driveDemo(100).gs
    check('demo runs are deterministic (seed 100)', stateHash(a) === stateHash(b) && a.tick === b.tick, `tick ${a.tick}, hash ${stateHash(a).slice(0, 12)}`)
}

// 5 — the claim on screen: every held-out seed the attract cycles ends in a
// WIN through the shipped driver. This is the honesty gate for the ticker.
for (const seed of DEMO_SEEDS) {
    const { gs, broken } = driveDemo(seed)
    check(`net demo wins seed ${seed}`, !broken && gs.end === 'win', `tick ${gs.tick}, lvl ${gs.level + 1}, score ${gs.score}`)
}

// 6 — fallback: a policy that throws marks the demo broken (sticky, no
// flapping), and the planner replay the shell falls back to still completes.
{
    let calls = 0
    const flaky = { name: 'throw/v1', reset() { calls = 0 }, decide() { calls++; if (calls > 150) throw new Error('simulated seat failure'); return { left: false, right: false, up: false, down: false, a: false } } }
    const demo = createNetDemo({ createPolicy: () => flaky })
    const gs = demo.newGame(100)
    let got = 0, nulls = 0
    while (got + nulls < 400 && !gs.end) {
        const d = demo.advance(gs)
        if (d) { got++; step(gs, d.inp, d.pInp); gs.events.length = 0 } else nulls++
    }
    check('throwing policy breaks the route (got pads first, then null forever)', got >= 100 && nulls > 0 && demo.broken && demo.advance(gs) === null, `${got} ticks driven before the throw`)
    check('broken stays broken past reseat attempts', (() => { demo.newGame(101); return demo.advance(gs) === null })())
    const run = plan(2, { topDown: true, maxTicks: 60000 })
    check('planner-replay fallback still completes the quest', run.won && run.script.length > 0, `${run.script.length} ticks`)
}

// 7 — honesty chrome in the shell: caption swaps when the route breaks, the
// victory banner exists, demo ends never reach the player's GAME OVER /
// hi-score path, and leaving attract never carries the demo's brain seat.
check('shell drives through createNetDemo', /createNetDemo\(/.test(jsx) && /netDemo\.newGame\(\)/.test(jsx))
check('caption switches on the route (net lines only while net drives)', /netDemo\.broken \? INFO_MSGS : NET_MSGS/.test(jsx))
check('victory banner lives in the attract draw', /NET CLEARS THE QUEST!/.test(jsx))
check('finish() ignores attract/select endings (no fake hi-scores)', /const finish = \(win\) => \{[\s\S]{0,400}scr === 'attract' \|\| scr === 'select'/.test(jsx))
check('leaving attract drops the demo seat', /screenRef\.current === 'attract' && pm === 'model'/.test(jsx))
check('fallback reaches the planner script', /netDemo\.advance\(gs\)[\s\S]{0,220}provenRun\(\)/.test(jsx))
check('DEV reset clears the demo route', /netDemo\.reset\(\)/.test(jsx))

// 8 — the route is planner-free by construction: netdemo.js imports the
// reactive pilot and the model, never plan().
{
    const nd = src('src/games/Gauntlet/netdemo.js')
    const code = nd.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
    check('netdemo.js never imports plan()', !/import\s*\{[^}]*\bplan\b[^}]*\}/.test(code) && !/\bplan\s*\(/.test(code))
    check('netdemo.js emits pads only — it never steps the sim', !/\bstep\s*\(/.test(code) && /import \{ makeGame \} from '\.\/sim\.js'/.test(code))
}

// 9 — attract copy: net lines join only the NET list (the default frame the
// fallback draws still cycles exactly INFO_MSGS), every net line fits, and
// nothing new enters the HUD band.
{
    const { attractFrame, INFO_MSGS, NET_MSGS, HOLD, HUD } = attract
    const CW = 320, CH = 240
    check('NET_MSGS extends INFO_MSGS with the brain lines', NET_MSGS.length === INFO_MSGS.length + 2 && NET_MSGS.includes('BC NET PLAYS SEAT 2') && NET_MSGS.includes('HELD-OUT 8/8 WINS'))
    check('net lines fit one short line', [...NET_MSGS].every((s) => s.length <= 28))
    const span = HOLD * NET_MSGS.length + 5
    const seen = new Set(); let overHud = 0
    for (let t = 0; t < span; t++) for (const l of attractFrame(t, CW, CH, HUD, 0, NET_MSGS)) {
        if (INFO_MSGS.includes(l.text) || ['BC NET PLAYS SEAT 2', 'HELD-OUT 8/8 WINS'].includes(l.text)) seen.add(l.text)
        if (l.y + l.size > CH - HUD) overHud++
    }
    check('the net ticker cycles every message', seen.size === NET_MSGS.length, `${seen.size}/${NET_MSGS.length}`)
    check('no net line enters the HUD band', overHud === 0, `${overHud}`)
    const fallbackSeen = new Set()
    for (let t = 0; t < HOLD * INFO_MSGS.length + 5; t++) for (const l of attractFrame(t, CW, CH, HUD, 0)) fallbackSeen.add(l.text)
    check('default frame stays INFO_MSGS (fallback never claims the brain)',
        !fallbackSeen.has('BC NET PLAYS SEAT 2') && !fallbackSeen.has('HELD-OUT 8/8 WINS'))
}

// 10 — #1655 polish: the attract camera looks at the NET (periodic pull to
// seat 2), the demo win gets its own stamp (seed · ticks · research name) and
// sting, the ticker pauses under the banner (#365), and select explains the
// dropped brain seat instead of changing silently.
{
    const { netPull, viewRect } = await import('../src/games/Gauntlet/minimap.js')
    const { W, H } = await import('../src/games/Gauntlet/levels.js')
    const clampX = (v) => Math.max(0, Math.min(W * 16 - 256, v)), clampY = (v) => Math.max(0, Math.min(H * 16 - 200, v))
    check('focus is idle at rest, at window end, at cycle end', netPull(0) === 0 && netPull(240) === 0 && netPull(599) === 0)
    check('focus peaks mid-window at the peak', Math.abs(netPull(120) - 0.5) < 1e-9, `${netPull(120)}`)
    check('focus is symmetric and smooth (sin in/out)', Math.abs(netPull(60, 3, -2) - netPull(180, 3, -2)) < 1e-9 && netPull(100, 3, -2) > netPull(40, 3, -2))
    let maxPull = 0
    for (let t = 0; t < 2400; t++) maxPull = Math.max(maxPull, netPull(t, 3, -2))
    check('focus never exceeds the peak (hero stays framed)', maxPull <= 0.5 + 1e-9, `max ${maxPull.toFixed(3)}`)
    check('wide pair gets no focus (a pan could push a hero off)', netPull(120, 15, 0) === 0 && netPull(120, 0, 14) === 0)
    check('viewRect(pull=0) is the exact old camera', viewRect({ x: 20, y: 20 }, { x: 24, y: 24 }, 0).camX === viewRect({ x: 20, y: 20 }, { x: 24, y: 24 }).camX)
    const p1 = viewRect({ x: 20, y: 20 }, { x: 24, y: 24 }, 1)
    check('viewRect(pull=1) centres the window on the partner', p1.camX === clampX(24 * 16 - 128) && p1.camY === clampY(24 * 16 - 200), `cam ${p1.camX},${p1.camY}`)
    check('sim bounds still use the plain camera (pan never moves a wall)', /viewBounds\(viewRect\(gs\.hero, gs\.partner\)\)/.test(src('src/games/Gauntlet/sim.js')))
    check('attract camera pulls only for the live net demo', /screenRef\.current === 'attract' && !net\.role && !netDemo\.broken[\s\S]{0,220}netPull\(/.test(jsx))
    check('view and side-map share the same focus call', (jsx.match(/viewRect\(gs\.hero, gs\.partner, demoFocus\(\)\)/g) || []).length === 2)
    check('the demo win plays its own sting', /demoWin = 240[\s\S]{0,300}DEMO_STING/.test(jsx))
    const { DEMO_STING, STAIRS_FANFARE } = await import('../src/games/Gauntlet/sound.js')
    check('the sting is not the stairs fanfare (demo ≠ game by ear)', DEMO_STING.join() !== STAIRS_FANFARE.join() && DEMO_STING.length === 5, DEMO_STING.join(','))
    check('victory stamp names seed, ticks and the net', /SEED \$\{netDemo\.seed\} · \$\{gs\.tick\.toLocaleString\('en-US'\)\} TICKS · \$\{bcModel\.name\}/.test(jsx))
    check('the cycling ticker pauses while the banner is up', /demoWin > 0 && !l\.blink && !l\.text\.startsWith\('HI-SCORE'\)/.test(jsx))
    check('select explains the dropped brain seat', /demoBrainDropped = true/.test(jsx) && /PRESS M TO SEAT IT/.test(jsx))
}

console.log(ok.join('\n'))
const fails = ok.filter((l) => l.startsWith('FAIL')).length
console.log(`${ok.length - fails}/${ok.length} gates pass`)
process.exit(fails ? 1 : 0)
