// Evolution regression (option 4): does the GA actually learn, and does its HUD render?
//
// Promoted from the throwaway drivers iteration 13/#23 left in scripts/.shots/
// (evo.mjs / evo2.mjs / pixel.mjs). Those were gitignored, so a clean clone lost
// the only way to measure "did the AI regress?".
//
// Usage:
//   npm run evocheck
//   node scripts/evocheck.mjs [--gens 60] [--min-fit 2500] [--trials 1] [--no-hud]
//
//   --gens     generations to fast-forward headlessly per trial (default 60)
//   --min-fit  fail if best fitness after --gens is below this (default 1500)
//   --trials   independent fresh populations (default 1; each wipes localStorage)
//
// Fitness reference (see evoFitness in the engine): distance + coins*10 + bonuses,
// plus 6000 for a flagpole win.
//
// Measured baseline on this machine, COLD start (localStorage cleared, seeded
// population), 60 generations, repeat runs: fitness 1696 / 2102 / 2513 / 2558 /
// 2872 / 2912 / 3160 / 4566, bestCol 103-134, champion replay col 94-122.
// So --min-fit 1500 and col >= 90 are regression floors with headroom, not targets.
// (Piranha plants cost the GA ~25 columns: the pre-plant baseline was ~1980-2820 at
// col 141-147. The wall sensors commit the jump ~4 tiles out, so the agent is already
// descending as it crosses a plant pipe and clips its head — see README.)
//
// Prereqs: `npm install`, a running `npm run dev`.

import { opt, requireDevServer, launch, openMario, Report, URL_DEFAULT } from './lib/harness.mjs'

const args = process.argv.slice(2)
const url = opt(args, '--url', URL_DEFAULT)
const gens = +opt(args, '--gens', 60)
const minFit = +opt(args, '--min-fit', 1500)
const trials = +opt(args, '--trials', 1)
const hudCheck = !args.includes('--no-hud')
const WIN_FITNESS = 6000   // flagpole bonus — reference only; a win is MEASURED by replay, not inferred

await requireDevServer(url)
const browser = await launch()
const page = await openMario(browser, { url })
const r = new Report('evocheck')

let worstFinal = Infinity
let bestCol = 0

for (let trial = 1; trial <= trials; trial++) {
    // Fresh seeded population — deterministic starting point, ignores any
    // genome persisted in localStorage from a previous session.
    await page.evaluate(() => window.__marioTest.evolve())
    await page.evaluate(() => { localStorage.clear(); window.__marioTest.evoReset(); window.__marioTest.evolve() })

    const t0 = Date.now()
    const { hist, s } = await page.evaluate((g) => ({
        hist: window.__marioTest.evoTrain(g),
        s: window.__marioTest.evoState(),
    }), gens)
    const secs = ((Date.now() - t0) / 1000).toFixed(1)

    const final = hist[hist.length - 1] ?? 0
    worstFinal = Math.min(worstFinal, final)
    bestCol = Math.max(bestCol, s.bestCol)

    console.log(`  ..    trial ${trial} (${secs}s) start=${hist[0]} final=${final} bestCol=${s.bestCol}/${gens}gens`)
    console.log(`        fitness/gen: [${hist.join(' ')}]`)
    r.check(`trial ${trial}: fitness climbed past ${minFit}`, final >= minFit, `final=${final}`)
    r.check(`trial ${trial}: learned (fitness at least 1.5x gen-1)`, final > (hist[0] || 1) * 1.5, `${hist[0]} -> ${final}`)

    // Ground truth rather than an inference from the fitness number: replay the
    // champion for one episode and read the state it actually ends in. Fitness can
    // be inflated by coins and bonuses, so ">= 6000 therefore it won" is not evidence.
    const champ = await page.evaluate(() => {
        const g = window.__marioTest.evoBest()
        return g ? window.__marioTest.evoProbe(g) : null
    })
    if (champ) {
        console.log(`        champion replay: maxCol=${champ.maxCol} state=${champ.state} jumps=${champ.jumps}`)
        r.info(`trial ${trial}: flagpole is col 174`,
            champ.state === 'win' ? 'CLEARED 1-1' : `not cleared (reached col ${champ.maxCol})`)
    }
}

// The GA's own HUD is a separate render path from drawHUD(), and it has broken
// before (HiDPI / px() scaling). Sample the internal canvas, not the screenshot:
// top band must be the dark bar, with gold text + red best-ever marker on it.
// NB the backing store is scaled (e.g. 1520x1425 for a 256x240 logical view),
// so the band height has to be scaled too or you sample an empty sliver.
if (hudCheck) {
    const px = await page.evaluate(() => {
        const cv = document.querySelector('canvas')
        const ctx = cv.getContext('2d')
        const bandH = Math.max(1, Math.round(cv.height * 15 / 240))   // HUD band is 15 logical px
        const band = ctx.getImageData(0, 0, cv.width, bandH).data
        const seen = new Set()
        let dark = 0, gold = 0, red = 0
        for (let i = 0; i < band.length; i += 4) {
            const [rr, gg, bb] = [band[i], band[i + 1], band[i + 2]]
            seen.add((rr >> 4) + ',' + (gg >> 4) + ',' + (bb >> 4))
            if (rr < 90 && gg < 90 && bb < 120) dark++
            if (rr > 190 && gg > 150 && bb < 110) gold++
            if (rr > 190 && gg < 130 && bb < 130) red++
        }
        return { w: cv.width, h: cv.height, bandH, colors: seen.size, dark, gold, red }
    })
    r.info('canvas backing store', JSON.stringify(px))
    const bandPx = px.w * px.bandH
    r.check('evolve HUD band is drawn (dark bar)', px.dark > bandPx * 0.5, `darkPx=${px.dark}/${bandPx}`)
    r.check('evolve HUD has gold text/bar', px.gold > 20, `goldPx=${px.gold}`)
    r.check('evolve HUD has red best-ever marker', px.red > 0, `redPx=${px.red}`)
    await page.screenshot({ path: 'scripts/.shots/evocheck.png' }).catch(() => {})
}

r.check('best-ever distance reached the late game (col >= 90)', bestCol >= 90, `bestCol=${bestCol}`)
console.log(`  ..    note: reliable clear of 1-1 needs col >= 174; ${bestCol >= 174 ? 'REACHED' : 'not yet — known open item'}`)

r.exit(browser)
