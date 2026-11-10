// invaderscheck — proves SPACE INVADERS boots, its rules hold, its forts
// work, it can be won, and ?seed=N replays exactly, without a browser
// (#1473 batch 13; bunkers #1495).
// Prove-it-can-fail (run once by hand, watch RED, restore):
//   1. sim.js ROW_SCORE squid 30 → 0          (score law RED)
//   2. index.jsx strip the seed: key from the feedback report (contract RED)
//   3. sim.js drop the lives-- in loseLife    (terminal RED)
//   4. sim.js buildFormation calls newBunkers() (wave REBUILDS the forts → RED)
//   5. sim.js shotVsBunkers return true without clearing a bit (no chew → RED)

import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { seedRng } from '../src/utils/gameContract.js'
import { plant, pull } from './lib/mutateguard.mjs'
import {
    GW, PLAYER_Y, PLAYER_W, ROW_SCORE, RESPAWN_TICKS, UFO_Y,
    BUNKER_W, BUNKER_ROWS, bunkerBricks, ufoBounty,
    makeWorld, step, loseLife, hash, done, activeCount, waveSpeed, watchRoute,
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
    ok(s.bunkers.length === 4 && bunkerBricks(s) === 328,
        'boots: four intact forts, 328 bricks (original: 4x 22x16 of 2x2 brick, dome crown + slot)')
    for (let t = 0; t < 300; t++) s = step(s, {}, r)
    ok(s.tick === 300, `boots: 300 idle ticks (tick=${s.tick})`)
    ok(s.invaders.length === 32 && activeCount(s) === 32, 'boots: 4x8 formation alive at start')
    ok(bunkerBricks(s) <= 328, 'boots: forts only lose bricks (the fleet\'s fire eats them)')
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
        const pts = ufoBounty(s.ufo.shots)
        // place the shot so it lands inside the saucer AFTER this tick's advance (5px/frame)
        s.playerBullet = { x: Math.round(s.ufo.x) + 8, y: UFO_Y + 8 }
        step(s, {}, r)
        ok(s.score === pts && !s.ufo, `shooting the UFO banks the table bounty for its shot count (${pts})`)
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

// ---------- 9. the forts: one brick per shot, the fleet grinds, waves don't rebuild ----------
{
    // (a) a player shot rising into the fort base eats exactly one brick and is lost
    const r = seedRng(21)
    const s = makeWorld(r)
    const a0 = bunkerBricks(s)
    s.playerBullet = { x: 34, y: 226 } // cell column of fort 0, rising from just below
    step(s, {}, r)
    ok(!s.playerBullet && bunkerBricks(s) === a0 - 1,
        `player shot eats one brick and is consumed (${a0} -> ${bunkerBricks(s)})`)

    // (b) a falling invader shot eats one brick too — the forts shield the player
    s.playerBullet = null
    const b0 = bunkerBricks(s)
    s.enemyBullets = [{ x: 31, y: 202 }] // dropping into fort 0's crown
    step(s, {}, r)
    ok(s.enemyBullets.length === 0 && bunkerBricks(s) === b0 - 1,
        `invader shot eats one brick and is consumed (${b0} -> ${bunkerBricks(s)})`)

    // (c) a fort with no bricks left lets the shot through (no absorption)
    s.playerBullet = null
    s.bunkers[0].cells = s.bunkers[0].cells.map(() => 0)
    s.playerBullet = { x: 34, y: 226 }
    step(s, {}, r)
    ok(!!s.playerBullet, 'a chewed-through fort lets the shot pass (hollow path, no brick)')

    // (d) a descended invader grinds the bricks it walks over
    const r2 = seedRng(77)
    const s2 = makeWorld(r2)
    s2.invaders.forEach((i) => { if (i.row !== 3) i.alive = false })
    const low = s2.invaders.find((i) => i.row === 3)
    low.x = 23; low.y = 214
    const c0 = bunkerBricks(s2)
    step(s2, {}, r2)
    ok(c0 - bunkerBricks(s2) >= 10,
        `a descended invader grinds the fort it walks over (${c0} -> ${bunkerBricks(s2)})`)

    // (e) a cleared wave does NOT rebuild the forts (original: only a new game does)
    const r3 = seedRng(8)
    const s3 = makeWorld(r3)
    s3.bunkers.forEach((b) => { b.cells = b.cells.map(() => 0) })
    s3.invaders.forEach((i) => { i.alive = false })
    step(s3, {}, r3)
    ok(s3.wave === 2 && bunkerBricks(s3) === 0,
        'a cleared wave does NOT rebuild the forts (only a new game restores them)')
}

// ---------- 10. winnable: scripted flight clears wave 1 and reaches the terminal ----------
{
    // filled bricks between a pixel column and the player line (0 = open lane)
    const laneCells = (s, px, ty) => {
        let n = 0
        for (const b of s.bunkers) {
            if (px + 1 <= b.x || px >= b.x + BUNKER_W) continue
            const c0 = Math.floor((px - b.x) / 2)
            const r0 = Math.max(0, Math.floor((Math.max(ty, b.y) - b.y) / 2))
            const r1 = Math.min(BUNKER_ROWS - 1, Math.floor((PLAYER_Y - b.y - 0.001) / 2))
            for (let rr = r0; rr <= r1; rr++) for (const c of [c0, c0 + 1]) {
                if (c >= 0 && c < 11 && (b.cells[rr] >> c) & 1) n++
            }
        }
        return n
    }
    const smartRun = (seed) => {
        const r = seedRng(seed)
        let s = makeWorld(r)
        let clearedWave1 = false
        let t = 0
        for (; t < 60000 && !done(s); t++) {
            const act = s.invaders.filter((i) => i.alive)
            const input = {}
            if (act.length) {
                const cx = s.playerX + PLAYER_W / 2
                const danger = s.enemyBullets
                    .filter((b) => b.y > PLAYER_Y - 90 && Math.abs(b.x - cx) < 12)
                    .sort((x, y) => y.y - x.y)[0]
                if (danger) { if (danger.x > cx) input.left = true; else input.right = true }
                else {
                    // play the forts like a 1978 player: lowest invader first, an
                    // open lane is free, a walled one costs its bricks (chew it)
                    const w = (i) => {
                        const px = Math.floor(i.x + 6)
                        const cells = laneCells(s, px, i.y)
                        return -i.y * 100 + Math.abs(i.x + 6 - cx) + cells * 8
                    }
                    const tgt = act.reduce((m, i) => w(i) < w(m) ? i : m, act[0])
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
    ok(runs.every((r) => r.clearedWave1), 'scripted flight chews the forts and clears wave 1 on seeds 1/7/42')
    ok(runs.every((r) => r.over && r.score >= 320),
        `scripted flight ends in the terminal with a wave-1 score (got ${runs.map((r) => r.score).join('/')})`)
}

// ---------- 11. seed-param + report contract (static, index.jsx) ----------
{
    ok(/seedFromQuery\(window\.location\.search\)/.test(jsx), 'index.jsx honors ?seed=N at the human-start site')
    ok(/exposeFeedbackState\([\s\S]*?\bseed:/.test(jsx), 'production feedback report carries the seed')
    ok(/exposeFeedbackState\([\s\S]*?\bdone:/.test(jsx), 'production feedback report carries done')
    ok(/unexposeFeedbackState\(\)/.test(jsx), 'feedback report unmounted in cleanup')
    ok(/id:\s*'invaders'/.test(jsx), 'harness contract exposes id invaders')
    ok(/bunkerBricks:/.test(jsx), 'harness state reports the forts\' brick count')
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


// ---------- 11. WATCH witness (#1637 batch 18; hardened batch 19): the seat brain flies it ----------
{
    let clean = 0, deaths = 0, slowest = 0, slowestGap = 0, bricksAtClear = 0
    for (let k = 0; k < 20; k++) {
        const rand = seedRng(1000 + k * 77)
        let w = makeWorld(rand)
        let dw = 0
        let cap = 9000
        let dead0 = 0, lastKill = 0
        while (w.wave === 1 && w.phase !== 'over' && cap--) {
            const before = w.lives
            w = step(w, watchRoute(w), rand)
            if (w.lives < before) dw++
            const dead = w.invaders.filter((i) => !i.alive).length
            if (dead > dead0) { dead0 = dead; lastKill = w.tick }
            slowestGap = Math.max(slowestGap, w.tick - lastKill)
        }
        deaths += dw
        if (w.wave >= 2 && dw === 0) { clean++; slowest = Math.max(slowest, w.tick); bricksAtClear += bunkerBricks(w) }
    }
    ok(clean >= 20, `WATCH route clears wave 1 untouched on ${clean}/20 seeds (>=20 — #1637 b19 fixed the seed-1462 fort-lead stall)`)
    ok(deaths === 0, `the route never banks a life across 20 seeded flights (${deaths})`)
    ok(slowest <= 1400, `slowest clean clear tick ${slowest} <= 1400 (#1637 b20: aligned-shot re-aim + edge-bounce fold cut b19's 1857)`)
    ok(slowestGap <= 220, `no seed stalls longer than 220 ticks between kills (slowest ${slowestGap}; b18's fort stall ran 511; deleting the b20 fold runs 236, deleting the re-aim pass runs 264)`)
    ok(bricksAtClear >= 6200, `the route wastes few bricks on shots that cannot reach (forts still stand ${bricksAtClear}/6560 at clear; deleting the b19 aim tiebreak chews it down to 6108)`)
    ok(/watchRoute\(world\)/.test(jsx) && !/attractInput/.test(jsx),
        'index.jsx runs watchRoute from sim.js — attract and seat share one brain')
    ok((jsx.match(/watchRoute\(world\)/g) || []).length >= 2, 'attract AND the Y seat call the same brain')
    ok(/bestBlocked \|\| !fortBlocks\(s, pc\)/.test(simSrc),
        '#1637 b19: the fire gate only crosses a fort when the target itself hides behind one')
    ok(/if \(!s\.playerBullet && freeAt\(pc\)\) \{[\s\S]*?Math\.abs\(leadOf\(i\) - pc\) <= 2\.5[\s\S]*?input\.fire = true; return input/.test(simSrc),
        '#1637 b20: the route takes an aligned shot NOW instead of marching to the lowest target\s column')
    ok(/let edgeDist = Infinity[\s\S]*?Math\.min\(flight, tEdge\)/.test(simSrc),
        '#1637 b20: the meeting point folds the edge bounce into the shot\s flight prediction')
    ok(/isWatchKey\(e\)/.test(jsx) && /isTakeoverKey\(e\)/.test(jsx), 'seat + takeover wired in index.jsx')
    ok(/label: 'SPACE INVADERS'[\s\S]{0,400}WATCH_HELP/.test(readFileSync('src/config/games.js', 'utf8')),
        'registry advertises WATCH for Space Invaders')
}

// ---------- 12. #1906 polish: shot-count UFO table, march flutter, popups, warble, watch tell, attract loss ----------
{
    ok(ufoBounty(0) === 50 && ufoBounty(4) === 50 && ufoBounty(5) === 100 && ufoBounty(9) === 100 &&
        ufoBounty(10) === 150 && ufoBounty(14) === 150 && ufoBounty(15) === 300 && ufoBounty(99) === 300,
        'UFO bounty is the shot-count table (>=15 ->300, >=10 ->150, >=5 ->100, else 50) — not a dice roll')
    // shots fired while the saucer is on screen feed its counter, and the hit
    // pays the table for that count (quiet rand: no enemy fire, no timing dice;
    // the one-shot rule paces spawns at the bullet's ~47-tick flight, not the
    // 10-tick cooldown — mirror the spawn events, and floor the count honestly)
    const rr = () => 0.99
    const s = makeWorld(rr)
    s.ufo = { x: -16, shots: 0 } // full ~256-tick crossing window
    let spawned = 0
    for (let t = 0; t < 200; t++) {
        const ufoUp = !!s.ufo
        const had = !!s.playerBullet
        step(s, { fire: true }, rr)
        if (ufoUp && !had && s.playerBullet) spawned++
    }
    ok(s.ufo && s.ufo.shots === spawned && spawned >= 4,
        `every shot fired under the saucer counts (spawned ${spawned} in 200 ticks, table counted ${s.ufo ? s.ufo.shots : 'saucer gone'})`)
    if (s.ufo) {
        const counted = s.ufo.shots
        const before = s.score
        s.playerBullet = { x: Math.round(s.ufo.x) + 9, y: UFO_Y + 8 } // column inside the saucer, lands next advance
        step(s, {}, rr)
        ok(!s.ufo && s.score - before === ufoBounty(counted) && s.score - before >= 100,
            `a saucer hit pays the table for its counted shots (${counted} shots -> ${s.score - before})`)
    }
    ok(!/points/.test(simSrc), 'the dice-bounty field is gone from the sim — zero entropy at the saucer')

    // presentation-layer juice (index.jsx, decor stays out of the pure sim)
    ok(/Math\.max\(3, Math\.round\(2 \+ n \* 0\.95\)/.test(jsx),
        '#1906 march rate tracks the REMAINING fleet — the last pair flutters at 3-tick steps')
    ok(/if \(world\.ufo\) \{[\s\S]*?warbleAt[\s\S]*?\} else \{[\s\S]*?MARCH_TONES/.test(jsx),
        '#1906 a saucer overhead warbles INSTEAD of the march (arcade law)')
    ok(/popup\(world\.invaders\[k\]\.x \+ 6, world\.invaders\[k\]\.y, ROW_SCORE\[world\.invaders\[k\]\.row\]\)/.test(jsx),
        '#1906 kill popups flash the invader row value at the death spot (original 10/20/30)')
    ok(/const ufoPts = world\.score - prevScore - invaderPts/.test(jsx),
        '#1906 the saucer payout pops at the score delta (whatever the table paid)')
    ok(/watchTell/.test(jsx),
        '#1906 WATCH re-aim tell: a target tick blinks over the cannon between kills')
    ok(/attractOver > 150/.test(jsx),
        '#1906 attract holds its GAME OVER beat ~2.5 s (ART.md attract law: show losing too)')
}

// prove-it-can-fail: planted bugs the witness MUST die on
if (process.argv.includes('--mutant')) {
    const S = 'src/games/SpaceInvaders/sim.js'
    const J = 'src/games/SpaceInvaders/index.jsx'
    const MUTANTS = [
        [S, 'the route can stand in a falling column',
            'const freeAt = (x) => lanes.every((lx) => Math.abs(lx - x) >= 12)',
            'const freeAt = (x) => lanes.every((lx) => Math.abs(lx - x) >= 6)'],
        [S, 'shots cross forts again (b19 fire gate deleted)',
            'if (Math.abs(aimX - pc) <= 2.5 && !s.playerBullet && freeAt(pc) && (bestBlocked || !fortBlocks(s, pc))) input.fire = true',
            'if (Math.abs(aimX - pc) <= 2.5 && !s.playerBullet && freeAt(pc)) input.fire = true'],
        [S, 'the aim ignores the fort under its lead point (b19 tiebreak deleted)',
            'const aimBlocked = fortBlocks(s, leadOf(i))',
            'const aimBlocked = false'],
        [S, 'the route ignores aligned targets (b20 re-aim pass deleted)',
            'if (!s.playerBullet && freeAt(pc)) {',
            'if (false && !s.playerBullet && freeAt(pc)) {'],
        [S, 'the lead ignores the edge bounce (b20 fold deleted)',
            'let edgeDist = Infinity',
            'let edgeDist = flight * waveSpeed(s.wave)'],
        [S, 'the saucer pays a flat score, ignoring the shot table (#1906)',
            's.score += ufoBounty(s.ufo.shots)',
            's.score += 50'],
        [S, 'shots under the saucer stop counting (#1906 table starved)',
            'if (s.ufo) s.ufo.shots++',
            ''],
        [J, 'the march rate ignores the fleet size (#1906 flutter deleted)',
            'const interval = Math.max(3, Math.round(2 + n * 0.95))',
            'const interval = 16'],
        [J, 'the saucer no longer silences the march (#1906 warble deleted)',
            'if (world.ufo) {\n                    if (world.tick - warbleAt >= 4)',
            'if (false && world.ufo) {\n                    if (world.tick - warbleAt >= 4)'],
        [J, 'kill popups removed (#1906)',
            'popup(world.invaders[k].x + 6, world.invaders[k].y, ROW_SCORE[world.invaders[k].row])',
            'void 0'],
        [J, 'the attract loop loses instantly again (#1906 hold deleted)',
            'attractOver > 150',
            'attractOver > 0'],
    ]
    for (const [F, what, from, to] of MUTANTS) {
        const orig = readFileSync(F, 'utf8')
        if (!orig.includes(from)) { ok(false, `mutant anchor missing: ${what}`, from) }
        else {
            plant(F, orig.replace(from, to))
            const res = spawnSync(process.execPath, ['scripts/invaderscheck.mjs'], { encoding: 'utf8' })
            ok(res.status !== 0, `mutant dies: ${what}`, res.status === 0 ? 'child passed despite the bug' : '')
            pull(F)
        }
    }
}

console.log(fails ? `FAILURES: ${fails}` : 'INVADERS OK')
process.exit(fails ? 1 : 0)
