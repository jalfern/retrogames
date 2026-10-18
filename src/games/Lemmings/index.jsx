// LEMMINGS-LITE — the arcade shell: renderer, input, HUD. Decides NOTHING
// about the game: `sim.js` does, in a module plain Node imports — and the
// attract demo is literally a REPLAY of the solver's own winning script from
// `lemcheck` (deterministic replay, on screen, before you ever press a key).
//
// Input: arrows drive the assignment cursor, 1-4 (or the B button) pick the
// skill, Space/click/A apply it to the nearest lemming — the issue's
// one-click assignment, on a phone with just the virtual pad.
//
// Layout: 1. boot/solver cache 2. canvas art (all runtime, no assets)
// 3. fixed-timestep loop 4. input 5. DEV hook 6. React + HUD.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop } from '../../utils/gameContract'
import { currentPad, setPointer, pointerGesture } from '../../utils/onePad'
import { makeFitCanvas } from '../../utils/fitCanvas'
import { LEVELS, buildLevel } from './levels.js'
import { makeGame, step, solve, assign, nearestLemming, stateHash, SKILLS, SKILL_NAME, SKILL_KEY, W, H, DIRT, STEEL, FIXED_DT } from './sim.js'

const TS = 8                                   // internal pixels per tile
const CW = W * TS
const CH = H * TS
const FF_SPEED = 3                             // fast-forward: world seconds per real second

const planCache = new Map()
const planFor = (idx) => {
    if (!planCache.has(idx)) {
        const { meta, grid } = buildLevel(idx)
        planCache.set(idx, solve(makeGame(meta, grid)).cmds)
    }
    return planCache.get(idx)
}

const speck = (x, y) => ((x * 7349 + y * 8453) % 7) / 7

const LEM_COLORS = {
    body: '#3fae4a', head: '#ffd9a0', hair: '#8a3b12', pants: '#2a5f9e',
}

const LemGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [end, setEnd] = useState(null)
    const [portrait, setPortrait] = useState(false)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const overAtRef = useRef(0)

    const setMode = useCallback((m) => { screenRef.current = m; setScreen(m) }, [])
    const hudRef = useRef({})
    const setHud = (k) => (el) => { hudRef.current[k] = el }
    const board = () => { try { return JSON.parse(localStorage.getItem('lemmings.board') || '[]') } catch { return [] } }

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const canvas = document.createElement('canvas')
        canvas.dataset.lemStage = '1'
        canvas.dataset.fit = 'source'
        canvas.width = CW; canvas.height = CH
        canvas.className = 'block w-full h-full'
        canvas.style.imageRendering = 'pixelated'
        canvas.style.touchAction = 'none'
        canvas.style.opacity = '0'            // the fit display canvas paints on top
        wrap.appendChild(canvas)
        // #432: sizing from a ResizeObserver on the wrapper (the shared fitCanvas
        // shell), not window.resize — on iOS the wrapper box is stale right after
        // rotation or the URL bar moving, and the observer gets the fresh one.
        const fit = makeFitCanvas(canvas, wrap)
        if (fit.display) fit.display.style.touchAction = 'none'
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false

        // ---------- world / loop state ----------
        let levelIdx = 0
        let meta = null, grid = null, gs = null
        let plan = [], planI = 0
        let raf = 0, last = 0, acc = 0
        let runCmds = []                          // player-command log of the live run
        const cursor = { x: 8, y: 18 }
        let selected = 'climb'
        const keys = new Set()
        // #432: the shared press-preview-release gesture (onePad.pointerGesture):
        // the finger writes the one pad's pointer, this loop steps the gesture.
        const gest = { pd: false, aim: null }
        let pressId = null                        // the pointer id holding the press
        let ffHeld = false                        // the panel's FF button is down

        const loadLevel = (idx, freshScore) => {
            levelIdx = idx % LEVELS.length
            const built = buildLevel(levelIdx)
            meta = built.meta; grid = built.grid
            gs = makeGame(meta, grid)
            if (freshScore) gs.score = 0
            plan = planFor(levelIdx); planI = 0
            runCmds = []
            cursor.x = meta.spawn.x; cursor.y = meta.spawn.y - 1
            selected = (SKILLS.find(s => meta.skills[s] > 0)) || 'climb'
        }
        loadLevel(0, true)

        const nextPlan = () => plan.find((c, i) => i >= planI && c.tick >= gs.tick)

        const handleEvents = (evts) => {
            for (const e of evts) {
                if (e.type === 'exit') { audioController.playSweep(660, 1320, 0.22, 'square', 0.08); audioController.playTone(1760, 0.1, 'square', 0.05) }
                else if (e.type === 'assign') audioController.playTone(e.skill === 'bomb' ? 180 : 520 + SKILLS.indexOf(e.skill) * 90, 0.07, 'square', 0.07)
                else if (e.type === 'blast') { audioController.playNoise(0.5, 0.16); audioController.playSweep(220, 50, 0.5, 'sawtooth', 0.1) }
                else if (e.type === 'splat') audioController.playSweep(360, 60, 0.22, 'sawtooth', 0.09)
                else if (e.type === 'dig') audioController.playNoise(0.06, 0.03)
                else if (e.type === 'land') audioController.playTone(120, 0.05, 'triangle', 0.04)
                else if (e.type === 'step') audioController.playTone(220, 0.03, 'triangle', 0.025)
                else if (e.type === 'crest') audioController.playTone(880, 0.07, 'sine', 0.05)
                else if (e.type === 'turn') audioController.playTone(90, 0.02, 'triangle', 0.015)
                else if (e.type === 'spawn') audioController.playTone(330, 0.05, 'square', 0.04)
                else if (e.type === 'win') audioController.playSweep(392, 1568, 0.7, 'square', 0.1)
                else if (e.type === 'lose' || e.type === 'time') audioController.playDeath()
            }
        }

        const finish = () => {
            const won = gs.win
            const entry = { score: gs.score, out: gs.exited, level: meta.name, date: new Date().toISOString().slice(2, 10) }
            if (won || gs.exited > 0) localStorage.setItem('lemmings.board', JSON.stringify([...board(), entry].sort((a, b) => b.score - a.score).slice(0, 8)))
            setEnd({
                score: gs.score, out: gs.exited, need: meta.need, won,
                cause: won ? (levelIdx >= LEVELS.length - 1 ? 'EVERY LEDGE CROSSED' : 'LEVEL CLEARED') : 'THE COUNT WASN T MET',
                last: won && levelIdx >= LEVELS.length - 1,
            })
            overAtRef.current = performance.now()
            setMode('over')
        }

        const applySkill = (sx, sy) => {
            const L = nearestLemming(gs, sx, sy)
            if (!L) { audioController.playTone(140, 0.06, 'sawtooth', 0.05); return }
            if (assign(gs, L.id, selected)) {
                runCmds.push({ tick: gs.tick, id: L.id, skill: selected })
                audioController.playTone(520 + SKILLS.indexOf(selected) * 90, 0.07, 'square', 0.07)
            }
        }

        // #432: the shared pointer gesture, driven by THE one pad's pointer.
        // The reach is POINTER_HIT_PX screen px in the shared targeting, so the
        // pick is the same thumb-size at any zoom (stageScale = screen px per
        // world tile, from the fit display's live size).
        const stageScale = () => {
            const el = fit.display || canvas
            const w = el && el.clientWidth ? el.clientWidth : CW
            return w / W
        }
        const liveCands = () => gs.lemmings.filter(L => L.live).map(L => ({ x: L.x, y: L.y - 0.5, id: L.id }))
        const commitAssign = (a) => {
            if (!a) return                        // release on nothing: nothing
            if (assign(gs, a.id, selected)) {
                runCmds.push({ tick: gs.tick, id: a.id, skill: selected })
                audioController.playTone(520 + SKILLS.indexOf(selected) * 90, 0.07, 'square', 0.07)
            }
        }
        const stepGesture = (p) => pointerGesture(gest, p, liveCands(), p.x * W, p.y * H, stageScale(), commitAssign)

        const doSim = () => {
            if (screenRef.current === 'attract') {
                // attract = the solver's proven script, replayed on screen
                const c = plan.find(cc => cc.tick === gs.tick + 1)
                if (c) assign(gs, c.id, c.skill)
                handleEvents(step(gs).events)
                if (gs.end) loadLevel((levelIdx + 1) % LEVELS.length, true)
            } else if (screenRef.current === 'play') {
                const sp = 11 * FIXED_DT
                if (keys.has('ArrowLeft')) cursor.x = Math.max(0.5, cursor.x - sp)
                if (keys.has('ArrowRight')) cursor.x = Math.min(W - 0.5, cursor.x + sp)
                if (keys.has('ArrowUp')) cursor.y = Math.max(2, cursor.y - sp)
                if (keys.has('ArrowDown')) cursor.y = Math.min(H - 1, cursor.y + sp)
                handleEvents(step(gs, { x: cursor.x, y: cursor.y }).events)
                if (gs.end) finish()
            }
        }

        const frame = (ts) => {
            raf = requestAnimationFrame(frame)
            if (!last) last = ts
            const ft = Math.min(ts - last, 250)
            last = ts
            // #432: the one pad, one gesture — the finger (or a scripted
            // __game.step) writes the pointer's down / x / y, and the shared
            // press-preview-release gesture steps here: press previews, a slide
            // re-targets, the release assigns. CYCLE is gone (the panel picks).
            if (!pausedRef.current && screenRef.current === 'play' && !contractHoldsLoop()) {
                stepGesture(currentPad('pointer').pointer)
            }
            if (!pausedRef.current) {
                if (contractHoldsLoop()) { acc = 0 }
                else {
                    acc += ft * (ffHeld ? FF_SPEED : 1)
                    while (acc >= FIXED_DT * 1000) { doSim(); acc -= FIXED_DT * 1000 }
                }
            }
            paint()
            syncHud()
            fit.blit()
        }

        // ---------- painter ----------
        const paint = () => {
            // sky: full-canvas gradient, a sun, parallax ridges and fluffy
            // clouds — all drawn behind the rock. The Amiga original sells
            // depth with layered hills and a bright sky; a flat fill reads as
            // a test fixture.
            const sky = ctx.createLinearGradient(0, 0, 0, CH)
            sky.addColorStop(0, '#3f8fca')
            sky.addColorStop(0.5, '#7ec8e3')
            sky.addColorStop(1, '#cdeaf4')
            ctx.fillStyle = sky
            ctx.fillRect(0, 0, CW, CH)
            ctx.fillStyle = 'rgba(255,252,235,0.30)'
            ctx.beginPath(); ctx.arc(322, 44, 30, 0, Math.PI * 2); ctx.fill()
            ctx.fillStyle = 'rgba(255,252,235,0.9)'
            ctx.beginPath(); ctx.arc(322, 44, 15, 0, Math.PI * 2); ctx.fill()
            const ridge = (base, amp, col) => {
                ctx.fillStyle = col
                ctx.beginPath()
                ctx.moveTo(0, CH)
                for (let x = 0; x <= CW; x += 12) {
                    const y = base + Math.sin(x * 0.045 + base) * amp + Math.sin(x * 0.017) * amp * 0.6
                    ctx.lineTo(x, y)
                }
                ctx.lineTo(CW, CH); ctx.closePath(); ctx.fill()
            }
            ridge(150, 11, 'rgba(120,160,168,0.5)')
            ridge(168, 13, 'rgba(84,126,136,0.65)')
            const cloud = (cx, cy, s) => {
                ctx.fillStyle = 'rgba(255,255,255,0.92)'
                for (const [dx, dy, w, h] of [[-13, 2, 24, 8], [3, -3, 20, 9], [-1, 4, 28, 7]]) {
                    ctx.beginPath(); ctx.ellipse(cx + dx * s, cy + dy * s, w * s, h * s, 0, 0, Math.PI * 2); ctx.fill()
                }
            }
            cloud(86, 54, 1); cloud(214, 84, 1.25); cloud(300, 96, 0.9)

            for (let y = 0; y < H; y++) {
                for (let x = 0; x < W; x++) {
                    const t = gs.grid[y * W + x]
                    if (t === 0) continue
                    const px = x * TS, py = y * TS
                    if (t === DIRT) {
                        ctx.fillStyle = '#7a4a22'; ctx.fillRect(px, py, TS, TS)
                        ctx.fillStyle = speck(x, y) > 0.5 ? '#8d5a2c' : '#68391a'
                        ctx.fillRect(px + 1, py + 2, 2, 2); ctx.fillRect(px + 5, py + 5, 2, 1)
                        if (y > 0 && gs.grid[(y - 1) * W + x] === 0) {
                            ctx.fillStyle = '#59b25d'; ctx.fillRect(px, py, TS, 2)
                            ctx.fillStyle = '#6fce72'
                            ctx.fillRect(px + 1, py, 1, 3); ctx.fillRect(px + 5, py, 1, 4); ctx.fillRect(px + 7, py, 1, 3)
                        }
                    } else {
                        // steel = unbreakable rock: the dark cool bedrock the dirt
                        // sits on (and the plug the bomb cannot open). Variegated
                        // stone, not a metal road.
                        ctx.fillStyle = '#5d6b78'; ctx.fillRect(px, py, TS, TS)
                        if (y > 0 && gs.grid[(y - 1) * W + x] !== STEEL) { ctx.fillStyle = '#8b98a2'; ctx.fillRect(px, py, TS, 2) }
                        const r = speck(x, y)
                        if (r > 0.5) { ctx.fillStyle = '#6a7983'; ctx.fillRect(px + 1 + Math.floor(r * 4), py + 2 + Math.floor(r * 3), 2, 2) }
                        else if (r < 0.22) { ctx.fillStyle = '#454f59'; ctx.fillRect(px + 1 + Math.floor(r * 26), py + 3 + Math.floor(r * 6), 2, 1) }
                    }
                }
            }

            // spawn cave + exit door
            ctx.fillStyle = '#241608'
            ctx.fillRect(meta.spawn.x * TS - 3, (meta.spawn.y - 1) * TS, TS + 6, TS + 2)
            const ex = Math.round(meta.exit.x * TS), ey = Math.round(meta.exit.y * TS - TS)
            ctx.fillStyle = '#0e2412'
            ctx.fillRect(ex, ey, TS, TS * 2 - 1)
            ctx.fillStyle = '#59e05e'
            ctx.fillRect(ex, ey, TS, 2)                       // glowing lip
            ctx.fillRect(ex, ey + 2, 2, TS * 2 - 3)           // side glow
            ctx.fillRect(ex + TS - 2, ey + 2, 2, TS * 2 - 3)
            ctx.fillStyle = 'rgba(89,224,94,0.35)'
            ctx.fillRect(ex + 2, ey + 3, TS - 4, TS * 2 - 6)  // inner light

            // lemmings
            for (const L of gs.lemmings) {
                if (!L.live && L.state !== 'dead') continue
                const px = Math.round(L.x * TS - 3), py = Math.round(L.y * TS - (L.state === 'dead' ? 3 : 8))
                if (L.state === 'dead') {
                    ctx.fillStyle = '#8d97a3'; ctx.fillRect(px - 1, py + 5, 8, 3)
                    continue
                }
                if (L.state === 'bomb' && Math.floor(gs.tick / 6) % 2 === 0) {
                    ctx.fillStyle = '#e23b3b'; ctx.fillRect(px - 1, py - 1, 8, 9)
                }
                ctx.fillStyle = LEM_COLORS.head; ctx.fillRect(px + 1, py, 5, 3)
                ctx.fillStyle = LEM_COLORS.hair; ctx.fillRect(px + 1, py, 5, 1)
                ctx.fillStyle = '#1b2a3a'                     // two eyes, offset toward the facing
                const eo = L.dir > 0 ? 1 : 0
                ctx.fillRect(px + 2 + eo, py + 1, 1, 1); ctx.fillRect(px + 4 + eo, py + 1, 1, 1)
                ctx.fillStyle = LEM_COLORS.body; ctx.fillRect(px + 1, py + 3, 5, 3)
                ctx.fillStyle = LEM_COLORS.pants
                const leg = L.state === 'walk' ? (Math.floor(gs.tick / 8 + L.id) % 2) : 0
                ctx.fillRect(px + 1, py + 6, 2, 2 - leg); ctx.fillRect(px + 4, py + 6, 2, 1 + leg)
                if (L.state === 'block') { ctx.fillStyle = LEM_COLORS.body; ctx.fillRect(px - 3, py + 3, 3, 1); ctx.fillRect(px + 6, py + 3, 3, 1) }
                if (L.state === 'climb') { ctx.fillStyle = LEM_COLORS.head; ctx.fillRect(px + (L.dir > 0 ? 5 : -1), py - 2, 2, 3) }
                if (L.digger && L.state !== 'bomb') { ctx.fillStyle = '#c9c9c9'; ctx.fillRect(px + (L.dir > 0 ? 6 : -3), py + 4, 3, 1) }
            }

            // cursor (play) or autopilot ghost (attract): in attract the box
            // sits on the live body the solver script is about to command
            const playing = screenRef.current === 'play'
            const pc = nextPlan()
            const ghost = pc && gs.lemmings.find(l => l.id === pc.id && l.live)
            const cx = playing ? cursor.x : (ghost ? ghost.x : cursor.x)
            const cy = playing ? cursor.y : (ghost ? ghost.y - 1 : cursor.y)
            const skill = playing ? selected : (pc?.skill || 'climb')
            ctx.strokeStyle = playing ? '#ffd83d' : 'rgba(255,216,61,0.45)'
            ctx.lineWidth = 1
            ctx.setLineDash([3, 2])
            ctx.strokeRect(Math.round(cx * TS - 9.5), Math.round(cy * TS - 13.5), 19, 21)
            ctx.setLineDash([])
            ctx.fillStyle = playing ? '#ffd83d' : 'rgba(255,216,61,0.6)'
            ctx.font = '7px monospace'
            ctx.fillText(SKILL_NAME[skill][0], Math.round(cx * TS - 2), Math.round(cy * TS + 12))

            // #432: press, preview, release — the ring on the lemming that WILL
            // get the skill. Drawn last (above everything the finger covers) and
            // sized to read around a thumb that is still on the target.
            if (playing && gest.aim) {
                const L = gs.lemmings[gest.aim.id]
                if (L && L.live) {
                    const rx = Math.round(L.x * TS)
                    const ry = Math.round((L.y - 0.5) * TS)
                    ctx.strokeStyle = '#ffd83d'
                    ctx.lineWidth = 2
                    ctx.setLineDash([4, 3])
                    ctx.beginPath(); ctx.arc(rx, ry, 11 + Math.sin(gs.tick / 4) * 1.5, 0, Math.PI * 2); ctx.stroke()
                    ctx.setLineDash([])
                    ctx.fillStyle = '#ffd83d'
                    ctx.font = 'bold 8px monospace'
                    ctx.fillText(SKILL_NAME[selected][0], rx - 2, ry + 3)
                }
            }
        }

        const hud = hudRef.current
        let lastHud = 0
        const syncHud = () => {
            const now = performance.now()
            if (now - lastHud < 90) return
            lastHud = now
            if (hud.time) hud.time.style.width = `${Math.max(0, 100 * (1 - gs.t / meta.time))}%`
            if (hud.out) hud.out.textContent = `${gs.exited}/${meta.need}`
            if (hud.score) hud.score.textContent = String(gs.score).padStart(5, '0')
            if (hud.left) hud.left.textContent = `${gs.spawned - gs.exited - gs.dead}+${gs.dead}`
            for (const s of SKILLS) {
                const el = hud['sk_' + s]
                if (el) {
                    el.textContent = String(gs.skills[s])
                    el.style.opacity = gs.skills[s] > 0 ? '1' : '0.25'
                }
                const btn = document.querySelector(`[data-lem-skill="${s}"]`)
                if (btn) btn.style.borderColor = selected === s && screenRef.current === 'play' ? '#fcd34d' : ''
            }
            if (hud.lvl) hud.lvl.textContent = `${levelIdx + 1}. ${meta.name}`
        }

        // ---------- input ----------
        const startPlay = () => {
            loadLevel(0, true)
            setMode('play')
            audioController.playSweep(330, 660, 0.2, 'square', 0.07)
        }
        const selectSkill = (s) => {
            if (screenRef.current !== 'play' || pausedRef.current) return
            selected = s
            audioController.playTone(520 + SKILLS.indexOf(selected) * 90, 0.05, 'square', 0.05)
        }
        const togglePause = () => {
            if (screenRef.current !== 'play') return
            pausedRef.current = !pausedRef.current
            if (pausedRef.current) ffHeld = false      // the panel unmounts while paused
            setPaused(pausedRef.current)
        }
        const onDown = (e) => {
            const code = e.shiftKey && e.code === 'Slash' ? 'Question' : e.code
            if (code === 'Question') {
                togglePause()
                return
            }
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault()
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(); return }
            if (sc === 'over') {
                if (performance.now() - overAtRef.current > 900) setMode('attract')
                return
            }
            if (pausedRef.current) return
            if (SKILL_KEY[e.code]) { selectSkill(SKILL_KEY[e.code]); return }
            if (e.code === 'Space' || e.code === 'KeyZ') { applySkill(cursor.x, cursor.y); return }
            keys.add(e.code)
        }
        const onUp = (e) => keys.delete(e.code)
        const onBlur = () => { keys.clear(); ffHeld = false }
        // #432: the panel's taps, delegated into THIS closure — the panel is
        // static JSX (a render can't call effect-local handlers or read the
        // effect-local `selected`), so the buttons carry data attributes and
        // one window-level handler does the work.
        const panelBtn = (e) => e.target.closest && e.target.closest('[data-lem-panel] button')
        const onPanelDown = (e) => {
            const b = panelBtn(e)
            if (!b) return
            e.preventDefault()
            if (b.dataset.lemSkill) selectSkill(b.dataset.lemSkill)
            else if (b.dataset.lemPause) togglePause()
            else if (b.dataset.lemFf) ffHeld = true
        }
        const onPanelEnd = (e) => {
            const b = panelBtn(e)
            if (b && b.dataset.lemFf) ffHeld = false
        }
        // #432: the finger points at the DISPLAYED (fit) canvas — the one the
        // player sees — and writes THE one pad's pointer (normalized 0..1). The
        // shared gesture in the loop does the press / slide / release.
        const stagePoint = (e) => {
            const el = fit.display || canvas
            const r = el.getBoundingClientRect()
            if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return null
            return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
        }
        const onMove = (e) => {
            if (screenRef.current !== 'play' || pressId !== null) return
            const p = stagePoint(e)
            if (!p) return
            cursor.x = Math.max(0.5, Math.min(W - 0.5, p.x * W))
            cursor.y = Math.max(2, Math.min(H - 1, p.y * H))
        }
        const onStageDown = (e) => {
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(); return }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
            if (sc !== 'play' || pausedRef.current) return
            if (e.target.closest && e.target.closest('[data-lem-panel]')) return   // the panel owns its taps
            const p = stagePoint(e)
            if (!p) return
            pressId = e.pointerId
            setPointer(p.x, p.y, true)
        }
        const onStageMove = (e) => {
            if (e.pointerId !== pressId) return
            const p = stagePoint(e)
            if (p) setPointer(p.x, p.y, true)
        }
        const endPress = (e) => {
            if (e.pointerId !== pressId) return
            pressId = null
            setPointer(0, 0, false)
        }
        window.addEventListener('keydown', onDown)
        window.addEventListener('keyup', onUp)
        window.addEventListener('blur', onBlur)
        window.addEventListener('pointerdown', onStageDown)
        window.addEventListener('pointerdown', onPanelDown)
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointermove', onStageMove)
        window.addEventListener('pointerup', endPress)
        window.addEventListener('pointercancel', endPress)
        window.addEventListener('pointerup', onPanelEnd)
        window.addEventListener('pointercancel', onPanelEnd)

        // #432: a portrait phone gets the rotate prompt (the stage is 48x27);
        // the same wrapper the fit shell observes owns this flag.
        const orient = () => setPortrait(wrap.clientHeight > wrap.clientWidth)
        const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(orient) : null
        if (ro) ro.observe(wrap)
        orient()
        raf = requestAnimationFrame(frame)

        // ---------- DEV hook: read-only probe + solver hint ----------
        if (import.meta.env.DEV) {
            window.__lemTest = {
                probe: () => ({
                    screen: screenRef.current, t: gs.t, tick: gs.tick, level: levelIdx, name: meta.name,
                    cursor: { ...cursor }, selected,
                    aim: gest.aim ? { id: gest.aim.id, skill: selected } : null,
                    skills: { ...gs.skills },
                    spawned: gs.spawned, exited: gs.exited, dead: gs.dead, need: meta.need,
                    end: gs.end, win: gs.win, score: gs.score, hash: stateHash(gs),
                    cmds: runCmds.length, board: board(),
                    lemmings: gs.lemmings.map(L => ({ id: L.id, x: L.x, y: L.y, state: L.state, dir: L.dir, climber: L.climber, digger: L.digger })),
                }),
                // The next move the PROVEN solver makes at this point in the
                // replay — as the live position of that live lemming. Read-only:
                // the driver still has to aim and press with real inputs.
                hint: () => {
                    const c = plan.find(cc => cc.tick >= gs.tick)
                    if (!c) return null
                    const L = gs.lemmings.find(l => l.id === c.id)
                    if (!L || !L.live) return null
                    return { x: L.x, y: L.y, skill: c.skill, id: L.id, inPlan: true }
                },
                start: startPlay,
                give: (skill, n = 1) => { gs.skills[skill] += n; return gs.skills[skill] },
                teleport: (id) => {
                    const L = gs.lemmings.find(l => l.id === id && l.live)
                    if (!L) return false
                    L.x = meta.exit.x; L.y = meta.exit.y - 1; L.vy = 0; L.state = 'fall'; L.fallDist = 0
                    return true
                },
                kill: (id) => {
                    const L = gs.lemmings.find(l => l.id === id && l.live)
                    if (!L) return false
                    L.live = false; L.state = 'dead'; gs.dead++
                    return true
                },
            }
            exposeGame({
                id: 'lemmings',
                method: 'pointer',
                reads: ['pointer'],
                buttons: [],
                reset: (seed) => {
                    loadLevel((seed >>> 0) % LEVELS.length, true)
                    keys.clear()
                    setMode('play')
                },
                tick: (pad) => {
                    if (gs.end) { gs.tick += 1; return }
                    // #432 pointer: the scripted pad IS the finger — the same
                    // shared press-preview-release gesture the touch path runs,
                    // so a tap (down this tick, up the next) previews, then assigns.
                    stepGesture(pad.pointer)
                    handleEvents(step(gs, { x: cursor.x, y: cursor.y }).events)
                },
                state: () => ({
                    tick: gs.tick, score: gs.score, done: !!gs.end,
                    seed: levelIdx, level: meta.name, exited: gs.exited, dead: gs.dead, spawned: gs.spawned,
                    hash: stateHash(gs),
                }),
                canvas: () => canvas,
            })

            // F1 surgery panel: live state + the question Jon asked the
            // hard way: "can this level STILL be won from exactly here?"
            // Clones the live game (terrain damage included) and asks the
            // real solver. Solver-no means "no path the oracle can see",
            // which for a human is already bad news worth showing.
            mountDbg({
                title: 'LEMMINGS',
                getState: () => {
                    if (!gs) return ['(no level mounted yet)']
                    const rows = [
                        `need ${gs.exited}/${meta.need}  dead ${gs.dead}  live ${gs.lemmings.filter(l => l.live).length}  spawn ${gs.spawned}/${meta.spawnCount}`,
                        `stock blk${gs.skills.block} bmb${gs.skills.bomb} clm${gs.skills.climb} dig${gs.skills.dig}  tick ${gs.tick}  end ${gs.end || '-'}`,
                    ]
                    for (const L of gs.lemmings.filter(l => l.live).slice(0, 10)) {
                        rows.push(`#${L.id} ${L.state}${L.climber ? 'C' : ''}${L.digger ? 'D' : ''} (${L.x.toFixed(1)},${L.y.toFixed(0)})`)
                    }
                    return rows
                },
                actions: [
                    { label: 'PROGNOSIS', run: () => {
                        if (!gs) return 'no level'
                        const g2 = makeGame(meta, gs.grid)
                        Object.assign(g2, {
                            tick: gs.tick, t: gs.t, exited: gs.exited, dead: gs.dead,
                            spawned: gs.spawned, skills: { ...gs.skills },
                        })
                        g2.lemmings = structuredClone(gs.lemmings)
                        const r = solve(g2)
                        return r.win ? `win path exists (${r.exited}/${meta.need})` : `NO PATH — can save only ${r.exited}/${meta.need}`
                    } },
                    { label: '+BLOCKER', run: () => { gs.skills.block++ } },
                    { label: '+BOMBER', run: () => { gs.skills.bomb++ } },
                    { label: '+CLIMBER', run: () => { gs.skills.climb++ } },
                    { label: '+DIGGER', run: () => { gs.skills.dig++ } },
                    { label: 'KILL A CLIMBER', run: () => {
                        const L = gs.lemmings.find(l => l.live && (l.climber || l.state === 'climb')) || gs.lemmings.find(l => l.live)
                        if (!L) return 'none live'
                        L.live = false; L.state = 'dead'; gs.dead++
                        return `#${L.id}`
                    } },
                    { label: 'TELEPORT #0 OUT', run: () => window.__lemTest.teleport(0) ? 'sent' : 'no live #0' },
                ],
            })
        }

        return () => {
            if (import.meta.env.DEV && window.__lemTest) delete window.__lemTest
            if (import.meta.env.DEV) { unmountDbg(); unexposeGame() }
            window.removeEventListener('keydown', onDown)
            window.removeEventListener('keyup', onUp)
            window.removeEventListener('blur', onBlur)
            window.removeEventListener('pointerdown', onStageDown)
            window.removeEventListener('pointerdown', onPanelDown)
            window.removeEventListener('pointermove', onMove)
            window.removeEventListener('pointermove', onStageMove)
            window.removeEventListener('pointerup', endPress)
            window.removeEventListener('pointercancel', endPress)
            window.removeEventListener('pointerup', onPanelEnd)
            window.removeEventListener('pointercancel', onPanelEnd)
            if (ro) ro.disconnect()
            fit.destroy()
            cancelAnimationFrame(raf)
            canvas.remove()
        }
    }, [setMode])

    const handleResume = useCallback(() => {
        setPaused(false)
        pausedRef.current = false
    }, [])

    const play = screen === 'play'
    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden select-none" style={{ touchAction: 'none' }}>
            <div ref={stageRef} className="absolute inset-0 flex items-center justify-center" />

            <div className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${play ? 'opacity-100' : 'opacity-0'}`}>
                <div className="absolute top-2 left-3 right-3 flex items-center gap-3 text-amber-50 font-mono text-xs">
                    <span id="lem-lvl" ref={setHud('lvl')} className="font-bold tracking-widest text-sm" />
                    <div className="w-28 h-2.5 bg-black/50 rounded overflow-hidden border border-black/50">
                        <div ref={setHud('time')} className="h-full" style={{ background: 'linear-gradient(90deg,#ffd83d,#e23b3b)', width: '100%' }} />
                    </div>
                    <span>OUT <span ref={setHud('out')} className="font-bold text-green-300" /></span>
                    <span className="opacity-80">here/dead <span ref={setHud('left')} /></span>
                    <span className="ml-auto text-xl font-bold" style={{ textShadow: '0 2px 5px #000' }}>
                        <span ref={setHud('score')}>00000</span>
                    </span>
                </div>
            </div>

            {screen === 'attract' && (
                <div className="absolute inset-x-0 top-8 text-center pointer-events-none">
                    <h1 className="text-5xl font-black text-green-300" style={{ textShadow: '0 4px 0 #1d4a1d, 0 10px 24px #000' }}>LEMMINGS-LITE</h1>
                    <p className="text-amber-100/90 font-mono mt-1 text-sm">they walk. they fall. you decide otherwise.</p>
                    <p className="text-white font-mono font-bold mt-8 animate-pulse">TAP / PRESS ANY KEY</p>
                    <p className="text-amber-200/80 font-mono text-xs mt-2 px-6">
                        hold a lemming to preview · release to assign · tap a skill to pick it · arrows + Space work on a keyboard<br />
                        this demo is a proven solution, replayed move for move — determinism, on screen
                    </p>
                </div>
            )}

            {screen === 'over' && end && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-amber-50 font-mono px-6">
                    <h2 className="text-4xl font-black mb-1">{end.cause}</h2>
                    <p className="text-lg mb-4">{end.score} pts · {end.out}/{end.need} saved{end.last ? ' · ALL LEDGES CROSSED' : ''}</p>
                    <div className="bg-black/50 border border-amber-500/40 rounded-lg p-4 w-80 max-w-full text-sm">
                        <div className="text-green-300 font-bold mb-1 tracking-widest">SURVIVOR LEDGER</div>
                        {board().map((r, i) => (
                            <div key={i} className="flex justify-between gap-2">
                                <span>{i + 1}. {r.level}</span><span>{r.out} out · {r.score}</span><span className="opacity-60">{r.date}</span>
                            </div>
                        ))}
                    </div>
                    <p className="mt-5 animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find(g => g.label === 'LEMMINGS-LITE')} onResume={handleResume} />}
            <VirtualControls visible={play && !paused} />

            {/* #432: the original's bottom panel — the skill bar with counts
                (tap a skill to pick it) plus PAUSE and FAST-FORWARD, along the
                bottom edge instead of floating over the crowd. Static markup:
                the effect delegates the taps (the handlers live in the loop's
                closure) and paints the selection highlight on the button. */}
            {play && !paused && (
                <div
                    data-lem-panel
                    className="absolute left-0 right-0 z-50 flex items-end justify-center gap-1.5 px-2 pointer-events-auto font-mono"
                    style={{ bottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}
                >
                    {SKILLS.map((s) => (
                        <button
                            key={s}
                            data-lem-skill={s}
                            className="bg-black/60 border border-amber-200/30 rounded px-2 py-1 text-center leading-tight select-none"
                        >
                            <div className="text-[10px] text-amber-100/80 whitespace-nowrap">{SKILL_NAME[s]}</div>
                            <div ref={setHud('sk_' + s)} className="text-base font-bold text-amber-50" />
                        </button>
                    ))}
                    <button
                        data-lem-pause="1"
                        className="bg-black/60 border border-amber-200/30 rounded px-2.5 py-1 text-[11px] font-bold text-amber-50 leading-tight select-none"
                    >
                        PAUSE
                    </button>
                    <button
                        data-lem-ff="1"
                        className="bg-black/60 border border-amber-200/30 rounded px-2.5 py-1 text-[11px] font-bold text-amber-50 leading-tight select-none"
                    >
                        FF
                    </button>
                </div>
            )}

            {/* #432: portrait fills only part of the screen — say so. */}
            {portrait && (
                <div className="absolute inset-0 z-[60] flex items-center justify-center pointer-events-none">
                    <div className="bg-black/70 border border-amber-300/50 rounded-lg px-6 py-4 text-center font-mono">
                        <div className="text-3xl mb-1 text-amber-200">⟳</div>
                        <div className="text-amber-100 font-bold tracking-widest text-sm">ROTATE YOUR PHONE</div>
                        <div className="text-amber-200/70 text-xs mt-1">the ledge plays landscape</div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default LemGame
