// Level geometry audit.
//
// Why this exists: 1-3 is built by hand-placing floating platforms over pits, and the
// signature failure of that kind of level is a gap Mario simply cannot make. It is
// completely invisible in a screenshot taken at x=0, and it does not show up as an
// error — the player just falls, forever, in a level that shipped "fine".
//
// So we walk the actual tilemap and assert traversability:
//   - no run of floorless columns longer than a running jump can clear
//   - a chain of landings actually carries Mario from the start to the flagpole
//   - every firebar has the clearance its own arm needs (a firebar that sweeps through
//     a wall is both a visual bug and an unavoidable hit)
//   - every lava pool actually sits over a hole
//   - the flagpole has ground under it
//
// Usage:
//   npm run levelcheck
//   node scripts/levelcheck.mjs [--max-gap 6] [--url <url>]
//
// Prereqs: `npm install`, a running `npm run dev`.

import { opt, requireDevServer, launch, openMario, Report, URL_DEFAULT } from './lib/harness.mjs'

const args = process.argv.slice(2)
const url = opt(args, '--url', URL_DEFAULT)
const MAX_GAP = +opt(args, '--max-gap', 6)      // tiles of floorless run: ~110px of jump
const ROWS = 15

await requireDevServer(url)
const browser = await launch()
const page = await openMario(browser, { url, start: true })
// The update loop only advances the world while playing, so a level loaded straight from
// the attract screen would report five perfectly still firebars.
await page.waitForFunction(() => window.__marioTest.getState().state === 'play', null, { timeout: 20000 })
const r = new Report('levelcheck')

const solid = (t) => t > 0          // EMPTY=0; GROUND/BRICK/QUESTION/SOLID/USED/PIPE are 1..6

// Read the whole tilemap out in one round trip.
async function gridOf(idx) {
    await page.evaluate((i) => window.__marioTest.gotoLevel(i), idx)
    await page.waitForTimeout(250)
    return page.evaluate((ROWS) => {
        const info = window.__marioTest.levelInfo()
        const g = []
        for (let rr = 0; rr < ROWS; rr++) {
            const row = []
            for (let c = 0; c < info.cols; c++) row.push(window.__marioTest.cell(c, rr))
            g.push(row)
        }
        return { info, g }
    }, ROWS)
}

// All rows Mario could stand on in this column: a solid tile with two clear rows above
// it (he is up to 28px tall). A column can have several — ground plus a platform over it.
function surfaces(g, c) {
    const out = []
    for (let rr = 3; rr < ROWS; rr++) {
        if (solid(g[rr][c]) && !solid(g[rr - 1][c]) && !solid(g[rr - 2][c])) out.push(rr)
    }
    return out
}

// Reachability, not "step height". A naive tallest-step-up metric reports 8 tiles on 1-1
// because it compares the ground against a block cluster nobody has to climb — you walk
// under it. What actually matters is whether some chain of landings carries you from the
// start to the flagpole, so search it: from any landing you may reach a landing up to
// REACH columns away and no more than RISE tiles higher (falling anywhere is free).
function reachable(g, cols, flagCol) {
    const REACH = 7, RISE = 5
    const surf = []
    for (let c = 0; c < cols; c++) surf.push(surfaces(g, c))
    const seen = new Set()
    const queue = surf[0].map(rr => [0, rr])
    if (!queue.length) {                       // never spawn-blocked: take the first ground
        for (let c = 1; c < cols && !queue.length; c++) queue.push(...surf[c].map(rr => [c, rr]))
    }
    queue.forEach(q => seen.add(q.join(',')))
    let furthest = 0
    while (queue.length) {
        const [c, rr] = queue.shift()
        furthest = Math.max(furthest, c)
        for (let d = 1; d <= REACH; d++) {
            const nc = c + d
            if (nc >= cols) break
            for (const nr of surf[nc]) {
                if (rr - nr > RISE) continue     // too high to land on
                const key = nc + ',' + nr
                if (seen.has(key)) continue
                seen.add(key); queue.push([nc, nr])
            }
        }
    }
    return { furthest, ok: furthest >= flagCol }
}

for (const idx of [0, 1, 2]) {
    const { info, g } = await gridOf(idx)
    const name = info.id
    r.info(`auditing ${name}`, `bg=${info.bg} cols=${info.cols} flag=${info.flagCol} firebars=${info.firebars}`)

    // 1. floorless runs — a hole wider than a running jump is not difficulty, it is a wall
    let gapStart = -1, worstGap = 0, worstGapAt = -1
    for (let c = 0; c <= info.cols; c++) {
        const standable = c < info.cols ? surfaces(g, c).length > 0 : true
        if (!standable) { if (gapStart < 0) gapStart = c }
        else if (gapStart >= 0) {
            const len = c - gapStart
            if (len > worstGap) { worstGap = len; worstGapAt = gapStart }
            gapStart = -1
        }
    }
    r.check(`${name}: no unjumpable pit (<= ${MAX_GAP} tiles of open floor)`, worstGap <= MAX_GAP,
        worstGap > MAX_GAP
            ? `a ${worstGap}-tile hole at col ${worstGapAt} has nothing to land on`
            : `widest hole ${worstGap} tiles`)

    // 2. the real question: can the level be finished at all?
    const reach = reachable(g, info.cols, info.flagCol)
    r.check(`${name}: reachable start -> flagpole`, reach.ok,
        `furthest reachable column ${reach.furthest} of ${info.flagCol}`)

    // 3. flagpole must have ground under it, or the win sequence never triggers
    if (info.flagCol) {
        const t = surfaces(g, info.flagCol)
        r.check(`${name}: flagpole has ground to land on`, t.some(x => x >= 10 && x <= 13),
            `standable rows under flag = ${JSON.stringify(t)}`)
    }

    // 4. firebar clearance: the arm is len*14 long plus the ball radius
    if (info.bg === 'castle') {
        const bars = await page.evaluate(() => window.__marioTest.bars())
        r.check(`${name}: firebars exist`, bars.length > 0, `${bars.length} placed`)
        let bad = null
        for (const b of bars) {
            // Reach of the arm: the last ball centre sits len*14 out, and the ball itself
            // is 12px across. Measured against the NEAREST point of each tile rect, not the
            // tile's centre or a bounding box — a bounding box flags tiles the arm provably
            // never touches (a len-3 bar at col 31 does not reach the brick at col 28).
            const radius = b.len * 14 + 6
            const pc = b.c * 16 + 8, pr = b.r * 16 + 8
            const c1 = Math.floor((pc - radius) / 16), c2 = Math.floor((pc + radius) / 16)
            const r1 = Math.floor((pr - radius) / 16), r2 = Math.floor((pr + radius) / 16)
            for (let cc = c1; cc <= c2 && !bad; cc++) {
                for (let rr2 = r1; rr2 <= r2 && !bad; rr2++) {
                    if (cc === b.c && rr2 === b.r) continue
                    if (!solid(g[rr2]?.[cc] ?? 0)) continue
                    const nx = Math.max(cc * 16, Math.min(pc, cc * 16 + 16))
                    const ny = Math.max(rr2 * 16, Math.min(pr, rr2 * 16 + 16))
                    if (Math.hypot(pc - nx, pr - ny) <= radius) bad = { b, at: [cc, rr2] }
                }
            }
        }
        r.check(`${name}: every firebar clears the walls`, !bad,
            bad ? `bar at col ${bad.b.c} row ${bad.b.r} (len ${bad.b.len}) sweeps into the tile at ${bad.at[0]},${bad.at[1]}`
                : `${bars.length} bars, all clear`)

        // 5. lava must sit over an actual hole, or it is decoration floating in a wall
        let badLava = null
        for (const [c1, c2] of info.lava) {
            for (let c = c1; c <= c2; c++) if (solid(g[13][c])) badLava = c
        }
        r.check(`${name}: every lava pool sits over a hole`, !badLava && info.lava.length > 0,
            info.lava.length ? `${info.lava.length} pools${badLava !== null ? `, but col ${badLava} is solid` : ''}` : 'no lava declared')

    // 6. and they must actually move — a frozen firebar is an invisible wall you
    //    learn to time, then a level that quietly stops being a castle. Sample after the
    //    play state settles: gotoLevel rebuilds the bars at their phase and the update
    //    loop is frozen during a level intro, so measuring too soon reads five statues
    //    and looks like a broken mechanic rather than a timing artefact.
    await page.waitForFunction(() => window.__marioTest.getState().state === 'play', null, { timeout: 20000 })
        const a1 = await page.evaluate(() => window.__marioTest.bars())
        await page.waitForTimeout(400)
        const a2 = await page.evaluate(() => window.__marioTest.bars())
        const moved = a1.filter((b, i) => Math.abs(a2[i].ang - b.ang) > 0.05).length
        r.check(`${name}: firebars rotate`, moved === a1.length, `${moved}/${a1.length} moving`)
    }
}

// The progression itself: three worlds, and clearing the last one ends the game.
const ids = []
for (const idx of [0, 1, 2]) {
    await page.evaluate((i) => window.__marioTest.gotoLevel(i), idx)
    await page.waitForTimeout(120)
    ids.push(await page.evaluate(() => window.__marioTest.levelInfo().id))
}
r.check('main progression is 1-1 -> 1-3 -> 1-4', ids.join(',') === '1-1,1-3,1-4', ids.join(' -> '))

await page.screenshot({ path: 'scripts/.shots/levelcheck-end.png' }).catch(() => {})
r.exit(browser)
