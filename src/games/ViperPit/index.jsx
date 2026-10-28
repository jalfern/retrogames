// VIPER PIT — the cabinet (#1096). Rules live in the shared fighting core
// (`src/engine/fighting.js`) with the #1096 options on: `guardButton` (a
// dedicated GUARD verb — back-walking never blocks) and qcbf finishers
// (↓←↓→ + punch at a full bar; drops a wounded opponent with FINISH!).
// Attract runs a CPU-vs-CPU bout; select a fighter; best-of-3 against a
// 5-opponent arcade ladder (easy→insane). Modes: 1P ladder (default, phone:
// pad + A punch + B kick + GUARD button), local 2P (P1 arrows+JKUI+O,
// P2 WASD+FGBV+H) and head-to-head over the #1039 shared lobby
// (?net=host / ?net=join&room=CODE): pads on one seed with an 8-frame input
// delay, hash-checked every 30 ticks — the engine is pure and seeded, so both
// boxes run identical fights (#531 law).

import React, { useEffect, useRef, useState } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import Lobby from '../../components/Lobby'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games.js'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop } from '../../utils/gameContract'
import { createLobby, lobbyRole, relayFromQuery, seatModel } from '../../utils/lobby.js'
import { createMatch, step, emptyPad, matchHash, fightersState, forceKO, FIXED_DT } from '../../engine/fighting.js'
import { ROSTER, BY_ID, LADDER } from './fighters.js'
import { createScene, buildFighter, buildStage } from './render.js'
import { STAGES } from './stages.js'

const SIM_MS = FIXED_DT
const SEATS = 2
const PAD_DELAY = 8
const HASH_EVERY = 30

const wirePad = (p) => ({ l: !!p.left, r: !!p.right, u: !!p.up, d: !!p.down, lp: !!p.lp, hp: !!p.hp, lk: !!p.lk, hk: !!p.hk, bk: !!p.bk })
const fromWire = (p) => ({ left: !!(p && p.l), right: !!(p && p.r), up: !!(p && p.u), down: !!(p && p.d), lp: !!(p && p.lp), hp: !!(p && p.hp), lk: !!(p && p.lk), hk: !!(p && p.hk), bk: !!(p && p.bk) })
const padFromContract = (pad) => ({
    left: !!(pad && pad.left), right: !!(pad && pad.right), up: !!(pad && pad.up), down: !!(pad && pad.down),
    lp: !!(pad && pad.a), hp: false, lk: !!(pad && pad.b), hk: false, bk: false,
})

const KEY_P1 = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
    KeyJ: 'lp', KeyK: 'hp', KeyU: 'lk', KeyI: 'hk', Space: 'lp', KeyZ: 'lk', KeyO: 'bk',
}
const KEY_P2 = {
    KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down',
    KeyF: 'lp', KeyG: 'hp', KeyV: 'lk', KeyB: 'hk', KeyH: 'bk',
}
const MESSAGES = [
    'HOLD GUARD TO BLOCK · GUARD+DOWN BLOCKS LOWS',
    'BACK-WALKING WILL NOT SAVE YOU',
    'UPPERCUT: FORWARD-DOWN-UP + PUNCH — THEY LAUNCH',
    'FULL BAR + DOWN-BACK-DOWN-FORWARD = FINISHING MOVE',
    'A FINISHING MOVE ENDS A WOUNDED FOE IN STYLE',
    'LIGHT INTO HEAVY INTO SPECIAL = COMBO',
    'FIRST TO 2 ROUNDS',
]

const ViperPitGame = () => {
    const wrapRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [netUi, setNetUi] = useState(null)
    const [desync, setDesync] = useState(false)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const desyncRef = useRef(false)
    const guardRef = useRef(null)

    useEffect(() => {
        const wrap = wrapRef.current
        if (!wrap) return undefined
        const setSc = (s) => { screenRef.current = s; setScreen(s) }

        const gl = document.createElement('canvas')
        gl.dataset.viperpitStage = '1'
        gl.style.touchAction = 'none'
        gl.style.position = 'absolute'
        gl.style.inset = '0'
        wrap.appendChild(gl)
        const hud = document.createElement('canvas')
        hud.dataset.viperpitHud = '1'
        hud.style.position = 'absolute'
        hud.style.inset = '0'
        hud.style.pointerEvents = 'none'
        wrap.appendChild(hud)
        const hctx = hud.getContext('2d')

        const scene = createScene(gl)
        let stageFx = null
        let stage = STAGES[0]

        let raf = 0, last = 0, acc = 0
        let alive = true
        let seedCounter = (Date.now() >>> 0) ^ 0x7a11e5
        let gs = null
        let mode = 'cpu'
        let mySeat = 0
        let ladderIdx = 0
        let p1Char = 'riv', p2Char = 'nyx'
        let p2Picked = false
        let cursor = 3
        let attractMsg = 0, attractT = 0
        let shake = 0, flashT = 0, bannerT = 0, bannerText = ''
        let finishFx = 0, finishText = ''
        let finishCine = null, cine = null
        let quote = null
        const QUOTE_T = 150
        let comboFx = [0, 0], comboVal = [0, 0]
        let lagHp = [100, 100]
        let rigs = null
        let nextSend = 0
        const padMirror = [new Map(), new Map()]
        const oursH = new Map(), peerH = new Map()
        const keys1 = emptyPad()
        const keys2 = emptyPad()
        const latch1 = new Set()
        const latch2 = new Set()
        const drained = (keys, latch) => {
            const p = { ...keys }
            for (const k of latch) { p[k] = true }
            latch.clear()
            return p
        }
        const guestPick = { char: null }

        // ---- net (#1039 lobby + pad lockstep; the wire carries all nine verbs) ----
        const nq = new URLSearchParams(window.location.search)
        const netRole = lobbyRole(window.location.search)
        const relayUrl = relayFromQuery(window.location.search)
        const net = { active: !!netRole, role: netRole, phase: netRole ? 'idle' : 'off', slot: netRole === 'host' ? 0 : 1, code: '', seats: [], joinHref: '' }
        let ws = null
        const makeTransport = (url) => {
            ws = new WebSocket(url)
            return {
                send: (s) => { try { if (ws && ws.readyState === 1) ws.send(s) } catch { /* gone */ } },
                onMessage: (cb) => { ws.onmessage = (ev) => cb(ev.data) },
                onClose: (cb) => { ws.onclose = () => cb() },
                close: () => { try { if (ws) ws.close() } catch { /* gone */ } },
            }
        }
        const pushNetUi = () => setNetUi(net.active ? {
            role: net.role, phase: net.phase, code: net.code, slot: net.slot,
            seats: seatModel(SEATS, net.room ? net.room.slots : [net.slot]),
            joinHref: net.joinHref,
            names: ['HOST', 'CHALLENGER'],
        } : null)
        const netSend = (t, m) => { if (net.room) { try { net.room.send(t, m) } catch { /* closed */ } } }

        if (net.active) {
            const lobby = createLobby({
                slug: 'viper-pit',
                cap: SEATS,
                relay: relayUrl,
                makeTransport,
                shareRelay: !!nq.get('relay'),
                onState: (s) => { net.phase = s.phase; net.code = s.code; net.joinHref = s.joinHref; pushNetUi() },
                onRoster: ({ slots }) => { net.seats = slots.slice(); pushNetUi() },
                onJoin: () => pushNetUi(),
                onLeave: () => pushNetUi(),
                onStart: (m) => {
                    const sd = m.seed >>> 0
                    const hostChar = m.hostChar || 'riv'
                    p1Char = hostChar
                    p2Char = m.guestChar || seededChar(sd, hostChar)
                    startFight(sd, 'online')
                },
                on: {
                    pad: (m) => { if (padMirror[m.s | 0]) padMirror[m.s | 0].set(m.k | 0, m.p) },
                    hs: (m) => {
                        const k = m.k | 0, h = m.h >>> 0
                        peerH.set(k, h)
                        if (oursH.has(k) && oursH.get(k) !== h) { desyncRef.current = true; setDesync(true) }
                    },
                    pick: (m) => { if (net.role === 'host') guestPick.char = m.char },
                    gone: () => { if (screenRef.current === 'play') { desyncRef.current = true; setDesync(true) } },
                },
            })
            net.lobby = lobby
            net.room = lobby.room
            if (net.role === 'host') lobby.open()
            else lobby.join(nq.get('room'))
            pushNetUi()
        }

        const seededChar = (sd, not) => {
            for (let i = 0; i < ROSTER.length; i++) {
                const c = ROSTER[(sd + i * 7) % ROSTER.length].id
                if (c !== not) return c
            }
            return 'nyx'
        }

        // ---- rigs / stage ---------------------------------------------------------------
        const rebuildRigs = () => {
            if (rigs) {
                for (const r of rigs) { scene.scene.remove(r.root); scene.scene.remove(r.shadow) }
            }
            const d1 = BY_ID[p1Char] || ROSTER[0]
            const d2 = BY_ID[p2Char] || ROSTER[1]
            rigs = [buildFighter(d1), buildFighter(d2)]
            for (const r of rigs) { scene.scene.add(r.root); scene.scene.add(r.shadow) }
        }
        const rebuildStage = () => {
            if (stageFx) scene.scene.remove(stageFx.grp)
            stageFx = buildStage(scene.scene, stage)
        }

        // ---- flow ---------------------------------------------------------------------
        const startFight = (seed, m) => {
            mode = m
            mySeat = net.active ? (net.role === 'host' ? 0 : 1) : 0
            seedCounter = (seedCounter * 1103515245 + 12345) >>> 0
            const sd = (seed === undefined ? seedCounter : seed) >>> 0
            stage = STAGES[sd % STAGES.length]
            const d1 = BY_ID[p1Char] || ROSTER[0]
            const d2raw = BY_ID[p2Char] || ROSTER[1]
            const human2 = m !== 'cpu'
            gs = createMatch({ seed: sd, guardButton: true, juggle: true, guardCrush: true, p1: { ...d1, cpu: false }, p2: human2 ? { ...d2raw, cpu: false } : d2raw })
            lagHp = [gs.fighters[0].hp, gs.fighters[1].hp]
            comboFx = [0, 0]; comboVal = [0, 0]
            finishFx = 0; finishText = ''
            padMirror[0].clear(); padMirror[1].clear()
            oursH.clear(); peerH.clear()
            nextSend = 0
            desyncRef.current = false
            setDesync(false)
            pausedRef.current = false
            setPaused(false)
            rebuildRigs()
            rebuildStage()
            audioController.startMusic(stage.bed)
            quote = null
            if (d2raw.intro) say(d2raw, 'intro', 'intro')
            setSc('play')
        }

        const atAttract = () => {
            if (net.active) { setSc('select'); return }
            p2Picked = false
            setSc('select')
        }

        const atSelect = () => {
            const c = ROSTER[cursor]
            if (net.active) {
                if (net.role === 'host') {
                    net.lobby.start({ seed: (seedCounter = (seedCounter * 1103515245 + 12345) >>> 0), hostChar: c.id, guestChar: guestPick.char || seededChar(seedCounter, c.id) })
                } else {
                    guestPick.char = c.id
                    netSend('pick', { char: c.id })
                }
                return
            }
            if (mode === 'local') {
                if (!p2Picked) { p1Char = c.id; p2Picked = true; return }
                p2Char = c.id
            } else {
                p1Char = c.id
                ladderIdx = 0
                p2Char = LADDER[0]
            }
            startFight(undefined, mode === 'local' ? 'local' : 'cpu')
        }

        // ---- keys ------------------------------------------------------------------------
        const onKeyDown = (e) => {
            if (e.code === 'Escape' || e.code === 'Backquote' || (e.shiftKey && e.code === 'Slash')) {
                if (screenRef.current === 'play') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current) }
                return
            }
            if (pausedRef.current) return
            const scr = screenRef.current
            if (scr === 'attract') {
                if (e.code === 'Digit2' && !net.active) mode = 'local'
                else if (e.code === 'Digit1') mode = 'cpu'
                atAttract()
                return
            }
            if (scr === 'select') {
                if (e.code === 'Digit1' && !net.active) mode = 'cpu'
                if (e.code === 'Digit2' && !net.active) mode = 'local'
                if (e.code === 'ArrowLeft' || e.code === 'KeyA') cursor = (cursor + ROSTER.length - 1) % ROSTER.length
                if (e.code === 'ArrowRight' || e.code === 'KeyD') cursor = (cursor + 1) % ROSTER.length
                if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') atSelect()
                if (/^Digit[3-7]$/.test(e.code)) { cursor = Number(e.code.slice(5)) - 3; atSelect() }
                return
            }
            if (scr === 'champion') {
                if (e.code === 'Space' || e.code === 'Enter') atAttract()
                return
            }
            if (desyncRef.current && (e.code === 'Space' || e.code === 'Enter')) {
                desyncRef.current = false; setDesync(false); atAttract()
                return
            }
            if (scr !== 'play') return
            const k1 = KEY_P1[e.code]
            if (k1) { keys1[k1] = true; latch1.add(k1); if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault() }
            const k2 = KEY_P2[e.code]
            if (mode === 'local' && k2) { keys2[k2] = true; latch2.add(k2); e.preventDefault() }
        }
        const onKeyUp = (e) => {
            const k1 = KEY_P1[e.code]
            if (k1) keys1[k1] = false
            const k2 = KEY_P2[e.code]
            if (k2) keys2[k2] = false
        }
        // the on-screen GUARD button dispatches KeyO exactly like the pad's taps
        const guardDown = (e) => {
            e.preventDefault()
            if (screenRef.current !== 'play' || pausedRef.current) return
            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyO', key: 'KeyO', bubbles: true }))
        }
        const guardUp = (e) => {
            if (e) e.preventDefault()
            window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyO', key: 'KeyO', bubbles: true }))
        }
        guardRef.current = { down: guardDown, up: guardUp }
        const onPointer = () => {
            const scr = screenRef.current
            if (scr === 'attract') atAttract()
            else if (scr === 'select') atSelect()
            else if (scr === 'champion') atAttract()
        }
        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)
        wrap.addEventListener('pointerdown', onPointer)

        // ---- attract demo ------------------------------------------------------------
        const attractDemo = () => {
            seedCounter = (seedCounter + 0x9e3779b9) >>> 0
            const a = BY_ID.riv, b = BY_ID.krax
            gs = createMatch({ seed: seedCounter | 1, guardButton: true, juggle: true, guardCrush: true, p1: { ...a, cpu: true }, p2: { ...b, cpu: true } })
            stage = STAGES[seedCounter % STAGES.length]
            p1Char = 'riv'; p2Char = 'krax'
            rebuildRigs(); rebuildStage()
            audioController.startMusic(stage.bed)
            lagHp = [100, 100]
        }
        attractDemo()

        // ---- pads ------------------------------------------------------------------------
        const livePads = () => {
            if (mode === 'online') {
                const k = gs.tick
                const mine = mySeat === 0 ? keys1 : keys2
                while (nextSend <= k + PAD_DELAY) {
                    const wp = wirePad(mine)
                    padMirror[mySeat].set(nextSend, wp)
                    netSend('pad', { s: mySeat, k: nextSend, p: wp })
                    nextSend++
                }
                if (!padMirror[mySeat === 0 ? 1 : 0].has(k)) return null
                const p0 = padMirror[0].has(k) ? fromWire(padMirror[0].get(k)) : emptyPad()
                const p1 = padMirror[1].has(k) ? fromWire(padMirror[1].get(k)) : emptyPad()
                if (k % 120 === 0) {
                    padMirror[0].forEach((_, t) => { if (t < k - 60) padMirror[0].delete(t) })
                    padMirror[1].forEach((_, t) => { if (t < k - 60) padMirror[1].delete(t) })
                    oursH.forEach((_, t) => { if (t < k - 240) oursH.delete(t) })
                    peerH.forEach((_, t) => { if (t < k - 240) peerH.delete(t) })
                }
                return [p0, p1]
            }
            if (mode === 'local') return [drained(keys1, latch1), drained(keys2, latch2)]
            return [drained(keys1, latch1), emptyPad()]
        }

        // ---- audio + fx ------------------------------------------------------------------
        const hearEvents = (m) => {
            while (m.events.length) {
                const e = m.events.shift()
                if (e.kind === 'hit') {
                    audioController.playNoise(0.07, 0.16)
                    audioController.playTone(e.dmg >= 9 ? 84 : 120, 0.1, 'sawtooth', 0.12)
                    const mdef = m.fighters[e.by].def.moves[e.mv]
                    if (mdef && mdef.type === 'throw') {
                        // throw slam: the grunt happened at startup, the slam lands now
                        audioController.playNoise(0.22, 0.24)
                        audioController.playSweep(95, 28, 0.26, 'sawtooth', 0.16)
                        shake = Math.max(shake, 10)
                    }
                    shake = Math.max(shake, e.dmg >= 9 ? 10 : 6)
                    if (e.combo >= 2) { comboVal[e.by] = e.combo; comboFx[e.by] = 70 }
                    scene.spark(m.fighters[e.by === 0 ? 1 : 0].x, 1.5, e.dmg >= 9 ? 0xffb050 : 0xffe8e0)
                } else if (e.kind === 'block') {
                    audioController.playTone(640, 0.03, 'square', 0.05)
                    scene.spark(m.fighters[e.by === 0 ? 1 : 0].x, 1.35, 0xbfd8ff)
                } else if (e.kind === 'crush') {
                    // guard break — the defender's guard shatters: a hard crack,
                    // a screen jolt, and a big punish window opens.
                    shake = Math.max(shake, 14); flashT = Math.max(flashT, 12)
                    bannerText = 'GUARD BREAK'; bannerT = 80
                    audioController.playSweep(560, 84, 0.28, 'sawtooth', 0.15)
                    audioController.playNoise(0.18, 0.18)
                    audioController.playTone(70, 0.2, 'square', 0.1)
                    scene.spark(m.fighters[e.by === 0 ? 1 : 0].x, 1.3, 0x39d8c8)
                } else if (e.kind === 'finish') {
                    shake = 18; flashT = 26; finishFx = 200
                    finishText = (m.fighters[e.by].def.finish || 'FINISH').toUpperCase()
                    audioController.playSweep(160, 40, 0.8, 'sawtooth', 0.18)
                    audioController.playNoise(0.4, 0.22)
                    // per-fighter finisher sting — each signature move gets its own voice
                    const fid = m.fighters[e.by].def.id
                    if (fid === 'nyx') {
                        ;[220, 330, 440].forEach((sf, i) => audioController.playTone(sf, 0.09, 'sawtooth', 0.09, 0.1 + i * 0.09))
                    } else if (fid === 'cinder') {
                        audioController.playSweep(140, 520, 0.5, 'sawtooth', 0.1)
                        audioController.playFilteredNoise(0.5, 0.12, 900)
                    } else if (fid === 'vess') {
                        audioController.playTone(200, 0.1, 'square', 0.09, 0.1)
                        audioController.playTone(90, 0.18, 'sine', 0.14, 0.2)
                    } else if (fid === 'riv') {
                        audioController.playSweep(880, 160, 0.3, 'sawtooth', 0.09)
                        audioController.playTone(1245, 0.06, 'square', 0.07, 0.05)
                    } else {
                        audioController.playTone(82, 0.22, 'square', 0.12)
                        audioController.playSweep(300, 90, 0.24, 'square', 0.08)
                    }
                    scene.spark(m.fighters[e.by === 0 ? 1 : 0].x, 1.4, 0xff4030)
                    scene.spark(m.fighters[e.by === 0 ? 1 : 0].x, 1.8, 0xffd050)
                    const qcbf = m.fighters[e.by].def.moves.qcbf
                    finishCine = { beats: (qcbf && qcbf.beats) || ['stitch', 'stitch', 'slam'], by: e.by, startedAt: performance.now(), fired: -1 }
                }
            }
        }

        // swing sounds fire at move START (the hit sound plays on impact). A
        // launcher whooshes, a throw grunts; cancels re-trigger so every move
        // in a chain earns its own swing.
        const hearSwings = (m, pre) => {
            m.fighters.forEach((f, i) => {
                if (f.st === 'attack' && pre[i] !== 'attack:' + f.move) {
                    const mv = f.def.moves[f.move]
                    if (!mv) return
                    if (mv.launch) {
                        audioController.playSweep(160, 640, 0.16, 'sawtooth', 0.055)
                        audioController.playFilteredNoise(0.13, 0.09, 1600)
                    } else if (mv.type === 'throw') {
                        audioController.playSweep(120, 55, 0.15, 'sawtooth', 0.1)
                        audioController.playTone(64, 0.12, 'square', 0.07)
                    }
                }
            })
        }

        // #1106 dialogue: the pits talk trash — the opponent taunts at the round
        // intro, the winner gets the last word over the loser's reply at the
        // outround. Each voice is a 3-note blip in the fighter's own register
        // (synth only, no assets).
        const voiceBlip = (d) => {
            ;(d.voice || [300, 260, 340]).forEach((hz, i) => audioController.playTone(hz, 0.05, 'square', 0.05, i * 0.07))
        }
        const say = (d, field, kind, sub) => {
            const text = d[field]
            if (!text) return
            quote = { name: d.name, text, sub: sub || null, kind, t: QUOTE_T }
            voiceBlip(d)
        }

        let retryTimer = null
        const watchPhase = (m, prevPhase, prevRound) => {
            if (m.phase === 'ko' && prevPhase !== 'ko') {
                audioController.playSweep(200, 50, 0.7, 'sawtooth', 0.16)
                audioController.playNoise(0.32, 0.2)
                audioController.playFilteredNoise(1.1, 0.16, 480)
                shake = Math.max(shake, 14); flashT = Math.max(flashT, 18)
                bannerText = m.banner; bannerT = 130
            } else if (m.phase === 'fight' && prevPhase === 'intro') {
                bannerText = 'FIGHT!'; bannerT = 50
                audioController.playTone(660, 0.12, 'square', 0.1)
                setTimeout(() => audioController.playTone(440, 0.16, 'square', 0.1), 140)
            } else if (m.phase === 'intro' && prevRound < m.round) {
                bannerText = m.banner; bannerT = 110
                audioController.playTone(494, 0.1, 'square', 0.08)
                say(m.fighters[1].def, 'intro', 'intro')
            }
            if (m.phase === 'done' && prevPhase !== 'done') {
                const wd = m.fighters[m.winner].def
                const ld = m.fighters[1 - m.winner].def
                say(wd, 'win', 'win', ld.name + ': ' + ld.lose)
                const won = m.winner === 0
                if (mode === 'cpu') {
                    if (won && ladderIdx < LADDER.length - 1) {
                        audioController.playTone(587, 0.12, 'square', 0.1)
                        setTimeout(() => audioController.playTone(784, 0.16, 'square', 0.1), 130)
                        retryTimer = setTimeout(() => {
                            if (screenRef.current === 'play' && gs.phase === 'done') {
                                ladderIdx++
                                p2Char = LADDER[ladderIdx]
                                startFight(undefined, 'cpu')
                            }
                        }, 2600)
                    } else if (won) {
                        ;[0, 3, 7, 10].forEach((semi, i) => setTimeout(() => audioController.playTone(440 * Math.pow(2, semi / 12), 0.2, 'sawtooth', 0.1), i * 130))
                        setSc('champion')
                        attractDemo()
                    } else {
                        audioController.playSweep(360, 100, 0.5, 'sawtooth', 0.1)
                        retryTimer = setTimeout(() => {
                            if (screenRef.current === 'play' && gs.phase === 'done') startFight(undefined, 'cpu')
                        }, 2600)
                    }
                } else if (mode === 'local') {
                    retryTimer = setTimeout(() => {
                        if (screenRef.current === 'play' && gs.phase === 'done') { p2Picked = false; attractDemo() }
                    }, 3400)
                }
            }
        }

        // ---- HUD ------------------------------------------------------------------------
        const hex = (n) => `#${n.toString(16).padStart(6, '0')}`
        const drawHud = (W, H) => {
            hctx.clearRect(0, 0, W, H)
            const scr = screenRef.current
            if (!gs) return
            const f = gs.fighters
            const ui = (px) => { hctx.font = `bold ${px}px "Arial Black", "Courier New", monospace` }

            if (scr === 'play' || scr === 'champion') {
                const bw = W * 0.36, bh = Math.max(14, H * 0.04), by = H * 0.05
                for (let i = 0; i < 2; i++) {
                    const x = i === 0 ? W * 0.03 : W - W * 0.03 - bw
                    const maxHp = f[i].def.hp || 100
                    const frac = Math.max(0, f[i].hp) / maxHp
                    lagHp[i] = frac < lagHp[i] ? lagHp[i] - 0.004 : frac
                    hctx.fillStyle = '#101018'; hctx.fillRect(x - 4, by - 4, bw + 8, bh + 8)
                    hctx.strokeStyle = '#54586a'; hctx.lineWidth = 2; hctx.strokeRect(x - 4, by - 4, bw + 8, bh + 8)
                    const lagW = bw * Math.max(0, Math.min(1, lagHp[i]))
                    hctx.fillStyle = '#8a1f1f'
                    hctx.fillRect(i === 0 ? x : x + bw - lagW, by, lagW, bh)
                    const grad = hctx.createLinearGradient(0, by, 0, by + bh)
                    grad.addColorStop(0, frac > 0.3 ? '#ffd23e' : '#ff7a3c')
                    grad.addColorStop(1, frac > 0.3 ? '#e08a1e' : '#c22a1c')
                    hctx.fillStyle = grad
                    const w = bw * frac
                    hctx.fillRect(i === 0 ? x : x + bw - w, by, w, bh)
                    ui(Math.max(11, H * 0.024))
                    hctx.textAlign = i === 0 ? 'left' : 'right'
                    hctx.fillStyle = '#e8e6f0'
                    hctx.fillText(f[i].def.name, i === 0 ? x : x + bw, by + bh + Math.max(15, H * 0.03))
                    hctx.fillStyle = '#7a8098'
                    ui(Math.max(8, H * 0.015))
                    hctx.fillText(f[i].def.tag, i === 0 ? x : x + bw, by + bh + Math.max(28, H * 0.052))
                    const star = Math.max(5, H * 0.009)
                    for (let wn = 0; wn < gs.rounds; wn++) {
                        hctx.fillStyle = wn < f[i].wins ? '#ffd23e' : '#31364a'
                        hctx.beginPath(); hctx.arc(i === 0 ? x + bw + star * 2 + wn * star * 2.4 : x - star * 2 - wn * star * 2.4, by + star, star, 0, Math.PI * 2); hctx.fill()
                    }
                    const mw = W * 0.28, mhh = Math.max(7, H * 0.016), my = H * 0.9
                    const mx = i === 0 ? W * 0.03 : W - W * 0.03 - mw
                    hctx.fillStyle = '#141018'; hctx.fillRect(mx, my, mw, mhh)
                    hctx.fillStyle = f[i].meter >= 100 ? '#ff5a3c' : '#7a4aff'
                    hctx.fillRect(i === 0 ? mx : mx + mw - mw * (f[i].meter / 100), my, mw * (f[i].meter / 100), mhh)
                    if (f[i].meter >= 100) {
                        ui(Math.max(10, H * 0.02))
                        hctx.fillStyle = `rgba(255,90,60,${(0.55 + 0.45 * Math.sin(gs.tick * 0.22)).toFixed(2)})`
                        hctx.textAlign = i === 0 ? 'left' : 'right'
                        hctx.fillText('FINISH READY', i === 0 ? mx : mx + mw, my - 5)
                    }
                    // guard-crush gauge: a thin strip above the meter — calm teal
                    // while full, flashing red as it nears empty (guard about to
                    // break), dead-empty and red while the guard is crushed.
                    const gh = Math.max(4, H * 0.009), gy = my - gh - 5
                    const gfrac = Math.max(0, Math.min(1, f[i].guard / 100))
                    const crushed = f[i].st === 'crush'
                    hctx.fillStyle = crushed ? '#3a0f14' : '#0d1517'
                    hctx.fillRect(i === 0 ? mx : mx + mw - mw, gy, mw, gh)
                    hctx.fillStyle = crushed ? '#ff5a3c' : (gfrac < 0.28 ? (Math.sin(gs.tick * 0.5) > 0 ? '#ff5a3c' : '#c22a1c') : '#39d8c8')
                    hctx.fillRect(i === 0 ? mx : mx + mw - mw * gfrac, gy, mw * gfrac, gh)
                    if (comboFx[i] > 0) {
                        comboFx[i]--
                        const pop = comboFx[i] > 54 ? 1 + (comboFx[i] - 54) / 40 : 1
                        ui(Math.max(16, H * 0.034) * pop)
                        hctx.textAlign = 'center'
                        const tier = comboVal[i] >= 6 ? '#ff5a3c' : comboVal[i] >= 4 ? '#b07aff' : '#ffd23e'
                        const r = parseInt(tier.slice(1, 3), 16), g = parseInt(tier.slice(3, 5), 16), b = parseInt(tier.slice(5, 7), 16)
                        hctx.fillStyle = `rgba(${r},${g},${b},${Math.min(1, comboFx[i] / 30).toFixed(2)})`
                        hctx.fillText(`${comboVal[i]} HIT COMBO`, i === 0 ? W * 0.22 : W * 0.78, H * 0.3)
                    }
                }
                ui(Math.max(22, H * 0.05))
                hctx.textAlign = 'center'
                hctx.fillStyle = '#0b0b12'
                hctx.fillRect(W / 2 - Math.max(30, W * 0.033), by - 4, Math.max(60, W * 0.066), bh + 8)
                hctx.strokeStyle = '#54586a'; hctx.strokeRect(W / 2 - Math.max(30, W * 0.033), by - 4, Math.max(60, W * 0.066), bh + 8)
                hctx.fillStyle = gs.timer <= 600 && gs.phase === 'fight' ? '#ff5a3c' : '#fff'
                hctx.fillText(String(Math.max(0, Math.ceil(gs.timer / 60))).padStart(2, '0'), W / 2, by + bh)
                if (bannerT > 0) {
                    bannerT--
                    ui(Math.max(34, H * 0.09))
                    hctx.textAlign = 'center'
                    hctx.strokeStyle = 'rgba(10,6,10,0.9)'; hctx.lineWidth = Math.max(3, H * 0.008)
                    hctx.fillStyle = `rgba(255,240,230,${Math.min(1, bannerT / 20 + 0.4).toFixed(2)})`
                    hctx.strokeText(bannerText, W / 2, H * 0.42)
                    hctx.fillText(bannerText, W / 2, H * 0.42)
                }
                if (finishFx > 0) {
                    finishFx--
                    ui(Math.max(20, H * 0.052))
                    hctx.textAlign = 'center'
                    hctx.fillStyle = `rgba(255,64,48,${Math.min(1, finishFx / 60).toFixed(2)})`
                    hctx.fillText(finishText, W / 2, H * 0.54)
                }
                if (quote && quote.t > 0) {
                    quote.t--
                    ui(Math.max(12, H * 0.026))
                    hctx.textAlign = 'center'
                    const qh = Math.max(52, H * 0.11) + (quote.sub ? Math.max(18, H * 0.034) : 0)
                    const qw = Math.max(
                        hctx.measureText(quote.name).width,
                        hctx.measureText(quote.text).width,
                        quote.sub ? hctx.measureText(quote.sub).width : 0) + Math.max(36, W * 0.05)
                    const qy = H * 0.72
                    hctx.fillStyle = 'rgba(8,6,12,0.78)'; hctx.fillRect(W / 2 - qw / 2, qy - qh / 2, qw, qh)
                    hctx.strokeStyle = quote.kind === 'win' ? '#ffd23e' : '#59e0c8'; hctx.lineWidth = 2
                    hctx.strokeRect(W / 2 - qw / 2, qy - qh / 2, qw, qh)
                    const fade = Math.min(1, quote.t / 25 + 0.5)
                    hctx.fillStyle = `rgba(89,224,200,${fade.toFixed(2)})`
                    hctx.fillText(quote.name, W / 2, qy - qh / 2 + Math.max(20, H * 0.04))
                    const typed = quote.text.slice(0, Math.min(quote.text.length, Math.floor((QUOTE_T - quote.t) / 2)))
                    hctx.fillStyle = `rgba(255,244,235,${fade.toFixed(2)})`
                    hctx.fillText(typed, W / 2, qy - qh / 2 + Math.max(44, H * 0.084))
                    if (quote.sub) {
                        ui(Math.max(10, H * 0.02))
                        hctx.fillStyle = `rgba(160,165,190,${Math.min(1, quote.t / 40).toFixed(2)})`
                        hctx.fillText(quote.sub, W / 2, qy + qh / 2 - Math.max(9, H * 0.016))
                    }
                }
                if (flashT > 0) { flashT--; hctx.fillStyle = `rgba(255,235,220,${(flashT / 60).toFixed(2)})`; hctx.fillRect(0, 0, W, H) }
                if (desync && net.active) {
                    hctx.fillStyle = 'rgba(5,5,10,0.72)'; hctx.fillRect(0, 0, W, H)
                    ui(Math.max(22, H * 0.05))
                    hctx.fillStyle = '#ff5a3c'; hctx.fillText('OUT OF SYNC', W / 2, H * 0.45)
                    ui(Math.max(12, H * 0.024))
                    hctx.fillStyle = '#fff'; hctx.fillText('PRESS SPACE', W / 2, H * 0.55)
                }
            }
            if (scr === 'attract') {
                hctx.fillStyle = 'rgba(5,4,10,0.5)'; hctx.fillRect(0, 0, W, H)
                const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 320)
                ui(Math.max(40, H * 0.11))
                hctx.textAlign = 'center'
                hctx.strokeStyle = 'rgba(30,120,110,0.9)'; hctx.lineWidth = Math.max(4, H * 0.012)
                hctx.strokeText('VIPER PIT', W / 2, H * 0.3)
                hctx.fillStyle = '#59e0c8'
                hctx.fillText('VIPER PIT', W / 2, H * 0.3)
                ui(Math.max(11, H * 0.022))
                hctx.fillStyle = 'rgba(220,220,235,0.75)'
                hctx.fillText('NO RULES · NO MERCY · NO BACK-WALK BLOCKING', W / 2, H * 0.37)
                ui(Math.max(12, H * 0.024))
                hctx.fillStyle = `rgba(255,255,255,${pulse.toFixed(2)})`
                hctx.fillText('PRESS ANY KEY', W / 2, H * 0.44)
                hctx.fillStyle = 'rgba(200,205,225,0.85)'
                hctx.fillText(MESSAGES[attractMsg % MESSAGES.length], W / 2, H * 0.85)
                ui(Math.max(10, H * 0.02))
                hctx.fillStyle = 'rgba(160,165,190,0.8)'
                hctx.fillText(net.active ? `ROOM ${net.code || '····'}` : '1 STREET LADDER     2 LOCAL 2P', W / 2, H * 0.92)
            }
            if (scr === 'select') {
                hctx.fillStyle = 'rgba(5,4,10,0.82)'; hctx.fillRect(0, 0, W, H)
                ui(Math.max(20, H * 0.045))
                hctx.textAlign = 'center'
                hctx.fillStyle = '#59e0c8'
                hctx.fillText(p2Picked ? 'PLAYER 2 — CHOOSE' : net.active ? (net.role === 'host' ? 'HOST — CHOOSE' : 'GUEST — CHOOSE') : 'CHOOSE YOUR FIGHTER', W / 2, H * 0.12)
                const cw = Math.min(W * 0.3, H * 0.5), ch = cw * 0.78
                const total = ROSTER.length
                ROSTER.forEach((rd, i) => {
                    const col = i % 5
                    const x = W / 2 - (cw * 1.06 * total) / 2 + col * (cw * 1.06), y = H * 0.24
                    hctx.fillStyle = '#12121c'; hctx.fillRect(x, y, cw, ch)
                    hctx.strokeStyle = i === cursor ? '#59e0c8' : '#31364a'
                    hctx.lineWidth = i === cursor ? 3 : 1
                    hctx.strokeRect(x, y, cw, ch)
                    hctx.fillStyle = hex(rd.color.skin); hctx.fillRect(x + cw * 0.4, y + ch * 0.12, cw * 0.2, ch * 0.2)
                    hctx.fillStyle = hex(rd.color.top); hctx.fillRect(x + cw * 0.32, y + ch * 0.36, cw * 0.36, ch * 0.28)
                    hctx.fillStyle = hex(rd.color.accent); hctx.fillRect(x + cw * 0.32, y + ch * 0.36, cw * 0.36, ch * 0.05)
                    hctx.fillStyle = hex(rd.color.pants); hctx.fillRect(x + cw * 0.36, y + ch * 0.64, cw * 0.28, ch * 0.1)
                    ui(Math.max(11, H * 0.022))
                    hctx.textAlign = 'center'
                    hctx.fillStyle = '#fff'
                    hctx.fillText(rd.name, x + cw / 2, y + ch * 0.85)
                    ui(Math.max(8, H * 0.014))
                    hctx.fillStyle = 'rgba(190,195,215,0.85)'
                    hctx.fillText(rd.tag, x + cw / 2, y + ch * 0.95)
                })
                ui(Math.max(11, H * 0.021))
                hctx.textAlign = 'center'
                hctx.fillStyle = 'rgba(255,255,255,0.9)'
                hctx.fillText(net.active
                    ? (net.role === 'host' ? `ROOM ${net.code} — SPACE: FIGHT` : 'WAITING FOR HOST…')
                    : `MODE: ${mode === 'local' ? (p2Picked ? 'P2 PICK' : 'P1 PICK') : 'STREET LADDER'} — 1/2 SWITCH · ARROWS · SPACE`, W / 2, H * 0.92)
                ui(Math.max(9, H * 0.017))
                hctx.fillStyle = 'rgba(140,145,170,0.9)'
                hctx.fillText('EACH FIGHTER OWNS A FINISHING MOVE — FULL BAR, DOWN-BACK-DOWN-FORWARD + PUNCH', W / 2, H * 0.965)
            }
            if (scr === 'champion') {
                hctx.fillStyle = 'rgba(5,4,10,0.6)'; hctx.fillRect(0, 0, W, H)
                ui(Math.max(28, H * 0.07))
                hctx.textAlign = 'center'
                hctx.fillStyle = '#59e0c8'
                hctx.fillText('KING OF THE PIT', W / 2, H * 0.4)
                ui(Math.max(13, H * 0.026))
                hctx.fillStyle = '#fff'
                hctx.fillText(`${(BY_ID[p1Char] || ROSTER[0]).name} SURVIVES THE NIGHT`, W / 2, H * 0.5)
                hctx.fillStyle = 'rgba(89,224,200,0.9)'
                hctx.fillText(`"${(BY_ID[p1Char] || ROSTER[0]).win || 'KING OF THE PIT.'}"`, W / 2, H * 0.56)
                hctx.fillText('PRESS ANY KEY', W / 2, H * 0.62)
            }
            if (paused && scr === 'play') {
                hctx.fillStyle = 'rgba(4,3,8,0.45)'; hctx.fillRect(0, 0, W, H)
            }
        }

        // ---- resize ----------------------------------------------------------------------
        const resize = () => {
            const cw = wrap.clientWidth || 960, chh = wrap.clientHeight || 540
            const dpr = Math.min(2, window.devicePixelRatio || 1)
            const w = Math.round(cw * dpr), h = Math.round(chh * dpr)
            gl.width = w; gl.height = h
            hud.width = w; hud.height = h
            gl.style.width = hud.style.width = `${cw}px`
            gl.style.height = hud.style.height = `${chh}px`
            scene.resize(w, h)
        }
        resize()
        window.addEventListener('resize', resize)

        // ---- loop --------------------------------------------------------------------------
        let dbg = null
        const loop = (now) => {
            if (!alive) return
            raf = requestAnimationFrame(loop)
            if (!last) last = now
            const dt = Math.min(120, now - last)
            last = now
            acc += dt
            let steps = 0
            const scr = screenRef.current
            attractT += dt
            if (attractT > 3000) { attractT = 0; attractMsg++ }
            while (acc >= SIM_MS && steps < 5) {
                acc -= SIM_MS
                steps++
                if (contractHoldsLoop()) { acc = 0; break }
                if (scr === 'attract' && gs) {
                    step(gs, [emptyPad(), emptyPad()])
                    if (gs.phase === 'done') attractDemo()
                } else if (scr === 'play' && !pausedRef.current && !desyncRef.current && gs) {
                    const prevPhase = gs.phase, prevRound = gs.round
                    const pads = livePads()
                    if (pads) {
                        const preSwing = gs.fighters.map((f) => f.st + ':' + f.move)
                        step(gs, pads)
                        if (mode === 'online' && gs.tick % HASH_EVERY === 0) {
                            const h = matchHash(gs)
                            oursH.set(gs.tick, h)
                            netSend('hs', { k: gs.tick, h })
                            if (peerH.has(gs.tick) && peerH.get(gs.tick) !== h) { desyncRef.current = true; setDesync(true) }
                        }
                        hearEvents(gs)
                        hearSwings(gs, preSwing)
                        watchPhase(gs, prevPhase, prevRound)
                    }
                }
            }
            if (shake > 0) shake *= 0.88
            // FINISH cinematic: the signature finish plays out as a multi-beat
            // sequence over the KO freeze — a camera punch-in, a per-beat blow,
            // and the loser scripted through the fighter's beats. Presentation
            // only (wall-clock driven), so the engine + netplay hashes are untouched.
            cine = null
            if (finishCine && scr === 'play') {
                const beats = finishCine.beats
                const ACTIVE0 = 140, BEAT_MS = 250
                const endAt = finishCine.startedAt + ACTIVE0 + beats.length * BEAT_MS
                if (now >= endAt) {
                    finishCine = null
                } else {
                    const t = now - finishCine.startedAt
                    if (t >= ACTIVE0) {
                        const i = Math.min(beats.length - 1, Math.floor((t - ACTIVE0) / BEAT_MS))
                        const isLast = i === beats.length - 1
                        if (finishCine.fired !== i) {
                            finishCine.fired = i
                            const v = gs.fighters[1 - finishCine.by]
                            if (i === 0) { audioController.playTone(96, 0.08, 'square', 0.13); audioController.playNoise(0.05, 0.15) }
                            else if (!isLast) { audioController.playSweep(240, 540, 0.12, 'sawtooth', 0.11); audioController.playNoise(0.06, 0.17) }
                            else { audioController.playSweep(330, 70, 0.32, 'sawtooth', 0.17); audioController.playNoise(0.28, 0.27) }
                            shake = Math.max(shake, 8 + i * 5)
                            scene.spark(v.x, 1.5, 0xff6a30)
                        }
                        const k = Math.max(0, Math.min(1, (now - (finishCine.startedAt + ACTIVE0 + i * BEAT_MS)) / BEAT_MS))
                        cine = { side: 1 - finishCine.by, kind: beats[i], k, zoom: (1.0 + i * 0.5) * Math.sin(Math.PI * k) }
                    }
                }
            }
            if (gs && stageFx && rigs) {
                scene.sync(gs, rigs, stageFx, now / 1000, shake > 0.4 ? shake * 0.02 : 0, cine)
                scene.render()
            }
            drawHud(hud.width, hud.height)
        }

        raf = requestAnimationFrame(loop)

        // ---- dev hooks -----------------------------------------------------------------------
        if (import.meta.env.DEV) {
            window.__viperPitTest = {
                get state() { return gs ? { phase: gs.phase, tick: gs.tick, screen: screenRef.current, mode, bed: audioController.music ? audioController.music.track : null, x: gs.fighters.map((f) => +f.x.toFixed(2)), hp: gs.fighters.map((f) => f.hp), wins: gs.fighters.map((f) => f.wins), st: gs.fighters.map((f) => f.move || f.st) } : null },
                setChars(a, b) { p1Char = a; p2Char = b; startFight(7, mode === 'cpu' ? 'cpu' : mode) },
                start() { startFight(7, 'cpu') },
                koP2() { if (gs) forceKO(gs, 0) },
                finisherReady() { if (gs) { gs.fighters[0].meter = 100; gs.fighters[1].hp = Math.min(gs.fighters[1].hp, 25) } },
                stage(i) { startFight(i, 'cpu') },
                sweep() { if (stageFx && stageFx.sweep) stageFx.sweep.force = performance.now() / 1000 },
                midKick() { if (stageFx && stageFx.mid) stageFx.mid.force = 1 },
                guard() { return gs ? gs.fighters.map((f) => Math.round(f.guard)) : null },
                forceCrush() { if (gs) { const f = gs.fighters[1]; f.st = 'crush'; f.stun = 46; f.sf = 0; f.guard = 0 } },
                cine() { return finishCine ? { active: true, by: finishCine.by, i: finishCine.fired, kind: finishCine.beats[finishCine.fired], beats: finishCine.beats } : { active: false, beats: null } },
                quote() { return quote && quote.t > 0 ? { name: quote.name, text: quote.text, sub: quote.sub, kind: quote.kind, t: quote.t } : null },
                forceFinish() { if (gs) { const d = gs.fighters[0].def.moves.qcbf; finishCine = { beats: (d && d.beats) || ['stitch', 'stitch', 'slam'], by: 0, startedAt: performance.now(), fired: -1 } } },
                forceQcb() { if (gs) { const f = gs.fighters[0]; if (f.def.moves.qcb) { f.st = 'attack'; f.sf = 0; f.move = 'qcb'; f.phase = 'startup'; f.hitOnce = {}; f.cancelGate = false } } },
                fx() {
                    if (!stageFx) return null
                    return {
                        id: stageFx.stage.id,
                        molten: stageFx.molten ? +stageFx.molten.mat.opacity.toFixed(3) : null,
                        moltenLight: stageFx.molten ? Math.round(stageFx.molten.light.intensity) : null,
                        rain: stageFx.rain ? stageFx.rain.n : null,
                        rainFallen: stageFx.rain ? +stageFx.rain.fallen.toFixed(2) : null,
                        sweep: stageFx.sweep ? +stageFx.sweep.prog.toFixed(3) : null,
                        mid: stageFx.mid ? stageFx.mid.n : null,
                        midSway: stageFx.mid ? +stageFx.mid.maxSway.toFixed(4) : null,
                    }
                },
            }
            dbg = mountDbg({
                title: 'VIPER PIT',
                state: () => (gs ? { phase: gs.phase, round: gs.round, timer: Math.ceil(gs.timer / 60), p1: `${gs.fighters[0].hp}hp ${Math.round(gs.fighters[0].meter)}m ${gs.fighters[0].st}${gs.fighters[0].move ? ':' + gs.fighters[0].move : ''}`, p2: `${gs.fighters[1].hp}hp ${Math.round(gs.fighters[1].meter)}m ${gs.fighters[1].st}${gs.fighters[1].move ? ':' + gs.fighters[1].move : ''}` } : {}),
                cheats: [
                    { label: 'P2 to 1 HP', run: () => { if (gs) gs.fighters[1].hp = 1 } },
                    { label: 'Fill P1 meter', run: () => { if (gs) gs.fighters[0].meter = 100 } },
                    { label: 'Arm finisher (P2 hurt)', run: () => { if (gs) { gs.fighters[0].meter = 100; gs.fighters[1].hp = Math.min(gs.fighters[1].hp, 25) } } },
                    { label: 'K.O. round', run: () => { if (gs) { gs.fighters[1].hp = 0; step(gs, [emptyPad(), emptyPad()]); hearEvents(gs) } } },
                ],
            })
            exposeGame({
                id: 'viper-pit',
                buttons: ['a', 'b'],
                reset(seed, players = 1) {
                    p1Char = 'riv'
                    p2Char = players >= 2 ? 'nyx' : LADDER[0]
                    mode = players >= 2 ? 'local' : 'cpu'
                    if (mode === 'cpu') p2Char = LADDER[0]
                    startFight(seed, mode)
                    return this.state()
                },
                tick(pad, pads) {
                    const p1 = padFromContract(pad)
                    const p2 = pads && pads[1] ? padFromContract(pads[1]) : emptyPad()
                    if (gs) { step(gs, [p1, p2]); hearEvents(gs) }
                    return this.state()
                },
                state() {
                    if (!gs) return { tick: 0, score: 0, done: false, hash: 0 }
                    return {
                        tick: gs.tick,
                        seed: gs.seed,
                        score: gs.fighters[0].wins * 1000 + Math.round(gs.fighters[0].hp),
                        done: gs.phase === 'done',
                        hash: matchHash(gs),
                        players: mode === 'local' || net.active ? 2 : 1,
                        fighters: fightersState(gs),
                    }
                },
                canvas() { return gl },
            })
        }

        return () => {
            alive = false
            cancelAnimationFrame(raf)
            audioController.stopMusic()
            clearTimeout(retryTimer)
            window.removeEventListener('keydown', onKeyDown)
            window.removeEventListener('keyup', onKeyUp)
            window.removeEventListener('resize', resize)
            wrap.removeEventListener('pointerdown', onPointer)
            guardRef.current = null
            if (net.lobby && net.lobby.destroy) net.lobby.destroy()
            if (import.meta.env.DEV) { unexposeGame(); unmountDbg(); delete window.__viperPitTest }
            scene.renderer.dispose()
            if (wrap.contains(gl)) wrap.removeChild(gl)
            if (wrap.contains(hud)) wrap.removeChild(hud)
            void dbg
        }
    }, [])

    const entry = GAMES.find((g) => g.label === 'VIPER PIT')
    return (
        <div className="relative h-full w-full bg-[#08080e]" style={{ minHeight: '100%' }}>
            <div ref={wrapRef} className="absolute inset-0" />
            <VirtualControls visible={screen === 'play' && !paused} secondAction={{ label: 'K', code: 'KeyZ' }} />
            {screen === 'play' && !paused && (
                <div
                    data-vc="guard"
                    className="fixed z-50 select-none rounded-full ring-1 ring-cyan-200/40 bg-emerald-500/25 backdrop-blur-md text-white font-bold shadow-[inset_0_1px_2px_rgba(255,255,255,0.3),0_4px_12px_rgba(0,0,0,0.45)] active:scale-95 active:brightness-150"
                    style={{ right: 'calc(0.75rem + env(safe-area-inset-right))', bottom: 'calc(5.5rem + env(safe-area-inset-bottom))', width: 58, height: 58, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, touchAction: 'none' }}
                    onPointerDown={(e) => guardRef.current && guardRef.current.down(e)}
                    onPointerUp={(e) => guardRef.current && guardRef.current.up(e)}
                    onPointerCancel={() => guardRef.current && guardRef.current.up()}
                >GUARD</div>
            )}
            {netUi && screen !== 'play' && (
                <div className="absolute top-2 right-2 z-20 max-w-[280px]">
                    <Lobby state={netUi} title="CHALLENGE" names={netUi.names} startHint="SPACE TO FIGHT" />
                </div>
            )}
            {paused && <PauseOverlay game={entry} onResume={() => { pausedRef.current = false; setPaused(false) }} />}
        </div>
    )
}

export default ViperPitGame
