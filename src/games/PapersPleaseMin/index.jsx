// PAPERS, PLEASE-MIN — the booth. The rules are the pure engine in
// ./rules.js, the week is the seeded generator in ./gen.js (every deny it
// produces has a witness printed on this canvas), and ./sim.js is a pure
// (state, input) day loop. The attract demo is the autopilot's own proven
// week, stamped tick for tick — the same script scripts/paperscheck.mjs
// grades and scripts/papersplay.mjs drives with real keys.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { CFG, newRun, step, stateHash, current, autopilot } from './sim.js'
import { decide, RULES, dfmt, isAdult } from './rules.js'
import { CW, CHS, STRIP_H, WALL, SCALE, PORTRAIT, PAPERS, ID, STAMP, wallRows } from './layout.js'

const SIM_MS = 1000 / 60

const COL = {
    wall: '#1c2130', wallLine: '#323a52', paper: '#d8d2b8', paperLine: '#8f8a70',
    ink: '#20242e', red: '#d84343', green: '#49b25a', gold: '#e8c15a', text: '#cfd6e6',
}

// deterministic pseudo-random for painting: the pic seed is the person
const prand = (seed) => { let a = seed >>> 0; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296 } }

const PapersPleaseMinGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [end, setEnd] = useState(null)
    const screenRef = useRef('attract')
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
        let stamp = null            // {ok, why, ticks}
        let banner = null           // {text, sub, ticks}
        let demoScript = null, demoAt = 0, demoWait = 0, demoSeed = 0
        const evLog = []

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
            setEnd({ win: res === 'win', why: gs.endWhy, score: gs.score, caught: gs.caught, day: gs.day })
            if (res === 'win') audioController.playSweep(400, 1500, 0.9, 'square', 0.08)
            else audioController.playSweep(300, 50, 1.2, 'sawtooth', 0.1)
            overAtRef.current = performance.now()
            setMode('over')
        }

        const startPlay = (seed = 0) => {
            gs = newRun(seed)
            demoSeed = seed
            evLog.length = 0
            stamp = null; banner = null
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
            if (stamp && stamp.ticks > 0) stamp.ticks--
            if (banner && banner.ticks > 0) banner.ticks--
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

        const drawPortrait = (pic, x, y) => {
            const rnd = prand(pic)
            const skins = ['#e8c39e', '#d2a679', '#b07f55', '#8a5a3a', '#f0d3b4']
            const hairs = ['#2c2622', '#5a3b1e', '#8d1f1f', '#b3b6bd', '#1e1e28']
            box(x, y + 92, 110, 30, ['#39466e', '#6e4b7a', '#4b7a5e', '#7a634b'][Math.floor(rnd() * 4)], '#141824')
            ctx.fillStyle = skins[Math.floor(rnd() * skins.length)]
            ctx.beginPath(); ctx.ellipse(x + 55, y + 52, 34, 40, 0, 0, Math.PI * 2); ctx.fill()
            ctx.fillStyle = hairs[Math.floor(rnd() * hairs.length)]
            const style = Math.floor(rnd() * 4)
            ctx.fillRect(x + 20, y + 8, 70, style === 0 ? 16 : style === 1 ? 10 : 22)
            if (style === 2) ctx.fillRect(x + 18, y + 8, 8, 44)
            if (style === 3) ctx.fillRect(x + 84, y + 8, 8, 44)
            ctx.fillStyle = '#20242e'
            ctx.fillRect(x + 40, y + 46, 6, 4); ctx.fillRect(x + 66, y + 46, 6, 4)
            ctx.fillRect(x + 48, y + 66, 16, 3)
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
            box(x + 190, y + 34, 100, 60, '#c9c2a4', COL.paperLine)
            text('ISSUED BY', x + 240, y + 48, 8, '#6b5d3a', 'center')
            text(`${pp.country}`, x + 240, y + 70, 11, COL.ink, 'center')
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
            // pins day.wanted.length <= 4 so no booth must ever hide one
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
            drawPortrait(shown ? shown.pic : view.person.pic, PORTRAIT.x, PORTRAIT.y)
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
            if (e.code === 'KeyA' || e.code === 'Space') act('approve')
            else if (e.code === 'KeyD') act('deny')
        }
        const onPointer = (e) => {
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(0); return }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
            if (sc !== 'play' || pausedRef.current) return
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
            window.__ppTest = {
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

        return () => {
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

            {screen === 'attract' && (
                <div className="absolute inset-x-0 top-3 text-center pointer-events-none">
                    <h1 className="text-4xl font-black" style={{ color: '#e8c15a', textShadow: '2px 0 0 #a33c3c, -2px 0 0 #49b25a, 0 10px 24px #000' }}>PAPERS, PLEASE-MIN</h1>
                    <p className="text-amber-200/90 font-mono mt-1 text-sm">glory to arstotzka. the wall is getting higher.</p>
                    <p className="text-white font-mono font-bold mt-2 animate-pulse">TAP / PRESS ANY KEY — 1 · 2 · 3 · 4 PICK A WEEK</p>
                    <p className="text-amber-100/80 font-mono text-[11px] mt-2 px-8 leading-4">
                        read the wall: date, rulebook, entry list, wanted sheet, scale &mdash; the booth never hides its evidence<br />
                        A / ADMIT lets them in &middot; D / DENY turns them back &middot; the scale reads the truth under their feet<br />
                        three mistakes end a day; the rulebook grows every morning; seven days survive the week<br />
                        the demo is the perfect inspector&apos;s own proven week, stamped tick for tick
                    </p>
                </div>
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
