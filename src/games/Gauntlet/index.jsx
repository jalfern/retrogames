// GAUNTLET — the overhead cabinet: a scrolling top-down view that follows the
// hero across four pillar-hall mazes, built on the SHARED engine
// (../Gauntlet/sim.js et al — camera-agnostic; FOUR HALLS uses the same sim
// in first person). 8-way stick: each arrow sets facing AND moves; the sword
// sweeps the arc you face, arrows fly down it. Swarms pour from generators,
// food is the economy, keys open the exit, and when the timer dies so does
// DEATH. All art and audio synthesized at runtime.
//
// Layout: 1. setup 2. overhead render 3. panel/HUD 4. loop
// 5. input 6. DEV hook + DebugKit 7. React.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import Lobby from '../../components/Lobby'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { LEVELS, W, H, HEROES, HERO_ORDER } from './levels.js'
import { makeGame, step, stateHash, CFG, doorAt, visualChar } from './sim.js'
import { plan, decide, partnerPad } from './planner.js'
import { buildSprites, MATERIALS } from './art.js'
import { buzz, narratorKind, STAIRS_FANFARE } from './sound.js'
import { VW, VH, PX, MAP_CELL, MAP_MARGIN, viewRect, mapMonsters, stairsPulse } from './minimap.js'
import { selfHero, otherHero } from './seat.js'
import { lowHpPulse, swordTrail, isDraining, deathTint } from './juice.js'
import { warpGlow, nearArch, trapWarn, stunStars, teleColor, teleSpin, revealFade, debrisVel, DEBRIS_N, FX_TONES } from './fx.js'
import { walkFrame, hitFlashAlpha, deathProgress } from './hero.js'
import { torch, litColor, mortarTones, css } from './walls.js'
import { cardCenter, heroAt } from './select.js'
import { attractFrame, DIM } from './attract.js'
import { p2From } from './p2input.js'
import { slotPad, connectedSlots } from '../../utils/onePad'
import { makeSlot, setSlotKind } from '../../utils/slotSources'
import { createLockStep } from '../../utils/lockstep'
import { createLobby, lobbyRole, relayFromQuery, decodeCode, seatModel } from '../../utils/lobby.js'
import { exposeGame, unexposeGame, contractHoldsLoop } from '../../utils/gameContract'

const PW = 64, HT = 40
const CW = VW + PW, CH = VH + HT
const SIM_MS = 1000 / 60
let proven = null
const provenRun = () => { if (!proven) proven = plan(2, { topDown: true, maxTicks: 60000 }); return proven }

const hash2 = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296 }

const GauntletGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [netUi, setNetUi] = useState({ phase: 'idle', code: '', info: '', role: null })
    const netJoinRef = useRef(null)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const overAtRef = useRef(0)
    const setMode = useCallback((m) => { screenRef.current = m; setScreen(m) }, [])
    const hudRef = useRef({})
    const setHud = (k) => (el) => { hudRef.current[k] = el }
    const board = () => { try { return JSON.parse(localStorage.getItem('gauntlet.board') || '[]') } catch { return [] } }

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const SP = buildSprites()
        const canvas = document.createElement('canvas')
        canvas.dataset.gauntletStage = '1'
        canvas.width = CW; canvas.height = CH
        canvas.className = 'block w-full h-full'
        canvas.style.imageRendering = 'pixelated'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false

        let gs = makeGame(0, 'warrior', { topDown: true })
        let raf = 0, last = 0, acc = 0
        let demoAt = 0, toast = 0, toastMsg = '', shake = 0, flash = 0, wflash = 0, naPrev = false, selectHero = 0, selectHero2 = 1
        const keys = { l: false, r: false, u: false, d: false, swordEdge: false, arrowEdge: false }
        const p2 = { l: false, r: false, u: false, d: false, swordEdge: false }
        const evLog = []
        const parts = []
        const debris = []
        const revealAt = new Map()

        // ------------------------------------------------------------ online ----
        // #531 pilot, riding the #1039 shared lobby: ?net=host /
        // ?net=join&room=CODE / ?relay=ws(s)://host. The join flow, the waiting
        // room and the reconnect ladder are the shared ones (src/utils/lobby.js)
        // — identical words and layout in SSX and Blob Battle. Gauntlet keeps
        // its own lockstep pad/hash lock (the #531 determinism law) and the
        // hero payload the host broadcasts at kickoff.
        // Canonical seats on BOTH boxes: hero = host's entity, partner = the
        // guest's — so both sims consume the identical pad streams and their
        // stateHashes must agree. The guest's camera/HUD follow gs.partner so
        // each player watches their own hero.
        const q = new URLSearchParams(window.location.search)
        const netRole = lobbyRole(window.location.search)
        const netRelay = relayFromQuery(window.location.search)
        const net = {
            phase: netRole === 'host' ? 'connecting' : netRole === 'guest' ? (decodeCode(q.get('room')) ? 'connecting' : 'entry') : 'idle',
            role: netRole,
            code: netRole === 'host' ? '' : decodeCode(q.get('room')),
            peer: false,
            lock: null,
            tamper: false,
            desyncTick: 0,
            lastHash: '',
            info: '',
            joinHref: '',
            room: null,
            lobby: null,
        }
        const netPush = () => setNetUi({
            phase: net.phase, code: net.code, role: net.role, joinHref: net.joinHref,
            info: net.desyncTick ? `tick ${net.desyncTick}` : (net.info || ''),
            seats: net.role ? seatModel(2, net.room ? net.room.slots : (net.role === 'host' ? [0] : [])) : null,
        })
        if (netRole) netPush()

        const makeTransport = (url) => {
            const ws = new WebSocket(url)
            return {
                send: (s) => { try { if (ws && ws.readyState === 1) ws.send(s) } catch { /* gone */ } },
                onMessage: (cb) => { ws.onmessage = (ev) => cb(ev.data) },
                onClose: (cb) => { ws.onclose = () => cb() },
                close: () => { try { if (ws) ws.close() } catch { /* gone */ } },
            }
        }

        const netEnd = (phase) => {
            net.phase = phase
            netPush()
        }

        net.lobby = netRole ? createLobby({
            slug: 'gauntlet',
            cap: 2,
            relay: netRelay,
            shareRelay: !!q.get('relay'),
            makeTransport,
            onState: (s) => { net.code = s.code || net.code; net.joinHref = s.joinHref; net.info = s.info; if (s.phase !== 'racing') net.phase = s.phase; else if (net.role === 'guest') net.phase = 'play'; netPush() },
            onRoster: ({ slots }) => {
                net.peer = slots.length >= 2
                if (net.peer && (net.phase === 'gone' || net.phase === 'offline')) { net.phase = 'waiting'; net.info = '' }
                netPush()
            },
            on: {
                gone: () => {
                    if (net.phase === 'play' || net.phase === 'waiting') { net.phase = 'gone'; netPush() }
                    audioController.playSweep(660, 180, 0.25, 'square', 0.07)
                },
                hs: (m) => {
                    const r = net.lock && net.lock.gotHash(m.k, m.h)
                    if (r && r.desync !== undefined) netDesync(r.desync)
                },
                pad: (m) => {
                    if (net.lock) net.lock.gotPad(m.k, m.p)
                },
            },
            onStart: (m) => { if (net.role === 'guest') netBegin(m.seed | 0, m.hero || 'warrior', m.peerHero || 'valkyrie') },
        }) : null
        net.room = net.lobby ? net.lobby.room : null

        const netDesync = (k) => {
            net.desyncTick = k
            net.phase = 'desync'
            audioController.playNoise(0.4, 0.12)
            netPush()
        }

        const netStartLock = () => {
            net.lock = createLockStep({ send: (m) => { if (net.room) net.room.send(m.t, m) } })
            keys.l = keys.r = keys.u = keys.d = false
            keys.swordEdge = false; keys.arrowEdge = false
            seatPrev.a = false
            setSlotKind(p2slot, 'remote')
        }

        const netBegin = (seed, hero, peerHero) => {
            gs = makeGame(seed, hero, { partner: true, topDown: true, partnerKey: peerHero })
            gs.partnerOn = true
            gs.partnerMode = 'human'
            gs.partnerHuman = false
            demoAt = 0
            netStartLock()
            net.phase = 'play'
            netPush()
            setMode('play')
        }

        const netLocalPad = () => ({ l: keys.l, r: keys.r, u: keys.u, d: keys.d, s: keys.swordEdge, a: keys.arrowEdge })
        const selfEnt = () => selfHero(gs, net.role)
        const selfKey = () => (net.role === 'guest' && gs.partnerKey ? gs.partnerKey : gs.heroKey)
        // the OTHER player's hero on this screen: the host sees the guest (partner),
        // the guest sees the host (hero) — both boxes must draw whoever isn't self (#554)
        const otherEnt = () => otherHero(gs, net.role)

        const netTick = () => {
            const k = gs.tick
            net.lock.pumpTo(k + net.lock.delay, () => {
                const p = netLocalPad()
                if (net.tamper) { p.l = !p.l; p.r = p.l ? false : p.r; net.tamper = false }
                if (p.s) keys.swordEdge = false
                if (p.a) keys.arrowEdge = false
                return p
            })
            if (!net.lock.ready(k)) {
                net.lock.stall()
                acc = 0
                return
            }
            const [lp, rp] = net.lock.pads(k)
            const heroPad = net.role === 'host' ? lp : rp
            const partnerPad = net.role === 'host' ? rp : lp
            const partnerAlive = gs.partner && !gs.partner.down
            const pInp = partnerAlive ? { left: partnerPad.l, right: partnerPad.r, fwd: partnerPad.u, back: partnerPad.d, sword: partnerPad.s } : null
            doSim(
                { left: heroPad.l, right: heroPad.r, fwd: heroPad.u, back: heroPad.d, sword: heroPad.s, arrow: heroPad.a },
                pInp
            )
            if (gs.tick % net.lock.hashEvery === 0) {
                const r = net.lock.hash(gs.tick, stateHash(gs))
                if (r && r.desync !== undefined) netDesync(r.desync)
            }
            net.lock.prune(k)
        }

        const say = (m, kind) => {
            toastMsg = m; toast = 150
            const sig = buzz(kind || narratorKind(m))
            sig.notes.forEach((f, i) => audioController.playTone(f, 0.08, sig.wave, 0.05, i * 0.07))
        }
        const burst = (px, py, n, col) => {
            for (let i = 0; i < n; i++) {
                const a = Math.random() * Math.PI * 2, sp = 0.5 + Math.random() * 2.2
                parts.push({ x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, col })
            }
        }

        const handleEvents = (evts) => {
            for (const e of evts) evLog.push({ ...e, tick: gs.tick })
            if (evLog.length > 240) evLog.splice(0, evLog.length - 240)
            for (const e of evts) {
                if (e.type === 'say') say(e.text)
                else if (e.type === 'sword') { audioController.playSweep(e.hit ? 180 : 320, e.hit ? 90 : 180, 0.07, 'sawtooth', 0.05) }
                else if (e.type === 'shoot') audioController.playSweep(880, 1500, 0.06, 'square', 0.04)
                else if (e.type === 'monsterHit') { audioController.playNoise(0.04, 0.05); burst(VW / 2, VH / 2, 4, '#ffd23f') }
                else if (e.type === 'kill') { audioController.playSweep(520, 120, 0.18, 'square', 0.07); burst(VW / 2, VH / 2, 8, e.potion ? '#8fb0ff' : '#ff8a5d') }
                else if (e.type === 'hit') { audioController.playNoise(0.09, 0.09); audioController.playTone(120, 0.1, 'square', 0.08); shake = 5; flash = 6 }
                else if (e.type === 'cast') audioController.playSweep(240, 480, 0.14, 'sawtooth', 0.05)
                else if (e.type === 'drain') { audioController.playTone(70 + (gs.tick % 3) * 10, 0.05, 'triangle', 0.05); flash = 3 }
                else if (e.type === 'pickup') {
                    if (e.t === 'food') audioController.playSweep(330, 660, 0.18, 'square', 0.07)
                    else if (e.t === 'key') { audioController.playTone(1320, 0.08, 'square', 0.06); audioController.playTone(1760, 0.1, 'square', 0.05) }
                    else if (e.t === 'potion') { audioController.playSweep(440, 1760, 0.35, 'square', 0.08); flash = 10 }
                    else if (e.t === 'gold') audioController.playTone(990 + (e.v || 0), 0.06, 'square', 0.05)
                }
                else if (e.type === 'keyUsed') audioController.playSweep(660, 990, 0.12, 'triangle', 0.06)
                else if (e.type === 'doorOpen') audioController.playSweep(160, 90, 0.12, 'sawtooth', 0.05)
                else if (e.type === 'wallHit') audioController.playTone(150, 0.04, 'square', 0.05)
                else if (e.type === 'wallBreak') { audioController.playNoise(0.2, 0.09); FX_TONES.debris.notes.forEach((f, i) => audioController.playTone(f, 0.07, 'triangle', 0.05, i * 0.05)); shake = 5; for (let i = 0; i < DEBRIS_N; i++) { const v = debrisVel(i); debris.push({ x: e.x + 0.5, y: e.y + 0.5, vx: v.vx * 0.05, vy: v.vy * 0.05, g: v.g * 0.05, t: 0 }) } }
                else if (e.type === 'trapClose') { audioController.playTone(80, 0.14, 'square', 0.09); shake = 4 }
                else if (e.type === 'trapOpen') audioController.playSweep(90, 160, 0.12, 'triangle', 0.04)
                else if (e.type === 'teleport') { audioController.playSweep(300, 1500, 0.22, 'sine', 0.07); wflash = 5 }
                else if (e.type === 'stun') audioController.playSweep(220, 90, 0.2, 'sawtooth', 0.06)
                else if (e.type === 'slam') { audioController.playTone(70, 0.16, 'square', 0.1); shake = 6 }
                else if (e.type === 'genHit') audioController.playTone(200, 0.05, 'square', 0.05)
                else if (e.type === 'genKill') { audioController.playNoise(0.25, 0.1); audioController.playSweep(300, 80, 0.3, 'sawtooth', 0.08); shake = 8 }
                else if (e.type === 'spawn') audioController.playSweep(80, 220, 0.14, 'triangle', 0.04)
                else if (e.type === 'deathSpawn') { audioController.playSweep(220, 55, 0.8, 'sawtooth', 0.09) }
                else if (e.type === 'death') { audioController.playDeath(); shake = 9; flash = 14 }
                else if (e.type === 'levelClear') { if (e.warp != null) { FX_TONES.warpTake.notes.forEach((f, i) => audioController.playTone(f, 0.1, 'sine', 0.07, i * 0.06)); burst(VW / 2, VH / 2, 14, '#5dff8f'); wflash = 6 } STAIRS_FANFARE.forEach((f, i) => audioController.playTone(f, 0.13, 'square', 0.08, i * 0.11)); say(LEVELS[e.level].name.replace(/^LEVEL \d+ · /, '') + ' CLEARED') }
                else if (e.type === 'level') audioController.playSweep(220, 440, 0.3, 'triangle', 0.07)
                else if (e.type === '1up') audioController.playSweep(440, 1760, 0.5, 'square', 0.08)
                else if (e.type === 'respawn') audioController.playSweep(110, 330, 0.3, 'triangle', 0.06)
                else if (e.type === 'win') { audioController.playSweep(220, 1760, 0.9, 'square', 0.1); shake = 10 }
            }
        }

        const finish = (win) => {
            const sc = gs.score
            if (win) localStorage.setItem('gauntlet.board', JSON.stringify([...board(), { score: sc, date: new Date().toISOString().slice(2, 10) }].sort((a, b) => b.score - a.score).slice(0, 8)))
            overAtRef.current = performance.now()
            if (net.role && net.phase === 'play') netEnd('over')
            setMode('over')
        }

        const doSim = (inp, pInp = null) => {
            step(gs, inp, pInp)
            handleEvents(gs.events.splice(0))
            const na = nearArch(gs)
            if (na && !naPrev) FX_TONES.warpNear.notes.forEach((f, i) => audioController.playTone(f, 0.09, 'triangle', 0.05, i * 0.07))
            naPrev = na
            if (gs.end) finish(gs.end === 'win')
        }

        const tickDemo = () => {
            const run = provenRun()
            if (demoAt >= run.script.length) { gs = makeGame(2, 'warrior', { topDown: true }); demoAt = 0; return }
            doSim(run.script[demoAt++])
            if (gs.end) { gs = makeGame(2, 'warrior', { topDown: true }); demoAt = 0 }
        }

        const p2Prev = { a: false, b: false }
        const p2Sel = { l: false, r: false, a: false }
        // #494 seat 2 is a SLOT: off / human / cpu, model via the contract.
        // doFrameSim asks the slot for its pad each tick and folds it into the
        // partner input with the same edge rules a gamepad gets — human, cpu
        // and a driven model all arrive as THE one pad and are treated alike.
        const p2slot = makeSlot('off', { padIndex: 2 })
        const seatPrev = { a: false }
        let modelP2 = null
        const syncSeat = () => setSlotKind(p2slot, gs.partnerHuman ? 'human' : gs.partnerOn ? 'cpu' : 'off')
        const padToInp = (pad, prev) => ({
            left: !!pad.left, right: !!pad.right, fwd: !!pad.up, back: !!pad.down,
            sword: !!pad.a && !prev.a,
        })
        // P2 on the second pad at the hero screen: left/right pick the hero,
        // A claims the slot (flips the partner to human) — mirrors WASD+F.
        const pollP2Select = () => {
            const s = slotPad(2, 'stick')
            if (s.left && !p2Sel.l) selectHero2 = (selectHero2 + 3) % 4
            if (s.right && !p2Sel.r) selectHero2 = (selectHero2 + 1) % 4
            if (s.a && !p2Sel.a && gs.partnerMode !== 'human') gs.partnerMode = 'human'
            p2Sel.l = s.left; p2Sel.r = s.right; p2Sel.a = s.a
        }

        const doFrameSim = () => {
            if (net.phase === 'play') { netTick(); return }
            const sc = screenRef.current
            if (sc === 'attract' || sc === 'select') { if (sc === 'select') pollP2Select(); tickDemo(); return }
            if (sc !== 'play') return
            let pInp = null
            if (gs.partnerOn && gs.partner && !gs.partner.down) {
                syncSeat()
                if (modelP2) {
                    pInp = padToInp(modelP2, seatPrev)
                    seatPrev.a = !!modelP2.a
                } else if (p2slot.kind === 'cpu') {
                    const raw = partnerPad(gs, seatPrev.a)
                    pInp = { left: raw.left, right: raw.right, fwd: raw.up, back: raw.down, sword: raw.a }
                    seatPrev.a = raw.a
                } else {
                    const m = p2From(p2, slotPad(2, 'stick'), p2Prev)
                    p2Prev.a = m.a; p2Prev.b = m.b
                    pInp = { left: m.left, right: m.right, fwd: m.fwd, back: m.back, sword: m.sword }
                    seatPrev.a = false
                }
            }
            doSim({ left: keys.l, right: keys.r, fwd: keys.u, back: keys.d, sword: keys.swordEdge, arrow: keys.arrowEdge }, pInp)
            keys.swordEdge = false
            keys.arrowEdge = false
            p2.swordEdge = false
        }

        // ---------------------------------------------------------------- render ----
        const text = (s, x, y, size, col, glow, align = 'center') => {
            ctx.font = `bold ${size}px monospace`
            ctx.textAlign = align
            if (glow) { ctx.shadowColor = col; ctx.shadowBlur = glow }
            ctx.fillStyle = col
            ctx.fillText(s, x, y)
            ctx.shadowBlur = 0
        }

        const cell = (c, r) => visualChar(gs, c, r)

        const sprite = (name, wx, wy, size, wob = true, frame = -1, white = false) => {
            const frames = white ? (SP.__flash && SP.__flash[name]) : SP[name]
            if (!frames || !frames.length) return
            const img = frame >= 0 ? frames[frame] : frames[wob ? (gs.tick >> 3) % frames.length : 0]
            const s = size / img.height
            ctx.drawImage(img, Math.round(wx - (img.width * s) / 2), Math.round(wy - (img.height * s) / 2), Math.round(img.width * s), Math.round(img.height * s))
        }

        const drawView = () => {
            const h = selfEnt()
            const mat = MATERIALS[gs.levelData.material]
            // #524 — the shared cabinet frames BOTH heroes, so the drawn edge is
            // the same window the sim walls players into (host and guest agree).
            const { camX, camY } = gs.topDown ? viewRect(gs.hero, gs.partner) : viewRect(h)
            ctx.fillStyle = '#05050c'
            ctx.fillRect(0, 0, VW, VH)
            const c0 = Math.floor(camX / PX), r0 = Math.floor(camY / PX)
            const c1 = Math.min(W - 1, c0 + Math.ceil(VW / PX) + 1), r1 = Math.min(H - 1, r0 + Math.ceil(VH / PX) + 1)
            // floor first, then wall blocks on top (raised by 2px face + shadow)
            for (let r = r0; r <= r1; r++) {
                for (let c = c0; c <= c1; c++) {
                    const ch = cell(c, r)
                    if (ch === '#') continue
                    const x = Math.round(c * PX - camX), y = Math.round(r * PX - camY)
                    const n = hash2(c, r)
                    ctx.fillStyle = n < 0.5 ? '#1a1723' : '#171420'
                    ctx.fillRect(x, y, PX, PX)
                    ctx.fillStyle = 'rgba(255,255,255,0.035)'
                    ctx.fillRect(x + 2, y + 2, PX - 4, 1)
                    if (n > 0.82) { ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(x + 3 + Math.floor(n * 9), y + 6 + Math.floor(n * 7), 2, 1) }
                    if (gs.levelData.grid[r][c] === 'h' && gs.revealed.has(r * W + c)) {
                        // a revealed false wall grinds open over a few frames, with
                        // a low stone-on-stone grind below the door tone (#973)
                        const rk = gs.level * W * H + r * W + c
                        if (!revealAt.has(rk)) {
                            revealAt.set(rk, gs.tick)
                            FX_TONES.grind.notes.forEach((f, i) => audioController.playTone(f, 0.12, 'square', 0.05, i * 0.06))
                        }
                        const op = revealFade(revealAt.get(rk), gs.tick)
                        if (op > 0) {
                            const L = torch(c + 0.5 - h.x, r + 0.5 - h.y)
                            ctx.globalAlpha = op
                            ctx.fillStyle = css(litColor((c + r) % 2 === 0 ? mat.dark : mat.base, L))
                            ctx.fillRect(x, y, PX, PX)
                            ctx.fillStyle = css(litColor(mat.mortar, L))
                            ctx.fillRect(x, y + 8, PX, 1)
                            ctx.globalAlpha = 1
                        }
                    }
                    if (ch === 'X') {
                        ctx.fillStyle = '#0e2e42'
                        ctx.fillRect(x + 2, y + 2, PX - 4, PX - 4)
                        for (let st = 0; st < 3; st++) {
                            ctx.fillStyle = st === ((gs.tick >> 3) % 3) ? '#54c8ff' : '#1d5a7d'
                            ctx.fillRect(x + 3 + st * 3, y + PX - 5 - st * 4, PX - 6 - st * 2, 3)
                        }
                    }
                    if (ch === 'W') {
                        // warp arch: the jump is painted on the floor; a dead arch
                        // (target beyond the quest) shows bricked and dark; a live
                        // one breathes green on a slow pulse (#973)
                        const wd = (gs.levelData.warps || []).find((v) => v.x === c && v.y === r)
                        const live = wd && wd.to < gs.levelCount
                        const glow = warpGlow(gs.tick)
                        ctx.fillStyle = live ? '#123528' : '#241d12'
                        ctx.fillRect(x + 1, y + 1, PX - 2, PX - 2)
                        ctx.fillStyle = live ? '#2f9d5f' : '#4a3f2a'
                        ctx.fillRect(x + 2, y + 2, PX - 4, 2)
                        ctx.fillRect(x + 2, y + 2, 2, PX - 4); ctx.fillRect(x + PX - 4, y + 2, 2, PX - 4)
                        if (live) {
                            ctx.fillStyle = '#05150c'
                            ctx.fillRect(x + 4, y + 5, PX - 8, PX - 8)
                            ctx.fillStyle = `rgba(93,255,143,${0.2 + glow * 0.5})`
                            ctx.fillRect(x + 4, y + 5, PX - 8, PX - 8)
                            ctx.fillStyle = '#5dff8f'
                            ctx.fillRect(x + 6, y + 7 + ((gs.tick >> 3) % 2), PX - 12, 2)
                        }
                        if (wd && live) text(`${wd.to + 1}`, x + PX / 2, y - 2, 6, glow > 0.5 ? '#aaffc8' : '#5dff8f', 3)
                    }
                    if (ch === 'P' || ch === 'p') {
                        // the swirl turns; the exit pad wears a paler tint of the
                        // entrance's hue so the destination reads as related (#973)
                        const q = teleSpin(gs.tick)
                        const col = teleColor(ch)
                        ctx.save()
                        ctx.shadowColor = col; ctx.shadowBlur = 4
                        for (let k = 0; k < 4; k++) {
                            const a = (q + k * 2) * Math.PI / 4
                            ctx.fillStyle = k % 2 ? col : '#7a3fb0'
                            ctx.fillRect(x + PX / 2 + Math.round(Math.cos(a) * 4) - 1, y + PX / 2 + Math.round(Math.sin(a) * 4) - 1, 2, 2)
                        }
                        ctx.restore()
                    }
                    if (ch === 'S') {
                        ctx.fillStyle = (gs.tick >> 3) % 2 ? '#ffe27a' : '#b08a20'
                        ctx.fillRect(x + 3, y + 3, 2, 2); ctx.fillRect(x + PX - 5, y + 4, 2, 2)
                        ctx.fillRect(x + 5, y + PX - 5, 2, 2); ctx.fillRect(x + PX - 7, y + PX - 7, 2, 2)
                        ctx.fillStyle = 'rgba(255,226,122,0.25)'
                        ctx.fillRect(x + 2, y + 2, PX - 4, PX - 4)
                    }
                    if (ch === 't') {
                        // an open trap floor blinks the whole cell in the last
                        // slice of its open window, before it solidifies (#973)
                        if (trapWarn(gs, gs.tick)) { ctx.fillStyle = 'rgba(255,150,70,0.4)'; ctx.fillRect(x, y, PX, PX) }
                        ctx.strokeStyle = 'rgba(255,150,70,0.5)'
                        ctx.strokeRect(x + 1.5, y + 1.5, PX - 3, PX - 3)
                    }
                    if (ch === 'D' || ch === 'L') {
                        const d = doorAt(gs, c, r)
                        if (d && d.broken) {
                            ctx.fillStyle = '#3d2a12'
                            for (let k = 0; k < 5; k++) ctx.fillRect(x + 2 + (k * 5) % 12, y + PX - 4 - (k % 2) * 2, 4, 3)
                        } else if (d && d.open) {
                            ctx.fillStyle = 'rgba(107,74,34,0.9)'
                            ctx.fillRect(x, y, PX, 2)
                            ctx.fillRect(x, y, 2, PX); ctx.fillRect(x + PX - 2, y, 2, PX)
                        } else {
                            ctx.fillStyle = '#6b4a22'
                            ctx.fillRect(x + 1, y + 1, PX - 2, PX - 2)
                            ctx.fillStyle = '#9c7038'
                            ctx.fillRect(x + 1, y + 1, PX - 2, 2)
                            ctx.fillStyle = '#3d2a12'
                            for (let my = y + 4; my < y + PX - 2; my += 3) ctx.fillRect(x + 2, my, PX - 4, 1)
                            if (ch === 'L') {
                                ctx.fillStyle = '#ffd23f'
                                ctx.fillRect(x + PX / 2 - 2, y + PX / 2 - 2, 4, 4)
                            } else {
                                ctx.fillStyle = '#20180e'
                                ctx.fillRect(x + PX / 2 - 1, y + 3, 2, 3); ctx.fillRect(x + PX / 2 - 1, y + PX - 6, 2, 3)
                            }
                        }
                    }
                }
            }
            // the torch: the hero's light — bright around him, falling to the
            // dim ambient at the screen's edge. Every wall colour is lit by it.
            const gx = h.x, gy = h.y
            const { recess, bevel } = mortarTones(mat)
            for (let r = r0; r <= r1; r++) {
                for (let c = c0; c <= c1; c++) {
                    if (cell(c, r) !== '#') continue
                    const wb = gs.levelData.grid[r][c]
                    const x = Math.round(c * PX - camX), y = Math.round(r * PX - camY)
                    const L = torch(c + 0.5 - gx, r + 0.5 - gy)
                    const rec = css(litColor(recess, L)), bev = css(litColor(bevel, L))
                    const body = css(litColor((c + r) % 2 === 0 ? mat.dark : mat.base, L))
                    const cap = css(litColor(mat.lite, L))
                    // drop shadow (unlit stone)
                    ctx.fillStyle = 'rgba(0,0,0,0.55)'
                    ctx.fillRect(x + 2, y + 3, PX, PX)
                    // raised top face, then the two brick courses (running bond)
                    ctx.fillStyle = cap
                    ctx.fillRect(x, y, PX, 2)
                    ctx.fillStyle = body
                    ctx.fillRect(x, y + 2, PX, PX - 2)
                    // the course line is two-toned: a dark recess with a light
                    // bevel shelf catching the torch just below it
                    ctx.fillStyle = rec
                    ctx.fillRect(x, y + 8, PX, 1)
                    ctx.fillStyle = bev
                    ctx.fillRect(x, y + 9, PX, 1)
                    // vertical joints: the upper course breaks at the mid, the
                    // lower course half a brick over — running bond
                    ctx.fillStyle = rec
                    ctx.fillRect(x + 8, y + 2, 1, 6)
                    ctx.fillRect(x + 4, y + 10, 1, 6); ctx.fillRect(x + 12, y + 10, 1, 6)
                    if (wb === 'B') {
                        ctx.fillStyle = 'rgba(0,0,0,0.6)'
                        ctx.fillRect(x + 3, y + 4, 1, 5); ctx.fillRect(x + 4, y + 9, 1, 4)
                        ctx.fillRect(x + 11, y + 2, 1, 4); ctx.fillRect(x + 10, y + 6, 1, 6)
                        ctx.fillStyle = 'rgba(255,255,255,0.14)'
                        ctx.fillRect(x + 3, y + 3, 6, 1)
                    }
                    if (wb === 'T') {
                        ctx.fillStyle = (gs.tick >> 4) % 2 ? '#ff8a3f' : '#7d3d14'
                        ctx.fillRect(x + PX / 2 - 3, y + PX / 2 - 1, 6, 2)
                        ctx.fillRect(x + PX / 2 - 1, y + PX / 2 - 3, 2, 6)
                    }
                }
            }
            const sx = (wx) => Math.round(wx * PX - camX), sy = (wy) => Math.round(wy * PX - camY)
            for (const it of gs.items) {
                if (it.taken) continue
                const bob = Math.sin(gs.tick / 9 + it.x) * 1.5
                ctx.save()
                if (it.t === 'key') { ctx.shadowColor = '#ffe27a'; ctx.shadowBlur = 5 }
                sprite(it.t === 'gold' ? 'gold' : it.t, sx(it.x), sy(it.y) + bob, it.t === 'food' ? 10 : 9, false)
                ctx.restore()
            }
            for (const g of gs.gens) {
                if (!g.alive) continue
                // the spout winds up before it belches: it grows and sways as the
                // charge empties, and a warm flash blooms over the last third.
                const p = g.charge > 0 ? 1 - g.charge / CFG.genPulse : 0
                const pulse = 1 + 0.5 * p + Math.sin(gs.tick / 2) * 0.25 * p
                ctx.save()
                ctx.shadowColor = p > 0.66 ? '#ffb03f' : '#ff4f4f'
                ctx.shadowBlur = 6 + Math.sin(gs.tick / 6) * 3 + p * (10 + Math.sin(gs.tick / 2) * 5)
                if (p > 0.5) {
                    ctx.fillStyle = `rgba(255,160,70,${(p - 0.5) * 0.7})`
                    ctx.beginPath()
                    ctx.arc(sx(g.x), sy(g.y), 7 + p * 7, 0, Math.PI * 2)
                    ctx.fill()
                }
                sprite('gen', sx(g.x), sy(g.y), 12 * pulse, false)
                ctx.restore()
            }
            for (const s of gs.shots) {
                ctx.save()
                ctx.shadowColor = s.kind === 'arrow' ? '#e8eef8' : s.kind === 'fire' ? '#ff8a3f' : '#8d99b5'
                ctx.shadowBlur = 5
                ctx.fillStyle = s.kind === 'arrow' ? '#e8eef8' : s.kind === 'fire' ? '#ff8a3f' : '#8d99b5'
                const px = sx(s.x), py = sy(s.y)
                ctx.fillRect(px - Math.round(s.dx * 3) - 1, py - Math.round(s.dy * 3) - 1, 3, 3)
                ctx.fillRect(px - Math.round(s.dx * 5) - 1, py - Math.round(s.dy * 5) - 1, 2, 2)
                ctx.restore()
            }
            const mons = [...gs.monsters].sort((a, b) => a.y - b.y)
            for (const m of mons) {
                const big = m.kind === 'death' ? 15 : m.kind === 'demon' ? 13 : 11
                if (m.kind === 'death') { ctx.save(); ctx.shadowColor = '#8fff9f'; ctx.shadowBlur = 8 }
                sprite(m.kind, sx(m.x), sy(m.y), big)
                if (m.kind === 'death') ctx.restore()
            }
            const other = otherEnt()
            if (other && !other.down) sprite(other.name.toLowerCase(), sx(other.x), sy(other.y), 11)
            // facing dagger: the sword arc, rendered honestly
            const hx = sx(h.x), hy = sy(h.y)
            ctx.strokeStyle = 'rgba(232,238,248,0.35)'
            ctx.beginPath()
            ctx.moveTo(hx + Math.cos(h.a) * 5, hy + Math.sin(h.a) * 5)
            ctx.lineTo(hx + Math.cos(h.a) * 10, hy + Math.sin(h.a) * 10)
            ctx.stroke()
            const trail = swordTrail(h.atkAnim)
            if (trail) {
                // a glowing light-arc trail: the fresh lead streak is brightest,
                // two ghost streaks trail behind; it fades as the swing settles
                ctx.save()
                ctx.shadowColor = '#dfeeff'
                for (let k = 0; k < 3; k++) {
                    const aa = Math.max(0, trail.alpha - k * 0.25)
                    ctx.strokeStyle = `rgba(223,238,255,${aa})`
                    ctx.shadowBlur = 12 * aa
                    ctx.lineWidth = Math.max(1, 2.6 - k)
                    ctx.beginPath()
                    ctx.arc(hx, hy, trail.reach, h.a + trail.lead - k * 0.14 - 0.32, h.a + trail.lead - k * 0.14 + 0.32)
                    ctx.stroke()
                }
                ctx.restore()
                ctx.lineWidth = 1
            }
            if (h.deadT > 0) {
                // the hero spins a full turn and collapses as he dies (issue #302)
                const dp = deathProgress(h.deadT)
                ctx.save()
                ctx.translate(hx, hy)
                ctx.rotate(dp * Math.PI * 2)
                ctx.scale(Math.max(0.05, 1 - dp), Math.max(0.05, 1 - dp))
                sprite(selfKey(), 0, 0, 12, false, 0)
                ctx.restore()
            } else {
                // the hero steps only while he walks (issue #302), and flashes
                // white the moment he is struck
                const wf = walkFrame(h.walk, SP[selfKey()].length)
                sprite(selfKey(), hx, hy, 12, true, wf)
                const fa = hitFlashAlpha(h.hitT)
                if (fa > 0) {
                    ctx.save()
                    ctx.globalAlpha = fa
                    ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 10
                    sprite(selfKey(), hx, hy, 12, true, wf, true)
                    ctx.restore()
                }
            }
            const stars = stunStars(h.stunT, gs.tick)
            if (stars && stars.on) {
                // stunned legs wear a flicker of yellow stars orbiting the head (#973)
                ctx.save()
                ctx.shadowColor = '#ffe27a'; ctx.shadowBlur = 4
                ctx.fillStyle = '#ffe27a'
                for (let k = 0; k < stars.n; k++) {
                    const a = stars.spin + (k * Math.PI * 2) / stars.n
                    ctx.fillRect(hx + Math.round(Math.cos(a) * 6) - 1, hy - 7 + Math.round(Math.sin(a) * 2), 2, 2)
                }
                ctx.restore()
            }
            for (const p of parts) {
                p.x += p.vx; p.y += p.vy; p.t++
                if (p.t < 18) { ctx.fillStyle = p.col; ctx.globalAlpha = 1 - p.t / 18; ctx.fillRect(VW / 2 + p.x, VH / 2 + p.y, 2, 2); ctx.globalAlpha = 1 }
            }
            while (parts.length && parts[0].t >= 18) parts.shift()
            for (const d of debris) {
                // rubble chips tumble down from a crumbled breakable (#973)
                d.x += d.vx; d.y += d.vy; d.vy += d.g; d.t++
                if (d.t < 18) { ctx.globalAlpha = 1 - d.t / 18; ctx.fillStyle = d.t % 2 ? '#9a94a8' : '#6f6a80'; ctx.fillRect(sx(d.x), sy(d.y), 2, 2); ctx.globalAlpha = 1 }
            }
            while (debris.length && debris[0].t >= 18) debris.shift()
            const vg = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.34, VW / 2, VH / 2, VH * 0.72)
            vg.addColorStop(0, 'rgba(0,0,0,0)')
            vg.addColorStop(1, 'rgba(0,0,0,0.62)')
            ctx.fillStyle = vg
            ctx.fillRect(0, 0, VW, VH)
            // juice: the view breathes — a red edge throb under 30% health, and a
            // green flush while Death is draining you (issue #275 item 4)
            const low = lowHpPulse(h.hp, h.maxHp, gs.tick)
            if (low > 0) {
                const rg = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.30, VW / 2, VH / 2, VH * 0.80)
                rg.addColorStop(0, 'rgba(120,0,0,0)')
                rg.addColorStop(1, `rgba(150,10,10,${low * 0.5})`)
                ctx.fillStyle = rg
                ctx.fillRect(0, 0, VW, VH)
            }
            const gt = deathTint(isDraining(gs), gs.tick)
            if (gt > 0) {
                ctx.fillStyle = `rgba(60,190,95,${gt * 0.20})`
                ctx.fillRect(0, 0, VW, VH)
            }
        }

        const drawPanel = () => {
            ctx.fillStyle = '#0b0e18'
            ctx.fillRect(VW, 0, PW, VH)
            ctx.strokeStyle = '#2b3348'
            ctx.strokeRect(VW + 0.5, 0.5, PW - 1, VH - 1)
            const px = VW + MAP_MARGIN, py = MAP_MARGIN, s = MAP_CELL
            ctx.fillStyle = '#05050c'
            ctx.fillRect(px - 2, py - 2, W * s + 4, H * s + 4)
            const h = selfEnt()
            const map = gs.explored[gs.level]
            for (let r = 0; r < H; r++) {
                for (let c = 0; c < W; c++) {
                    if (!map[r * W + c]) continue
                    const ch = gs.levelData.grid[r][c]
                    const pulse = ch === 'X' ? stairsPulse(gs.keys, gs.tick) : null
                    if (pulse !== null) {
                        // keys held: the stairs pulse gold, ringing past the cell at the peak
                        if (pulse > 0.75) { ctx.fillStyle = 'rgba(255,210,63,0.55)'; ctx.fillRect(px + c * s - 1, py + r * s - 1, s + 2, s + 2) }
                        ctx.fillStyle = pulse > 0.75 ? '#fff2b0' : pulse > 0.25 ? '#ffd23f' : '#8a5f16'
                    } else {
                        ctx.fillStyle = ch === '#' ? '#4a5568'
                            : ch === 'X' ? ((gs.tick >> 3) % 2 === 0 ? '#54c8ff' : '#1d5a7d')
                                : ch === 'W' ? ((gs.tick >> 3) % 2 === 0 ? '#5dff8f' : '#2f7d4f')
                                    : ch === 'D' ? '#c96a3a'
                                        : ch === 'L' ? '#ffd23f'
                                            : ch === 'P' || ch === 'p' ? '#e08fff'
                                                : ch === 'S' ? '#ffe27a'
                                                    : ch === 't' ? '#7d5233' : '#1a2436'
                    }
                    ctx.fillRect(px + c * s, py + r * s, s, s)
                }
            }
            // the beasts the view shows: red roamers, Death in his green
            // (#524: the side map admits what the SHARED screen shows, both heroes framed)
            for (const m of mapMonsters(gs, gs.topDown ? viewRect(gs.hero, gs.partner) : viewRect(h))) {
                ctx.fillStyle = m.kind === 'death' ? '#8fff9f' : '#ff5d5d'
                ctx.fillRect(px + m.x * s - 1, py + m.y * s - 1, s, s)
            }
            ctx.fillStyle = '#ff5d5d'
            ctx.fillRect(px + h.x * s - 1, py + h.y * s - 1, 2, 2)
            const mo = otherEnt()
            if (mo && !mo.down) { ctx.fillStyle = '#54c8ff'; ctx.fillRect(px + mo.x * s - 1, py + mo.y * s - 1, 2, 2) }
            const hy = VH - 58
            sprite(selfKey(), VW + PW / 2, hy, 20, false)
            text(HEROES[selfKey()].name, VW + PW / 2, hy + 16, 6, '#ffd23f', 2)
            ctx.fillStyle = '#301010'
            ctx.fillRect(VW + 8, hy + 22, PW - 16, 5)
            ctx.fillStyle = h.hp > h.maxHp * 0.3 ? '#e83a3a' : (gs.tick >> 2) % 2 ? '#ff8a5d' : '#7d1414'
            ctx.fillRect(VW + 8, hy + 22, (PW - 16) * Math.max(0, h.hp / h.maxHp), 5)
            text('HEALTH', VW + PW / 2, hy + 33, 5, '#8fa3d8')
            text(`KEYS ${gs.keys}`, VW + PW / 2, hy + 44, 7, '#ffd23f', 2)
            text(`GOLD ${gs.gold}`, VW + PW / 2, hy + 53, 7, '#c9d4ea')
            const hudOther = otherEnt()
            if (hudOther && !hudOther.down && (gs.partnerHuman || net.role)) {
                // the other player's portrait, under the hero's (P2, or the peer online #554)
                const pk = hudOther.name.toLowerCase()
                text('2P', VW + PW / 2, 72, 6, '#ff5d5d', 2)
                sprite(pk, VW + PW / 2, 98, 18, false)
                ctx.fillStyle = '#301010'; ctx.fillRect(VW + 10, 112, PW - 20, 3)
                ctx.fillStyle = hudOther.hp > hudOther.maxHp * 0.3 ? '#e83a3a' : (gs.tick >> 2) % 2 ? '#ff8a5d' : '#7d1414'
                ctx.fillRect(VW + 10, 112, (PW - 20) * Math.max(0, hudOther.hp / hudOther.maxHp), 3)
            }
        }

        const draw = () => {
            ctx.fillStyle = '#05050c'
            ctx.fillRect(0, 0, CW, CH)
            ctx.save()
            if (shake > 0) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake -= 0.5 }
            drawView()
            ctx.restore()
            if (flash > 0) { ctx.fillStyle = `rgba(255,40,40,${flash * 0.03})`; ctx.fillRect(0, 0, VW, VH); flash -= 0.5 }
            if (wflash > 0) { ctx.fillStyle = `rgba(255,255,255,${wflash * 0.028})`; ctx.fillRect(0, 0, VW, VH); wflash -= 0.5 }
            drawPanel()

            ctx.fillStyle = '#07070f'
            ctx.fillRect(0, VH, CW, HT)
            ctx.strokeStyle = '#2b3348'
            ctx.strokeRect(0.5, VH + 0.5, CW - 1, HT - 1)
            text(LEVELS[gs.level].name, CW / 2, VH + 12, 7, '#8fa3d8')
            text(`1UP ${String(gs.score).padStart(6, '0')}`, 12, VH + 12, 8, '#ff5d5d', 3, 'left')
            text(`HI ${String(Math.max(gs.score, board()[0]?.score || 0)).padStart(6, '0')}`, CW - PW - 12, VH + 12, 8, '#ffd23f', 3, 'right')
            for (let i = 0; i < gs.lives; i++) {
                ctx.fillStyle = '#ff5d5d'
                ctx.beginPath(); ctx.arc(12 + i * 11, VH + 28, 4, 0, Math.PI * 2); ctx.fill()
            }
            text(`LVL ${gs.level + 1}/${gs.levelCount}`, CW - PW - 12, VH + 28, 8, '#8fb0ff', 2, 'right')
            if (toast > 0) { text(toastMsg, (VW + PW) / 2, VH + 34, 10, '#e9f7ff', 6); toast-- }

            const sc = screenRef.current
            if (sc === 'attract' || sc === 'select') {
                ctx.fillStyle = sc === 'select' ? '#05050c' : DIM
                ctx.fillRect(0, 0, CW, CH)
                text('GAUNTLET', CW / 2, 58, 30, '#ffd23f', 14)
                text('ATARI 1985 · TEN MAZES · WARPS · OVERHEAD', CW / 2, 78, 8, '#8fa3d8')
                if (sc === 'attract') {
                    const b = board()[0]
                    for (const l of attractFrame(gs.tick, CW, CH, HT, b ? b.score : 0)) {
                        text(l.text, l.x, l.y, l.size, l.col, l.glow)
                    }
                } else {
                    text('CHOOSE YOUR HERO', CW / 2, 96, 10, '#5dff8f', 4)
                    HERO_ORDER.forEach((hk, i) => {
                        const hd = HEROES[hk]
                        const cx = cardCenter(i)
                        const sel = i === selectHero
                        ctx.fillStyle = '#0b0e18'
                        ctx.fillRect(cx - 30, 108, 60, 78)
                        ctx.strokeStyle = sel ? '#ffd23f' : '#3d4a66'
                        ctx.lineWidth = sel ? 2 : 1
                        ctx.strokeRect(cx - 30, 108, 60, 78)
                        ctx.lineWidth = 1
                        sprite(hk, cx, 130, 26, false)
                        text(hd.name, cx, 156, 7, sel ? '#ffd23f' : '#cfd8ff', sel ? 4 : 0)
                        text(`${i + 1}`, cx - 22, 120, 8, '#8fa3d8')
                        ctx.fillStyle = '#301010'; ctx.fillRect(cx - 24, 162, 48, 4)
                        ctx.fillStyle = '#e83a3a'; ctx.fillRect(cx - 24, 162, 48 * (hd.hp / 170), 4)
                        ctx.fillStyle = '#101a33'; ctx.fillRect(cx - 24, 168, 48, 4)
                        ctx.fillStyle = '#5dc8ff'; ctx.fillRect(cx - 24, 168, 48 * (hd.speed / 1.12), 4)
                        ctx.fillStyle = '#12261a'; ctx.fillRect(cx - 24, 174, 48, 4)
                        ctx.fillStyle = '#5dff8f'; ctx.fillRect(cx - 24, 174, 48 * (hd.arrow / 18), 4)
                    })
                    const pm = gs.partnerMode || 'off'
                    text(pm === 'human' ? 'ARROWS P1 PICK · A/D P2 PICK · WASD+F P2 · PAD 2 = P2 · SPACE START' : 'ARROWS OR TAP PICK · SPACE OR TAP AGAIN START', CW / 2, 202, pm === 'human' ? 7 : 8, '#8fa3d8')
                    text('C PARTNER ' + (pm === 'cpu' ? 'ON' : 'OFF') + ' · P 2-PLAYER ' + (pm === 'human' ? 'ON' : 'OFF') + ' · HP SPEED RANGE', CW / 2, 214, 7, '#5d7094')
                    if (pm === 'human') {
                        // the second portrait: P2's chosen hero, up in the panel
                        const hk2 = HERO_ORDER[selectHero2]
                        text('2P', VW + PW / 2, 72, 7, '#ff5d5d', 2)
                        sprite(hk2, VW + PW / 2, 98, 20, false)
                        text(HEROES[hk2].name, VW + PW / 2, 114, 6, '#ffd23f', 2)
                    }
                }
            }
            if (sc === 'over') {
                ctx.fillStyle = 'rgba(3,3,12,0.82)'
                ctx.fillRect(0, 0, CW, CH)
                text(gs.end === 'win' ? 'THE GAUNTLET IS DONE!' : 'THE MAZE CLAIMS YOU', CW / 2, 96, 18, gs.end === 'win' ? '#5dff8f' : '#ff5d5d', 10)
                text(`SCORE ${String(gs.score).padStart(6, '0')}  GOLD ${gs.gold}`, CW / 2, 122, 10, '#ffd23f', 4)
                text(gs.end === 'win' ? `${HEROES[gs.heroKey].who} SURVIVES ALL TEN MAZES` : `${HEROES[gs.heroKey].who} IS DEAD`, CW / 2, 140, 8, '#8fa3d8')
                if (Math.floor(gs.tick / 24) % 2 === 0) text('PRESS ANY KEY', CW / 2, 168, 9, '#e9f7ff', 4)
            }
            ctx.fillStyle = 'rgba(0,0,0,0.12)'
            for (let y = 0; y < CH; y += 3) ctx.fillRect(0, y, CW, 1)
        }

        // ---------------------------------------------------------------- loop ----
        const frame = (now) => {
            raf = requestAnimationFrame(frame)
            const dt = Math.min(now - last, 250)
            last = now
            if (pausedRef.current) return
            if (contractHoldsLoop()) { acc = 0 }
            else {
                acc += dt
                while (acc >= SIM_MS) { doFrameSim(); acc -= SIM_MS }
            }
            draw()
            const hud = hudRef.current
            if (hud.score) hud.score.textContent = String(gs.score).padStart(6, '0')
            if (hud.lives) hud.lives.textContent = String(gs.lives)
            if (hud.level) hud.level.textContent = `${gs.level + 1}/${gs.levelCount}`
            // #546 item 1: one-way pad age + live stall count so a laggy
            // friend reads on-screen instead of "the game froze".
            if (hud.age && net.phase === 'play' && net.lock && gs.tick % 10 === 0) {
                const a = net.lock.padAge(performance.now())
                hud.age.textContent = a < 0 ? '--' : `${Math.round(a)}MS`
                if (hud.stall) hud.stall.textContent = net.lock.stats().stallRun > 0 ? ` STALL ${net.lock.stats().stallRun}` : ''
            }
        }

        // ---------------------------------------------------------------- input ----
        const startSelect = () => {
            let pm = gs.partnerMode || 'off'
            if (connectedSlots() >= 2) pm = 'human'
            gs = makeGame(0, 'warrior', { topDown: true })
            gs.partnerOn = false
            gs.partnerMode = pm
            setMode('select')
        }
        const startPlay = (hk) => {
            if (net.role === 'guest' && net.phase !== 'play') return
            let pm = gs.partnerMode || 'off'
            if (pm === 'off' && connectedSlots() >= 2) pm = 'human'
            const two = pm === 'human'
            const pOn = pm === 'cpu'
            const online = net.role === 'host' && net.peer && net.phase === 'waiting'
            if (net.role === 'host' && !online) {
                net.info = 'waiting for friend'
                netPush()
                return
            }
            const peerHero = online ? HERO_ORDER[(selectHero + 1) % 4] : undefined
            gs = makeGame(Math.floor(Math.random() * 1000) % 97, hk, { partner: pOn || two || online, topDown: true, partnerKey: online ? peerHero : (two ? HERO_ORDER[selectHero2] : undefined) })
            gs.partnerOn = pOn || two || online
            gs.partnerMode = pm
            gs.partnerHuman = two
            if (online) {
                gs.partnerMode = 'human'
                gs.partnerHuman = false
                if (net.lobby) net.lobby.start({ seed: gs.seed, hero: hk, peerHero })
                netStartLock()
                net.phase = 'play'
                netPush()
            }
            setMode('play')
            say(`${HEROES[hk].who} ENTERS THE ${LEVELS[0].name.replace(/^LEVEL 1 · THE /, '')}`)
            audioController.playSweep(330, 660, 0.25, 'square', 0.07)
        }
        const onKeyDown = (ev) => {
            if (ev.code === 'Escape' || ev.code === 'Backquote') { ev.preventDefault(); setPaused((p) => !p); return }
            if (net.role && ev.target && ev.target.tagName === 'INPUT') return
            if (net.role === 'guest' && net.phase !== 'play') return
            const sc = screenRef.current
            if (sc === 'attract') { startSelect(); return }
            if (sc === 'select') {
                if (ev.code === 'ArrowLeft') selectHero = (selectHero + 3) % 4
                if (ev.code === 'ArrowRight') selectHero = (selectHero + 1) % 4
                if (ev.code === 'KeyC') { gs.partnerMode = gs.partnerMode === 'cpu' ? 'off' : 'cpu'; if (!gs.partnerHuman) setSlotKind(p2slot, gs.partnerMode === 'cpu' ? 'cpu' : 'off') }
                if (ev.code === 'KeyP') { gs.partnerMode = gs.partnerMode === 'human' ? 'off' : 'human'; if (gs.partnerMode === 'human') setSlotKind(p2slot, 'human') }
                if (gs.partnerMode === 'human') {
                    if (ev.code === 'KeyA') selectHero2 = (selectHero2 + 3) % 4
                    if (ev.code === 'KeyD') selectHero2 = (selectHero2 + 1) % 4
                }
                if (ev.code === 'Digit1' || ev.code === 'Space' || ev.code === 'Enter') startPlay(HERO_ORDER[selectHero])
                if (ev.code === 'Digit2') startPlay('valkyrie')
                if (ev.code === 'Digit3') startPlay('wizard')
                if (ev.code === 'Digit4') startPlay('elf')
                return
            }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) startSelect(); return }
            if (ev.code === 'ArrowLeft') keys.l = true
            if (ev.code === 'ArrowRight') keys.r = true
            if (ev.code === 'ArrowUp') keys.u = true
            if (ev.code === 'ArrowDown') keys.d = true
            if (ev.code === 'Space') keys.swordEdge = true
            if (ev.code === 'KeyX') keys.arrowEdge = true
            if (ev.code === 'KeyW') p2.u = true
            if (ev.code === 'KeyS') p2.d = true
            if (ev.code === 'KeyA') p2.l = true
            if (ev.code === 'KeyD') p2.r = true
            if (ev.code === 'KeyF') { if (gs.partnerHuman) p2.swordEdge = true; else keys.arrowEdge = true }
        }
        const onKeyUp = (ev) => {
            if (ev.code === 'ArrowLeft') keys.l = false
            if (ev.code === 'ArrowRight') keys.r = false
            if (ev.code === 'ArrowUp') keys.u = false
            if (ev.code === 'ArrowDown') keys.d = false
            if (ev.code === 'KeyW') p2.u = false
            if (ev.code === 'KeyS') p2.d = false
            if (ev.code === 'KeyA') p2.l = false
            if (ev.code === 'KeyD') p2.r = false
        }
        const onPad = (ev) => {
            const d = ev.detail
            if (!d) return
            keys.l = !!d.left; keys.r = !!d.right; keys.u = !!d.up; keys.d = !!d.down
            if (d.action) keys.swordEdge = true
            if (d.second) keys.arrowEdge = true
        }
        const onPointer = (ev) => {
            const sc = screenRef.current
            if (net.role === 'guest' && net.phase !== 'play') return
            if (sc === 'attract') { startSelect(); return }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) startSelect(); return }
            if (sc === 'select') {
                const r = canvas.getBoundingClientRect()
                const x = (ev.clientX - r.left) / r.width * CW
                const y = (ev.clientY - r.top) / r.height * CH
                const hit = heroAt(x, y)
                if (hit !== null) {
                    if (hit === selectHero) startPlay(HERO_ORDER[hit])
                    else selectHero = hit
                    return
                }
                if (x > VW + 40) startPlay(HERO_ORDER[selectHero])
            }
        }
        const onPads = (ev) => {
            const c = ev.detail && ev.detail.count
            if (c >= 2 && gs.partnerMode !== 'human' && (screenRef.current === 'attract' || screenRef.current === 'select')) gs.partnerMode = 'human'
        }
        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)
        window.addEventListener('virtualcontrols', onPad)
        window.addEventListener('retrogames:pads', onPads)
        canvas.addEventListener('pointerdown', onPointer)

        // ------------------------------------------------------------- DEV hook ----
        if (import.meta.env.DEV) {
            let cPrev = { a: false, b: false }
            exposeGame({
                id: 'gauntlet',
                players: 2,
                method: 'stick',
                buttons: ['left', 'right', 'up', 'down', 'a', 'b'],
                reads: ['up', 'down', 'left', 'right', 'a', 'b'],
                // #495: who fills each seat right now, stamped into recordings
                // at record-stop. Seat 1 arrives via the contract (external pad
                // stream = model); seat 2 is model while the contract drives it.
                sources: () => [{ kind: 'model' }, { kind: modelP2 ? 'model' : p2slot.kind }],
                reset: (seed, players = 1) => {
                    gs = makeGame(((seed >>> 0) % 97) | 0, 'warrior', players >= 2 ? { topDown: true, partner: true, partnerKey: 'elf' } : { topDown: true })
                    gs.partnerOn = players >= 2; gs.partnerMode = players >= 2 ? 'cpu' : 'off'; gs.partnerHuman = false
                    demoAt = 0
                    keys.l = keys.r = keys.u = keys.d = false
                    keys.swordEdge = false; keys.arrowEdge = false
                    p2.l = p2.r = p2.u = p2.d = false; p2.swordEdge = false
                    cPrev = { a: false, b: false }
                    modelP2 = null; seatPrev.a = false; setSlotKind(p2slot, 'off')
                    setMode('play')
                },
                tick: (pad, pads) => {
                    keys.l = !!pad.left; keys.r = !!pad.right; keys.u = !!pad.up; keys.d = !!pad.down
                    keys.swordEdge = !!pad.a && !cPrev.a
                    keys.arrowEdge = !!pad.b && !cPrev.b
                    cPrev = { a: !!pad.a, b: !!pad.b }
                    modelP2 = pads && pads.length > 1 ? pads[1] : null
                    doFrameSim()
                },
                state: () => ({
                    tick: gs.tick, score: gs.score, done: !!gs.end,
                    seed: gs.seed,
                    lives: gs.lives, level: gs.level, levelCount: gs.levelCount, keys: gs.keys, gold: gs.gold,
                    hp: gs.hero.hp, x: +gs.hero.x.toFixed(2), y: +gs.hero.y.toFixed(2),
                    partner: gs.partner ? { x: +gs.partner.x.toFixed(2), y: +gs.partner.y.toFixed(2), hp: gs.partner.hp } : null,
                    hash: stateHash(gs),
                }),
                canvas: () => canvas,
            })
            window.__gauntletTest = {
                state: () => gs,
                hash: () => stateHash(gs),
                step: (n = 1) => { for (let i = 0; i < n; i++) doSim({ left: false, right: false, fwd: false, back: false, sword: false, arrow: false }) },
                stepWith: (inp, pInp) => doSim(inp, pInp),
                frame: () => doFrameSim(),
                setKeys: (k) => { keys.l = !!k.l; keys.r = !!k.r; keys.u = !!k.u; keys.d = !!k.d; if (k.s) keys.swordEdge = true; if (k.a) keys.arrowEdge = true },
                setP2: (k) => { p2.l = !!k.l; p2.r = !!k.r; p2.u = !!k.u; p2.d = !!k.d; if (k.s) p2.swordEdge = true },
                start2P: (hk1 = 'warrior', hk2 = 'elf') => { const r = Math.floor(Math.random() * 1000) % 97; gs = makeGame(r, hk1, { partner: true, topDown: true, partnerKey: hk2 }); gs.partnerOn = true; gs.partnerMode = 'human'; gs.partnerHuman = true; setMode('play') },
                plan: (seed = 0, opts) => plan(seed, { topDown: true, ...opts }),
                decide: (s) => decide(s || gs),
                restart: () => { gs = makeGame(0, 'warrior', { topDown: true }) },
                startHero: (hk) => startPlay(hk),
                events: () => evLog,
                probe: () => ({
                    tick: gs.tick, screen: screenRef.current, select: selectHero, select2: selectHero2, partnerHuman: gs.partnerHuman, seat: p2slot.kind, score: gs.score, lives: gs.lives, level: gs.level, keys: gs.keys, gold: gs.gold,
                    hash: stateHash(gs),
                    hero: { x: gs.hero.x, y: gs.hero.y, a: gs.hero.a, hp: gs.hero.hp, deadT: gs.hero.deadT },
                    p2: gs.partner ? { x: gs.partner.x, y: gs.partner.y, a: gs.partner.a, hp: gs.partner.hp, name: gs.partner.name, down: gs.partner.down } : null,
                    monsters: gs.monsters.map((m) => ({ kind: m.kind, x: m.x, y: m.y, hp: m.hp })),
                    gens: gs.gens.map((g) => ({ alive: g.alive, hp: g.hp })),
                    items: gs.items.filter((i) => !i.taken).map((i) => i.t),
                    deathSpawned: gs.deathSpawned, end: gs.end,
                }),
                gameTime: () => gs.tick / 60,
                netProbe: () => ({
                    phase: net.phase, role: net.role, code: net.code, peer: net.peer,
                    tick: gs.tick, seed: gs.seed, hash: stateHash(gs),
                    stalls: net.lock ? net.lock.stats().stalls : 0,
                    stallRun: net.lock ? net.lock.stats().stallRun : 0,
                    padAge: net.lock ? net.lock.padAge(performance.now()) : -1,
                    attempt: net.room ? net.room.attempt : 0,
                    maxRetry: 6,
                    desyncTick: net.desyncTick,
                }),
                netTamper: () => { net.tamper = true },
                netKill: () => { if (net.room && net.room.ws) { try { net.room.ws.close() } catch { /* gone */ } } },
                netJoin: (code) => netJoinRef.current && netJoinRef.current(code),
            }
            mountDbg({
                title: 'GAUNTLET',
                getState: () => [
                    `${gs.levelData.name} hp ${gs.hero.hp}/${gs.hero.maxHp} lives ${gs.lives} keys ${gs.keys} gold ${gs.gold} score ${gs.score}`,
                    `hero ${gs.hero.x.toFixed(2)},${gs.hero.y.toFixed(2)} a ${gs.hero.a.toFixed(2)} deadT ${gs.hero.deadT} death ${gs.deathSpawned ? 'walks' : 'sleeps'}`,
                    gs.monsters.map((m) => `${m.kind}@${m.x.toFixed(1)},${m.y.toFixed(1)} h${m.hp}`).join('\n') || 'halls are quiet',
                    gs.gens.map((g) => `gen ${g.alive ? (g.charge > 0 ? `charging ${g.charge}` : 'spawning') : 'dead'} hp${g.hp}`).join(' '),
                ],
                actions: [
                    { label: 'PROGNOSIS', run: () => { const r = plan(gs.seed, { hero: gs.heroKey, topDown: true, maxTicks: 40000 }); return r.won ? `fresh sim still winnable (deaths ${r.deaths})` : 'fresh sim NOT winnable' } },
                    { label: 'kill all', run: () => { gs.monsters = []; return 'cleared (cheat)' } },
                    { label: 'give key', run: () => { gs.keys++; return `keys ${gs.keys}` } },
                    { label: 'summon death', run: () => { gs.deathSpawned = true; gs.monsters.push({ id: gs._nextId++, kind: 'death', x: gs.hero.x + 4, y: gs.hero.y, hp: 24, atkT: 0, castT: 0, path: [], repathT: 0, drainT: 0 }); return 'DEATH WALKS' } },
                ],
            })
        }

        netJoinRef.current = (code) => net.lobby && net.lobby.join(code)
        if (net.role === 'host') net.lobby.open()
        if (net.role === 'guest' && net.code) net.lobby.join(net.code)
        last = performance.now()
        raf = requestAnimationFrame(frame)
        return () => {
            cancelAnimationFrame(raf)
            if (net.room) { try { net.room.clearRetry(); net.room.reset() } catch { /* gone */ } }
            if (canvas.parentNode === wrap) wrap.removeChild(canvas)
            window.removeEventListener('keydown', onKeyDown)
            window.removeEventListener('keyup', onKeyUp)
            window.removeEventListener('virtualcontrols', onPad)
            window.removeEventListener('retrogames:pads', onPads)
            if (import.meta.env.DEV) { unmountDbg(); unexposeGame(); delete window.__gauntletTest }
        }
    }, [setMode])

    useEffect(() => { pausedRef.current = paused }, [paused])

    const entry = GAMES.find((g) => g.label === 'GAUNTLET')
    const netPhase = netUi.phase
    const bespoke = (text, col = '#8fa3d8', size = 'text-[11px]') => (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[rgba(5,5,12,0.88)] font-mono tracking-widest" style={{ color: col }}>
            <div className={size}>{text}</div>
        </div>
    )
    const netOverlay = netPhase === 'idle' || netPhase === 'play' ? null :
        netPhase === 'gone' ? bespoke('FRIEND LEFT — RELOAD TO ROOM AGAIN', '#ff5d5d') :
            netPhase === 'over' ? bespoke('RELOAD TO PLAY ONLINE AGAIN') :
                netPhase === 'desync' ? bespoke(`NET DESYNC ${String(netUi.info || '').toUpperCase()} — SIMS DIVERGED`, '#ff5d5d', 'text-[13px]') :
                    <Lobby
                        state={netUi}
                        title="QUEST"
                        names={['HOST', 'FRIEND']}
                        waitHint="WAITING FOR THE HOST TO PICK A HERO…"
                        startHint="PICK A HERO — SPACE SENDS THE PARTY"
                        onEntry={(c) => netJoinRef.current && netJoinRef.current(c)}
                        accent={{
                            text: 'text-[#8fa3d8]',
                            dim: 'text-[#8fa3d8]',
                            live: 'border-[#3d4a6b] text-[#e9f7ff]',
                            warn: '#ffd23f',
                            bad: '#ff5d5d',
                            btn: 'border-[#ffd23f] text-[#ffd23f]',
                            codeGlow: { color: '#ffd23f' },
                            qr: '#1b2540',
                            qrFrame: '#8fa3d8',
                        }}
                    />

    return (
        <div className="relative w-full h-full flex flex-col items-center justify-center bg-[#05050c] select-none">
            <div className="relative w-full max-w-[720px] aspect-[320/240]">
                <div ref={stageRef} className="absolute inset-0 shadow-[0_0_40px_rgba(224,58,58,0.25)]" />
                {netOverlay}
            </div>
            <div className="flex gap-6 mt-2 text-[11px] font-mono tracking-widest text-[#8fa3d8]">
                <span>SCORE <span ref={setHud('score')} className="text-[#ffd23f]">000000</span></span>
                <span>MAZE <span ref={setHud('level')} className="text-[#e9f7ff]">1/10</span></span>
                <span>LIVES <span ref={setHud('lives')} className="text-[#ff5d5d]">3</span></span>
                {netPhase === 'play' && (
                    <span>AGE <span ref={setHud('age')} className="text-[#e9f7ff]">--</span>
                        <span ref={setHud('stall')} className="text-[#ff5d5d]"></span>
                    </span>
                )}
            </div>
            <VirtualControls
                visible={screen === 'play' && !paused && (netPhase === 'idle' || netPhase === 'play')}
            />
            {paused && <PauseOverlay game={entry} onResume={() => setPaused(false)} />}
        </div>
    )
}

export default GauntletGame
