// Genome diagnostic: run ONE episode with a specific controller and report how
// far it gets. This is the scalpel for "why does the AI die at column N?".
//
// Promoted from scripts/.shots/ (probe.mjs + seed.mjs + trace.mjs), which were
// gitignored and therefore invisible to anyone not sitting at this machine.
//
// Usage:
//   npm run evoprobe                       # all named presets, then the best genome
//   npm run evoprobe -- --preset pitwide-run --trace
//   npm run evoprobe -- --random 5
//   npm run evoprobe -- --best --trace
//   npm run evoprobe -- --gens 80          # train first, then probe the winner
//
// Prereqs: `npm install`, a running `npm run dev`.
//
// ---- controller reference (see evoSense/forwardNN in the engine) ------------
// Weights are a flat Float64Array, NI inputs -> NH recurrent hidden -> NO outputs:
//   hidden k, input i : k*NI + i
//   recurrent  k, j   : NI*NH + k*NH + j
//   hidden bias k     : NI*NH + NH*NH + k
//   output o, hidden k: NI*NH + NH*NH + NH + o*NH + k
//   output bias o     : ... + NH*NO + o
// Outputs: 0=left 1=right 2=run 3=jump 4=fire
// Inputs:  0=onGround 1=vy 2=vx 3=power 4..7=ground at +2/+4/+6/+8
//          8=pit ahead 9,10,11=wall at +1/+2/+4 12=wall height
//          13=enemy present 14=enemy proximity 15=enemy dy 16=enemy direction
//          17=enemy directly above 18=coin/powerup proximity 19=progress to flag
//          20=enemy is stompable right now
// ------------------------------------------------------------------------------

import { opt, requireDevServer, launch, openMario, Report, URL_DEFAULT } from './lib/harness.mjs'

const args = process.argv.slice(2)
const url = opt(args, '--url', URL_DEFAULT)
const only = opt(args, '--preset')
const nRandom = opt(args, '--random', null)
const probeBest = args.includes('--best') || (!only && nRandom === null)
const gens = opt(args, '--gens', null)
const wantTrace = args.includes('--trace')

// idx(l, o) helpers built from the live evoState() so this survives a net resize.
const layout = ({ NI, NH, NO }) => {
    const bi = NI * NH, bh = bi + NH * NH, bo = bh + NH, ob = bo + NH * NO
    return {
        NI, NH, NO, bi, bh, bo, ob, WLEN: ob + NO,
        in: (i, k = 0) => k * NI + i,
        out: (o, k = 0) => bo + o * NH + k,
        hbias: (k) => bh + k,
        obias: (o) => ob + o,
    }
}

// Named controllers. Each returns { weightIndex: value }; everything else is 0.
const PRESETS = {
    'always-right-jump': L => ({
        [L.obias(1)]: 3, [L.obias(2)]: 3, [L.obias(3)]: 3, [L.obias(0)]: -3,
    }),
    'early-jump-walk': L => ({
        [L.in(8)]: 3, [L.in(10)]: 3, [L.in(11)]: 3, [L.in(20)]: 3, [L.in(17)]: 2,
        [L.hbias(0)]: -1.8, [L.out(3, 0)]: 3.5,
        [L.obias(3)]: -1, [L.obias(1)]: 2, [L.obias(0)]: -2, [L.obias(2)]: 0,
    }),
    'early-jump-run': L => ({
        [L.in(8)]: 3, [L.in(10)]: 3, [L.in(11)]: 3, [L.in(20)]: 3, [L.in(17)]: 2,
        [L.hbias(0)]: -1.8, [L.out(3, 0)]: 3.5,
        [L.obias(3)]: -1, [L.obias(1)]: 2, [L.obias(0)]: -2, [L.obias(2)]: 1.5,
    }),
    // Widens the pit lookahead (+2/+4) so the jump commits earlier on the
    // 3-tile pits in the late pipe corridor — the section that caps reliable clears.
    'pitwide-run': L => ({
        [L.in(8)]: 3.5, [L.in(4)]: 1.5, [L.in(5)]: 2, [L.in(10)]: 3, [L.in(11)]: 3.5,
        [L.in(20)]: 3, [L.in(17)]: 2,
        [L.hbias(0)]: -2, [L.out(3, 0)]: 3.5,
        [L.obias(3)]: -1, [L.obias(1)]: 2, [L.obias(0)]: -2, [L.obias(2)]: 2,
    }),
}

await requireDevServer(url)
const browser = await launch()
const page = await openMario(browser, { url })
const r = new Report('evoprobe')

const meta = await page.evaluate(() => { window.__marioTest.evolve(); return window.__marioTest.evoState() })
const L = layout(meta)
console.log(`  ..    net ${meta.NI}->${meta.NH}(recurrent)->${meta.NO}  WLEN=${meta.WLEN}`)

const build = (spec) => { const w = new Array(L.WLEN).fill(0); for (const [k, v] of Object.entries(spec)) w[k] = v; return w }

const show = (name, res) => {
    console.log(`  ..    ${name.padEnd(20)} maxCol=${String(res.maxCol).padStart(3)}  state=${String(res.state).padEnd(8)}  jumps=${res.jumps}  steps=${res.epSteps}`)
    return res
}

const probe = async (name, w) => {
    const res = await page.evaluate((g) => window.__marioTest.evoProbe(g), w || null)
    const out = show(name, res)
    if (wantTrace && out.trace?.length) {
        console.log('        trace [col,y,vy,onGround]:')
        console.log('        ' + out.trace.map(t => t.join(',')).join('  '))
    }
    return out
}

let anyRan = false
const names = only ? [only] : Object.keys(PRESETS)
for (const n of names) {
    if (!PRESETS[n]) { console.error(`unknown preset "${n}". known: ${Object.keys(PRESETS).join(', ')}`); await browser.close(); process.exit(1) }
    await probe(n, build(PRESETS[n](L)))
    anyRan = true
}

// Random controllers: the sanity floor. If these ever reach far, fitness is broken.
for (let i = 0; i < +(nRandom || 0); i++) { await probe(`random ${i + 1}`, null); anyRan = true }

// The evolved champion, optionally after fresh training.
if (probeBest) {
    if (gens) {
        console.log(`  ..    training ${gens} generations...`)
        const hist = await page.evaluate(g => window.__marioTest.evoTrain(g), +gens)
        console.log(`        fitness/gen: [${hist.join(' ')}]`)
    }
    const best = await page.evaluate(() => window.__marioTest.evoBest())
    if (best) { const res = await probe('BEST (evolved)', best); r.check('evolved champion survives 1-1', res.state === 'play' || res.state === 'win', `state=${res.state}`) }
    else console.log('  ..    no persisted best genome yet — train first (--gens N)')
    anyRan = true
}

if (!anyRan) console.error('nothing to do — pass --preset / --random N / --best')
r.check('probe harness is functional', anyRan)
r.exit(browser)
