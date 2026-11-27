// centipedechek — CENTIPEDE (#1473 seedpin batch 16) in plain Node.
// Pre-port: `state.score` was dead, one touch hard-reset everything, cut
// bodies never grew heads, and the mushroom field scattered off Math.random.
// This gate pins what is true now: the field replays from one seed
// (?seed=N), the arcade point table (head 100 / body 10 / mushroom 1) holds,
// the cut-head rule fires, the lives loop reaches an honest GAME OVER, and
// every human start re-pins the seed. `--mutant` re-plants pre-port bugs;
// every mutant MUST turn something red.
//
//   npm run centipedechek
//   npm run centipedechek -- --mutant

import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { mushroomField, scoreForSegment, MUSHROOM_POINTS, CELL_SIZE, START_LIVES, SPIDER_POINTS, SCORPION_POINTS, FLEA_POINTS, SPIDER_EVERY, SCORPION_EVERY, FLEA_COOLDOWN, poisonMushroom, bulletEscapes } from '../src/games/Centipede/sim.js'
import { seedRng, seedFromQuery } from '../src/utils/gameContract.js'
import { plant, pull } from './lib/mutateguard.mjs'

let fails = 0, passes = 0
const ok = (cond, name, detail = '') => {
    if (cond) { passes++; console.log(`  ok   ${name}`) }
    else { fails++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

// ------------------------------------------------------------ determinism ----
console.log('seeded field: the mushroom garden replays')
{
    const field = (sd) => mushroomField(seedRng(sd), 480, 640)
        .map((m) => `${m.x}|${m.y}|${m.health}`).join(';')
    ok(field(4242) === field(4242), 'same seed → identical 40-mushroom field')
    ok(field(4242) !== field(4243), 'different seed → different field')
    let bad = 0
    const playerTop = 640 - 150 // the zapper's strip (index.jsx safe zone)
    for (let s = 1; s <= 12; s++) {
        for (const m of mushroomField(seedRng(s * 7919), 480, 640)) {
            if (m.x % CELL_SIZE !== 0) bad++
            if (!(m.x >= 0 && m.x < 480)) bad++
            if (m.y < 50) bad++ // top band (the centipede's spawn lane) stays clear
            if (m.y + CELL_SIZE > playerTop) bad++ // the zapper's strip stays clear
            if (m.health !== 3) bad++
        }
    }
    ok(bad === 0, 'field sits on the grid, above the zapper strip, below the spawn band (12 seeds)', `${bad}`)
    ok(mushroomField(seedRng(1), 64, 96).length === 40, 'field size is the port baseline (40)')
    ok(seedFromQuery('?seed=777') === 777, '?seed=N parses for the pin')
}

// --------------------------------------------------------- arcade scoring ----
console.log('1981 scoring law')
{
    ok(scoreForSegment(true) === 100, 'head shot pays 100')
    ok(scoreForSegment(false) === 10, 'body shot pays 10')
    ok(MUSHROOM_POINTS === 1, 'destroyed mushroom pays 1')
    ok(START_LIVES === 3, 'the machine starts you with 3 lives')
}

// ------------------------------------------------------- component wiring ----
console.log('component wiring: pin, lives, head rule, terminal')
{
    const src = readFileSync('src/games/Centipede/index.jsx', 'utf8')
    ok(!/Math\.random\(\*|Math\.random\(\) \* \(state\.height/.test(src),
        'the mushroom scatter left Math.random')
    const dice = src.match(/Math\.random\(\)/g) || []
    const seedDraws = src.match(/Math\.random\(\) \* 1000000/g) || []
    ok(dice.length === 2 && seedDraws.length === 2,
        'no die leaves the stream (only the two seed generations)', `${dice.length}/${seedDraws.length}`)
    ok(/seed = seedFromQuery\(window\.location\.search\) \?\? Math\.floor\(Math\.random\(\) \* 1000000\)/.test(src) &&
        /rand = seedRng\(seed\)/.test(src), 'startRun regenerates the seed and honors ?seed=N')
    ok(/exposeFeedbackState\(\(\) => \(\{[\s\S]{0,120}?done: over, seed: seed, lives/.test(src),
        'production report carries seed + terminal + lives')
    ok(/state: \(\) => \(\{[\s\S]{0,160}?done: over, seed: seed, lives/.test(src),
        'QA contract state carries seed + terminal + lives too')
    ok(/state\.score \+= scoreForSegment\(seg\.head\)/.test(src), 'segment kills score through the arcade table')
    ok(/state\.score \+= MUSHROOM_POINTS/.test(src), 'mushroom destroys score 1')
    ok(/state\.centipedes\[hitSeg\]\.head = true/.test(src),
        'the segment behind a cut becomes a new head (arcade chain rule)')
    ok(/lives--/.test(src) && /lives <= 0[\s\S]*?over = true/.test(src), 'touch takes a life; zero ends the run')
    ok(/if \(playerAlive\(\) && tickN >= invulnUntil/.test(src), 'centipede-vs-player honors the respawn grace')
    ok(/!playerAlive\(\) && tickN >= respawnAt/.test(src), 'the zapper returns after the death pause')
    const respawn = src.match(/if \(!playerAlive\(\) && tickN >= respawnAt\) \{[\s\S]*?\n            \}/)
    ok(!!respawn && /resetPlayer\(\)/.test(respawn[0]) && /spawnCentipede\(\)/.test(respawn[0]) && !/init\(\)/.test(respawn[0]),
        'death respawns the zapper + restarts the centipede without touching the field (mushrooms persist)')
    const sr = src.match(/const startRun = \(\) => \{[\s\S]*?\n        \}/)
    ok(!!sr && /state\.score = 0/.test(sr[0]) && /lives = START_LIVES/.test(sr[0]),
        'startRun resets score and lives (pre-batch the score was DEAD code)')
    ok(/if \(over \|\| isAttractMode\) \{ startRun\(\); return \}/.test(src), 'any key starts/restarts the run')
    ok(/handleCanvasTap/.test(src), 'phones can tap the field to start/restart')
    ok(/exposeGame\(\{[\s\S]*?id: 'centipede'/.test(src), 'QA contract exposeGame wired')
    ok(!/state\.player\.dead/.test(src), 'the dead-flag hard-reset is gone (lives loop replaced it)')
    ok(/GAME OVER/.test(src) && /FINAL SCORE/.test(src), 'the terminal says GAME OVER and keeps the score visible')
}

// ------------------------------------------------------- the menagerie ------
console.log('#3604 menagerie: spider, scorpion, flea')
{
    ok(SPIDER_POINTS(40) === 900 && SPIDER_POINTS(150) === 600 && SPIDER_POINTS(400) === 300,
        'spider pays the bravery bands 900/600/300')
    ok(SPIDER_POINTS(99) === 900 && SPIDER_POINTS(100) === 600 && SPIDER_POINTS(200) === 300,
        'bands break at the pinned edges (<100 / <200)')
    ok(SCORPION_POINTS === 1000, 'scorpion pays 1000')
    ok(FLEA_POINTS === 200, 'flea pays 200')
    ok(SPIDER_EVERY > 120 && SCORPION_EVERY > 120 && FLEA_COOLDOWN > 120,
        'cadences give the player breathing room (>2 s each)', `${SPIDER_EVERY}/${SCORPION_EVERY}/${FLEA_COOLDOWN}`)
    const m = { x: 0, y: 0, health: 3 }
    ok(poisonMushroom(m) === true && m.poison === true, 'a full cap takes the venom')
    ok(poisonMushroom(m) === false, 'poison never double-dips')
    ok(poisonMushroom({ x: 0, y: 0, health: 2 }) === false, 'a chewed cap refuses poison (it is already dying)')
    ok(bulletEscapes(-1) === true && bulletEscapes(0) === false && bulletEscapes(64) === false,
        'only a shot past the top of the field counts as a sky shot')
}

console.log('#3604 wiring: the garden walks, stings and rains')
{
    const src = readFileSync('src/games/Centipede/index.jsx', 'utf8')
    ok(/if \(!state\.spider && tickN >= spiderAt\) spawnSpider\(\)/.test(src) &&
        /if \(!state\.scorpion && tickN >= scorpionAt\) spawnScorpion\(\)/.test(src),
        'spider and scorpion enter on their cadence, one at a time')
    ok(/state\.bullets = \[\]/.test(src),
        'a fresh board clears the gun — no stale volley rides across a reset to diverge seeded drives (#3604)')
    ok(/!state\.flea && playerAlive\(\) && tickN >= fleaAt && bulletEscapes\(b\.y\)/.test(src),
        'a sky shot summons the flea — only when none lives and the cooldown passed')
    ok(/state\.spider = \{[\s\S]{0,400}?vy: 2,/.test(src),
        'the spider enters with a diagonal bound')
    ok(/s\.seekAt = tickN \+ 90/.test(src) && /Math\.sign\(best\.y - s\.y\)/.test(src),
        'the spider re-aims at the nearest mushroom every 90 ticks (the eater seeks)')
    ok(/state\.mushrooms = state\.mushrooms\.filter\(\(m\) => !\(Math\.abs\(m\.x - s\.x\) < 12 && Math\.abs\(m\.y - s\.y\) < 12\)\)/.test(src),
        'the spider eats every mushroom it touches')
    ok(/state\.score \+= SPIDER_POINTS\(dist\)/.test(src),
        'the spider kill pays through the proximity band')
    ok(/poisonMushroom\(m\)/.test(src), 'the scorpion poisons mushrooms on its path')
    ok(/if \(hitPoison\) c\.fast = true/.test(src), 'a centipede crossing venom turns red')
    ok(/c\.x \+= c\.fast \? c\.vx \* 2 : c\.vx/.test(src), 'the redened segment races at double pace')
    ok(/if \(s\.x < -20 \|\| s\.x > state\.width \+ 4\)[\s\S]{0,120}?scorpionAt = tickN \+ SCORPION_EVERY/.test(src),
        'the streak exits the far side and the cadence restarts')
    ok(/rainMushrooms\(2\)/.test(src), 'every flea hit rains two bonus mushrooms')
    ok(/state\.score \+= FLEA_POINTS/.test(src), 'the flea dies paying 200')
    ok(/f\.life--/.test(src) && /if \(f\.life <= 0\) state\.flea = null/.test(src),
        'the flea finishes eating and hops off')
    ok(/state\.score \+= SCORPION_POINTS/.test(src), 'the scorpion dies in one shot paying 1000')
    ok(/Math\.abs\(s\.x - state\.player\.x\) < 12 && Math\.abs\(s\.y - state\.player\.y\) < 12\) killPlayer\(\)/.test(src),
        'the spider and scorpion kill the zapper on touch')
    ok(/Math\.abs\(f\.x - state\.player\.x\) < 12 && Math\.abs\(f\.y - state\.player\.y\) < 12\) killPlayer\(\)/.test(src),
        'the flea kills on touch too')
    ok(/if \(state\.spider\) drawSpider\(state\.spider\)/.test(src) &&
        /if \(state\.scorpion\) drawScorpion\(state\.scorpion\)/.test(src) &&
        /if \(state\.flea\) drawFlea\(state\.flea\)/.test(src),
        'all three menagerie sprites are drawn')
    ok(/m\.poison\s*\n?\s*\? \{ cap: '#ff2d2d'/.test(src) || /m\.poison\n?\s*\?/.test(src),
        'poisoned caps render red')
    const respawn = src.match(/if \(!playerAlive\(\) && tickN >= respawnAt\) \{[\s\S]*?\n            \}/)
    ok(!!respawn && /state\.spider = null/.test(respawn[0]) && /state\.flea = null/.test(respawn[0]) &&
        /scorpionAt = tickN \+ SCORPION_EVERY/.test(respawn[0]),
        'death clears the menagerie and restarts its cadence (fair respawn)')
    ok(/spider: state\.spider \? 1 : 0,/.test(src) && /poisoned: state\.mushrooms\.filter\(m => m\.poison\)\.length,/.test(src),
        'QA contract exposes spider/scorpion/flea/poisoned for the harness')
    ok(/dodge = t\.x >= state\.player\.x \? -1 : 1/.test(src),
        'the WATCH seat sidesteps an looming menace (attract survives the menagerie)')
    // The spider enters clear of the zapper's strip — fairness, the same law
    // the field bands carry (#1524).
    const ss = src.match(/const spawnSpider = \(\) => \{[\s\S]*?\n        \}/)
    ok(!!ss && /state\.height \* 0\.45/.test(ss[0]) && !/height - 30/.test(ss[0]),
        'the spider enters in its roaming band, never on the start pad')
}

// ------------------------------------------------------------------ mutants ----
if (process.argv.includes('--mutant')) {
    console.log('mutants (each MUST die)')
    const I = 'src/games/Centipede/index.jsx'
    const S = 'src/games/Centipede/sim.js'
    const MUTANTS = [
        ['human start ignores ?seed (pin removed)', I,
            `seed = seedFromQuery(window.location.search) ?? Math.floor(Math.random() * 1000000)`,
            `seed = Math.floor(Math.random() * 1000000)`],
        ['production report drops the seed', I,
            `tick: tickN, score: state.score, done: over, seed: seed, lives,`,
            `tick: tickN, score: state.score, done: over, lives,`],
        ['field scatters off Math.random again', S,
            `x: Math.floor(rand() * cols) * CELL_SIZE,`,
            `x: Math.floor(Math.random() * cols) * CELL_SIZE,`],
        ['opening field intrudes the zapper\u2019s strip (walled-in start)', S,
            `const span = Math.max(1, bottom - top)`,
            `const span = Math.max(1, Math.floor(height / CELL_SIZE) - top)`],
        ['head shots pay body price (table corrupted)', S,
            `isHead ? 100 : 10`,
            `isHead ? 5 : 10`],
        ['cut bodies never grow heads', I,
            `if (state.centipedes[hitSeg]) state.centipedes[hitSeg].head = true`,
            ``],
        ['the touch is harmless (no lives loop)', I,
            `lives--
            if (lives <= 0) {`,
            `if (lives <= -99) {`],
        ['death hard-resets the field (mushrooms no longer persist)', I,
            `                resetPlayer()
                spawnCentipede()`,
            `                resetPlayer()
                init()`],
        ['restart keeps the score', I,
            `            state.score = 0
            lives = START_LIVES`,
            `            lives = START_LIVES`],
        // #3604 menagerie — every new law must be mortal.
        ['venom never races (poison is cosmetic)', I,
            `if (hitPoison) c.fast = true`,
            `void hitPoison`],
        ['the redened never actually speeds up', I,
            `c.x += c.fast ? c.vx * 2 : c.vx`,
            `c.x += c.vx`],
        ['flea hits never rain mushrooms', I,
            `rainMushrooms(2) // every hit rains the bonus mushrooms`,
            `void f.health`],
        ['a sky shot never summons the flea', I,
            `tickN >= fleaAt && bulletEscapes(b.y)`,
            `tickN >= fleaAt && false`],
        ['the spider never eats (garden stays full)', I,
            `state.mushrooms = state.mushrooms.filter((m) => !(Math.abs(m.x - s.x) < 12 && Math.abs(m.y - s.y) < 12))`,
            `state.mushrooms = state.mushrooms.filter(() => true)`],
        ['spider kills pay nothing', I,
            `state.score += SPIDER_POINTS(dist)`,
            `void dist`],
        ['the scorpion crosses harmless (no venom)', I,
            `Math.abs(m.y - s.y) < 10 && poisonMushroom(m)`,
            `Math.abs(m.y - s.y) < 10 && false`],
        ['death never clears the menagerie', I,
            `                state.spider = null
                state.scorpion = null
                state.flea = null
                spiderAt = tickN + SPIDER_EVERY`,
            `                spiderAt = tickN + SPIDER_EVERY`],
    ]
    let died = 0
    for (const [name, file, from, to] of MUTANTS) {
        const orig = readFileSync(file, 'utf8')
        if (!orig.includes(from)) { ok(false, `mutant anchor: ${name}`, `missing: ${from}`); continue }
        plant(file, orig.replace(from, to))
        const res = spawnSync(process.execPath, ['scripts/centipedechek.mjs'], { encoding: 'utf8' })
        if (res.status !== 0) { died++; ok(true, `mutant dies: ${name}`) }
        else { ok(false, `mutant dies: ${name}`, 'child passed despite the bug') }
        pull(file)
    }
    ok(died === MUTANTS.length, `all ${MUTANTS.length} mutants die`, `${died}/${MUTANTS.length}`)
}

console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
