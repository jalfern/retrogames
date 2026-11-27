// centipedadrive (#3604) — real Chrome, real keys: the menagerie on the live
// page. The attract opens, a key starts the run, arrows drive the zapper, a
// swept volley calls the flea out of the sky — all through the browser's own
// event path. Then the determinism rollout: with the game's own rAF loop
// parked behind the pause key (one driver, per the Zork lesson), two identical
// seeded drives of the contract clock answer identically — every spawn dice
// (spider side, scorpion side, flea dir, rain cells) rides the run's stream.
// centipedechek owns the rule tables; this proves the browser half.
import { launch, openGame, Report, requireDevServer } from './lib/harness.mjs'

const BASE = `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/centipede`
const rep = new Report('centipedadrive')
await requireDevServer(BASE)
const browser = await launch()
const page = await openGame(browser, { url: `${BASE}?seed=4242`, hook: '__game', wait: 600 })
let errors = 0
page.on('pageerror', () => errors++)

const s = () => page.evaluate(() => window.__game.state())

// ---- contract live; key starts; real arrows drive ----
{
    const a0 = await s()
    rep.check('contract live at boot', !!a0 && typeof a0.tick === 'number' && a0.segments === 10,
        `tick ${a0?.tick}, segs ${a0?.segments}`)
}
await page.keyboard.press('KeyX')
await new Promise((r) => setTimeout(r, 250))
{
    const a1 = await s()
    rep.check('key starts a seeded run (score 0, 3 lives, 40 caps)', a1.score === 0 && a1.lives === 3 && a1.mushrooms === 40 && a1.segments === 10,
        `score ${a1.score}, lives ${a1.lives}, shrooms ${a1.mushrooms}, segs ${a1.segments}`)
}
const x0 = (await s()).playerX
await page.keyboard.down('ArrowRight')
await new Promise((r) => setTimeout(r, 350))
await page.keyboard.up('ArrowRight')
const x1 = (await s()).playerX
rep.check('held ArrowRight drives the zapper', x1 > x0 + 20, `${x0} -> ${x1}`)
await page.keyboard.down('ArrowLeft')
await new Promise((r) => setTimeout(r, 350))
await page.keyboard.up('ArrowLeft')
const x2 = (await s()).playerX
rep.check('held ArrowLeft drives it back', x2 < x1 - 20, `${x1} -> ${x2}`)

// ---- the flea answers the sky: sweep the pad and volley ----
// Real keys only: walk the strip firing so some shot crosses an empty column
// and flies out of the garden. The summon must answer within the sweep.
let fleaSeen = 0
for (let leg = 0; leg < 14 && !fleaSeen; leg++) {
    const key = leg % 2 ? 'ArrowLeft' : 'ArrowRight'
    await page.keyboard.down(key)
    for (let k = 0; k < 26 && !fleaSeen; k++) {
        await page.keyboard.press('Space')
        await new Promise((r) => setTimeout(r, 60))
        fleaSeen = (await s()).flea
    }
    await page.keyboard.up(key)
}
rep.check('a sky shot summons the flea (real Space, swept columns)', fleaSeen === 1, `flea=${fleaSeen}`)

// ---- determinism rollout through the whole menagerie ----
// Park the game's own loop with '?' (the pause gate skips update(); the
// contract step drives the sim alone), then two identical seeded drives of
// scripted pads must answer identically — including what was SEEN en route
// (a spider that visited and was shot leaves the end-state silent).
await page.keyboard.press('?') // pauses (Shift+Slash; e.key === '?')
await new Promise((r) => setTimeout(r, 120))
const ROLLOUT = 2000
const drive = () => page.evaluate(async (n) => {
    window.__game.reset(4242)
    const t0 = window.__game.state().tick
    let seenSpider = 0, seenScorpion = 0, seenFlea = 0, minShrooms = 999, rained = 0
    let seenPops = 0, maxPops = 0 // #3620 kill-pop juice rides the same proof
    let maxWave = 0, maxRearSpd = 1 // #3631 the ladder must visibly climb in-browser
    let seenPoison = 0 // venom must LAND en route — faster waves get it eaten sooner
    let lastM = window.__game.state().mushrooms
    for (let i = 0; i < n; i++) {
        // Fire on the right-sweeps only: the left-sweeps glide so the
        // scorpion can survive long enough to venomise caps (#3631 pacing).
        const pad = { right: i % 240 < 120, left: i % 240 >= 120, a: i % 240 < 120 && i % 7 === 0 }
        window.__game.step(pad, 1)
        const st = window.__game.state()
        seenSpider |= st.spider; seenScorpion |= st.scorpion; seenFlea |= st.flea
        minShrooms = Math.min(minShrooms, st.mushrooms)
        if (st.mushrooms > lastM) rained += st.mushrooms - lastM
        lastM = st.mushrooms
        if (st.pops > 0) seenPops = 1
        maxPops = Math.max(maxPops, st.pops)
        maxWave = Math.max(maxWave, st.wave)
        maxRearSpd = Math.max(maxRearSpd, st.rearSpd)
        if (st.poisoned > 0) seenPoison = 1
    }
    const st = window.__game.state()
    return [st.tick - t0, st.score, st.lives, st.segments, st.heads, st.mushrooms,
        seenSpider, seenScorpion, seenFlea, seenPoison, rained, minShrooms, st.playerX, st.playerY, seenPops, maxPops, maxWave, maxRearSpd, st.bites, st.stings].join('|')
}, ROLLOUT)
const r1 = await drive()
const r2 = await drive()
rep.check('determinism: same seed + same pads -> identical menagerie rollout', r1 === r2, `${r1} vs ${r2}`)
const roll = r1.split('|').map(Number)
rep.check('the rollout met the spider (cadence fires in-browser)', roll[6] === 1, `seenSpider=${roll[6]}`)
rep.check('the rollout met the scorpion (venom cadence fires)', roll[7] === 1, `seenScorpion=${roll[7]}`)
rep.check('venom landed on caps during the rollout', roll[9] > 0, `poisoned=${roll[9]}`)
rep.check('the garden shrank during the rollout (eaters ate)', roll[11] < 40, `minShrooms=${roll[11]}`)
rep.check('the flea rained bonus mushrooms during the rollout', roll[10] > 0, `rained=${roll[10]}`)
rep.check('kill-pop juice fires in-browser (debris + digits at the kill sites, #3620)', roll[14] === 1 && roll[15] > 0, `seenPops=${roll[14]}, maxPops=${roll[15]}`)
rep.check('cuts race the rear chain in-browser (split boost compounds toward the cap, #3631)', roll[17] > 1, `maxRearSpd=${roll[17]}`)
// The glide-pad rollout keeps the zapper alive but rarely empties a column;
// a second all-fire rollout must clear wave 1 and spawn its faster rebuild.
const climb = await page.evaluate(async (n) => {
    window.__game.reset(777)
    let maxWave = 1
    for (let i = 0; i < n; i++) {
        window.__game.step({ right: i % 240 < 120, left: i % 240 >= 120, a: i % 7 === 0 }, 1)
        maxWave = Math.max(maxWave, window.__game.state().wave)
    }
    return maxWave
}, 4000)
rep.check('a cleared field rebuilds one rung faster in-browser (#3631)', climb >= 2, `maxWave=${climb}`)
await page.keyboard.press('?') // un-pause
await new Promise((r) => setTimeout(r, 120))

// ---- the zapper still dies honestly through the browser ----
// The arcade descent is slow law: the head drops one cell per wall bounce,
// so the budget is a full descent plus a crossing (the menagerie may take
// a life first — any honest death will do).
await page.evaluate(() => window.__game.reset(4242))
let st = null
for (let k = 0; k < 1600 && !st?.done; k++) {
    st = await page.evaluate(() => { window.__game.step({}, 50); return window.__game.state() })
}
rep.check('idle world spends lives to GAME OVER', !!st && st.done === true, `lives ${st?.lives}, done ${st?.done}`)
await page.keyboard.press('KeyZ')
await new Promise((r) => setTimeout(r, 250))
{
    const a = await s()
    rep.check('death screen + key restarts clean (score 0, menagerie clear)', a.score === 0 && a.lives === 3 && !a.spider && !a.scorpion && !a.flea && !a.done,
        `score ${a.score}, lives ${a.lives}, spider ${a.spider}, scorpion ${a.scorpion}, flea ${a.flea}, done ${a.done}`)
}

// ---- #3664 §revive: the garden heals with the zapper, in the live browser ----
// Stage the two healable states (DEV sting/chip hooks, the DebugKit road),
// then let the zapper die HONESTLY to the descending chain (real contract
// steps, no hurt hook), and audit the respawn: both states clear, the counter
// reports exactly what was staged, and the score moved by exactly 5 per
// regenerated cap (nothing else fires in the window — no shots are taken).
await page.keyboard.press('?') // park the rAF loop — one driver
await new Promise((r) => setTimeout(r, 120))
const revive = await page.evaluate(async () => {
    window.__game.reset(4242)
    for (let i = 0; i < 500; i++) window.__game.step({}, 1) // let the run breathe
    const p = () => window.__cTest.probe()
    window.__cTest.sting()
    window.__cTest.sting()
    window.__cTest.chip()
    const pre = p()
    if (pre.poisoned + pre.damaged < 3) return { expected: -1, note: 'staging failed' }
    let diedAt = null, scoreAtDeath = 0, expected = 0
    for (let k = 0; k < 1600; k++) {
        const before = p()
        window.__game.step({}, 10)
        const after = p()
        if (after.lives < before.lives && diedAt === null) {
            diedAt = after.tick
            scoreAtDeath = after.score
            // extra caps may have been stung since staging — the death-tick
            // snapshot is what the respawn must heal
            expected = after.poisoned + after.damaged
        }
        if (diedAt !== null && after.tick >= diedAt + 75 && after.alive) {
            return { expected, prePoisoned: pre.poisoned, preDamaged: pre.damaged,
                poisoned: after.poisoned, damaged: after.damaged,
                revived: after.revived, scoreDelta: after.score - scoreAtDeath,
                done: after.done, lives: after.lives }
        }
    }
    return null
})
rep.check('§revive: death healed every staged cap in-browser', !!revive && revive.poisoned === 0 && revive.damaged === 0,
    JSON.stringify(revive))
rep.check('§revive: the run counted exactly the caps it healed', !!revive && revive.revived === revive.expected && revive.expected >= 3,
    JSON.stringify(revive))
rep.check('§revive: 5 points per regenerated mushroom, no phantom score', !!revive && revive.scoreDelta === revive.revived * 5,
    JSON.stringify(revive))
rep.check('§revive: the zapper came back alive with lives spent honestly', !!revive && revive.lives === 2 && revive.done === false,
    JSON.stringify(revive))
await page.keyboard.press('?') // un-pause
await new Promise((r) => setTimeout(r, 120))

// ---- #3726 §bite: the menagerie bites the column, in the live browser ----
// Stage a spider standing on a body segment and a scorpion crossing one (DEV
// hooks set the menagerie down; the LIVE laws do the rest), then audit the
// contract state: a segment is devoured (chain split, head grown), the bug
// pays nothing, and the sting turns a segment red-fast.
await page.keyboard.press('?') // park the rAF loop — one driver
await new Promise((r) => setTimeout(r, 120))
const bite = await page.evaluate(() => {
    window.__game.reset(4242)
    const q = () => window.__game.state()
    // Wait for the column to descend into the spider's roaming band, then
    // stage. (The band guard lives in the hook; this loop just knocks.)
    let stagedSpider = false
    for (let i = 0; i < 4000 && !stagedSpider; i++) {
        window.__game.step({}, 1)
        stagedSpider = window.__cTest.devour()
    }
    if (!stagedSpider) return { stagedSpider: false, note: 'column never entered the band' }
    const pre = q()
    window.__game.step({}, 10)
    const postSpider = q()
    const stagedScorpion = window.__cTest.stingSeg()
    window.__game.step({}, 10)
    const postScorpion = q()
    return { stagedSpider, stagedScorpion,
        segPre: pre.segments, segPost: postSpider.segments,
        headsPre: pre.heads, headsPost: postSpider.heads,
        bitesDelta: postSpider.bites - pre.bites,
        scorePre: pre.score, scorePost: postSpider.score,
        stingsDelta: postScorpion.stings - postSpider.stings, fastPost: postScorpion.fast,
        alive: postScorpion.done === false }
})
rep.check('§bite: the spider devours column segments in-browser (chain loses exactly what it bit)',
    !!bite && bite.stagedSpider && bite.bitesDelta >= 1 && bite.segPre - bite.segPost === bite.bitesDelta,
    JSON.stringify(bite))
rep.check('§bite: the chain behind the bite grows a head (heads not lost)',
    !!bite && bite.headsPost >= bite.headsPre, `heads ${bite && bite.headsPre} -> ${bite && bite.headsPost}`)
rep.check('§bite: bug lunch pays zero — score untouched through the bite',
    !!bite && bite.scorePost === bite.scorePre, `score ${bite && bite.scorePre} -> ${bite && bite.scorePost}`)
rep.check('§bite: the scorpion races a stung segment in-browser',
    !!bite && bite.stagedScorpion && bite.stingsDelta >= 1 && bite.fastPost >= 1,
    JSON.stringify(bite))
rep.check('§bite: the staged world stays alive — bugs fight each other, not cheap deaths',
    !!bite && bite.alive, JSON.stringify(bite))
await page.keyboard.press('?') // un-pause
await new Promise((r) => setTimeout(r, 120))

// ---- the drawn world shows the menagerie (canvas is not blank, sprites paint) ----
await page.evaluate(() => window.__game.reset(4242))
await page.evaluate(async () => { for (let i = 0; i < 500; i++) window.__game.step({}, 1) })
await new Promise((r) => setTimeout(r, 250))
const px = await page.evaluate(() => {
    const cv = document.querySelector('canvas')
    const g = cv.getContext('2d')
    const d = g.getImageData(0, 0, cv.width, cv.height).data
    let lit = 0
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 200) lit++
    return lit
})
rep.check('sprites paint through the menagerie (canvas alive)', px > 500, `${px} lit samples`)

rep.check('zero page errors across the drive', errors === 0, `${errors}`)
rep.exit(browser)
