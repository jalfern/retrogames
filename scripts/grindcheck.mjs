// grindcheck — GRIND CITY rules + winnability, pure Node.
// Proves: the game boots, its core rules hold, the autopilot makes every
// goal inside the 2:00 run, and seed + pads replay identical hashes.
// Run: npm run grindcheck [-- --mutate <rule>]  (--mutate proves it can fail)

import { makeGame, step, stateOf, hashState, packIn, unpackIn, SCORE_GOAL, GEM_ALL, gemCount, REPLAY_MIN, replayWorthy, betterLine, beatsLine, encodeLine, decodeLine, validBank, SHARE_MAX_TICKS } from '../src/games/GrindCity/sim.js'
import { botPad, makeBot } from '../src/games/GrindCity/planner.js'
import { parkHeight, LETTERS, RAILS, GEMS, GEM_PTS, SECRET, ROOF_Y, shadeAt } from '../src/games/GrindCity/park.js'
import { BAR, bedVoices, landThud, ATTRACT_SFX, sfxGain } from '../src/games/GrindCity/music.js'
import { readFileSync } from 'node:fs'

const dt = 1 / 60
let fails = 0
const ok = (name, cond, extra = '') => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`)
    if (!cond) fails++
}

// --mutate [rule] breaks one load-bearing rule; the check MUST go red.
// Bare --mutate (nightly form, #601) runs every rule in fresh children.
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
const SELF = fileURLToPath(import.meta.url)
const MUTI = process.argv.indexOf('--mutate')
const MUT = MUTI > -1 ? process.argv[MUTI + 1] : null
if (MUTI > -1 && !MUT) {
    let died = 0
    const RULES = ['letters', 'gap', 'replay', 'bed', 'gems', 'shade', 'grab', 'stall', 'tell', 'variety', 'nearmiss', 'bestline', 'bankline', 'codec', 'beats', 'store', 'sharewire', 'sfxduck', 'clone', 'need', 'sched', 'searchwire']
    for (const rule of RULES) {
        const res = spawnSync(process.execPath, [SELF, '--mutate', rule], { encoding: 'utf8' })
        // child convention below: exit 0 = the rule broke and the check saw red
        if (res.status === 0) { died++; console.log(`mutant dies: ${rule}`) }
        else console.log(`mutant SURVIVES: ${rule} — check is toothless`)
    }
    console.log(died === RULES.length ? `ALL MUTANTS CAUGHT (${died}/${RULES.length})` : `${died}/${RULES.length} mutants caught`)
    process.exit(died === RULES.length ? 0 : 1)
}

// ── boot ──────────────────────────────────────────────────────────────────
const boot = makeGame(1, 'run')
ok('boots to menu', boot.phase === 'menu')
ok('run clock is 2:00', Math.abs(boot.timeLeft - 120) < 0.01, `${boot.timeLeft}s`)
boot.phase = 'play'
step(boot, {})
ok('ticks advance', boot.tick === 1)
ok('park surface sane near start', parkHeight(6, -31.5) > 3, `h=${parkHeight(6, -31.5)}`)

// ── core rules ────────────────────────────────────────────────────────────
{
    const s = makeGame(5, 'run'); s.phase = 'play'
    s.x = 0; s.z = 0; s.y = 0; s.heading = 0; s.speed = 0
    step(s, { a: true })                                  // ollie
    ok('ollie lifts', s.air && s.vy > 4)
    let t = 0
    while (s.air && t++ < 200) step(s, {})
    ok('lands again', !s.air && s.y >= parkHeight(s.x, s.z) - 0.01)
    step(s, { a: true })                                  // manual press in grace
    ok('manual starts on landing press', !!s.manual)
    step(s, { a: false })
    step(s, { a: false })
    ok('manual ends and becomes a trick', s.chain.includes('Manual') || s.chain.length > 0)
}
{
    // bail forfeits the unbanked chain
    const s = makeGame(5, 'run'); s.phase = 'play'
    s.x = 0; s.z = 0; s.y = 0; s.heading = 0; s.speed = 3
    step(s, { a: true })
    const scoreBefore = s.score
    // force a bad landing: half-flipped
    s.airTrick.flip = 1; s.airTrick.flipDir = 1; s.airTrick.flipRot = 100
    s.vy = -20
    let t = 0
    while (s.phase === 'play' && t++ < 200) step(s, {})
    ok('bail ends the chain without banking', s.phase === 'tumble' && s.score === scoreBefore && s.chain.length === 0)
}
{
    // grind latch on the plaza rail
    const s = makeGame(5, 'run'); s.phase = 'play'
    const r = RAILS.find(r => r.id === 'plaza')
    s.x = -12; s.z = -2; s.y = parkHeight(-12, -2); s.heading = 0; s.speed = 6
    step(s, { a: true })
    let t = 0
    while (!s.grind && t++ < 120) step(s, {})
    ok('rail latch starts a grind', !!s.grind, s.grind ? s.grind.name : 'never latched')
    ok('grind is on the plaza rail', s.grind && RAILS[s.grind.ri].id === 'plaza')
}

// ── rail vocabulary (#3289): grabs on grinds + coping stalls ──────────────
{
    // coping stall: crouch+A at the pipe lip locks the tail in on the rail line
    const s = makeGame(5, 'run'); s.phase = 'play'
    s.x = -24.6; s.z = 0; s.y = parkHeight(-24.6, 0); s.heading = Math.PI; s.speed = 2
    step(s, { a: true, down: true })
    const se = stateOf(s)
    ok('stall entry locks the board and zeroes speed', se.stall === true && se.speed === 0)
    ok('stall pins the skater onto the coping line', Math.abs(se.x + 25) < 0.02, `x=${se.x}`)
    // deterministic lean; counter-steer holds it 1.5 s while the trickle pays
    const ptsBefore = s.chainPts
    s.stall.drift = 0.5
    let held = 0
    while (s.stall && held++ < 90) { step(s, { left: s.stall.bal > 0, right: s.stall.bal < 0 }); if (MUT === 'stall') s.stall = null }
    ok('stall survives counter-steer and trickles points', !!s.stall && s.chainPts - ptsBefore >= 72,
        `${held} ticks, +${s.chainPts - ptsBefore}`)
    step(s, { a: false })                          // release A: pop keeps the chain
    step(s, { a: true })
    const popped = stateOf(s)
    ok('stall pops back airborne with the chain alive', popped.air && s.chain.includes('Stall'),
        s.chain.join('+'))
    ok('stall pays trickle + time bonus on commit', s.chainPts - ptsBefore >= 80 + 120,
        `+${s.chainPts - ptsBefore}`)

    // the meter is real: an unattended stall slips out
    const b = makeGame(5, 'run'); b.phase = 'play'
    b.x = -24.6; b.z = 0; b.y = parkHeight(-24.6, 0); b.heading = Math.PI; b.speed = 2
    step(b, { a: true, down: true })
    b.stall.drift = 0.5
    let tb = 0
    while (b.phase === 'play' && b.stall && tb++ < 240) { step(b, {}); if (MUT === 'stall') b.stall = null }
    ok('an unattended stall bails on the tighter meter', b.phase === 'tumble' && !b.stall, `${tb} ticks`)

    // crouch+A away from a lip is just an ollie — no dead combo
    const f = makeGame(5, 'run'); f.phase = 'play'
    f.x = 0; f.z = 0; f.y = 0; f.heading = 0; f.speed = 4
    step(f, { a: true, down: true })
    ok('crouch+A away from a lip ollies instead', f.air && !f.stall)
}
{
    // rail grab: hold B on the plaza rail — named by travel, committed after 0.30 s
    const mkGrind = (x, z, hd) => {
        const q = makeGame(5, 'run'); q.phase = 'play'
        q.x = x; q.z = z; q.y = parkHeight(x, z); q.heading = hd; q.speed = 6
        step(q, { a: true })
        let n = 0
        while (!q.grind && n++ < 120) step(q, {})
        if (q.grind) q.grind.drift = 0
        return q
    }
    const q = mkGrind(-12, -2, 0)
    ok('plaza re-latch for grab legs', !!q.grind)
    step(q, { b: true })
    ok('B on the rail engages the grab', stateOf(q).railGrab === 'Feeble', `${stateOf(q).railGrab}`)
    let t = 0
    while (t++ < 12 && q.grind) { step(q, { b: true }); if (MUT === 'grab') q.grind.grabT = 0 }
    step(q, {})                                   // release B before 0.30 s
    ok('a mash tap never commits a grab', !q.chain.includes('Feeble') && !q.chain.includes('Crooked'))

    const q2 = mkGrind(-12, -2, 0)
    step(q2, { b: true })
    let t2 = 0
    while (t2++ < 30 && q2.grind && q2.grind.grab) { step(q2, { b: true }); if (MUT === 'grab') q2.grind.grabT = 0 }
    step(q2, {})
    ok('a held rail grab commits FEEBLE forward', q2.chain.includes('Feeble'), q2.chain.join('+'))

    // fakie leg on the pipe coping: the plaza rail runs diagonally, so a
    // cross-line approach can't latch (the crossing happens while rising) —
    // ride the axis-aligned coping backwards instead.
    const q3 = mkGrind(-24.6, 5, -Math.PI / 2)
    ok('fakie latch on the pipe coping', !!q3.grind && q3.grind.travel < 0 && RAILS[q3.grind.ri].id === 'pipe-near',
        `travel=${q3.grind && q3.grind.travel} rail=${q3.grind && RAILS[q3.grind.ri].id}`)
    step(q3, { b: true })
    let t3 = 0
    while (t3++ < 30 && q3.grind && q3.grind.grab) { step(q3, { b: true }); if (MUT === 'grab') q3.grind.grabT = 0 }
    step(q3, {})
    ok('a held fakie grab commits CROOKED', q3.chain.includes('Crooked'), q3.chain.join('+'))

    // double trickle: identical ladders of ticks, grab pays twice the plain rate
    const p1 = mkGrind(-12, -2, 0); const p2 = mkGrind(-12, -2, 0)
    const base1 = p1.chainPts; const base2 = p2.chainPts
    step(p2, { b: true })
    for (let i = 0; i < 30; i++) { step(p1, {}); step(p2, { b: true }) }
    const d1 = p1.chainPts - base1, d2 = p2.chainPts - base2
    ok('grab doubles the grind trickle', d2 === 2 * d1, `plain +${d1} vs grab +${d2}`)
}

// ── second line, gems, secret spot (#3246) ────────────────────────────────
{
    ok(`gems: ${GEMS.length} score-mode objects laid out`, GEMS.length === 14)
    let spaced = true
    for (let i = 0; i < GEMS.length; i++) for (let j = i + 1; j < GEMS.length; j++)
        if (Math.hypot(GEMS[i].x - GEMS[j].x, GEMS[i].z - GEMS[j].z) < 1.4) spaced = false
    ok('gems: no stacked pairs (each a distinct pickup)', spaced)

    // skating into one pays GEM_PTS. MUT=gems zeroes the bits as they land —
    // the pickup rule is the mutant target.
    const s = makeGame(11, 'run'); s.phase = 'play'
    const gi = 12   // plaza gem (-16, 9)
    const before = s.score
    s.x = GEMS[gi].x; s.z = GEMS[gi].z - 2; s.y = parkHeight(s.x, s.z); s.heading = Math.PI / 2; s.speed = 5
    let t = 0
    while (!(s.gemBits & (1 << gi)) && t++ < 120) { step(s, {}); if (MUT === 'gems') s.gemBits = 0 }
    ok('gem picked while skating', !!(s.gemBits & (1 << gi)))
    ok(`gem pays ${GEM_PTS}`, s.score - before >= GEM_PTS, `+${s.score - before}`)

    // GEM RUN: standing on all 14 completes the set and pays the bonus ONCE
    const s2 = makeGame(11, 'run'); s2.phase = 'play'
    for (let i = 0; i < GEMS.length; i++) {
        s2.x = GEMS[i].x; s2.z = GEMS[i].z; s2.y = parkHeight(s2.x, s2.z)
        step(s2, {})
    }
    ok('gem run: set completes (bits match count)', s2.gemBits === GEM_ALL && gemCount(s2.gemBits) === GEMS.length)
    ok('gem run: GEM RUN bonus fires', s2.gemsAll === true)
    const afterRun = s2.score
    for (let i = 0; i < 30; i++) step(s2, {})
    ok('gem run: bonus never re-pays', s2.score === afterRun, `${afterRun}`)

    // secret spot: the hidden bowl pays once, on entry. Gems pre-marked so
    // the roll down the bowl into the hoard can't blur the two laws.
    const s3 = makeGame(11, 'run'); s3.phase = 'play'
    s3.gemBits = GEM_ALL; s3.gemsAll = true
    s3.x = SECRET.x; s3.z = SECRET.z; s3.y = parkHeight(s3.x, s3.z)
    step(s3, {})
    const secScore = s3.score
    ok('secret spot: entering the bowl flags and pays +250', s3.secretFound === true && secScore === 250, `score=${secScore}`)
    for (let i = 0; i < 30; i++) step(s3, {})
    ok('secret spot pays only once', s3.score === secScore)
    ok('secret bowl reads as a hole in the map', parkHeight(SECRET.x, SECRET.z) <= SECRET.floor + 0.1,
        `h=${parkHeight(SECRET.x, SECRET.z).toFixed(1)}`)
}
{
    // the roof, honestly: a pumped 10.5 m/s line crests the south wall and
    // the east-run gems only come to a skater who is up there.
    const g = makeGame(7, 'run'); g.phase = 'play'
    g.x = -15; g.z = 5; g.y = parkHeight(-15, 5); g.heading = Math.PI / 2; g.speed = 10.5
    let t = 0, onRoof = false
    while (g.phase === 'play' && t++ < 300) {
        step(g, { b: g.lastSlope > 0.18 && g.speed < 11 })
        if (g.z > 15 && g.y > ROOF_Y - 0.3) { onRoof = true; break }
    }
    ok('roof: a pumped fast line crests onto the deck', onRoof && g.phase === 'play')
    let paid = 0
    while (g.phase === 'play' && t++ < 420 && !paid) { step(g, {}); paid = g.gemBits }
    ok('roof line pays: a roof gem is collected from the deck', !!paid, `bits=${g.gemBits}`)

    // …and the gate is real: a 6 m/s shuffle stalls on the wall
    const g2 = makeGame(7, 'run'); g2.phase = 'play'
    g2.x = -15; g2.z = 5; g2.y = parkHeight(-15, 5); g2.heading = Math.PI / 2; g2.speed = 6
    let t2 = 0, crested = false
    while (g2.phase === 'play' && t2++ < 300) {
        step(g2, { b: g2.lastSlope > 0.18 && g2.speed < 11 })
        if (g2.z > 15 && g2.y > ROOF_Y - 0.3) { crested = true; break }
    }
    ok('roof gate: a 6 m/s shuffle never crests — the line must be earned', !crested)
}

// ── winnability: the autopilot makes every goal inside 2:00 ───────────────
let lineTookPretty = false
let botTouchedLip = 0   // #3289 honesty: the driven line never stalls nor rail-grabs
for (const seed of [7, 3, 42, 101, 999]) {
    const s = makeGame(seed, 'run'); s.phase = 'play'
    const bot = makeBot()
    let t = 0
    while (!s.done && t++ < 120 * 60) {
        // optional mutation: sabotage the letter pickups
        if (MUT === 'letters') LETTERS.forEach(l => { s.letters[l.k] = false })
        step(s, botPad(stateOf(s), bot))
        if (s.stall || (s.grind && s.grind.grab)) botTouchedLip++
        if (MUT === 'gap') s.overHole = false
    }
    const st = stateOf(s)
    if (st.gems > 0 || st.secret) lineTookPretty = true
    ok(`seed ${seed}: all goals + win`, st.won === true,
        `score=${st.score} letters=${Object.keys(st.letters).length}/5 gap=${st.gapDone} t=${120 - st.timeLeft | 0}s`)
    ok(`seed ${seed}: score clears the target`, st.score >= SCORE_GOAL + 10000, `${st.score}`)
}
ok('optional-by-design: the driven win line never needs a gem or the secret', !lineTookPretty)
ok('#3289 honesty: the autopilot never stalls and never rail-grabs — attract untouched', botTouchedLip === 0,
    `${botTouchedLip} ticks`)

// ── determinism: seed + pads ⇒ identical hashes ───────────────────────────
function drive(seed) {
    const s = makeGame(seed, 'run'); s.phase = 'play'
    const bot = makeBot(); const hashes = []
    for (let t = 1; t <= 1800; t++) {
        step(s, botPad(stateOf(s), bot))
        if (t % 30 === 0) hashes.push(hashState(s))
    }
    return hashes
}
{
    const a = drive(7); const b = drive(7)
    ok('replay is deterministic', JSON.stringify(a) === JSON.stringify(b))
    const c = drive(8)
    ok('seed actually steers the sim', JSON.stringify(a) !== JSON.stringify(c))
}

// ── attract variety (#3233 item 4): style rotates per idle loop ───────────
// v0 is the witness line (graded above, byte-identical). v1 flips the trench
// gap, v2 rides a manual off the gap landing. These run ONLY in attract — the
// graded line stays v0 — but they must still be deterministic, bailable-free,
// and visibly different, or the variety is a lie.
{
    const driveV = (seed, v) => {
        const s = makeGame(seed, 'run'); s.phase = 'play'
        const bot = makeBot(v); const hashes = []
        for (let t = 1; t <= 1800; t++) {
            step(s, botPad(stateOf(s), bot))
            if (t % 30 === 0) hashes.push(hashState(s))
        }
        return JSON.stringify(hashes)
    }
    ok('variety v1/v2 ride different lines than v0',
        driveV(7, 1) !== driveV(7, 0) && driveV(7, 2) !== driveV(7, 0))
    ok('variety variants are deterministic', driveV(7, 1) === driveV(7, 1) && driveV(7, 2) === driveV(7, 2))

    // wiring: the cabinet must actually rotate the style per attract loop.
    // MUT=variety freezes the rotation to v0 — the pin must see red.
    const cab = readFileSync(new URL('../src/games/GrindCity/index.jsx', import.meta.url), 'utf8')
    const cabSrc = MUT === 'variety' ? cab.replace('attractV = (attractV + 1) % STYLE_N', 'attractV = attractV % STYLE_N') : cab
    ok('variety wiring: toAttract rotates the style and builds the bot with it (#3233, four styles #3394)',
        /attractV = \(attractV \+ 1\) % STYLE_N/.test(cabSrc) && /bot = makeAttractBot\(attractV\)/.test(cabSrc))

    const runV = (seed, v) => {
        const s = makeGame(seed, 'run'); s.phase = 'play'
        const bot = makeBot(v)
        let t = 0, bails = 0
        const tricks = []
        while (!s.done && t++ < 120 * 60) {
            const p = botPad(stateOf(s), bot)
            // MUT=variety makes the flip/manual presses no-ops — all variants
            // collapse to v0 and the difference + trick pins must see red.
            if (MUT === 'variety') { if (p.b && bot.v === 1 && bot.flipF) p.b = false; if (p.a && bot.v === 2 && bot.m > 0) { p.a = false; bot.m = 0 } }
            step(s, p)
            for (const e of s.events) {
                if (e === 'bail') bails++
                else if (e.startsWith('trick:')) tricks.push(e)
            }
            s.events.length = 0
        }
        return { won: stateOf(s).won, bails, tricks }
    }
    for (const seed of [7, 3, 42, 101, 999]) {
        const f = runV(seed, 1)
        ok(`seed ${seed}: flip line lands the Flip, never bails, still wins`,
            f.bails === 0 && f.tricks.some(e => e.startsWith('trick:Flip:')) && f.won,
            `bails=${f.bails} tricks=${JSON.stringify(f.tricks)}`)
        const m = runV(seed, 2)
        ok(`seed ${seed}: manual line lands a Manual, never bails, still wins`,
            m.bails === 0 && m.tricks.some(e => e.startsWith('trick:Manual')) && m.won,
            `bails=${m.bails} tricks=${JSON.stringify(m.tricks)}`)
    }
}

// ── the thinking bot (#3394): searchable autopilot ────────────────────────
// planner recites; search.js thinks. Every trick decision rolls candidate
// press-schedules through the REAL sim and commits the best. Pin laws: the
// rollouts never touch the live board, the line is deterministic, air is only
// committed when the search PROVES it, and the searched line wins — banked
// deeper than the witness (a Flip the script never throws).
import { makeSearchBot, searchPad } from '../src/games/GrindCity/search.js'
{
    // Purity: searchPad may not touch the live state — a leaky clone is
    // save-scumming the attract. Deep-snapshot around every call until a
    // schedule actually commits (the commit tick is the one that could leak).
    const s = makeGame(7, 'run'); s.phase = 'play'
    const bot = makeSearchBot()
    let t = 0, leak = null
    while (t++ < 1800 && bot.nCommit === 0) {
        const snap = JSON.stringify(s)
        const p = searchPad(s, bot)
        if (JSON.stringify(s) !== snap && !leak) leak = `tick ${s.tick}`
        step(s, p)
    }
    ok('#3394 purity: a search never writes the live board', leak === null && bot.nCommit > 0,
        `${bot.nSearch} searches, ${bot.nCommit} commits${leak ? ' — LEAK ' + leak : ''}`)

    const driveV3 = (seed) => {
        const g = makeGame(seed, 'run'); g.phase = 'play'
        const b = makeSearchBot(); const hashes = []
        for (let k = 1; k <= 1800; k++) { step(g, searchPad(g, b)); if (k % 30 === 0) hashes.push(hashState(g)) }
        return JSON.stringify(hashes)
    }
    ok('#3394 determinism: seed + search ⇒ identical attract lines', driveV3(7) === driveV3(7))
    ok('#3394 the thinking bot rides a different line than the witness', driveV3(7) !== drive(7))

    for (const seed of [7, 3, 42, 101, 999]) {
        const g = makeGame(seed, 'run'); g.phase = 'play'
        const b = makeSearchBot()
        let k = 0, bails = 0
        const tricks = []
        while (!g.done && k++ < 120 * 60) {
            const p = searchPad(g, b)
            if (MUT === 'sched') { p.a = false; p.b = false }   // strip overlay presses
            step(g, p)
            for (const e of g.events) { if (e === 'bail') bails++; else if (e.startsWith('trick:')) tricks.push(e.slice(6)) }
            g.events.length = 0
        }
        const st = stateOf(g)
        ok(`#3394 seed ${seed}: the searched line wins, zero bails, all letters + the gap`,
            st.won === true && bails === 0 && Object.keys(st.letters).length === 5 && st.gapDone && st.score >= SCORE_GOAL + 10000,
            `score=${st.score} t=${(120 - st.timeLeft) | 0}s bails=${bails} tricks=${[...new Set(tricks)].join(',')}`)
        ok(`#3394 seed ${seed}: deeper than the witness — searched air banks a Flip and a manual the script never throws`,
            tricks.some(x => x.startsWith('Flip:')) && tricks.some(x => x.startsWith('Manual')))
    }

    // Wiring laws read from source: rollouts clone before mutating (MUT=clone
    // shares the letter map — the purity claim dies), PROVEN AIR filters the
    // gap commit (MUT=need removes it), and the cabinet actually routes the
    // thinker through searchPad on the raw sim (MUT=searchwire unbinds it).
    const seaRaw = readFileSync(new URL('../src/games/GrindCity/search.js', import.meta.url), 'utf8')
    const cab = readFileSync(new URL('../src/games/GrindCity/index.jsx', import.meta.url), 'utf8')
    const seaSrc = MUT === 'clone' ? seaRaw.replace('c.letters = { ...s.letters }', 'c.letters = s.letters') : seaRaw
    ok('#3394 clone law: every mutable field of the sim is copied before rollout',
        /const c = cloneSim\(s0\)/.test(seaSrc) && /c\.letters = \{ \.\.\.s\.letters \}/.test(seaSrc) &&
        /c\.chain = s\.chain\.slice\(\)/.test(seaSrc) && /c\.grind = s\.grind \? \{ \.\.\.s\.grind \} : null/.test(seaSrc))
    const seaNeed = MUT === 'need' ? seaRaw.replace("if (trig.need === 'gap' && !r.gap) continue", 'if (false) continue') : seaRaw
    ok('#3394 proven-air law: a gap plan commits only when the rollout clears the trench',
        /if \(trig\.need === 'gap' && !r\.gap\) continue/.test(seaNeed) &&
        /if \(trig\.need === 'grind' && !r\.grindHit\) continue/.test(seaNeed))
    const cabThink = MUT === 'searchwire'
        ? cab.replace('bot.thinks ? searchPad(sim, bot) : botPad(stateOf(sim), bot)', 'botPad(stateOf(sim), bot)')
        : cab
    ok('#3394 wiring: attract routes the thinking bot through searchPad on the raw sim',
        /bot\.thinks \? searchPad\(sim, bot\) : botPad\(stateOf\(sim\), bot\)/.test(cabThink) &&
        /makeAttractBot = \(v\) => \(v === 3 \? makeSearchBot\(\) : makeBot\(v\)\)/.test(cabThink) &&
        /nSearch: bot\.nSearch \|\| 0/.test(cabThink))
}

// ── run replay (#3225): the cabinet logs packed inputs; a replay re-steps ──
{
    const all = { left: true, right: false, up: true, down: false, a: true, b: true }
    ok('input pack roundtrip', JSON.stringify(unpackIn(packIn(all))) === JSON.stringify(all))
    ok('empty input packs to zero', packIn({}) === 0)

    const s = makeGame(7, 'run'); s.phase = 'play'
    const bot = makeBot(); const log = []; const hs = []
    let t = 0
    while (!s.done && t++ < 120 * 60) {
        const p = botPad(stateOf(s), bot)
        // mutate 'replay': the LOG lies about B while the ridden input stays true
        log.push(packIn(MUT === 'replay' ? { ...p, b: false } : p))
        step(s, p)
        hs.push(hashState(s))
    }
    ok('replay base: bot line completes', s.done === true, `${log.length} ticks`)

    const s2 = makeGame(7, 'run'); s2.phase = 'play'
    let ident = log.length > 0
    for (let i = 0; i < log.length && ident; i++) {
        step(s2, unpackIn(log[i]))
        if (hashState(s2) !== hs[i]) ident = false
    }
    ok('input-log replay rides the identical line',
        ident && s2.tick === s.tick && s2.score === s.score && s2.won,
        `${log.length} ticks, score=${s2.score}, won=${s2.won}`)
}

// ── the music bed (#3167) ─────────────────────────────────────────────────
{
    const bar = Array.from({ length: BAR }, (_, i) => bedVoices(i))
    ok('bed: every bar carries a full groove', bar.reduce((n, v) => n + v.length, 0) >= 12,
        `${bar.reduce((n, v) => n + v.length, 0)} voices/${BAR} steps`)
    const shapesOk = bar.every(vs => vs.length <= 3 && vs.every(n =>
        n.d > 0 && n.g > 0 && n.g < 0.3 && (n.hat || (isFinite(n.f) && n.f > 40 && n.f < 1200))))
    ok('bed: voices well-formed (finite pitch, sane levels)', shapesOk)
    ok('bed: scheduler wraps cleanly (negative indices)',
        JSON.stringify(bedVoices(-3)) === JSON.stringify(bedVoices(13)) && bedVoices(BAR).length === bar[0].length)
    let mono = true
    let prev = null
    for (let k = 0; k <= 9; k += 0.5) {
        const t = landThud(k)
        if (!(t.f > 40 && t.g > 0 && t.g <= 0.25 && t.d > 0)) mono = false
        if (prev && !(t.f <= prev.f && t.g >= prev.g)) mono = false
        prev = t
    }
    ok('land thud: heavier impact = lower pitch + louder (height-scaled)', mono,
        `v0=${landThud(0).f.toFixed(0)}Hz v9=${landThud(9).f.toFixed(0)}Hz`)
    // #3379: attract ducks the bed to 0.6 so the banked line sits under the title, but its
    // own trick/bail/win voices were still playing at street gain — louder than the game.
    // One attract multiplier must bring the whole voice bank down WITH the music: strict
    // (below street), proportional in g, never inverted, never muted to silence.
    ok('attract sfx duck: quieter than street but never silent',
        ATTRACT_SFX > 0 && ATTRACT_SFX < 1 && sfxGain(0.11, true) < 0.11 && sfxGain(0.11, true) > 0,
        `ATTRACT_SFX=${ATTRACT_SFX}`)
    ok('attract sfx duck: street gain untouched', sfxGain(0.11, false) === 0.11 && sfxGain(0.32, false) === 0.32)
    let duckOk = true
    for (const g of [0.04, 0.07, 0.11, 0.32]) {
        if (!(sfxGain(g, true) < sfxGain(g, false))) duckOk = false
        if (Math.abs(sfxGain(g, true) / sfxGain(g, false) - ATTRACT_SFX) > 1e-12) duckOk = false
    }
    ok('attract sfx duck: every voice scaled by the same factor (proportional)', duckOk,
        `bail 0.32→${sfxGain(0.32, true).toFixed(3)}, win 0.11→${sfxGain(0.11, true).toFixed(3)}`)
    // wiring: the cabinet must actually schedule the bed and voice the thud.
    // MUT=bed strips the scheduler call — the gate must see red.
    const cab = readFileSync(new URL('../src/games/GrindCity/index.jsx', import.meta.url), 'utf8')
    const src = MUT === 'bed' ? cab.replace(/bedVoices\(/g, 'silence(')
        : MUT === 'sfxduck' ? cab.replace('const vs = attractMode ? ATTRACT_SFX : 1', 'const vs = 1')
        : cab
    ok('bed wired into the cabinet loop (#3167)',
        /from '\.\/music\.js'/.test(src) && /bedVoices\(/.test(src) && /landThud\(/.test(src) && /bed: bedT/.test(src))
    // #3379: the attract duck must live in sound() (not just music.js), and the
    // contract must expose it so the browser drive can see attract vs street gain.
    ok('sfx duck wired into sound() + contract (#3379)',
        /const vs = attractMode \? ATTRACT_SFX : 1/.test(src) && /sfxDuck:/.test(cab) && /0\.07 \* vs/.test(src) && /0\.11 \* vs/.test(src))
}

// ── baked curvature shading (#3233 tail) — visual-only math must stay real ──
{
    const plaza = shadeAt(0, -12)
    const bowl = shadeAt(38, -7)
    const secret = shadeAt(26, 6)
    const crest = shadeAt(-20, 14)
    ok('shade: flat plaza stays neutral', Math.abs(plaza - 1) < 0.02, `plaza=${plaza.toFixed(3)}`)
    ok('shade: bowl/secret basins sit darker', bowl < 0.97 && secret < 0.97 && bowl > 0.6 && secret > 0.6,
        `bowl=${bowl.toFixed(3)} secret=${secret.toFixed(3)}`)
    ok('shade: quarterpipe crest catches sun', crest > 1.02 && crest < 1.15, `crest=${crest.toFixed(3)}`)
    // wiring: the park mesh must multiply the curvature shade into vertex colors and give
    // the concrete bump relief. MUT=shade strips both — the gate must see red.
    const art = readFileSync(new URL('../src/games/GrindCity/art.js', import.meta.url), 'utf8')
    const artSrc = MUT === 'shade' ? art.replace(/shadeAt\(/g, 'noShade(').replace(/bumpMap:/g, 'noBump:') : art
    ok('shade wiring: mesh AO multiply + bump relief (#3233)',
        /shadeAt\(x, z\)/.test(artSrc) && /bumpMap:/.test(artSrc))
}

// ── manual identity (#3233 tail) — live name + honest growing value ────────
{
    const idle = stateOf(makeGame(9, 'run'))
    ok('manual tell: nothing shown while no manual is held', idle.manualName === null && idle.manualPts === 0)

    // ollie → land → press A again inside the grace window = manual. Plaza east
    // of the plaza rail, straight +x: no rails, lips or letters on this line.
    const s = makeGame(9, 'run'); s.phase = 'play'
    s.x = 10; s.z = -14; s.y = parkHeight(10, -14); s.heading = 0; s.speed = 6
    step(s, { a: true })
    let t = 0
    while (t++ < 40 && !s.air) step(s, { a: true })
    while (t++ < 200 && s.air) step(s, { a: true })          // stay aboard through the landing
    step(s, { a: false })                                     // edge-reset inside the 0.22 s grace
    step(s, { a: true })                                      // press again = manual
    const s1 = stateOf(s)
    ok('manual tell: lands into MANUAL at its base value',
        s1.manual && s1.manualName === 'MANUAL' && s1.manualPts === 30, `${s1.manualName} +${s1.manualPts}`)
    let h = 0
    while (h++ < 30 && s.manual && !s.manual.spin) step(s, { a: true, right: true })
    const s2 = stateOf(s)
    ok('manual tell: steer past 0.35 s renames it MANUAL 180', s2.manualName === 'MANUAL 180', `after ${h} ticks`)
    ok('manual tell: the upgrade re-bases the value upward', s2.manualPts > s1.manualPts + 60, `+${s1.manualPts} → +${s2.manualPts}`)
    let g = 0
    while (g++ < 24 && s.manual) step(s, { a: true })
    const live = stateOf(s).manualPts
    ok('manual tell: the value ticks up while held', live > s2.manualPts, `+${s2.manualPts} → +${live}`)
    const cp = s.chainPts
    step(s, { a: false })                                     // release: commit NOW
    ok('manual tell: the chip never lies — live value equals the payout',
        s.chainPts - cp === live && s.chain.includes('Manual180'), `chip +${live}, paid +${s.chainPts - cp}`)

    // wiring: the cabinet reads the identity and voices the upgrade; the rig
    // still poses the two manuals differently. MUT=tell strips all three.
    const cab = readFileSync(new URL('../src/games/GrindCity/index.jsx', import.meta.url), 'utf8')
    const art = readFileSync(new URL('../src/games/GrindCity/art.js', import.meta.url), 'utf8')
    const cabSrc = MUT === 'tell' ? cab.replace(/st\.manualName/g, 'null').replace(/st\.manualPts/g, '0').replace(/'manual180'/g, "'nope'") : cab
    const artSrc = MUT === 'tell' ? art.replace(/s\.manual\.spin/g, 's.manual.fictional') : art
    ok('tell wiring: chip reads live identity + upgrade has its own voice + poses differ (#3233)',
        /st\.manualName/.test(cabSrc) && /st\.manualPts/.test(cabSrc) && /'manual180'/.test(cabSrc) && /s\.manual\.spin/.test(artSrc))
}

// ── replay tail (#3374): near-miss trigger + attract best line ─────────────
{
    ok('replay trigger: window law unchanged — 119 cold ticks silent, 120 plays',
        replayWorthy(REPLAY_MIN - 1, 0) === false && replayWorthy(REPLAY_MIN, 0) === true)
    ok('replay trigger: banked letters earn the replay however short the run',
        replayWorthy(0, 1) === true && replayWorthy(REPLAY_MIN - 1, 5) === true)
    ok('replay trigger: law is total — garbage reads as cold',
        replayWorthy(undefined, undefined) === false && replayWorthy(-50, -1) === false)

    // The situation is real, not a truth-table decoration: a seeded sim that
    // banked a letter and died inside the window passes replayWorthy; the
    // letterless twin in the same spot still stays silent.
    const mk = (got) => {
        const s = makeGame(7, 'run'); s.phase = 'play'
        let t = 0
        while (t++ < 60) step(s, {})          // one second of coasting…
        s.letters = got ? { S: true } : {}   // set AFTER the coast: the spawn line
        s.timeLeft = 0; step(s, {})          // can pick letters up naturally — state first
        return { t, letters: Object.keys(s.letters).length, over: s.phase === 'over' }
    }
    const hot = mk(true), cold = mk(false)
    ok('replay trigger: near-miss situation exists (letters in, under window, run over)',
        hot.over && hot.letters === 1 && hot.t < REPLAY_MIN && replayWorthy(hot.t, hot.letters) === true,
        `t=${hot.t}`)
    ok('replay trigger: the letterless twin under the window stays silent (old flow unchanged)',
        cold.over && replayWorthy(cold.t, cold.letters) === false, `t=${cold.t}`)

    const r0 = { score: 500, letters: 2, won: false }
    const rHi = { score: 900, letters: 1, won: false }
    const rLet = { score: 500, letters: 3, won: false }
    ok('bestline: higher score wins either round — null folds cleanly',
        betterLine(null, r0) === r0 && betterLine(r0, null) === r0 &&
        betterLine(r0, rHi) === rHi && betterLine(rHi, r0) === rHi)
    ok('bestline: score tie pays the letters whichever side they sit on',
        betterLine(r0, rLet) === rLet && betterLine(rLet, r0) === rLet)
    ok('bestline: full tie gives it to the newer run',
        betterLine({ ...r0 }, r0) === r0)

    // Wiring: the cabinet gates replay through the law, badges the near replay,
    // and folds every finished run into the session best the attract card shows.
    // MUT=nearmiss reverts the gate to the old letterless trigger; MUT=bestline
    // flips the law to prefer stale. Each must see red.
    const cabRaw = readFileSync(new URL('../src/games/GrindCity/index.jsx', import.meta.url), 'utf8')
    const simRaw = readFileSync(new URL('../src/games/GrindCity/sim.js', import.meta.url), 'utf8')
    const cab = MUT === 'nearmiss' ? cabRaw.replace('replayWorthy(inputLog.length, lettersGot)', 'inputLog.length >= REPLAY_MIN') : cabRaw
    ok('near-miss wiring: cabinet calls the law with live letters + wears the badge (#3374)',
        /replayWorthy\(inputLog\.length, lettersGot\)/.test(cab) &&
        /const lettersGot = Object\.keys\(sim\.letters\)\.length/.test(cab) &&
        /NEAR MISS — LETTERS COUNT/.test(cab) && /replayNear = inputLog\.length < REPLAY_MIN/.test(cab))
    const simSrc = MUT === 'bestline' ? simRaw.replace('run.score > prev.score ? run : prev', 'run.score > prev.score ? prev : run') : simRaw
    ok('bestline wiring: sim law prefers the higher run; cabinet folds runs + shows the chip (#3374)',
        /run\.score > prev\.score \? run : prev/.test(simSrc) &&
        /bestLine = betterLine\(prevBest, cand\)/.test(cab) && /BEST LINE/.test(cab))

    // Attract loop: when a line is banked, attract re-rides it (seed + pads),
    // the bot stays the no-history fallback, and a fresh harness session forgets.
    // MUT=bankline makes attract ignore the banked log — the pin must see red.
    const cabDrive = MUT === 'bankline'
        ? cabRaw.replace('bankedPad || (bot.thinks ? searchPad(sim, bot) : botPad(stateOf(sim), bot))',
            '(bot.thinks ? searchPad(sim, bot) : botPad(stateOf(sim), bot))')
        : cabRaw
    ok('attract loop wiring: banked line drives attract, bot is the fallback, reset forgets (#3374)',
        /bestLog = inputLog\.slice\(\)/.test(cabDrive) &&
        /if \(inputLog\.length >= REPLAY_MIN\) \{\s*bestSeed = sim\.seed/.test(cabDrive) &&
        /attractIdx >= bestLog\.length/.test(cabDrive) &&
        /unpackIn\(bestLog\[attractIdx\+\+\]\)/.test(cabDrive) &&
        /bankedPad \|\| \(bot\.thinks \? searchPad\(sim, bot\) : botPad\(stateOf\(sim\), bot\)\)/.test(cabDrive) &&
        /makeGame\(bestLog\.length \? bestSeed : freshSeed\(\), 'run'\)/.test(cabDrive) &&
        /bestSeed = 0; bestLog = \[\]; attractIdx = 0/.test(cabDrive))

    // ── saved/shared runs (#3381) ─────────────────────────────────────────
    // The wire: one URL-safe char per 6-bit pad word, seed/score/ticks in a
    // canonical base36 header. Behaviour pins prove the codec is exact and
    // total; the re-sim pin proves the decoded line skates IDENTICALLY.
    const all64 = []
    for (let i = 0; i < 400; i++) all64.push((i * 7919) % 64)
    const codeHi = encodeLine({ seed: 0xffffffff, log: all64, score: 12340 })
    const backHi = decodeLine(codeHi)
    ok('share codec: full-alphabet line round-trips exactly both ways, top seed included',
        !!codeHi && !!backHi && backHi.seed === 0xffffffff && backHi.score === 12340 &&
        backHi.log.length === all64.length && backHi.log.every((w, i) => w === all64[i]) &&
        encodeLine({ seed: backHi.seed, log: backHi.log, score: backHi.score }) === codeHi)
    const zero = decodeLine(encodeLine({ seed: 0, log: [0, 0, 0], score: 0 }))
    ok('share codec: a coasting seed-zero line survives the wire (zeroes are legal)',
        !!zero && zero.seed === 0 && zero.score === 0 && zero.log.length === 3 && zero.log.every((w) => w === 0))
    ok('share codec: decode is total — junk, non-canonical headers and broken counts give null',
        decodeLine('') === null && decodeLine('zz') === null && decodeLine('1.0.2.A!') === null &&
        decodeLine('00.0.3.AAA') === null && decodeLine(null) === null && decodeLine('1.0.0.') === null &&
        decodeLine('1.-1.2.AA') === null && decodeLine('1.0.3.AA') === null && decodeLine(7) === null &&
        decodeLine(`1.0.${(SHARE_MAX_TICKS + 1).toString(36)}.A`) === null)
    ok('share codec: encode is total too — junk logs and out-of-range numbers give null',
        encodeLine(null) === null && encodeLine({ seed: 1, log: [], score: 0 }) === null &&
        encodeLine({ seed: 1, log: [64], score: 0 }) === null && encodeLine({ seed: 1, log: [1.5], score: 0 }) === null &&
        encodeLine({ seed: -1, log: [1], score: 0 }) === null && encodeLine({ seed: 1, log: [1], score: -5 }) === null &&
        encodeLine({ seed: 1, log: new Array(SHARE_MAX_TICKS + 1).fill(1), score: 0 }) === null &&
        encodeLine({ seed: 1, log: new Array(SHARE_MAX_TICKS).fill(0), score: 0 }) !== null)
    {
        const s = makeGame(4242, 'run'); s.phase = 'play'
        const bot2 = makeBot(); const lg = []
        let t = 0
        while (t++ < 200 && s.phase === 'play') { const p = botPad(stateOf(s), bot2); lg.push(packIn(p)); step(s, p) }
        const code = encodeLine({ seed: 4242, log: lg, score: s.score })
        const d = decodeLine(code)
        const r1 = makeGame(4242, 'run'); r1.phase = 'play'
        const r2 = makeGame(d.seed, 'run'); r2.phase = 'play'
        for (let i = 0; i < lg.length; i++) { step(r1, unpackIn(lg[i])); step(r2, unpackIn(d.log[i])) }
        ok('share codec: a decoded bot line re-sims byte-identical to the original',
            code !== null && hashState(r1) === hashState(r2), `${lg.length} ticks, score ${s.score}`)
    }

    // The strict all-time law: recency alone must never fake a record — the
    // badge and the storage write both read it.
    const rec = { score: 1000, letters: 2, won: false }
    ok('beatsLine: any line beats no record; an EQUAL line does NOT beat one',
        beatsLine(null, rec) === true && beatsLine(rec, { ...rec }) === false &&
        beatsLine(rec, { score: 1001, letters: 0 }) === true && beatsLine(rec, { score: 999, letters: 5 }) === false &&
        beatsLine(rec, { score: 1000, letters: 3 }) === true && beatsLine(rec, { score: 1000, letters: 1 }) === false)

    // What may live in localStorage — same shape the attract bank rides.
    const goodBank = { v: 1, seed: 7, log: new Array(REPLAY_MIN).fill(2), score: 500, letters: 2, won: false }
    ok('validBank: honest bank passes; version drift, short log, junk word, fake numbers all fail',
        validBank(goodBank) === true && validBank({ ...goodBank, v: 2 }) === false &&
        validBank({ ...goodBank, log: goodBank.log.slice(0, REPLAY_MIN - 1) }) === false &&
        validBank({ ...goodBank, log: [...goodBank.log.slice(0, 5), 64, ...goodBank.log.slice(6)] }) === false &&
        validBank(null) === false && validBank([]) === false && validBank('x') === false &&
        validBank({ ...goodBank, letters: 6 }) === false && validBank({ ...goodBank, won: 'yes' }) === false &&
        validBank({ ...goodBank, score: -1 }) === false)

    // Wiring. MUT=codec corrupts the wire one char off; MUT=beats lets a tie
    // fake a record; MUT=store weakens the validator; MUT=sharewire unbinds
    // the key. Each must see red.
    const simMut = MUT === 'codec' ? simRaw.replace('body += B64[w]', 'body += B64[(w + 1) & 63]')
        : MUT === 'beats' ? simRaw.replace('(run.letters || 0) > (prev.letters || 0)\n}', '(run.letters || 0) >= (prev.letters || 0)\n}')
            : MUT === 'store' ? simRaw.replace('b.log.length >= REPLAY_MIN', 'b.log.length >= 0')
                : simRaw
    ok('save wiring: store read validated + written only through the strict law (#3381)',
        /const STORE_KEY = 'grindcity\.best\.v1'/.test(cab) &&
        /validBank\(b\)/.test(cab) &&
        /window\.localStorage\.setItem\(STORE_KEY, JSON\.stringify\(storedBank\)\)/.test(cab) &&
        /beatsLine\(storedRec, cand\)/.test(cab) &&
        /b\.log\.length >= REPLAY_MIN/.test(simMut) &&
        /run\.score > prev\.score\s+return \(run\.letters \|\| 0\) > \(prev\.letters \|\| 0\)/.test(simMut) &&
        /body \+= B64\[w\]/.test(simMut))
    const cabShare = MUT === 'sharewire' ? cabRaw.split('KeyS').join('KeyX') : cabRaw
    ok('share wiring: S copies on replay + over, deep link rides the attract, badges exist (#3381)',
        (cabShare.match(/c === 'KeyS'/g) || []).length === 2 &&
        /decodeLine\(new URLSearchParams\(window\.location\.search\)\.get\('line'\)\)/.test(cabShare) &&
        /unpackIn\(sharedLine\.log\[sharedIdx\+\+\]\)/.test(cabShare) &&
        /SHARED LINE · \{sharedPts\} PTS/.test(cabShare) &&
        /NEW ALL-TIME LINE/.test(cabShare) &&
        /ALL-TIME BEST LINE/.test(cabShare) &&
        /LINE COPIED — SEND IT/.test(cabShare) &&
        /window\.localStorage\.removeItem\(STORE_KEY\)/.test(cabShare))
}

if (MUT) {
    if (fails > 0) { console.log(`mutate ${MUT}: caught (${fails} red)`); process.exit(0) }
    console.log(`mutate ${MUT}: SURVIVED — check is toothless`); process.exit(1)
}
console.log(fails === 0 ? 'ALL GREEN' : `${fails} FAILURES`)
process.exit(fails === 0 ? 0 : 1)
