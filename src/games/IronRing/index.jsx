// IRON RING — the cabinet (#1095). Rules live in the shared fighting core
// (`src/engine/fighting.js`), the roster in ./fighters.js, the look in
// ./render.js. Attract runs a CPU-vs-CPU bout; select a fighter; best-of-3
// against a 6-fighter arcade ladder (easy→insane). Modes: 1P ladder (default,
// phone-playable), local 2P (P1 arrows+JKUI, P2 WASD+FGBV) and head-to-head
// over the #1039 shared lobby (?net=host / ?net=join&room=CODE): pads on one
// seed with an 8-frame input delay, hash-checked every 30 ticks — the engine is
// pure and seeded, so both boxes run identical fights (#531 law).

import React, { useEffect, useRef, useState } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import Lobby from '../../components/Lobby'
import VirtualControls from '../../components/VirtualControls'
import WatchButton, { WatchToast } from '../../components/WatchButton'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { isWatchKey, playWatchStart, playWatchStop, watchSfxLog } from '../../utils/watch'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop, exposeFeedbackState, unexposeFeedbackState, seedFromQuery } from '../../utils/gameContract'
import { createLobby, lobbyRole, relayFromQuery, seatModel } from '../../utils/lobby.js'
import { createMatch, step, emptyPad, matchHash, fightersState, forceKO, FIXED_DT } from '../../engine/fighting.js'
import { ROSTER, BY_ID, LADDER, matchupLine } from './fighters.js'
import { createScene, buildFighter, buildStage, attachShelfProps } from './render.js'
import { STAGES } from './stages.js'
import { createHostSelect } from './netselect.js'

const SIM_MS = FIXED_DT
const SEATS = 2
const PAD_DELAY = 8
const HASH_EVERY = 30
const CREDITS_START = 3
const CONTINUE_FRAMES = 10 * 60

const wirePad = (p) => ({ l: !!p.left, r: !!p.right, u: !!p.up, d: !!p.down, lp: !!p.lp, hp: !!p.hp, lk: !!p.lk, hk: !!p.hk })
const fromWire = (p) => ({ left: !!(p && p.l), right: !!(p && p.r), up: !!(p && p.u), down: !!(p && p.d), lp: !!(p && p.lp), hp: !!(p && p.hp), lk: !!(p && p.lk), hk: !!(p && p.hk) })
const padFromContract = (pad) => ({
    left: !!(pad && pad.left), right: !!(pad && pad.right), up: !!(pad && pad.up), down: !!(pad && pad.down),
    lp: !!(pad && pad.a), hp: false, lk: !!(pad && pad.b), hk: false,
})

const KEY_P1 = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
    KeyJ: 'lp', KeyK: 'hp', KeyU: 'lk', KeyI: 'hk', Space: 'lp', KeyZ: 'lk',
}
const KEY_P2 = {
    KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down',
    KeyF: 'lp', KeyG: 'hp', KeyV: 'lk', KeyB: 'hk',
}
const MESSAGES = [
    'HOLD BACK TO BLOCK · DOWN-B LOCKS LOWS',
    'BLOCKING DRAINS YOUR GUARD — EMPTY MEANS CRUSH',
    'MASH ATTACKS TOO FAST AND YOU STUN YOURSELF',
    'A THROW CATCHES A JUMPER — TAP AN ATTACK TO BREAK FREE',
    'DOWN-FORWARD + PUNCH THROWS FIRE',
    'FORWARD-DOWN-UP CATCHES JUMPERS',
    'LIGHT INTO HEAVY INTO SPECIAL = COMBO',
    'FULL METER AUTOMATICALLY SUPERS',
    'FIRST TO 2 ROUNDS',
]

const IronRingGame = () => {
    const wrapRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [netUi, setNetUi] = useState(null)
    const [desync, setDesync] = useState(false)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const desyncRef = useRef(false)
    const [watching, setWatching] = useState(false) // #1637 WATCH: seat 1 fights on its own proven CPU brain
    const watchingRef = useRef(false)

    useEffect(() => {
        const wrap = wrapRef.current
        if (!wrap) return undefined
        const setSc = (s) => { screenRef.current = s; setScreen(s) }

        const gl = document.createElement('canvas')
        gl.dataset.ironringStage = '1'
        gl.style.touchAction = 'none'
        gl.style.position = 'absolute'
        gl.style.inset = '0'
        wrap.appendChild(gl)
        const hud = document.createElement('canvas')
        hud.dataset.ironringHud = '1'
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
        let seedCounter = (Date.now() >>> 0) ^ 0x12345
        let gs = null
        let mode = 'cpu'
        let mySeat = 0
        let ladderIdx = 0
        let p1Char = 'kade', p2Char = 'vexa'
        let p2Picked = false
        let cursor = 0
        let credits = CREDITS_START, continueFrames = 0, quoteText = '', concedeText = '', championChar = 'kade'
        let attractMsg = 0, attractT = 0
        let shake = 0, flashT = 0, bannerT = 0, bannerText = ''
        let comboFx = [0, 0], comboVal = [0, 0]
        let crushFx = [0, 0] // #1761 item 5: white-hot flash on the crushed side
        let stunFx = [0, 0] // #1785: daze flash on the stunned side
        let lagHp = [100, 100]
        let rigs = null
        let nextSend = 0
        const padMirror = [new Map(), new Map()]
        const oursH = new Map(), peerH = new Map()
        const keys1 = emptyPad()
        const keys2 = emptyPad()
        // press latch: a tap can fall entirely between two 60 fps polls; every
        // keydown is guaranteed to reach at least one sampled pad this way.
        const latch1 = new Set()
        const latch2 = new Set()
        const drained = (keys, latch) => {
            const p = { ...keys }
            for (const k of latch) { p[k] = true }
            latch.clear()
            return p
        }
        // #1761: the online select-start gate as a pure state machine — the host
        // may only launch once the guest's pick has landed over the wire.
        const hostSelect = createHostSelect()

        // ---- net (#1039 lobby + hand-rolled pad lockstep: the wire carries the
        // eight fighting verbs, so it skips the 6-bit lockstep normalizer) ----
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
        // The host is the launch authority; the seed keeps host authority
        // (Outpost precedent), generated at the actual launch — which the
        // netselect gate defers until the guest's pick has arrived.
        const launchNet = ({ hostChar, guestChar }) => {
            net.lobby.start({ seed: (seedCounter = (seedCounter * 1103515245 + 12345) >>> 0), hostChar, guestChar })
        }

        if (net.active) {
            const lobby = createLobby({
                slug: 'iron-ring',
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
                    const hostChar = m.hostChar || 'kade'
                    const guestChar = m.guestChar || seededChar(sd, hostChar)
                    p1Char = hostChar
                    p2Char = guestChar
                    startFight(sd, 'online')
                },
                on: {
                    pad: (m) => { if (padMirror[m.s | 0]) padMirror[m.s | 0].set(m.k | 0, m.p) },
                    hs: (m) => {
                        const k = m.k | 0, h = m.h >>> 0
                        peerH.set(k, h)
                        if (oursH.has(k) && oursH.get(k) !== h) { desyncRef.current = true; setDesync(true) }
                    },
                    pick: (m) => {
                        // #1761: a pick that lands AFTER the host committed to
                        // FIGHT is the moment the gate releases — launch now,
                        // with the guest's real choice (never a placeholder).
                        if (net.role === 'host') {
                            const r = hostSelect.onPick(m.char)
                            if (r.start && screenRef.current === 'select') launchNet(r.start)
                        }
                    },
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
            return 'vexa'
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
            attachShelfProps(stageFx)
        }

        // ---- flow ---------------------------------------------------------------------
        const startFight = (seed, m) => {
            mode = m
            mySeat = net.active ? (net.role === 'host' ? 0 : 1) : 0
            seedCounter = (seedCounter * 1103515245 + 12345) >>> 0
            // #1473: offline starts honor ?seed=N (online passes its seed
            // explicitly — the lobby seed keeps authority, Outpost precedent).
            // The engine is pure and seeded (#531 law), so a filed report +
            // this seed replays the same stage, pace and jitter.
            const pin = seedFromQuery()
            const sd = (seed === undefined ? (pin != null ? (pin >>> 0) || 1 : seedCounter) : seed) >>> 0
            stage = STAGES[sd % STAGES.length]
            const d1 = BY_ID[p1Char] || ROSTER[0]
            const d2raw = BY_ID[p2Char] || ROSTER[1]
            const human2 = m !== 'cpu'
            // #1761 item 5: the cabinet runs the guard-crush gauge — blocking
            // drains it, an empty guard CRUSHES into a punishable stagger.
            // #1785: the v2 remainder — inputStun (mashing stuns you) and
            // airThrow (a throw catches jumpers; a tap breaks the grab).
            gs = createMatch({ seed: sd, guardCrush: true, inputStun: true, airThrow: true, p1: { ...d1, cpu: false }, p2: human2 ? { ...d2raw, cpu: false } : d2raw })
            lagHp = [gs.fighters[0].hp, gs.fighters[1].hp]
            comboFx = [0, 0]; comboVal = [0, 0]; crushFx = [0, 0]; stunFx = [0, 0]
            padMirror[0].clear(); padMirror[1].clear()
            oursH.clear(); peerH.clear()
            nextSend = 0
            desyncRef.current = false
            setDesync(false)
            pausedRef.current = false
            setPaused(false)
            continueFrames = 0
            quoteText = ''; concedeText = ''
            rebuildRigs()
            rebuildStage()
            // #1637 WATCH across the ladder: a fight starting while the watcher
            // holds seat 1 re-seats the fighter's own proven CPU tier immediately.
            if (watchingRef.current && gs && !gs.done) gs.fighters[0].def.cpu = BY_ID[p1Char]?.cpu || 'normal'
            setSc('play')
        }

        const atAttract = (toSelect = false) => {
            watchingRef.current = false; setWatching(false) // #1637 the cabinet returns to the player
            if (net.active) { hostSelect.reset(); setSc('select'); return }
            p2Picked = false
            cursor = 0
            credits = CREDITS_START
            quoteText = ''; concedeText = ''
            continueFrames = 0
            // #1637 fix (found writing the watch pilot): an attract press inserts
            // a credit and advances to char SELECT (the pre-#1103 design) — since
            // #1104 unified both returns into atAttract(), offline players were
            // pinned on attract and select was unreachable. Coming back from the
            // champion screen still lands on attract.
            setSc(toSelect ? 'select' : 'attract')
        }

        const atSelect = () => {
            const c = ROSTER[cursor]
            if (net.active) {
                if (net.role === 'host') {
                    // #1761: the gate — a FIGHT press before the guest has
                    // picked defers the start; onPick fires it when the pick
                    // lands, so the guest's real choice always wins.
                    const r = hostSelect.commit(c.id)
                    if (r.start) launchNet(r.start)
                } else {
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
                atAttract(true) // insert coin → char select (offline), see atAttract
                return
            }
            if (scr === 'select') {
                if (e.code === 'Digit1' && !net.active) { mode = 'cpu'; audioController.playTone(523, 0.06, 'square', 0.07) }
                if (e.code === 'Digit2' && !net.active) { mode = 'local'; audioController.playTone(392, 0.06, 'square', 0.07) }
                if (e.code === 'ArrowLeft' || e.code === 'KeyA') { cursor = (cursor + ROSTER.length - 1) % ROSTER.length; audioController.playTone(660, 0.04, 'square', 0.06) }
                if (e.code === 'ArrowRight' || e.code === 'KeyD') { cursor = (cursor + 1) % ROSTER.length; audioController.playTone(660, 0.04, 'square', 0.06) }
                if (e.code === 'ArrowUp' || e.code === 'KeyW') { cursor = (cursor + ROSTER.length - 3) % ROSTER.length; audioController.playTone(660, 0.04, 'square', 0.06) }
                if (e.code === 'ArrowDown' || e.code === 'KeyS') { cursor = (cursor + 3) % ROSTER.length; audioController.playTone(660, 0.04, 'square', 0.06) }
                if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') audioController.playTone(880, 0.1, 'square', 0.1)
                if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') atSelect()
                if (/^Digit[3-8]$/.test(e.code)) { cursor = Number(e.code.slice(5)) - 3; audioController.playTone(880, 0.1, 'square', 0.1); atSelect() }
                return
            }
            if (scr === 'champion') {
                if (e.code === 'Space' || e.code === 'Enter') atAttract()
                return
            }
            if (scr === 'continue') {
                if (credits > 0 && (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyZ')) {
                    credits--; audioController.playTone(740, 0.12, 'square', 0.1)
                    startFight(undefined, 'cpu')
                }
                return
            }
            if (desyncRef.current && (e.code === 'Space' || e.code === 'Enter')) {
                desyncRef.current = false; setDesync(false); atAttract()
                return
            }
            if (scr !== 'play') return
            // #1637 WATCH: Y hands seat 1 to the engine's tiered CPU — the fighter's
            // own proven tier from ./fighters.js, the same pad-emitting driver
            // ironringcheck beats an idle dummy with at every tier. Closed loop:
            // it reads the live fight each decision, so seat/release mid-round is
            // honest. 1P ladder mode only — local 2P and the net wire own their pads.
            const seatable = mode === 'cpu' && !net.active && gs && !gs.done
            if (isWatchKey(e)) {
                if (watchingRef.current) {
                    watchingRef.current = false; setWatching(false); playWatchStop()
                    gs.fighters[0].def.cpu = false
                } else if (seatable) {
                    watchingRef.current = true; setWatching(true); playWatchStart()
                    gs.fighters[0].def.cpu = BY_ID[p1Char]?.cpu || 'normal'
                }
                return
            }
            if (watchingRef.current) {
                watchingRef.current = false; setWatching(false); playWatchStop()
                gs.fighters[0].def.cpu = false
            }
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
        const onPointer = () => {
            const scr = screenRef.current
            // #1637 WATCH: a touch on the cabinet hands seat 1 back mid-bout.
            if (scr === 'play' && watchingRef.current) {
                watchingRef.current = false; setWatching(false); playWatchStop()
                if (gs) gs.fighters[0].def.cpu = false
            }
            if (scr === 'attract') atAttract(true) // tap inserts a coin → select
            else if (scr === 'select') atSelect()
            else if (scr === 'champion') atAttract()
            else if (scr === 'continue' && credits > 0) { credits--; audioController.playTone(740, 0.12, 'square', 0.1); startFight(undefined, 'cpu') }
        }
        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)
        wrap.addEventListener('pointerdown', onPointer)

        // ---- attract demo ------------------------------------------------------------
        const attractDemo = () => {
            seedCounter = (seedCounter + 0x9e3779b9) >>> 0
            const a = BY_ID.vexa, b = BY_ID.hyde
            gs = createMatch({ seed: seedCounter | 1, guardCrush: true, inputStun: true, airThrow: true, p1: { ...a, cpu: true }, p2: { ...b, cpu: true } })
            stage = STAGES[seedCounter % STAGES.length]
            p1Char = 'vexa'; p2Char = 'hyde'
            rebuildRigs(); rebuildStage()
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
                    audioController.playNoise(0.06, 0.14)
                    audioController.playTone(e.dmg >= 9 ? 92 : 132, 0.09, 'square', 0.12)
                    shake = Math.max(shake, e.dmg >= 9 ? 9 : 5)
                    if (e.combo >= 2) { comboVal[e.by] = e.combo; comboFx[e.by] = 70 }
                    scene.spark(m.fighters[e.by === 0 ? 1 : 0].x, 1.4, e.dmg >= 9 ? 0xffd050 : 0xffffff)
                } else if (e.kind === 'block') {
                    audioController.playTone(760, 0.03, 'square', 0.05)
                    scene.spark(m.fighters[e.by === 0 ? 1 : 0].x, 1.3, 0x80c0ff)
                } else if (e.kind === 'crush') {
                    // guard break — the defender's guard shatters into a stagger:
                    // a hard crack down through the low end, the ring shakes.
                    const d = m.fighters[e.by === 0 ? 1 : 0]
                    audioController.playNoise(0.14, 0.2)
                    audioController.playSweep(320, 55, 0.4, 'sawtooth', 0.15)
                    shake = Math.max(shake, 11)
                    flashT = Math.max(flashT, 5)
                    bannerText = 'GUARD BREAK'; bannerT = 75
                    crushFx[d.side] = 22
                    scene.spark(d.x, 1.3, 0xcfe8ff)
                } else if (e.kind === 'stunned') {
                    // #1785 input stun — the masher is dazed: a wobbly ring-down
                    // on the low end, a daze flash on the side that over-mashed.
                    const d = m.fighters[e.by]
                    audioController.playSweep(560, 140, 0.3, 'square', 0.08)
                    audioController.playTone(110, 0.14, 'square', 0.09)
                    bannerText = 'STUNNED'; bannerT = 60
                    stunFx[d.side] = 20
                    scene.spark(d.x, 1.5, 0xc76bff)
                } else if (e.kind === 'airgrab') {
                    // #1785 air grab — a throw catches a jumper: a taut snap,
                    // the victim is wrenched into the escape window.
                    const d = m.fighters[e.by === 0 ? 1 : 0]
                    audioController.playTone(240, 0.05, 'square', 0.11)
                    audioController.playNoise(0.04, 0.08)
                    shake = Math.max(shake, 4)
                    bannerText = 'AIR GRAB'; bannerT = 40
                    scene.spark(d.x, d.y + 1.2, 0xffd23e)
                } else if (e.kind === 'airescape') {
                    // #1785 the escape — the jumper breaks free: a rising whoosh.
                    const d = m.fighters[e.by]
                    audioController.playSweep(180, 720, 0.18, 'square', 0.09)
                    scene.spark(d.x, d.y + 1.2, 0x8affc0)
                }
            }
        }

        let retryTimer = null
        const watchPhase = (m, prevPhase, prevRound) => {
            if (m.phase === 'ko' && prevPhase !== 'ko') {
                audioController.playSweep(220, 55, 0.6, 'sawtooth', 0.15)
                audioController.playNoise(0.3, 0.18)
                shake = 14; flashT = 18
                bannerText = m.banner; bannerT = 130
            } else if (m.phase === 'fight' && prevPhase === 'intro') {
                bannerText = 'FIGHT!'; bannerT = 50
                audioController.playTone(880, 0.12, 'square', 0.1)
            } else if (m.phase === 'intro' && prevRound < m.round) {
                bannerText = m.banner; bannerT = 110
                audioController.playTone(523, 0.1, 'square', 0.08)
            }
            if (m.phase === 'done' && prevPhase !== 'done') {
                const won = m.winner === 0
                if (mode === 'cpu') {
                    if (won && ladderIdx < LADDER.length - 1) {
                        audioController.playTone(660, 0.12, 'square', 0.1)
                        setTimeout(() => audioController.playTone(880, 0.16, 'square', 0.1), 130)
                        retryTimer = setTimeout(() => {
                            if (screenRef.current === 'play' && gs.phase === 'done') {
                                ladderIdx++
                                p2Char = LADDER[ladderIdx]
                                startFight(undefined, 'cpu')
                            }
                        }, 2600)
                    } else if (won) {
                        watchingRef.current = false; setWatching(false) // #1637 the ladder is won — hands off
                        championChar = p1Char
                        quoteText = matchupLine(championChar, p2Char, 'win')
                        ;[0, 4, 7, 12].forEach((semi, i) => setTimeout(() => audioController.playTone(523 * Math.pow(2, semi / 12), 0.18, 'square', 0.11), i * 120))
                        setSc('champion')
                        attractDemo()
                    } else {
                        audioController.playSweep(400, 120, 0.5, 'sawtooth', 0.1)
                        if (window.__IRONRING_NOCONTINUE__) {
                            retryTimer = setTimeout(() => {
                                if (screenRef.current === 'play' && gs.phase === 'done') startFight(undefined, 'cpu')
                            }, 2600)
                        } else {
                            quoteText = matchupLine(p2Char, p1Char, 'win')
                            concedeText = matchupLine(p1Char, p2Char, 'lose')
                            continueFrames = CONTINUE_FRAMES
                            setSc('continue')
                        }
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
            const ui = (px) => { hctx.font = `bold ${px}px "Courier New", monospace` }

            if (scr === 'play' || scr === 'champion') {
                const bw = W * 0.36, bh = Math.max(14, H * 0.038), by = H * 0.05
                for (let i = 0; i < 2; i++) {
                    const x = i === 0 ? W * 0.03 : W - W * 0.03 - bw
                    const frac = Math.max(0, f[i].hp) / (f[i].def.hp || 100)
                    lagHp[i] = frac < lagHp[i] ? lagHp[i] - 0.004 : frac
                    hctx.fillStyle = '#170f1f'; hctx.fillRect(x - 3, by - 3, bw + 6, bh + 6)
                    hctx.fillStyle = '#c8902c'
                    const lagW = bw * Math.max(0, Math.min(1, lagHp[i]))
                    hctx.fillRect(i === 0 ? x : x + bw - lagW, by, lagW, bh)
                    hctx.fillStyle = frac > 0.3 ? '#ffd23e' : '#ff5a3c'
                    const w = bw * frac
                    hctx.fillRect(i === 0 ? x : x + bw - w, by, w, bh)
                    ui(Math.max(11, H * 0.024))
                    hctx.textAlign = i === 0 ? 'left' : 'right'
                    hctx.fillStyle = '#fff'
                    hctx.fillText(f[i].def.name, i === 0 ? x : x + bw, by + bh + Math.max(15, H * 0.03))
                    const star = Math.max(5, H * 0.009)
                    for (let wn = 0; wn < gs.rounds; wn++) {
                        hctx.fillStyle = wn < f[i].wins ? '#ffd23e' : '#3a3050'
                        hctx.beginPath(); hctx.arc(i === 0 ? x + bw + star * 2 + wn * star * 2.4 : x - star * 2 - wn * star * 2.4, by + bh + star, star, 0, Math.PI * 2); hctx.fill()
                    }
                    const mw = W * 0.28, mhh = Math.max(7, H * 0.016), my = H * 0.9
                    const mx = i === 0 ? W * 0.03 : W - W * 0.03 - mw
                    hctx.fillStyle = '#141026'; hctx.fillRect(mx, my, mw, mhh)
                    hctx.fillStyle = f[i].meter >= 100 ? '#8affc0' : '#4a7aff'
                    hctx.fillRect(i === 0 ? mx : mx + mw - mw * (f[i].meter / 100), my, mw * (f[i].meter / 100), mhh)
                    if (f[i].meter >= 100) {
                        ui(Math.max(10, H * 0.02))
                        hctx.fillStyle = `rgba(138,255,192,${(0.55 + 0.45 * Math.sin(gs.tick * 0.2)).toFixed(2)})`
                        hctx.textAlign = i === 0 ? 'left' : 'right'
                        hctx.fillText('SUPER!', i === 0 ? mx : mx + mw, my - 5)
                    }
                    // #1761 item 5: the guard gauge — steel while the guard holds
                    // (it is IRON, after all), flashing gold/crimson as it runs
                    // out, shattering red while the fighter is crushed.
                    {
                        const gfrac = Math.max(0, Math.min(1, f[i].guard / 100))
                        const crushed = f[i].st === 'crush'
                        const gy = my - mhh - Math.max(7, H * 0.016)
                        const gh = Math.max(4, H * 0.01)
                        hctx.fillStyle = crushed ? '#2a0d12' : '#141026'
                        hctx.fillRect(mx, gy, mw, gh)
                        hctx.fillStyle = crushed ? '#ff5a3c' : (gfrac < 0.28 ? (((gs.tick >> 3) & 1) ? '#ffd23e' : '#ff5a3c') : '#c9d6de')
                        hctx.fillRect(i === 0 ? mx : mx + mw - mw * gfrac, gy, mw * gfrac, gh)
                        if (crushFx[i] > 0) {
                            crushFx[i]--
                            hctx.fillStyle = `rgba(255,255,255,${(crushFx[i] / 22).toFixed(2)})`
                            hctx.fillRect(mx - 2, gy - 2, mw + 4, gh + 4)
                        }
                    }
                    // #1785: the input-stun meter — violet while it builds,
                    // flashing as the masher runs out of headroom, magenta
                    // while the stagger holds.
                    {
                        const sfrac = Math.max(0, Math.min(1, f[i].stunMeter / 100))
                        const isStunned = f[i].st === 'stunned'
                        const sy = gy - gh - Math.max(4, H * 0.012)
                        const sh = Math.max(3, H * 0.008)
                        hctx.fillStyle = isStunned ? '#2a0d24' : '#141026'
                        hctx.fillRect(mx, sy, mw, sh)
                        hctx.fillStyle = isStunned ? '#ff5af0' : (sfrac > 0.7 ? (((gs.tick >> 3) & 1) ? '#ffd23e' : '#c76bff') : '#8a5ad0')
                        hctx.fillRect(i === 0 ? mx : mx + mw - mw * sfrac, sy, mw * sfrac, sh)
                        if (stunFx[i] > 0) {
                            stunFx[i]--
                            hctx.fillStyle = `rgba(255,255,255,${(stunFx[i] / 20).toFixed(2)})`
                            hctx.fillRect(mx - 2, sy - 2, mw + 4, sh + 4)
                        }
                    }
                    if (comboFx[i] > 0) {
                        comboFx[i]--
                        ui(Math.max(16, H * 0.034))
                        hctx.textAlign = 'center'
                        hctx.fillStyle = `rgba(255,210,62,${Math.min(1, comboFx[i] / 30).toFixed(2)})`
                        hctx.fillText(`${comboVal[i]} HIT COMBO`, i === 0 ? W * 0.22 : W * 0.78, H * 0.3)
                    }
                }
                ui(Math.max(22, H * 0.05))
                hctx.textAlign = 'center'
                hctx.fillStyle = '#0b0814'
                hctx.fillRect(W / 2 - Math.max(30, W * 0.033), by - 4, Math.max(60, W * 0.066), bh + 8)
                hctx.fillStyle = gs.timer <= 600 && gs.phase === 'fight' ? '#ff5a3c' : '#fff'
                hctx.fillText(String(Math.max(0, Math.ceil(gs.timer / 60))).padStart(2, '0'), W / 2, by + bh)
                if (bannerT > 0) {
                    bannerT--
                    ui(Math.max(34, H * 0.09))
                    hctx.strokeStyle = 'rgba(18,8,36,0.85)'; hctx.lineWidth = Math.max(3, H * 0.008)
                    hctx.fillStyle = `rgba(255,255,255,${Math.min(1, bannerT / 20 + 0.4).toFixed(2)})`
                    hctx.strokeText(bannerText, W / 2, H * 0.42)
                    hctx.fillText(bannerText, W / 2, H * 0.42)
                }
                if (flashT > 0) { flashT--; hctx.fillStyle = `rgba(255,255,255,${(flashT / 60).toFixed(2)})`; hctx.fillRect(0, 0, W, H) }
                if (desync && net.active) {
                    hctx.fillStyle = 'rgba(5,5,12,0.72)'; hctx.fillRect(0, 0, W, H)
                    ui(Math.max(22, H * 0.05))
                    hctx.fillStyle = '#ff5a3c'; hctx.fillText('OUT OF SYNC', W / 2, H * 0.45)
                    ui(Math.max(12, H * 0.024))
                    hctx.fillStyle = '#fff'; hctx.fillText('PRESS SPACE', W / 2, H * 0.55)
                }
            }
            if (scr === 'attract') {
                hctx.fillStyle = 'rgba(6,4,14,0.55)'; hctx.fillRect(0, 0, W, H)
                const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 320)
                ui(Math.max(40, H * 0.11))
                hctx.textAlign = 'center'
                hctx.strokeStyle = 'rgba(150,40,30,0.9)'; hctx.lineWidth = Math.max(4, H * 0.012)
                hctx.strokeText('IRON RING', W / 2, H * 0.3)
                hctx.fillStyle = '#ffd23e'
                hctx.fillText('IRON RING', W / 2, H * 0.3)
                ui(Math.max(12, H * 0.024))
                hctx.fillStyle = `rgba(255,255,255,${pulse.toFixed(2)})`
                hctx.fillText('PRESS ANY KEY', W / 2, H * 0.42)
                hctx.fillStyle = 'rgba(200,190,255,0.85)'
                hctx.fillText(MESSAGES[attractMsg % MESSAGES.length], W / 2, H * 0.85)
                ui(Math.max(10, H * 0.02))
                hctx.fillStyle = 'rgba(160,150,220,0.8)'
                hctx.fillText(net.active ? `ROOM ${net.code || '····'}` : '1 ARCADE LADDER     2 LOCAL 2P', W / 2, H * 0.92)
                // #1663 discoverability on the title card, under the coin line
                // (net rooms own no guide — the seat rule is cpu-ladder only).
                if (!net.active) {
                    ui(Math.max(10, H * 0.02))
                    hctx.fillStyle = 'rgba(255,210,62,0.85)'
                    hctx.fillText('PRESS Y TO WATCH THE CHAMPION', W / 2, H * 0.5)
                }
            }
            if (scr === 'select') {
                hctx.fillStyle = 'rgba(6,4,14,0.8)'; hctx.fillRect(0, 0, W, H)
                ui(Math.max(20, H * 0.045))
                hctx.textAlign = 'center'
                hctx.fillStyle = '#ffd23e'
                hctx.fillText(p2Picked ? 'PLAYER 2 — CHOOSE' : net.active ? (net.role === 'host' ? 'HOST — CHOOSE' : 'GUEST — CHOOSE') : 'SELECT YOUR FIGHTER', W / 2, H * 0.12)
                const cw = Math.min(W * 0.26, H * 0.52), ch = cw * 0.74
                ROSTER.forEach((rd, i) => {
                    const col = i % 3, row = Math.floor(i / 3)
                    const x = W / 2 - cw * 1.55 + col * (cw * 1.05), y = H * 0.2 + row * (ch * 1.1)
                    hctx.fillStyle = '#141026'; hctx.fillRect(x, y, cw, ch)
                    hctx.strokeStyle = i === cursor ? '#ffd23e' : '#3a2f58'
                    hctx.lineWidth = i === cursor ? 3 : 1
                    hctx.strokeRect(x, y, cw, ch)
                    hctx.fillStyle = hex(rd.color.skin); hctx.fillRect(x + cw * 0.4, y + ch * 0.12, cw * 0.2, ch * 0.18)
                    hctx.fillStyle = hex(rd.color.hair); hctx.fillRect(x + cw * 0.38, y + ch * 0.09, cw * 0.24, ch * 0.06)
                    hctx.fillStyle = hex(rd.color.top); hctx.fillRect(x + cw * 0.34, y + ch * 0.34, cw * 0.32, ch * 0.26)
                    hctx.fillStyle = hex(rd.color.pants); hctx.fillRect(x + cw * 0.36, y + ch * 0.6, cw * 0.28, ch * 0.12)
                    ui(Math.max(11, H * 0.022))
                    hctx.textAlign = 'center'
                    hctx.fillStyle = '#fff'
                    hctx.fillText(rd.name, x + cw / 2, y + ch * 0.86)
                    ui(Math.max(8, H * 0.015))
                    hctx.fillStyle = 'rgba(190,180,240,0.85)'
                    hctx.fillText(rd.tag, x + cw / 2, y + ch * 0.97)
                })
                ui(Math.max(11, H * 0.021))
                hctx.textAlign = 'center'
                hctx.fillStyle = 'rgba(255,255,255,0.9)'
                hctx.fillText(net.active
                    ? (net.role === 'host'
                        ? (hostSelect.waiting ? `ROOM ${net.code} — AWAITING CHALLENGER'S PICK…` : `ROOM ${net.code} — SPACE: FIGHT`)
                        : 'WAITING FOR HOST…')
                    : `MODE: ${mode === 'local' ? (p2Picked ? 'P2 PICK' : 'P1 PICK') : 'ARCADE LADDER'} — 1/2 SWITCH · ARROWS · SPACE`, W / 2, H * 0.965)
            }
            if (scr === 'champion') {
                hctx.fillStyle = 'rgba(6,4,14,0.6)'; hctx.fillRect(0, 0, W, H)
                ui(Math.max(28, H * 0.07))
                hctx.textAlign = 'center'
                hctx.fillStyle = '#ffd23e'
                hctx.fillText('ARCADE CHAMPION', W / 2, H * 0.4)
                ui(Math.max(13, H * 0.026))
                hctx.fillStyle = '#fff'
                hctx.fillText(`${(BY_ID[championChar] || ROSTER[0]).name} CONQUERS THE RING`, W / 2, H * 0.5)
                if (quoteText) {
                    ui(Math.max(11, H * 0.022))
                    hctx.fillStyle = 'rgba(255,210,62,0.92)'
                    hctx.fillText(`"${quoteText}"`, W / 2, H * 0.56)
                }
                hctx.fillStyle = '#fff'
                hctx.fillText('PRESS ANY KEY', W / 2, H * 0.66)
            }
            if (scr === 'continue') {
                hctx.fillStyle = 'rgba(6,4,14,0.72)'; hctx.fillRect(0, 0, W, H)
                ui(Math.max(30, H * 0.075))
                hctx.textAlign = 'center'
                hctx.strokeStyle = 'rgba(150,40,30,0.9)'; hctx.lineWidth = Math.max(4, H * 0.012)
                hctx.strokeText('CONTINUE?', W / 2, H * 0.36)
                hctx.fillStyle = '#ff5a3c'
                hctx.fillText('CONTINUE?', W / 2, H * 0.36)
                ui(Math.max(38, H * 0.09))
                hctx.fillStyle = '#ffd23e'
                hctx.fillText(String(Math.max(0, Math.ceil(continueFrames / 60))), W / 2, H * 0.5)
                if (concedeText) {
                    ui(Math.max(11, H * 0.022))
                    hctx.fillStyle = 'rgba(205,205,215,0.92)'
                    hctx.fillText(`${(BY_ID[p1Char] || ROSTER[0]).name}: "${concedeText}"`, W / 2, H * 0.57)
                }
                if (quoteText) {
                    ui(Math.max(12, H * 0.024))
                    hctx.fillStyle = 'rgba(255,120,90,0.95)'
                    hctx.fillText(`${(BY_ID[p2Char] || ROSTER[1]).name}: "${quoteText}"`, W / 2, H * 0.63)
                }
                ui(Math.max(12, H * 0.024))
                hctx.fillStyle = `rgba(255,255,255,${(0.7 + 0.3 * Math.sin(Date.now() / 300)).toFixed(2)})`
                hctx.fillText(credits > 0 ? `PRESS SPACE — CREDITS ${credits}` : 'GAME OVER', W / 2, H * 0.75)
            }
            if (paused && scr === 'play') {
                hctx.fillStyle = 'rgba(4,3,10,0.45)'; hctx.fillRect(0, 0, W, H)
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
            if (attractT > 2800) { attractT = 0; attractMsg++ }
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
                        step(gs, pads)
                        if (mode === 'online' && gs.tick % HASH_EVERY === 0) {
                            const h = matchHash(gs)
                            oursH.set(gs.tick, h)
                            netSend('hs', { k: gs.tick, h })
                            if (peerH.has(gs.tick) && peerH.get(gs.tick) !== h) { desyncRef.current = true; setDesync(true) }
                        }
                        hearEvents(gs)
                        watchPhase(gs, prevPhase, prevRound)
                    }
                }
            }
            if (screenRef.current === 'continue') {
                continueFrames--
                if (continueFrames <= 0 || credits <= 0) {
                    credits = 0
                    attractDemo()
                    setSc('attract')
                }
            }
            if (shake > 0) shake *= 0.88
            if (gs && stageFx && rigs) scene.sync(gs, rigs, stageFx, now / 1000, shake > 0.4 ? shake * 0.02 : 0)
            drawHud(hud.width, hud.height)
        }

        raf = requestAnimationFrame(loop)

        // #1473: production-safe feedback state (every build, not DEV-only) —
        // the engine is pure and seeded (#531 law): gs.seed drives stage pick,
        // AI pace and every jitter, so a filed report + seed replays the fight.
        exposeFeedbackState(() => ({
            tick: gs ? gs.tick : 0,
            score: gs ? gs.fighters[0].wins * 1000 + Math.round(gs.fighters[0].hp) : 0,
            done: gs ? gs.phase === 'done' : false,
            seed: gs ? gs.seed >>> 0 : 0,
        }))


        // ---- dev hooks -----------------------------------------------------------------------
        if (import.meta.env.DEV) {
            window.__ironRingTest = {
                get state() { return gs ? { phase: gs.phase, tick: gs.tick, screen: screenRef.current, mode, x: gs.fighters.map((f) => +f.x.toFixed(2)), hp: gs.fighters.map((f) => f.hp), wins: gs.fighters.map((f) => f.wins), st: gs.fighters.map((f) => f.move || f.st), stt: gs.fighters.map((f) => f.st), combo: gs.fighters.map((f) => f.combo), guard: gs.fighters.map((f) => Math.round(f.guard)), stun: gs.fighters.map((f) => Math.round(f.stunMeter)), y: gs.fighters.map((f) => +f.y.toFixed(2)), banner: bannerText, credits, continueFrames, opponent: p2Char, ladderIdx, p1: p1Char, p2: p2Char, champion: championChar, quote: screenRef.current === 'champion' ? matchupLine(championChar, p2Char, 'win') : screenRef.current === 'continue' ? matchupLine(p2Char, p1Char, 'win') : null } : null },
                setChars(a, b) { p1Char = a; p2Char = b; startFight(7, mode === 'cpu' ? 'cpu' : mode) },
                start() { p1Char = 'kade'; p2Char = LADDER[0]; ladderIdx = 0; mode = 'cpu'; startFight(7, 'cpu') },
                koP2() { if (gs) forceKO(gs, 0) },
                koP1() { if (gs) forceKO(gs, 1) },
                // #1761 item 5: seat P2's guard crushed at the sim level; the
                // synthetic event rides hearEvents exactly like a real crush.
                // (The committed move is dropped — a shattered guard releases
                // it, and state.st reports move-first, so a stale move would
                // hide the crush from the gate.)
                forceCrush() { if (gs) { const d = gs.fighters[1]; d.st = 'crush'; d.stun = 46; d.sf = 0; d.guard = 0; d.move = null; d.phase = ''; d.hp = Math.max(1, d.hp - 7); gs.hitstop = Math.max(gs.hitstop, 8); gs.events.push({ t: gs.tick, kind: 'crush', by: 0, dmg: 7 }) } },
                // #1785: seat P2 input-stunned at the sim level; the synthetic
                // event rides hearEvents exactly like a real stun.
                forceStun() { if (gs) { const d = gs.fighters[1]; d.st = 'stunned'; d.stun = 90; d.sf = 0; d.stunMeter = 100; d.move = null; d.phase = ''; gs.hitstop = Math.max(gs.hitstop, 8); gs.events.push({ t: gs.tick, kind: 'stunned', by: 1 }) } },
                // #1785: put P2 in an air-grab window at the sim level (the
                // CPU is benched for the check — a 1P-mode CPU would mash its
                // own escape out of the window). setChars re-seats the CPU
                // when the next gate rebuilds the match.
                forceAirGrab() { if (gs) { const d = gs.fighters[1]; d.def.cpu = false; d.st = 'airthrow'; d.stun = 10; d.sf = 0; d.move = null; d.phase = ''; d.y = Math.max(d.y, 0.5); d.vy = Math.max(d.vy, 0.03); d.vx = 0; gs.hitstop = Math.max(gs.hitstop, 8); gs.events.push({ t: gs.tick, kind: 'airgrab', by: 0 }) } },
                expireContinue() { continueFrames = 1 },
                setLadder(i) { ladderIdx = i },
                // #1637 watchcheck pilot drives these.
                watching: () => watchingRef.current,
                probe: () => (gs ? { phase: gs.phase, tick: gs.tick, x: gs.fighters.map((f) => +f.x.toFixed(2)), hp: gs.fighters.map((f) => Math.round(f.hp)), wins: gs.fighters.map((f) => f.wins), done: gs.phase === 'done' } : null),
                watchSfx: watchSfxLog,
            }
            dbg = mountDbg({
                title: 'IRON RING',
                state: () => (gs ? { phase: gs.phase, round: gs.round, timer: Math.ceil(gs.timer / 60), p1: `${gs.fighters[0].hp}hp ${Math.round(gs.fighters[0].meter)}m ${gs.fighters[0].st}${gs.fighters[0].move ? ':' + gs.fighters[0].move : ''}`, p2: `${gs.fighters[1].hp}hp ${Math.round(gs.fighters[1].meter)}m ${gs.fighters[1].st}${gs.fighters[1].move ? ':' + gs.fighters[1].move : ''}, p1x: +gs.fighters[0].x.toFixed(2), p1mv: gs.fighters[0].move ? (gs.fighters[0].move.key || gs.fighters[0].move.type) : ''` } : {}),
                cheats: [
                    { label: 'P2 to 1 HP', run: () => { if (gs) gs.fighters[1].hp = 1 } },
                    { label: 'Fill P1 meter', run: () => { if (gs) gs.fighters[0].meter = 100 } },
                    { label: 'K.O. round', run: () => { if (gs) { gs.fighters[1].hp = 0; step(gs, [emptyPad(), emptyPad()]); hearEvents(gs) } } },
                ],
            })
            exposeGame({
                id: 'iron-ring',
                buttons: ['a', 'b'],
                reset(seed, players = 1) {
                    p1Char = 'kade'
                    p2Char = players >= 2 ? 'vexa' : LADDER[0]
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
            clearTimeout(retryTimer)
            window.removeEventListener('keydown', onKeyDown)
            window.removeEventListener('keyup', onKeyUp)
            window.removeEventListener('resize', resize)
            wrap.removeEventListener('pointerdown', onPointer)
            if (net.lobby && net.lobby.destroy) net.lobby.destroy()
            unexposeFeedbackState()
            if (import.meta.env.DEV) { unexposeGame(); unmountDbg(); delete window.__ironRingTest }
            scene.renderer.dispose()
            if (wrap.contains(gl)) wrap.removeChild(gl)
            if (wrap.contains(hud)) wrap.removeChild(hud)
            void dbg
        }
    }, [])

    const entry = GAMES.find((g) => g.label === 'IRON RING')
    return (
        <div className="relative h-full w-full bg-[#0a0a12]" style={{ minHeight: '100%' }}>
            <div ref={wrapRef} className="absolute inset-0" />
            <VirtualControls visible={screen === 'play' && !paused} secondAction={{ label: 'K', code: 'KeyZ' }} />
            {/* #1624 WATCH — seat 1 fights the ladder on its own proven CPU tier. */}
            {screen === 'play' && watching && <WatchToast className="absolute z-50" />}
            {screen === 'play' && !paused && !desync && (
                <div className="absolute pointer-events-auto z-50" style={{ top: 'calc(3.5rem + var(--sat, 0px))', right: 'calc(0.75rem + var(--sar, 0px))' }}>
                    <WatchButton on={watching} />
                </div>
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

export default IronRingGame
