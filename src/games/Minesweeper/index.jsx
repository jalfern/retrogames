// MINESWEEPER — the arcade shell over ./minefield.js (the pure board, the
// rules, and the fairness referee). The issue's muscle is FAIRNESS AS AN
// AUDITABLE PROPERTY: every board is generated under a zero-guess gate and
// re-proved with the player's strongest shortcut (chording) taken away.
// This file only paints and listens; every verdict comes from the same
// module Node audits, and the attract demo plays with the gate's own
// autopilot (nextDigs) — the demo can never cheat with a rule the gate
// did not certify.
//
// Cursor-play so one code path serves keyboard, mouse and phone: arrows/WASD
// move the cursor, Space/A digs (auto-chord on a satisfied number), B/
// Shift/⚑ flags. A left click/tap digs the cell under it; a right click (or
// a long-press on touch) flags it, like the original (#1353).

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import AttractMessage from '../../components/AttractMessage'
import { MESSAGES, PRESS } from './attract.js'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { DIFFS, FIXED_DT, newGame, dig, flag, chord, step, solve, nextDigs, cloneGame, stateHash, idx } from './minefield.js'

const SIM_MS = 1000 * FIXED_DT
const PAD_TOP = 72 // px of fixed chrome band above the board (ARCADE / FEEDBACK)
const HUD_H = 32 // px reserved for the mine-count/timer bar riding above the board
const CUR = {
    l: ['ArrowLeft', 'KeyA'], r: ['ArrowRight', 'KeyD'],
    u: ['ArrowUp', 'KeyW'], d: ['ArrowDown', 'KeyS'],
}
const MOVE_KEYS = new Set([...CUR.l, ...CUR.r, ...CUR.u, ...CUR.d])
const DIG_KEYS = new Set(['Space', 'Enter', 'NumpadEnter', 'KeyE'])
const FLAG_KEYS = new Set(['KeyB', 'ShiftLeft', 'ShiftRight'])
const KEY_SET = new Set([...MOVE_KEYS, ...DIG_KEYS, ...FLAG_KEYS])

const NUM_COLORS = ['', '#4aa3ff', '#3fbf5f', '#ff5d6c', '#c07fff', '#ffb04a', '#3fd7d7', '#e8e8e8', '#ff8fb0']

const nextSeed = (s) => (Math.imul(s, 1664525) + 1013904223) >>> 0

const MinesweeperGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [endInfo, setEndInfo] = useState(null)
    const [diffIdx, setDiffIdx] = useState(0)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const diffRef = useRef(0)
    const overAtRef = useRef(0)
    const hudRef = useRef({})
    const setHud = (k) => (el) => { hudRef.current[k] = el }

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const setSc = (s) => { screenRef.current = s; setScreen(s) }
        const setDiff = (i) => { diffRef.current = i; setDiffIdx(i) }

        let canvas = null, ctx = null
        let raf = 0, last = 0, acc = 0
        let gs = null
        let plantMs = 0
        let seed = 20261012
        let toast = 0, toastMsg = ''
        let plantPending = null
        let overDelay = 0
        let lastPadEl = null, lastPadH = 0
        const say = (m) => { toastMsg = m; toast = 100 }

        const buildCanvas = (d) => {
            if (canvas) canvas.remove()
            canvas = document.createElement('canvas')
            canvas.dataset.sweepStage = '1'
            // the board rescales to fit any aspect — letterboxing never
            // happens here, so the rotate prompt has nothing to say (#1353)
            canvas.dataset.adaptive = '1'
            canvas.width = d.w * d.cell
            canvas.height = d.h * d.cell
            canvas.className = 'block'
            canvas.style.imageRendering = 'pixelated'
            canvas.style.touchAction = 'none'
            wrap.appendChild(canvas)
            ctx = canvas.getContext('2d')
            ctx.imageSmoothingEnabled = false
            // right-click must not open the browser menu over the board
            canvas.addEventListener('contextmenu', (e) => e.preventDefault())
            resize()
        }

        const newBoard = (di, sd) => {
            const d = DIFFS[((di % DIFFS.length) + DIFFS.length) % DIFFS.length]
            seed = sd >>> 0
            gs = newGame(di, seed)
            buildCanvas(d)
            plantMs = 0
        }

        // ------------------------------------------------------- audio ----
        const handleEvents = (s) => {
            while (s.events.length) {
                const e = s.events.shift()
                if (e.t === 'plant') audioController.playSweep(180, 520, 0.22, 'square', 0.06)
                else if (e.t === 'flood') audioController.playSweep(300 + e.dug * 6, 640, 0.12, 'triangle', 0.045)
                else if (e.t === 'flag') audioController.playTone(560, 0.05, 'square', 0.05)
                else if (e.t === 'unflag') audioController.playTone(300, 0.05, 'square', 0.04)
                else if (e.t === 'chord') audioController.playSweep(420, 780, 0.1, 'square', 0.05)
                else if (e.t === 'dry') audioController.playTone(140, 0.04, 'square', 0.025)
                else if (e.t === 'nope') audioController.playTone(110, 0.06, 'sawtooth', 0.03)
                else if (e.t === 'boom') audioController.playNoise(0.5, 0.16)
                else if (e.t === 'win') audioController.playSweep(320, 980, 0.6, 'square', 0.08)
            }
        }

        const finish = (s) => {
            if (s.end !== 'win' && s.end !== 'dead') return
            overAtRef.current = performance.now()
            let wrong = 0
            for (let i = 0; i < s.w * s.h; i++) if (s.flag[i] && !s.mines[i]) wrong++
            setEndInfo({
                end: s.end, why: s.why, sec: s.sec, score: s.score,
                mines: s.totalMines, diff: s.diff, wrong,
            })
            if (s.end === 'win') { setSc('over'); say('FIELD SWEPT') }
            else overDelay = 40
        }        // The one dig path: keyboard, tap and the DEV hook all land here so
        // the harness and the player never drive different code.
        const actDig = (x, y) => {
            if (!gs || gs.end || screenRef.current !== 'play' || plantPending) return
            if (gs.planted) {
                const i = idx(gs, x, y)
                const openedNum = gs.open[i] && gs.clue[i] > 0
                if (openedNum) {
                    let around = 0
                    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                        if (!dx && !dy) continue
                        const nx = x + dx, ny = y + dy
                        if (nx >= 0 && ny >= 0 && nx < gs.w && ny < gs.h && gs.flag[idx(gs, nx, ny)]) around++
                    }
                    if (around === gs.clue[i] && chord(gs, x, y)) { handleEvents(gs); finish(gs); return }
                }
                dig(gs, x, y)
                handleEvents(gs)
                finish(gs)
                return
            }
            say('SCANNING MINEFIELD...')
            paint()
            plantPending = { x, y }
            setTimeout(() => {
                const p = plantPending
                plantPending = null
                if (!p || screenRef.current !== 'play' || gs.planted) return
                const t0 = performance.now()
                dig(gs, p.x, p.y)
                plantMs = Math.round(performance.now() - t0)
                handleEvents(gs)
                finish(gs)
                // #1353: the plant timing was dev text a first-time player
                // could not parse; the honest line teaches the mouse verbs.
                say('CLICK TO DIG · RIGHT-CLICK TO FLAG')
            }, 30)
        }

        const actFlag = (x, y) => {
            if (!gs || gs.end || screenRef.current !== 'play' || !gs.planted) return
            flag(gs, x, y)
            handleEvents(gs)
        }

        const moveCursor = (dx, dy) => {
            if (!gs) return
            gs.cursor.x = Math.max(0, Math.min(gs.w - 1, gs.cursor.x + dx))
            gs.cursor.y = Math.max(0, Math.min(gs.h - 1, gs.cursor.y + dy))
        }

        // ------------------------------------------------------- paint ----
        const cellPaint = (s, x, y) => {
            const i = idx(s, x, y)
            const c = s.cell
            const px = x * c, py = y * c
            const revealed = !!s.open[i]
            const dead = s.end === 'dead'
            if (revealed) {
                ctx.fillStyle = '#101527'
                ctx.fillRect(px, py, c, c)
                ctx.strokeStyle = '#1c2440'
                ctx.strokeRect(px + .5, py + .5, c - 1, c - 1)
                if (s.mines[i]) {
                    ctx.fillStyle = '#ff5d6c'
                    ctx.beginPath(); ctx.arc(px + c / 2, py + c / 2, c * 0.32, 0, 7); ctx.fill()
                    ctx.fillStyle = '#000'
                    ctx.fillRect(px + c * .5 - 1, py + c * .18, 2, c * .64)
                    ctx.fillRect(px + c * .18, py + c * .5 - 1, c * .64, 2)
                } else if (s.clue[i] > 0) {
                    ctx.fillStyle = NUM_COLORS[s.clue[i]] || '#fff'
                    ctx.font = `bold ${Math.round(c * 0.68)}px monospace`
                    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
                    ctx.fillText(String(s.clue[i]), px + c / 2, py + c / 2 + 1)
                }
            } else {
                const lift = s.planted ? 0 : 1
                ctx.fillStyle = lift ? '#3a4668' : '#333f5f'
                ctx.fillRect(px, py, c, c)
                ctx.fillStyle = lift ? '#556494' : '#4d5c88'
                ctx.fillRect(px, py, c, 2); ctx.fillRect(px, py, 2, c)
                ctx.fillStyle = '#232c47'
                ctx.fillRect(px, py + c - 2, c, 2); ctx.fillRect(px + c - 2, py, 2, c)
                if (s.flag[i]) {
                    const wrongFlag = dead && !s.mines[i]
                    ctx.fillStyle = wrongFlag ? '#888' : '#ff5d6c'
                    ctx.beginPath()
                    ctx.moveTo(px + c * .32, py + c * .22)
                    ctx.lineTo(px + c * .72, py + c * .38)
                    ctx.lineTo(px + c * .32, py + c * .54)
                    ctx.closePath(); ctx.fill()
                    ctx.fillStyle = '#ddd'
                    ctx.fillRect(px + c * .3, py + c * .22, 2, c * .55)
                    if (wrongFlag) {
                        ctx.strokeStyle = '#ff2244'; ctx.lineWidth = 2
                        ctx.beginPath(); ctx.moveTo(px + 3, py + 3); ctx.lineTo(px + c - 3, py + c - 3)
                        ctx.moveTo(px + c - 3, py + 3); ctx.lineTo(px + 3, py + c - 3); ctx.stroke()
                        ctx.lineWidth = 1
                    }
                } else if (dead && s.mines[i]) {
                    ctx.fillStyle = '#ff5d6c'
                    ctx.beginPath(); ctx.arc(px + c / 2, py + c / 2, c * 0.3, 0, 7); ctx.fill()
                }
            }
        }

        const paint = () => {
            if (!canvas || !gs) return
            const d = gs
            const c = gs.cell
            ctx.fillStyle = '#0b0e1d'
            ctx.fillRect(0, 0, canvas.width, canvas.height)
            for (let y = 0; y < gs.h; y++) for (let x = 0; x < gs.w; x++) cellPaint(gs, x, y)
            if (screenRef.current === 'play' && !gs.end) {
                const t = Math.floor(gs.tick / 8) % 2
                ctx.strokeStyle = t ? '#ffd23e' : '#fff'
                ctx.lineWidth = 2
                ctx.strokeRect(gs.cursor.x * c + 1, gs.cursor.y * c + 1, c - 2, c - 2)
                ctx.lineWidth = 1
            }
            void d
        }

        const paintDemo = () => {
            if (!canvas) return
            const c = DIFFS[diffRef.current].cell
            ctx.fillStyle = '#0b0e1d'
            ctx.fillRect(0, 0, canvas.width, canvas.height)
            const t = Date.now() / 1000
            for (let y = 0; y < Math.ceil(canvas.height / c); y++) {
                for (let x = 0; x < Math.ceil(canvas.width / c); x++) {
                    const k = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1
                    const r = Math.abs(k)
                    if (r > 0.9) {
                        ctx.fillStyle = '#ff5d6c'
                        ctx.beginPath(); ctx.arc(x * c + c / 2, y * c + c / 2, c * .3, 0, 7); ctx.fill()
                    } else {
                        ctx.fillStyle = r > 0.55 ? '#333f5f' : '#2b3554'
                        ctx.fillRect(x * c + 1, y * c + 1, c - 2, c - 2)
                        ctx.fillStyle = '#4d5c88'
                        ctx.fillRect(x * c + 1, y * c + 1, c - 2, 2)
                    }
                }
            }
            ctx.fillStyle = `rgba(255,210,62,${0.35 + 0.25 * Math.sin(t * 3)})`
            for (let x = 0; x < canvas.width; x += 6) ctx.fillRect(x, 0, 2, canvas.height)
        }

        // --------------------------------------------------- attract ----
        let demoG = null, demoTimer = 0, demoPlan = []
        const buildDemo = () => {
            // COLT/SAPPER only: GENERAL can cost ~2s to plant, and the
            // attract loop must never freeze the marquee mid-shuffle.
            const di = Math.floor(Date.now() / 25000) % 2
            demoG = newGame(di, (Date.now() >>> 4) ^ 0xbeef)
            buildCanvas(DIFFS[di])
            const s = demoG
            const fx = s.w >> 1, fy = s.h >> 1
            try { dig(s, fx, fy) } catch { /* density always fine here */ }
            s.events.length = 0
            demoPlan = nextDigs(s)
            demoTimer = 0
        }

        const tickDemo = () => {
            demoTimer++
            if (!demoG || demoG.end || (demoPlan.length && demoTimer % 7)) {
                if (demoG && demoG.end && demoTimer > 90) buildDemo()
                return
            }
            if (!demoPlan.length) { demoTimer = demoTimer > 60 ? 91 : demoTimer; if (demoTimer > 60) buildDemo(); return }
            const p = demoPlan.shift()
            if (!p) return
            step(demoG)
            dig(demoG, p.x, p.y)
            demoG.events.length = 0
            if (!demoPlan.length) demoPlan = nextDigs(demoG)
        }

        // ------------------------------------------------------ frame ----
        const syncHud = () => {
            const h = hudRef.current
            const s = gs
            if (!s) return
            const left = s.totalMines - s.flags
            if (h.mines) h.mines.textContent = String(Math.max(0, left)).padStart(3, '0')
            if (h.time) h.time.textContent = String(s.sec).padStart(3, '0')
            if (h.toast) { h.toast.textContent = toastMsg; h.toast.style.opacity = toast > 0 ? '1' : '0' }
            if (toast > 0 && !pausedRef.current) toast--
            // the pad mounts/unmounts on keyboard-vs-touch use without firing a
            // resize — watch its presence so the board refits the moment the
            // band appears or clears (#1353)
            const pe = document.querySelector('[data-vc="1"]')
            const ph = pe ? Math.round(pe.getBoundingClientRect().height) : 0
            if (pe !== lastPadEl || ph !== lastPadH) { lastPadEl = pe; lastPadH = ph; resize() }
        }

        const frame = (ts) => {
            raf = requestAnimationFrame(frame)
            if (!last) last = ts
            const ft = Math.min(ts - last, 250)
            last = ts
            const sc = screenRef.current
            if (pausedRef.current) return
            acc += ft
            while (acc >= SIM_MS) {
                acc -= SIM_MS
                if (sc === 'attract') tickDemo()
                else if (sc === 'play' && gs && gs.planted && !gs.end) step(gs)
                if (overDelay > 0 && --overDelay === 0 && gs && gs.end === 'dead' && screenRef.current === 'play') setSc('over')
            }
            if (sc === 'attract') paintDemo()
            else paint()
            syncHud()
        }

        const startPlay = (di, sd) => {
            setDiff(di)
            if (sd !== undefined) seed = sd >>> 0
            newBoard(di, seed)
            setEndInfo(null)
            overDelay = 0
            setSc('play')
            audioController.playSweep(220, 660, 0.25, 'square', 0.07)
        }

        // ------------------------------------------------- input ----
        const onDown = (e) => {
            const code = e.shiftKey && e.code === 'Slash' ? 'Question' : e.code
            if (code === 'Question') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); return }
            if (KEY_SET.has(e.code)) e.preventDefault()
            const sc = screenRef.current
            if (sc === 'attract') {
                if (e.code === 'Digit2') return startPlay(1)
                if (e.code === 'Digit3') return startPlay(2)
                startPlay(diffRef.current); return
            }
            if (sc === 'over') {
                if (performance.now() - overAtRef.current < 800) return
                if (e.code === 'Enter' || e.code === 'KeyR') { seed = nextSeed(seed); return startPlay(diffRef.current) }
                setSc('attract'); return
            }
            if (pausedRef.current || sc !== 'play') return
            if (MOVE_KEYS.has(e.code)) {
                if (CUR.l.includes(e.code)) moveCursor(-1, 0)
                if (CUR.r.includes(e.code)) moveCursor(1, 0)
                if (CUR.u.includes(e.code)) moveCursor(0, -1)
                if (CUR.d.includes(e.code)) moveCursor(0, 1)
            } else if (DIG_KEYS.has(e.code)) {
                actDig(gs.cursor.x, gs.cursor.y)
            } else if (FLAG_KEYS.has(e.code)) {
                actFlag(gs.cursor.x, gs.cursor.y)
            }
        }
        // #1353: mouse and touch verbs, as in the original — left digs,
        // right flags, and a touch long-press flags (phones have no right
        // button). A touch therefore digs on release, so the long-press
        // timer can cancel the dig before it lands.
        const LONGPRESS_MS = 450
        let lpTimer = null, lpFired = false, lpPt = null
        const clearLongPress = () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null } }
        const onPointer = (e) => {
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(0); return }
            if (sc === 'over') {
                if (performance.now() - overAtRef.current < 800) return
                setSc('attract'); return
            }
            if (sc !== 'play' || pausedRef.current || !canvas) return
            // taps that belong to the virtual pad (or any chrome) must not
            // also dig the cell under them — only the canvas digs
            if (e.target !== canvas) return
            const r = canvas.getBoundingClientRect()
            if (!r.width) return
            const x = Math.floor((e.clientX - r.left) / r.width * gs.w)
            const y = Math.floor((e.clientY - r.top) / r.height * gs.h)
            if (x < 0 || y < 0 || x >= gs.w || y >= gs.h) return
            gs.cursor.x = x; gs.cursor.y = y
            if (e.pointerType === 'mouse' && e.button !== 0) {
                if (e.button === 2) actFlag(x, y)
                return
            }
            if (e.pointerType === 'touch' && gs.planted && !gs.end) {
                clearLongPress()
                lpFired = false
                lpPt = { cx: e.clientX, cy: e.clientY, x, y }
                lpTimer = setTimeout(() => { lpTimer = null; lpFired = true; actFlag(x, y) }, LONGPRESS_MS)
                return
            }
            actDig(x, y)
        }
        const onPointerUp = (e) => {
            if (!lpTimer) return
            clearLongPress()
            if (lpFired || !lpPt || screenRef.current !== 'play' || pausedRef.current) return
            if (Math.hypot(e.clientX - lpPt.cx, e.clientY - lpPt.cy) > 14) return
            actDig(lpPt.x, lpPt.y)
        }
        const onPointerMove = (e) => {
            if (lpTimer && lpPt && Math.hypot(e.clientX - lpPt.cx, e.clientY - lpPt.cy) > 14) clearLongPress()
        }
        // the context-menu suppression lives on each canvas (buildCanvas)
        window.addEventListener('keydown', onDown)
        window.addEventListener('pointerdown', onPointer)
        window.addEventListener('pointerup', onPointerUp)
        window.addEventListener('pointermove', onPointerMove)
        window.addEventListener('pointercancel', clearLongPress)

        const resize = () => {
            if (!canvas) return
            const r = wrap.getBoundingClientRect()
            if (!r.width || !r.height) return
            // #1353: keep the board clear of everything that overlays it — the
            // corner chrome up top (ARCADE / PAUSE / FEEDBACK) and the touch
            // pad's bottom band whenever the pad is actually mounted.
            const padEl = document.querySelector('[data-vc="1"]')
            const padBand = padEl ? Math.round(padEl.getBoundingClientRect().height) + 8 : 72
            if (wrap.style.paddingBottom !== `${padBand}px`) wrap.style.paddingBottom = `${padBand}px`
            const s = Math.min((r.width - 8) / canvas.width, (r.height - PAD_TOP - HUD_H - padBand) / canvas.height)
            canvas.style.width = `${Math.max(1, Math.floor(canvas.width * s))}px`
            canvas.style.height = `${Math.max(1, Math.floor(canvas.height * s))}px`
            const bar = hudRef.current.bar
            if (bar) bar.style.width = canvas.style.width
        }
        window.addEventListener('resize', resize)

        buildDemo()
        raf = requestAnimationFrame(frame)

        // -------------------------------------------------- DEV hook ----
        if (import.meta.env.DEV) {
            window.__sweepTest = {
                probe: () => gs ? ({
                    screen: screenRef.current, diff: gs.diff, diffIdx: gs.diffIdx, planted: gs.planted,
                    seed, opened: gs.opened, flags: gs.flags, totalMines: gs.totalMines,
                    end: gs.end, why: gs.why, cursor: { ...gs.cursor }, plantMs,
                    sec: gs.sec, w: gs.w, h: gs.h,
                    toast: hudRef.current.toast ? hudRef.current.toast.textContent : '',
                }) : { screen: screenRef.current, seed },
                start: (di = 0, sd) => startPlay(di, sd === undefined ? seed : (seed = sd >>> 0, sd)),
                move: (dx, dy) => moveCursor(dx, dy),
                dig: (x, y) => actDig(x === undefined ? gs.cursor.x : x, y === undefined ? gs.cursor.y : y),
                flagAt: (x, y) => actFlag(x, y),
                nextSafe: () => { const p = nextDigs(gs)[0]; return p ? { x: p.x, y: p.y } : null },
                prognose: () => {
                    if (!gs || !gs.planted || gs.end) return 'no live board'
                    const c = cloneGame(gs)
                    const r = solve(c, { subset: true, chord: false })
                    const openC = r.plan.filter((p) => !gs.open[idx(gs, p.x, p.y)]).length
                    return r.win && r.guesses === 0
                        ? `WINNABLE WITH ZERO GUESSES from this exact state: ${openC} derivations queued, ${r.stuck.length} cells would be stuck`
                        : `NEEDS A GUESS from here: guesses=${r.guesses} stuck=${r.stuck.length} (the gate would have rejected this board — file it)`
                },
                replant: () => {
                    if (!gs || gs.end || screenRef.current !== 'play') return 'no live board'
                    gs.planted = false
                    dig(gs, gs.cursor.x, gs.cursor.y)
                    handleEvents(gs); finish(gs)
                    return `replanted at ${gs.cursor.x},${gs.cursor.y} in ${plantMs}ms`
                },
                hash: () => (gs ? stateHash(gs) : 0),
                openCells: () => Array.from(gs.open).reduce((a, v, i) => (v ? (a.push(i), a) : a), []),
                flagCells: () => Array.from(gs.flag).reduce((a, v, i) => (v ? (a.push(i), a) : a), []),
                mineCells: () => Array.from(gs.mines).reduce((a, v, i) => (v ? (a.push(i), a) : a), []),
            }
            mountDbg({
                title: 'MINESWEEPER',
                getState: () => gs ? [
                    `${gs.diff} seed ${gs.seed} planted=${gs.planted} opened=${gs.opened}/${gs.w * gs.h - gs.totalMines} flags=${gs.flags} end=${gs.end || '-'}`,
                    `plantMs=${plantMs} sec=${gs.sec} cursor=${gs.cursor.x},${gs.cursor.y} screen=${screenRef.current}`,
                ] : ['no board'],
                actions: [
                    { label: 'PROGNOSIS', run: () => window.__sweepTest.prognose() },
                    { label: 'GOD DIG', run: () => {
                        if (!gs || !gs.planted || gs.end) return 'no live board'
                        const p = nextDigs(gs)[0]
                        if (!p) return 'solver says: no derivable cell left — this is a guess'
                        dig(gs, p.x, p.y); handleEvents(gs); finish(gs)
                        return `digged derived-safe ${p.x},${p.y}`
                    } },
                    { label: 'NEW BOARD', run: () => { seed = nextSeed(seed); startPlay(diffRef.current); return `reseeded ${seed}` } },
                ],
            })
        }

        return () => {
            if (import.meta.env.DEV) { if (window.__sweepTest) delete window.__sweepTest; unmountDbg() }
            window.removeEventListener('keydown', onDown)
            window.removeEventListener('pointerdown', onPointer)
            window.removeEventListener('pointerup', onPointerUp)
            window.removeEventListener('pointermove', onPointerMove)
            window.removeEventListener('pointercancel', clearLongPress)
            clearLongPress()
            window.removeEventListener('resize', resize)
            cancelAnimationFrame(raf)
            if (canvas) canvas.remove()
        }
    }, [])

    const handleResume = useCallback(() => { setPaused(false); pausedRef.current = false }, [])

    const play = screen === 'play'
    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden select-none" style={{ touchAction: 'none' }}>
            {/* #1353: the HUD lives in the stage column, directly above the
                board, so the mine counter and timer ride the board instead of
                hiding under the ARCADE/PAUSE corner chrome — and the stage
                reserves the top chrome band and the pad band (resize), so no
                overlay ever sits on top of a cell. */}
            <div ref={stageRef} className="absolute inset-0 flex flex-col items-center justify-center" style={{ paddingTop: `${PAD_TOP}px` }}>
                <div
                    data-sweep-hud="1"
                    className={`flex items-center justify-center gap-3 font-mono text-xs text-white transition-opacity duration-300 mb-1.5 ${play ? 'opacity-100' : 'opacity-0'}`}
                    style={{ height: HUD_H }}
                >
                    <span ref={setHud('mines')} className="text-red-400 font-bold" style={{ textShadow: '0 0 8px #f04' }}>010</span>
                    <span className="text-white/50">mines</span>
                    <span ref={setHud('diff')} className="border border-amber-300/60 text-amber-200 px-2 py-0.5 rounded bg-black/40">{DIFFS[diffIdx].name}</span>
                    <span ref={setHud('time')} className="text-cyan-300 font-bold" style={{ textShadow: '0 0 8px #08f' }}>000</span>
                </div>
            </div>

            <div className={`absolute inset-x-0 pointer-events-none transition-opacity duration-300 ${play ? 'opacity-100' : 'opacity-0'}`} style={{ top: 40 }}>
                <div ref={setHud('toast')} className="text-center text-amber-100 font-mono font-bold text-sm transition-opacity duration-500" style={{ opacity: 0, textShadow: '0 0 12px #f60' }} />
            </div>

            {screen === 'attract' && (
                <div className="absolute inset-0 bg-black/55 flex flex-col items-center justify-center text-center px-6 pointer-events-none">
                    <h1 className="text-4xl font-black mb-6" style={{ color: '#ffd23e', textShadow: '3px 0 0 #b06a3f, -3px 0 0 #4ad7ff, 0 10px 24px #000' }}>MINESWEEPER</h1>
                    <AttractMessage className="mb-6 text-amber-100/80" messages={MESSAGES} />
                    <p className="text-lg font-mono font-bold animate-pulse text-white">{PRESS}</p>
                </div>
            )}

            {screen === 'over' && endInfo && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-amber-50 font-mono px-6">
                    <h2 className={`text-4xl font-black mb-1 ${endInfo.end === 'win' ? 'text-yellow-300' : 'text-red-400'}`}>
                        {endInfo.end === 'win' ? 'FIELD SWEPT' : 'BOOM'}
                    </h2>
                    <p className="text-lg mb-1">{endInfo.why}</p>
                    <p className="text-sm text-amber-200/80 mb-4">
                        {endInfo.diff} &middot; {endInfo.sec}s &middot; score {endInfo.score}
                        {endInfo.end === 'win' ? ` · every one of the ${endInfo.mines} mines found without a single guess` : endInfo.wrong ? ` · ${endInfo.wrong} flag${endInfo.wrong === 1 ? '' : 's'} marked the wrong cells` : ''}
                    </p>
                    <p className="text-sm text-amber-100/80 mb-4">R runs it back on a new seed &middot; any other key returns to the marquee</p>
                    <p className="animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find((g) => g.label === 'MINESWEEPER')} onResume={handleResume} />}
            <VirtualControls
                visible={play && !paused}
            />
        </div>
    )
}

export default MinesweeperGame
