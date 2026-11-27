// kongcheck — DONKEY KONG (#1637 batch 27) in plain Node.
// The girder physics, ladder dives, crush deaths, barrel-jump points and the
// top-platform win were closure locals in index.jsx — unprovable without a
// browser. sim.js lifted them verbatim; this gate pins what is true now: one
// seeded stream (?seed=N replays the barrel pattern), the seven-girder level
// with dead broken ladders, the arcade's random ladder dive, the 100-point
// barrel arc, the 1000-point lap, the terminal — and the WATCH route: 24 seeds
// of seated play that zigzag the girders, arc the barrels, win, and (almost
// always) never die. `--mutant` re-plants the pre-lift failures and the seat
// rot; every mutant MUST turn something red.
//
//   npm run kongcheck
//   npm run kongcheck -- --mutant

import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { START_LIVES, BONUS_START, BONUS_DROP, BONUS_TICK, CAPTURE_TICKS, BARREL_SPEED, HAMMER_SWINGS, RIVET_SCORE, PULL_TICKS, COLLAPSE_TICKS, RIVET_X, DK_PLAT, TOP_PLAT, DK_FALL_STOP, BREAK_FRACS, BARREL_CLICK_EVERY, BARREL_CLICK_RANGE, barrelBoardVoice, barrelDangleVoice, barrelRollClick, BRACE_WIDTH, BRACE_PLATE, BRACE_PAD, barrelRideFrame, spanBoardY, makeRun, tickDonkeyKong, watchStep, stateHash, rnd, getPlatformY, buildLevel, platformIndex } from '../src/games/DonkeyKong/sim.js'
import { seedRng, seedFromQuery } from '../src/utils/gameContract.js'
import { parseGaps } from './lib/idle.mjs'
import { plant, pull } from './lib/mutateguard.mjs'

const SIM = readFileSync('src/games/DonkeyKong/sim.js', 'utf8')
const IDX = readFileSync('src/games/DonkeyKong/index.jsx', 'utf8')
const REG = readFileSync('src/config/games.js', 'utf8')

let fails = 0, passes = 0
const ok = (cond, name, detail = '') => {
    if (cond) { passes++; console.log(`  ok   ${name}`) }
    else { fails++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

// #3786 — the fuse is a law of the RUN, not of the barrel. Physics rigs that
// hold a parked site open for thousands of ticks would otherwise catch a
// capture at 3000 ticks mid-scan: the board resets, the world freezes at the
// terminal, and the stream the scan measures disappears. Top the counter up —
// these rigs test steel, not stakes (§bonus-timer above owns the fuse law).
const noFuse = (g) => { g.bonus = Number.MAX_SAFE_INTEGER; return g }

// ------------------------------------------------------------- seeded dice ----
console.log('seeded stream: the dice live inside gs')
{
    ok(seedFromQuery('?seed=777') === 777, '?seed=N parses for the pin')
    const a = makeRun(4242), b = makeRun(4242)
    const sa = [], sb = []
    for (let i = 0; i < 200; i++) { sa.push(rnd(a)); sb.push(rnd(b)) }
    ok(sa.join() === sb.join(), 'same seed → identical 200-draw stream')
    const c = makeRun(4243)
    ok(rnd(c) !== sa[0], 'different seed → different stream')
    // b16 law: the in-gs stream matches the shipped seedRng step-for-step.
    const outer = seedRng(31337)
    const inner = makeRun(31337)
    let stepEq = true
    for (let i = 0; i < 100; i++) if (Math.abs(outer() - rnd(inner)) > 1e-12) stepEq = false
    ok(stepEq, 'rnd(gs) is step-identical to seedRng(seed) (#1473 replay holds)')
    ok(!/\bMath\.random\b/.test(SIM), 'the sim draws no dice outside the stream (b25 law)')
    ok(/watching \? watchStep\(gs\)/.test(SIM), 'the seat drives the sim through watchStep, not a bench script')
    ok(/const WATCH_HORIZON = 90/.test(SIM), 'the horizon stays 90 ticks — a dive needs the full runway (#1637 b27)', 'shorten only with a re-measured sweep')
}

// ----------------------------------------------------------- level geometry ----
console.log('the site: seven girders, dead broken ladders')
{
    const { platforms, ladders } = buildLevel()
    ok(platforms.length === 7, 'seven girders (ground to her platform)', `${platforms.length}`)
    ok(platforms.some(p => p.slope > 0) && platforms.some(p => p.slope < 0), 'girders slope both ways (barrels roll down-hill)')
    const broken = ladders.filter(l => l.broken)
    ok(broken.length === 4, 'four broken ladders flicker as bait', `${broken.length}`)
    // #3618 half-rungs: the seat never trusts a broken ladder — untagged UP
    // at its foot stays refused (the human half-climb lives in the section
    // below; a human mounting from the foot with DOWN is refused too).
    const gs = makeRun(11)
    gs.attract = false
    const b0 = broken[0] // x=120 between ground and girder 1
    gs.player.x = b0.x - gs.player.w / 2
    gs.player.y = b0.yBot - gs.player.h
    gs.player.grounded = true
    tickDonkeyKong(gs, { up: true })
    ok(!gs.player.climbing, 'the seat never trusts a broken rung (untagged UP is refused)')
    // The route ladder does mount and delivers to the girder above. Mounting
    // means standing ON the lower girder at the ladder x (feet on its surface)
    // and holding UP — the runner climbs out and snaps onto the girder above.
    const gs2 = makeRun(11)
    gs2.attract = false
    const l = gs2.ladders.find(la => la.x === 180 && !la.broken)
    gs2.player.x = l.x - gs2.player.w / 2
    gs2.player.y = l.yBot - gs2.player.h // standing on the ground floor at the ladder
    gs2.player.grounded = true
    let climbed = false, arrived = false
    for (let i = 0; i < 90; i++) {
        tickDonkeyKong(gs2, { up: !arrived })
        if (gs2.player.climbing) climbed = true
        if (climbed && !gs2.player.climbing && gs2.player.grounded && gs2.player.y < 216) arrived = true
    }
    const surf = getPlatformY(gs2.platforms[1], l.x)
    ok(climbed && arrived && Math.abs(gs2.player.y + gs2.player.h - surf) <= 2,
        'a held UP at the ladder foot climbs and snaps onto the girder above',
        `y=${gs2.player.y.toFixed(1)} surf=${surf.toFixed(1)}`)
}

// ------------------------------------------------------------- half-rungs ----
// #3618 — the original let Mario climb broken ladders part-way. A broken
// ladder keeps its lower span: mount with direct hands, climb to breakY, hang
// on the last rung, descend back. The WATCH seat and attract demo refuse
// broken rungs exactly as before (untagged input), so every seeded rollout
// rides the byte-identical world it always did.
console.log('half-rungs: broken ladders climb part-way (#3618)')
{
    const { ladders } = buildLevel()
    ok(ladders.every(l => l.broken
        ? l.breakY > l.yTop + 1 && l.breakY < l.yBot - 1
        : l.breakY === l.yTop),
        'break lines sit strictly inside the broken spans; sound ladders stay whole')
    ok(JSON.stringify(buildLevel().ladders) === JSON.stringify(buildLevel().ladders),
        'the break lines are deterministic — the level still carries no dice')

    const climbBroken = (seed, ladderX) => {
        const gs = makeRun(seed)
        gs.attract = false
        const bl = gs.ladders.find(l => l.x === ladderX && l.broken)
        gs.player.x = bl.x - gs.player.w / 2
        gs.player.y = bl.yBot - gs.player.h
        gs.player.grounded = true
        return { gs, bl }
    }

    const { gs, bl } = climbBroken(3, 120)
    const ev0 = tickDonkeyKong(gs, { up: true, human: true })
    ok(ev0.climbed && gs.player.climbing && gs.player.climbLadder === bl,
        'hands on a broken ladder: the lower span mounts (#3618)')
    let hangEvents = 0, minY = 999
    for (let i = 0; i < 120; i++) {
        const ev = tickDonkeyKong(gs, { up: true, human: true })
        if (ev.hang) hangEvents++
        minY = Math.min(minY, gs.player.y + gs.player.h)
    }
    ok(Math.abs(minY - bl.breakY) <= 1.5,
        `the climb stops at the break line (feet ${minY.toFixed(1)} vs breakY ${bl.breakY.toFixed(1)})`)
    ok(gs.player.climbing && gs.player.hanging, 'the runner hangs on the last rung, never falls')
    ok(hangEvents === 1, 'the hang answers once, not every tick', `hangEvents=${hangEvents}`)
    ok(gs.player.y + gs.player.h > bl.yTop + 4, 'the top of a broken ladder stays out of reach')

    for (let i = 0; i < 120; i++) tickDonkeyKong(gs, { down: true, human: true })
    ok(!gs.player.climbing && gs.player.grounded && Math.abs(gs.player.y + gs.player.h - bl.yBot) <= 2,
        'from the hang you climb back down and step onto the girder')

    // DOWN at the foot is refused — the half-ladder rises from its base, up only
    const gsd = climbBroken(3, 120)
    const evD = tickDonkeyKong(gsd.gs, { down: true, human: true })
    ok(!gsd.gs.player.climbing && evD.noClimb, 'DOWN at a broken ladder foot is refused (rungs climb up)')

    // the seat taking the wheel on a hang steps off — doctrine, not a deadlock
    const gsh = climbBroken(3, 120)
    for (let i = 0; i < 60; i++) tickDonkeyKong(gsh.gs, { up: true, human: true })
    gsh.gs.watching = true
    tickDonkeyKong(gsh.gs, null)
    ok(!gsh.gs.player.climbing, 'the seat inherits a hang and steps off the broken rung')

    // every broken ladder plays by the same rule (feet clamp to its breakY)
    for (const [x, frac] of [[120, BREAK_FRACS[0]], [110, BREAK_FRACS[1]], [140, BREAK_FRACS[2]], [90, BREAK_FRACS[3]]]) {
        const run = climbBroken(5, x)
        for (let i = 0; i < 120; i++) tickDonkeyKong(run.gs, { up: true, human: true })
        const stop = run.gs.player.y + run.gs.player.h
        ok(Math.abs(stop - run.bl.breakY) <= 1.5 && run.gs.player.hanging &&
            Math.abs(run.bl.breakY - (run.bl.yTop + (run.bl.yBot - run.bl.yTop) * frac)) < 1e-9,
            `broken ladder x=${x} hands you the span up to its break line`,
            `feet ${stop.toFixed(1)} vs ${run.bl.breakY.toFixed(1)}`)
    }

    // README honesty: the closed gaps must not score as open weakness again
    const RD = readFileSync('src/games/DonkeyKong/README.md', 'utf8')
    const gaps = parseGaps(RD)
    ok(!gaps.some(g => /broken ladders only flicker/i.test(g)),
        'the half-rung gap no longer scores as open (CLOSED marker reaches parseGaps)')
    ok(!gaps.some(g => /dedicated 25 m rivet stage/i.test(g)),
        'the rivet-screen phantom stays retired (CLOSED marker reaches parseGaps)')
    ok(!gaps.some(g => /double-board drop onto a span|sharing one span.*simplified/i.test(g)),
        'the double-board gap is closed with the span body law (CLOSED marker reaches parseGaps)')
    ok(gaps.length === 1, 'one honest gap remains (oil drum flame)', `gaps=${gaps.length}`)
}

// ------------------------------------------------------------- core physics ----
console.log('rules: gravity, jump, crush, dive, arc, lap, terminal')
{
    // Jump: full grounded hop returns to the girder. The test stands in the
    // right-hand pocket (x>208) — everywhere else the 40 px arc reaches girder
    // 1 from the ground (that is why jump candidates stay barrel-gated: the
    // arcade doctrine forbids kangarooing the tower, the physics does not).
    const gs = makeRun(7)
    gs.attract = false
    gs.player.x = 213
    tickDonkeyKong(gs, null) // settle grounded
    const y0 = gs.player.y
    ok(gs.player.grounded, 'ground floor holds the runner at the start')
    const evJ = tickDonkeyKong(gs, { jump: true })
    ok(evJ.jump && gs.player.vy < 0, 'Space launches an arc')
    let landed = -1
    for (let i = 1; i < 90; i++) {
        const ev = tickDonkeyKong(gs, null)
        if (ev.jump) ok(false, 'jump must require the ground', `re-jump at +${i}`)
        if (gs.player.grounded) { landed = i; break }
    }
    ok(landed > 10 && landed < 60, `the arc lands (~${landed} ticks) back on the girder`)
    ok(Math.abs(gs.player.y - y0) <= 4, 'the hop returns to the same surface', `y0=${y0} y=${gs.player.y}`)

    // Crush death: a barrel on the chest kills; 90-tick animation costs a life.
    // Contact offset ~4 px: inside the arcade kill box (|dx|<8,|dy|<10), well
    // outside any shrunk-box mutant's "safe" center.
    const d = makeRun(7)
    d.attract = false
    tickDonkeyKong(d, null)
    d.barrels.push({ x: d.player.x + 5, y: d.player.y - 3, w: 10, h: 10, vx: 0, vy: 0, rot: 0, onLadder: false, falling: false })
    const evD = tickDonkeyKong(d, null)
    ok(evD.died && d.deathTimer === 90 && d.lives === START_LIVES, 'contact with a barrel kills (90-tick animation before the life is spent)')
    for (let i = 0; i < 95; i++) tickDonkeyKong(d, null)
    ok(d.lives === START_LIVES - 1 && d.barrels.length === 0, 'the life is spent and the board is cleared for the retry')
    // Terminal at zero lives.
    const t = makeRun(7)
    t.attract = false
    t.lives = 1
    tickDonkeyKong(t, null)
    t.barrels.push({ x: t.player.x + 5, y: t.player.y - 3, w: 10, h: 10, vx: 0, vy: 0, rot: 0, onLadder: false, falling: false })
    tickDonkeyKong(t, null)
    for (let i = 0; i < 95; i++) if (tickDonkeyKong(t, null).over) break
    ok(t.over && t.lives === 0, 'the run reaches an honest terminal at 0 lives')

    // Barrels: none before the first throw; then a steady 150–250 tick rhythm
    // and down-hill rolls; ladders take divers.
    const s = makeRun(99)
    s.attract = false
    let firstBarrel = -1, spawns = 0, dives = 0, maxSeen = 0
    for (let i = 0; i < 3000; i++) {
        const ev = tickDonkeyKong(s, null)
        if (ev.barrel && firstBarrel < 0) firstBarrel = i
        if (ev.barrel) spawns++
        for (const b of s.barrels) if (b.onLadder) dives++
        maxSeen = Math.max(maxSeen, s.barrels.length)
    }
    ok(firstBarrel >= 179 && firstBarrel <= 181, `the first barrel ships on the 180-tick fuse`, `${firstBarrel}`)
    ok(spawns >= 14 && spawns <= 21, `the die spaces throws 150–250 ticks (got ${spawns} in 3000)`)
    ok(maxSeen >= 2, 'the field stacks barrels (throws outpace exits)')
    ok(dives > 0, 'a rolled barrel eventually takes a ladder down (35% dive)', `dives=${dives}`)
    ok(s.barrels.every(b => Math.abs(b.vx) <= BARREL_SPEED + 1e-9), 'no barrel outruns the arcade roll speed')

    // Barrel arc: leap a rolling barrel from the ground floor → +100. The
    // jump must fire while it is 8–14 px out on the near side: closer and the
    // kill box (|dx|<8) catches the takeoff, farther and the arc lands on its
    // path. Spawned left of the runner (the right edge is off the map).
    const g2 = makeRun(505)
    g2.attract = false
    g2.player.x = 213 // open pocket: the arc returns to the ground here
    tickDonkeyKong(g2, null)
    g2.barrels.push({ x: g2.player.x - 30, y: 232 - 10, w: 10, h: 10, vx: BARREL_SPEED, vy: 0, rot: 0, onLadder: false, falling: false })
    let scoreEv = 0
    let jumpPop = null
    for (let i = 0; i < 60 && !scoreEv; i++) {
        const b = g2.barrels[0]
        if (!b) break
        const gap = (b.x + b.w / 2) - (g2.player.x + g2.player.w / 2)
        const ev = tickDonkeyKong(g2, { jump: g2.player.grounded && gap > -14 && gap < -8 })
        if (ev.died) break
        scoreEv = ev.jumpedBarrel
        if (scoreEv && g2.popups.length) jumpPop = { ...g2.popups[g2.popups.length - 1] } // #3761
    }
    ok(scoreEv === 1 && g2.score === 100, 'clearing a barrel underfoot scores our house 100 (#3761: the arcade price could not be verified)', `score=${g2.score}`)
    ok(!!jumpPop && jumpPop.text === '+100' && jumpPop.age === 0, 'the jump-over books its +100 as a popup at the barrel (#3761)', JSON.stringify(jumpPop))

    // #3754 §obstacle-bonus — our scoreboard pays BOTH halves of the obstacle
    // bonus: jump-over 100 (pinned just above) and WALK-PAST 50. #3761: the
    // arcade's exact prices are UNVERIFIED from sources this lane reaches, so
    // the labels say "house", never "arcade". Law (sim.js): a barrel crossing Mario's column below his
    // feet (dy −48..−10 — clear of the |dy|<10 kill box, spanning the 24/32/40
    // px girder gaps) while grounded and alive pays +50 once per barrel.
    {
        const wb = makeRun(7)
        wb.attract = false
        tickDonkeyKong(wb, null)
        wb.player.x = 150
        wb.player.y = 176          // drops onto the sloped girder; physics settles it
        for (let i = 0; i < 10; i++) tickDonkeyKong(wb, null)
        ok(wb.player.grounded, 'walk-past rig: the runner settles grounded on a girder')
        wb.barrels.push({ x: 120, y: 222, w: 10, h: 10, vx: BARREL_SPEED, vy: 0, rot: 0, onLadder: false, falling: false })
        let wbPaid = 0
        let wbPop = null
        for (let i = 0; i < 80; i++) {
            const evw = tickDonkeyKong(wb, null)
            wbPaid += evw.passedBarrel || 0
            if (evw.passedBarrel && wb.popups.length) wbPop = { ...wb.popups[wb.popups.length - 1] } // #3761
        }
        ok(wbPaid === 1 && wb.score === 50, 'a barrel rolling past below the feet pays our house 50 — exactly once', `paid=${wbPaid} score=${wb.score}`)
        ok(!!wbPop && wbPop.text === '+50' && wbPop.age === 0, 'the walk-past books its +50 as a popup at the barrel (#3761)', JSON.stringify(wbPop))
        ok(wb.popups.length === 0, 'popups expire with the loop — the board never litters old bonuses (#3761)', `left=${wb.popups.length}`)

        // Spawn-behind silence: a barrel already astern, rolling away, is not
        // an obstacle cleared.
        const sb = makeRun(7)
        sb.attract = false
        tickDonkeyKong(sb, null)
        sb.player.x = 150; sb.player.y = 176
        for (let i = 0; i < 10; i++) tickDonkeyKong(sb, null)
        sb.barrels.push({ x: 180, y: 222, w: 10, h: 10, vx: BARREL_SPEED, vy: 0, rot: 0, onLadder: false, falling: false })
        for (let i = 0; i < 80; i++) tickDonkeyKong(sb, null)
        ok(sb.score === 0 && sb.player.passedBarrels.size === 0, 'a barrel astern never retro-scores', `score=${sb.score}`)

        // The dead pay nothing: the killer lands at once, and a second barrel
        // crosses under the falling runner during the 90-tick death animation
        // — the books stay at zero.
        const dd = makeRun(7)
        dd.attract = false
        tickDonkeyKong(dd, null)
        dd.player.x = 150; dd.player.y = 176
        for (let i = 0; i < 10; i++) tickDonkeyKong(dd, null)
        const surfY = dd.player.y
        dd.barrels.push({ x: 150 - 4, y: surfY + 3, w: 10, h: 10, vx: 0, vy: 0, rot: 0, onLadder: false, falling: false })
        dd.barrels.push({ x: 110, y: 222, w: 10, h: 10, vx: BARREL_SPEED, vy: 0, rot: 0, onLadder: false, falling: false })
        let ddDied = false
        for (let i = 0; i < 120; i++) ddDied = ddDied || tickDonkeyKong(dd, null).died
        ok(ddDied && dd.score === 0, 'the dead pay nothing — a barrel crossing under a dying runner scores zero', `score=${dd.score} died=${ddDied}`)

        // Witnesses reset with the life: after the respawn both bonus sets are
        // empty, so the retry's passes score fresh.
        const rs = makeRun(7)
        rs.attract = false
        tickDonkeyKong(rs, null)
        rs.player.x = 150; rs.player.y = 176
        for (let i = 0; i < 10; i++) tickDonkeyKong(rs, null)
        rs.barrels.push({ x: 120, y: 222, w: 10, h: 10, vx: BARREL_SPEED, vy: 0, rot: 0, onLadder: false, falling: false })
        for (let i = 0; i < 60; i++) tickDonkeyKong(rs, null)
        // Witnesses reset with the life: a respawned runner starts clean, and
        // the score already banked survives the death.
        rs.lives = START_LIVES
        rs.barrels.push({ x: rs.player.x + 5, y: rs.player.y + 3, w: 10, h: 10, vx: 0, vy: 0, rot: 0, onLadder: false, falling: false })
        let respawned = false
        for (let i = 0; i < 200; i++) {
            tickDonkeyKong(rs, null)
            respawned = respawned || (rs.deathTimer === 0 && rs.barrels.length === 0 && i > 100)
        }
        ok(respawned && rs.score === 50 && rs.player.passedBarrels.size === 0,
            'the retry starts with clean bonus witnesses and keeps the banked score', `score=${rs.score} passed=${rs.player.passedBarrels.size}`)

        // Determinism: the same seed replays byte-identical with the new
        // witness riding the hash.
        const hOf = () => {
            const g3 = makeRun(31)
            g3.attract = false
            tickDonkeyKong(g3, null)
            g3.player.x = 150; g3.player.y = 176
            for (let i = 0; i < 10; i++) tickDonkeyKong(g3, null)
            g3.barrels.push({ x: 120, y: 222, w: 10, h: 10, vx: BARREL_SPEED, vy: 0, rot: 0, onLadder: false, falling: false })
            for (let i = 0; i < 60; i++) tickDonkeyKong(g3, null)
            return `${g3.score}|${stateHash(g3)}`
        }
        ok(hOf() === hOf(), 'walk-past rolls stay deterministic (witness rides the hash)')
    }

    // #3598 — the lap IS the rivet finale: reaching her girder ARMS it,
    // walking the row pulls all four rivets (+100 each), the last one out
    // starts the collapse, and ~2.5 s later the lap banks the remainder of
    // the bonus counter (#3786 — the arcade pays the fuse, not a flat fee)
    // and the board rebuilds fresh. The old instant-win is gone.
    const w = makeRun(7)
    w.attract = false
    w.player.x = 100
    w.player.y = getPlatformY(w.platforms[6], 105) - w.player.h
    const evA = tickDonkeyKong(w, null)
    ok(evA.reached && w.rivetPhase && !evA.won && w.winTimer === 0, 'reaching her girder arms the finale, it no longer rings the lap', `reached=${evA.reached} won=${evA.won}`)
    let lapPulls = 0
    for (let i = 0; i < 1500 && lapPulls < 4; i++) {
        const cx = w.player.x + w.player.w / 2
        const r = w.rivets.find(rr => !rr.pulled)
        const inp = r && Math.abs(r.x - cx) > 5 ? (r.x > cx ? { right: true } : { left: true }) : {}
        const ev = tickDonkeyKong(w, inp)
        if (ev.rivet) lapPulls++
    }
    ok(lapPulls === 4 && w.collapse === 1, 'walking the row pulls all four rivets and the last starts the collapse', `pulls=${lapPulls} collapse=${w.collapse}`)
    let lapWon = false
    for (let i = 0; i < COLLAPSE_TICKS + 5 && !lapWon; i++) lapWon = tickDonkeyKong(w, null).won
    ok(lapWon && w.winTimer === 90, 'the collapse ends in the lap flag', `won=${lapWon}`)
    const bankAt = w.bonus, sAt = w.score // #3786 — the fuse still running at the flag
    let bankPop = false
    for (let i = 0; i < 95; i++) {
        tickDonkeyKong(w, null)
        if (!bankPop) bankPop = w.popups.some(q => q.text === `+${bankAt}`)
    }
    ok(bankAt > 0 && bankAt < BONUS_START && bankAt % BONUS_DROP === 0,
        'the rescue arrives with the fuse still lit, banked in hundreds', `bank=${bankAt}`)
    ok(sAt === 4 * RIVET_SCORE && w.score === sAt + bankAt && w.player.x === 24 && w.player.y === 216,
        'the lap banks the counter still on the fuse (rivets already booked) and resets the board', `sAt=${sAt} score=${w.score - sAt}`)
    ok(bankPop && w.bonus === BONUS_START, 'the bank pops +<counter> at her perch and the next lap lights a fresh fuse', `pop=${bankPop} bonus=${w.bonus}`)
    ok(w.rivets.every(r => !r.pulled) && w.collapse === 0 && w.dkFall === 0 && !w.rivetPhase && w.pullTimer === 0,
        'the board rebuilds for the next lap: fresh rivets, level girders, ape back on his perch')
}

// ----------------------------------------------------------- bonus timer ----
// #3786 — the arcade fuse (Wikipedia, Donkey Kong §Gameplay): points for
// "completing each stage according to a steadily decreasing bonus counter",
// and "a life is lost when ... the bonus counter reaches zero". The counter
// steps by hundreds while the board is live, freezes with every animation,
// the rescue banks what remains (proven in §lap above), zero captures: the
// grab animates, the life pays, the board rebuilds with a fresh fuse. The
// attract demo owns the wheel but never the stake.
console.log('BONUS TIMER: the fuse, the bank, the capture (#3786)')
{
    const g = makeRun(11)
    let sawStep = false
    for (let i = 0; i < BONUS_TICK * 3 + 2; i++) {
        tickDonkeyKong(g, null)
        if (g.bonus === BONUS_START - BONUS_DROP * 3) sawStep = true
    }
    ok(sawStep && g.bonus === BONUS_START - BONUS_DROP * 3,
        'the fuse steps down by hundreds, one step a real second', `bonus=${g.bonus}`)
    const b = g.bonus, bt = g.bonusTick
    g.deathTimer = 100 // longer than the window below: the spin must outlast the ticks
    for (let i = 0; i < BONUS_TICK + 2; i++) tickDonkeyKong(g, null)
    ok(g.bonus === b && g.bonusTick === bt,
        'the counter freezes with the death animation', `bonus=${g.bonus} sub=${g.bonusTick}`)
}
{
    const ga = makeRun(11, { attract: true })
    for (let i = 0; i < BONUS_TICK * 2 + 5; i++) tickDonkeyKong(ga, null)
    ok(ga.bonus === BONUS_START,
        'the attract demo never runs the fuse — the title screen cannot gamble lives', `bonus=${ga.bonus}`)
}
{
    const g = makeRun(7)
    g.bonus = BONUS_DROP
    g.bonusTick = BONUS_TICK - 1
    const ev = tickDonkeyKong(g, null)
    ok(ev.captured && g.captured && g.captureTimer === CAPTURE_TICKS && g.bonus === 0,
        'counter-zero fires the capture: the grab arms and the board stops live play',
        JSON.stringify({ cap: ev.captured, t: g.captureTimer, b: g.bonus }))
    let respawn = false
    for (let i = 0; i < CAPTURE_TICKS + 2 && !respawn; i++) respawn = tickDonkeyKong(g, null).respawn
    ok(respawn && g.lives === START_LIVES - 1 && g.bonus === BONUS_START && !g.captured && g.captureTimer === 0,
        'the grab spends the life and rebuilds the board with a fresh fuse', `lives=${g.lives} bonus=${g.bonus}`)
    g.lives = 1
    g.bonus = BONUS_DROP
    g.bonusTick = BONUS_TICK - 1
    tickDonkeyKong(g, null)
    let over = false
    for (let i = 0; i < CAPTURE_TICKS + 2 && !over; i++) over = tickDonkeyKong(g, null).over
    ok(over && g.lives === 0, 'the capture at the last life is an honest terminal', `lives=${g.lives}`)
}
{
    // the counter rides the replay witness — two boards one step apart in the
    // fuse must hash apart, or the sweep's byte-equality is blind to it
    const g1 = makeRun(5)
    const g2 = makeRun(5)
    g2.bonus -= BONUS_DROP
    ok(stateHash(g1) !== stateHash(g2), 'the fuse rides the replay witness hash (#3786)')
}

// ---------------------------------------------------------- rivet finale ----
// #3598: fairness + mechanics. Four rivets ride her girder at the joints,
// clear of the ladder mouths and reachable from the deck. Walking onto one
// grounded starts the yank: PULL_TICKS of frozen feet, then our house 100
// banks and a dark hole stays. The pull refuses feet on the girder below,
// the ape stops throwing once the finale is armed, the collapse takes both
// top girders out of the collision (the runner steps DOWN one level, never
// crushed), the ape drops the full DK_FALL_STOP onto the pile, death resets
// the finale with the screen, and the whole phase rides the replay hash.
console.log('#3598 rivet finale: fairness, pull mechanics, collapse, honesty')
{
    const mk = () => { const g = makeRun(909); g.attract = false; return g }
    const lvl = buildLevel()
    const top = lvl.platforms[TOP_PLAT]
    ok(RIVET_X.length === 4, 'four rivets ride the finale')
    ok(RIVET_X.every((x) => x >= top.x + 4 && x <= top.x + top.w - 4), 'every rivet sits on the girder, not off its ends')
    ok(RIVET_X.every((x) => lvl.ladders.filter((l) => !l.broken).every((l) => Math.abs(l.x - x) >= 10)), 'no rivet sits in a mountable ladder mouth')

    // Pull freeze + bank.
    const f = mk()
    f.player.x = 100
    f.player.y = getPlatformY(f.platforms[TOP_PLAT], 105) - f.player.h
    tickDonkeyKong(f, null) // arm
    let pullStarted = false
    for (let i = 0; i < 200 && !pullStarted; i++) {
        const cx = f.player.x + f.player.w / 2
        const r = f.rivets.find((rr) => !rr.pulled)
        const ev = tickDonkeyKong(f, r && Math.abs(r.x - cx) > 5 ? (r.x > cx ? { right: true } : { left: true }) : {})
        if (ev.pull) pullStarted = true
    }
    ok(pullStarted && f.pullTimer === PULL_TICKS, 'walking onto a rivet starts the yank', `pullTimer=${f.pullTimer}`)
    const frozenX = f.player.x
    let froze = true
    for (let i = 0; i < PULL_TICKS - 1; i++) {
        tickDonkeyKong(f, { right: true, jump: true, up: true })
        if (f.player.x !== frozenX) froze = false
    }
    ok(froze, 'the pull freeze locks the feet (input held, no movement)')
    const evB = tickDonkeyKong(f, null)
    ok(evB.rivet && f.score === RIVET_SCORE && f.rivets.some((r) => r.pulled), 'the yank banks our house 100 and leaves a hole')
    ok(f.rivets.filter((r) => r.pulled).length === 1 && f.collapse === 0, 'three holes left before the crash')

    // Honesty: a pull never fires from the girder below.
    const u = mk()
    u.rivetPhase = true
    u.player.x = RIVET_X[0] - u.player.w / 2
    u.player.y = getPlatformY(u.platforms[DK_PLAT], RIVET_X[0]) - u.player.h
    u.player.grounded = true
    const evU = tickDonkeyKong(u, null)
    ok(!evU.pull, 'a rivet does not open its hand for feet on the girder below')

    // The ape stops throwing once the finale is armed.
    const s = mk()
    s.player.x = 100
    s.player.y = getPlatformY(s.platforms[TOP_PLAT], 105) - s.player.h
    tickDonkeyKong(s, null)
    const t0 = s.barrelTimer
    let spawned = 0
    for (let i = 0; i < 400; i++) if (tickDonkeyKong(s, {}).barrel) spawned++
    ok(s.barrelTimer === t0 && spawned === 0, 'the ape stops throwing at the finale', `timer ${t0}->${s.barrelTimer} spawned=${spawned}`)

    // Collapse: girders 5/6 out of the collision, runner steps down, ape
    // topples to the pile, the lap flag lands.
    const c = mk()
    c.player.x = 100
    c.player.y = getPlatformY(c.platforms[TOP_PLAT], 105) - c.player.h
    tickDonkeyKong(c, null)
    let pulls = 0
    for (let i = 0; i < 1500 && pulls < 4; i++) {
        const cx = c.player.x + c.player.w / 2
        const r = c.rivets.find((rr) => !rr.pulled)
        if (tickDonkeyKong(c, r && Math.abs(r.x - cx) > 5 ? (r.x > cx ? { right: true } : { left: true }) : {}).rivet) pulls++
    }
    ok(c.barrels.length === 0, 'the crash shakes the deck clean', `barrels=${c.barrels.length}`)
    let minPlat = 9, dkMax = 0, wonAt = -1
    for (let i = 0; i < COLLAPSE_TICKS + 10; i++) {
        const ev = tickDonkeyKong(c, null)
        const pi = c.player.grounded ? platformIndex(c, c.player.x + c.player.w / 2, c.player.y, c.player.h) : null
        if (pi !== null && pi < minPlat) minPlat = pi
        dkMax = Math.max(dkMax, c.dkFall)
        if (ev.won && wonAt < 0) wonAt = i
    }
    ok(minPlat <= 4, 'the runner steps down through the girders that fell — never crushed', `lowest girder ${minPlat}`)
    ok(dkMax === DK_FALL_STOP, 'the ape drops the whole fall onto the pile', `dkFall=${dkMax}`)
    ok(wonAt === COLLAPSE_TICKS - 2, 'the crash runs its full length, then the lap flags', `wonAt=${wonAt}`) // collapse already counted 1 at the bank tick

    // Death resets the finale with the screen.
    const d = mk()
    d.player.x = 100
    d.player.y = getPlatformY(d.platforms[TOP_PLAT], 105) - d.player.h
    tickDonkeyKong(d, null)
    d.rivets[0].pulled = true
    d.pullTimer = 7
    d.player.grounded = true
    d.deathTimer = 1
    tickDonkeyKong(d, null) // lives-- and the screen resets
    ok(!d.rivetPhase && d.rivets.every((r) => !r.pulled) && d.pullTimer === 0 && d.lives === START_LIVES - 1,
        'a death resets the finale with the screen', `rivetPhase=${d.rivetPhase}`)

    // The finale state rides the replay witness (#1473).
    const h1 = stateHash(Object.assign(mk(), { rivetPhase: true, collapse: 3, dkFall: 12, pullTimer: 4 }))
    ok(h1 !== stateHash(mk()), 'rivets, pull and fall ride the replay hash')
}

// --------------------------------------------------------------- hammer ----
// #2018: the attract screen promised "HAMMERS SMASH BARRELS". Rules pinned
// here: walk-over pickup (empty-handed, grounded, one at a time); while
// carried Space swings instead of jumping (up/flat/down, the original's
// sequence) and ladders are out; a live swing deletes barrels ahead for 100;
// contact stays lethal (the hammer extends reach, never safety); the mallet
// shatters after HAMMER_SWINGS hits; the screen resets the mallets back onto
// their girders. The WATCH route never walks to a mallet — the driver must
// stay empty-handed (the seat's zero-death floors depend on it).
console.log('hammer: pickup, swing-not-jump, smash, limits, seat hands-free')
{
    const mk = () => { const g = makeRun(4242); g.attract = false; return g }

    // Pickup: walk over the ground-floor mallet grounded.
    const a = mk()
    const h0 = a.hammers.find(h => h.plat === 0)
    a.player.x = h0.x - a.player.w / 2
    a.player.y = h0.y + 8 - a.player.h
    a.player.grounded = true
    const evP = tickDonkeyKong(a, null)
    ok(evP.hammerUp && a.hammer === HAMMER_SWINGS && h0.taken, 'walking over a mallet picks it up (empty-handed, grounded)')

    // Airborne over the same spot: no grab (the arcade takes it on the feet).
    const air = mk()
    const hA = air.hammers.find(h => h.plat === 0)
    air.player.x = hA.x - air.player.w / 2
    air.player.y = hA.y - 20 // still falling, feet well above the shelf
    ok(!tickDonkeyKong(air, null).hammerUp, 'the mallet is taken on the feet, not mid-air')

    // Carried: Space swings (sequence starts up), never launches.
    ok(a.hammer === HAMMER_SWINGS, 'carrying after pickup')
    const evS = tickDonkeyKong(a, { jump: true })
    ok(evS.swing && !evS.jump && a.hammer === HAMMER_SWINGS - 1 && a.swingSeq === 1 && a.player.vy >= 0,
        'carried: Space swings (up-phase first), no jump', `vy=${a.player.vy}`)

    // Carried: ladders are out — the original's trap.
    const b = mk()
    b.hammer = HAMMER_SWINGS
    const l = b.ladders.find(la => la.x === 180 && !la.broken)
    b.player.x = l.x - b.player.w / 2
    b.player.y = l.yBot - b.player.h
    b.player.grounded = true
    tickDonkeyKong(b, { up: true })
    ok(!b.player.climbing, 'carried: ladders refuse you (power and trap at once)')
    b.hammer = 0
    tickDonkeyKong(b, { up: true })
    ok(b.player.climbing, 'empty hands back on the same ladder: it mounts again')

    // Smash: flat phase catches a barrel ahead for 100; up phase misses it.
    const c = mk()
    c.hammer = HAMMER_SWINGS
    c.player.x = 100
    tickDonkeyKong(c, null) // settle
    c.barrels.push({ x: c.player.x + 12, y: 232 - 10, w: 10, h: 10, vx: 0, vy: 0, rot: 0, onLadder: false, falling: false })
    const ev1 = tickDonkeyKong(c, { jump: true }) // swing 1: up-phase, barrel rolls on
    ok(ev1.swing && ev1.hammered === 0 && c.barrels.length === 1 && c.score === 0, 'up-phase swings over a rolling barrel')
    const ev2 = tickDonkeyKong(c, null)
    const ev3 = tickDonkeyKong(c, { jump: true }) // swing 2: flat-phase, dead ahead
    ok(ev3.hammered === 1 && c.barrels.length === 0 && c.score === 100, 'flat-phase smash deletes the barrel for our house 100',
        `hammered=${ev3.hammered} score=${c.score}`)

    // The hammer never makes contact safe: a behind-back barrel still kills.
    const k = mk()
    k.hammer = HAMMER_SWINGS
    tickDonkeyKong(k, null)
    k.barrels.push({ x: k.player.x - 5, y: k.player.y - 3, w: 10, h: 10, vx: 0, vy: 0, rot: 0, onLadder: false, falling: false })
    ok(tickDonkeyKong(k, null).died, 'mallet in hand, a barrel from behind still kills (no invulnerability)')

    // Limits: 5 swings, then it shatters and the jump is back.
    const d5 = mk()
    d5.hammer = HAMMER_SWINGS
    tickDonkeyKong(d5, null)
    let shattered = -1
    for (let i = 0; i < 40; i++) {
        const ev = tickDonkeyKong(d5, { jump: i % 2 === 0 })
        if (ev.hammerDown) { shattered = i; break }
    }
    ok(shattered === 8, 'the mallet shatters on the 5th swing', `swing idx=${shattered}`)
    ok(d5.hammer === 0 && d5.swing === 0, 'shattered: hammer state clears at once (no ghost draw)')
    ok(tickDonkeyKong(d5, { jump: true }).jump, 'after the shatter the jump is the runner\'s again')

    // The screen resets: die carrying, respawn empty-handed with fresh mallets.
    const r = mk()
    r.hammer = HAMMER_SWINGS
    r.hammers[0].taken = true
    tickDonkeyKong(r, null)
    r.barrels.push({ x: r.player.x + 5, y: r.player.y - 3, w: 10, h: 10, vx: 0, vy: 0, rot: 0, onLadder: false, falling: false })
    tickDonkeyKong(r, null)
    for (let i = 0; i < 95; i++) tickDonkeyKong(r, null)
    ok(r.hammer === 0 && r.hammers.every(h => !h.taken), 'death resets the board: mallets back on their girders')

    // Seat safety: the proven route must never carry a mallet — the WATCH
    // driver stops at its ladders (x<=185), both mallets sit out of reach.
    let carried = 0
    for (let s = 1; s <= 8; s++) {
        const g = makeRun(s * 7919)
        g.attract = false
        g.watching = true
        for (let i = 0; i < 2400; i++) {
            tickDonkeyKong(g, null)
            if (g.hammer > 0) carried++
        }
        if (g.hammer > 0 || g.swingSeq > 0) carried++
    }
    ok(carried === 0, 'seated play never touches a mallet (route stays hands-free)', `carried ticks=${carried}`)
}

// --------------------------------------------------------------- seat rules ----
console.log('seat semantics: driver in, driver out, honest waits')
{
    // Seated: no human input lands, yet the runner climbs.
    const gs = makeRun(31337)
    gs.attract = false
    gs.watching = true
    for (let i = 0; i < 240; i++) tickDonkeyKong(gs, null)
    ok(gs.tickN === 240 && gs.player.y < 216, 'seated: null input still drives — the runner left the ground floor', `y=${gs.player.y.toFixed(0)}`)

    // Unseated: null input is the human coasting — the runner stands.
    const coast = makeRun(31337)
    coast.attract = false
    coast.watching = false
    for (let i = 0; i < 240; i++) tickDonkeyKong(coast, null)
    ok(coast.player.x === 24 && coast.player.y === 216 && !coast.player.climbing, 'unseated: null input is nobody driving')

    // Arcade doctrine: jumps are for barrels. With an empty site the driver
    // must not hop (the 40 px arc could kangaroo the 34 px girder gaps —
    // the original never did, and neither does the proven route).
    const early = makeRun(31337)
    early.attract = false
    early.watching = true
    tickDonkeyKong(early, null)
    const d0 = watchStep(early)
    ok(d0 && d0.jump === false, 'no barrels near → no jumps (ladders are the climb)')

    // Honest waits: attract, terminal, death/win animations.
    const att = makeRun(5, { attract: true })
    ok(watchStep(att) === null, 'watchStep waits on the attract demo')
    att.attract = false
    att.over = true
    ok(watchStep(att) === null, 'watchStep waits at the terminal')
    att.over = false
    att.deathTimer = 40
    ok(watchStep(att) === null, 'watchStep waits through the death animation')
    att.deathTimer = 0
    att.winTimer = 40
    ok(watchStep(att) === null, 'watchStep waits through the lap animation')
    att.winTimer = 0
    att.collapse = 1 // #3598 — the crash is the same honest wait
    ok(watchStep(att) === null, 'watchStep waits through the collapse')
    att.collapse = 0
    att.captureTimer = 40 // #3786 — the grab is the same honest wait
    ok(watchStep(att) === null, 'watchStep waits through the capture grab')
    att.captureTimer = 0
}

// ---------------------------------------------------- WATCH driver sweep ----
// #1637 b27 — the seat IS this sweep: watchStep replayed over the game's OWN
// lifted physics, 24 seeds. The floors below are what the proven route
// actually does; if a change drops one, the driver got worse and this is red.
console.log('WATCH driver sweep: 24 seeds of seated play on the shipped physics')
{
    // KONG_SWEEP=fast trims for the --mutant child runs (same law, plain run
    // stays at the full 24 seeds × 100 s).
    const FAST = process.env.KONG_SWEEP === 'fast'
    const SEEDS = FAST ? 8 : 24
    const TICKS = FAST ? 3600 : 6000
    const run = (seed) => {
        const gs = makeRun(seed)
        gs.attract = false
        gs.watching = true
        const samples = []
        let deaths = 0, wins = 0, caps = 0, arcs = 0
        for (let i = 0; i < TICKS; i++) {
            const ev = tickDonkeyKong(gs, null)
            if (ev.died) deaths++
            if (ev.captured) caps++ // #3786 — the seat must never bank on a dead fuse
            if (ev.won) wins++
            arcs += ev.jumpedBarrel * 100 + ev.passedBarrel * 50 // #3786 — obstacle points counted from the events, not scraped off the score (the lap payout is the fuse now)
            if (i % 300 === 0) samples.push(stateHash(gs))
            if (gs.over) break
        }
        return { gs, samples, deaths, caps, arcs, wins }
    }
    let det = 0, zeroDeath = 0, wonAll = 0, capsAll = 0
    let minWinTick = Infinity, totalArcPoints = 0
    const red = []
    for (let s = 1; s <= SEEDS; s++) {
        const seed = s * 7919
        const a = run(seed)
        const b = run(seed)
        if (JSON.stringify(a.samples) === JSON.stringify(b.samples)) det++
        if (a.deaths === 0) zeroDeath++
        if (a.wins >= 1) wonAll++
        capsAll += a.caps
        minWinTick = Math.min(minWinTick, a.gs.tickN)
        totalArcPoints += a.arcs
        if (a.gs.over || a.wins < 1) red.push(`${seed}${a.gs.over ? ':OVER' : ':NOWIN'}`)
    }
    ok(det === SEEDS, `${SEEDS}/${SEEDS} seeds replay byte-equal (hash sampled every 300 ticks)`, red.join(' '))
    ok(wonAll === SEEDS, `every seed banks a lap under the watch`, red.join(' '))
    ok(capsAll === 0, 'no seed burns the fuse — the proven route beats the counter every lap (#3786)', `${capsAll}`)
    ok(zeroDeath >= (FAST ? 7 : 22), `zero-death runs on ${FAST ? 7 : 22}+ seeds`, `${zeroDeath}/${SEEDS}`)
    ok(totalArcPoints >= (FAST ? 200 : 400), 'the fleet arcs real barrels for points (progress, not waiting)', `${totalArcPoints}`)
    ok(minWinTick >= 300, 'no seed banks its lap suspiciously fast (the route uses the ladders)', `${minWinTick}`)
}

// ------------------------------------------------------------- corner pair ----
// #3622 — the fall-gap corner ladders and the mid-air take. The old README
// gap ("a barrel meeting a ladder mid-air keeps rolling") had two causes: no
// ladder stood in the drop column, and the shipped edge-check could never set
// falling=true (gravity beats it to vy>0). This section pins the geometry,
// the mid-air rule, once-per-barrel-per-ladder, the dangling-foot retake and
// the runner's refusal of the barrel-only rung — on the real physics with a
// parked runner (no laps, continuous barrel stream), exact floors (the sim is
// deterministic; if these shift, the dice or the layout shifted).
console.log('corner pair #3622: mid-air takes at the fall-gap corner')
{
    const { ladders } = buildLevel()
    const r1 = ladders.find(l => l.dangles)
    const r2 = ladders.find(l => l.barrelOnly)
    ok(!!r1 && !!r2 && r1.x === 222 && r2.x === 222,
        'the corner pair stands at the measured fall column x=222', `r1=${r1 && r1.x} r2=${r2 && r2.x}`)
    ok(!!r2 && r2.yTop > r1.yBot && r2.yBot >= 232,
        'R2 sits below R1\'s dangling foot and reaches the ground',
        `r1Bot=${r1 && r1.yBot.toFixed(1)} r2Top=${r2 && r2.yTop.toFixed(1)} r2Bot=${r2 && r2.yBot.toFixed(1)}`)

    const ids = new WeakMap()
    let nextId = 1, aerial = 0, r1land = 0, dangling = 0, r2aerial = 0, doubleSame = 0, stuck = 0
    for (const seed of [7919, 15838, 31676]) {
        const gs = noFuse(makeRun(seed)) // runner parked at spawn: no lap, the ape keeps throwing
        const snap = new Map()
        const onFrom = new Map()
        for (let t = 0; t < 60 * 360; t++) {
            for (const b of gs.barrels) {
                if (!ids.has(b)) ids.set(b, nextId++)
                const id = ids.get(b)
                snap.set(id, { onL: b.onLadder, f: b.falling, x: b.x, y: b.y, bits: b.takenBits })
                if (b.onLadder && !onFrom.has(id)) onFrom.set(id, t)
                if (!b.onLadder) onFrom.delete(id)
            }
            tickDonkeyKong(gs, {})
            for (const b of gs.barrels) {
                const id = ids.get(b)
                const p = snap.get(id)
                if (!p) continue
                if (!p.onL && b.onLadder) {
                    const l = ladders.find(la => la.yBot === b.ladderBot && Math.abs(la.x - (b.x + b.w / 2)) < 0.01)
                    if (l && (p.bits & (1 << ladders.indexOf(l)))) doubleSame++
                    if (p.f) { aerial++; if (l === r2) r2aerial++ } else if (l === r1) r1land++
                }
                if (p.onL && !b.onLadder && b.falling) dangling++
                if (onFrom.has(id) && t - onFrom.get(id) > 200) stuck++ // longer than the longest span / 1.5
            }
        }
    }
    ok(aerial === 4 && r1land === 1 && dangling === 3 && r2aerial === 2,
        'corner floors exactly hold: 4 mid-air takes (2 onto R2), 1 landed R1 board, 3 dangling-foot exits',
        `aerial=${aerial} r1land=${r1land} dangling=${dangling} r2aerial=${r2aerial}`)
    ok(doubleSame === 0 && stuck === 0,
        'once-per-barrel-per-ladder holds — no ladder retakes, no barrel stuck on a span',
        `double=${doubleSame} stuck=${stuck}`)

    // The runner never rides the barrel-only rung (attract would hang on it).
    let runnerR2 = 0
    for (const seed of [7919, 15838, 31676]) {
        const gs = makeRun(seed, { attract: true })
        for (let t = 0; t < 60 * 300; t++) {
            tickDonkeyKong(gs)
            if (gs.player.climbing && Math.abs(gs.player.x + gs.player.w / 2 - r2.x) < 2) runnerR2++
        }
    }
    ok(runnerR2 === 0, 'the runner never climbs the barrel-only outside ladder', `${runnerR2}`)
}

// #3657 — span body law. A span may host a DOUBLE board (the arcade lets two
// barrels share one ladder), but riders never pass through each other. An
// arrival above the span's topmost rider joins it — settling onto that head
// whenever bodies would overlap, then riding at equal speed; one arriving
// at/below that head is refused — the dive dice are already spent (same roll,
// same order: the stream never shifts) and the gap carries the barrel toward
// the next rung down.
// Measured on the natural stream: arrivals never coincide with an occupied
// span today (0 contested boards across 400 seeds), so every seeded floor
// above is byte-identical — these gates make the law enforceable, not fiction.
console.log('double board #3657: spans share, never clip')
{
    const b0 = { w: 10, h: 10, x: 100, y: 50 }
    ok(spanBoardY({ barrels: [] }, b0, 3) === 50, 'an empty span boards at the arrival height')
    ok(spanBoardY({ barrels: [{ onLadder: true, ladderIdx: 3, x: 100, y: 74, w: 10, h: 10 }] }, b0, 3) === 50,
        'an arrival clear of the rider boards untouched')
    ok(spanBoardY({ barrels: [{ onLadder: true, ladderIdx: 3, x: 100, y: 55, w: 10, h: 10 }] }, b0, 3) === 45,
        'an overlapping arrival settles onto the rider head')
    ok(spanBoardY({ barrels: [{ onLadder: true, ladderIdx: 3, x: 100, y: 40, w: 10, h: 10 }] }, b0, 3) === false,
        'an arrival at/below the rider head is refused')
    ok(spanBoardY({ barrels: [{ onLadder: true, ladderIdx: 7, x: 100, y: 55, w: 10, h: 10 }] }, b0, 3) === 50,
        'a rider on another span does not occupy this one')

    // Real physics: plant a rider on the corner rung R2 and drop a second
    // barrel into the same column behind it. Dice decide board-vs-fall per
    // seed; the LAW must hold on every outcome, and a head-rest must be seen.
    const { ladders } = buildLevel()
    const ri = ladders.findIndex(l => l.barrelOnly)
    const R2 = ladders[ri]
    let boards = 0, clean = 0, refuses = 0
    for (const seed of [7919, 15838, 31676, 3, 42, 77, 101, 202, 555, 909]) {
        const gs = makeRun(seed)
        for (let t = 0; t < 600 && gs.barrels.length === 0; t++) tickDonkeyKong(gs, {})
        const A = gs.barrels[0]
        if (!A || gs.gameOver) continue
        Object.assign(A, {
            onLadder: true, falling: false, vx: 0, vy: 0, rot: 0,
            x: R2.x - A.w / 2, y: R2.yTop + 2, ladderBot: R2.yBot,
            ladderIdx: ri, takenBits: 1 << ri,
        })
        const B = {
            x: R2.x - 5, y: R2.yTop - 30, w: 10, h: 10, vx: 0, vy: 1, rot: 0,
            onLadder: false, falling: true, takenBits: 0, ladderIdx: -1,
        }
        gs.barrels.push(B)
        for (let t = 0; t < 120 && !gs.gameOver; t++) {
            const wasOn = B.onLadder
            tickDonkeyKong(gs, {})
            if (B.onLadder && !wasOn) {
                boards++
                // Law (global): vs the topmost rider of whichever span B
                // joined (the corner column hosts R1 above R2 — both are legal
                // catches). Never below a rider, never clipped into it. Equal
                // descent speed then holds the offset; spanBoardY's settle
                // (unit-gated above) closes any overlap.
                const top = gs.barrels.filter(o => o !== B && o.onLadder && o.ladderIdx === B.ladderIdx)
                    .reduce((m, o) => (m === null || o.y < m.y ? o : m), null)
                if (top === null || B.y + B.h <= top.y + 0.01) clean++
                break
            }
            if (!B.falling && !B.onLadder && (B.takenBits & (1 << ri))) {
                // landed without riding: dice miss or refusal — either way the
                // span was never entered below the rider's head.
                if (B.y > A.y) refuses++
                break
            }
        }
    }
    ok(boards > 0, 'the planted meeting boards on seeded dice', `boards=${boards}`)
    ok(boards === clean, 'no double board ever enters the span below or inside the rider', `clean=${clean}/${boards}`)

    // Natural stream: the law must never be violated, and riders must carry
    // their span id. 360 s × three corner seeds, parked runner.
    let clip = 0, blind = 0
    for (const seed of [7919, 15838, 31676]) {
        const gs = noFuse(makeRun(seed))
        for (let t = 0; t < 60 * 360; t++) {
            tickDonkeyKong(gs, {})
            const riders = gs.barrels.filter(bb => bb.onLadder)
            for (const bb of riders) if (bb.ladderIdx < 0) blind++
            for (let i = 0; i < riders.length; i++) {
                for (let j = i + 1; j < riders.length; j++) {
                    if (riders[i].ladderIdx !== riders[j].ladderIdx) continue
                    if (Math.abs(riders[i].y - riders[j].y) < riders[i].h) clip++
                }
            }
        }
    }
    ok(clip === 0 && blind === 0,
        'no seeded stream ever clips two barrels in one span; every rider knows its span',
        `clip=${clip} blind=${blind}`)
}

// #3641 — barrel-voice grammar. The law is pure (pitch/spacing/volume), the
// stamps ride real physics on the SAME seeds as §corner pair, and the mirror
// asserts each stamp lands on the tick of its transition: boards on span
// entries (the bright 740 tick exactly when the barrel was airborne), dangle
// clatters on dangling-foot exits. Corner parity: the same 3 dangling exits
// and 2 mid-air catches onto R2 that §corner pair floors pin. Nothing in the
// grammar touches gs, so every seeded floor stays byte-identical.
console.log('barrel voices #3641: board tick, descent clicks, dangling clatter')
{
    ok(barrelBoardVoice(true).freq > barrelBoardVoice(false).freq,
        'the mid-air take rings brighter than a rolled-on board',
        `air=${barrelBoardVoice(true).freq} roll=${barrelBoardVoice(false).freq}`)
    ok(barrelDangleVoice().vol < barrelBoardVoice(false).vol,
        'the dangling-foot clatter is lighter than the board tick',
        `dangle=${barrelDangleVoice().vol} board=${barrelBoardVoice(false).vol}`)
    ok(barrelRollClick({ tickN: 1 }, { onLadder: true, ladderBot: 100, y: 50 }) === null,
        `descent clicks ride the ${BARREL_CLICK_EVERY}-tick phase grid`)
    ok(barrelRollClick({ tickN: BARREL_CLICK_EVERY }, { onLadder: false }) === null,
        'no clicks while off a ladder')
    const far = barrelRollClick({ tickN: BARREL_CLICK_EVERY }, { onLadder: true, ladderBot: 400, y: 40 })
    const near = barrelRollClick({ tickN: BARREL_CLICK_EVERY }, { onLadder: true, ladderBot: 100, y: 100 })
    ok(!!far && !!near && far.freq === 220 && near.freq === 220 + BARREL_CLICK_RANGE * 2,
        'the click sits at 220 far up the span and climbs to 340 at the foot',
        `far=${far && far.freq} near=${near && near.freq}`)

    const r2 = buildLevel().ladders.find(l => l.barrelOnly)
    let board = 0, boardMid = 0, boardFoot = 0, dangle = 0, clicks = 0, stray = 0, midR2 = 0
    const ids = new WeakMap()
    let nextId = 1
    for (const seed of [7919, 15838, 31676]) {
        const gs = noFuse(makeRun(seed)) // same seeds as §corner pair
        const snap = new Map()
        for (let t = 0; t < 60 * 360; t++) {
            for (const b of gs.barrels) {
                if (!ids.has(b)) ids.set(b, nextId++)
                snap.set(ids.get(b), { onL: b.onLadder, f: b.falling })
            }
            const ev = tickDonkeyKong(gs, {})
            let entered = 0, enteredCold = 0, leftAir = 0
            for (const b of gs.barrels) {
                const p = snap.get(ids.get(b))
                if (!p) continue
                if (!p.onL && b.onLadder) {
                    entered++
                    if (!p.f) enteredCold++ // rolled on from the girder, not caught mid-air
                    if (p.f && b.ladderBot === r2.yBot && Math.abs(r2.x - (b.x + b.w / 2)) < 0.01) midR2++
                }
                if (p.onL && !b.onLadder && b.falling) leftAir++
            }
            const ticks = { board: 0, mid: 0, foot: 0, dangle: 0, roll: 0 }
            for (const v of ev.barrelVoices || []) {
                if (v.kind === 'board') { board++; if (v.freq === 740) boardMid++; else boardFoot++; ticks.board++; if (v.freq === 740) ticks.mid++; else ticks.foot++ }
                else if (v.kind === 'dangle') { dangle++; ticks.dangle++ }
                else if (v.kind === 'roll') clicks++
                else stray++ // unknown kind — the law grew without a voice
            }
            // stamps mirror transitions per tick: every board lands on the tick
            // the barrel enters a span; every dangle lands on the tick a ride
            // lets go into the gap. The bright 740 tick never exceeds the
            // tick's airborne entries (a barrel caught mid-air, not rolled on).
            if (ticks.board !== entered || ticks.dangle !== leftAir || ticks.mid > entered - enteredCold) stray++
        }
    }
    ok(dangle === 3 && midR2 === 2,
        'stamps match the corner-pair floors: 3 dangling exits, 2 barrels caught mid-air onto R2',
        `dangle=${dangle} midR2=${midR2}`)
    ok(board === boardMid + boardFoot,
        'every board voice is either a mid-air catch or a rolled-on tick',
        `board=${board} mid=${boardMid} foot=${boardFoot}`)
    ok(stray === 0,
        'every stamp rides its transition; boards split bright-mid-air / plain-foot; no stray voices',
        `stray=${stray} mid=${boardMid} foot=${boardFoot}`)
    ok(clicks >= 20 && board > 1000,
        'the grammar is live in real play: a click trail on the rides, boards on every span-hitting pass',
        `clicks=${clicks} board=${board}`)
}

// #3651 — corner polish: a phone-legible brace and barrels that ALIVE-ride the
// corner ladders. The laws are visual-only (constants + a pure tick function):
// nothing writes gs or the dice, so every seeded floor above stays
// byte-identical — their green is part of this proof. The section pins the
// laws AND the shell wiring, so reverting either half fails the gate.
console.log('corner polish #3651: bolted brace, alive descents')
{
    ok(BRACE_WIDTH >= 2,
        'brace rails are as thick as the ladder uprights — the corner reads on a phone',
        `width=${BRACE_WIDTH} (was 1.5)`)
    ok(BRACE_PLATE.w * BRACE_PLATE.h >= 20 && BRACE_PAD.w * BRACE_PAD.h >= 8,
        'bolted gusset at the girder anchor + foot pad at the head give the brace a steel story',
        `plate=${BRACE_PLATE.w}x${BRACE_PLATE.h} pad=${BRACE_PAD.w}x${BRACE_PAD.h}`)
    const f0 = barrelRideFrame(0)
    const f1 = barrelRideFrame(BARREL_CLICK_EVERY)
    const f2 = barrelRideFrame(BARREL_CLICK_EVERY * 2)
    ok(f0.grip === -f1.grip && f2.grip === f0.grip,
        `grip marks swap rails on the ${BARREL_CLICK_EVERY}-tick click cadence — seen motion and heard clatter are one grammar`,
        `grip=${f0.grip}/${f1.grip}/${f2.grip}`)
    ok(Math.abs(f0.wobble) <= 0.5 && Math.abs(f1.wobble) <= 0.5,
        'the descent sway stays half a pixel — across the rungs, never off the span',
        `wobble=${f0.wobble}/${f1.wobble}`)
    ok(/ctx\.lineWidth = BRACE_WIDTH/.test(IDX) && /BRACE_PLATE\.w/.test(IDX),
        'the shell draws the brace from the law (rails + plates), not a magic 1.5',
        IDX.includes('ctx.lineWidth = BRACE_WIDTH') ? 'wired' : 'missing')
    ok(/b\.onLadder \? barrelRideFrame\(gs\.tickN\)/.test(IDX),
        'riding barrels draw grip + sway from the live tick; rolling barrels keep their spin')
    ok(/rides: gs\.barrels\.filter\(b => b\.onLadder\)/.test(IDX),
        'the DEV probe reports riding barrels so a drive can wait for a descent')
}

// ------------------------------------------------------------- left corner ----
// #3657 item 2 — left-column parity. The arcade's corner fallers land on the
// girder below (its end overlaps the join). Measured column (scripts/
// trace-left-corner.mjs): fallers leaving the left ends of girders 2/4 drift
// −1.2/tick and meet the catch girder's line at cx≈−3.2 / −1.6 — before the
// fix a 3.2px miss that dropped barrels clean out of the world. The catch
// girders (y=192, y=128) extend 4px past screen-left; pins: the measured
// crossings sit inside the tip margin but left of screen (a mutation shrinking
// the extension below drift dies), the natural stream catches every left
// faller, and none ever leaves through screen-left.
console.log('left corner #3657-2: tip catches the left fall column')
{
    const lvl = buildLevel()
    const catchers = lvl.platforms.filter(p => p.x === -4)
    ok(catchers.length === 2 && catchers.every(p => p.slope > 0),
        'both catch girders (192, 128) carry the 4px screen-left tip', `tips=${catchers.map(p => p.y).join('/')}`)
    const cross = (top, bot) => { // analytic drift of a faller off the girder's left end
        let vy = 0, y = getPlatformY(top, top.x) + 8, cx = top.x, n = 0
        while (y < getPlatformY(bot, Math.max(cx, bot.x)) + 8 && n < 60) { vy += 0.25; y += vy; cx -= BARREL_SPEED; n++ }
        return cx
    }
    const g2 = lvl.platforms.find(p => p.y === 160), c1 = catchers.find(p => p.y === 192)
    const g4 = lvl.platforms.find(p => p.y === 96), c3 = catchers.find(p => p.y === 128)
    const x1 = cross(g2, c1), x3 = cross(g4, c3)
    ok(x1 >= -4 && x1 < -1, `girder-2 column crosses the catch line at cx≈${x1.toFixed(1)} — off-screen, inside the tip`, `cross=${x1.toFixed(2)}`)
    ok(x3 >= -4 && x3 < 0, `girder-4 column crosses at cx≈${x3.toFixed(1)} — inside the tip`, `cross=${x3.toFixed(2)}`)
    let caught = 0, voidLeft = 0
    for (let seed = 1; seed <= 12; seed++) {
        const gs = noFuse(makeRun(seed, { human: true }))
        const prev = new Map()
        for (let t = 0; t < 9000; t++) {
            tickDonkeyKong(gs, {})
            const cur = new Set(gs.barrels)
            for (const b of gs.barrels) {
                const cx = b.x + b.w / 2
                const p = prev.get(b)
                if (p && !p.f && !p.L && b.falling && !b.onLadder && cx < 30) b._lc = cx
                if (p && p.f && !b.falling && !b.onLadder && b._lc !== undefined) { caught++; b._lc = undefined }
                prev.set(b, { f: b.falling, L: b.onLadder })
            }
            for (const [b] of prev) if (!cur.has(b)) { if (b._lc !== undefined) voidLeft++; b._lc = undefined }
        }
    }
    ok(caught === 19, 'the natural stream lands all 19 left-corner fallers on the tips (seeds 1-12, 9000 ticks)', `caught=${caught}`)
    ok(voidLeft === 0, 'no barrel ever leaves the world through screen-left', `voidLeft=${voidLeft}`)
}

// ---------------------------------------------------------- shell wiring pin ----
console.log('shell wiring: seed, terminal, seat chrome')
{
    ok(/seed = seedFromQuery\(window\.location\.search\) \?\? Math\.floor\(Math\.random\(\) \* 1000000\)/.test(IDX), 'startRun regenerates the seed and honors ?seed=N')
    ok(/exposeFeedbackState\(\(\) => \(\{[\s\S]{0,160}?done: gs\.over, seed: gs\.seed, lives: gs\.lives/.test(IDX),
        'production report carries seed + terminal + lives')
    ok(/exposeGame\(\{[\s\S]*?id: 'donkeykong'/.test(IDX), 'QA contract exposeGame wired')
    ok(/hash: stateHash\(gs\)/.test(IDX), 'QA contract state carries the physics hash')
    ok(/if \(isWatchKey\(e\)\)/.test(IDX) && /isTakeoverKey\(e\)/.test(IDX), 'Y toggles; driving keys take over')
    ok(IDX.includes('playWatchStart') && IDX.includes('playWatchStop') && IDX.includes('watchSfx: watchSfxLog'),
        'seat blips logged through the shared watch chrome')
    const RUN0 = IDX.match(/const startRun = \(\) => \{[\s\S]*?\n        \}/)
    ok(!!RUN0 && /watching = false/.test(RUN0[0]), 'watch never lingers into a fresh human run')
    ok(/if \(ev\.over && !gs\.attract && gs\.watching\) release\(false\)/.test(IDX),
        'the terminal releases the watcher (silent, racer rule)')
    ok(/<AttractWatchButton/.test(IDX) && IDX.includes('WATCH_ATTRACT_HINT'), 'attract carries the shared WATCH hint')
    ok(/const input = gs\.attract \|\| gs\.watching \? null : heldInput\(\)/.test(IDX),
        'the watcher owns the wheel — held keys never mute the driver')
    ok(/handleCanvasTap/.test(IDX), 'phones can tap the field to start/restart/take over')
    ok(/DONKEY KONG[\s\S]{0,400}WATCH_HELP/.test(REG), 'the registry advertises the proven route')
    ok(/attractFrame\(attractTick, GW, GH\)/.test(IDX), 'the attract layout rides the shared cycle')
    // #2018: the event set gained throw, rungs and mallet voices — pin that
    // the shell actually sounds each new sim event.
    ok(/if \(ev\.barrel\) audioController\.play/.test(IDX), 'the barrel throw has a voice')
    ok(/if \(ev\.climbed\) audioController\.play/.test(IDX), 'the ladder mount has a voice')
    ok(/if \(ev\.hang\) audioController\.play/.test(IDX), 'the half-rung hang (#3618) has a voice')
    ok(/for \(const v of ev\.barrelVoices \|\| \[\]\)/.test(IDX) && /v\.to\) audioController\.playSweep/.test(IDX) && /else audioController\.playTone\(v\.freq/.test(IDX),
        '#3641 the shell plays every stamped barrel voice (tone, plus sweep+noise for the dangle)')
    ok([/ev\.hammerUp/, /ev\.swing/, /ev\.hammered/, /ev\.hammerDown/].every(re => new RegExp(re.source + '\\)\\s*audioController\\.play').test(IDX)),
        'all four mallet events are sounded')
    ok(/HAMMERS SMASH BARRELS/.test(readFileSync('src/games/DonkeyKong/attract.js', 'utf8')) && /gs\.hammer > 0/.test(IDX),
        'the attract promise is now kept by the engine (mallet exists in world + draw)')
}


// ----------------------------------------------- #3147 deny answer ----
// The arcade doctrine: a refused climb must still ANSWER — a soft no-tick
// plus a chevron above the runner — never a silent dead key. The sim stamps
// the juice-only `noClimb` event (never hashed, never counted — the same
// law iron-ring's whiff rides); the shell voices it throttled so a held key
// doesn't machine-gun.
console.log('deny answer: the refused climb answers loudly (#3147)')
{
    ok(/if \(!p\.climbing && wantClimb && !holdable\) ev\.noClimb = true/.test(SIM),
        'the sim stamps the climb deny when no ladder is holdable (#3618: a broken rung held without hands or down-intent reads as no ladder)')
    ok(/if \(wantClimb\) ev\.noClimb = true/.test(SIM),
        'the sim stamps the climb deny under the mallet trade')
    ok(/if \(ev\.noClimb && noClimbCooldown/.test(IDX) && /audioController\.playTone\(140/.test(IDX),
        'the cabinet voices the deny (soft no-tick)')
    ok(/denyFx = 10/.test(IDX) && /if \(denyFx > 0\)/.test(IDX),
        'the deny answer carries the visible chevron')

    // far from every ladder, UP stamps the deny and moves nothing
    const far = makeRun(7)
    far.attract = false
    far.player.x = 24
    const ev0 = tickDonkeyKong(far, { up: true })
    ok(ev0.noClimb === true && !far.player.climbing && far.player.y === 216,
        'deny: UP with no ladder in reach stamps noClimb (and moves nothing)')
    // the same with DOWN
    const farD = makeRun(7)
    farD.attract = false
    farD.player.x = 24
    ok(tickDonkeyKong(farD, { down: true }).noClimb === true && !farD.player.climbing,
        'deny: DOWN with no ladder in reach stamps noClimb')
    // idle: no climb wanted → no deny (the seated driver is quiet)
    const idle = makeRun(7)
    idle.attract = false
    ok(!tickDonkeyKong(idle, null).noClimb, 'deny: no climb wanted, no deny stamped')
    // the mount event keeps its own voice — the climb itself is not denied
    const mount = makeRun(7)
    mount.attract = false
    const lm = mount.ladders.find(la => la.x === 180 && !la.broken)
    mount.player.x = lm.x - mount.player.w / 2
    mount.player.y = lm.yBot - mount.player.h
    mount.player.grounded = true
    const evC = tickDonkeyKong(mount, { up: true })
    ok(evC.climbed && evC.noClimb === false, 'deny: a real mount answers with climbed, never noClimb')
    // held-up climbing is real motion, not a refuse
    const climbing = makeRun(7)
    climbing.attract = false
    climbing.player.x = lm.x - climbing.player.w / 2
    climbing.player.y = lm.yBot - climbing.player.h
    climbing.player.grounded = true
    tickDonkeyKong(climbing, { up: true }) // mounts
    const evR = tickDonkeyKong(climbing, { up: true }) // glides up the rungs
    ok(!evR.noClimb && climbing.player.climbing && climbing.player.y < 216,
        'deny: held UP while climbing is real motion, not a refuse')
    // the mallet trade still refuses climbs and stamps the deny
    const mal = makeRun(7)
    mal.attract = false
    mal.hammer = HAMMER_SWINGS
    mal.player.x = lm.x - mal.player.w / 2
    mal.player.y = lm.yBot - mal.player.h
    mal.player.grounded = true
    const evM = tickDonkeyKong(mal, { up: true })
    ok(evM.noClimb === true && !mal.player.climbing,
        'deny: the mallet trade refuses climbs (ev.noClimb, no mount)')
}

// ------------------------------------------------------------------ mutants ----
if (process.argv.includes('--mutant')) {
    console.log('mutants (each MUST die)')
    const I = 'src/games/DonkeyKong/index.jsx'
    const S = 'src/games/DonkeyKong/sim.js'
    const MUTANTS = [
        ['human start ignores ?seed (pin removed)', I,
            `seed = seedFromQuery(window.location.search) ?? Math.floor(Math.random() * 1000000)`,
            `seed = Math.floor(Math.random() * 1000000)`],
        ['production report drops the seed', I,
            `tick: gs.tickN, score: gs.score, done: gs.over, seed: gs.seed, lives: gs.lives,\n        }))`,
            `tick: gs.tickN, score: gs.score, done: gs.over, lives: gs.lives,\n        }))`],
        ['#3618 the half-rung clamp dies (broken ladders deliver to the girder above)', S,
            `        if (cl && cl.broken && p.y + p.h < cl.breakY) {`,
            `        if (false && cl && cl.broken && p.y + p.h < cl.breakY) {`],
        ['#3618 the seat trusts a broken rung (human-tag gate dropped)', S,
            `        (!nearLadder.broken || (human && wantClimbUp))`,
            `        (!nearLadder.broken || wantClimbUp)`],
        ['#3618 the hang buzzes every tick (event transition law broken)', S,
            `            if (!p.hanging) ev.hang = true`,
            `            ev.hang = true`],
        ['#3618 the seat clings to inherited broken rungs (step-off guard gone)', S,
            `    if (p.climbing && p.climbLadder && p.climbLadder.broken && !human) {`,
            `    if (false && p.climbing && p.climbLadder && p.climbLadder.broken && !human) {`],
        ['#3618 the break lines move to the ladder tops (bait becomes whole)', S,
            `        const breakY = broken ? yTop + (yBot - yTop) * BREAK_FRACS[bk] : yTop`,
            `        const breakY = yTop`],
        ['#3641 mid-air takes go silent (board stamp only on rolled-on boards)', S,
            `                    ev.barrelVoices.push(barrelBoardVoice(true)) // #3641 the mid-air take rings brighter\n`,
            ``],
        ['#3641 the dangling-foot clatter dies', S,
            `                ev.barrelVoices.push(barrelDangleVoice())\n`,
            ``],
        ['#3641 descent clicks never fire (phase grid broken)', S,
            `    if (!b.onLadder || gs.tickN % BARREL_CLICK_EVERY !== 0) return null`,
            `    if (!b.onLadder || gs.tickN % BARREL_CLICK_EVERY !== 0 || true) return null`],
        ['the barrel die leaves the stream (spacing unseeded)', S,
            `gs.barrelTimer = 150 + Math.floor(rnd(gs) * 100)`,
            `gs.barrelTimer = 150 + Math.floor(Math.random() * 100)`],
        ['the barrel arc pays nothing (jump window dropped)', S,
            `if (Math.abs(dx) < 16 && dy < 0 && dy > -24 && !p.jumpedBarrels.has(b)) {`,
            `if (Math.abs(dx) < 1 && dy < 0 && dy > -24 && !p.jumpedBarrels.has(b)) {`],
        ['contact is harmless (crush law stolen)', S,
            `if (Math.abs(dx) < 8 && Math.abs(dy) < 10) {
                killPlayer(gs, ev)`,
            `if (Math.abs(dx) < 2 && Math.abs(dy) < 2) {
                killPlayer(gs, ev)`],
        ['the lap never rings (the finale never arms)', S,
            `if (p.y + p.h < 56 && p.x > 72 && p.x < 152 && !gs.rivetPhase) {`,
            `if (false && p.y + p.h < 56 && p.x > 72 && p.x < 152 && !gs.rivetPhase) {`],
        ['#3598 the pull never completes (rivets stay armed, the seat can never finish)', S,
            `            if (gs.pullTimer <= 0) {`,
            `            if (false && gs.pullTimer <= 0) {`],
        ['#3598 the freeze lets you walk (the yank becomes a free hover)', S,
            `    if (gs.pullTimer > 0) {
        moveDir = 0`,
            `    if (false && gs.pullTimer > 0) {
        moveDir = 0`],
        ['#3598 the crash never starts (four holes and no lap, ever)', S,
            `if (gs.rivets.every(rr => rr.pulled)) gs.collapse = 1`,
            `if (false && gs.rivets.every(rr => rr.pulled)) gs.collapse = 1`],
        ['#3598 the seat cannot see the collapse win (the stall we shipped against)', S,
            `if (ev.collapse) return 100000000000 + (WATCH_HORIZON - t) * 1000`,
            `if (false && ev.collapse) return 100000000000 + (WATCH_HORIZON - t) * 1000`],
        ['#3598 the ape keeps throwing through the finale (his last stand is a crossfire)', S,
            `    if (!gs.rivetPhase) {
        gs.barrelTimer--`,
            `    if (true) {
        gs.barrelTimer--`],
        ['the lap banks 0 (win bonus hollow)', S,
            `gs.score += paid`,
            `gs.score += 0`],
        ['ladders never take divers (the dive chance dies)', S,
            `if (rnd(gs) < BARREL_DIVE_CHANCE) {`,
            `if (rnd(gs) < -1) {`],
        ['the driver is muted (watch coasts forever)', S,
            `input || (gs.watching ? watchStep(gs) : {})`,
            `input || null`],
        ['watch lingers into a fresh run (startRun keeps the seat)', I,
            `            setAttractUi(false)
            gs.watching = false // watch never lingers — a new run starts in your hands`,
            `            setAttractUi(false)`],
        ['held keys mute the driver (seat flag dropped from the gate)', I,
            `const input = gs.attract || gs.watching ? null : heldInput()`,
            `const input = gs.attract ? null : heldInput()`],
        ['terminal releases the watcher with a blip (racer rule broken)', I,
            `if (ev.over && !gs.attract && gs.watching) release(false)`,
            `if (ev.over && !gs.attract && gs.watching) release(true)`],
        ['the kangaroo rides (jump candidates ungated — the route becomes a hop)', S,
            `const cands = barrelThreat(gs) ? [...WALK_CANDS, ...JUMP_CANDS] : WALK_CANDS`,
            `const cands = [...WALK_CANDS, ...JUMP_CANDS]`],
        ['the route table stops steering (waypoints vanish from the girder view)', S,
            `const wp = ROUTE.find(r => r.plat === pi)
    if (!wp) return { left: false, right: false, up: false, down: false, jump: false }`,
            `const wp = ROUTE.find(r => r.plat === -1)
    if (!wp) return { left: false, right: false, up: false, down: false, jump: false }`],
        ['the horizon goes myopic (too short to see a dive reach the mouth)', S,
            `const WATCH_HORIZON = 90`,
            `const WATCH_HORIZON = 12`],
        ['the hold collapses to one tick (ties never shape the climb)', S,
            `const HOLD = 8`,
            `const HOLD = 1`],
        ['#2018 the mallet pickup is dead (attract lies again)', S,
            `if (!gs.hammer) {`,
            `if (false && !gs.hammer) {`],
        ['#2018 the flat smash pays nothing (barrels vaporise free)', S,
            `                gs.barrels.splice(i, 1)
                gs.score += 100
                ev.hammered++`,
            `                gs.barrels.splice(i, 1)
                gs.score += 0
                ev.hammered++`],
        ['#2018 the ladder ban lifts while carrying (trap becomes free power)', S,
            `        wantClimbUp = false
        wantClimbDown = false
        if (wantJump && p.grounded) {`,
            `        if (wantJump && p.grounded) {`],
        ['#2018 the mallet lets you jump anyway (arcade rule stolen)', S,
            `        wantJump = false // no jumping the tower with a mallet in hand`,
            `        wantJump = wantJump // the ban is gone`],
        ['#2018 the mallet never shatters (permanently stuck, no jump)', S,
            `if (gs.hammer <= 0) {`,
            `if (false && gs.hammer <= 0) {`],
        ['#3147 the climb deny goes quiet (silence returns)', S,
            `    if (!p.climbing && wantClimb && !holdable) ev.noClimb = true`,
            `    if (false && !p.climbing && wantClimb && !holdable) ev.noClimb = true`],
        ['#3618 the half-rung gap re-scores open (README CLOSED marker stripped)', 'src/games/DonkeyKong/README.md',
            '**CLOSED by #3618:**',
            '**Gap:**'],
        ['#3618 the rivet-screen phantom returns (README CLOSED marker stripped)', 'src/games/DonkeyKong/README.md',
            '**CLOSED by #3598, phantom-retired in #3618:**',
            '**Gap:**'],
        ['#3754 the walk-past goes deaf (our house 50 vanishes)', S,
            `                    gs.score += 50`,
            `                    gs.score += 0`],
        ['#3754 the walk-past pays every tick it overlaps (once-law gone)', S,
            `!p.passedBarrels.has(b) && !p.jumpedBarrels.has(b)) {`,
            `!p.jumpedBarrels.has(b)) {`],
        ['#3754 the walk-past pays mid-air too (50/100 stop being a pair)', S,
            `            else if (p.grounded && !p.climbing && gs.deathTimer <= 0) {
                if (Math.abs(dx) < 16 && dy <= -10 && dy > -48 && !p.passedBarrels.has(b) && !p.jumpedBarrels.has(b)) {`,
            `            else if (gs.deathTimer <= 0) {
                if (Math.abs(dx) < 16 && dy < 0 && !p.passedBarrels.has(b) && !p.jumpedBarrels.has(b)) {`],
        ['#3754 the walk-past band reaches into the kill box (dying pays 50)', S,
            `dy <= -10 && dy > -48`,
            `dy <= 0 && dy > -48`],
        ['#3761 the +100 popup never prints (jump wins go invisible on a muted phone)', S,
            `                    gs.popups.push({ x: b.x + b.w / 2, y: b.y, text: '+100', age: 0 }) // #3761\n`,
            ``],
        ['#3761 the +50 popup never prints (walk-pasts go invisible again)', S,
            `                    gs.popups.push({ x: b.x + b.w / 2, y: b.y, text: '+50', age: 0 }) // #3761\n`,
            ``],
        ['#3761 popups never expire (the board litters stale bonuses forever)', S,
            `if (gs.popups[i].age >= POPUP_LIFE) gs.popups.splice(i, 1)`,
            `if (false && gs.popups[i].age >= POPUP_LIFE) gs.popups.splice(i, 1)`],
    ]
    let died = 0
    for (const [name, file, from, to] of MUTANTS) {
        const orig = readFileSync(file, 'utf8')
        if (!orig.includes(from)) { ok(false, `mutant anchor: ${name}`, `missing: ${from}`); continue }
        plant(file, orig.replace(from, to))
        const res = spawnSync(process.execPath, ['scripts/kongcheck.mjs'], { encoding: 'utf8', env: { ...process.env, KONG_SWEEP: 'fast' } })
        if (res.status !== 0) { died++; ok(true, `mutant dies: ${name}`) }
        else { ok(false, `mutant dies: ${name}`, 'child passed despite the bug') }
        pull(file)
    }
    ok(died === MUTANTS.length, `all ${MUTANTS.length} mutants die`, `${died}/${MUTANTS.length}`)
}

console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
