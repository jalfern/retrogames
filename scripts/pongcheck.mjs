// pongcheck — PONG (#365 rule 6 attract + #1473 batch-16 seeded terminal).
// The old attract stacked "ATTRACT MODE" over a 40px "PRESS ARROW KEYS TO
// START" that overflowed the 600px canvas. attract.js is the layout the shell
// actually draws, so this audit cannot rot away from the pixels.
// Batch 16 (#1473): the pre-port dice ran naked off Math.random and the game
// had no terminal and no restart. This now also proves the serve-script replays
// from one seed, the seeded draws stay in range, the quit terminal is honest,
// and every human start re-pins ?seed=N.
// Batch 24 (#1637): the whole tick-rule set lives in sim.js (tickPong), and
// §driver proves the seat's route — predictive intercept (watchStep) vs the
// shipped tracker — deterministic, sweeping 40 seeds, reporting the measured
// floor. #3532 then restored the cabinet: the post-point paddle scatter and
// the random hit-spin are gone (strike-position deflection, dice only at
// serve), seed 25's forced loss fell off with them, and the sweep floor is
// re-pinned at the measured 40/40. §deflection owns the new law (edge hits
// steepen, |dy| floor, paddles hold across points, the wall-flip direction
// guard that stops the deterministic ceiling-park).
// #3502 — the cabinet AUTO/RANGE switches: §tiers pins the EASY/NORMAL/HARD
// CPU tiers (measured sweeps 40/40/38) + the human 2P seat, and proves the
// default pick replays the tier-era physics bit-identical — the trace is
// re-baselined at the #3532 head (NORMAL itself changed shape there).
// `--mutate` re-plants the broken behaviours in attract.js; the child MUST die.
// `--mutant` re-plants pre-port seedpin regressions + driver guttings in
// sim/index; same rule.

import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { attractFrame, INFO_MSGS, HOLD, PRESS, DIM, estWidth } from '../src/games/Pong/attract.js'
import { serveBall, strikeSpin, SPIN_K, DY_MIN, stepBall, predictLand, tickPong, cpuTier, DIFFS, RANGES, BASE_SPEED, PADDLE_HEIGHT, PADDLE_WIDTH, PADDLE_OFFSET, BALL_SIZE } from '../src/games/Pong/sim.js'
import { rallyVoice, serveEcho, wallVoice, scoreThud } from '../src/games/Pong/voice.js'
import { digitSegments, digitRects, titleRects, titleFit } from '../src/games/Pong/numerals.js'
import { seedRng, seedFromQuery } from '../src/utils/gameContract.js'
import { plant, pull } from './lib/mutateguard.mjs'

let fails = 0, passes = 0
const ok = (cond, name, detail = '') => {
    if (cond) { passes++; console.log(`  ok   ${name}`) }
    else { fails++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

// ------------------------------------------------------------- attract rule 6 ----
console.log('attract (rule 6)')
{
    const WIDTHS = [280, 320, 600] // 280 = narrow-phone cabinet: keeps the clip mutant honest even when the prompt text is trimmed
    const HEIGHTS = [426, 800]
    const span = HOLD * INFO_MSGS.length + 5
    for (const w of WIDTHS) for (const h of HEIGHTS) {
        let stacked = 0
        let clipped = 0
        const seen = new Set()
        for (let t = 0; t < span; t++) {
            const lines = attractFrame(t, w, h)
            const info = lines.filter((l) => l.text !== 'PONG' && l.text !== PRESS)
            if (info.length > 1) stacked++
            info.forEach((l) => seen.add(l.text))
            for (const l of lines) if (estWidth(l) > w || l.y + l.size > h || l.y - l.size < 0) clipped++
        }
        ok(stacked === 0, `one informational message at a time (${w}x${h})`, `${stacked} stacked frames`)
        ok(clipped === 0, `no attract line clips the frame edge (${w}x${h})`, `${clipped} clipped lines`)
        ok(seen.size === INFO_MSGS.length, `attract cycles every message (${w}x${h})`, `${seen.size}/${INFO_MSGS.length}`)
    }
    let on = 0
    let off = 0
    for (let t = 0; t < 48; t++) (attractFrame(t, 600, 480).some((l) => l.text === PRESS) ? on++ : off++)
    ok(on > 0 && off > 0, 'the press prompt blinks', `on ${on} off ${off}`)
    ok(parseFloat(DIM.match(/([\d.]+)\)$/)?.[1]) >= 0.3, 'the demo dims behind the attract text', DIM)
}

// ------------------------------------------------------- #1473 batch 16 law ----
console.log('seedpin: one stream, honest terminal')
{
    const script = (sd, n) => {
        const rand = seedRng(sd)
        const out = []
        for (let i = 0; i < n; i++) {
            const b = serveBall(rand, 600, 800)
            out.push(`${b.dx}|${b.dy.toFixed(6)}`)
        }
        return out.join(';')
    }
    ok(script(4242, 200) === script(4242, 200), 'same seed → identical 200-serve match script')
    ok(script(4242, 200) !== script(4243, 200), 'different seed → different serve script')
    let bad = 0
    for (let s = 1; s <= 12; s++) {
        const rand = seedRng(s * 7919)
        for (let i = 0; i < 200; i++) {
            const b = serveBall(rand, 600, 800)
            if (Math.abs(b.dx) !== BASE_SPEED) bad++
            if (Math.abs(b.dy) >= BASE_SPEED) bad++
        }
    }
    ok(bad === 0, 'seeded serve draws in range: speed + angle (12 seeds × 200)', `${bad}`)
    // #3532 — the cabinet has exactly two dice: serve direction and angle.
    // Everything else (deflection) is state, not chance. Counting rand() in
    // sim.js pins it: the scatter/spin dice may not come back.
    const simDice = readFileSync('src/games/Pong/sim.js', 'utf8')
    const streamRolls = (simDice.match(/\brand\(\)/g) || []).length
    ok(streamRolls === 2, 'sim.js rolls exactly two dice — both in serveBall (#3532)', `${streamRolls}/2`)
    ok(seedFromQuery('?seed=777') === 777, '?seed=N parses for the pin')

    const src = readFileSync('src/games/Pong/index.jsx', 'utf8')
    const dice = src.match(/Math\.random\(\)/g) || []
    const seedDraws = src.match(/Math\.random\(\) \* 1000000/g) || []
    ok(dice.length === 2 && seedDraws.length === 2,
        'no die leaves the stream (only the two seed generations)', `${dice.length}/${seedDraws.length}`)
    ok(/seed = seedFromQuery\(window\.location\.search\) \?\? Math\.floor\(Math\.random\(\) \* 1000000\)/.test(src) &&
        /rand = seedRng\(seed\)/.test(src), 'startRun regenerates the seed and honors ?seed=N')
    ok(/done: state\.over, seed: seed/.test(src), 'production report carries the seed + honest terminal')
    ok(/tick: tickN, score: state\.left\.score/.test(src), 'report carries tick and the player score')
    const simSrc = readFileSync('src/games/Pong/sim.js', 'utf8')
    const speedups = (simSrc.match(/b\.dx \*= -1\.05/g) || []).length
    ok(speedups === 2, 'the rally accelerates the ball on BOTH paddle returns (1.05×/hit)', `${speedups}/2`)
    const sr = src.match(/const startRun = \(\) => \{[\s\S]*?\n        \}/)
    ok(!!sr && /state\.left\.score = 0/.test(sr[0]) && /state\.right\.score = 0/.test(sr[0]),
        'startRun resets BOTH scores (pre-port the comment literally asked "Reset score? Maybe")')
    ok(/e\.code === 'KeyQ' \|\| e\.code === 'Escape'/.test(src) && /state\.over = true/.test(src),
        'play-to-quit terminal: q/Escape ends the match (no fake win on a capped machine)')
    ok(/if \(state\.over\) \{ startRun\(\); return \}/.test(src), 'any key after quit starts a fresh match')
    ok(/handleCanvasTap/.test(src), 'phones can tap the table to start/restart')
    ok(/exposeGame\(\{[\s\S]*?id: 'pong'/.test(src), 'QA contract exposeGame wired')
}

// --------------------------------------------------------------- deflection ----
// #3532 — the cabinet law: returns steer by WHERE the ball struck the paddle
// (edge steepens, center flattens, ±SPIN_K envelope — what the spin dice used
// to roll, now from state), an |dy| floor ends the converging flat rallies
// that deadlocked the capped EASY table, scoring never touches the paddles,
// and the wall-flip is direction-guarded (penetration stays — the ball simply
// can't park in the ceiling band anymore).
console.log('deflection: strike-position law (#3532)')
{
    ok(strikeSpin(36, 0) === 0, 'a center hit returns flat', `${strikeSpin(36, 0)}`)
    ok(strikeSpin(4, 0) < 0, 'a hit above center kicks UP', `${strikeSpin(4, 0)}`)
    ok(strikeSpin(68, 0) > 0, 'a hit below center kicks DOWN', `${strikeSpin(68, 0)}`)
    ok(strikeSpin(-40, 0) === -SPIN_K && strikeSpin(120, 0) === SPIN_K,
        'edge kicks clamp at ±SPIN_K — the ±2 envelope the spin die had', `${strikeSpin(-40, 0)}/${strikeSpin(120, 0)}`)
    const mkHit = (ballY, dy) => ({
        ball: { x: 30, y: ballY, dx: -4, dy },
        left: { y: 300, score: 0 }, right: { y: 300, score: 0 },
        width: 600, height: 800, over: false, watching: false, rand: seedRng(5),
    })
    const gTop = mkHit(310, 1)
    const dyTop0 = gTop.ball.dy
    tickPong(gTop, null)
    ok(gTop.ball.dy < dyTop0 - 1, 'end-to-end: an upper-half return steepens UP through tickPong', `${dyTop0} -> ${gTop.ball.dy}`)
    const gBot = mkHit(370, -1)
    const dyBot0 = gBot.ball.dy
    tickPong(gBot, null)
    ok(gBot.ball.dy > dyBot0 + 1, 'end-to-end: a lower-half return steepens DOWN', `${dyBot0} -> ${gBot.ball.dy}`)
    const gFlat = mkHit(336, 0.2)
    tickPong(gFlat, null)
    ok(Math.abs(gFlat.ball.dy) >= DY_MIN, `a near-flat return keeps the anti-loop floor |dy| ≥ ${DY_MIN}`, `${gFlat.ball.dy}`)
    const gHold = mkHit(300, 1)
    gHold.ball = { x: 2, y: 500, dx: -6, dy: 1 }
    gHold.right.y = 460 // tracker parked inside its dead zone — nothing moves it this tick
    const holdEv = tickPong(gHold, null)
    ok(holdEv.scored === 1 && gHold.left.y === 300 && gHold.right.y === 460,
        'scoring NEVER moves a paddle (the cabinet held them; the port scattered)', `L${gHold.left.y} R${gHold.right.y}`)
    const gCeil = { x: 300, y: -2, dx: 4, dy: 1 } // just bounced off the ceiling, still in the penetration band
    const ceilBounced = stepBall(gCeil, 800)
    ok(!ceilBounced && gCeil.dy === 1, 'the wall-flip guards direction: a penetrating ball keeps climbing (no ceiling-park)', `dy ${gCeil.dy}, bounced ${ceilBounced}`)
}

// ------------------------------------------------------------------ driver ----
// #1637 batch 24 — the seat's route, proven through the shipped physics.
// watchStep (predictive intercept + #3532 edge-aim, human paddle speed) vs
// cpuStep (the same tracker the player faces). The sweep is the number a
// seat rests on, so it reports its floor honestly: at the #3532 cabinet head
// the driver wins ALL 40 seeds (15 points conceded) — the old seed-25 forced
// loss was a scatter artifact and died with it.
console.log('driver: the proven route (seat of the WATCH key)')
{
    const playSeed = (sd, target = 5, cap = 60 * 600) => {
        const rand = seedRng(sd)
        const gs = {
            ball: { x: 0, y: 0, dx: BASE_SPEED, dy: BASE_SPEED },
            left: { y: 0, score: 0 }, right: { y: 0, score: 0 },
            width: 600, height: 800, over: false, watching: true, rand,
        }
        gs.ball = serveBall(rand, 600, 800)
        gs.left.y = (800 - PADDLE_HEIGHT) / 2 // #3532: match start centers (cabinet power-on)
        gs.right.y = (800 - PADDLE_HEIGHT) / 2
        let t = 0
        while (gs.left.score < target && gs.right.score < target && t < cap) { tickPong(gs, null); t++ }
        return { l: gs.left.score, r: gs.right.score, t }
    }
    const SEEDS = 40
    let wins = 0, con = 0, worstT = 0
    const losses = []
    for (let s = 1; s <= SEEDS; s++) {
        const r = playSeed(s * 7919 + 13)
        if (r.l > r.r) wins++
        else losses.push(`${s}:${r.l}-${r.r}`)
        con += r.r
        if (r.t > worstT) worstT = r.t
    }
    ok(wins === 40, 'the driver beats the machine on ALL 40 seeds (floor pinned at the cabinet head)',
        `wins ${wins}, losses ${losses.join(' ')}`)
    ok(losses.length === 0, 'no forced losses remain — seed 25 fell off with the scatter (#3532)', losses.join(' '))
    ok(con === 15, 'the driver concedes exactly the measured 15 points across the sweep', `${con} points conceded`)
    ok(worstT < 60 * 600, 'no rally runs out the hour cap (no ping-pong deadlock)', `${worstT}t`)
    const d1 = [], d2 = []
    for (let i = 0; i < 15; i++) { d1.push(JSON.stringify(playSeed(424242 + i))); d2.push(JSON.stringify(playSeed(424242 + i))) }
    ok(d1.join('|') === d2.join('|'), 'same seed → identical match, driver side included')
    // #3532 — the seat must actually AIM now: with strike deflection, a dead-
    // center return is a flat gift. Count how the driver strikes across the
    // sweep; the majority of returns must land outside the middle band.
    let steepL = 0, totalL = 0
    for (let s = 1; s <= SEEDS; s++) {
        const rand = seedRng(s * 7919 + 13)
        const gs = { ball: { x: 0, y: 0, dx: BASE_SPEED, dy: BASE_SPEED }, left: { y: (800 - PADDLE_HEIGHT) / 2, score: 0 }, right: { y: (800 - PADDLE_HEIGHT) / 2, score: 0 }, width: 600, height: 800, over: false, watching: true, rand }
        gs.ball = serveBall(rand, 600, 800)
        for (let t = 0; t < 60 * 600 && gs.left.score < 5 && gs.right.score < 5; t++) {
            if (tickPong(gs, null).hitL) {
                totalL++
                if (Math.abs((gs.ball.y + BALL_SIZE / 2) - (gs.left.y + PADDLE_HEIGHT / 2)) >= 0.4 * (PADDLE_HEIGHT / 2)) steepL++
            }
        }
    }
    ok(steepL * 2 > totalL, 'the seat aims edge strikes — over half its returns hit off-center (#3532)', `${steepL}/${totalL}`)
    // the driver's edge is prediction: aim must match the TRUE folded path
    // (triangle-wave mirror at both walls — an independent arithmetic, not a
    // replay of sim.js, so a predictor that forgets the walls disagrees here).
    const appr = { x: 580, y: 30, dx: -4, dy: -3 }
    const land = predictLand(appr, 800)
    const n = Math.ceil((appr.x - (PADDLE_OFFSET + PADDLE_WIDTH)) / 4)
    const unfolded = appr.y + appr.dy * n
    const span = 800 - BALL_SIZE // the ball top's fold span: [0, height - BALL_SIZE]
    const fold = (() => {
        const m = ((unfolded % (2 * span)) + 2 * span) % (2 * span)
        return (m <= span ? m : 2 * span - m) + BALL_SIZE / 2
    })()
    ok(land === fold, 'predictLand replays the wall mirrors exactly (folded-path cross-check)',
        `land ${land} vs folded ${fold}`)
    // #3532 — the ideal fold only proves the clean-crossing case. The other
    // half of the law: the predictor matches the SHIPPED step physics tick
    // for tick, including a flight that starts inside the penetration band
    // (the guarded-flip path). Without this, an unguarded predictor could
    // survive every check while disagreeing with the table mid-rally.
    const truthLand = (b0, h) => {
        const b = { ...b0 }
        let guard = 0
        while (b.x > PADDLE_OFFSET + PADDLE_WIDTH && guard++ < 10000) stepBall(b, h)
        return b.y + BALL_SIZE / 2
    }
    ok(predictLand(appr, 800) === truthLand(appr, 800),
        'predictLand matches stepBall tick-for-tick on a clean flight', `${predictLand(appr, 800)} vs ${truthLand(appr, 800)}`)
    const pen = { x: 580, y: -2, dx: -4, dy: 1 } // rising, already through the ceiling line
    ok(predictLand(pen, 800) === truthLand(pen, 800),
        'and through the penetration band (the guarded flip is shared, not just claimed)',
        `${predictLand(pen, 800)} vs ${truthLand(pen, 800)}`)
    ok(predictLand({ x: 300, y: 100, dx: 5, dy: -7 }, 800) === null,
        'predictLand is honest about a ball heading away (the opponent strike offset is unknowable)')
    // seat + chrome source pins: the seat wired in index, advertised in the registry
    const src = readFileSync('src/games/Pong/index.jsx', 'utf8')
    ok(/isWatchKey\(e\)/.test(src) && /if \(state\.watching && isTakeoverKey\(e\)\) release\(\)/.test(src),
        'Y seats the driver, any ordinary key takes over')
    ok(/watching && screen !== 'attract' && <WatchToast/.test(src), 'the WATCHING toast is mounted')
    ok(/<WatchButton on=\{watching\}/.test(src), 'the WATCH pill is mounted')
    ok(/<AttractWatchButton/.test(src), 'the attract one-tap start-and-watch button is mounted')
    ok(/WATCH_ATTRACT_HINT/.test(src), 'the attract screen advertises the route')
    ok(/__pongTest/.test(src), 'DEV probes exposed for the pilot')
    const reg = readFileSync('src/config/games.js', 'utf8')
    ok(/path: '\/pong'[\s\S]{0,700}WATCH_HELP/.test(reg), 'the registry advertises WATCH for PONG')
}

// ------------------------------------------------------------------- tiers ----
// #3502 — the cabinet AUTO/RANGE switches: EASY / NORMAL / HARD / 2P.
// NORMAL is the default pick and falls back for every diff-less replay;
// EASY is the Easy RANGE (slower, sloppier tracker + a 5.5 horizontal
// ceiling), HARD the Difficult table. #3502's promise was "diff-less ≡ the
// shipped physics, bit-identical"; #3532 corrected that physics (cabinet
// serve), so this trace is RE-BASELINED at the new head — it still proves
// the tier default touches nothing, now against the corrected table.
// Every number below is MEASURED, then pinned; ordering law: the driver's
// wins fall monotonically EASY ≥ NORMAL ≥ HARD.
console.log('tiers: the cabinet switches (#3502)')
{
    const E = cpuTier('EASY'), N = cpuTier('NORMAL'), H = cpuTier('HARD')
    ok(DIFFS.join(',') === 'EASY,NORMAL,HARD,TWO', 'the pick list is EASY · NORMAL · HARD · 2P')
    ok(E.speed === 2.2 && E.zone === 16 && E.cap === 5.5, 'EASY: 2.2 px/tick, ±16 dead zone, 5.5 ceiling', JSON.stringify(E))
    ok(N.speed === 3.5 && N.zone === 10 && N.cap === Infinity, 'NORMAL: the shipped table verbatim (3.5, ±10, uncapped)', JSON.stringify(N))
    ok(H.speed === 4.5 && H.zone === 5 && H.cap === Infinity, 'HARD: 4.5 px/tick, ±5 dead zone, uncapped', JSON.stringify(H))
    ok(cpuTier(undefined) === N && cpuTier('TWO') === N && cpuTier('nonsense') === N, 'unknown/undefined diff falls to NORMAL (every pre-#3502 replay)')

    const playSeed = (sd, diff, target = 5, cap = 60 * 600) => {
        const rand = seedRng(sd)
        const gs = {
            ball: { x: 0, y: 0, dx: BASE_SPEED, dy: BASE_SPEED },
            left: { y: 0, score: 0 }, right: { y: 0, score: 0 },
            width: 600, height: 800, over: false, watching: true, rand, diff,
        }
        gs.ball = serveBall(rand, 600, 800)
        gs.left.y = (800 - PADDLE_HEIGHT) / 2 // #3532 centers (cabinet power-on)
        gs.right.y = (800 - PADDLE_HEIGHT) / 2
        let t = 0
        let maxDx = 0
        while (gs.left.score < target && gs.right.score < target && t < cap) {
            tickPong(gs, null); t++
            if (Math.abs(gs.ball.dx) > maxDx) maxDx = Math.abs(gs.ball.dx)
        }
        return { l: gs.left.score, r: gs.right.score, t, maxDx }
    }
    const sweep = (diff) => {
        let wins = 0, con = 0, maxDx = 0
        const losses = []
        for (let s = 1; s <= 40; s++) {
            const r = playSeed(s * 7919 + 13, diff)
            if (r.l > r.r) wins++
            else losses.push(`${s}:${r.l}-${r.r}`)
            con += r.r
            if (r.maxDx > maxDx) maxDx = r.maxDx
        }
        return { wins, con, losses, maxDx }
    }
    const easy = sweep('EASY'), normalM = sweep(undefined), hard = sweep('HARD')
    ok(easy.wins === 40, 'the driver beats the EASY table on all 40 seeds (measured floor pinned)',
        `wins ${easy.wins}, losses ${easy.losses.join(' ') || '-'}`)
    ok(easy.con === 0, 'EASY concedes exactly the measured 0 points (#3532 re-pin)', `${easy.con}`)
    ok(normalM.wins === 40, 'NORMAL — the default pick — sweeps clean at the cabinet head', `wins ${normalM.wins}`)
    ok(hard.wins === 38 && hard.losses.length === 2 && hard.losses[0].startsWith('14:') && hard.losses[1].startsWith('24:'),
        'the driver beats HARD on 38 of 40 — seeds 14 and 24 fall (measured, pinned; the old 13/29 pair was scatter-drawn)',
        `wins ${hard.wins}, losses ${hard.losses.join(' ')}`)
    ok(easy.wins >= normalM.wins && normalM.wins >= hard.wins, 'ordering law: the driver wins at least as much on EASY as NORMAL as HARD',
        `${easy.wins}/${normalM.wins}/${hard.wins}`)
    ok(easy.maxDx <= 5.5 + 1e-9, 'the Easy RANGE ceiling holds every tick of the 40-seed sweep', `${easy.maxDx.toFixed(4)}`)
    ok(Math.abs(easy.maxDx - 5.5) < 1e-9, 'and it actually engages (max |dx| lands on the ceiling)', `${easy.maxDx}`)
    ok(normalM.maxDx > 9, 'NORMAL/HARD stay uncapped (the ceiling is EASY-only)', `${normalM.maxDx.toFixed(4)}`)
    const trace = (diff) => {
        const rand = seedRng(90210)
        const gs = { ball: { x: 0, y: 0, dx: BASE_SPEED, dy: BASE_SPEED }, left: { y: 0, score: 0 }, right: { y: 0, score: 0 }, width: 600, height: 800, over: false, watching: true, rand, diff }
        gs.ball = serveBall(rand, 600, 800)
        gs.left.y = (800 - PADDLE_HEIGHT) / 2 // #3532 centers (cabinet power-on)
        gs.right.y = (800 - PADDLE_HEIGHT) / 2
        const out = []
        for (let t = 0; t < 3000; t++) {
            tickPong(gs, null)
            out.push(`${gs.ball.x.toFixed(9)}|${gs.ball.y.toFixed(9)}|${gs.ball.dx.toFixed(9)}|${gs.right.y.toFixed(9)}`)
        }
        return out.join(';')
    }
    ok(trace(undefined) === trace('NORMAL'), 'diff-less replays and NORMAL are bit-identical (3000-tick trace, seed 90210)')
    ok(JSON.stringify(sweep('HARD')) === JSON.stringify(sweep('HARD')) &&
        JSON.stringify(easy) === JSON.stringify(sweep('EASY')), 'tier sweeps are deterministic (seeded, twice identical)')

    // 2P — AUTO off: no input, the right paddle never moves; W/S drive it.
    const mkTwo = () => ({
        ball: { x: 300, y: 400, dx: BASE_SPEED, dy: 1 },
        left: { y: 0, score: 0 }, right: { y: 400, score: 0 },
        width: 600, height: 800, over: false, watching: false, rand: seedRng(777), diff: 'TWO',
    })
    const gs2 = mkTwo()
    for (let t = 0; t < 120; t++) tickPong(gs2, null)
    ok(gs2.right.y === 400, '2P: the right paddle is inert with no player (the AUTO switch is off)', `${gs2.right.y}`)
    const gs3 = mkTwo()
    tickPong(gs3, { up2: true })
    const afterUp = gs3.right.y
    ok(afterUp === 400 - 6, '2P: W drives the right paddle at PAD_SPEED', `${afterUp}`)
    tickPong(gs3, { down2: true })
    ok(gs3.right.y === afterUp + 6, '2P: S drives it back', `${gs3.right.y}`)

    // shell wiring pins
    const src = readFileSync('src/games/Pong/index.jsx', 'utf8')
    ok(/ArrowLeft' \|\| e\.code === 'ArrowRight/.test(src) && /cyclePick\(/.test(src),
        'attract LEFT/RIGHT cycles the pick (and is the only attract key that does not start)')
    ok(/className="pong-pick-zone"/.test(src) && /cyclePickRef\.current/.test(src),
        'the pick label is tappable on attract (the band rides the same dial)')
    ok(!/MATCH OVER  YOU WIN/.test(src) && /PLAYER ONE WINS/.test(src) && /PLAYER TWO WINS/.test(src)
        && /MATCH TIED/.test(src) && /YOU LOSE/.test(src),
        'the quit card reports the TRUE result (2P winners, solo YOU WIN/LOSE/TIED)')
    ok(/get\('diff'\)/.test(src) && /diff = d - 1/.test(src), '?diff=N pins the pick for QA')
    ok(/up2: keys\.KeyW, down2: keys\.KeyS/.test(src), 'W/S reach the sim as player two')
    ok(/SELECT GAME/.test(src) && /DIFFS\[diff\]/.test(src), 'the attract screen shows the pick (drawn in the shell, rule-6 audit untouched)')
    ok(/diff: DIFFS\[diff\]/.test(src), 'the report carries the pick')
    const reg = readFileSync('src/config/games.js', 'utf8')
    ok(/Left\/Right on attract: pick EASY \/ NORMAL \/ HARD \/ 2P/.test(reg), 'the registry teaches the selector')
}

// ------------------------------------------------- #3536 serve (voice + flash) ----
console.log('serve: the first return of a point (#3536)')
{
    const mk = () => ({
        ball: { x: 300, y: 400, dx: BASE_SPEED, dy: 1 },
        left: { y: 360, score: 0 }, right: { y: 360, score: 0 },
        width: 600, height: 800, over: false, watching: false,
        rand: seedRng(7), diff: 'NORMAL', servePending: true,
    })
    const atLeft = (gs) => { gs.ball = { x: PADDLE_OFFSET + PADDLE_WIDTH, y: 200, dx: -BASE_SPEED, dy: 1 }; gs.left.y = 196 }
    const g1 = mk()
    atLeft(g1)
    const e1 = tickPong(g1, {})
    ok(e1.hitL && e1.serve, 'the first return after a serve is marked', `hitL=${e1.hitL} serve=${e1.serve}`)
    atLeft(g1)
    const e2 = tickPong(g1, {})
    ok(e2.hitL && !e2.serve, 'the serve mark does not repeat mid-rally', `serve=${e2.serve}`)
    g1.ball = { x: 2, y: 400, dx: -BASE_SPEED, dy: 0 }
    const e3 = tickPong(g1, {})
    ok(e3.scored === 1, 'a conceded point scores (setup)', `scored=${e3.scored}`)
    ok(g1.servePending === true, 'the new ball re-arms the serve', String(g1.servePending))
    atLeft(g1)
    const e4 = tickPong(g1, {})
    ok(e4.hitL && e4.serve, 'the next point’s first return is marked again', `serve=${e4.serve}`)
    // observation, not physics: same seed, servePending removed → identical trace
    const trace = (withFlag) => {
        const g = mk()
        if (!withFlag) delete g.servePending
        let out = ''
        for (let i = 0; i < 600; i++) { tickPong(g, {}); out += `${g.ball.x.toFixed(3)},${g.ball.y.toFixed(3)},${g.left.y},${g.right.y};` }
        return out
    }
    ok(trace(true) === trace(false), 'servePending moves nothing but the flag')
    const idx = readFileSync('src/games/Pong/index.jsx', 'utf8')
    ok(/servePending = true/.test(idx) && /serveFlash/.test(idx), 'the shell arms the serve at match start and flashes the ball')
    ok(/visible=\{screen === 'play' && !paused\}/.test(idx), 'the pad + chip rail live only in play (menu/death stay chip-free)')
    ok(/WATCH_ATTRACT_HINT, state\.width \/ 2, state\.height \* 0\.62/.test(idx), 'the attract WATCH hint sits clear of the pill (0.62h)')
}

// --------------------------------------------------------------- #3536 voice ----
console.log('voice: the widened cabinet sound law (#3536)')
{
    const tiers = DIFFS
    const dys = [0, 0.5, 1, 2, 3, 4, 5, -0.5, -2, -5]
    const dxs = [4, 5, 6, 8, 10, 12, 14]
    const all = []
    for (const t of tiers) for (const dy of dys) for (const dx of dxs) all.push({ t, v: rallyVoice(dy, dx, t) })
    ok(all.every(({ v }) => [v.freq, v.dur, v.vol].every(Number.isFinite) && v.freq > 0 && v.dur > 0 && v.vol > 0 && v.vol <= 0.2),
        'every rally voice is a finite, audible, in-budget pulse', `${all.length} voices`)
    ok(all.every(({ v }) => ['square', 'triangle', 'sawtooth'].includes(v.type)), 'the voice stays in the oscillator family')
    let mono = true
    for (const t of tiers) for (const dx of dxs) {
        const f = (dy) => rallyVoice(dy, dx, t).freq
        if (!(f(0.5) > f(0) && f(2) > f(1) && f(4) > f(3) && f(5) === f(5))) mono = false
        if (Math.abs(f(-2) - f(2)) > 1e-9) mono = false // the law rides |dy|, not sign
    }
    ok(mono, 'pitch rides the strike angle (steeper return = higher ping, sign-free)')
    let bright = true
    for (const t of tiers) for (const dy of dys) {
        if (!(rallyVoice(dy, 8, t).freq > rallyVoice(dy, 4, t).freq)) bright = false
    }
    ok(bright, 'faster rally = brighter ping')
    ok(rallyVoice(2, 6, 'EASY').type === 'triangle' && rallyVoice(2, 6, 'EASY').vol < rallyVoice(2, 6, 'NORMAL').vol
        && rallyVoice(2, 6, 'EASY').freq < rallyVoice(2, 6, 'NORMAL').freq,
    'EASY sounds softer (triangle, lower, quieter)')
    ok(rallyVoice(2, 6, 'HARD').freq > rallyVoice(2, 6, 'NORMAL').freq && rallyVoice(2, 6, 'HARD').vol > rallyVoice(2, 6, 'NORMAL').vol
        && rallyVoice(2, 6, 'HARD').dur < rallyVoice(2, 6, 'NORMAL').dur,
    'HARD sounds edgier (brighter, louder, shorter)')
    ok(Math.abs(rallyVoice(2, 6, 'TWO').freq - rallyVoice(2, 6, 'NORMAL').freq) < 1e-9, '2P keeps the NORMAL voice')
    const w = wallVoice(), th = scoreThud()
    const minRally = Math.min(...all.map(({ v }) => v.freq))
    ok(w.freq < minRally && w.dur <= 0.05, 'the wall tick sits below every rally ping', `wall ${w.freq} vs min ${minRally.toFixed(1)}`)
    ok(th.freq < w.freq && th.type === 'sawtooth' && th.dur > w.dur * 4 && th.noise,
        'the score is a low thud with a noise body — distinct from every ping')
    const echo = serveEcho(rallyVoice(2, 6, 'NORMAL'))
    ok(echo.freq > rallyVoice(2, 6, 'NORMAL').freq && echo.delay > 0 && echo.vol <= rallyVoice(2, 6, 'NORMAL').vol
        && echo.dur <= 0.05, 'the serve answers the first return with a higher quick echo')
    const idx = readFileSync('src/games/Pong/index.jsx', 'utf8')
    ok(/rallyVoice\(/.test(idx) && /serveEcho\(/.test(idx) && /wallVoice\(/.test(idx) && /scoreThud\(/.test(idx),
        'the shell plays the widened vocabulary (not the old fixed tones)')
    ok(!/playTone\(400, 0\.1, 'square'\)/.test(idx), 'the old one-tone-per-hit ping is gone')
}

// ------------------------------------------------------------- #3536 numerals ----
console.log('numerals: block video digits (#3536)')
{
    const SEGS = [6, 2, 5, 5, 4, 5, 6, 3, 7, 6] // bars per digit 0..9
    ok(digitSegments(1) === 'bc' && SEGS.every((n, d) => digitSegments(d).length === n),
        'the segment map lights like a seven-segment display')
    const sizes = [24, 32, 44, 56]
    let boxed = true, gapped = true, sized = true
    for (const h of sizes) for (let d = 0; d <= 9; d++) {
        const { w, rects } = digitRects(d, h)
        if (rects.length !== SEGS[d]) sized = false
        for (const [x, y, rw, rh] of rects) if (x < 0 || y < 0 || x + rw > w || y + rh > h || rw <= 0 || rh <= 0) boxed = false
        for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
            const [ax, ay, aw, ah] = rects[i], [bx, by, bw, bh] = rects[j]
            if (ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah) gapped = false
        }
    }
    ok(sized, 'every digit carries its proper bar count')
    ok(boxed, 'no bar leaves the digit box')
    ok(gapped, 'no two bars touch — the notches are the look')
    const one = digitRects(1, 44)
    ok(one.rects.length === 2 && one.rects.every(([x]) => x === one.w - Math.max(2, Math.round(44 / 8))),
        'a "1" is the two right-hand bars')
    const t = titleRects('PONG', 70)
    ok(t.cells.length >= 60 && t.h === 70 && t.w > 0 && t.cells.every(([, gy]) => gy >= 0 && gy < 7),
        'the P·O·N·G word-mark draws on a 7-row grid', `${t.cells.length} cells`)
    ok(titleRects('P', 70).cells.length === 15, 'P lights 15 blocks (map sanity)')
    // #3536 measurement: at iPhone-SE landscape the table is ~242px wide — the
    // mark must shrink to fit (the first cut clipped the P and the G).
    let fits = true
    for (const [w, h] of [[242, 343], [480, 640], [600, 800]]) {
        const th = titleFit(w, h)
        if (titleRects('PONG', th).w > w * 0.92 + 1 || th < 20) fits = false
    }
    ok(fits, 'the word-mark fits the phone-width cabinet (242px measured)')
    const idx = readFileSync('src/games/Pong/index.jsx', 'utf8')
    ok(/drawBlockScore\(/.test(idx), 'the live score is drawn as block numerals')
    ok(/drawBlockTitle\(/.test(idx) && /titleFit\(/.test(idx), 'the attract title is a fitted block word-mark')
}

// ------------------------------------------------------------------- range ----
// #3565 — the selectable max-score knob (a FEATURE, not a restoration: the
// 1972 RANGE switch was the Easy/Difficult speed control, already restored
// by #3502's tiers; the b16 play-to-quit ruling stands as the FREE default).
// Proves: FREE never caps (the b16 default replays uncapped), a chosen target
// binds in the SHIPPED physics — sweeps end at EXACTLY N with the honest
// winner — and the terminal point never re-serves (no dead ball, no dice
// burned on it). Plus the classic ladder and the shell wiring: ↑/↓ cycle the
// dial, the ?range= pin, the FIRST TO line on the card, the win sting.
console.log('range: the selectable max-score knob (#3565)')
{
    const mk = (sd, range) => {
        const rand = seedRng(sd)
        const gs = {
            ball: { x: 0, y: 0, dx: BASE_SPEED, dy: BASE_SPEED },
            left: { y: 0, score: 0 }, right: { y: 0, score: 0 },
            width: 600, height: 800, over: false, watching: true, rand, range,
        }
        gs.ball = serveBall(rand, 600, 800)
        gs.left.y = gs.right.y = (800 - PADDLE_HEIGHT) / 2
        return gs
    }
    const sweep = (target, seeds) => {
        let badEnd = 0, con = 0, deadServe = 0, worstT = 0
        for (let s = 1; s <= seeds; s++) {
            const gs = mk(s * 7919 + 13, target)
            let t = 0, ev = null
            while (!gs.over && t < 60 * 600) { ev = tickPong(gs, null); t++ }
            if (t >= 60 * 600) { badEnd++; continue }
            if (!(gs.left.score === target && gs.right.score < target && ev?.winner === 1)) badEnd++
            if (gs.ball.x > 0 && gs.ball.x < gs.width) deadServe++ // the win point must not re-serve
            con += gs.right.score
            if (t > worstT) worstT = t
        }
        return { wins: seeds - badEnd, con, deadServe, worstT }
    }
    ok(RANGES.join(',') === 'FREE,1,3,5,7,9', 'the ladder is FREE · 1 · 3 · 5 · 7 · 9 (the classic dial steps)', RANGES.join(','))
    const r3 = sweep(3, 40)
    ok(r3.wins === 40 && r3.deadServe === 0, 'range 3: the driver wins ALL 40 seeds, every match ending at exactly 3, never a dead serve', `wins ${r3.wins}, dead ${r3.deadServe}`)
    ok(r3.con === 5, 'the range-3 sweep concedes exactly the measured 5 points (pinned)', `${r3.con}`)
    ok(r3.worstT < 60 * 600, 'no range-3 match runs out the hour cap', `${r3.worstT}t`)
    const r1 = sweep(1, 20)
    ok(r1.wins === 20 && r1.deadServe === 0, 'range 1: the very first point ends the match honestly (20 seeds)', `wins ${r1.wins}, dead ${r1.deadServe}`)
    const r5 = sweep(5, 12)
    ok(r5.wins >= 11 && r5.deadServe === 0, 'range 5 terminates honestly too (the driver still owns the table)', `wins ${r5.wins}/12`)
    const one = (sd, r) => { const gs = mk(sd, r); let t = 0; while (!gs.over && t < 60 * 600) { tickPong(gs, null); t++ } return `${gs.left.score}-${gs.right.score}@${t}` }
    ok(one(888888, 3) === one(888888, 3), 'seed + range replay bit-identical')
    {
        const gs = mk(17, null)
        let t = 0
        while (t < 4000) { tickPong(gs, null); t++ }
        ok(!gs.over && gs.left.score >= 3, 'FREE is no cap: 4000 ticks uncapped, the match rolls on (b16 default untouched)', `${gs.left.score}-${gs.right.score}`)
    }
    {
        const a = mk(17, undefined), b = mk(17, undefined)
        let t = 0
        while (t < 1500) { tickPong(a, null); tickPong(b, null); t++ }
        ok(!a.over && a.left.score === b.left.score && a.right.score === b.right.score,
            'a gs without range behaves exactly like the pre-#3565 table')
    }
    {
        const idx = readFileSync('src/games/Pong/index.jsx', 'utf8')
        ok(/e\.code === 'ArrowUp' \|\| e\.code === 'ArrowDown'/.test(idx) && /cycleRange\(e\.code === 'ArrowUp' \? 1 : -1\)/.test(idx),
            'attract: UP/DOWN turn the RANGE dial')
        ok(/get\('range'\)/.test(idx), 'the ?range= pin reaches the dial')
        ok(/RANGES\[rangeIdx\]/.test(idx), 'the attract dial shows the pick in force')
        ok(/FIRST TO \$\{state\.range\}/.test(idx), 'the over card names the contract it played (FIRST TO N)')
        ok(/sfx\('win'/.test(idx), 'the cap win rings its own sting (distinct from the quit saw)')
        ok(/className="pong-range-zone"/.test(idx) && /cycleRangeRef\.current\(1\)/.test(idx),
            'the RANGE dial answers a thumb, not just the keyboard')
        ok(/range: RANGES\[rangeIdx\]/.test(idx), 'the QA report and probes carry the range')
    }
}

// ------------------------------------------------------------------ mutants ----
if (process.argv.includes('--mutant')) {
    console.log('mutants (each MUST die)')
    const I = 'src/games/Pong/index.jsx'
    const S = 'src/games/Pong/sim.js'
    const V = 'src/games/Pong/voice.js'
    const N = 'src/games/Pong/numerals.js'
    const MUTANTS = [
        ['human start ignores ?seed (pin removed)', I,
            `seed = seedFromQuery(window.location.search) ?? Math.floor(Math.random() * 1000000)`,
            `seed = Math.floor(Math.random() * 1000000)`],
        ['production report drops the seed', I,
            `tick: tickN, score: state.left.score, done: state.over, seed: seed, opp: state.right.score,`,
            `tick: tickN, score: state.left.score, done: state.over, opp: state.right.score,`],
        ['serve direction leaves the stream', S,
            `dx: (rand() > 0.5 ? 1 : -1) * BASE_SPEED`,
            `dx: (Math.random() > 0.5 ? 1 : -1) * BASE_SPEED`],
        ['restart forgets the scores', I,
            `            state.left.score = 0
            state.right.score = 0
            state.over = false`,
            `            state.over = false`],
        ['the rally stops accelerating (flat 1.00× return)', S,
            `b.dx *= -1.05 // Slight speed up`,
            `b.dx *= -1 // Slight speed up`],
        // b24 driver guttings — each must drop the sweep below its pinned floor
        ['the seat poses: watchStep is never consulted', S,
            `        const act = watchStep(gs)`,
            `        const act = null`],
        ['prediction forgets the walls (straight-line lie)', S,
            `        y += dy
        if ((y <= 0 && dy < 0) || (y + BALL_SIZE >= height && dy > 0)) dy *= -1 // the same guarded flip — replay it exactly or the answer lies
    }`,
            `        y += dy
    }`],
        ['the driver steers to the wrong side of its target', S,
            `        if (act?.down) gs.left.y += PAD_SPEED`,
            `        if (act?.down) gs.left.y -= PAD_SPEED`],
        ['a steer no longer takes the wheel back', I,
            `            if (state.watching && isTakeoverKey(e)) release()`,
            `            if (false && state.watching && isTakeoverKey(e)) release()`],
        // #3532 cabinet-law anchors — where the scatter/spin dice used to be.
        // The regressions they guard (re-planted dice, flat/steer-blind returns,
        // ceiling-park, deadlocks) must die with the law pinned.
        ['paddles scatter again after a point', S,
            `        ev.scored = 1 // left conceded`,
            `        ev.scored = 1 // left conceded
        gs.left.y = gs.rand() * (gs.height - PADDLE_HEIGHT)
        gs.right.y = gs.rand() * (gs.height - PADDLE_HEIGHT)`],
        ['deflection ignores strike position (flat returns)', S,
            `    ball.dy += strikeSpin(ball.y, paddleY)`,
            `    ball.dy += 0`],
        ['strike deflection sign-flipped (edges steer the wrong way)', S,
            `    ball.dy += strikeSpin(ball.y, paddleY)`,
            `    ball.dy += -strikeSpin(ball.y, paddleY)`],
        ['the anti-loop floor is gone (deadlock reborn)', S,
            `    if (Math.abs(ball.dy) < DY_MIN) ball.dy = (ball.dy < 0 ? -1 : 1) * DY_MIN`,
            `    // floor removed`],
        ['the wall-flip guard is gone (ceiling-park reborn)', S,
            `    if ((ball.y <= 0 && ball.dy < 0) || (ball.y + BALL_SIZE >= height && ball.dy > 0)) {`,
            `    if (ball.y <= 0 || ball.y + BALL_SIZE >= height) {`],
        ['prediction re-flips inside the wall (unguarded vs physics)', S,
            `        if ((y <= 0 && dy < 0) || (y + BALL_SIZE >= height && dy > 0)) dy *= -1 // the same guarded flip — replay it exactly or the answer lies`,
            `        if (y <= 0 || y + BALL_SIZE >= height) dy *= -1`],
        ['the seat stops aiming (dead-center flat gifts)', S,
            `const AIM_RATIO = 0.75 // fraction of paddle half-height aimed (edge strike)`,
            `const AIM_RATIO = 0 // fraction of paddle half-height aimed (edge strike)`],
        // #3502 tier guttings — each must break a pinned tiers gate.
        ['tier select is dead: every pick runs the NORMAL table', S,
            `export const cpuTier = (diff) => CPU_TIERS[diff] || CPU_TIERS.NORMAL`,
            `export const cpuTier = () => CPU_TIERS.NORMAL`],
        ['the Easy RANGE ceiling never clamps', S,
            `        b.dx *= -1.05 // Slight speed up
        if (Math.abs(b.dx) > tier.cap) b.dx = Math.sign(b.dx) * tier.cap // Easy RANGE ceiling (#3502)`,
            `        b.dx *= -1.05 // Slight speed up
        if (Math.abs(b.dx) > Infinity) b.dx = Math.sign(b.dx) * tier.cap // Easy RANGE ceiling (#3502)`],
        ['the AUTO switch ignores HUMAN: 2P still runs the machine', S,
            `    if (gs.diff === 'TWO') {`,
            `    if (false && gs.diff === 'TWO') {`],
        ["player two's W key is unplugged", S,
            `        if (input?.up2) gs.right.y -= PAD_SPEED`,
            `        if (input?.up2) gs.right.y -= 0`],
        // #3536 voice/numerals/serve anchors — the widened vocabulary and the
        // block face must die when their law is gutted.
        ['rally pitch ignores the strike (flat ping)', V,
            `    const angle = Math.min(Math.abs(dy), 5)`,
            `    const angle = 0`],
        ['the wall tick outranks the rally ping', V,
            `    return { freq: 170, dur: 0.045, type: 'square', vol: 0.07 }`,
            `    return { freq: 700, dur: 0.045, type: 'square', vol: 0.07 }`],
        ['EASY loses its soft character', V,
            `        type: easy ? 'triangle' : 'square',`,
            `        type: 'square',`],
        ['the score thud is just another ping', V,
            `    return { freq: 98, dur: 0.3, type: 'sawtooth', vol: 0.16, noise: { dur: 0.09, vol: 0.12 } }`,
            `    return { freq: 400, dur: 0.05, type: 'square', vol: 0.1, noise: { dur: 0.09, vol: 0.12 } }`],
        ['the serve flag double-fires (never cleared)', S,
            `        ev.serve = gs.servePending === true
        gs.servePending = false`,
            `        ev.serve = gs.servePending === true`],
        ['the serve never re-arms after a point', S,
            `        gs.servePending = true // new ball in play — its first return is the serve (#3536)
        ev.scored = 1`,
            `        ev.scored = 1`],
        ['the seven-segment map miswires the 1', N,
            `0: 'abcdef', 1: 'bc',`,
            `0: 'abcdef', 1: 'ab',`],
        ['the segment gaps collapse (bars merge)', N,
            `    const half = Math.max(2, mid - t - 2 * g)`,
            `    const half = Math.max(2, mid - g)`],
        // #3565 range anchors — the target must bind EXACTLY, and FREE must
        // stay free: each of these breaks a §range pin.
        ['the RANGE cap never fires (targets ignored)', S,
            `const capHit = (gs, score) => typeof gs.range === 'number' && score >= gs.range`,
            `const capHit = () => false`],
        ['the cap fires one point late (N+1)', S,
            `&& score >= gs.range`,
            `&& score > gs.range`],
        ['FREE is misread as a cap (every point ends it)', S,
            `typeof gs.range === 'number'`,
            `gs.range !== undefined`],
    ]
    let died = 0
    for (const [name, file, from, to] of MUTANTS) {
        const orig = readFileSync(file, 'utf8')
        if (!orig.includes(from)) { ok(false, `mutant anchor: ${name}`, `missing: ${from}`); continue }
        plant(file, orig.replace(from, to))
        const res = spawnSync(process.execPath, ['scripts/pongcheck.mjs'], { encoding: 'utf8' })
        if (res.status !== 0) { died++; ok(true, `mutant dies: ${name}`) }
        else { ok(false, `mutant dies: ${name}`, 'child passed despite the bug') }
        pull(file)
    }
    ok(died === MUTANTS.length, `all ${MUTANTS.length} seedpin mutants die`, `${died}/${MUTANTS.length}`)
}

// ------------------------------------------------------------------ mutants ----
if (process.argv.includes('--mutate')) {
    console.log('mutants (each MUST die)')
    const F = 'src/games/Pong/attract.js'
    const MUTANTS = [
        ['attract stacks a second message',
            `        { text: msg, x: w / 2, y: h * 0.42, size: fitSize(msg, w, 15), col: '#9aa4b2', glow: 0 },`,
            `        { text: msg, x: w / 2, y: h * 0.42, size: fitSize(msg, w, 15), col: '#9aa4b2', glow: 0 },
        { text: 'ARROWS MOVE', x: w / 2, y: h * 0.46, size: 12, col: '#9aa4b2', glow: 0 },`],
        ['attract message never cycles',
            `cycleAttract(tick, INFO_MSGS, HOLD)`,
            `INFO_MSGS[0]`],
        ['a line clips the frame edge',
            `size: fitSize(PRESS, w, 18),`,
            `size: 24,`],
        ['the press prompt never blinks',
            `!l.blink || Math.floor(tick / 24) % 2 === 0`,
            `true`],
        ['no dim behind the attract text',
            `export const DIM = 'rgba(0,0,0,0.55)'`,
            `export const DIM = 'rgba(0,0,0,0)'`],
    ]
    let died = 0
    for (const [name, from, to] of MUTANTS) {
        const orig = readFileSync(F, 'utf8')
        if (!orig.includes(from)) { ok(false, `mutant anchor: ${name}`, `missing: ${from}`); continue }
        plant(F, orig.replace(from, to))
        const res = spawnSync(process.execPath, ['scripts/pongcheck.mjs'], { encoding: 'utf8' })
        if (res.status !== 0) { died++; ok(true, `mutant dies: ${name}`) }
        else { ok(false, `mutant dies: ${name}`, 'child passed despite the bug') }
        pull(F)
    }
    ok(died === MUTANTS.length, `all ${MUTANTS.length} attract mutants die`, `${died}/${MUTANTS.length}`)
}

console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
