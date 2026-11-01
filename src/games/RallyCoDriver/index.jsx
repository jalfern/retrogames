// RALLY CO-DRIVER (#1251) — an original 2P night rally: the road hides itself
// behind crests, and the co-driver's pace notes are the only thing that tells
// you what is over the top. The sim (sim.js/stage.js/calls.js) is pure and
// node-audited (rallycheck); this file is the shell: the loop, the night
// render, the three co-driver sources (CPU / note keys / voice), the HUD.
//
// Seating (#494): seat 1 = the driver (arrows + A), seat 2 = the co-driver —
// CPU by default, the QWE/ASD/Z note keys on desktop, or V for spoken notes
// (#1247 consent + #1249-style speechListen). Lobby seats are stage 2.

import { useEffect, useRef, useState } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { exposeGame, unexposeGame, contractHoldsLoop } from '../../utils/gameContract'
import { askVoiceConsent } from '../../utils/voiceCapture'
import { startSpeechListen, speechSupported } from '../../utils/speechListen'
import {
    createSim, tickSim, state, stateHash, cpuDriverPad, cpuCoDriverPad,
    stageAt, distAhead, slopeAt, gearOf, mulberry32,
    ROAD_HALF, SHOULDER, FOG_RANGE, VMAX, STAGE_L,
} from './sim.js'
import { parseCoCall, applyCallEvent, callLabel } from './calls.js'

const SIM_MS = 1000 / 60
const W = 480
const H = 270
const SC = 1.1            // world units -> px
const CY = H * 0.62       // the car's screen row
const KM_PER_UNIT = 0.15 * 3.6 * 60 // v (units/tick) -> km/h at 60 Hz

const G = GAMES.find((g) => g.label === 'RALLY CO-DRIVER')

const ATTRACT_MSGS = [
    'NIGHT. FOG. BLIND CRESTS.',
    'THE CO-DRIVER SEES WHAT YOU CANNOT',
    'EVERY CORNER IS CALLED BEFORE THE HILL',
    'LISTEN FOR “LEFT 2, THEN RIGHT 3”',
    'C: CO-DRIVER KEYS · V: SPEAK THE NOTES',
]

// desktop 2P: the co-driver's note keys. QWE = LEFT 1/2/3, ASD = RIGHT 1/2/3,
// Z = STRAIGHT. A note is a moment (a tap), not a hold.
const CO_KEYS = {
    KeyQ: { dir: -1, sev: 1 }, KeyW: { dir: -1, sev: 2 }, KeyE: { dir: -1, sev: 3 },
    KeyA: { dir: 1, sev: 1 }, KeyS: { dir: 1, sev: 2 }, KeyD: { dir: 1, sev: 3 },
    KeyZ: { dir: 0, sev: 1 },
}

function fmtTime(ms) {
    const m = Math.floor(ms / 60000)
    const s = Math.floor(ms / 1000) % 60
    const c = Math.floor(ms / 10) % 100
    return `${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`
}

// world -> screen for a stage-following camera (north-up; the ribbon meanders)
function worldToScreen(ctx2, cx, cy, wx, wy) {
    return [ (wx - cx) * SC + W / 2, (wy - cy) * SC + CY ]
}

export default function RallyCoDriver() {
    const wrapRef = useRef(null)
    const canvasRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const pausedRef = useRef(false) // shared by the loop (sim gate) and PauseOverlay resume
    const [voiceUi, setVoiceUi] = useState(null) // { on, said, ok, label }

    useEffect(() => {
        const wrap = wrapRef.current
        if (!wrap) return undefined
        const LITE = new URLSearchParams(location.search).has('lite')
        const canvas = document.createElement('canvas')
        canvas.width = W
        canvas.height = H
        canvas.className = 'block'
        canvas.style.width = '100%'
        canvas.style.aspectRatio = `${W}/${H}`
        canvas.style.imageRendering = 'pixelated'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)
        canvasRef.current = canvas
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false

        const screenRef = { cur: 'attract' }
        const setScreenBoth = (s) => { screenRef.cur = s; setScreen(s) }

        let seedRef = { cur: 1 }
        let attractSeed = 0x5eed
        const play = { g: createSim(seedRef.cur, 2) }
        const attract = { g: createSim(attractSeed, 2) }
        const best = { t: null }
        const hintUntil = { t: 0 }

        // ---- juice state (shell-side: lights, banners, gravel, feel) --------
        const cd = { t: 0 } // 3-2-1-GO in sim ticks (4 s); reset()/contract skip it
        const banner = { until: 0, main: '', sub: '' } // lap-line banner + split
        const spray = [] // gravel particles, screen space { x, y, vx, vy, life }
        const fxRng = mulberry32(0xb10cf1e5) // screen fx only — never the sim's rng
        let crestArmed = true

        // driver input: held keys (keyboard + VirtualControls dispatch the
        // same keydown events, so phones and keys share one path)
        const keys = { up: false, down: false, left: false, right: false, a: false }

        const voice = { on: false, listen: null }
        const pushVoice = () => setVoiceUi(voice.on ? { on: true, said: voice.said, ok: voice.ok, label: voice.label } : null)

        const startRace = () => {
            play.g = createSim(seedRef.cur, 2)
            play.g.co.kind = 'cpu'
            voice.said = ''; voice.ok = false; voice.label = ''
            pushVoice()
            hintUntil.t = play.g.tick + 420
            cd.t = 240 // the lights hold the car: 3 — 2 — 1 — GO
            spray.length = 0
            banner.until = 0
            crestArmed = true
            setScreenBoth('play')
        }

        const driverPad = () => ({
            up: keys.up, down: keys.down, left: keys.left, right: keys.right, a: keys.a,
        })

        const coPad = (g) => (g.co.kind === 'cpu' ? cpuCoDriverPad(g) : {})

        // ---- voice (V) — spoken notes into the cpu co-driver seat -----------
        const voiceStop = () => {
            voice.on = false
            if (voice.listen) { voice.listen.stop(); voice.listen = null }
            pushVoice()
        }
        const voiceOn = async () => {
            if (screenRef.cur !== 'play') return
            if (play.g.co.kind === 'human') { say('THE KEYS HOLD SEAT 2 — PRESS C') }
            if (voice.on) { voiceStop(); return }
            if (!speechSupported()) { say('NO SPEECH ENGINE ON THIS DEVICE') }
            const consent = await askVoiceConsent()
            if (!consent.consent) { say('NO MIC, NO NOTES'); return }
            voice.on = true
            voice.label = 'LISTENING'
            voice.listen = startSpeechListen({
                onPhrase: (p) => {
                    if (screenRef.cur !== 'play') return
                    const call = parseCoCall(p)
                    voice.said = p.length > 22 ? `${p.slice(0, 22)}…` : p
                    voice.ok = !!call
                    voice.label = call ? callLabel(call) : 'NO NOTE'
                    if (call) {
                        applyCallEvent(play.g, call, 'voice')
                        audioController.playTone(880, 0.06, 'square', 0.05)
                        audioController.playTone(1318, 0.08, 'square', 0.04, 0.06)
                    } else audioController.playTone(233, 0.1, 'sawtooth', 0.04)
                    pushVoice()
                },
                onError: () => { /* the badge already tells the truth */ },
            })
            pushVoice()
        }

        // a short centered line, one at a time (ART rule)
        let sayUntil = 0
        let sayText = ''
        const say = (t) => { sayText = t; sayUntil = performance.now() + 1800 }

        const onKey = (e, down) => {
            if (down && e.repeat) return
            const code = e.shiftKey && e.code === 'Slash' ? 'Question' : e.code
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) e.preventDefault()
            if (code === 'Question' || code === 'Escape' || code === 'Backquote') {
                if (down && screenRef.cur !== 'attract') {
                    pausedRef.current = !pausedRef.current
                    setPaused(pausedRef.current)
                    if (pausedRef.current) voiceStop()
                }
                return
            }
            if (pausedRef.current) return
            if (screenRef.cur === 'attract') { if (down) startRace(); return }
            if (screenRef.cur === 'over') { if (down && (code === 'Space' || code === 'Enter')) startRace(); return }
            // play
            if (code === 'KeyC' && down) {
                if (voice.on) voiceStop()
                play.g.co.kind = play.g.co.kind === 'cpu' ? 'human' : 'cpu'
                say(play.g.co.kind === 'human' ? 'SEAT 2: QWE LEFT · ASD RIGHT · Z STRAIGHT' : 'SEAT 2: CO-D CPU')
                return
            }
            if (code === 'KeyV' && down) { voiceOn(); return }
            if (code === 'ArrowUp') keys.up = down
            if (code === 'ArrowDown') keys.down = down
            if (code === 'ArrowLeft') keys.left = down
            if (code === 'ArrowRight') keys.right = down
            if (code === 'Space') keys.a = down
            // human co-driver: a note is a tap
            if (down && play.g.co.kind === 'human' && CO_KEYS[code]) {
                const call = CO_KEYS[code]
                applyCallEvent(play.g, call, 'human')
                audioController.playTone(call.dir === 0 ? 520 : 620 + call.sev * 90, 0.05, 'square', 0.05)
            }
        }
        const kd = (e) => onKey(e, true)
        const ku = (e) => onKey(e, false)
        const tap = () => {
            if (pausedRef.current) return
            if (screenRef.cur === 'attract') startRace()
            else if (screenRef.cur === 'over') startRace()
        }
        window.addEventListener('keydown', kd)
        window.addEventListener('keyup', ku)
        canvas.addEventListener('pointerdown', tap)

        // ---- juice from sim events ------------------------------------------
        const juice = (g) => {
            for (const e of g.events) {
                if (e.kind === 'note') {
                    audioController.playTone(660, 0.05, 'square', 0.04)
                    audioController.playTone(990, 0.07, 'square', 0.03, 0.05)
                } else if (e.kind === 'noisecall') {
                    audioController.playTone(220, 0.1, 'sawtooth', 0.04)
                } else if (e.kind === 'lap') {
                    banner.main = e.laps >= g.LAPS ? 'FINAL PASS' : `LAP ${e.laps + 1}/${g.LAPS}`
                    banner.sub = e.split != null ? fmtTime(e.split) : ''
                    banner.until = g.tick + 200
                    audioController.playTone(523, 0.08, 'square', 0.06)
                    audioController.playTone(784, 0.1, 'square', 0.06, 0.09)
                } else if (e.kind === 'finish') {
                    audioController.playTone(523, 0.09, 'square', 0.07)
                    audioController.playTone(659, 0.09, 'square', 0.07, 0.1)
                    audioController.playTone(784, 0.09, 'square', 0.07, 0.2)
                    audioController.playTone(1046, 0.16, 'square', 0.07, 0.3)
                }
            }
            g.events.length = 0
            // stepped-RPM engine: pitch snaps between gear ratios instead of
            // one continuous sweep (gearOf is pure — rallycheck pins it)
            if (g.tick % 5 === 0 && g.car.v > 0.4 && screenRef.cur === 'play') {
                const { gear, frac } = gearOf(g.car.v)
                audioController.playTone(34 + gear * 13 + frac * 26, 0.045, 'sawtooth', 0.012)
                if (frac > 0.92 && gear < 3) audioController.playTone(34 + (gear + 1) * 13 + 26, 0.02, 'square', 0.005)
            }
        }

        // ---- the loop (one driver, fixed timestep, contract can hold it) ----
        let raf = 0
        let last = performance.now()
        let acc = 0
        let offWas = false

        const simStep = () => {
            if (pausedRef.current) return
            if (screenRef.cur === 'attract') {
                const g = attract.g
                tickSim(g, [cpuDriverPad(g), cpuCoDriverPad(g)])
                if (g.done) {
                    attractSeed = (attractSeed * 1103515245 + 12345) & 0x7fffffff
                    attract.g = createSim(attractSeed, 2)
                }
                return
            }
            if (screenRef.cur !== 'play') return
            const g = play.g
            // the lights: physics holds until GO (pause holds the lights too)
            if (cd.t > 0) {
                const t0 = cd.t
                cd.t--
                if (t0 > 180 && cd.t <= 180) audioController.playTone(330, 0.09, 'square', 0.06)
                if (t0 > 120 && cd.t <= 120) audioController.playTone(330, 0.09, 'square', 0.06)
                if (t0 > 60 && cd.t <= 60) audioController.playTone(880, 0.16, 'square', 0.07)
                return
            }
            // crest landing: the slope falls from climb to drop across a
            // 48-unit window (rallycheck pins that every seed has these)
            const slope = slopeAt(g.stage, g.car.s)
            const over = slopeAt(g.stage, g.car.s - 48) > 0.015 && slope < -0.015
            if (over && crestArmed && g.car.v > 1.5) {
                crestArmed = false
                audioController.playNoise(0.14, 0.04)
                audioController.playTone(52, 0.09, 'triangle', 0.05)
            }
            if (!over) crestArmed = true
            // tyre chatter near the grip limit (big slip angle at speed, on road)
            if (!g.car.off && g.car.v > 2.4 && Math.abs(g.car.align) > 0.5 && g.tick % 4 === 0) {
                audioController.playNoise(0.06, 0.016)
            }
            if (g.car.off && !offWas) audioController.playNoise(0.12, 0.03)
            offWas = g.car.off
            tickSim(g, [driverPad(), coPad(g)])
            juice(g)
            // gravel spray: roost off the rear wheels while on the shoulder
            if (!LITE && g.car.off && g.car.v > 0.4 && spray.length < 90) {
                const ang = stageAt(g.stage, g.car.s).heading + g.car.align
                const bx = -Math.cos(ang), by = -Math.sin(ang) // travel-backwards
                for (let i = 0; i < 2; i++) {
                    const side = i === 0 ? -1 : 1
                    spray.push({
                        x: W / 2 + g.car.lat * SC + bx * 6 + Math.sin(ang) * side * 4,
                        y: CY + by * 6 - Math.cos(ang) * side * 4 + (fxRng() - 0.5) * 2,
                        vx: bx * (0.5 + fxRng() * 1.4) * g.car.v + (fxRng() - 0.5) * 0.6,
                        vy: by * (0.5 + fxRng() * 1.4) * g.car.v + (fxRng() - 0.5) * 0.6,
                        life: 12 + Math.floor(fxRng() * 14),
                    })
                }
            }
            if (g.done) {
                const t = state(g).score
                if (best.t == null || t < best.t) best.t = t
                setScreenBoth('over')
                voiceStop()
            }
        }

        // ---- the night render -------------------------------------------------
        const roadPts = (g) => {
            // samples behind the car (always visible) and ahead to the fog cut
            const car = g.car
            const out = []
            const step = LITE ? 8 : 6
            for (let d = -80; d <= g.vis + 8; d += step) {
                const s = car.s + d
                const p = stageAt(g.stage, s)
                const nx = -Math.sin(p.heading), ny = Math.cos(p.heading) // right vector
                out.push({
                    d,
                    lx: p.x + nx * (ROAD_HALF + SHOULDER), ly: p.y + ny * (ROAD_HALF + SHOULDER),
                    rx: p.x - nx * (ROAD_HALF + SHOULDER), ry: p.y - ny * (ROAD_HALF + SHOULDER),
                    cx: p.x, cy: p.y,
                    cxL: p.x + nx * -ROAD_HALF, cyL: p.y + ny * -ROAD_HALF,
                    cxR: p.x + nx * ROAD_HALF, cyR: p.y + ny * ROAD_HALF,
                })
            }
            return out
        }

        const fogAlpha = (d, vis) => {
            // solid near the car, gone at the fog cut — the road literally
            // stops existing where the hill or the fog eats it
            if (d < 0) return 1
            if (d >= vis) return 0
            if (d < vis * 0.65) return 1
            return (vis - d) / (vis * 0.35)
        }

        // a road band between two named edges over the given samples, fog-faded
        // at its mid-distance (the road literally stops existing at the cut)
        const band = (pts, xa, ya, xb, yb, fill, vis) => {
            if (pts.length < 2) return
            ctx.beginPath()
            const [x0, y0] = worldToScreen(ctx, cam.x, cam.y, pts[0][xa], pts[0][ya])
            ctx.moveTo(x0, y0)
            for (let i = 1; i < pts.length; i++) {
                const [x, y] = worldToScreen(ctx, cam.x, cam.y, pts[i][xa], pts[i][ya])
                ctx.lineTo(x, y)
            }
            for (let i = pts.length - 1; i >= 0; i--) {
                const [x, y] = worldToScreen(ctx, cam.x, cam.y, pts[i][xb], pts[i][yb])
                ctx.lineTo(x, y)
            }
            ctx.closePath()
            ctx.globalAlpha = fogAlpha((pts[0].d + pts[pts.length - 1].d) / 2, vis)
            ctx.fillStyle = fill
            ctx.fill()
            ctx.globalAlpha = 1
        }

        let cam = { x: 0, y: 0 }

        // seeded roadside silhouettes (trees/rocks/bushes) — screen fx only,
        // built once per seed and cached; the sim's rng is never touched here
        const decoCache = new Map()
        const decoFor = (seed) => {
            let d = decoCache.get(seed)
            if (!d) {
                const rng = mulberry32((seed ^ 0x51dea7) | 0)
                d = []
                for (let i = 0; i < 130; i++) {
                    const r = rng()
                    d.push({
                        s: rng() * STAGE_L,
                        side: rng() < 0.5 ? -1 : 1,
                        kind: r < 0.45 ? 'tree' : r < 0.75 ? 'rock' : 'bush',
                        off: ROAD_HALF + SHOULDER + 5 + rng() * 24,
                        size: 0.6 + rng() * 0.9,
                    })
                }
                decoCache.set(seed, d)
            }
            return d
        }

        const drawWorld = (g, brake = false) => {
            const car = g.car
            const p0 = stageAt(g.stage, car.s)
            const nx0 = -Math.sin(p0.heading), ny0 = Math.cos(p0.heading)
            cam = { x: p0.x + nx0 * car.lat, y: p0.y + ny0 * car.lat }

            // night ground
            ctx.fillStyle = '#060910'
            ctx.fillRect(0, 0, W, H)
            // faint star field (static, cheap)
            ctx.fillStyle = 'rgba(200,210,235,0.05)'
            for (let i = 0; i < 24; i++) {
                const sx = ((i * 733 + 91) % W)
                const sy = ((i * 389 + 57) % H)
                ctx.fillRect(sx, sy, 1, 1)
            }

            const pts = roadPts(g)
            // fog cut: everything past it simply does not exist
            const vis = g.vis
            const visCut = LITE ? Math.ceil(vis / 8) * 8 : vis
            const visIdx = Math.max(1, Math.floor((visCut + 80) / (LITE ? 8 : 6)))

            // shoulders (gravel) and asphalt, chunked for the fog fade
            const chunk = LITE ? 3 : 2
            for (let i = 0; i < visIdx - 1; i += chunk) {
                const j = Math.min(i + chunk, visIdx - 1)
                const seg = pts.slice(i, j + 1)
                band(seg, 'lx', 'ly', 'cxL', 'cyL', '#1c1811', vis)
                band(seg, 'cxR', 'cyR', 'rx', 'ry', '#1c1811', vis)
                band(seg, 'cxL', 'cyL', 'cxR', 'cyR', '#252932', vis)
            }
            // center dashes
            ctx.lineWidth = 1
            for (let i = 0; i < visIdx - 1; i++) {
                const a = fogAlpha(pts[i].d)
                if (a <= 0.02) continue
                if (Math.floor((car.s + pts[i].d) / 26) % 2 === 0) continue
                ctx.globalAlpha = a * 0.5
                const [x1, y1] = worldToScreen(ctx, cam.x, cam.y, pts[i].cx, pts[i].cy)
                const [x2, y2] = worldToScreen(ctx, cam.x, cam.y, pts[i + 1].cx, pts[i + 1].cy)
                ctx.strokeStyle = '#a7adb8'
                ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
            }
            // reflector studs, alternating white/red every 50 units
            for (let i = 0; i < visIdx; i++) {
                const s = car.s + pts[i].d
                const a = fogAlpha(pts[i].d)
                if (a <= 0.02) continue
                const band = Math.floor(s / 50) % 2
                ctx.globalAlpha = a
                ctx.fillStyle = band ? '#c23b31' : '#dcd8cc'
                for (const side of [-1, 1]) {
                    const p = stageAt(g.stage, s)
                    const nx = -Math.sin(p.heading), ny = Math.cos(p.heading)
                    const [sx, sy] = worldToScreen(ctx, cam.x, cam.y, p.x + nx * side * (ROAD_HALF + 4), p.y + ny * side * (ROAD_HALF + 4))
                    ctx.fillRect(sx - 1, sy - 1, 2, 2)
                }
            }
            // corner chevrons on the outside, a beat before the corner;
            // they pop in — scale up over the first ~36 units they become visible
            for (const c of g.stage.corners) {
                const d = distAhead(g.stage, car.s, c.s)
                if (d > vis || d < -20) continue
                const a = fogAlpha(Math.max(0, d))
                if (a <= 0.03) continue
                const pop = 0.6 + 0.5 * Math.min(1, Math.max(0, (vis + 10 - d) / 36))
                for (let k = 0; k < 3; k++) {
                    const cs = c.s - 70 + k * 26
                    const cd = distAhead(g.stage, car.s, cs)
                    if (cd > vis) continue
                    const p = stageAt(g.stage, cs)
                    const nx = -Math.sin(p.heading), ny = Math.cos(p.heading)
                    const ox = p.x + nx * -c.dir * (ROAD_HALF + 8)
                    const oy = p.y + ny * -c.dir * (ROAD_HALF + 8)
                    const [sx, sy] = worldToScreen(ctx, cam.x, cam.y, ox, oy)
                    ctx.globalAlpha = fogAlpha(cd)
                    ctx.fillStyle = k % 2 ? '#dcd8cc' : '#c23b31'
                    const dirx = -Math.sin(p.heading + Math.PI / 2 * c.dir)
                    const diry = Math.cos(p.heading + Math.PI / 2 * c.dir)
                    const q = pop * (k === 1 ? 1.15 : 1) // middle chevron leads
                    ctx.beginPath()
                    ctx.moveTo(sx + dirx * 3 * q, sy + diry * 3 * q)
                    ctx.lineTo(sx - dirx * 2 * q - ny * 3 * q * c.dir, sy - diry * 2 * q - nx * 3 * q * c.dir)
                    ctx.lineTo(sx - dirx * 2 * q + ny * 3 * q * c.dir, sy - diry * 2 * q + nx * 3 * q * c.dir)
                    ctx.closePath()
                    ctx.fill()
                }
                // amber warning reflectors flanking the mouth of hard corners
                if (c.sev >= 2) {
                    for (let k = 0; k < 2; k++) {
                        const cs = c.s - 8 + k * 12
                        const cd = distAhead(g.stage, car.s, cs)
                        if (cd > vis || cd < -20) continue
                        const p = stageAt(g.stage, cs)
                        const nx = -Math.sin(p.heading), ny = Math.cos(p.heading)
                        const [sx, sy] = worldToScreen(ctx, cam.x, cam.y, p.x + nx * -c.dir * (ROAD_HALF + 4), p.y + ny * -c.dir * (ROAD_HALF + 4))
                        ctx.globalAlpha = fogAlpha(Math.max(0, cd))
                        ctx.fillStyle = '#ffb03a'
                        ctx.fillRect(sx - 1, sy - 1, 2, 2)
                    }
                }
            }
            ctx.globalAlpha = 1

            // roadside silhouettes + the start-line grandstand (LITE drops them)
            if (!LITE) {
                for (const it of decoFor(g.seed)) {
                    const d = distAhead(g.stage, car.s, it.s)
                    if (d > vis || d < -24) continue
                    const a = fogAlpha(Math.max(0, d)) * 0.95
                    if (a <= 0.03) continue
                    const p = stageAt(g.stage, it.s)
                    const nx = -Math.sin(p.heading), ny = Math.cos(p.heading)
                    const [sx, sy] = worldToScreen(ctx, cam.x, cam.y, p.x + nx * it.side * it.off, p.y + ny * it.side * it.off)
                    ctx.globalAlpha = a
                    const k = it.size
                    if (it.kind === 'tree') {
                        ctx.fillStyle = '#0c1119'
                        ctx.beginPath()
                        ctx.moveTo(sx, sy - 9 * k); ctx.lineTo(sx - 2.5 * k, sy); ctx.lineTo(sx + 2.5 * k, sy)
                        ctx.closePath(); ctx.fill()
                    } else if (it.kind === 'rock') {
                        ctx.fillStyle = '#10151f'
                        ctx.fillRect(sx - 2 * k, sy - 1.5 * k, 4 * k, 3 * k)
                    } else {
                        ctx.fillStyle = '#0e1420'
                        ctx.fillRect(sx - k, sy - k, 2.2 * k, 1.8 * k)
                    }
                }
                // grandstand patch beside the start line + a beacon gantry across it
                const d0 = distAhead(g.stage, car.s, 0)
                if (d0 <= vis + 16) {
                    for (let ri = 0; ri < 6; ri++) {
                        for (let ci = 0; ci < 5; ci++) {
                            const ss = 4 + ri * 8 + ci * 2.2
                            const dd = distAhead(g.stage, car.s, ss)
                            const a = fogAlpha(Math.min(dd, vis)) * 0.9
                            if (a <= 0.03) continue
                            const p = stageAt(g.stage, ss)
                            const nx = -Math.sin(p.heading), ny = Math.cos(p.heading)
                            const off = ROAD_HALF + SHOULDER + 5 + ri * 2.4
                            const [sx, sy] = worldToScreen(ctx, cam.x, cam.y, p.x + nx * off, p.y + ny * off)
                            ctx.globalAlpha = a
                            ctx.fillStyle = (ri + ci) % 4 === 0 ? '#ffd27e' : '#39415a'
                            ctx.fillRect(sx - 1, sy - 1, 2, 2)
                        }
                    }
                    const pa = fogAlpha(Math.min(d0, vis)) * 0.8
                    if (pa > 0.03) {
                        const p = stageAt(g.stage, 1)
                        const nx = -Math.sin(p.heading), ny = Math.cos(p.heading)
                        ctx.globalAlpha = pa
                        ctx.fillStyle = '#dcd8cc'
                        for (let off = -ROAD_HALF; off <= ROAD_HALF; off += 9) {
                            const [sx, sy] = worldToScreen(ctx, cam.x, cam.y, p.x + nx * off, p.y + ny * off)
                            ctx.fillRect(sx - 0.5, sy - 0.5, 1.5, 1.5)
                        }
                    }
                }
            }
            ctx.globalAlpha = 1

            // the fog wall where the road ends (a crest, not just distance)
            if (vis < FOG_RANGE - 2) {
                const end = pts[Math.min(visIdx, pts.length - 1)]
                const [ex, ey] = worldToScreen(ctx, cam.x, cam.y, end.cx, end.cy)
                const grad = ctx.createRadialGradient(ex, ey, 6, ex, ey, 90)
                grad.addColorStop(0, 'rgba(6,9,16,0.9)')
                grad.addColorStop(1, 'rgba(6,9,16,0)')
                ctx.fillStyle = grad
                ctx.fillRect(ex - 90, ey - 90, 180, 180)
            }

            // the car (screen-anchored: it IS the camera subject)
            const carSx = W / 2 + car.lat * SC
            const carSy = CY + (car.off ? Math.sin(g.tick * 0.9) * 0.7 : 0)
            const angle = p0.heading + car.align
            // headlight beams (before the car, additive); the light spills
            // farther when the road tips downhill — the bloom over a crest
            ctx.save()
            ctx.translate(carSx, carSy)
            ctx.rotate(angle)
            ctx.globalCompositeOperation = 'lighter'
            if (!LITE) {
                const down = Math.max(0, -slopeAt(g.stage, car.s))
                const reach = Math.min(260, 130 + down * 900)
                const sp = 34 * reach / 130
                const beam = ctx.createLinearGradient(6, 0, reach, 0)
                beam.addColorStop(0, `rgba(255,236,180,${(0.16 + Math.min(0.12, down * 0.8)).toFixed(3)})`)
                beam.addColorStop(1, 'rgba(255,236,180,0)')
                ctx.fillStyle = beam
                ctx.beginPath()
                ctx.moveTo(6, -2.5); ctx.lineTo(reach, -sp); ctx.lineTo(reach, sp); ctx.lineTo(6, 2.5)
                ctx.closePath(); ctx.fill()
            }
            ctx.restore()
            ctx.save()
            ctx.translate(carSx, carSy)
            ctx.rotate(angle)
            ctx.fillStyle = 'rgba(0,0,0,0.45)'
            ctx.fillRect(-5.5, -2.5, 12, 6)
            ctx.fillStyle = '#0b0d12'
            ctx.fillRect(-4.5, -4.2, 3.4, 2); ctx.fillRect(1.4, -4.2, 3.4, 2)
            ctx.fillRect(-4.5, 2.2, 3.4, 2); ctx.fillRect(1.4, 2.2, 3.4, 2)
            // lean: the body rolls toward the outside of the turn (wheels planted)
            ctx.translate(0, -Math.max(-1.2, Math.min(1.2, car.align * 1.1 * (car.v / VMAX))))
            ctx.fillStyle = '#2f5fc4'
            ctx.fillRect(-6, -3, 12, 6)
            ctx.fillStyle = '#27488f'
            ctx.fillRect(-6.6, -3, 1.4, 6)
            ctx.fillStyle = '#dfe4ee'
            ctx.fillRect(-2.6, -2, 5.2, 4)
            ctx.fillStyle = '#ffe9b0'
            ctx.fillRect(4.8, -2.6, 1.4, 1.6); ctx.fillRect(4.8, 1, 1.4, 1.6)
            ctx.fillStyle = '#c23b31'
            ctx.fillRect(-6.4, -2.4, 1, 1.6); ctx.fillRect(-6.4, 0.8, 1, 1.6)
            if (brake) { // brake flare: hot tails + a red wash behind the bumper
                ctx.fillStyle = '#ff7a66'
                ctx.fillRect(-6.6, -2.6, 1.4, 2); ctx.fillRect(-6.6, 0.6, 1.4, 2)
                ctx.globalCompositeOperation = 'lighter'
                ctx.fillStyle = 'rgba(255,70,45,0.22)'
                ctx.fillRect(-11, -3.2, 4.4, 6.4)
                ctx.globalCompositeOperation = 'source-over'
            }
            ctx.restore()

            // gravel roost behind the wheels (screen space, dies in ~0.5 s)
            for (let i = spray.length - 1; i >= 0; i--) {
                const p = spray[i]
                p.x += p.vx; p.y += p.vy; p.vx *= 0.92; p.vy *= 0.92
                if (--p.life <= 0 || p.x < -4 || p.x > W + 4 || p.y < -4 || p.y > H + 4) { spray.splice(i, 1); continue }
                ctx.globalAlpha = Math.min(1, p.life / 14) * 0.9
                ctx.fillStyle = p.life % 3 ? '#6a5a3d' : '#4a3f2c'
                ctx.fillRect(p.x - 1, p.y - 1, 2, 2)
            }
            ctx.globalAlpha = 1
        }

        // ---- HUD ---------------------------------------------------------------
        const drawHud = (g) => {
            const st = state(g)
            // pace card: the ONLY thing the driver knows about corners
            ctx.fillStyle = 'rgba(4,7,13,0.72)'
            ctx.fillRect(6, 6, 118, 14 + Math.min(4, g.card.length) * 13)
            ctx.font = 'bold 8px monospace'
            ctx.fillStyle = '#8b93a3'
            ctx.textAlign = 'left'
            ctx.fillText('NOTES', 12, 15)
            g.card.slice(-4).forEach((n, i) => {
                const age = g.tick - n.t
                const a = Math.max(0.25, Math.min(1, 1.4 - age / 500))
                // 1 unit = 0.15 m (the same conversion as the km/h readout)
                const d = n.atS == null ? null : Math.round(distAhead(g.stage, g.car.s, n.atS) * 0.15)
                const label = callLabel({ dir: n.dir, sev: n.sev })
                ctx.globalAlpha = a
                ctx.fillStyle = n.dir < 0 ? '#7ec8ff' : n.dir > 0 ? '#ffd27e' : '#dcd8cc'
                ctx.font = 'bold 10px monospace'
                ctx.fillText(label, 12, 28 + i * 13)
                ctx.fillStyle = '#8b93a3'
                ctx.font = '9px monospace'
                if (d != null) ctx.fillText(`${Math.max(0, Math.round(d))}m`, 62, 28 + i * 13)
                if (n.via === 'voice') { ctx.fillStyle = '#7ee0a3'; ctx.fillText('♪', 96, 28 + i * 13) }
            })
            ctx.globalAlpha = 1
            // lap + time
            ctx.textAlign = 'right'
            ctx.font = 'bold 10px monospace'
            ctx.fillStyle = '#dcd8cc'
            ctx.fillText(`LAP ${Math.min(g.lapsDone + 1, g.LAPS)}/${g.LAPS}`, W - 10, 16)
            ctx.font = 'bold 12px monospace'
            ctx.fillText(fmtTime(st.score), W - 10, 30)
            if (best.t != null) {
                ctx.font = '9px monospace'
                ctx.fillStyle = '#8b93a3'
                ctx.fillText(`BEST ${fmtTime(best.t)}`, W - 10, 42)
            }
            // lap-line banner: the crossing + the split of the lap just done
            if (banner.until > g.tick) {
                const flash = (g.tick % 20) < 13
                ctx.fillStyle = 'rgba(4,7,13,0.78)'
                ctx.fillRect(W / 2 - 62, 60, 124, 26)
                ctx.textAlign = 'center'
                ctx.font = 'bold 12px monospace'
                ctx.fillStyle = '#ffd27e'
                ctx.fillText(banner.main, W / 2, 72)
                ctx.font = 'bold 10px monospace'
                ctx.fillStyle = flash ? '#7ec8ff' : '#4f85b8'
                ctx.fillText(banner.sub, W / 2, 82)
                ctx.textAlign = 'right'
            }
            // speed
            ctx.textAlign = 'right'
            ctx.font = 'bold 14px monospace'
            ctx.fillStyle = '#dcd8cc'
            const kmh = Math.round(g.car.v * KM_PER_UNIT)
            ctx.fillText(`${kmh}`, W - 34, H - 12)
            ctx.font = '8px monospace'
            ctx.fillStyle = '#8b93a3'
            ctx.fillText('km/h', W - 10, H - 12)
            // speed bar
            ctx.fillStyle = 'rgba(4,7,13,0.72)'
            ctx.fillRect(W - 108, H - 30, 64, 6)
            ctx.fillStyle = g.car.v > VMAX * 0.85 ? '#c23b31' : '#7ec8ff'
            ctx.fillRect(W - 107, H - 29, 62 * (g.car.v / VMAX), 4)
            // co-driver chip
            ctx.textAlign = 'left'
            ctx.font = '9px monospace'
            const coLabel = voice.on ? 'CO-D: VOICE' : g.co.kind === 'human' ? 'CO-D: KEYS' : 'CO-D: CPU'
            ctx.fillStyle = 'rgba(4,7,13,0.72)'
            ctx.fillRect(6, H - 24, 86, 18)
            ctx.fillStyle = '#8b93a3'
            ctx.fillText(coLabel, 11, H - 15)
            if (voice.on) {
                ctx.fillStyle = voice.ok ? '#7ee0a3' : '#c23b31'
                ctx.fillText(voice.said ? voice.said.slice(0, 12) : 'listening…', 11, H - 8)
            }
            // hint, first seconds only
            if (g.tick < hintUntil.t) {
                ctx.textAlign = 'center'
                ctx.font = '9px monospace'
                ctx.fillStyle = 'rgba(220,216,204,0.75)'
                ctx.fillText('C: co-driver keys · V: voice · ? help', W / 2, H - 10)
            }
            // the say() line: one message, never over the HUD corners
            if (performance.now() < sayUntil) {
                ctx.textAlign = 'center'
                ctx.font = 'bold 10px monospace'
                ctx.fillStyle = '#ffd27e'
                ctx.fillText(sayText, W / 2, 52)
            }
            ctx.textAlign = 'left'
        }

        const drawAttract = (g) => {
            drawWorld(g)
            // dim the world so the title owns the frame
            ctx.fillStyle = 'rgba(4,6,12,0.55)'
            ctx.fillRect(0, 0, W, H)
            ctx.textAlign = 'center'
            ctx.font = 'bold 26px monospace'
            ctx.fillStyle = '#dcd8cc'
            ctx.fillText('RALLY CO-DRIVER', W / 2, 96)
            ctx.font = 'bold 10px monospace'
            ctx.fillStyle = '#7ec8ff'
            ctx.fillText('AN ORIGINAL NIGHT RALLY · 2 SEATS · 1 PAIR OF EARS', W / 2, 116)
            // one message at a time (ART rule), cycling
            const msg = ATTRACT_MSGS[Math.floor(performance.now() / 2600) % ATTRACT_MSGS.length]
            ctx.font = 'bold 11px monospace'
            ctx.fillStyle = '#ffd27e'
            ctx.fillText(msg, W / 2, 168)
            ctx.font = '10px monospace'
            ctx.fillStyle = 'rgba(220,216,204,0.8)'
            ctx.fillText('PRESS ANY KEY · TAP TO START', W / 2, 208)
            ctx.textAlign = 'left'
        }

        const drawOver = (g) => {
            drawWorld(g)
            ctx.fillStyle = 'rgba(4,6,12,0.7)'
            ctx.fillRect(0, 0, W, H)
            const st = state(g)
            ctx.textAlign = 'center'
            ctx.font = 'bold 22px monospace'
            ctx.fillStyle = '#dcd8cc'
            ctx.fillText('STAGE COMPLETE', W / 2, 74)
            ctx.font = 'bold 18px monospace'
            ctx.fillStyle = '#7ec8ff'
            ctx.fillText(fmtTime(st.score), W / 2, 104)
            if (best.t != null && best.t === st.score) {
                ctx.font = 'bold 10px monospace'
                ctx.fillStyle = '#ffd27e'
                ctx.fillText('NEW BEST', W / 2, 120)
            }
            const s = st.stats
            ctx.font = '11px monospace'
            ctx.fillStyle = '#dcd8cc'
            ctx.fillText(`NOTES ${s.called} · OK ${s.correct} · LATE ${s.late} · MISSED ${s.missed}`, W / 2, 148)
            ctx.fillText(`OFF-TRACK ${Math.round(s.offTicks / 60)}s`, W / 2, 166)
            ctx.font = '10px monospace'
            ctx.fillStyle = 'rgba(220,216,204,0.8)'
            ctx.fillText('SPACE TO RUN IT AGAIN', W / 2, 204)
            ctx.textAlign = 'left'
        }

        // 3-2-1-GO start lights: three lamps fill, GO flashes green
        const drawStartLights = () => {
            const n = cd.t > 180 ? 3 : cd.t > 120 ? 2 : cd.t > 60 ? 1 : 0
            ctx.fillStyle = 'rgba(4,7,13,0.78)'
            ctx.fillRect(W / 2 - 40, 22, 80, 44)
            for (let i = 0; i < 3; i++) {
                ctx.fillStyle = n === 0 ? '#41d98a' : i < n ? '#c23b31' : 'rgba(194,59,49,0.22)'
                ctx.beginPath()
                ctx.arc(W / 2 - 16 + i * 16, 36, 4.5, 0, Math.PI * 2)
                ctx.fill()
            }
            ctx.textAlign = 'center'
            ctx.font = 'bold 20px monospace'
            ctx.fillStyle = n === 0 ? '#41d98a' : '#dcd8cc'
            ctx.fillText(n === 0 ? 'GO' : String(n), W / 2, 60)
            ctx.textAlign = 'left'
        }

        const drawAll = () => {
            if (screenRef.cur === 'attract') drawAttract(attract.g)
            else if (screenRef.cur === 'over') drawOver(play.g)
            else {
                drawWorld(play.g, keys.down || keys.a || cd.t > 0)
                drawHud(play.g)
                if (cd.t > 0) drawStartLights()
            }
        }

        const loop = (now) => {
            raf = requestAnimationFrame(loop)
            const dt = now - last
            last = now
            if (contractHoldsLoop()) { acc = 0; drawAll(); return }
            acc += Math.min(dt, 250)
            while (acc >= SIM_MS) { acc -= SIM_MS; simStep() }
            drawAll()
        }
        raf = requestAnimationFrame(loop)

        // ---- the contract -------------------------------------------------------
        exposeGame({
            id: 'rally-co-driver',
            players: 2,
            method: 'dpad',
            buttons: ['up', 'down', 'left', 'right', 'a'],
            reads: ['up', 'down', 'left', 'right', 'a'],
            sources: () => [{ kind: 'model' }, { kind: play.g.co.kind }],
            reset: (seed, players = 2) => {
                seedRef.cur = ((seed ?? 1) >>> 0) % 997 || 1
                play.g = createSim(seedRef.cur, players)
                play.g.co.kind = players >= 2 ? 'cpu' : 'off'
                voiceStop()
                keys.up = keys.down = keys.left = keys.right = keys.a = false
                offWas = false
                cd.t = 0 // harness starts under the lights already green
                spray.length = 0
                banner.until = 0
                crestArmed = true
                setScreenBoth('play')
            },
            tick: (pad, pads) => {
                const g = play.g
                const d = { up: !!pad.up, down: !!pad.down, left: !!pad.left, right: !!pad.right, a: !!pad.a }
                const c = pads && pads[1] != null ? pads[1] : coPad(g)
                tickSim(g, [d, c])
            },
            state: () => state(play.g),
            canvas: () => canvas,
        })
        window.__rallyTest = {
            screen: () => screenRef.cur,
            state: () => state(play.g),
            hash: () => stateHash(play.g),
            gs: () => play.g,
            start: () => startRace(),
            // headless voice: the same path speechListen feeds (#1287's law —
            // CI has no speech engine, the downstream of the words is proven)
            voiceCall: (text) => {
                const call = parseCoCall(text)
                if (call) applyCallEvent(play.g, call, 'voice')
                return call
            },
            coCall: (call) => applyCallEvent(play.g, call, 'human'),
        }

        return () => {
            cancelAnimationFrame(raf)
            window.removeEventListener('keydown', kd)
            window.removeEventListener('keyup', ku)
            canvas.removeEventListener('pointerdown', tap)
            voiceStop()
            unexposeGame()
            delete window.__rallyTest
            canvas.remove()
        }
    }, [])

    return (
        <div ref={wrapRef} className="relative w-full h-full flex items-center justify-center bg-black">
            {screen === 'play' && !paused && <VirtualControls visible secondAction={undefined} />}
            {paused && <PauseOverlay game={G} onResume={() => { pausedRef.current = false; setPaused(false) }} />}
            {voiceUi && (
                <div className="absolute top-2 right-2 rounded bg-black/70 px-2 py-1 text-[10px] font-mono">
                    <span className={voiceUi.ok ? 'text-emerald-300' : 'text-red-400'}>
                        MIC {voiceUi.on ? 'ON' : 'OFF'}{voiceUi.label ? ` · ${voiceUi.label}` : ''}
                    </span>
                </div>
            )}
        </div>
    )
}
