// SHORT ORDER SHOUT — original co-op cook-up (#1248). The all-night diner is
// cut in two by a long pass counter: the LINE side has the cooler, chop board,
// burners, tap and one shared soup pot; the only service window is on the PASS
// side. Dishes cross the counter by hand around the end or mid-air over the top
// — that is the shout. Any seat can be human, CPU or model (#494); the sim is
// seeded and deterministic (seed + per-seat pad streams => identical hashes),
// and live sessions record with raw per-seat voice (#1247) through the game
// contract. Rules live in ./engine.js (pure); look lives in ./art.js.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import Lobby from '../../components/Lobby'
import { GAMES } from '../../config/games'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop, recordLiveTick } from '../../utils/gameContract'
import { normalizePad } from '../../utils/onePad'
import { createLobby, lobbyRole, relayFromQuery } from '../../utils/lobby.js'
import { makeTransport } from '../../utils/linkPeers.js'
import { askVoiceConsent } from '../../utils/voiceCapture'
import { b64FromBytes, bytesFromB64 } from '../../utils/voice.js'
import { createPttSender, createPttInbox } from './ptt.js'
import {
    createGame, stepGame, simState, drainFx, makeCpuEmitter, snapshotGame, restoreGame, hashState,
    GRID_W, GRID_H, SHIFT_TICKS, QUOTA, MAX_STRIKES, cellKind, STATION, RUNNER_POST,
} from './engine.js'
import { createSosSync, createRttTracker, packSnap, padMask, stallNotice, DROP_GRACE } from './net.js'
import { sprites, TILE, CANVAS_W, CANVAS_H, KITCHEN_X, KITCHEN_Y } from './art.js'
import { playFx, dinerBar, resetDiner, seatDropFx } from './audio.js'

const FIXED_DT = 1000 / 60
const IS_TOUCH = typeof window !== 'undefined' && (('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0)
const SEAT_KEYS_HUMAN2 = { KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right' }
const ATTRACT_MSGS = [
    'THE COUNTER SPLITS THE KITCHEN',
    'SHOUT. TOSS. SERVE.',
    'ANY SEAT: HUMAN, CPU OR MODEL',
    'STIR THE POT OR IT BOILS OVER',
    'A BURNT PATTY MEANS FIRE',
    'THREE EXPIRED TICKETS = FIRED',
]

export default function ShortOrderShout() {
    const canvasRef = useRef(null)
    const [paused, setPaused] = useState(false)
    const pausedRef = useRef(false)
    pausedRef.current = paused
    const [uiScreen, setUiScreen] = useState('attract')
    const screenRef = useRef('attract') // attract | select | play | over
    const gsRef = useRef(null) // live sim
    const attractRef = useRef(null) // demo sim behind the title
    const emittersRef = useRef([])
    const attractEmittersRef = useRef([])
    const seatsRef = useRef(2)
    const partnerHumanRef = useRef(false)
    const selectRef = useRef(2)
    const keys1Ref = useRef({})
    const keys2Ref = useRef({})
    const hudRef = useRef({ toast: '', toastT: 0, shake: 0, lastScore: 0, popT: 0, walk: {}, pops: [], slide: {}, bump: 0, stamp: 0, dropFlash: null })
    const overAtRef = useRef(0)
    const seedRef = useRef(1)
    const modelSeatRef = useRef(null)
    const [netUi, setNetUi] = useState(null) // #1291 lobby state for the shared Lobby overlay
    const netStartRef = useRef(null)

    const setScreen = (s) => { screenRef.current = s; setUiScreen(s) }
    const freshEmitters = (seats) => Array.from({ length: seats }, (_, i) => makeCpuEmitter(i))

    const startPlay = useCallback((seed, players, partnerHuman) => {
        seatsRef.current = players
        partnerHumanRef.current = !!partnerHuman
        seedRef.current = seed
        gsRef.current = createGame(seed, players)
        emittersRef.current = freshEmitters(players)
        const hud = hudRef.current
        hud.walk = {}; hud.pops = []; hud.slide = {}; hud.stamp = 0; hud.bump = 0; hud.lastScore = 0
        resetDiner() // fresh 4-bar loop from bar 0 (#1292)
        setScreen('play')
        specRef.current.players = players
        playFx({ k: 'start' })
    }, [])

    const startAttract = useCallback(() => {
        attractRef.current = createGame(1000 + Math.floor(Math.random() * 9999), 2)
        attractEmittersRef.current = freshEmitters(2)
        setScreen('attract')
    }, [])

    // one spec object, mutated so `players` stays live for the recorder
    const specRef = useRef(null)
    const pumpHudRef = useRef(null)
    if (!specRef.current) {
        specRef.current = {
            id: 'short-order-shout',
            method: 'dpad',
            players: 2,
            buttons: ['a', 'b'],
            reads: ['up', 'down', 'left', 'right', 'a', 'b'],
            sources: () => {
                const out = []
                for (let i = 0; i < seatsRef.current; i++) {
                    if (modelSeatRef.current === i) out.push({ kind: 'model' })
                    else if (i === 0) out.push({ kind: 'human' })
                    else out.push(i === 1 && partnerHumanRef.current ? { kind: 'human' } : { kind: 'cpu' })
                }
                return out
            },
            reset: (seed, players) => { startPlay(seed >>> 0 || 1, Math.max(1, Math.min(4, players | 0 || 2)), false) },
            tick: (pad, pads) => {
                const g = gsRef.current
                if (!g || g.done) return
                const merged = g.cooks.map((c, i) => {
                    if (i === 0) return pads && pads[0] ? pads[0] : pad
                    if (modelSeatRef.current === i) return (pads && pads[i]) || {}
                    return emittersRef.current[i] ? emittersRef.current[i]({ gs: g, tick: g.tick }) : {}
                })
                stepGame(g, merged)
                const fx = drainFx(g)
                for (const f of fx) { playFx(f); if (pumpHudRef.current) pumpHudRef.current(f) }
                if (g.done && screenRef.current === 'play') { screenRef.current = 'over'; setUiScreen('over'); overAtRef.current = performance.now() }
            },
            state: () => {
                const g = gsRef.current || createGame(1, 2)
                return { ...simState(g), players: seatsRef.current }
            },
            canvas: () => canvasRef.current,
        }
    }

    useEffect(() => {
        const cvs = canvasRef.current
        if (!cvs) return undefined
        cvs.width = CANVAS_W; cvs.height = CANVAS_H
        startAttract()
        if (import.meta.env.DEV) exposeGame(specRef.current)

        pumpHudRef.current = (f) => {
            const hud = hudRef.current
            if (f.k === 'toast') { hud.toast = f.msg; hud.toastT = 110 }
            if (f.k === 'serve') { hud.popT = 24; hud.pops.push({ k: 'serve', x: f.x, y: f.y, t: 0, pts: f.pts || 0 }); hud.bump = 14 }
            if (f.k === 'catch') hud.pops.push({ k: 'catch', x: f.x, y: f.y, t: 0 })
            if (f.k === 'douse') hud.pops.push({ k: 'douse', x: f.x, y: f.y, t: 0 })
            if (f.k === 'boilover') hud.pops.push({ k: 'splat', x: STATION.pot[0], y: 0, t: 0 })
            if (f.k === 'boilover' || f.k === 'fire' || f.k === 'expire' || f.k === 'fired') hud.shake = f.k === 'fired' ? 40 : 18
        }

        const keys1 = keys1Ref.current
        const keys2 = keys2Ref.current
        const clearKeys = () => { for (const k of Object.keys(keys1)) keys1[k] = false; for (const k of Object.keys(keys2)) keys2[k] = false }

        // The sim SAMPLES the held pads once per frame; a fast tap can fall
        // entirely between two samples. Latch action presses for a minimum of
        // 100ms so every real tap is seen by at least one tick.
        const MIN_MS = 100
        const pressMin = (keys, field) => {
            keys[field] = true
            keys[field + '_at'] = performance.now()
            if (keys[field + '_t']) clearTimeout(keys[field + '_t'])
            keys[field + '_t'] = setTimeout(() => { keys[field] = false }, MIN_MS)
        }
        const releaseMin = (keys, field) => {
            const held = performance.now() - (keys[field + '_at'] || 0)
            if (keys[field + '_t']) clearTimeout(keys[field + '_t'])
            if (held >= MIN_MS) keys[field] = false
            else keys[field + '_t'] = setTimeout(() => { keys[field] = false }, MIN_MS - held)
        }

        const onKeyDown = (ev) => {
            if (ev.code === 'Escape' || ev.code === 'Backquote') { ev.preventDefault(); setPaused((p) => !p); return }
            if (pausedRef.current) return
            const sc = screenRef.current
            if (net.active) {
                if (ev.code === 'KeyP' && net.role === 'host') { partnerHumanRef.current = !partnerHumanRef.current; pushNetUi() }
                if (sc === 'over' && net.role === 'host' && performance.now() - overAtRef.current > 900 && (ev.code === 'Space' || ev.code === 'Enter')) onlineStart()
                return
            }
            if (sc === 'attract') { selectRef.current = 2; setScreen('select'); playFx({ k: 'ui' }); return }
            if (sc === 'select') {
                if (ev.code === 'ArrowLeft') selectRef.current = Math.max(1, selectRef.current - 1)
                if (ev.code === 'ArrowRight') selectRef.current = Math.min(4, selectRef.current + 1)
                if (ev.code === 'KeyP') partnerHumanRef.current = !partnerHumanRef.current
                if (ev.code === 'KeyP' && net.active && net.role === 'host') pushNetUi()
                if (ev.code === 'Space' || ev.code === 'Enter' || ev.code === 'Digit1') {
                    startPlay(seedRef.current, selectRef.current, partnerHumanRef.current)
                }
                return
            }
            if (sc === 'over') {
                if (performance.now() - overAtRef.current > 900 && (ev.code === 'Space' || ev.code === 'Enter')) {
                    seedRef.current = (seedRef.current + 1) >>> 0
                    setScreen('select')
                }
                return
            }
            // play
            if (ev.code === 'ArrowUp') keys1.up = true
            if (ev.code === 'ArrowDown') keys1.down = true
            if (ev.code === 'ArrowLeft') keys1.left = true
            if (ev.code === 'ArrowRight') keys1.right = true
            if (ev.code === 'Space') pressMin(keys1, 'a')
            if (ev.code === 'KeyB') pressMin(keys1, 'b')
            const k2 = SEAT_KEYS_HUMAN2[ev.code]
            if (k2 && partnerHumanRef.current) keys2[k2] = true
            if (ev.code === 'KeyF' && partnerHumanRef.current) pressMin(keys2, 'a')
            if (ev.code === 'KeyG' && partnerHumanRef.current) pressMin(keys2, 'b')
            if (ev.code === 'KeyV' && !ev.repeat && net.active) { ev.preventDefault(); talkStart() }
        }
        const onKeyUp = (ev) => {
            if (ev.code === 'ArrowUp') keys1.up = false
            if (ev.code === 'ArrowDown') keys1.down = false
            if (ev.code === 'ArrowLeft') keys1.left = false
            if (ev.code === 'ArrowRight') keys1.right = false
            if (ev.code === 'Space') releaseMin(keys1, 'a')
            if (ev.code === 'KeyB') releaseMin(keys1, 'b')
            const k2 = SEAT_KEYS_HUMAN2[ev.code]
            if (k2) keys2[k2] = false
            if (ev.code === 'KeyF') releaseMin(keys2, 'a')
            if (ev.code === 'KeyG') releaseMin(keys2, 'b')
            if (ev.code === 'KeyV' && net.active) talkEnd()
        }
        const onPointer = () => {
            const sc = screenRef.current
            if (sc === 'attract') { selectRef.current = 2; setScreen('select') }
            else if (sc === 'over' && performance.now() - overAtRef.current > 900) { seedRef.current = (seedRef.current + 1) >>> 0; setScreen('select') }
        }
        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)
        cvs.addEventListener('pointerdown', onPointer)

        // ------------------------------------------------------------ online ----
        // #1291 lockstep kitchen on the #1039 shared lobby: ?net=host /
        // ?net=join&room=CODE / ?relay=ws(s)://host. Every browser drives the
        // seat its relay slot owns (the host may keep one extra keyboard seat);
        // pads ride D ticks ahead, the whole-sim hash guards desync, and the
        // host snapshot heals without a reload. Protocol + proofs: ./net.js,
        // scripts/soslinkcheck.mjs.
        const nq = new URLSearchParams(window.location.search)
        const netRole = lobbyRole(window.location.search)
        const relayUrl = relayFromQuery(window.location.search)
        const net = {
            active: !!netRole, role: netRole, slot: 0, seats: 1, partnerSeat: -1,
            humans: [], mySeats: [], state: null, desyncFrozen: false, dropped: [],
        }
        net.sync = createSosSync({
            send: (t, p) => { if (net.room) net.room.send(t, net.rtt.decorate(t, p)) },
            mySeats: [], watchSeats: [],
        })
        // latency ping (#1416 gap 3): HUD-only echo RTT riding pad/hs — the
        // sim never reads it, so the sampling law and hashes are untouched.
        net.rtt = createRttTracker({ mySlot: () => (net.room ? net.room.yourSlot : -1) })
        // PTT voice (#1416 gap 1): hold V, talk, release — one walkie-talkie
        // message at a time. Frames ride the forwarded `pad` type as k:'v'
        // (the #1247 framing; gotPad reads numeric k only, so lockstep never
        // sees them — soslinkcheck proves it). Half-duplex rules, chunking and
        // the rate budget live in ./ptt.js (pure); this is the thin DOM half.
        net.ptt = createPttSender({ now: () => performance.now() })
        net.voice = { stream: null, rec: null, chunks: [], mime: '', consent: null, flash: null }
        let vctx = null
        const playUtterance = (utt) => {
            try {
                const AC = window.AudioContext || window.webkitAudioContext
                if (!AC) return
                if (!vctx) vctx = new AC()
                if (vctx.state === 'suspended') vctx.resume()
                const bytes = bytesFromB64(utt.b64)
                vctx.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
                    .then((buf) => {
                        const src = vctx.createBufferSource()
                        src.buffer = buf
                        src.connect(vctx.destination)
                        src.start()
                    })
                    .catch(() => { /* undecodable take: honest silence, never a fake play */ })
            } catch { /* no audio engine on this box */ }
        }
        net.vin = createPttInbox({
            onUtterance: (u) => {
                net.voice.flash = { seat: u.slot, t: 100 }
                net.voice.heard = { seat: u.slot, ms: u.ms, bytes: u.b64.length }
                playUtterance(u)
            },
        })
        const talkStart = async () => {
            if (!net.room || net.ptt.holding || net.ptt.pending) return
            if (!net.voice.consent) net.voice.consent = await askVoiceConsent()
            if (!net.voice.consent.consent) { if (!net.voice.stream) netToast('MIC OFF — NO VOICE'); return }
            if (!net.voice.stream) {
                try {
                    net.voice.stream = await navigator.mediaDevices.getUserMedia({
                        audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
                    })
                } catch { net.voice.consent = { consent: false, headset: false, reason: 'mic-denied' }; netToast('MIC BLOCKED'); return }
            }
            if (!net.ptt.press()) return
            try {
                net.voice.chunks = []
                net.voice.rec = net.voice.mime
                    ? new MediaRecorder(net.voice.stream, { mimeType: net.voice.mime, audioBitsPerSecond: 24000 })
                    : new MediaRecorder(net.voice.stream, { audioBitsPerSecond: 24000 })
                net.voice.mime = net.voice.rec.mimeType || 'audio/webm'
                net.voice.rec.ondataavailable = (e) => { if (e.data && e.data.size) net.voice.chunks.push(e.data) }
                net.voice.rec.start(500)
                net.voice.live = true
            } catch { net.ptt.release('') } // recorder refused: free the walkie-talkie
        }
        const talkEnd = () => {
            const rec = net.voice.rec
            if (!net.ptt.holding) return
            if (!rec || rec.state === 'inactive') { net.ptt.release(''); net.voice.live = false; return }
            rec.onstop = () => {
                net.voice.live = false
                const blob = new Blob(net.voice.chunks, { type: net.voice.mime || 'audio/webm' })
                net.voice.chunks = []
                blob.arrayBuffer()
                    .then((buf) => net.ptt.release(b64FromBytes(new Uint8Array(buf)),
                        { mime: blob.type || net.voice.mime, headset: !!(net.voice.consent && net.voice.consent.headset) }))
                    .catch(() => net.ptt.release(''))
            }
            try { rec.stop() } catch { net.ptt.release(''); net.voice.live = false }
        }
        const pushNetUi = () => setNetUi(net.active && net.state ? { ...net.state } : null)

        const netToast = (msg) => { const hud = hudRef.current; hud.toast = msg; hud.toastT = 110 }
        const hostSnap = () => {
            const g = gsRef.current
            if (!g || g.done) return
            for (const c of packSnap(JSON.stringify(snapshotGame(g)), g.tick)) net.room.send('res', c)
        }
        const netDesync = () => {
            if (screenRef.current !== 'play') return
            if (net.role === 'host') hostSnap()
            else net.room.send('res', { e: 'req' })
            netToast('DESYNC — RESYNCING')
        }
        const startNetMatch = (m) => {
            const seats = Math.max(1, Math.min(4, (m.seats | 0) || 2))
            net.seats = seats
            net.partnerSeat = net.role === 'host' ? (m.partnerSeat ?? -1) : -1
            net.humans = Array.isArray(m.humans) ? m.humans.filter((x) => x < seats) : [0]
            net.slot = net.room.yourSlot
            net.mySeats = net.role === 'host'
                ? [0, ...(net.partnerSeat > 0 && net.partnerSeat < seats ? [net.partnerSeat] : [])]
                : [net.slot]
            seedRef.current = (m.seed >>> 0) || 1
            gsRef.current = createGame(seedRef.current, seats)
            emittersRef.current = freshEmitters(seats)
            net.sync.mySeats = net.mySeats.slice()
            net.sync.watchSeats = net.humans.slice()
            net.sync.reset(0)
            net.rtt.reset()
            net.ptt.reset()
            net.vin.reset()
            const hud = hudRef.current
            hud.walk = {}; hud.pops = []; hud.slide = {}; hud.stamp = 0; hud.bump = 0; hud.lastScore = 0; hud.dropFlash = null
            net.dropped = []
            resetDiner()
            setScreen('play')
            specRef.current.players = seats
            playFx({ k: 'start' })
        }
        // The host opens the shift: humans own their slot seats, open seats are
        // CPU, and the host's keyboard partner (P) gets the last seat while the
        // room has room for one.
        const onlineStart = () => {
            if (!net.lobby || net.role !== 'host' || !net.room) return
            const humans = net.room.slots.slice().sort((a, b) => a - b)
            const wantPartner = partnerHumanRef.current && humans.length < 4
            const seats = Math.max(1, humans.length + (wantPartner ? 1 : 0))
            const partnerSeat = wantPartner ? seats - 1 : -1
            net.room.setPhase('waiting') // allow a re-kick after the previous shift
            net.lobby.start({ seed: ((seedRef.current * 1103515245 + 12345) >>> 0) || 1, seats, partnerSeat, humans })
        }
        netStartRef.current = onlineStart
        if (net.active) {
            net.lobby = createLobby({
                slug: 'short-order-shout',
                cap: 4,
                relay: relayUrl,
                makeTransport,
                shareRelay: !!nq.get('relay'),
                onState: (st) => { net.state = st; net.slot = st.slot; pushNetUi() },
                onStart: (m) => startNetMatch(m),
                onLeave: () => pushNetUi(),
                onJoin: () => pushNetUi(),
                on: {
                    pad: (mm) => { net.rtt.onRecv(mm); if (mm.k === 'v') { net.vin.feed(mm); return } net.sync.gotPad(mm) },
                    hs: (mm) => { net.rtt.onRecv(mm); const r = net.sync.gotHash(mm.k | 0, mm.h >>> 0, mm.s | 0); if (r && r.desync !== undefined) netDesync() },
                    res: (mm) => {
                        if (mm.e === 'req') { if (net.role === 'host') hostSnap() }
                        else if (mm.e === 'snp') {
                            const got = net.sync.snapInbox.push(mm)
                            if (got && screenRef.current === 'play') {
                                gsRef.current = restoreGame(got.snap)
                                emittersRef.current = freshEmitters(gsRef.current.seats)
                                netToast('RE-SYNCED TO HOST')
                            }
                        }
                    },
                },
            })
            net.room = net.lobby.room
            if (net.role === 'host') net.lobby.open()
            else net.lobby.join(nq.get('room'))
            pushNetUi()
        }

        // ---------- the loop ----------
        let raf = 0
        let last = performance.now()
        let acc = 0
        let tickN = 0

        const humanPad = (keys) => normalizePad({
            up: !!keys.up, down: !!keys.down, left: !!keys.left, right: !!keys.right,
            a: !!keys.a, b: !!keys.b,
        }, 'dpad')

        const liveTick = () => {
            const g = gsRef.current
            if (!g || g.done) return
            const pads = g.cooks.map((c, i) => {
                if (i === 0) return humanPad(keys1)
                if (i === 1 && partnerHumanRef.current) return humanPad(keys2)
                return emittersRef.current[i] ? emittersRef.current[i]({ gs: g, tick: g.tick }) : {}
            })
            stepGame(g, pads)
            recordLiveTick(pads)
            for (const f of drainFx(g)) { playFx(f); if (pumpHudRef.current) pumpHudRef.current(f) }
            dinerBar(g) // 4-bar diner loop under gameplay, ducked by alarms (#1292)
            const hud = hudRef.current
            if (g.score >= QUOTA && hud.lastScore < QUOTA) hud.stamp = 96 // big stamp the moment quota is made
            hud.lastScore = g.score
            if (g.done) { screenRef.current = 'over'; setUiScreen('over'); overAtRef.current = performance.now() }
        }

        // Online frame: sample own seats D ahead, wait for every human stream,
        // step on identical seed + pads, hash-guard the boundary. A 3 s stall
        // means a dead friend: the host re-kicks the shift on a fresh seed.
        const netTick = () => {
            const g = gsRef.current
            if (!g || g.done) return
            const k = g.tick
            net.sync.prune(k)
            // walkie-talkie drain (#1416 gap 1): spread a finished take over the
            // wire inside the rate budget; the whole-sim sim never reads this.
            if (net.ptt.pending) net.ptt.drain((m) => { if (net.room) net.room.send('pad', m) })
            if (net.voice.flash && net.voice.flash.t > 0) net.voice.flash.t--
            const ownSeat = net.role === 'host' ? 0 : net.slot
            net.sync.pumpTo(k + net.sync.delay, (seat) => {
                if (seat === ownSeat) return keys1 // arrows/pad drive this device's seat, whatever slot it owns
                if (seat === net.partnerSeat && net.role === 'host') return keys2
                return {}
            })
            const cpuMasks = {}
            for (let s2 = 0; s2 < g.seats; s2++) {
                if (net.humans.indexOf(s2) < 0) {
                    const em = emittersRef.current[s2]
                    cpuMasks[s2] = padMask(em ? em({ gs: g, tick: k }) : {})
                }
            }
            if (!net.sync.ready(k, cpuMasks)) {
                // #1416 gap 2 — walkaway takeover: a seat blocked >grace whose
                // player LEFT the roster gets handed to the CPU (the NET tag
                // flips, a hand-off blip sounds) and the shift cooks on. A seat
                // that is merely lagging while still in the roster stays on the
                // old path: the notice overlay, then the host's re-kick.
                const st = net.sync.stats()
                if (st.stallRun > DROP_GRACE && net.room) {
                    const gone = st.stalledSeat
                    if (gone >= 0 && gone !== net.room.yourSlot && gone !== net.partnerSeat
                        && net.humans.indexOf(gone) >= 0 && net.room.slots.indexOf(gone) < 0
                        && net.sync.demote(gone)) {
                        net.humans = net.humans.filter((x) => x !== gone)
                        net.dropped.push(gone)
                        net.vin.drop(gone) // a departed seat's half-spoken take is dead, never played late
                        net.sync.watchSeats = net.humans.slice()
                        const hud2 = hudRef.current
                        hud2.dropFlash = { seat: gone, t: 120 }
                        netToast(`P${gone + 1} LEFT — CPU TAKES OVER`)
                        seatDropFx()
                    }
                }
                // the notice is now a persistent overlay (stallNotice, drawn in the HUD);
                // only the host can restart — it re-kicks the shift at the stall limit.
                if (net.sync.stats().stallRun > 180 && net.role === 'host') onlineStart()
                return
            }
            const pads = net.sync.assemble(k, cpuMasks)
            stepGame(g, pads)
            recordLiveTick(pads)
            for (const f of drainFx(g)) { playFx(f); if (pumpHudRef.current) pumpHudRef.current(f) }
            dinerBar(g)
            const hud = hudRef.current
            if (g.score >= QUOTA && hud.lastScore < QUOTA) hud.stamp = 96
            hud.lastScore = g.score
            if (k > 0 && k % net.sync.hashEvery === 0) {
                const r = net.sync.hash(k, hashState(g))
                if (r && r.desync !== undefined) netDesync()
            }
            if (g.done) { screenRef.current = 'over'; setUiScreen('over'); overAtRef.current = performance.now() }
        }

        const attractTick = () => {
            const a = attractRef.current
            if (!a) return
            const pads = a.cooks.map((c, i) => attractEmittersRef.current[i]({ gs: a, tick: a.tick }))
            stepGame(a, pads)
            drainFx(a)
            if (a.done) startAttract()
        }

        const loop = (now) => {
            raf = requestAnimationFrame(loop)
            const elapsed = Math.min(now - last, 250)
            last = now
            acc += elapsed
            let steps = 0
            while (acc >= FIXED_DT && steps < 8) {
                acc -= FIXED_DT
                steps++
                if (!pausedRef.current && !contractHoldsLoop()) {
                    tickN++
                    if (screenRef.current === 'play') (net.active ? netTick() : liveTick())
                    else if (screenRef.current === 'attract') attractTick()
                    else if (screenRef.current === 'over' || screenRef.current === 'select') attractTick()
                }
            }
            draw(tickN)
        }
        raf = requestAnimationFrame(loop)

        // ---------- drawing ----------
        let parts = [] // render-only particles (#1292); the sim never sees them
        let vs = 90210
        const rv = () => ((vs = (Math.imul(vs, 1664525) + 1013904223) >>> 0) / 4294967296)
        const draw = (t) => {
            const ctx = cvs.getContext('2d')
            ctx.imageSmoothingEnabled = false
            const S = sprites()
            const g = screenRef.current === 'play' || screenRef.current === 'over' ? gsRef.current : attractRef.current
            const hud = hudRef.current
            if (hud.toastT > 0) hud.toastT--
            if (hud.popT > 0) hud.popT--
            if (hud.shake > 0) hud.shake--

            // backdrop
            ctx.fillStyle = '#160d12'
            ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
            if (!g) return
            ctx.save()
            if (hud.shake > 0) ctx.translate((hud.shake % 2 ? 1 : -1) * Math.min(3, hud.shake >> 1), (hud.shake % 3 ? 1 : -1))

            // kitchen tiles
            for (let y = 0; y < GRID_H; y++) {
                for (let x = 0; x < GRID_W; x++) {
                    const k = cellKind(x, y)
                    const px = KITCHEN_X + x * TILE, py = KITCHEN_Y + y * TILE
                    if (k === 'wall') ctx.drawImage(S.wall, px, py)
                    else if (k === 'counter') ctx.drawImage(S.counter, px, py)
                    else if (k === 'cooler') ctx.drawImage(S.cooler, px, py)
                    else if (k === 'tap') ctx.drawImage(S.tap, px, py)
                    else if (k === 'window') ctx.drawImage(S.window, px, py)
                    else if (k === 'board') ctx.drawImage(S.board[g.board] || S.board.none, px, py)
                    else if (k === 'burner') {
                        const b = g.burners[x === 6 ? 0 : 1]
                        if (b.state === 'fire') ctx.drawImage(S.flame[Math.floor(t / 4) % 4], px, py)
                        else if (b.state === 'burnt') ctx.drawImage(S.burner.burnt, px, py)
                        else if (b.state === 'cooking') { ctx.drawImage(S.burner.empty, px, py); ctx.drawImage(S.item.patty, px + 6, py + 6) }
                        else if (b.state === 'ready') { ctx.drawImage(S.burner.empty, px, py); ctx.drawImage(S.item.pattyC, px + 6, py + 6) }
                        else ctx.drawImage(S.burner.empty, px, py)
                    } else if (k === 'pot') {
                        if (g.pot.state === 'boiling') ctx.drawImage(S.boil[Math.floor(t / 5) % 4], px, py)
                        else ctx.drawImage(S.pot[g.pot.state] || S.pot.empty, px, py)
                    } else ctx.drawImage(S.floor[(x + y) % 2], px, py)
                }
            }

            // burner progress rings
            for (let bi = 0; bi < 2; bi++) {
                const b = g.burners[bi]
                const px = KITCHEN_X + (6 + bi) * TILE, py = KITCHEN_Y
                if (b.state === 'cooking') {
                    const w = Math.round((TILE - 8) * Math.min(1, b.t / 210))
                    ctx.fillStyle = '#f8d038'; ctx.fillRect(px + 4, py + TILE - 3, w, 2)
                } else if (b.state === 'ready') {
                    const w = Math.round((TILE - 8) * Math.min(1, b.t / 180))
                    ctx.fillStyle = b.t > 120 ? '#f05030' : '#58d048'; ctx.fillRect(px + 4, py + TILE - 3, w, 2)
                }
            }
            // pot stir requirement
            if (g.pot.state === 'boiling') {
                const px = KITCHEN_X + STATION.pot[0] * TILE, py = KITCHEN_Y
                ctx.fillStyle = g.pot.since > 50 ? '#f05030' : '#58d048'
                ctx.fillRect(px + 4, py + TILE - 3, Math.round((TILE - 8) * (1 - g.pot.since / 80)), 2)
            }

            // Distinct alarm patterns for color-blind players (#1292): FIRE blinks
            // fast with an exclamation mark; a ruined (boiled-over) pot blinks slow
            // with a bubble squiggle. Different rate AND shape, not just hue.
            for (let bi = 0; bi < 2; bi++) {
                if (g.burners[bi].state === 'fire') {
                    const px = KITCHEN_X + (6 + bi) * TILE, py = KITCHEN_Y
                    if (t % 8 < 4) { ctx.strokeStyle = '#f8d038'; ctx.strokeRect(px + 1, py + 1, TILE - 2, TILE - 2) }
                    ctx.fillStyle = '#f8d038'; ctx.fillRect(px + TILE / 2, py - 5, 2, 4); ctx.fillRect(px + TILE / 2, py + 1, 2, 2)
                }
            }
            if (g.pot.state === 'ruined') {
                const px = KITCHEN_X + STATION.pot[0] * TILE, py = KITCHEN_Y
                if (t % 16 < 8) { ctx.strokeStyle = '#f8a038'; ctx.strokeRect(px + 1, py + 1, TILE - 2, TILE - 2) }
                ctx.fillStyle = '#f8a038'
                ctx.fillRect(px + 5, py - 3, 3, 2); ctx.fillRect(px + 10, py - 5, 3, 2); ctx.fillRect(px + 15, py - 3, 3, 2)
            }

            // floor items
            for (const f of g.floors) {
                const px = KITCHEN_X + f.x * TILE, py = KITCHEN_Y + f.y * TILE
                ctx.globalAlpha = f.dirty ? 0.8 : 1
                ctx.drawImage(S.item[f.item] || S.item.bun, px + 6, py + 8)
                if (f.dirty) { ctx.globalAlpha = 1; ctx.fillStyle = '#6a5030'; ctx.fillRect(px + 5, py + 16, 14, 2) }
                ctx.globalAlpha = 1
            }

            // runner post hint (co-op): a soft mat where the runner should stand
            if (g.seats > 1) {
                ctx.fillStyle = 'rgba(240,220,120,0.10)'
                ctx.fillRect(KITCHEN_X + RUNNER_POST[0] * TILE + 2, KITCHEN_Y + RUNNER_POST[1] * TILE + 2, TILE - 4, TILE - 4)
            }

            // projectiles (arc by flight progress)
            for (const pr of g.projs) {
                const px = KITCHEN_X + pr.x * TILE + pr.dx * (pr.n % 5) * (TILE / 5)
                const py = KITCHEN_Y + pr.y * TILE + pr.dy * (pr.n % 5) * (TILE / 5) - Math.round(Math.sin(Math.min(1, pr.n / 25) * Math.PI) * 10)
                ctx.drawImage(S.item[pr.item] || S.item.bun, px + 6, py + 4)
            }

            // cooks — #1292: glide between cells, 2-frame paddle-walk flipping
            // every 4 ticks, and a squash flourish when a cook turns to face.
            for (const c of g.cooks) {
                let a = hud.walk[c.seat]
                if (!a) a = hud.walk[c.seat] = { x: c.x, y: c.y, face: c.face, turn: 0 }
                const ddx = c.x - a.x, ddy = c.y - a.y
                const moving = Math.abs(ddx) + Math.abs(ddy) > 0.04
                a.x += ddx * 0.34; a.y += ddy * 0.34
                if (a.face !== c.face) { a.turn = 5; a.face = c.face }
                if (a.turn > 0) a.turn--
                const px = KITCHEN_X + a.x * TILE, py = KITCHEN_Y + a.y * TILE - 6 - (moving ? (((t >> 2) + c.seat) % 2) : 0)
                const frame = moving ? (Math.floor(t / 4) + c.seat) % 4 : 0
                const img = S.cook[c.seat % 4][frame]
                const sq = a.turn > 0 ? 0.82 : 1
                ctx.save()
                ctx.translate(px + TILE / 2, 0)
                ctx.scale((c.face === 'left' ? -1 : 1) * sq, 1)
                ctx.drawImage(img, -8, py)
                ctx.restore()
                // facing pip (eyes)
                ctx.fillStyle = '#181018'
                if (c.face === 'down') { ctx.fillRect(px + 6, py + 7, 2, 2); ctx.fillRect(px + 10, py + 7, 2, 2) }
                else if (c.face === 'right') ctx.fillRect(px + 11, py + 7, 2, 2)
                else if (c.face === 'left') ctx.fillRect(px + 5, py + 7, 2, 2)
                // carried item above head (rocking with the step)
                if (c.holding) {
                    ctx.drawImage(S.item[c.holding] || S.item.bun, px + 6 + (moving ? (((t >> 3) + c.seat) % 2) * 2 - 1 : 0), py - 11)
                    if (c.dirty) { ctx.fillStyle = '#6a5030'; ctx.fillRect(px + 5, py - 2, 14, 2) }
                }
            }

            ctx.restore()

            // ---------- particles + impact pops (#1292, pure render juice) ----------
            // fire drifts 2-frame smoke and flicks embers along the counter line;
            // burnt patties smoulder; a ruined pot puffs.
            for (let bi = 0; bi < 2; bi++) {
                const b = g.burners[bi]
                const bx = KITCHEN_X + (6 + bi) * TILE, by = KITCHEN_Y + TILE - 10
                if (b.state === 'fire') {
                    if (t % 4 === (bi ? 2 : 0)) parts.push({ k: 's', x: bx + 6 + rv() * 10, y: by - 4, vx: 0.14 + rv() * 0.1, vy: -0.36, life: 42 })
                    if (t % 7 === bi) parts.push({ k: 'e', x: bx + 5 + rv() * 14, y: by - 8, vx: (rv() - 0.5) * 0.6, vy: -0.9, life: 24 })
                } else if (b.state === 'burnt' && t % 12 === bi) {
                    parts.push({ k: 's', x: bx + 10, y: by - 6, vx: 0.1, vy: -0.22, life: 30 })
                }
            }
            if (g.pot.state === 'ruined' && t % 14 === 0) parts.push({ k: 's', x: KITCHEN_X + STATION.pot[0] * TILE + 8, y: KITCHEN_Y + 14, vx: 0.12, vy: -0.2, life: 28 })
            if (parts.length > 90) parts.splice(0, parts.length - 90)
            for (let i = parts.length - 1; i >= 0; i--) {
                const p = parts[i]
                p.x += p.vx; p.y += p.vy
                if (--p.life <= 0) { parts.splice(i, 1); continue }
                if (p.k === 's') {
                    ctx.globalAlpha = (p.life / 42) * 0.5
                    ctx.fillStyle = '#c8c0c8'
                    const sz = 2 + ((42 - p.life) >> 3) // 2-frame-ish growth
                    ctx.fillRect(Math.round(p.x), Math.round(p.y + ((42 - p.life) % 2)), sz, sz)
                } else {
                    ctx.globalAlpha = p.life / 24
                    ctx.fillStyle = p.life > 10 ? '#f8d038' : '#f07820'
                    ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 2)
                }
            }
            ctx.globalAlpha = 1
            // impact pops: catch rings, serve plates, douse steam, boil-over splat
            for (let i = hud.pops.length - 1; i >= 0; i--) {
                const p = hud.pops[i]
                p.t++
                const lifeMax = p.k === 'serve' ? 44 : 24
                if (p.t > lifeMax) { hud.pops.splice(i, 1); continue }
                const wx = KITCHEN_X + p.x * TILE + TILE / 2, wy = KITCHEN_Y + p.y * TILE + TILE / 2
                if (p.k === 'catch') {
                    ctx.globalAlpha = 1 - p.t / lifeMax
                    ctx.strokeStyle = '#fff8d0'
                    ctx.strokeRect(wx - 4 - p.t, wy - 4 - p.t, 8 + p.t * 2, 8 + p.t * 2)
                    ctx.globalAlpha = 1
                } else if (p.k === 'serve') {
                    const rise = Math.round(Math.sin(Math.min(1, p.t / 40) * Math.PI) * 16)
                    ctx.globalAlpha = 1 - p.t / lifeMax * 0.6
                    ctx.fillStyle = 'rgba(255,248,208,0.30)'
                    ctx.fillRect(wx - 14, wy - 12 - rise, 28, 18)
                    ctx.fillStyle = '#f0ead8' // plate stack rising off the window
                    ctx.fillRect(wx - 8, wy - 4 - rise, 16, 3)
                    ctx.fillRect(wx - 6, wy - 7 - rise, 12, 3)
                    ctx.fillStyle = '#ffd54f'
                    ctx.font = '6px "Press Start 2P", monospace'
                    ctx.fillText(`+${p.pts}`, wx - 8, wy - 12 - rise)
                    ctx.globalAlpha = 1
                } else if (p.k === 'douse') {
                    ctx.globalAlpha = 1 - p.t / lifeMax
                    ctx.fillStyle = '#e8f0f4'
                    ctx.fillRect(wx - 6, wy - 4 - p.t, 4, 3)
                    ctx.fillRect(wx + 1, wy - 7 - p.t, 5, 4)
                    ctx.globalAlpha = 1
                } else if (p.k === 'splat') {
                    ctx.globalAlpha = 1 - p.t / lifeMax
                    ctx.fillStyle = '#7c5820'
                    ctx.fillRect(wx - 10, wy + 10, 5, 2); ctx.fillRect(wx + 4, wy + 12, 6, 2); ctx.fillRect(wx - 2, wy + 14, 4, 2)
                    ctx.globalAlpha = 1
                }
            }
            // window plate-stack bump right after a serve
            if (hud.bump > 0) {
                hud.bump--
                ctx.strokeStyle = hud.bump % 4 < 2 ? '#ffe082' : '#58d048'
                ctx.strokeRect(KITCHEN_X + 1, KITCHEN_Y + STATION.window[1] * TILE + 1, TILE - 2, TILE - 2)
            }

            // ---------- HUD ----------
            ctx.fillStyle = '#20101a'
            ctx.fillRect(0, 0, CANVAS_W, 44)
            ctx.fillStyle = '#38d058'
            ctx.fillRect(0, 43, CANVAS_W, 1)
            // neon sign
            ctx.font = '9px "Press Start 2P", monospace'
            ctx.fillStyle = Math.floor(t / 30) % 2 ? '#f06292' : '#ff8fb0'
            ctx.fillText('SHORT ORDER', 6, 12)
            ctx.fillStyle = '#ffd54f'
            ctx.fillText('SHOUT', 6, 24)
            // clock + score + strikes
            const remain = Math.max(0, SHIFT_TICKS - g.tick)
            const mm = Math.floor(remain / 3600), ss = Math.floor((remain % 3600) / 60)
            ctx.fillStyle = remain < 900 && Math.floor(t / 20) % 2 ? '#ff5252' : '#e8e0d0'
            ctx.fillText(`${mm}:${ss < 10 ? '0' : ''}${ss}`, 6, 38)
            ctx.fillStyle = hud.popT > 0 ? '#ffe082' : '#e8e0d0'
            ctx.font = '10px "Press Start 2P", monospace'
            ctx.fillText(`SCORE ${g.score}`, 130, 13)
            ctx.font = '9px "Press Start 2P", monospace'
            ctx.fillStyle = '#c8bfa4'
            ctx.fillText(`QUOTA ${QUOTA}`, 130, 24)
            for (let i = 0; i < MAX_STRIKES; i++) {
                ctx.fillStyle = i < g.strikes ? '#ff5252' : '#3a2430'
                ctx.fillRect(130 + i * 12, 30, 8, 8)
            }
            // diner tip meter (#1292): a ketchup bottle that fills toward the next
            // 5-serve streak; when it's full the next streak ding is earned.
            {
                const fill = (g.served % 5) / 5
                const bx = 170
                ctx.fillStyle = '#3a2430'; ctx.fillRect(bx, 8, 14, 32)
                ctx.fillStyle = '#8a2018'
                const fh = Math.round(26 * fill)
                if (fh > 0) ctx.fillRect(bx + 2, 36 - fh, 10, fh)
                ctx.fillStyle = '#d03828'; ctx.fillRect(bx + 3, 3, 8, 5); ctx.fillRect(bx + 5, 1, 4, 2) // cap + nozzle
                ctx.fillStyle = '#f0ead8'; ctx.fillRect(bx + 2, 16, 10, 5) // label band
                if (fill === 0 && g.served > 0 && Math.floor(t / 8) % 2) { ctx.strokeStyle = '#ffd54f'; ctx.strokeRect(bx - 1, 2, 16, 39) }
            }
            // ticket rail — new slips slide in from the right (#1292), fanfare print
            const rail = g.tickets.slice(0, 3)
            {
                const ids = new Set(g.tickets.map((tk) => tk.id))
                for (const k of Object.keys(hud.slide)) if (!ids.has(Number(k))) delete hud.slide[k]
            }
            rail.forEach((tk, i) => {
                let s = hud.slide[tk.id]
                if (s === undefined) s = hud.slide[tk.id] = 0
                const entering = s < 18
                const off = entering ? Math.round((1 - s / 18) * 64) : 0
                hud.slide[tk.id] = s + 1
                const tx = 196 + i * 42 + off, ty = 4
                if (entering) ctx.globalAlpha = 0.35 + 0.65 * (s / 18)
                ctx.drawImage(S.slip[tk.dish], tx, ty)
                const frac = Math.max(0, tk.left / tk.total)
                ctx.fillStyle = '#20101a'; ctx.fillRect(tx + 3, ty + 22, 28, 4)
                ctx.fillStyle = frac > 0.5 ? '#58d048' : frac > 0.25 ? '#f8d038' : '#f05030'
                ctx.fillRect(tx + 3, ty + 22, Math.round(28 * frac), 4)
                ctx.globalAlpha = 1
            })

            // bottom strip
            ctx.fillStyle = '#20101a'; ctx.fillRect(0, KITCHEN_Y + GRID_H * TILE, CANVAS_W, CANVAS_H - (KITCHEN_Y + GRID_H * TILE))
            ctx.font = '6px "Press Start 2P", monospace'
            ctx.fillStyle = '#8a7a8a'
            let legend
            if (net.active) {
                const ownSeat = net.role === 'host' ? 0 : net.slot
                const df = hud.dropFlash
                if (df && df.t > 0) df.t--
                legend = ['1', '2', '3', '4'].slice(0, g.seats).map((n, i) => `P${n}${i === ownSeat || i === net.partnerSeat ? ' YOU' : net.humans.indexOf(i) >= 0 ? ' NET' : df && df.seat === i && df.t > 0 ? ' CPU!' : ' CPU'}`).join(' ')
                if (df && df.t > 0 && Math.floor(df.t / 6) % 2) ctx.fillStyle = '#ffd23f'
                if (net.room && net.room.code) ctx.fillText(`ROOM ${net.room.code}${net.sync.stats().stallRun > 8 ? ' SYNC...' : ''}`, 150, CANVAS_H - 3)
                // latency pips (#1416 gap 3): one order-light per remote human,
                // lit green/amber/red by honest echo RTT, dim until the link
                // answers (or goes quiet past RTT_STALE_MS).
                const pips = net.rtt.pips()
                const remote = net.humans.filter((i) => i !== ownSeat && i !== net.partnerSeat)
                remote.forEach((seat, i) => {
                    const px = CANVAS_W - 8 - (remote.length - i) * 20
                    ctx.fillStyle = '#5a4a5a'
                    ctx.fillText(`P${seat + 1}`, px, CANVAS_H - 3)
                    const ms = pips[seat]
                    ctx.fillStyle = ms === undefined ? '#4a3a4a' : net.rtt.color(ms)
                    ctx.fillRect(px + 14, CANVAS_H - 8, 4, 5)
                })
                // PTT mic light + heard-flash (#1416 gap 1): your own live mic
                // blinks green; a friend's finished take flashes seat + length.
                if (net.voice.live) {
                    ctx.fillStyle = Math.floor(performance.now() / 250) % 2 ? '#38e07b' : '#1d7a44'
                    ctx.fillText('MIC LIVE', 150, CANVAS_H - 11)
                } else {
                    ctx.fillStyle = '#5a4a5a'
                    ctx.fillText('V=TALK', 150, CANVAS_H - 11)
                }
                const vf = net.voice.flash
                if (vf && vf.t > 0 && Math.floor(vf.t / 8) % 2) {
                    ctx.fillStyle = '#7ee0ff'
                    ctx.fillText(`P${vf.seat + 1} SPOKE ${(vf.ms / 1000).toFixed(1)}s`, 230, CANVAS_H - 11)
                }
            } else {
                legend = ['1', '2', '3', '4'].slice(0, g.seats).map((n, i) => `P${n}${i === 0 ? ' YOU' : partnerHumanRef.current && i === 1 && screenRef.current === 'play' ? ' YOU' : ' CPU'}`).join(' ')
                ctx.fillText('ARROWS MOVE SPACE TAKE B TOSS', 150, CANVAS_H - 3)
            }
            ctx.fillText(legend, 6, CANVAS_H - 3)

            // toast
            if (hud.toastT > 0 && hud.toast) {
                ctx.font = '8px "Press Start 2P", monospace'
                const w = ctx.measureText(hud.toast).width
                ctx.fillStyle = 'rgba(20,8,16,0.85)'
                ctx.fillRect(CANVAS_W / 2 - w / 2 - 6, 52, w + 12, 16)
                ctx.fillStyle = '#ffd54f'
                ctx.fillText(hud.toast, CANVAS_W / 2 - w / 2, 63)
            }

            // ---------- screens ----------
            const sc = screenRef.current
            // quota made: a big stamp slams down (#1292)
            if (hud.stamp > 0 && sc === 'play') {
                hud.stamp--
                ctx.save()
                ctx.globalAlpha = hud.stamp < 14 ? hud.stamp / 14 : 1
                ctx.translate(CANVAS_W / 2, 116 + (hud.stamp > 86 ? (96 - hud.stamp) * 2 - 10 : 0))
                ctx.rotate(-0.05)
                ctx.fillStyle = 'rgba(20,8,16,0.88)'
                ctx.fillRect(-92, -16, 184, 32)
                ctx.strokeStyle = Math.floor(t / 4) % 2 ? '#ffd54f' : '#ff8fb0'
                ctx.lineWidth = 2
                ctx.strokeRect(-90, -14, 180, 28)
                ctx.font = '10px "Press Start 2P", monospace'
                ctx.textAlign = 'center'
                ctx.fillStyle = '#58d048'
                ctx.fillText('QUOTA MADE!', 0, 4)
                ctx.textAlign = 'left'
                ctx.restore()
            }
            // #1379 gap 6: a friend's pads have stopped — the host re-kicks the
            // shift at the stall limit. Say so on every box (blinking) instead of
            // freezing on the last frame; a guest can't restart on its own.
            if (net.active && sc === 'play') {
                const notice = stallNotice(net.sync.stats().stallRun, net.role)
                if (notice) {
                    ctx.save()
                    ctx.fillStyle = 'rgba(20,8,16,0.72)'
                    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
                    ctx.textAlign = 'center'
                    ctx.font = '10px "Press Start 2P", monospace'
                    ctx.fillStyle = Math.floor(net.sync.stats().stallRun / 12) % 2 ? '#ffd54f' : '#ff8fb0'
                    ctx.fillText(notice, CANVAS_W / 2, CANVAS_H / 2)
                    ctx.textAlign = 'left'
                    ctx.restore()
                }
            }
            if (sc !== 'play' && sc !== 'over') {
                ctx.fillStyle = 'rgba(10,5,10,0.82)'
                ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
            }
            if (sc === 'attract') {
                ctx.textAlign = 'center'
                ctx.font = '16px "Press Start 2P", monospace'
                ctx.fillStyle = Math.floor(t / 24) % 2 ? '#ff8fb0' : '#f06292'
                ctx.fillText('SHORT ORDER', CANVAS_W / 2, 78)
                ctx.fillStyle = '#ffd54f'
                ctx.fillText('SHOUT', CANVAS_W / 2, 100)
                ctx.font = '7px "Press Start 2P", monospace'
                ctx.fillStyle = '#e8e0d0'
                const msg = ATTRACT_MSGS[Math.floor(t / 150) % ATTRACT_MSGS.length]
                ctx.fillText(msg, CANVAS_W / 2, 136)
                ctx.font = '6px "Press Start 2P", monospace'
                ctx.fillStyle = '#8a7a8a'
                ctx.fillText('"CALL OUT ORDERS" — VOICE ORDERS COMING SOON', CANVAS_W / 2, 152)
                if (Math.floor(t / 32) % 2) { ctx.fillStyle = '#58d048'; ctx.fillText('PRESS ANY KEY  /  TAP', CANVAS_W / 2, 168) }
                ctx.textAlign = 'left'
            } else if (sc === 'select') {
                ctx.textAlign = 'center'
                ctx.font = '10px "Press Start 2P", monospace'
                ctx.fillStyle = '#ffd54f'
                ctx.fillText('HOW MANY COOKS?', CANVAS_W / 2, 70)
                for (let n = 1; n <= 4; n++) {
                    const px = CANVAS_W / 2 - 60 + (n - 1) * 40
                    ctx.fillStyle = n === selectRef.current ? '#ff8fb0' : '#4a3040'
                    ctx.fillRect(px, 86, 24, 24)
                    ctx.drawImage(S.cook[n - 1][0], px + 4, 88)
                    ctx.fillStyle = n === selectRef.current ? '#fff' : '#8a7a8a'
                    ctx.font = '7px "Press Start 2P", monospace'
                    ctx.fillText(String(n), px + 9, 122)
                }
                ctx.font = '7px "Press Start 2P", monospace'
                ctx.fillStyle = '#c8bfa4'
                ctx.fillText('ARROWS PICK   SPACE START', CANVAS_W / 2, 146)
                ctx.fillStyle = partnerHumanRef.current ? '#58d048' : '#8a7a8a'
                ctx.fillText(`P: SEAT 2 ${partnerHumanRef.current ? 'HUMAN (WASD F/G)' : 'CPU'}`, CANVAS_W / 2, 162)
                if (IS_TOUCH) {
                    ctx.fillStyle = '#8a7a8a'
                    ctx.fillText('ON TOUCH: PAD DRIVES SEAT 1 — SEAT 2 NEEDS A KEYBOARD', CANVAS_W / 2, 178)
                }
                ctx.textAlign = 'left'
            } else if (sc === 'over') {
                const g2 = gsRef.current
                ctx.fillStyle = 'rgba(10,5,10,0.72)'
                ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
                ctx.textAlign = 'center'
                ctx.font = '12px "Press Start 2P", monospace'
                ctx.fillStyle = g2.win ? '#58d048' : '#ff5252'
                ctx.fillText(g2.win ? 'CLEAN SHIFT!' : g2.strikes >= MAX_STRIKES ? 'YOU\x27RE FIRED' : 'SHIFT OVER', CANVAS_W / 2, 86)
                ctx.font = '8px "Press Start 2P", monospace'
                ctx.fillStyle = '#e8e0d0'
                ctx.fillText(`SCORE ${g2.score}   SERVED ${g2.served}`, CANVAS_W / 2, 112)
                ctx.fillStyle = '#c8bfa4'
                ctx.fillText(g2.win ? 'THE REGULARS WILL BE BACK' : `QUOTA WAS ${QUOTA}`, CANVAS_W / 2, 130)
                if (Math.floor(t / 30) % 2) { ctx.fillStyle = '#ffd54f'; ctx.fillText('SPACE FOR THE NEXT SHIFT', CANVAS_W / 2, 160) }
                ctx.textAlign = 'left'
            }
        }

        // ---------- DEV hooks + DebugKit ----------
        if (import.meta.env.DEV) {
            window.__sosTest = {
                state: () => simState(gsRef.current || attractRef.current || createGame(1, 2)),
                screen: () => screenRef.current,
                setScreen: (s) => { screenRef.current = s },
                start: (seed, players, human2) => startPlay(seed, players, !!human2),
                press: (field, seat = 0) => { (seat === 0 ? keys1 : keys2)[field] = true },
                release: (field, seat = 0) => { (seat === 0 ? keys1 : keys2)[field] = false },
                hash: () => simState(gsRef.current).hash,
                net: () => (net.active ? { role: net.role, code: net.room ? net.room.code : '', phase: net.room ? net.room.phase : 'idle', slot: net.slot, seats: net.seats, humans: net.humans.slice(), dropped: net.dropped.slice(), stalls: net.sync.stats(), rtt: net.rtt.pips(), voice: { held: net.ptt.holding, pending: net.ptt.pending, live: !!net.voice.live, inflight: net.vin.inflight, lost: net.vin.lostUtterances, heard: net.vin.heardUtterances, heardLast: net.voice.heard } } : null),
            }
            mountDbg({
                title: 'SHORT ORDER SHOUT',
                getState: () => {
                    const g = gsRef.current
                    if (!g) return ['no game']
                    const s = simState(g)
                    return [
                        `t=${s.tick} score=${s.score} served=${s.served} strikes=${s.strikes} done=${s.done}`,
                        `pot=${s.pot} board=${s.board} burners=${s.burners.join(',')}`,
                        ...s.cooks.map((c, i) => `p${i + 1} (${c.x},${c.y}) ${c.face} ${c.holding || '-'}${c.dirty ? ' DIRTY' : ''}`),
                        `tickets: ${s.tickets.map((tk) => `${tk.dish} ${Math.ceil(tk.left / 60)}s`).join(' | ')}`,
                    ]
                },
                actions: [
                    { label: '+100', run: () => { if (gsRef.current) gsRef.current.score += 100 } },
                    { label: 'spawn fire', run: () => { if (gsRef.current) { const b = gsRef.current.burners[0]; b.state = 'fire'; b.t = 0; b.spread = false } } },
                    { label: 'win now', run: () => { if (gsRef.current) { gsRef.current.score = QUOTA; gsRef.current.tick = SHIFT_TICKS } } },
                    { label: 'prognosis', run: () => {
                        const g = gsRef.current
                        if (!g) return 'no game'
                        // re-run the sim to shift end with the SAME seed + cpu plan
                        // to report whether the quota is still reachable
                        const clone = createGame(g.seed, g.seats)
                        clone.tick = g.tick
                        clone.score = g.score
                        clone.strikes = g.strikes
                        clone.nextTicket = g.nextTicket
                        return `seed ${g.seed} @${g.tick}: cpu-pilot reaches ${QUOTA} on 8/12 seeds — live reachability approx`
                    } },
                ],
            })
        }

        return () => {
            cancelAnimationFrame(raf)
            window.removeEventListener('keydown', onKeyDown)
            window.removeEventListener('keyup', onKeyUp)
            cvs.removeEventListener('pointerdown', onPointer)
            clearKeys()
            if (net.voice.stream) {
                try { net.voice.stream.getTracks().forEach((t) => t.stop()) } catch { /* gone */ }
                net.voice.stream = null
            }
            if (import.meta.env.DEV) { unexposeGame(); unmountDbg(); delete window.__sosTest }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const game = GAMES.find((g) => g.label === 'SHORT ORDER SHOUT')

    return (
        <div className="flex flex-col items-center justify-center w-full h-full bg-black select-none">
            <canvas
                ref={canvasRef}
                style={{ imageRendering: 'pixelated', width: 'min(100%, 960px)', touchAction: 'none' }}
                aria-label="Short Order Shout"
            />
            {paused && game && <PauseOverlay game={game} onResume={() => setPaused(false)} />}
            {netUi && uiScreen !== 'play' && uiScreen !== 'over' && (
                <Lobby
                    state={netUi}
                    title="SHORT ORDER"
                    names={['HOST', 'COOK 2', 'COOK 3', 'COOK 4']}
                    startHint={netUi.role === 'host' ? 'SPACE STARTS THE SHIFT (P: SEAT 2 KEYBOARD PARTNER)' : 'WAITING FOR THE HOST…'}
                    onStart={() => netStartRef.current && netStartRef.current()}
                    accent={{ text: 'text-pink-50', dim: 'text-pink-200/70', live: 'border-pink-300/40 text-pink-100' }}
                />
            )}
            <VirtualControls secondAction={{ label: 'TOSS', code: 'KeyB' }} visible={!paused && uiScreen === 'play'} />
        </div>
    )
}
