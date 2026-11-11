// PAPERS, PLEASE-MIN — the booth. The rules are the pure engine in
// ./rules.js, the week is the seeded generator in ./gen.js (every deny it
// produces has a witness printed on this canvas), and ./sim.js is a pure
// (state, input) day loop. The attract demo is the autopilot's own proven
// week, stamped tick for tick — the same script scripts/paperscheck.mjs
// grades and scripts/papersplay.mjs drives with real keys.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import AttractMessage from '../../components/AttractMessage'
import { PRESS, MESSAGES } from './attract.js'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { CFG, newRun, step, stateHash, current, autopilot } from './sim.js'
import { exposeFeedbackState, unexposeFeedbackState, seedFromQuery } from '../../utils/gameContract'
import WatchButton, { WatchToast, AttractWatchButton } from '../../components/WatchButton'
import { isWatchKey, isTakeoverKey, playWatchStart, playWatchStop, watchSfxLog, WATCH_ATTRACT_HINT } from '../../utils/watch'
import { decide, RULES, dfmt, isAdult } from './rules.js'
import { CW, CHS, STRIP_H, WALL, SCALE, PORTRAIT, PAPERS, ID, STAMP, PHOTO, wallRows } from './layout.js'

const SIM_MS = 1000 / 60

const COL = {
    wall: '#1c2130', wallLine: '#323a52', paper: '#d8d2b8', paperLine: '#8f8a70',
    ink: '#20242e', red: '#d84343', green: '#49b25a', gold: '#e8c15a', text: '#cfd6e6',
}

// #1938 PORTRAIT — faces are painted from a descriptor, not from the
// pic: the live booth face, the passport photo and the DEV pixel probe all
// run through drawFace, so "the photo differs" means "this function's
// pixels differ". Structural features (hair cut, face width, glasses,
// facial hair) are what the PORTRAIT rule compares; colors are atmosphere
// — time fades hair, and an old photo of the right person is not a lie.
const SKINS = ['#e8c39e', '#d2a679', '#b07f55', '#8a5a3a', '#f0d3b4']
const HAIRS = ['#2c2622', '#5a3b1e', '#8d1f1f', '#b3b6bd', '#1e1e28']
const SHIRTS = ['#39466e', '#6e4b7a', '#4b7a5e', '#7a634b']

const PapersPleaseMinGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [end, setEnd] = useState(null)
    const screenRef = useRef('attract')
    const [watching, setWatching] = useState(false) // #1637 WATCH: sim.js autopilot() stamps the booth
    const watchingRef = useRef(false)
    const pausedRef = useRef(false)
    const overAtRef = useRef(0)
    const setMode = useCallback((m) => { screenRef.current = m; setScreen(m) }, [])

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const canvas = document.createElement('canvas')
        canvas.dataset.ppStage = '1'
        canvas.width = CW; canvas.height = CHS
        canvas.className = 'block w-full h-full'
        canvas.style.imageRendering = 'pixelated'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false

        let gs = newRun(0)
        let raf = 0, last = 0, acc = 0
        let simTick = 0           // #1473: play-frame counter for the feedback report
        let stamp = null            // {ok, why, ticks}
        let banner = null           // {text, sub, ticks}
        let demoScript = null, demoAt = 0, demoWait = 0, demoSeed = 0
        const evLog = []
        // #1637 WATCH — seat the perfect inspector paperscheck proves survives
        // the week: clone the live booth, ask autopilot() for the calls, decline
        // honestly if the booth can no longer survive. The sim is deterministic
        // (paperscheck replays the week tick for tick), so the clone's verdicts
        // applied at their waits are the proven line, live.
        let watchScript = null, watchI = 0, watchWait = 0
        const seatWatcher = () => {
            if (!gs || gs.end || screenRef.current !== 'play' || pausedRef.current) return false
            const r = autopilot(structuredClone(gs), 999)
            if (!r.ok || !r.script.length) return false
            watchScript = r.script; watchI = 0; watchWait = 0
            return true
        }
        const releaseWatch = () => { watchingRef.current = false; setWatching(false); watchScript = null; playWatchStop() }

        const act = (action) => {
            if (screenRef.current !== 'play' || pausedRef.current || gs.end) return
            const stamped = current(gs).applicant.person   // stamp the papers YOU just judged
            const before = gs.strikes
            step(gs, { action })
            if (!gs.end) {
                stamp = { ok: gs.last?.ok, why: gs.last?.why, verdict: action, person: stamped, ticks: 30 }
                audioController.playTone(action === 'approve' ? 300 : 190, 0.06, 'square', 0.06)
                if (gs.strikes > before) audioController.playSweep(220, 90, 0.35, 'sawtooth', 0.08)
                else if (gs.last?.ok) audioController.playTone(action === 'deny' ? 760 : 560, 0.07, 'square', 0.05)
                for (const e of gs.events) evLog.push({ ...e })
                const ed = gs.events.find((e) => e.type === 'endday')
                if (ed) {
                    const nRules = gs.week.days[gs.day - 1].rules
                    const newest = nRules[nRules.length - 1]
                    banner = { text: `DAY ${gs.day} — THE LINE MOVES`, sub: `NEW RULE: ${RULES[newest].text}`, ticks: 200 }
                    audioController.playSweep(420, 760, 0.4, 'triangle', 0.06)
                }
            }
            gs.events.length = 0
            if (gs.end) finish(gs.end)
        }

        const finish = (res) => {
            watchingRef.current = false; setWatching(false); watchScript = null // #1637 the week ends in your hands
            setEnd({ win: res === 'win', why: gs.endWhy, score: gs.score, caught: gs.caught, day: gs.day })
            if (res === 'win') audioController.playSweep(400, 1500, 0.9, 'square', 0.08)
            else audioController.playSweep(300, 50, 1.2, 'sawtooth', 0.1)
            overAtRef.current = performance.now()
            setMode('over')
        }

        const startPlay = (seed = 0) => {
            // #1473: honor ?seed=N at the default human-start so a filed
            // report replays this exact week (applicants, rules and all).
            // Digit2-4 stay explicit picks; the report carries gs.seed.
            const pin = seedFromQuery()
            if (seed === 0 && pin != null) seed = pin >>> 0
            gs = newRun(seed)
            simTick = 0
            demoSeed = seed
            evLog.length = 0
            stamp = null; banner = null
            watchingRef.current = false; setWatching(false); watchScript = null // #1637 a new week starts in your hands
            audioController.playSweep(220, 440, 0.25, 'square', 0.07)
            setMode('play')
        }

        const demoRun = (seed) => {
            if (!demoScript || demoRun.seed !== seed) {
                demoRun.seed = seed
                const r = autopilot(newRun(seed), 999)
                demoScript = r.script.slice(0, Math.min(r.script.length, 16))
                demoAt = 0
            }
            return demoScript
        }

        const doFrameSim = () => {
            if (screenRef.current !== 'play') {
                if (screenRef.current === 'attract') {
                    if (demoWait > 0) { demoWait--; return }
                    const sc = demoRun(demoSeed)
                    const s = sc[demoAt % sc.length]
                    demoAt++
                    if (gs.end) { demoSeed = (demoSeed + 1) % 4; gs = newRun(demoSeed) }
                    step(gs, { action: s.action })
                    gs.events.length = 0
                    demoWait = s.wait
                }
                return
            }
            simTick++
            if (stamp && stamp.ticks > 0) stamp.ticks--
            if (banner && banner.ticks > 0) banner.ticks--
            if (watchingRef.current && watchScript) {
                // #1637 the inspector's own waits ride the live booth
                if (watchWait > 0) watchWait--
                else if (watchI < watchScript.length) {
                    const s = watchScript[watchI++]
                    act(s.action)
                    watchWait = s.wait || 84
                }
            }
        }

        // ---------------------------------------------------------------- paint ----
        const box = (x, y, w, h, fill, stroke) => {
            ctx.fillStyle = fill; ctx.fillRect(x, y, w, h)
            ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
        }
        const text = (s, x, y, size = 11, color = COL.ink, align = 'left') => {
            ctx.fillStyle = color
            ctx.font = `${size}px monospace`
            ctx.textAlign = align
            ctx.fillText(s, x, y)
        }

        const drawFace = (c, f, x, y, s = 1) => {
            const P = (v) => v * s
            c.fillStyle = SHIRTS[f.shirtC]; c.fillRect(x, y + P(92), P(110), P(30))
            c.strokeStyle = '#141824'; c.lineWidth = 1; c.strokeRect(x + 0.5, y + P(92) + 0.5, P(110) - 1, P(30) - 1)
            c.fillStyle = SKINS[f.skin]
            c.beginPath(); c.ellipse(x + P(55), y + P(52), P(f.narrow ? 27 : 34), P(40), 0, 0, Math.PI * 2); c.fill()
            c.fillStyle = HAIRS[f.hairC]
            c.fillRect(x + P(20), y + P(8), P(70), P(f.style === 0 ? 16 : f.style === 1 ? 10 : 22))
            if (f.style === 2) c.fillRect(x + P(18), y + P(8), P(8), P(44))
            if (f.style === 3) c.fillRect(x + P(84), y + P(8), P(8), P(44))
            c.fillStyle = '#20242e'
            c.fillRect(x + P(40), y + P(46), P(6), P(4)); c.fillRect(x + P(66), y + P(46), P(6), P(4))
            c.fillRect(x + P(48), y + P(66), P(16), P(3))
            if (f.must) { c.fillStyle = HAIRS[f.hairC]; c.fillRect(x + P(44), y + P(58), P(24), P(5)) }
            if (f.glasses) {
                c.fillStyle = '#10151f'
                c.fillRect(x + P(37), y + P(42), P(12), P(10)); c.fillRect(x + P(61), y + P(42), P(12), P(10))
                c.fillRect(x + P(49), y + P(46), P(12), P(2))
                c.fillStyle = '#5a6b8a'
                c.fillRect(x + P(39), y + P(44), P(8), P(6)); c.fillRect(x + P(63), y + P(44), P(8), P(6))
            }
        }

        const drawPassport = (pp, x, y) => {
            box(x, y, 300, 148, COL.paper, '#6f6a52')
            ctx.fillStyle = '#a33c3c'; ctx.fillRect(x, y, 300, 20)
            text('PASSPORT', x + 8, y + 15, 12, '#f2e8d8')
            text(`NAME ${pp.name}`, x + 10, y + 42)
            text(`NO. ${pp.id}`, x + 10, y + 58)
            text(`DOB ${dfmt(pp.dob)}`, x + 10, y + 74)
            text(`SEX ${pp.sex}  HEIGHT ${pp.height}CM`, x + 10, y + 90)
            text(`WEIGHT ${pp.weight}KG`, x + 10, y + 106)
            text(`ISSUED ${pp.city}`, x + 10, y + 122)
            box(x + 140, y + 34, 84, 60, '#c9c2a4', COL.paperLine)
            text('ISSUED BY', x + 182, y + 48, 8, '#6b5d3a', 'center')
            text(`${pp.country}`, x + 182, y + 70, 11, COL.ink, 'center')
            // #1938 the photo on the paper — same drawFace, smaller scale,
            // so an honest photo is the identical face in miniature
            box(x + PHOTO.x, y + PHOTO.y, PHOTO.w, PHOTO.h, '#c9c2a4', COL.paperLine)
            drawFace(ctx, pp.photo, x + PHOTO.x, y + PHOTO.y, PHOTO.s)
            text(`EXPIRES ${dfmt(pp.expiry)}`, x + 10, y + 140)
            text(`VALID ${isAdult(pp.dob, gs.week.days[gs.day - 1].date) ? 'ADULT' : 'CHILD'}`, x + 240, y + 140, 10, '#6b5d3a', 'center')
        }

        const drawId = (id, x, y) => {
            box(x, y, 190, 64, '#b8c4d8', '#5a6b8a')
            text('ID CARD', x + 8, y + 15, 11, '#20304e')
            text(`${id.name}`, x + 8, y + 32)
            text(`HT ${id.height}CM  WT ${id.weight}KG`, x + 8, y + 46, 10)
            text(`DOB ${dfmt(id.dob)}`, x + 8, y + 59, 10)
        }

        const paint = () => {
            ctx.fillStyle = COL.wall
            ctx.fillRect(0, 0, CW, CHS)
            ctx.strokeStyle = COL.wallLine
            for (let y = 14; y < CHS; y += 14) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(250, y); ctx.stroke() }
            const { day, view } = current(gs)
            // the wall: date, rulebook, entry list, wanted sheet, scale
            text(`DAY ${day.n}   ${dfmt(day.date)}`, 12, 24, 15, COL.gold)
            let yy = WALL.top
            text('RULEBOOK TODAY:', WALL.x, yy, WALL.size, COL.text); yy += WALL.labelLine
            for (const r of day.rules) {
                const t = RULES[r].text
                const words = t.split(' ')
                let line = ''
                for (const w of words) {
                    if ((line + w).length > WALL.ruleWrap) { text(line, WALL.x + 2, yy, WALL.ruleSize, '#9fb0d6'); yy += WALL.ruleLine; line = '' }
                    line += w + ' '
                }
                text(line, WALL.x + 2, yy, WALL.ruleSize, '#9fb0d6'); yy += WALL.ruleLine
                yy += WALL.ruleGap
            }
            const rows = wallRows(day, day.rules.map((r) => RULES[r].text))
            text('ENTRY LIST:', WALL.x, rows.listsY, WALL.size, COL.text)
            text('WANTED:', WALL.x + 114, rows.listsY, WALL.size, COL.text)
            let ey = rows.entries
            for (const c of day.allowed) { text(`  ${c}`, WALL.x, ey, WALL.listSize, '#7ddc5d'); ey += WALL.listLine }
            let wy = rows.entries
            // every name on the sheet must FIT on the wall — paperscheck
            // pins day.wanted.length <= 5 (the original bulletin's five) and
            // sweeps the fit, so no booth must ever hide one
            for (const w of day.wanted) { text(`  ${w.name} #${w.id}`, WALL.x + 114, wy, WALL.wantedSize, COL.red); wy += WALL.wantedLine }
            box(SCALE.x, SCALE.y, SCALE.w, SCALE.h, '#0f1420', '#4a5578')
            text('SCALE', SCALE.x + 48, SCALE.y + 12, 9, COL.text, 'center')
            text(`${view.scale}KG`, SCALE.x + 48, SCALE.y + 26, 12, COL.gold, 'center')
            // strikes: three slots, filled red
            for (let i = 0; i < CFG.STRIKE_MAX; i++) {
                box(12 + i * 26, CHS - 34, 20, 20, i < gs.strikes ? '#7a1f1f' : '#10141f', '#555f7d')
                if (i < gs.strikes) text('X', 22 + i * 26, CHS - 19, 13, '#ff8080', 'center')
            }
            text(`SCORE ${gs.score}`, 100, CHS - 19, 12, COL.gold)
            // the entrant (during a stamp, the papers shown are the ones
            // just judged — the stamp lands on its own document)
            const shown = stamp && stamp.ticks > 0 ? stamp.person : view.person
            drawFace(ctx, shown ? shown.face : view.person.face, PORTRAIT.x, PORTRAIT.y, 1)
            text(`ENTRANT ${gs.idx + (stamp && stamp.ticks > 0 ? 0 : 1)}/${gs.week.days[gs.day - 1].queue.length}`, PORTRAIT.x + PORTRAIT.headCx, 168, 10, COL.text, 'center')
            // the papers
            if (shown && shown.passport) {
                drawPassport(shown.passport, PAPERS.x, PAPERS.y)
                if (shown.idcard) drawId(shown.idcard, ID.x, ID.y)
            } else {
                box(PAPERS.x, 60, PAPERS.w, 120, '#12161f', '#39415c')
                text('"I HAVE NO PAPERS."', STAMP.x, 125, 14, '#6d7a9c', 'center')
            }
            // controls strip + last call feedback
            box(0, CHS - STRIP_H, CW, STRIP_H, '#10141f', '#000')
            text('A / SPACE: ADMIT        D: DENY', 12, CHS - 16, 13, COL.gold)
            if (gs.last) text(gs.last.ok ? 'CORRECT' : 'MISTAKE', CW - 12, CHS - 16, 13, gs.last.ok ? COL.green : COL.red, 'right')
            // the stamp: its COLOR is your call (green admit, red deny),
            // never your correctness — a wrong call gets the red/green of
            // what you did, plus the red double frame and the witness line
            // for what you missed. The player reads the stamp as ink; the
            // harness grades the same two rectangles.
            if (stamp && stamp.ticks > 0) {
                if (!stamp.ok) {
                    ctx.strokeStyle = COL.red
                    ctx.lineWidth = 4
                    ctx.strokeRect(PAPERS.x + 2, PAPERS.y + 2, PAPERS.w - 4, 226)
                    ctx.strokeRect(PAPERS.x - 4, PAPERS.y - 4, PAPERS.w + 8, 238)
                }
                ctx.save()
                ctx.translate(STAMP.x, STAMP.y)
                ctx.rotate(-0.18)
                const stampCol = stamp.verdict === 'approve' ? COL.green : COL.red
                ctx.strokeStyle = stampCol
                ctx.lineWidth = 3
                ctx.strokeRect(-86, -22, 172, 44)
                text(stamp.verdict === 'approve' ? 'APPROVED' : 'DENIED', 0, 6, 24, stampCol, 'center')
                ctx.restore()
                if (!stamp.ok) text(gs.last?.why === 'INNOCENT' ? 'THEY WERE CLEAN' : `WITNESS: ${gs.last?.why}`, STAMP.x, 296, 12, COL.red, 'center')
            }
            // day banner
            if (banner && banner.ticks > 0) {
                const a2 = Math.min(1, banner.ticks / 40)
                ctx.fillStyle = `rgba(8,10,16,${0.82 * a2})`
                ctx.fillRect(0, 150, CW, 96)
                text(banner.text, CW / 2, 196, 26, COL.gold, 'center')
                text(banner.sub, CW / 2, 224, 12, '#9fb0d6', 'center')
            }
        }

        const frame = (ts) => {
            raf = requestAnimationFrame(frame)
            if (!last) last = ts
            const ft = Math.min(ts - last, 250)
            last = ts
            if (!pausedRef.current) {
                acc += ft
                while (acc >= SIM_MS) { doFrameSim(); acc -= SIM_MS }
            }
            paint()
        }

        const onDown = (e) => {
            const code = e.shiftKey && e.code === 'Slash' ? 'Question' : e.code
            if (code === 'Question') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); return }
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault()
            const sc = screenRef.current
            if (sc === 'attract') {
                if (e.code === 'Digit1') return startPlay(0)
                if (e.code === 'Digit2') return startPlay(1)
                if (e.code === 'Digit3') return startPlay(2)
                if (e.code === 'Digit4') return startPlay(3)
                startPlay(0); return
            }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
            if (pausedRef.current || sc !== 'play') return
            // #1637 WATCH: Y seats the perfect inspector at any live booth it
            // can still survive; any real input takes over; Y re-seats from HERE.
            if (isWatchKey(e)) {
                if (watchingRef.current) releaseWatch()
                else if (seatWatcher()) { watchingRef.current = true; setWatching(true); playWatchStart() }
                return
            }
            if (watchingRef.current && isTakeoverKey(e)) releaseWatch()
            if (e.code === 'KeyA' || e.code === 'Space') act('approve')
            else if (e.code === 'KeyD') act('deny')
        }
        const onPointer = (e) => {
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(0); return }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
            if (sc !== 'play' || pausedRef.current) return
            if (watchingRef.current) releaseWatch() // #1637 a tap on the counter takes the stamp
            const r = canvas.getBoundingClientRect()
            if (!r.width) return
            act((e.clientX - r.left) / r.width > 0.55 ? 'deny' : 'approve')
        }
        window.addEventListener('keydown', onDown)
        window.addEventListener('pointerdown', onPointer)

        const resize = () => {
            const r = wrap.getBoundingClientRect()
            if (!r.width || !r.height) return
            const s = Math.min(r.width / CW, r.height / CHS)
            canvas.style.width = `${CW * s}px`
            canvas.style.height = `${CHS * s}px`
        }
        window.addEventListener('resize', resize)
        resize()
        raf = requestAnimationFrame(frame)

        if (import.meta.env.DEV) {
            // #1938 PORTRAIT pixel probe: render the live face and the photo
            // descriptors through the SAME drawFace at one scale, and count
            // differing pixels per feature band. Papersplay gates it: honest
            // papers paint byte-identical faces (total 0); every break lights
            // its own band. Bands may overlap (they count DIFFERENCES, and a
            // break is exactly one feature), and only the named band is
            // load-bearing in the gates.
            const PIX = { w: 110, h: 122 }
            const portraitPix = () => {
                const p = current(gs).view.person
                if (!p.face || !p.passport || !p.passport.photo) return null
                const render = (f) => {
                    const c = document.createElement('canvas')
                    c.width = PIX.w; c.height = PIX.h
                    const cc = c.getContext('2d')
                    cc.imageSmoothingEnabled = false
                    drawFace(cc, f, 0, 0, 1)
                    return cc.getImageData(0, 0, PIX.w, PIX.h).data
                }
                const A = render(p.face), B = render(p.passport.photo)
                const band = (x0, y0, x1, y1) => {
                    let n = 0
                    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
                        const i = (yy * PIX.w + xx) * 4
                        if (A[i] !== B[i] || A[i + 1] !== B[i + 1] || A[i + 2] !== B[i + 2]) n++
                    }
                    return n
                }
                return {
                    total: band(0, 0, PIX.w, PIX.h),
                    style: band(16, 6, 94, 40) + band(16, 6, 28, 54) + band(82, 6, 94, 54),
                    narrow: band(20, 56, 32, 70) + band(78, 56, 92, 70),
                    glasses: band(35, 41, 75, 56),
                    must: band(42, 56, 70, 66),
                }
            }
            window.__ppTest = {
                watching: () => watchingRef.current, // #1637 WATCH probes
                watchSfx: watchSfxLog,
                probe: () => {
                    const { day, view } = current(gs)
                    return {
                        screen: screenRef.current, day: gs.day, idx: gs.idx, seed: gs.seed,
                        strikes: gs.strikes, score: gs.score, caught: gs.caught, admitted: gs.admitted,
                        end: gs.end, why: gs.endWhy, last: gs.last, stamp: stamp && { ...stamp },
                        rules: day.rules, date: dfmt(day.date), allowed: day.allowed, wanted: day.wanted,
                        banner: banner && { ...banner }, view, evLog: evLog.slice(-60),
                    }
                },
                start: startPlay,
                portraitPix, // #1938 photo-vs-face pixel probe
                verdict: () => decide(current(gs).view).verdict,
                hash: () => stateHash(gs),
                stamp: act,
                runDay: () => { const d = gs.day; while (!gs.end && gs.day === d) act(decide(current(gs).view).verdict); return gs.day },
                runToEnd: () => { while (!gs.end) act(decide(current(gs).view).verdict) },
            }
            mountDbg({
                title: 'PAPERS, PLEASE-MIN',
                getState: () => {
                    const { day, view } = current(gs)
                    return [
                        `day ${gs.day} entrant ${gs.idx + 1}/${day.queue.length}  strikes ${gs.strikes}/${CFG.STRIKE_MAX}  score ${gs.score} caught ${gs.caught} admitted ${gs.admitted}`,
                        `truth: verdict=${decide(view).verdict} break=${gs.week.days[gs.day - 1].queue[gs.idx].breakRule || '-'} trap=${gs.week.days[gs.day - 1].queue[gs.idx].trap || '-'} scale=${view.scale}`,
                        `end ${gs.end || '-'} ${gs.endWhy || ''}`,
                    ]
                },
                actions: [
                    {
                        label: 'PROGNOSIS', run: () => {
                            if (gs.end) return `already ${gs.end}`
                            const sim = newRun(gs.seed)
                            sim.day = gs.day; sim.idx = gs.idx; sim.strikes = gs.strikes; sim.score = gs.score
                            sim.week = gs.week; sim.end = null
                            let n = 0
                            while (!sim.end && n++ < 300) step(sim, { action: decide(current(sim).view).verdict })
                            return sim.end === 'win'
                                ? `WINNABLE: from this exact booth state a perfect inspector still clears day ${sim.day} -> ${sim.endWhy}`
                                : `NOT WINNABLE: perfect play from here ends ${sim.end || 'stalled'} — ${sim.strikes} strikes already spent`
                        },
                    },
                    { label: 'STRIKE +1', run: () => { gs.strikes += 1; return `strike ${gs.strikes}/${CFG.STRIKE_MAX} — three and day ${gs.day} is over` } },
                    { label: 'NEXT WEEK +1', run: () => { startPlay(gs.seed + 1); return `booth rebuilt from seed ${gs.seed + 1}` } },
                ],
            })
        }

        // #1473: production-safe feedback state (seed for replay), every build
        exposeFeedbackState(() => ({ tick: simTick, score: gs.score, done: !!gs.end, seed: gs.seed, day: gs.day }))

        return () => {
            unexposeFeedbackState()
            if (import.meta.env.DEV) { if (window.__ppTest) delete window.__ppTest; unmountDbg() }
            window.removeEventListener('keydown', onDown)
            window.removeEventListener('pointerdown', onPointer)
            window.removeEventListener('resize', resize)
            cancelAnimationFrame(raf)
            canvas.remove()
        }
    }, [setMode])

    const handleResume = useCallback(() => { setPaused(false); pausedRef.current = false }, [])

    const play = screen === 'play'
    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden select-none" style={{ touchAction: 'none' }}>
            <div ref={stageRef} className="absolute inset-0 flex items-center justify-center" />

            {/* #1637 WATCH — the perfect inspector works the booth; any input
                takes the stamp back. */}
            {play && watching && <WatchToast className="absolute z-50" />}
            {play && !paused && (
                <div className="absolute z-50 pointer-events-auto" style={{ top: 'calc(3.5rem + var(--sat, 0px))', right: 'calc(0.75rem + var(--sar, 0px))' }}>
                    <WatchButton on={watching} />
                </div>
            )}

            {screen === 'attract' && (
                <>
                    <div className="absolute inset-0 bg-black/55 pointer-events-none" />
                    {/* #1656 — the forgotten-how-to-play tap: start AND watch, one button. */}
                    <div className="absolute z-[70] left-1/2 -translate-x-1/2 pointer-events-auto" style={{ bottom: '24%' }}>
                        <AttractWatchButton />
                    </div>
                    <div className="absolute inset-x-0 top-16 text-center pointer-events-none">
                        <h1 className="text-4xl font-black" style={{ color: '#e8c15a', textShadow: '2px 0 0 #a33c3c, -2px 0 0 #49b25a, 0 10px 24px #000' }}>PAPERS, PLEASE-MIN</h1>
                        <p className="text-white font-mono font-bold mt-2 animate-pulse">{PRESS}</p>
                        <AttractMessage className="text-amber-100/80 mt-2 px-8" messages={MESSAGES} />
                        <span className="block mt-2 text-emerald-300/90 font-mono font-bold tracking-widest text-xs">{WATCH_ATTRACT_HINT}</span>
                    </div>
                </>
            )}

            {screen === 'over' && end && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-amber-50 font-mono px-6">
                    <h2 className={`text-4xl font-black mb-1 ${end.win ? 'text-yellow-300' : 'text-red-400'}`}>{end.win ? 'GLORY TO ARSTOTZKA' : 'DEMOTED'}</h2>
                    <p className="text-lg mb-1">{end.why}</p>
                    <p className="text-sm text-amber-200/80 mb-4">{end.score} correct &middot; {end.caught} turned back &middot; every denial had a witness on the wall</p>
                    <p className="animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find((g) => g.label === 'PAPERS, PLEASE-MIN')} onResume={handleResume} />}
            <VirtualControls visible={play && !paused} />
        </div>
    )
}

export default PapersPleaseMinGame
