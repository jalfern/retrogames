// defusecheck.mjs — BOMB DEFUSE game gates (#1800, PLAICRAFT #1711 fifth title).
// Node-first, pure-engine: the game boots, its rules hold, it can be won — and
// this script can fail (break a load-bearing line and watch it go red).
//
// npm run defusecheck
import {
    createGame, step, hash, simState, solvePads, curStep, curWindow, needleOf,
    COLORS, SYNC, CUT, VENT, BOMBS, FUSE0, WINDOW, ZONE_HALF, STRIKE_COST, SURGE_COST, NICK_COST, INTRO,
} from '../src/games/BombDefuse/engine.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
let pass = 0, fail = 0
const ok = (cond, name, info = '') => {
    if (cond) { pass++; console.log(`  ok   ${name}`) }
    else { fail++; console.log(`  FAIL ${name}${info ? ` — ${info}` : ''}`) }
}
const drain = (g) => { const e = [...g.events]; g.events.length = 0; return e }
const ev = (g, k) => drain(g).some(f => f.k === k)
const drive = (g, pads) => { step(g, pads); return drain(g) }

console.log('\n— boot & layout —')
{
    const g = createGame(7, 2)
    ok(g.tick === 0 && !g.done && g.fuse === FUSE0[0], 'createGame boots live at full fuse')
    ok(g.bombs.length === BOMBS && g.bombs.every((b, i) => b.steps.length === [3, 4, 5][i]), 'three bombs carry 3/4/5 steps')
    ok(curStep(g).kind === SYNC, 'first step teaches SYNC')
    ok(g.bombs.every(b => b.steps.every((s, i) => i === 0 || s.kind !== b.steps[i - 1].kind)), 'no two same-kind steps in a row')
    const a = createGame(7, 2), b = createGame(7, 2)
    ok(hash(a) === hash(b), 'same seed → identical initial hash')
    ok(hash(createGame(8, 2)) !== hash(a), 'different seed → different initial hash')
    ok(createGame(7, 5).players === 2 && createGame(7, 0).players === 1, 'players clamps to 1..2')
}

console.log('\n— SYNC —')
{
    const g = createGame(7, 2)
    for (let i = 0; i < INTRO; i++) drive(g, [{ a: true }, { a: true }])
    ok(g.keys.every(k => !k) && g.step === 0, 'intro guard: presses during READ-STEP are ignored')
    drive(g, [{ a: true }, {}])
    ok(g.keys[0] && !g.keys[1], 'one key latches turned (key stays turned)')
    for (let i = 0; i <= curWindow(g); i++) drive(g, [{}, {}])
    ok(g.strikes === 1 && g.keys.every(k => !k), 'slow partner: window expires -> strike, keys reset')
    ok(g.fuse === FUSE0[0] - (INTRO + 1 + curWindow(g) + 1) - STRIKE_COST, `strike costs exactly ${STRIKE_COST}f`, `fuse=${g.fuse}`)
    drive(g, [{ a: true }, { a: true }])
    ok(g.step === 1, 'both keys together clear the step')
}

console.log('\n— CUT —')
{
    const g = createGame(7, 2)
    while (!g.done && curStep(g).kind !== CUT) drive(g, solvePads(g))
    ok(!g.done && curStep(g).kind === CUT, 'a CUT step is reachable')
    while (g.intro > 0) drive(g, [{}, {}])
    const target = curStep(g).color
    ok(COLORS[target] !== undefined, 'cut target is a known color')
    drive(g, [{ up: true }, { up: true }]) // walk both arms to RED (sel=1)
    const selNow = g.sel[0]
    const wrong = (target + 1) % COLORS.length
    g.sel = [wrong, wrong]
    const fuseBefore = g.fuse
    const nickFx = drive(g, [{ a: true }, { a: true }])
    ok(nickFx.filter(f => f.k === 'nick').length === 2 && g.fuse === fuseBefore - 2 * NICK_COST - 1 && g.strikes === 0, 'both blades nicking wrong wire cost −2 s each, never a strike')
    g.sel = [target, target]
    drive(g, [{ a: true }, {}])
    ok(g.armed[0] && !g.armed[1], 'one blade arms on the right color')
    for (let i = 0; i <= curWindow(g) + 1; i++) drive(g, [{}, {}])
    ok(g.strikes === 1 && g.armed.every(a => !a), 'stale window closes with a strike, blades disarm')
    g.sel = [target, target]
    const cutFx = drive(g, [{ a: true }, { a: true }])
    ok(cutFx.some(f => f.k === 'cut') && g.score >= 50, 'both blades on target cut the wire')
}

console.log('\n— VENT —')
{
    const g = createGame(7, 2)
    while (!g.done && curStep(g).kind !== VENT) drive(g, solvePads(g))
    ok(!g.done, 'a VENT step is reachable')
    while (g.intro > 0) drive(g, [{}, {}])
    const holder = curStep(g).holder
    const worker = 1 - holder
    const fuseBefore = g.fuse
    step(g, [{}, {}]); drain(g)
    ok(g.fuse === fuseBefore - 2, 'unvented pressure burns the fuse double', `Δ=${fuseBefore - g.fuse}`)
    let fuse2 = g.fuse
    step(g, [{ b: holder === 0 }, { b: holder === 1 }]); drain(g)
    ok(g.fuse === fuse2 - 1, 'bar pinned returns to single drain')
    g.needleT = 0; g.phase = 0; g.zone = 0 // aim the gauge at a known crossing
    const zoneSave = g.zone
    g.zone = 1000 // far off target for the whiff gate
    const dudFx = drive(g, [{ a: worker === 0 }, { a: worker === 1 }])
    ok(dudFx.some(f => f.k === 'dud') && g.strikes === 0 && g.step < g.bombs[g.bomb].steps.length, 'whiffed seat is a dud, not a strike')
    g.zone = zoneSave
    // seat while NOT held -> surge
    const pre = g.fuse
    g.needleT = 0; g.phase = 0
    g.zone = needleOf(g) // put the zone exactly under the needle
    const surgeFx = drive(g, [{ a: worker === 0, b: false }, { a: worker === 1, b: false }])
    ok(surgeFx.some(f => f.k === 'surge') && g.fuse === pre - SURGE_COST - 2, `seating without the bar surges (−${SURGE_COST}f + that tick's double drain)`, `Δ=${pre - g.fuse}`)
    // seat WITH the bar -> sealed
    const stepBefore = g.step
    const sealFx = drive(g, [{ a: worker === 0, b: holder === 0 }, { a: worker === 1, b: holder === 1 }])
    ok(sealFx.some(f => f.k === 'sealed') && (g.step !== stepBefore || g.bomb > 0), 'held bar + on-target seat seals the step')
}

console.log('\n— fuse ledger & boom —')
{
    const g = createGame(7, 2)
    g.fuse = 3
    while (!g.done && g.fuse > 0) drive(g, [{}, {}])
    ok(g.done && !g.won, 'zero fuse is a boom, not a win')
    const frozenTick = g.tick
    step(g, [{ a: true }, { a: true }])
    ok(g.tick === frozenTick, 'done is stable — further ticks no-op')
}

console.log('\n— winnable + replay —')
{
    let wins = 0
    for (let s = 1; s <= 40; s++) {
        const g = createGame(s, 2)
        let guard = 0
        while (!g.done && guard++ < 40000) { const pads = solvePads(g); step(g, pads); drain(g) }
        if (g.done && g.won) wins++
    }
    ok(wins === 40, 'solver wins 40/40 seeds', `${wins}/40`)
    // recorded-pad replay: hash checkpoints every 30 ticks (the rec/v1 law)
    const g1 = createGame(7, 2)
    const pads = []
    const checks = []
    while (!g1.done && g1.tick < 9000) {
        const p = solvePads(g1)
        step(g1, p); drain(g1)
        pads.push(p)
        if (g1.tick % 30 === 0) checks.push([g1.tick, hash(g1)])
    }
    checks.push([g1.tick, hash(g1)])
    const g2 = createGame(7, 2)
    let diverge = -1
    pads.forEach((p, i) => {
        step(g2, p); drain(g2)
        const t = i + 1
        const chk = checks.find(c => c[0] === t)
        if (chk && hash(g2) !== chk[1] && diverge < 0) diverge = t
    })
    ok(diverge === -1, 'recorded pad streams replay hash-equal at every checkpoint')
    ok(checks.length > 20, `checkpoint density sane (${checks.length} checks)`)
}

console.log('\n— slack rule (levels survive reduced supplies) —')
{
    // every extra surge the winners never spend: −600 f preloaded per bomb.
    let wins = 0
    for (let s = 1; s <= 20; s++) {
        const g = createGame(s, 2)
        g.bombs.forEach(b => { b.fuse0 = Math.max(600, b.fuse0 - 600) })
        g.fuse = Math.max(600, g.fuse - 600)
        let guard = 0
        while (!g.done && guard++ < 40000) { const pads = solvePads(g); step(g, pads); drain(g) }
        if (g.done && g.won) wins++
    }
    ok(wins === 20, 'solver still wins with 10 s less fuse per bomb', `${wins}/20`)
    // window slack: solver follow offsets must fit inside the smallest window
    ok(WINDOW[2] > 8 + 13, `tightest window ${WINDOW[2]}f outlives the solver's worst lead+follow (≤21f)`)
}

console.log('\n— hash law —')
{
    const g = createGame(7, 2)
    ok(Number.isInteger(hash(g)) && hash(g) >= 0 && hash(g) <= 0xffffffff, 'hash is uint32')
    const base = hash(g)
    const mutations = [
        gg => { gg.keys[0] = true }, gg => { gg.armed[1] = true }, gg => { gg.zone += 1 },
        gg => { gg.needleT += 1 }, gg => { gg.sel[0] = 1 }, gg => { gg.strikes += 1 },
        gg => { gg.fuse -= 1 }, gg => { gg.intro -= 1 }, gg => { gg.held = true },
    ]
    let diffs = 0
    for (const m of mutations) { const h = createGame(7, 2); m(h); if (hash(h) !== base) diffs++ }
    ok(diffs === mutations.length, 'every load-bearing field moves the hash', `${diffs}/${mutations.length}`)
    const src = readFileSync(join(here, '../src/games/BombDefuse/engine.js'), 'utf8')
    const hashBody = src.slice(src.indexOf('export function hash'))
    ok(!/Math\.sin/.test(hashBody), 'hashed state never touches Math.sin at replay time (integer sine table — #1793 law)')
    ok(!/Math\.random/.test(src.slice(0, src.indexOf('solvePads'))), 'no Math.random reaches the sim (solver section boundary clean)')
}

console.log('\n— solo partner —')
{
    const g = createGame(7, 1) // SYNC is step 0 by construction
    let guard = 0
    while (!g.keys[1] && guard++ < 300) drive(g, [{}])
    ok(g.keys[1], 'solo partner leads the key turn when the human stalls')
    drive(g, [{ a: true }])
    ok(g.step === 1, 'human joining inside the window clears it')
}

console.log('\n— contract + spine wiring (static pins) —')
{
    const jsx = readFileSync(join(here, '../src/games/BombDefuse/index.jsx'), 'utf8')
    for (const need of ['exposeGame(spec)', 'unexposeGame()', 'armLiveCapture(spec)', 'initAutoRecord()', 'askConsent()', 'beginRun()', 'endRun()', 'recordLiveTick(pads)', 'contractHoldsLoop()', 'seedFromQuery()', 'exposeFeedbackState', 'recordVoiceCmd', '__bdTest', 'mountDbg']) {
        ok(jsx.includes(need), `index.jsx wires ${need}`)
    }
    const reg = readFileSync(join(here, '../src/config/games.js'), 'utf8')
    ok(reg.includes("path: '/bomb-defuse'") && reg.includes("label: 'BOMB DEFUSE'") && reg.includes("visibility: 'private'"), 'registry: private /bomb-defuse entry')
    const cg = readFileSync(join(here, 'lib/contractGames.mjs'), 'utf8')
    ok(cg.includes("id: 'bomb-defuse'") && cg.includes("'bomb-defuse': (i) =>"), 'contractGames lists bomb-defuse + a driver pattern')
}

console.log(`\ndefusecheck: ${pass}/${pass + fail} gates`)
process.exit(fail ? 1 : 0)
