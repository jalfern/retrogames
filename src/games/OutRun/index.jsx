// OUT RUN — the cabinet shell. Original arcade driving, 1986: the red convertible
// and the couple, seen from behind, tearing a segment-projected road (curves that
// slide, hills that hide) through five branching stages against the checkpoint
// clock. LOW/HIGH gears, traffic to weave, roadside props that flip you.
//
// Attract mode drives the autopilot's OWN proven deathless run (scripts/
// outruncheck.mjs grades the same script) behind the title; then the radio pick
// offers three original synth tunes; then 3-2-1-GO. All art and audio are
// synthesized at runtime — see art.js / AudioController — there are no assets.
//
// Layout: 1. setup 2. events/juice 3. projection render 4. loop 5. input
// 6. DEV hook + DebugKit 7. React.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { SEG_LEN, ROAD_W, CAM_H, CAM_DEPTH, DRAW, SCENES } from './road.js'
import { makeGame, step, stateHash, KMH, HIGH_TOP, LOW_TOP, W, H } from './sim.js'
import { plan } from './planner.js'
import { buildSprites, makeBackdrop } from './art.js'

const SIM_MS = 1000 / 60
const HORIZON = Math.round(H * 0.42)
const RADIOS = [
    { track: 'cruise', label: 'MAGICAL COAST' },
    { track: 'sunset', label: 'SUNSET RUN' },
    { track: 'breeze', label: 'BREEZE BOULEVARD' },
]
let cachedRun = null
const provenRun = () => { if (!cachedRun) cachedRun = plan({ seed: 0 }); return cachedRun }

const OutRunGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const gearRef = useRef(1)
    const radioRef = useRef(0)
    const overAtRef = useRef(0)
    const setMode = useCallback((m) => { screenRef.current = m; setScreen(m) }, [])
    const hud = useRef({})
    const setHud = (k) => (el) => { hud.current[k] = el }
    const board = () => { try { return JSON.parse(localStorage.getItem('outrun.board') || '[]') } catch { return [] } }

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const SP = buildSprites()
        const canvas = document.createElement('canvas')
        canvas.dataset.outrunStage = '1'
        canvas.width = W; canvas.height = H
        canvas.className = 'block w-full h-full'
        canvas.style.imageRendering = 'pixelated'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false

        let gs = makeGame(0)
        let backdrop = makeBackdrop(gs.stage.theme)
        let raf = 0, last = 0, acc = 0
        let demoAt = 0, countT = 0, toast = 0, toastMsg = '', shake = 0, flash = 0, bgScroll = 0, lean = 0
        let smokePhase = 0
        const held = new Set()
        const evLog = []
        let gearEdge = false

        const say = (m) => { toastMsg = m; toast = 150 }

        const handleEvents = (evts) => {
            for (const e of evts) evLog.push({ ...e, tick: gs.tick })
            if (evLog.length > 260) evLog.splice(0, evLog.length - 260)
            for (const e of evts) {
                if (e.type === 'stage') {
                    backdrop = makeBackdrop(SCENES[Math.min(e.depth, SCENES.length - 1)])
                    if (e.depth > 0) { say(`${e.name}`); audioController.playSweep(330, 880, 0.35, 'square', 0.08) }
                } else if (e.type === 'checkpoint') {
                    audioController.playSweep(520, 1040, 0.28, 'square', 0.09); flash = 8; say(`CHECKPOINT +${e.bonus}s`)
                } else if (e.type === 'fork') {
                    say(e.side === 'RIGHT' ? 'RIGHT ROUTE — HARDER' : 'LEFT ROUTE — EASIER')
                    audioController.playSweep(e.side === 'RIGHT' ? 300 : 700, e.side === 'RIGHT' ? 200 : 900, 0.25, 'sawtooth', 0.07)
                } else if (e.type === 'crash') { audioController.playNoise(0.18, 0.09); audioController.playSweep(220, 70, 0.28, 'sawtooth', 0.09); shake = 8; say('CRASH!') }
                else if (e.type === 'flip') { audioController.playNoise(0.35, 0.12); audioController.playSweep(180, 50, 0.5, 'sawtooth', 0.11); shake = 16; flash = 14; say('WRECKED! THE COUPLE TUMBLES') }
                else if (e.type === 'win') { audioController.playFanfare(); flash = 12; shake = 6 }
                else if (e.type === 'over') audioController.playDeath()
            }
        }

        const finish = (win) => {
            const sc = Math.round(gs.score)
            if (win) localStorage.setItem('outrun.board', JSON.stringify([...board(), { score: sc, date: new Date().toISOString().slice(2, 10) }].sort((a, b) => b.score - a.score).slice(0, 8)))
            overAtRef.current = performance.now()
            audioController.stopMusic()
            setMode('over')
        }

        const doSim = (inp) => {
            if (!inp.gear) inp.gear = gearRef.current
            step(gs, inp)
            handleEvents(gs.events.splice(0))
            if (gs.end) finish(gs.win)
        }

        const tickDemo = () => {
            const run = provenRun()
            if (demoAt >= run.script.length) { gs = makeGame(0); demoAt = 0; backdrop = makeBackdrop(gs.stage.theme) }
            doSim(run.script[demoAt++])
            if (gs.end) { gs = makeGame(0); demoAt = 0; backdrop = makeBackdrop(gs.stage.theme) }
        }

        const computeInput = () => {
            const steer = (held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0)
            const gas = held.has('ArrowUp') || held.has('Space') || held.has('KeyZ')
            const brake = held.has('ArrowDown')
            if (gearEdge) { gearRef.current = gearRef.current ? 0 : 1; gearEdge = false }
            return { steer, gas, brake, gear: gearRef.current }
        }

        const doFrameSim = () => {
            const sc = screenRef.current
            if (sc === 'attract') { tickDemo(); return }
            if (sc === 'count') { countT--; if (countT <= 0) setMode('play'); return }
            if (sc !== 'play') return
            doSim(computeInput())
        }

        // ---------------------------------------------------- projection render ----
        const poly = (x1, y1, x2, y2, x3, y3, x4, y4, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4); ctx.closePath(); ctx.fill() }
        const RUMBLE_LEN = 3

        const drawScene = () => {
            const st = gs.stage
            const segCount = st.segCount
            const base = Math.floor(gs.position / SEG_LEN)
            const basePct = (gs.position % SEG_LEN) / SEG_LEN
            const seg0 = st.segs[base % segCount]
            const seg1 = st.segs[(base + 1) % segCount]
            const camY = seg0.y + (seg1.y - seg0.y) * basePct + CAM_H
            const camX = gs.playerX * ROAD_W
            const th = st.theme

            // sky + parallax band
            ctx.save()
            if (shake > 0) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake -= 0.6 }
            ctx.fillStyle = th.sky[2]; ctx.fillRect(-10, -10, W + 20, HORIZON + 12)
            const off = ((bgScroll % W) + W) % W
            ctx.drawImage(backdrop.canvas, -off, 0)
            ctx.drawImage(backdrop.canvas, -off + backdrop.w, 0)

            // base ground so nothing bleeds sky below the horizon
            ctx.fillStyle = th.grass[0]; ctx.fillRect(-10, HORIZON, W + 20, H - HORIZON + 10)

            // build + paint road strips
            let cx = 0
            let dcx = -(seg0.curve) * basePct
            let maxY = H
            const nodes = []
            for (let n = 0; n <= DRAW; n++) {
                const idx = (base + n) % segCount
                const seg = st.segs[idx]
                const next = st.segs[(idx + 1) % segCount]
                const nearX = cx
                dcx += seg.curve
                const farX = cx + dcx
                cx = farX
                const dz1 = (n - basePct) * SEG_LEN
                const dz2 = (n + 1 - basePct) * SEG_LEN
                const sc1 = CAM_DEPTH / (dz1 > 6 ? dz1 : 6)
                const sc2 = CAM_DEPTH / (dz2 > 6 ? dz2 : 6)
                const p1 = { x: W / 2 + sc1 * (nearX - camX) * W / 2, y: H / 2 - sc1 * (seg.y - camY) * H / 2, w: sc1 * ROAD_W * W / 2 }
                const p2 = { x: W / 2 + sc2 * (farX - camX) * W / 2, y: H / 2 - sc2 * (next.y - camY) * H / 2, w: sc2 * ROAD_W * W / 2 }
                nodes[n] = { p1, p2, seg, idx, clip: maxY }
                if (dz1 <= 6) continue
                if (p2.y >= p1.y) continue      // downhill past a crest — the hill hides it
                if (p2.y >= maxY) continue      // hidden behind a nearer crest
                const alt = Math.floor(idx / RUMBLE_LEN) % 2
                ctx.fillStyle = th.grass[alt]; ctx.fillRect(-10, p2.y, W + 20, p1.y - p2.y + 1)
                const r1 = p1.w * 0.16, r2 = p2.w * 0.16
                const rc = th.rumble[alt]
                poly(p1.x - p1.w - r1, p1.y, p1.x - p1.w, p1.y, p2.x - p2.w, p2.y, p2.x - p2.w - r2, p2.y, rc)
                poly(p1.x + p1.w + r1, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x + p2.w + r2, p2.y, rc)
                poly(p1.x - p1.w, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x - p2.w, p2.y, th.road[alt])
                // lane dividers (2 inner lines) as dashes — not inside the fork zone
                if (alt === 0 && p1.w > 12 && !(gs.depth < 4 && idx >= st.forkFrom)) {
                    const lw1 = Math.max(1, p1.w * 0.03), lw2 = Math.max(1, p2.w * 0.03)
                    for (const lf of [-1 / 3, 1 / 3]) {
                        poly(p1.x + lf * p1.w - lw1, p1.y, p1.x + lf * p1.w + lw1, p1.y, p2.x + lf * p2.w + lw2, p2.y, p2.x + lf * p2.w - lw2, p2.y, 'rgba(255,255,255,0.7)')
                    }
                }
                // the fork median island opens near a checkpoint
                if (gs.depth < 4 && idx >= st.forkFrom) {
                    const t = (idx - st.forkFrom) / (segCount - st.forkFrom)
                    const iw1 = p1.w * t * 0.34, iw2 = p2.w * t * 0.34
                    poly(p1.x - iw1, p1.y, p1.x + iw1, p1.y, p2.x + iw2, p2.y, p2.x - iw2, p2.y, th.grass[(alt + 1) % 2])
                }
                maxY = p2.y
            }

            // roadside props + goal, painter far -> near so near props overlap far ones
            for (let n = DRAW; n >= 1; n--) {
                const node = nodes[n]
                if (!node) continue
                const { p1, seg, clip } = node
                if (p1.y <= 0) continue
                const k = p1.w / 640
                for (const sp of seg.sprites) {
                    const img = sp.type === 'goal' ? SP.goal : SP.props[sp.type]
                    if (!img) continue
                    const s = Math.max(0.05, Math.min(3.2, k * (sp.big ? 1.5 : 1)))
                    const dw = img.width * s, dh = img.height * s
                    const sx = p1.x + sp.offset * p1.w - dw / 2
                    const sy = p1.y - dh
                    if (p1.y > clip + 4 && sy < clip) continue      // crest occlusion
                    if (sy > H || sy + dh < HORIZON) continue
                    ctx.drawImage(img, sx, sy, dw, dh)
                }
                // traffic cars sit in their segment's plane
                for (const c of gs.cars) {
                    const cn = Math.round(c.pos / SEG_LEN) - base
                    if (cn !== n) continue
                    if (p1.y > clip + 4) continue
                    const s = Math.max(0.06, Math.min(3.0, k * 1.05))
                    const img = SP.traffic[c.hue % SP.traffic.length]
                    const dw = img.width * s, dh = img.height * s
                    ctx.drawImage(img, p1.x + (((c.lane - 1) * 2) / 3) * p1.w - dw / 2, p1.y - dh, dw, dh)
                }
            }

            drawPlayer()
            ctx.restore()

            bgScroll += seg0.curve * (gs.speed / HIGH_TOP) * 1.2

            if (flash > 0) { ctx.fillStyle = `rgba(255,120,40,${flash * 0.02})`; ctx.fillRect(0, 0, W, H); flash -= 0.6 }
        }

        const drawPlayer = () => {
            const pw = 92, ph = 58
            let angle = lean * 0.32
            let bob = 0
            if (gs.spin > 0) { const dur = gs.flip > 0 ? 54 : 26; angle += gs.spinDir * (1 - gs.spin / dur) * Math.PI * 2; bob = Math.sin(gs.spin / 6) * 4 }
            const img = SP.player[1]
            // exhaust puffs while accelerating on the road
            if (gs.speed > HIGH_TOP * 0.4 && !gs.spin) {
                smokePhase += 1
                ctx.fillStyle = 'rgba(180,180,180,0.20)'
                for (let i = 0; i < 2; i++) ctx.beginPath(), ctx.arc(W / 2 - 16 + i * 32 + Math.sin((smokePhase / 4) + i) * 3, H - 4 + i, 4 + (smokePhase % 5), 0, Math.PI * 2), ctx.fill()
            }
            ctx.save()
            ctx.translate(W / 2, H - 6 + bob)
            ctx.rotate(angle)
            if (gs.flip > 0 && (Math.floor(gs.flip / 6) % 2 === 0)) ctx.scale(1, -1)
            ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, ph / 2 - 4, pw * 0.42, 6, 0, 0, Math.PI * 2); ctx.fill()
            ctx.drawImage(img, -pw / 2, -ph / 2, pw, ph)
            ctx.restore()
        }

        const text = (s, x, y, size, col, glow = 0, align = 'center') => {
            ctx.font = `bold ${size}px monospace`; ctx.textAlign = align
            if (glow) { ctx.shadowColor = col; ctx.shadowBlur = glow }
            ctx.fillStyle = col; ctx.fillText(s, x, y); ctx.shadowBlur = 0
        }

        const drawHud = () => {
            const tl = Math.max(0, Math.ceil(gs.timeLeft))
            ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, W, 26)
            text(`TIME ${String(tl).padStart(2, '0')}`, 12, 19, 18, tl <= 10 ? ((gs.tick >> 2) % 2 ? '#ff5d5d' : '#ffd23f') : '#e9f7ff', tl <= 10 ? 8 : 3, 'left')
            text(`${KMH(gs.speed)} KM/H`, W - 12, 18, 15, '#8fff9f', 3, 'right')
            text(gs.gear === 0 ? 'LOW' : 'HIGH', W - 12, 44, 11, gs.gear === 0 ? '#ff8a3f' : '#5dc8ff', 3, 'right')
            text(`STAGE ${gs.depth + 1}/5`, W / 2, 17, 10, '#ffd23f', 2)
            text(`SCORE ${String(Math.round(gs.score)).padStart(6, '0')}`, 12, 42, 11, '#e9f7ff', 2, 'left')
        }

        const draw = () => {
            ctx.fillStyle = '#05070d'; ctx.fillRect(0, 0, W, H)
            drawScene()
            drawHud()
            if (toast > 0) { text(toastMsg, W / 2, H - 40, 12, '#ffd23f', 6); toast-- }

            const sc = screenRef.current
            if (sc === 'attract') {
                ctx.fillStyle = 'rgba(3,4,12,0.72)'; ctx.fillRect(0, 0, W, H)
                text('OUT RUN', W / 2, 92, 44, '#ff5d5d', 18)
                text('SEGAL 1986 · SUNSET HIGHWAY', W / 2, 116, 8, '#8fa3d8')
                if (Math.floor(gs.tick / 24) % 2 === 0) text('PRESS ANY KEY', W / 2, 150, 12, '#e9f7ff', 4)
                text('STEER + GAS + BRAKE + LOW/HIGH GEAR', W / 2, 196, 8, '#5d7094')
                text('BEAT THE CLOCK · FORK YOUR ROUTE · 5 GOALS', W / 2, 210, 8, '#5d7094')
                const b = board()[0]; if (b) text(`HI-SCORE ${String(b.score).padStart(6, '0')}`, W / 2, 232, 9, '#ffd23f', 3)
            } else if (sc === 'radio') {
                ctx.fillStyle = 'rgba(3,4,12,0.82)'; ctx.fillRect(0, 0, W, H)
                text('SELECT YOUR RADIO', W / 2, 70, 20, '#e9f7ff', 8)
                RADIOS.forEach((r, i) => text(`${i + 1}. ${r.label}`, W / 2, 118 + i * 28, 13, i === radioRef.current ? '#ff5d5d' : '#5d7094', i === radioRef.current ? 6 : 0))
                text('◀ ▶ CHOOSE   ·   SPACE / ↵ TO DRIVE', W / 2, 214, 9, '#8fa3d8')
            } else if (sc === 'count') {
                const n = Math.ceil(countT / 60)
                text(n > 0 ? String(n) : 'GO!', W / 2, H / 2, 60, n > 0 ? '#ffd23f' : '#8fff9f', 20)
            } else if (sc === 'over') {
                ctx.fillStyle = 'rgba(3,4,12,0.78)'; ctx.fillRect(0, 0, W, H)
                text(gs.win ? 'GOAL! YOU OUTRAN THE CLOCK' : 'TIME UP', W / 2, 96, 22, gs.win ? '#8fff9f' : '#ff5d5d', 12)
                text(`SCORE ${String(Math.round(gs.score)).padStart(6, '0')}   STAGES ${gs.stagesDone}/5   CRASHES ${gs.crashes}`, W / 2, 128, 10, '#ffd23f', 4)
                text(`${gs.distanceKm.toFixed(1)} KM CARRIED AWAY`, W / 2, 150, 9, '#8fa3d8')
                if (Math.floor(gs.tick / 24) % 2 === 0) text('PRESS ANY KEY', W / 2, 190, 11, '#e9f7ff', 4)
            }
            ctx.fillStyle = 'rgba(0,0,0,0.10)'; for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1)
        }

        // -------------------------------------------------------------- loop ----
        const frame = (now) => {
            raf = requestAnimationFrame(frame)
            const dt = Math.min(now - last, 250); last = now
            if (pausedRef.current) return
            acc += dt
            while (acc >= SIM_MS) { doFrameSim(); acc -= SIM_MS }
            // smooth the visual lean toward the current steer/curve
            const steerVis = (held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0)
            lean += ((steerVis + gs.stage.segs[Math.min(gs.stage.segCount - 1, Math.floor(gs.position / SEG_LEN))].curve * 0.12) - lean) * 0.15
            draw()
            const hh = hud.current
            if (hh.time) hh.time.textContent = String(Math.max(0, Math.ceil(gs.timeLeft))).padStart(2, '0')
            if (hh.speed) hh.speed.textContent = String(KMH(gs.speed))
            if (hh.gear) hh.gear.textContent = gs.gear === 0 ? 'LOW' : 'HIGH'
            if (hh.stage) hh.stage.textContent = `${gs.depth + 1}/5`
        }

        // ------------------------------------------------------------- input ----
        const goRadio = () => { setMode('radio'); audioController.stopMusic() }
        const goPlay = () => {
            gs = makeGame(0); gearRef.current = 1; demoAt = 0
            backdrop = makeBackdrop(gs.stage.theme)
            lean = 0; shake = 0; flash = 0
            audioController.startMusic(RADIOS[radioRef.current].track)
            countT = 200
            setMode('count')
        }
        const onKeyDown = (ev) => {
            if (ev.key === '?' || ev.code === 'Escape' || ev.code === 'Backquote') { ev.preventDefault(); setPaused((p) => !p); return }
            const sc = screenRef.current
            if (sc === 'attract') { goRadio(); return }
            if (sc === 'radio') {
                if (ev.code === 'ArrowLeft' || ev.code === 'Digit1') { radioRef.current = 0; audioController.startMusic(RADIOS[0].track) }
                else if (ev.code === 'ArrowRight' || ev.code === 'Digit3') { radioRef.current = 2; audioController.startMusic(RADIOS[2].track) }
                else if (ev.code === 'ArrowUp' || ev.code === 'ArrowDown' || ev.code === 'Digit2') { radioRef.current = 1; audioController.startMusic(RADIOS[1].track) }
                else if (ev.code === 'Space' || ev.code === 'Enter' || ev.code === 'KeyZ') goPlay()
                return
            }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
            if (ev.code === 'KeyB' || ev.code === 'ShiftLeft' || ev.code === 'ShiftRight' || ev.code === 'KeyG') gearEdge = true
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyZ'].includes(ev.code)) ev.preventDefault()
            held.add(ev.code)
        }
        const onKeyUp = (ev) => { held.delete(ev.code) }
        const onPointer = () => {
            const sc = screenRef.current
            if (sc === 'attract') goRadio()
            else if (sc === 'over' && performance.now() - overAtRef.current > 900) setMode('attract')
        }
        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)
        canvas.addEventListener('pointerdown', onPointer)

        // --------------------------------------------------------- DEV hook ----
        if (import.meta.env.DEV) {
            window.__outrunTest = {
                state: () => gs,
                hash: () => stateHash(gs),
                step: (n = 1) => { for (let i = 0; i < n; i++) doSim({ steer: 0, gas: true, brake: false, gear: gearRef.current }) },
                stepWith: (inp) => doSim(inp),
                press: (codes) => { for (const c of codes) held.add(c) },
                release: (codes) => { for (const c of codes) held.delete(c) },
                gear: () => { gearRef.current = gearRef.current ? 0 : 1 },
                setGear: (g) => { gearRef.current = g ? 1 : 0 },
                start: () => goPlay(),
                radio: (i) => { radioRef.current = i ? Math.min(2, Math.max(0, i)) : 0 },
                plan: (opts) => plan(opts),
                events: () => evLog,
                probe: () => ({
                    tick: gs.tick, screen: screenRef.current, depth: gs.depth, col: gs.col,
                    pos: Math.round(gs.position), speed: KMH(gs.speed), gear: gs.gear,
                    timeLeft: +gs.timeLeft.toFixed(1), score: Math.round(gs.score), crashes: gs.crashes,
                    stagesDone: gs.stagesDone, offroad: gs.offroad, spin: gs.spin, end: gs.end,
                    hash: stateHash(gs),
                }),
                gameTime: () => gs.tick / 60,
            }
            mountDbg({
                title: 'OUT RUN',
                getState: () => [
                    `stage ${gs.depth + 1}/5 col ${gs.col}  ${gs.stage.theme.name}   TIME ${gs.timeLeft.toFixed(1)}s`,
                    `${KMH(gs.speed)} km/h ${gs.gear === 0 ? 'LOW' : 'HIGH'}  x=${gs.playerX.toFixed(2)}${gs.offroad ? ' OFFROAD' : ''}${gs.spin ? ' SPIN' : ''}  score ${Math.round(gs.score)}`,
                    `cars ${gs.cars.map((c) => `${c.lane}@${Math.round(c.pos / SEG_LEN)}`).join(' ')}  crashes ${gs.crashes}`,
                ],
                actions: [
                    { label: 'PROGNOSIS', run: () => { const r = plan({ seed: 0 }); return r.won ? `route still winnable (crashes ${r.crashes}, stages ${r.stages})` : 'ROUTE NOT WINNABLE' } },
                    { label: '+30s time', run: () => { gs.timeLeft += 30; return 'time +30 (cheat)' } },
                    { label: 'high gear', run: () => { gearRef.current = 1; return 'gear HIGH' } },
                    { label: 'jump stage', run: () => { if (gs.depth < 4) { gs.position = gs.stage.length + 1 } return 'skip (cheat)' } },
                ],
            })
        }

        last = performance.now()
        raf = requestAnimationFrame(frame)
        return () => {
            cancelAnimationFrame(raf)
            if (canvas.parentNode === wrap) wrap.removeChild(canvas)
            window.removeEventListener('keydown', onKeyDown)
            window.removeEventListener('keyup', onKeyUp)
            audioController.stopMusic()
            if (import.meta.env.DEV) { unmountDbg(); delete window.__outrunTest }
        }
    }, [setMode])

    useEffect(() => { pausedRef.current = paused }, [paused])

    const entry = GAMES.find((g) => g.label === 'OUT RUN')

    return (
        <div className="relative w-full h-full flex flex-col items-center justify-center bg-[#05070d] select-none">
            <div ref={stageRef} className="relative w-full max-w-[900px] aspect-[512/288] shadow-[0_0_44px_rgba(216,31,38,0.28)]" />
            <div className="flex gap-6 mt-2 text-[11px] font-mono tracking-widest text-[#8fa3d8]">
                <span>TIME <span ref={setHud('time')} className="text-[#e9f7ff]">24</span></span>
                <span>SPEED <span ref={setHud('speed')} className="text-[#8fff9f]">0</span> km/h</span>
                <span>GEAR <span ref={setHud('gear')} className="text-[#5dc8ff]">HIGH</span></span>
                <span>STAGE <span ref={setHud('stage')} className="text-[#ffd23f]">1/5</span></span>
            </div>
            <VirtualControls visible={screen === 'play' && !paused} />
            {paused && <PauseOverlay game={entry} onResume={() => setPaused(false)} />}
        </div>
    )
}

export default OutRunGame
