// invaderscheck — proves SPACE INVADERS boots, its rules hold, it can be won,
// and ?seed=N replays exactly, without a browser (#1473 batch 13).
// Prove-it-can-fail (run once by hand, watch RED, restore):
//   1. sim.js ROW_SCORE squid 30 → 0          (score law RED)
//   2. index.jsx strip the seed: key from the feedback report (contract RED)
//   3. sim.js drop the lives-- in loseLife    (terminal RED)

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { seedRng } from '../src/utils/gameContract.js'
import {
    GW, PLAYER_Y, PLAYER_W, ROW_SCORE, RESPAWN_TICKS, UFO_Y,
    makeWorld, step, loseLife, hash, done, activeCount, waveSpeed,
} from '../src/games/SpaceInvaders/sim.js'

const here = dirname(fileURLToPath(import.meta.url))
const jsx = readFileSync(join(here, '../src/games/SpaceInvaders/index.jsx'), 'utf8')
const simSrc = readFileSync(join(here, '../src/games/SpaceInvaders/sim.js'), 'utf8')
const stripComments = (s) => s.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')

let fails = 0
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++ }

// ---------- 1. boots ----------
{
    const r = seedRng(11)
    let s = makeWorld(r)
    for (let t = 0; t < 300; t++) s = step(s, {}, r)
    ok(s.tick === 300, `boots: 300 idle ticks (tick=${s.tick})`)
    ok(s.invaders.length === 32 && activeCount(s) === 32, 'boots: 4x8 formation alive at start')
    ok(!done(s), 'boots: still playing when idle')
}

// ---------- 2. score law: row bands 30/20/20/10 ----------
{
    const r = seedRng(3)
    const s = makeWorld(r)
    // snipe one invader per row from directly beneath
    for (let row = 0; row < 4; row++) {
        const inv = s.invaders.find((i) => i.row === row && i.alive)
        s.playerX = inv.x + 6 - PLAYER_W / 2
        s.playerBullet = { x: inv.x + 6, y: inv.y + 4 }
        step(s, {}, r)
    }
    ok(ROW_SCORE.join() === '30,20,20,10', `row bands are the literal ${ROW_SCORE.join('/')} (original folded to four rows)`)
    ok(s.score === 80,
        `score one per row = 30+20+20+10 = 80 (got ${s.score})`)
    ok(activeCount(s) === 28, `kills credit the fleet count (${activeCount(s)} left)`)
}

// ---------- 3. single-shot rule ----------
{
    const r = seedRng(5)
    const s = makeWorld(r)
    step(s, { fire: true }, r)
    ok(!!s.playerBullet, 'fire launches exactly one shot')
    const shotY = s.playerBullet.y
    step(s, { fire: true }, r)
    ok(s.playerBullet.y === shotY - 5, 'second fire ignored while the shot lives (original one-shot rule)')
}

// ---------- 4. lives, respawn, terminal ----------
{
    const r = seedRng(5)
    const s = makeWorld(r)
    s.playerBullet = null
    s.enemyBullets = [{ x: s.playerX + 6, y: PLAYER_Y - 1 }]
    step(s, {}, r)
    ok(s.lives === 2 && s.phase === 'dying', 'player hit -> life lost, dying phase')
    ok(s.enemyBullets.length === 0, 'death clears the screen of enemy shots')
    for (let t = 0; t < RESPAWN_TICKS; t++) step(s, {}, r)
    ok(s.phase === 'play', 'respawn returns to play after the grace')
    loseLife(s); loseLife(s)
    ok(s.lives === 0 && done(s), 'third death -> game over terminal (done=true)')
}

// ---------- 5. landing ends the game ----------
const INVADER_BOTTOM_PROBE = 20 // sits above the landing check until one edge-drop
{
    const r = seedRng(9)
    const s = makeWorld(r)
    s.invaders.forEach((i) => { i.y = PLAYER_Y - INVADER_BOTTOM_PROBE })
    s.dir = 1
    // march until an edge step drops them onto the player line
    let guard = 0
    while (!done(s) && guard++ < 2000) step(s, {}, r)
    ok(done(s), 'invaders reaching the player line ends the game (no silent re-init)')
}

// ---------- 6. wave clear: rebuild faster ----------
{
    const r = seedRng(9)
    const s = makeWorld(r)
    s.invaders.forEach((i) => { i.alive = false })
    step(s, {}, r)
    ok(s.wave === 2 && activeCount(s) === 32, 'fleet wiped -> wave 2 with full formation')
    ok(waveSpeed(2) > waveSpeed(1), `wave 2 marches faster (${waveSpeed(1)} -> ${waveSpeed(2)})`)
}

// ---------- 7. mystery UFO ----------
{
    const r = seedRng(4)
    const s = makeWorld(r)
    let guard = 0
    while (!s.ufo && guard++ < 4000) step(s, {}, r)
    ok(!!s.ufo, `UFO arrives during play (tick ${s.tick})`)
    if (s.ufo) {
        const pts = s.ufo.points
        // place the shot so it lands inside the saucer AFTER this tick's advance (5px/frame)
        s.playerBullet = { x: Math.round(s.ufo.x) + 8, y: UFO_Y + 8 }
        step(s, {}, r)
        ok(s.score === pts && !s.ufo, `shooting the UFO banks its bounty (${pts})`)
    }
}

// ---------- 8. determinism: seed pins the world ----------
{
    const drive = (seed) => {
        const r = seedRng(seed)
        let s = makeWorld(r)
        const marks = []
        for (let t = 0; t < 1200; t++) {
            s = step(s, { left: t % 140 < 50, right: t % 140 >= 70 && t % 140 < 110, fire: t % 25 === 0 }, r)
            if (t === 100 || t === 500 || t === 1199) marks.push(hash(s))
        }
        return { marks, firstFire: s.enemyBullets.length }
    }
    const a = drive(42)
    const b = drive(42)
    const c = drive(43)
    ok(a.marks.join() === b.marks.join(), 'same seed + same inputs -> identical state hashes at 100/500/1200')
    ok(a.marks.join() !== c.marks.join(), 'a different seed diverges (the seed actually steers the sim)')
}

// ---------- 9. winnable: scripted flight clears wave 1 and reaches the terminal ----------
{
    const smartRun = (seed) => {
        const r = seedRng(seed)
        let s = makeWorld(r)
        let clearedWave1 = false
        let t = 0
        for (; t < 20000 && !done(s); t++) {
            const act = s.invaders.filter((i) => i.alive)
            const input = {}
            if (act.length) {
                const cx = s.playerX + PLAYER_W / 2
                const danger = s.enemyBullets
                    .filter((b) => b.y > PLAYER_Y - 90 && Math.abs(b.x - cx) < 12)
                    .sort((x, y) => y.y - x.y)[0]
                if (danger) { if (danger.x > cx) input.left = true; else input.right = true }
                else {
                    const tgt = act.reduce((m, i) =>
                        (i.y > m.y || (i.y === m.y && Math.abs(i.x + 6 - cx) < Math.abs(m.x + 6 - cx))) ? i : m, act[0])
                    const sp = waveSpeed(s.wave)
                    const travel = (PLAYER_Y - tgt.y) / 5
                    let lead = s.dir * sp * travel
                    const front = s.dir === 1 ? Math.max(...act.map((i) => i.x + 12)) : Math.min(...act.map((i) => i.x))
                    const toEdge = s.dir === 1 ? (GW - 4) - front : front - 4
                    if (toEdge < sp * travel) lead = -s.dir * sp * (travel - toEdge / sp)
                    const d = tgt.x + 6 + lead - cx
                    if (Math.abs(d) <= 4) input.fire = true
                    else if (d > 0) input.right = true
                    else input.left = true
                }
            }
            s = step(s, input, r)
            if (s.wave >= 2) clearedWave1 = true
        }
        return { clearedWave1, over: done(s), score: s.score, wave: s.wave }
    }
    const runs = [1, 7, 42].map(smartRun)
    ok(runs.every((r) => r.clearedWave1), 'scripted flight clears wave 1 on seeds 1/7/42')
    ok(runs.every((r) => r.over && r.score >= 320),
        `scripted flight ends in the terminal with a wave-1 score (got ${runs.map((r) => r.score).join('/')})`)
}

// ---------- 10. seed-param + report contract (static, index.jsx) ----------
{
    ok(/seedFromQuery\(window\.location\.search\)/.test(jsx), 'index.jsx honors ?seed=N at the human-start site')
    ok(/exposeFeedbackState\([\s\S]*?\bseed:/.test(jsx), 'production feedback report carries the seed')
    ok(/exposeFeedbackState\([\s\S]*?\bdone:/.test(jsx), 'production feedback report carries done')
    ok(/unexposeFeedbackState\(\)/.test(jsx), 'feedback report unmounted in cleanup')
    ok(/id:\s*'invaders'/.test(jsx), 'harness contract exposes id invaders')
    ok(/reset:/.test(jsx) && /tick:/.test(jsx) && /state:/.test(jsx) && /canvas:/.test(jsx),
        'harness contract ships reset/tick/state/canvas')
    ok(/unexposeGame\(\)/.test(jsx), 'harness contract unmounted in cleanup')
    ok(/imageSmoothingEnabled\s*=\s*false/.test(jsx), 'pixel title renders with smoothing off')
    ok(/mountDbg\(/.test(jsx), 'DebugKit mounted (DEV-only F1 panel)')
    ok(/VirtualControls visible=/.test(jsx), 'pad visibility wired (hidden at death/pause)')
    ok(!/Math\.random/.test(stripComments(simSrc)), 'sim.js is entropy-free — every roll comes from the injected stream')
    ok(!/Math\.random/.test(stripComments(jsx).replace(/Math\.floor\(Math\.random\(\) \* 1000000\)/g, '')),
        'index.jsx entropy is only the unseeded default seed draw (the audited pattern)')
    ok(/attractFrame/.test(jsx), 'attract screen intact')
}

console.log(fails ? `FAILURES: ${fails}` : 'INVADERS OK')
process.exit(fails ? 1 : 0)
