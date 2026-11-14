// TALK ME DOWN — split-info bomb defuse (#1252). ONE SEES THE BOMB, THE OTHER
// HOLDS THE MANUAL: seat 1 owns the panel (cursor + verbs) but no rules; seat 2
// owns the typewritten rulebook but no hands. Between the two human seats there
// is only the couch — or the mic (V, voice.js grammar, #1247). Solo, a CPU
// partner holds the manual and prints orders on the LCD rail. The sim is pure,
// seeded and deterministic (seed + per-seat pads => identical hashes, #494);
// rules + generation live in ./engine.js, the look in ./art.js.
// #1880 lifts the couch into two rooms: ?net=host opens a squad room (you keep
// the bomb), ?net=join&room=CODE seats you at the manual. One seed runs the
// twin engine on both boxes; pads cross the wire in lockstep (./net.js).

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import WatchButton, { WatchToast, AttractWatchButton } from '../../components/WatchButton'
import Lobby from '../../components/Lobby.jsx'
import { isWatchKey, isTakeoverKey, playWatchStart, playWatchStop, watchSfxLog, WATCH_ATTRACT_HINT } from '../../utils/watch'
import { GAMES } from '../../config/games'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop, isRecording, recordLiveTick, recordVoiceCmd, exposeFeedbackState, unexposeFeedbackState, seedFromQuery, armLiveCapture } from '../../utils/gameContract'
import { initAutoRecord, askConsent, beginRun, endRun, startBusy, setStartBusy } from '../../utils/autoRecord'
import { startSpeechListen, speechSupported } from '../../utils/speechListen'
import { makeTransport } from '../../utils/linkPeers.js'
import { createLobby, lobbyRole, relayFromQuery } from '../../utils/lobby.js'
import {
    createGame, step, simState, solvePad, computeTarget, hash, drainEvents,
    QUOTA_BOMBS, MAX_STRIKES, WIRE_COLORS, GLYPHS, RULEBOOK,
} from './engine.js'
import {
    createTmdSync, snapshotNet, restoreNet, packSnap,
    DROP_GRACE, HASH_EVERY, RESEAT_LEAD, RESEAT_WINDOW,
} from './net.js'
import { parseCall, intentLabel, applyCallKey, CALL_LINE_MAX } from './voice.js'
import { sfx } from './audio.js'
import * as ART from './art.js'

const FIXED_DT = 1000 / 60
// #1880: one URL decides the role — ?net=host opens the squad room,
// ?net=join&room=CODE sits at the manual. Every other query is the couch game.
const NET_ROLE = typeof window !== 'undefined' ? lobbyRole(window.location.search) : null
// #1373: tap-to-talk is gated to touch surfaces (the #1287 lesson: phones
// have no V key). `?touch=1` forces it so a desktop browser harness can pin
// the pill without emulating a tablet.
const TOUCH_UI = typeof window !== 'undefined' && !!((window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || (navigator.maxTouchPoints || 0) > 0)
const URL_TOUCH = typeof window !== 'undefined' && /[?&]touch=1/.test(window.location.search)
// #1888: `?touch=0` forces the DESKTOP layout on a touch device — the link
// drive pins the narrow page (regression) from the same phone-shaped tab it
// already uses, so the wide/narrow pair is deterministic in every boot mode.
const URL_NO_TOUCH = typeof window !== 'undefined' && /[?&]touch=0/.test(window.location.search)
const ATTRACT_MSGS = [
    'ONE SEES THE BOMB',
    'THE OTHER HOLDS THE MANUAL',
    'NEITHER CAN WIN ALONE',
    'V = MIC: SHOUT "CUT RED"',
    'NO MIC? X TYPES THE CALL',
    'THREE STRIKES AND THE BLOCK GLOWS',
    'UP AT MODULE 1 TILTS THE BOMB OVER',
    'A ON THE BACK PULLS A BATTERY OUT',
    `CLEAR ${QUOTA_BOMBS} BOMBS = SQUAD CHIEF`,
    'FIND A SQUAD — ONE BOMBS, ONE READS (?net=host)',
]

// #1473: honor ?seed=N so a filed feedback report's seed replays this exact
// bomb set (rng derives from any integer seed); unpin = the original 1..65535 roll.
const humanSeed = () => {
    const pin = seedFromQuery()
    return pin != null ? (pin >>> 0 || 1) : 1 + Math.floor(Math.random() * 65535)
}

export default function TalkMeDown() {
    const canvasRef = useRef(null)
    const [paused, setPaused] = useState(false)
    const pausedRef = useRef(false)
    pausedRef.current = paused
    const [screen, setUiScreen] = useState('attract')
    const [micOn, setMicOn] = useState(false) // #1373: pill label mirrors the mic
    const screenRef = useRef('attract') // attract | select | play | over
    const gsRef = useRef(null)
    const railFxRef = useRef(ART.makeRailFx()) // #1923 THE SLIDE: view-only rail animation
    // #1915 fresh-flip lead: for a moment after the tilt the back beats its
    // own drain hint (view-only counter, never enters the sim or hash).
    const flipLeadRef = useRef(0)
    const attractRef = useRef(null)
    const seatsRef = useRef(1)
    const selectRef = useRef(1)
    const keys1Ref = useRef({})
    const keys2Ref = useRef({})
    const driveAutoRef = useRef(false) // #1880 drive autopilot flag (DEV hook)
    const hudRef = useRef({
        shake: 0, sparks: [], banner: null, pulse: null, popT: 0, winTick: 0, boomTick: 0,
        flash: 0, zap: null, lcdFx: 0, lastOrder: null, humT: 0, beatT: 0, // #1305 juice
        curtain: null, // #1373: BOMB n INBOUND round-transition screen
    })
    const manualHiddenRef = useRef(false)
    const voiceRef = useRef({ on: false, listen: null })
    const voiceLogRef = useRef([])
    // #1894 CALL-BY-KEY: shell-side composition (like the mic, never sim
    // state, never hashed). ENTER shouts the buffer through voiceCall — the
    // mic's own entry — so grammar, pulse, banner and bank are one path.
    const callRef = useRef({ open: false, buf: '' })
    const overAtRef = useRef(0)
    const [watching, setWatching] = useState(false) // #1637 WATCH: mirrors the seat flag for the chrome
    const watchingRef = useRef(false)
    const pendingWatchRef = useRef(false) // #1637: Y banked at attract/select — seats when the run starts
    // #1880 remote seats: the lobby, the lockstep core and the link state all
    // live here; the loop reads netRef.current like BombDefuse reads its own.
    const netRef = useRef({
        active: NET_ROLE !== null, role: NET_ROLE, lobby: null, room: null, sync: null,
        miss: 0, desyncs: 0, desyncFrozen: false, hostLost: false,
        reseatSeat: null, reseatWait: 0, reseatBackTick: null, reseatArm: false,
    })
    const [netUi, setNetUi] = useState(null)
    // #1880: the guest's heard page-words fold into its OWN sampled pad
    // stream (queued right-taps) — words ride the same ticks both boxes run,
    // never a direct mutation of shared state (#1247 law, online form).
    const pageTapsRef = useRef(0)
    const seedRef = useRef(1)
    const msgIdxRef = useRef(0)
    const msgAtRef = useRef(0)

    const setScreen = (s) => {
        screenRef.current = s; setUiScreen(s)
        if (s !== 'play') { callRef.current.open = false; callRef.current.buf = '' } // #1894: the line lives only at the panel
    }

    const startPlay = useCallback((seed, players) => {
        seatsRef.current = Math.max(1, Math.min(2, players | 0 || 1))
        seedRef.current = seed
        gsRef.current = createGame(seed, seatsRef.current)
        manualHiddenRef.current = false
        hudRef.current.pulse = null
        hudRef.current.banner = null
        hudRef.current.curtain = null
        voiceLogRef.current = []
        setScreen('play')
        sfx.start()
        // #1637 WATCH: a seat banked at attract/select arrives with the run —
        // the proven defuser takes the wheel as the fuse starts.
        if (pendingWatchRef.current) { pendingWatchRef.current = false; watchingRef.current = true; setWatching(true); playWatchStart() }
    }, [])

    const startAttract = useCallback(() => {
        attractRef.current = createGame(1000 + Math.floor(Math.random() * 9999), 1)
        pendingWatchRef.current = false // a fresh attract drops any stale bank
        msgIdxRef.current = 0
        msgAtRef.current = performance.now()
        setScreen('attract')
    }, [])

    // ---- voice: mic text -> grammar -> target pulse / refuse-why (#1247) ----
    const voiceCall = useCallback((text) => {
        const gs = gsRef.current
        const hud = hudRef.current
        const intent = parseCall(text)
        const entry = { t: gs ? gs.tick : 0, said: text, intent: intent || null, ok: false }
        if (!gs || gs.done || screenRef.current !== 'play') return
        if (!intent) {
            hud.banner = { text: `HEARD: "${text.slice(0, 20).toUpperCase()}" -> ?`, ok: false }
            hudRef.current.popT = 0
            sfx.refused()
            voiceLogRef.current.push(entry)
            // #1415: words that reached the mic but meant nothing still bank
            // (intent null, why NO CALL) — the trace records the shout, #1249.
            recordVoiceCmd({ said: text.slice(0, 80), intent: null, ok: false, why: 'NO CALL' })
            return
        }
        const m = gs.modules[gs.cursor.mod]
        let whyText = ''
        const refuse = (why) => {
            whyText = why
            hud.banner = { text: `${intentLabel(intent)} -> ${why}`, ok: false }
            sfx.refused()
        }
        if (intent.kind === 'page') {
            if (netRef.current.active) {
                // #1880: online, words cannot reach into the shared sim
                // directly — manual.page rides the hash. The guest (page
                // holder) folds the heard page into its own sampled pad
                // stream as queued right-taps: both boxes turn the page on
                // the SAME ticks. The host never owns the page.
                const want = { neon: 0, dial: 1, glyph: 2 }[intent.page]
                if (netRef.current.role === 'host' || want == null) {
                    hud.banner = { text: 'THEIR PAGE TO TURN', ok: false }
                    sfx.refused()
                } else {
                    pageTapsRef.current += (want - gs.manual.page + 3) % 3
                    hud.banner = { text: `HEARD: PAGE ${intent.page.toUpperCase()}`, ok: true }
                    sfx.heard()
                }
            } else {
                gs.manual.page = { neon: 0, dial: 1, glyph: 2 }[intent.page] ?? gs.manual.page
                manualHiddenRef.current = false
                hud.banner = { text: `PAGE ${intent.page.toUpperCase()}`, ok: true }
                sfx.heard()
            }
        } else if (intent.kind === 'flip') {
            // #1797: a shouted flip PULSES the tilt hint — heard words make
            // things visible, the defuser's hands stay their own (#1247).
            hud.pulse = { mod: -1, kind: 'flip', t: 120 }
            hud.banner = { text: 'HEARD: FLIP', ok: true }
            sfx.heard()
        } else if (intent.kind === 'pull') {
            // #1923: a shouted PULL IT pulses the drain story — the mouth
            // chevron throbs faster with the back up, the tilt hint leads it
            // face-up (you must flip to reach the rail). It never pulls: the
            // hand belongs to seat 1 (#1247 words-never-act law).
            hud.pulse = { mod: -1, kind: 'pull', t: 120 }
            hud.banner = { text: 'HEARD: PULL', ok: true }
            sfx.heard()
        } else if (!m) refuse('NO MODULE')
        else if (m.solved) refuse('ALREADY SAFE')
        else if (m.locked > 0) refuse('MODULE LOCKED')
        else if (intent.kind === 'cut') {
            if (m.type !== 'N') refuse('NO WIRES HERE')
            else {
                const ci = WIRE_COLORS.findIndex(c => c === intent.color.toUpperCase())
                const wi = m.wires.findIndex(w => w.color === ci && !w.cut)
                if (wi < 0) refuse(`NO ${intent.color.toUpperCase()} WIRE`)
                else {
                    hud.pulse = { mod: gs.cursor.mod, kind: 'wire', idx: wi, t: 120 }
                    hud.banner = { text: `HEARD: CUT ${intent.color.toUpperCase()}`, ok: true }
                    entry.dir = wi
                    sfx.heard()
                }
            }
        } else if (intent.kind === 'press') {
            if (m.type !== 'G') refuse('NO KEYPAD HERE')
            else {
                hud.pulse = { mod: gs.cursor.mod, kind: 'glyph', idx: GLYPHS.indexOf(intent.glyph.toUpperCase()), t: 120 }
                hud.banner = { text: `HEARD: PRESS ${intent.glyph.toUpperCase()}`, ok: true }
                sfx.heard()
            }
        } else if (intent.kind === 'dial') {
            if (m.type !== 'D') refuse('NO DIAL HERE')
            else {
                hud.pulse = { mod: gs.cursor.mod, kind: 'dialval', val: intent.value, t: 120 }
                hud.banner = { text: `HEARD: DIAL ${intent.value}`, ok: true }
                sfx.heard()
            }
        } else if (intent.kind === 'set') {
            if (m.type !== 'D') refuse('NO DIAL HERE')
            else {
                hud.pulse = { mod: gs.cursor.mod, kind: 'set', t: 120 }
                hud.banner = { text: 'HEARD: SET', ok: true }
                sfx.heard()
            }
        }
        entry.ok = !!(hud.banner && hud.banner.ok)
        voiceLogRef.current.push(entry)
        // #1415: every heard call banks into the live capture (#1249 pattern).
        // The recorder stamps t on its own clock; what the seat DID next is
        // in slots[0].pads on the same clock, so the entry carries only the
        // words, the meaning and the consent (dir = wire index on a cut).
        recordVoiceCmd({
            said: text.slice(0, 80),
            intent: intent.kind,
            ok: entry.ok,
            ...(entry.ok && entry.dir !== undefined ? { dir: entry.dir } : {}),
            ...(!entry.ok ? { why: whyText || 'REFUSED' } : {}),
        })
    }, [])

    const toggleVoice = useCallback(() => {
        const v = voiceRef.current
        v.on = !v.on
        setMicOn(v.on) // #1373: the touch pill's label must track the mic
        if (v.on) {
            v.listen = startSpeechListen({ onPhrase: (p) => voiceCall(p), onError: () => { /* badge tells the truth */ } })
        } else if (v.listen) { v.listen.stop(); v.listen = null }
    }, [voiceCall])

    // one spec object, built in the effect (its `players` stays live via getter)
    const makeSpec = () => {
        let prevPad = {}
        return {
            id: 'talk-me-down',
            method: 'dpad',
            get players() { return seatsRef.current },
            buttons: ['a', 'b'],
            reads: ['up', 'down', 'left', 'right', 'a', 'b'],
            sources: () => {
                const out = [{ kind: 'human' }]
                if (seatsRef.current > 1) out.push({ kind: 'human' })
                else out.push({ kind: 'cpu' })
                return out
            },
            reset: (seed, players) => { startPlay(seed >>> 0 || 1, Math.max(1, Math.min(2, players | 0 || 1))) },
            tick: (pad, pads) => {
                const g = gsRef.current
                if (!g || g.done) return
                const merged = [pads && pads[0] ? pads[0] : pad]
                if (g.players > 1) merged.push((pads && pads[1]) || {})
                // #1305: is this tick a dial turn? (shell-only — sound choice,
                // never sim state: cursor module is D and a left/right edge moves it)
                const cm = g.modules[g.cursor.mod]
                const dialTurn = !!cm && cm.type === 'D' && !cm.solved && cm.locked === 0 &&
                    ((merged[0].left && !prevPad.left) || (merged[0].right && !prevPad.right))
                // #1923: the hand on the rail gets a voice. While the back is
                // up, a LEFT/RIGHT press that moves the hand is free handling —
                // but silent handling reads as a dead pad on a phone. One soft
                // tick per fresh press-edge that actually moved it (same edge
                // law as dialTurn: the engine has no lock in the flipped
                // branch, so a HELD arrow slides the hand every tick — that
                // must be one tick of sound per press, not a 60 Hz rattle).
                // View-only: the sim never hears this, the hash never sees it.
                const handTurn = g.flip &&
                    ((merged[0].left && !prevPad.left) || (merged[0].right && !prevPad.right))
                const backBefore = g.flip, selBefore = g.sel
                prevPad = { ...merged[0] }
                step(g, merged)
                if (handTurn && backBefore && g.flip && g.sel !== selBefore) sfx.handTick()
                for (const f of drainEvents(g)) {
                    if (f.k === 'key' && dialTurn) sfx.dial()
                    else if (sfx[f.k]) sfx[f.k]()
                    pumpHud(f)
                }
                if (g.done && screenRef.current === 'play') { screenRef.current = 'over'; setUiScreen('over'); overAtRef.current = performance.now(); callRef.current.open = false; callRef.current.buf = '' }
            },
            state: () => {
                const g = gsRef.current || createGame(1, 1)
                return { ...simState(g), players: seatsRef.current }
            },
            watching: () => watchingRef.current && screenRef.current === 'play', // #1637 WATCH
            canvas: () => canvasRef.current,
        }
    }

    const pumpHud = (f) => {
        const hud = hudRef.current
        if (f.k === 'strike') {
            hud.shake = 14
            hud.flash = 30 // #1305: red screen-edge flinch on the wrong verb
            hud.sparks = Array.from({ length: 16 }, () => ({
                x: ART.PANEL.x + 40 + Math.random() * 320, y: ART.PANEL.y + 90 + Math.random() * 180,
                vx: (Math.random() - 0.5) * 5, vy: -Math.random() * 4, life: 18 + Math.random() * 14,
            }))
            // #1305: a fat 500 V arc jumps the terminal strips of the struck
            // NEON module at the wire the player just cut wrong.
            const gs = gsRef.current
            const m = gs && gs.modules[gs.cursor.mod]
            if (m && m.type === 'N' && !m.solved) {
                const r = ART.moduleRect(gs.cursor.mod, gs.modules.length)
                const n = m.wires.length
                const span = Math.min(148, r.h - 24) // #1373: clamp to the bay
                const wi = Math.max(0, m.wires.findIndex(w => !w.cut))
                const top = r.y + Math.max(20, (r.h - span) / 2)
                hud.zap = { x: r.x + 22 + wi * Math.floor((r.w - 56) / Math.max(1, n - 1)),
                    top: top, bot: top + span, t: 14 }
            }
            hud.banner = { text: `STRIKE! ${f.why.toUpperCase()}`, ok: false }
        }
        if (f.k === 'clear') {
            hud.popT = 40
            // #1373: a 1 s curtain between bombs — "BOMB DOWN!" no longer
            // flashes over the already-armed next panel; the squad breathes.
            const gs = gsRef.current
            if (gs && !gs.done) hud.curtain = { n: gs.bombsCleared + 1, t: 62 }
        }
        if (f.k === 'boom') hud.boomTick = 1
        if (f.k === 'flip') {
            hud.shake = Math.max(hud.shake, 6) // #1797: a chunky tilt
            if (f.to === 1) flipLeadRef.current = 96 // #1915: the back advertises its verb
        }
        if (f.k === 'pull' || f.k === 'push') hud.shake = Math.max(hud.shake, 3) // #1909: spring, not thunder
        if (f.k === 'flag') hud.banner = { text: `READ RULE ${f.stamp}`, ok: true }
    }

    useEffect(() => {
        const cvs = canvasRef.current
        if (!cvs) return undefined
        cvs.width = ART.W; cvs.height = ART.H
        const spec = makeSpec()
        startAttract()
        if (import.meta.env.DEV) exposeGame(spec)
        // #1711 S2: arm the live capture for every build; banking only runs
        // while a consented auto capture is open (autoRecord.js).
        initAutoRecord()
        armLiveCapture(spec)
        // Consent goes up BEFORE the bomb is created — the recorder opens at
        // seed-birth so the stored file replay-verifies from tick 1.
        const humanStart = (seed, players) => {
            if (startBusy()) return
            setStartBusy(true)
            askConsent()
                .then(() => { startPlay(seed, players); beginRun() })
                .finally(() => setStartBusy(false))
        }

        // ---- #1880 remote seats: one lobby, one seed, bomb and manual in
        // separate rooms. Host = seat 0 = DEFUSER; guest = seat 1 = MANUAL.
        // One seed runs the identical deterministic engine on both boxes;
        // pads cross the wire in lockstep (the #1819 law) and hash
        // boundaries prove the two bombs are the same bomb. ----
        const nq = new URLSearchParams(window.location.search)
        const net = netRef.current
        const pushNetUi = () => setNetUi(net.lobby ? net.lobby.state() : null)
        net.sync = createTmdSync({
            mySeat: net.role === 'host' ? 0 : 1,
            watchSeats: [],
            send: (t, p) => { if (net.room) net.room.send(t, p) },
        })
        const hostSnap = () => {
            const g = gsRef.current
            if (!g || !net.room) return
            for (const c of packSnap(JSON.stringify(snapshotNet(g)), g.tick)) net.room.send('res', c)
        }
        const netDesync = () => {
            net.desyncs++
            hudRef.current.banner = { text: 'LINK DESYNC — RESYNCING', ok: false }
            if (net.role === 'host') hostSnap()
            else {
                net.desyncFrozen = true
                if (net.room) net.room.send('res', { e: 'req' })
            }
        }
        const startNetMatch = (m) => {
            const seed = ((m && m.seed) >>> 0) || 1
            seatsRef.current = 2
            seedRef.current = seed
            gsRef.current = createGame(seed, 2)
            manualHiddenRef.current = false
            hudRef.current.pulse = null
            hudRef.current.curtain = null
            hudRef.current.banner = {
                text: net.role === 'host' ? 'DEFUSER — YOUR HANDS' : 'MANUAL — YOUR EARS', ok: true,
            }
            voiceLogRef.current = []
            pageTapsRef.current = 0
            watchingRef.current = false; setWatching(false) // #1656: no third wheel online
            net.miss = 0
            net.desyncFrozen = false
            net.hostLost = false
            net.reseatSeat = null; net.reseatWait = 0; net.reseatBackTick = null; net.reseatArm = false
            const room = net.room
            net.sync.mySeat = room && room.yourSlot >= 0 ? room.yourSlot : (net.role === 'host' ? 0 : 1)
            const humans = room && room.slots ? room.slots.slice() : [net.sync.mySeat]
            net.sync.watchSeats = humans.filter((s) => s !== net.sync.mySeat).sort((a, b) => a - b)
            net.sync.reset(0)
            // consent rides the kick gesture (host press) / prior grant (guest);
            // a rejected consent just plays unrecorded — honest.
            askConsent().then(() => beginRun()).catch(() => {})
            setScreen('play')
            sfx.start()
        }
        const onlineStart = () => {
            if (!net.lobby || net.role !== 'host' || !net.room || startBusy()) return
            if (net.room.phase !== 'waiting') net.room.setPhase('waiting')
            net.lobby.start({ seed: humanSeed() })
        }
        if (net.active) {
            net.lobby = createLobby({
                slug: 'talk-me-down',
                cap: 2,
                relay: relayFromQuery(window.location.search),
                makeTransport,
                shareRelay: !!nq.get('relay'),
                onState: (st) => {
                    if (st.role) net.role = st.role
                    // a bare ?net=join with no code gets the shared entry card
                    if (NET_ROLE === 'guest' && !nq.get('room') && st.phase === 'idle' && !st.code) st.phase = 'entry'
                    pushNetUi()
                },
                onStart: (m) => startNetMatch(m),
                onJoin: (e) => {
                    pushNetUi()
                    // a guest page reopened mid-run asks for the LIVE state;
                    // only the host can answer (mid-run) — else we simply wait
                    // for the next go.
                    if (net.role === 'guest' && e && e.slot === 0 && screenRef.current !== 'play' && !net.reseatArm) {
                        net.room.send('res', { e: 'rejoin' })
                    }
                },
                onLeave: () => {
                    pushNetUi()
                    // a pending resync could wait forever — drive on; the
                    // missing seat resolves through the stall law in tickSim
                    net.desyncFrozen = false
                    net.reseatArm = false
                },
                on: {
                    pad: (m) => net.sync.gotPad(m),
                    hs: (m) => { const d = net.sync.gotHash(m.k | 0, m.h >>> 0); if (d) netDesync() },
                    res: (m) => {
                        if (m.e === 'req') { if (net.role === 'host') hostSnap() }
                        else if (m.e === 'rejoin') {
                            // #1838: a returner is back in the room — hand it
                            // its seat mid-run: flip tick stamped, seat pads
                            // stored again, live snapshot on the wire.
                            const g = gsRef.current
                            if (net.role === 'host' && screenRef.current === 'play' && g && !g.done) {
                                const seat = Number.isFinite(m.s) && m.s !== net.sync.mySeat ? (m.s | 0) : 1
                                net.reseatSeat = seat
                                net.reseatWait = 0
                                net.reseatBackTick = g.tick + RESEAT_LEAD
                                net.sync.reseatTick = net.reseatBackTick
                                if (net.sync.droppedSeats().indexOf(seat) >= 0) net.sync.promote(seat)
                                net.room.send('res', { e: 'back', k: net.reseatBackTick })
                                hostSnap()
                                const bf = net.sync.backfillPads(g.tick + 1, net.sync.delay)
                                if (bf) net.room.send('pad', bf)
                            }
                        } else if (m.e === 'back') {
                            if (net.role === 'guest' && screenRef.current !== 'play') {
                                net.reseatArm = true
                                net.reseatBackTick = m.k | 0
                            }
                        } else if (m.e === 'snp') {
                            const got = net.sync.snapInbox.push(m)
                            if (got && net.role === 'guest' && net.desyncFrozen) {
                                // restore at the host's tick; pad streams are
                                // PRESERVED (the sampling law) — no sync.reset
                                gsRef.current = restoreNet(got.snap)
                                net.desyncFrozen = false
                            } else if (got && net.role === 'guest' && net.reseatArm) {
                                // hand-back: rebuild the live run at the host's
                                // tick and climb back into lockstep; the CPU
                                // keeps the seat until the shared flip.
                                const back = net.reseatBackTick != null ? net.reseatBackTick : got.tick + RESEAT_LEAD
                                gsRef.current = restoreNet(got.snap)
                                seedRef.current = (got.snap.seed >>> 0) || 1
                                seatsRef.current = 2
                                net.sync.mySeat = net.room && net.room.yourSlot >= 0 ? net.room.yourSlot : 1
                                net.sync.watchSeats = [0]
                                net.sync.reseatTick = back
                                net.sync.reseatBase(got.tick)
                                net.reseatArm = false
                                net.miss = 0
                                net.hostLost = false
                                net.desyncFrozen = false
                                pageTapsRef.current = 0
                                hudRef.current.banner = { text: 'WELCOME BACK — MANUAL RE-SEATED', ok: true }
                                if (net.room) net.room.setPhase('racing')
                                setScreen('play')
                            }
                        }
                    },
                },
            })
            net.room = net.lobby.room
            if (net.role === 'host') net.lobby.open()
            else if (nq.get('room')) net.lobby.join(nq.get('room'))
            pushNetUi()
        }

        const keys1 = keys1Ref.current
        const keys2 = keys2Ref.current
        const clearKeys = () => { for (const k of Object.keys(keys1)) keys1[k] = false; for (const k of Object.keys(keys2)) keys2[k] = false }

        // #1373: a tap must guarantee ONE engine tick, not synthesise a 6-tick
        // hold. The old MIN_MS=100 latch made every quick tap move cyclic
        // cursors 6 steps — net ZERO at page depth 3 and wire depth 3, so a
        // tap on the manual page flip was silently a no-op. An early release
        // now defers the clear to the next sim sample: the tap lands 1-2
        // engine ticks whatever the frame rate, and held keys still repeat
        // only while physically held.
        const pressMin = (keys, field) => { keys[field] = true; keys[field + '_rel'] = false }
        const releaseMin = (keys, field) => { keys[field + '_rel'] = true }
        const settleReleases = (keys) => {
            for (const k of Object.keys(keys)) {
                if (k.endsWith('_rel') && keys[k]) keys[k.slice(0, -4)] = false
            }
        }

        const S1 = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Space: 'a', KeyB: 'b' }
        const S2 = { KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down', KeyF: 'a' }

        const onKeyDown = (e) => {
            // #1894: while the CALL line is open Escape puts the mouth away
            // first — the squad card only rises when nothing is being typed.
            if (callRef.current.open && e.code === 'Escape') {
                e.preventDefault(); callRef.current.open = false; callRef.current.buf = ''; sfx.move(); return
            }
            if (e.code === 'Escape' || e.code === 'Backquote' || (e.shiftKey && e.code === 'Digit1')) {
                if (screenRef.current === 'play') { e.preventDefault(); setPaused(p => !p) }
                return
            }
            // #1894: while the CALL line is open V is just a letter ("SEVEN",
            // "TURN IT OVER") — the mic switch resumes the moment the line
            // closes. The ear and the mouth never share a keystroke.
            if (e.code === 'KeyV' && !callRef.current.open) { e.preventDefault(); toggleVoice(); return }
            // #1880 host-gone law: the manual seat owns no hands — a guest
            // frozen at a dead defuser walks back to the lobby with any key
            // (no role inversion; a returning host re-arms with a fresh go).
            if (net.active && net.hostLost) {
                net.hostLost = false
                clearKeys()
                startAttract()
                return
            }
            // #1637 WATCH: Y BEFORE the run banks the seat (no blip yet — no
            // wheel has changed hands). Attract steps to select like any key;
            // select starts the run with the current pick and startPlay seats
            // the prover. One tap on ▶ WATCH therefore starts AND watches.
            // Online Y is inert (#1656 law — the wire is not a third wheel).
            if (isWatchKey(e) && !net.active && (screenRef.current === 'attract' || screenRef.current === 'select')) {
                e.preventDefault()
                pendingWatchRef.current = true
                if (screenRef.current === 'attract') { clearKeys(); setScreen('select'); sfx.start() }
                else humanStart(humanSeed(), selectRef.current)
                return
            }
            if (screenRef.current === 'attract') {
                if (net.active) {
                    // the lobby owns the attract: the host arms the first bomb
                    // (Space/Enter), the guest waits for the go — the squad is
                    // fixed at two: one bomb, one manual.
                    if (net.role === 'host' && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); onlineStart() }
                    return
                }
                clearKeys(); setScreen('select'); sfx.start(); return
            }
            if (screenRef.current === 'over') {
                if (performance.now() - overAtRef.current > 700) {
                    if (net.active) { if (net.role === 'host') onlineStart(); else { clearKeys(); startAttract() } }
                    else { clearKeys(); startAttract() }
                }
                return
            }
            if (screenRef.current === 'select') {
                if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') { selectRef.current = selectRef.current === 1 ? 2 : 1; sfx.move() }
                if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); humanStart(humanSeed(), selectRef.current) }
                return
            }
            // play
            if (pausedRef.current) return
            // #1894 CALL-BY-KEY: while the line is open the keyboard is a
            // MOUTH, not a hand — every key is swallowed (arrows and the CPU
            // manual's seat keys produce no pad, and words never release the
            // WATCH seat: orders, not hands, #1247 by analogy with V). The
            // buffer commits through voiceCall, the mic's own entry: one
            // grammar, one pulse law, one bank (#1415). Online the fold laws
            // inside voiceCall run unchanged (guest pages, host refuses).
            const cl = callRef.current
            if (cl.open) {
                e.preventDefault()
                const r = applyCallKey(cl.buf, e.code) // KeyX closes what X opened
                if (!r) { sfx.move(); return } // arrows etc: swallowed at the mouth, never a pad
                if (r.commit) { cl.open = false; const said = cl.buf; cl.buf = ''; voiceCall(said); return }
                if (r.close) { cl.open = false; cl.buf = ''; sfx.move(); return }
                cl.buf = r.buf.slice(0, CALL_LINE_MAX)
                if (r.buf.length <= CALL_LINE_MAX) sfx.tick()
                return
            }
            if (e.code === 'KeyX') { e.preventDefault(); cl.open = true; cl.buf = ''; sfx.key(); return }
            // #1637 WATCH: Y seats the rulebook solver into seat 1 (solvePad
            // drives the real pad path on the sim's own tick); any driving key
            // hands the hands back and the player continues from exactly that
            // module. V lives above this branch — heard words are orders, not
            // hands (#1247) — so the mic never counts as a takeover.
            if (isWatchKey(e)) {
                e.preventDefault()
                if (!net.active) {
                    watchingRef.current = !watchingRef.current; setWatching(watchingRef.current)
                    if (watchingRef.current) playWatchStart(); else playWatchStop()
                }
                return
            }
            if (watchingRef.current && isTakeoverKey(e)) { watchingRef.current = false; setWatching(false); playWatchStop() }
            if (e.code === 'Tab') { e.preventDefault(); if (seatsRef.current === 1) manualHiddenRef.current = !manualHiddenRef.current; return }
            const f1 = S1[e.code]
            if (f1) { e.preventDefault(); pressMin(keys1, f1); return }
            if (net.active) {
                // #1880: one box, one seat, the whole keyboard — online the
                // arrows AND WASD both drive YOUR seat (host = bomb hands,
                // guest = page turns); the other seat lives on the wire.
                const fw = S2[e.code]
                if (fw) { e.preventDefault(); pressMin(keys1, fw) }
                return
            }
            if (seatsRef.current > 1) {
                const f2 = S2[e.code]
                if (f2) { e.preventDefault(); pressMin(keys2, f2) }
            }
        }
        const onKeyUp = (e) => {
            const f1 = S1[e.code]
            if (f1) releaseMin(keys1, f1)
            if (net.active) {
                const fw = S2[e.code]
                if (fw) releaseMin(keys1, fw)
                return
            }
            const f2 = S2[e.code]
            if (f2 && seatsRef.current > 1) releaseMin(keys2, f2)
        }
        const onPointer = () => {
            if (net.active && net.hostLost) { net.hostLost = false; clearKeys(); startAttract(); return }
            if (screenRef.current === 'attract') {
                if (net.active) { if (net.role === 'host') onlineStart(); return }
                clearKeys(); setScreen('select'); sfx.start()
            }
            else if (screenRef.current === 'over' && performance.now() - overAtRef.current > 700) {
                if (net.active) { if (net.role === 'host') onlineStart(); else { clearKeys(); startAttract() } }
                else clearKeys(); startAttract()
            }
            else if (screenRef.current === 'select') humanStart(humanSeed(), selectRef.current)
            else if (screenRef.current === 'play' && watchingRef.current) {
                // #1637 WATCH: a tap on the bench takes the hands back (the
                // WATCH pill stops its own propagation, so this is real input).
                watchingRef.current = false; setWatching(false); playWatchStop()
            }
        }
        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)
        window.addEventListener('pointerdown', onPointer)

        const padFrom = (keys) => ({
            left: !!keys.left, right: !!keys.right, up: !!keys.up, down: !!keys.down,
            a: !!keys.a, b: !!keys.b,
        })

        // #1880: the guest's own pad = local keys + the folded page-taps heard
        // by its mic (words online form, #1247): taps ride the SAME sampled
        // stream the host replays, so both boxes turn the page identical ticks.
        const readOwnPad = () => {
            // #1880 drive autopilot: solve against LIVE state at the sample
            // instant. Paired with delay 0 (set by the hook) the pad for tick
            // k is computed AT k — the same freshness the node harness reads
            // (its readPad(k) fires at tick k). A drive-mode affordance; the
            // human path never touches this flag.
            const ag = gsRef.current
            if (driveAutoRef.current && ag && !ag.done && screenRef.current === 'play') return solvePad(ag)
            const p = padFrom(keys1Ref.current)
            if (pageTapsRef.current > 0) { p.right = true; pageTapsRef.current -= 1 }
            return p
        }


        let raf = 0
        let last = performance.now()
        let acc = 0
        const loop = (now) => {
            raf = requestAnimationFrame(loop)
            acc += Math.min(now - last, FIXED_DT * 5)
            last = now
            const g = canvasRef.current ? canvasRef.current.getContext('2d') : null
            if (!g) return
            while (acc >= FIXED_DT) {
                acc -= FIXED_DT
                tickSim()
            }
            drawScene(g, now)
        }

        const tickSim = () => {
            if (screenRef.current === 'attract' && attractRef.current) {
                const a = attractRef.current
                step(a, solvePad(a))
                for (const f of drainEvents(a)) pumpHud(f)
                if (a.done) attractRef.current = createGame(1000 + Math.floor(Math.random() * 9999), 1)
                // #1797: the demo tilts its bomb over once a loop — the flip
                // teaches itself. The attract sim is shell decor (never hashed
                // nor replayed), so the shell may pose it directly.
                if (attractRef.current) attractRef.current.flip = (a.tick % 420 >= 240 && a.tick % 420 < 330) ? 1 : 0
                return
            }
            if (screenRef.current !== 'play' || pausedRef.current) return
            if (contractHoldsLoop()) return
            if (net.active) {
                // #1880 lockstep: sample own seat PAD_DELAY ahead, tick one
                // only when the peer's stamped mask for k is in (or the seat
                // has demoted), and prove the twin run at every boundary.
                const gs = gsRef.current
                if (!gs) return
                if (net.desyncFrozen || net.hostLost) return
                const k = gs.tick + 1
                net.sync.pumpTo(k + net.sync.delay, readOwnPad)
                if (net.sync.solo() && gs.players > 1) gs.players = 1
                if (!net.sync.ready(k)) {
                    // #1838 hand-back grace, counted in STALL ticks — the sim
                    // freezes while waiting, so a tick-based window could never
                    // expire (the frozen-clock trap).
                    if (net.reseatSeat != null && net.reseatWait < RESEAT_WINDOW) {
                        net.reseatWait++
                        settleReleases(keys1Ref.current)
                        return
                    }
                    if (net.reseatSeat != null) {
                        net.reseatSeat = null
                        net.sync.reseatTick = null
                    }
                    net.miss++
                    if (net.miss >= DROP_GRACE) {
                        net.miss = 0
                        if (net.role === 'host') {
                            // guest walkaway: the CPU manual partner takes the
                            // rail back — the bomb stays defusable solo.
                            const seat = net.sync.watchSeats[0]
                            if (seat !== undefined && net.sync.demote(seat)) {
                                gs.players = 1
                                hudRef.current.banner = { text: 'MANUAL LINK LOST — CPU MANUAL IN', ok: false }
                                sfx.strike()
                            }
                        } else {
                            // host-gone law: the page holder owns no hands.
                            net.hostLost = true
                        }
                    }
                    settleReleases(keys1Ref.current)
                    return
                }
                net.miss = 0
                if (net.sync.reseatTick != null && k >= net.sync.reseatTick) {
                    // the shared flip (#1838): both boxes hand seat 1 from the
                    // CPU back to the human on the SAME sim tick.
                    net.sync.reseatTick = null
                    net.reseatSeat = null
                    if (gs.players === 1) gs.players = 2
                    hudRef.current.banner = { text: 'MANUAL RE-SEATED — SQUAD WHOLE', ok: true }
                    sfx.key()
                }
                const pads = net.sync.assemble(k)
                spec.tick(pads[0], pads)
                if (isRecording() && !contractHoldsLoop()) recordLiveTick(pads)
                if (isRecording() && screenRef.current === 'over') endRun()
                if (!gs.done && !net.sync.solo() && gs.tick % HASH_EVERY === 0) {
                    const d = net.sync.hash(gs.tick, hash(gs))
                    if (d) netDesync()
                }
                net.sync.prune(gs.tick)
                // #1637: watch is inert online, but a stale flag must never
                // linger across a match boundary.
                if (watchingRef.current && screenRef.current === 'over') { watchingRef.current = false; setWatching(false) }
                settleReleases(keys1Ref.current)
                if (screenRef.current === 'play' && !gs.done && !net.sync.solo()) {
                    if (++hudRef.current.humT % 30 === 0) sfx.hum()
                    if (Math.ceil(gs.fuse / 60) <= 10 && ++hudRef.current.beatT % 60 === 0) sfx.heart()
                }
                return
            }
            let p1 = padFrom(keys1Ref.current)
            const g = gsRef.current
            // #1637 WATCH: the prover is at the controls — solvePad reacts
            // against LIVE state every tick (honest from any module, strike or
            // fuse position) and lands on the real pad path, the same route the
            // keyboard and the phone pad drive. Same brain the attract demo
            // runs and tmd-smoke wins 200/200 seeds with — no forked solver.
            if (watchingRef.current && g && !g.done) p1 = solvePad(g)
            const pads = seatsRef.current > 1 ? [p1, padFrom(keys2Ref.current)] : [p1]
            spec.tick(p1, pads)
            // #1415: this loop bypasses the contract's step(), so a live
            // capture (DebugKit RECORD, #527 item 1) must be fed here — the
            // Gauntlet funnel (#1249). While the loop-lock is held, step()
            // banks the ticks itself; never both.
            if (isRecording() && !contractHoldsLoop()) recordLiveTick(pads)
            // #1711: the run just ended — bank this last tick, THEN close the
            // take (spec.tick flips play->over above; closing earlier would cut
            // the final pad off the file and break replay-verification).
            if (isRecording() && screenRef.current === 'over') endRun()
            // #1637 WATCH: the run's end IS the end of the route — the seat
            // releases silently, like the racer's finish flag; the stamp or
            // the boom speaks for itself.
            if (watchingRef.current && screenRef.current === 'over') { watchingRef.current = false; setWatching(false) }
            // the tick above consumed the pads — releases waiting for their
            // guaranteed sample can settle now (#1373)
            settleReleases(keys1Ref.current)
            settleReleases(keys2Ref.current)
        }

        const drawScene = (g, now) => {
            g.save()
            const tick = (gsRef.current ? gsRef.current.tick : 0) + (attractRef.current ? attractRef.current.tick : 0)
            ART.drawBench(g)
            const hud = hudRef.current
            if (hud.shake > 0) g.translate((Math.random() - 0.5) * hud.shake, (Math.random() - 0.5) * hud.shake)

            if (screenRef.current === 'play' || screenRef.current === 'over') {
                const gs = gsRef.current
                if (gs) {
                    // #1880: separate screens make the split real. The guest
                    // box hides the bomb panel behind a squad plate; the host
                    // box hides the rulebook. The mouth stays the only sensor
                    // the squad shares — and the live-stamp rail (the
                    // transcribed "NEON N3!" list) rides with the page-holder.
                    const guest = net.active && net.role === 'guest'
                    // #1888: on a phone the guest IS the reader — the page
                    // takes the 400px bomb bay at +2px type; the defuser's
                    // plate shrinks to the right rail.
                    const guestPhone = guest && !URL_NO_TOUCH && (TOUCH_UI || URL_TOUCH)
                    if (guest) {
                        drawSquadPlate(g, guestPhone ? ART.RAIL : ART.PANEL, 'SEAT 1 · DEFUSER AT THEIRS',
                            'THE BOMB IS', 'IN THEIR HANDS', 'LISTEN. THEN SPEAK.', tick)
                    } else {
                        drawBombView(g, gs, tick)
                    }
                    if (net.active && net.role === 'host') {
                        drawSquadPlate(g, ART.RAIL, 'SEAT 2 · MANUAL AT THEIRS',
                            'THE RULEBOOK', 'IS ON THEIR SCREEN', 'READ THE STAMPS ALOUD', tick)
                    } else {
                        ART.drawManual(g, gs.manual.page, gs.manual.line, gs.modules.filter(m => !m.solved).map(m => m.stamp), tick, manualHiddenRef.current && seatsRef.current === 1, gs.manual.flag, gs.flip, guestPhone ? ART.MANUAL_WIDE : ART.RAIL)
                    }
                    // #1305: new order arriving? stutter the LCD glass for 6 frames.
                    if (gs.order && gs.order !== hud.lastOrder) hud.lcdFx = 6
                    hud.lastOrder = gs.order
                    ART.drawOrderRail(g, gs.order, gs.manual.flag, hud.lcdFx, voiceRef.current.on, !URL_NO_TOUCH && (TOUCH_UI || URL_TOUCH))
                    if (callRef.current.open) ART.drawCallLine(g, callRef.current.buf, tick) // #1894
                    drawSparks(g, hud)
                    drawZap(g, hud)
                    if (hud.banner) ART.drawBanner(g, hud.banner.text, hud.banner.ok, tick)
                    if (screenRef.current === 'play' && !gs.done && !pausedRef.current) {
                        // #1305: hum bed + a heartbeat below 10 s (shell clock only)
                        if (++hud.humT % 30 === 0) sfx.hum()
                        if (Math.ceil(gs.fuse / 60) <= 10 && ++hud.beatT % 60 === 0) sfx.heart()
                    }
                }
                if (hud.shake > 0) hud.shake -= 0.5
                if (hud.lcdFx > 0) hud.lcdFx -= 1
                if (hud.zap && --hud.zap.t <= 0) hud.zap = null
                if (hud.flash > 0) hud.flash -= 1
                hud.sparks = hud.sparks.filter(s => --s.life > 0)
                if (hud.pulse && --hud.pulse.t <= 0) hud.pulse = null
            } else if (screenRef.current === 'attract') {
                const a = attractRef.current
                if (a) drawBombView(g, a, tick)
                g.fillStyle = 'rgba(10,8,14,0.62)'; g.fillRect(0, 0, ART.W, ART.H)
                // #1373: the GLYPH keys in the demo panel fight the title —
                // silhouette the marquee band so the name always reads clean.
                g.fillStyle = 'rgba(6,4,10,0.72)'
                g.fillRect(124, 104, 372, 64)
                g.fillStyle = '#3a1f2a'
                g.fillRect(124, 104, 372, 1); g.fillRect(124, 167, 372, 1)
                g.font = '24px "Press Start 2P", monospace'; g.fillStyle = '#ffd23e'
                g.fillText('TALK ME DOWN', 150, 130)
                g.font = '8px "Press Start 2P", monospace'; g.fillStyle = '#ff6a5e'
                g.fillText('ONE SEES THE BOMB  ·  ONE HOLDS THE MANUAL', 132, 156)
                if (now - msgAtRef.current > 2600) { msgAtRef.current = now; msgIdxRef.current = (msgIdxRef.current + 1) % ATTRACT_MSGS.length }
                g.font = '9px "Press Start 2P", monospace'; g.fillStyle = '#7dffb0'
                g.fillText(ATTRACT_MSGS[msgIdxRef.current], (ART.W - ATTRACT_MSGS[msgIdxRef.current].length * 9) / 2, 210)
                if (!net.active && tick % 60 < 36) {
                    g.fillStyle = '#fff'
                    g.fillText('ANY KEY / TAP', 250, 260)
                }
            } else if (screenRef.current === 'select') {
                g.fillStyle = 'rgba(10,8,14,0.62)'; g.fillRect(0, 0, ART.W, ART.H)
                g.font = '14px "Press Start 2P", monospace'; g.fillStyle = '#ffd23e'
                g.fillText('SQUAD SIZE', 232, 110)
                g.font = '10px "Press Start 2P", monospace'
                g.fillStyle = selectRef.current === 1 ? '#7dffb0' : '#6b6f77'
                g.fillText('1P  YOU DEFUSE + CPU MANUAL', 130, 170)
                g.fillStyle = selectRef.current === 2 ? '#7dffb0' : '#6b6f77'
                g.fillText('2P  YOU + MANUAL PLAYER (WASD+F)', 130, 200)
                g.font = '8px "Press Start 2P", monospace'; g.fillStyle = '#9aa0aa'
                g.fillText('LEFT / RIGHT PICK   SPACE START', 180, 260)
                g.fillText('V = MIC (SOLO OR 2P)', 240, 284)
                // #1373: spell the seat-2 keyboard out on screen — nobody
                // should have to read a README to know their other half's keys.
                g.fillStyle = '#7dffb0'
                g.fillText('P2 KEYS: WASD MOVE · F FLAG', 176, 308)
                g.fillStyle = '#9aa0aa'
                g.fillText('^ TILTS THE BOMB OVER - COUNT ITS BATTERIES', 132, 332)
            }
            if (screenRef.current === 'over' && gsRef.current && gsRef.current.done) {
                const t = Math.floor((now - overAtRef.current) / 16)
                if (gsRef.current.won) ART.drawWinStamp(g, t)
                else ART.drawBoom(g, t)
                g.font = '9px "Press Start 2P", monospace'
                g.fillStyle = gsRef.current.won ? '#ffd23e' : '#ff9d94'
                const head = gsRef.current.won ? 'ALL BOMBS DOWN' : 'BOOM! THE BLOCK GLOWS'
                g.fillText(head, gsRef.current.won ? 190 : 156, 250)
                g.fillStyle = '#fff'
                g.fillText(`SCORE ${gsRef.current.score}   BOMBS ${gsRef.current.bombsCleared}/${QUOTA_BOMBS}`, 170, 274)
                if (t > 40 && tick % 60 < 36) { g.fillStyle = '#fff'; g.fillText('ANY KEY', 280, 300) }
            }
            // #1880 host-gone law, made visible: the manual holds still.
            if (net.active && net.hostLost && screenRef.current === 'play') {
                g.fillStyle = 'rgba(8,6,10,0.78)'
                g.fillRect(80, 148, ART.W - 160, 64)
                g.strokeStyle = '#5e2a2a'; g.strokeRect(80.5, 148.5, ART.W - 161, 63)
                g.font = '10px "Press Start 2P", monospace'; g.fillStyle = '#ff9d94'
                const t1 = 'DEFUSER OFFLINE'
                g.fillText(t1, (ART.W - t1.length * 10) / 2, 176)
                g.font = '7px "Press Start 2P", monospace'; g.fillStyle = '#9aa0aa'
                const t2 = 'THE PAGE HOLDS STILL — ANY KEY TO THE LOBBY'
                g.fillText(t2, (ART.W - t2.length * 7) / 2, 198)
            }
            // HUD legend line
            g.restore()
            const gs = gsRef.current
            // #1373: the last 10 s sink into a red vignette — pressure you feel
            // before you read it. Screen-space (outside the shake), pulsing
            // with the sim tick; purely cosmetic, the sim never sees it.
            if (screenRef.current === 'play' && gs && !gs.done && Math.ceil(gs.fuse / 60) <= 10) {
                const k = 0.20 + 0.06 * Math.sin(tick / 6) // steady pressure, gentle throb
                const vg = g.createRadialGradient(ART.W / 2, ART.H / 2, 110, ART.W / 2, ART.H / 2, 360)
                vg.addColorStop(0, 'rgba(24,2,2,0)')
                vg.addColorStop(1, `rgba(24,2,2,${k.toFixed(3)})`)
                g.fillStyle = vg
                g.fillRect(0, 0, ART.W, ART.H)
            }
            // #1373: the round-transition curtain over the bomb panel.
            if (hudRef.current.curtain) {
                if (screenRef.current !== 'play' || !gs || gs.done) hudRef.current.curtain = null
                else {
                    const c = hudRef.current.curtain
                    const a = 0.74 * Math.min(1, c.t / 16)
                    g.fillStyle = `rgba(10,8,14,${a.toFixed(3)})`
                    g.fillRect(ART.PANEL.x + 2, ART.PANEL.y + 2, ART.PANEL.w - 4, ART.PANEL.h - 4)
                    const txt = `BOMB ${c.n} INBOUND`
                    g.font = '10px "Press Start 2P", monospace'
                    g.fillStyle = c.t % 14 < 9 ? '#ffffff' : '#ffd23e'
                    g.fillText(txt, ART.PANEL.x + (ART.PANEL.w - txt.length * 10) / 2, ART.PANEL.y + ART.PANEL.h / 2 - 4)
                    g.font = '7px "Press Start 2P", monospace'; g.fillStyle = '#7dffb0'
                    const sub = 'STAND BY'
                    g.fillText(sub, ART.PANEL.x + (ART.PANEL.w - sub.length * 7) / 2, ART.PANEL.y + ART.PANEL.h / 2 + 16)
                    if (--c.t <= 0) hudRef.current.curtain = null
                }
            }
            g.font = '7px "Press Start 2P", monospace'; g.fillStyle = '#8a8f98'
            if (screenRef.current === 'play' && gs) {
                g.fillText(`R${gs.round}  BOMBS ${gs.bombsCleared}/${QUOTA_BOMBS}  STRIKES ${gs.strikes}/${MAX_STRIKES}`, 10, ART.H - 4)
                const scoreStr = `SCORE ${gs.score}`
                g.fillText(scoreStr, ART.W - 10 - scoreStr.length * 7, ART.H - 4)
            }
            drawEdgeFlash(g, hudRef.current)
        }

        const drawBombView = (g, gs, tick) => {
            const secs = Math.ceil(gs.fuse / 60)
            const hud = hudRef.current
            if (gs.flip) {
                // #1797: the maintenance side. Batteries are the news — but
                // the fuse and the breakers stay readable (pressure never
                // hides, KTANE signature 5).
                // #1923 THE SLIDE: fx steps from the render diff (held/tray/sel)
                // — view-only, the sim and hash never hear it.
                const fx = ART.stepRailFx(railFxRef.current, gs.held, gs.tray, gs.sel,
                    `${gs.round}/${gs.bombsCleared}/${gs.features.serial}`)
                // #1915: the lead decays on the render clock — pure look, the
                // sim keeps its own time.
                const lead = flipLeadRef.current > 0
                if (lead) flipLeadRef.current -= 1
                ART.drawBack(g, gs.features.batteries, tick, gs.features.serial, gs.held, gs.tray, gs.sel, fx,
                    !!(hud.pulse && hud.pulse.kind === 'pull'), lead)
                ART.drawStrikes(g, gs.strikes)
                ART.drawFuse(g, ART.PANEL.x + 16, ART.PANEL.y + 12, secs, secs <= 10 && !gs.done, tick)
                return
            }
            ART.drawPanelShell(g)
            ART.drawLeds(g, gs.features.leds)
            ART.drawBoltColor(g, gs.features.bolt)
            ART.drawStrikes(g, gs.strikes)
            ART.drawFuse(g, ART.PANEL.x + 16, ART.PANEL.y + 12, secs, secs <= 10 && !gs.done, tick)
            // #1802: the serial is no longer printed here — it lives on the
            // BACK ID plate; the front shell says "SERIAL: SEE BACK".
            ART.drawFlipHint(g, !!(hud.pulse && (hud.pulse.kind === 'flip' || hud.pulse.kind === 'pull')), tick)
            gs.modules.forEach((m, i) => {
                const r = ART.moduleRect(i, gs.modules.length)
                const sel = i === gs.cursor.mod && !gs.done
                ART.moduleFrame(g, r, m, sel, gs.cursorFlash, tick)
                if (gs.manual.flag === m.stamp && !m.solved) ART.drawFlag(g, r, m.stamp, tick)
                const pulse = hud.pulse && hud.pulse.mod === gs.cursor.mod && i === gs.cursor.mod ? hud.pulse : null
                if (m.type === 'N') ART.drawNeon(g, r, m, gs.cursor.sub, pulse && pulse.kind === 'wire' ? pulse.idx : -1, tick)
                else if (m.type === 'D') ART.drawDialModule(g, r, m, pulse && (pulse.kind === 'set' || (pulse.kind === 'dialval' && m.dial === pulse.val)), tick)
                else ART.drawGlyphModule(g, r, m, gs.cursor.sub, pulse && pulse.kind === 'glyph' ? pulse.idx : -1, gs.seqInput[i] || [], tick)
                if (m.type === 'G') ART.drawSeqDots(g, r, (gs.seqInput[i] || []).length)
                if (pulse && pulse.kind === 'dialval') {
                    g.font = '8px "Press Start 2P", monospace'; g.fillStyle = '#7dffb0'
                    g.fillText(`${pulse.val}?`, r.x + r.w - 110, r.y + 12)
                }
            })
            if (gs.clearFlash > 0 && tick % 10 < 5) {
                g.font = '10px "Press Start 2P", monospace'; g.fillStyle = '#7dffb0'
                g.fillText('BOMB DOWN!', ART.PANEL.x + 130, ART.PANEL.y + 180)
            }
        }

        // #1880: the "your half lives on their box" plate — dark steel, a
        // seat tag, and the one instruction that keeps the squad talking.
        const drawSquadPlate = (g, r, tag, l1, l2, hint, tick) => {
            g.fillStyle = '#17191d'
            g.fillRect(r.x + 6, r.y + 6, r.w - 12, r.h - 12)
            g.strokeStyle = '#2e333a'
            g.strokeRect(r.x + 10.5, r.y + 10.5, r.w - 21, r.h - 21)
            // rivets, same family as the bomb shell
            g.fillStyle = '#3a4048'
            for (const [rx, ry] of [[20, 20], [r.w - 24, 20], [20, r.h - 24], [r.w - 24, r.h - 24]]) {
                g.fillRect(r.x + rx, r.y + ry, 4, 4)
            }
            g.font = '7px "Press Start 2P", monospace'; g.fillStyle = '#5f656e'
            g.fillText(tag, r.x + 20, r.y + 40)
            g.font = '12px "Press Start 2P", monospace'; g.fillStyle = '#d8dde3'
            g.fillText(l1, r.x + (r.w - l1.length * 12) / 2, r.y + r.h / 2 - 12)
            g.fillText(l2, r.x + (r.w - l2.length * 12) / 2, r.y + r.h / 2 + 10)
            // a pulsing link dot — the wire is alive even when nobody talks
            g.fillStyle = tick % 60 < 34 ? '#7dffb0' : '#31465a'
            g.fillRect(r.x + r.w / 2 - 3, r.y + r.h / 2 + 26, 6, 6)
            if (hint) {
                g.font = '7px "Press Start 2P", monospace'; g.fillStyle = '#8b919a'
                g.fillText(hint, r.x + (r.w - hint.length * 7) / 2, r.y + r.h / 2 + 48)
            }
        }

        const drawSparks = (g, hud) => {
            for (const s of hud.sparks) {
                s.x += s.vx; s.y += s.vy; s.vy += 0.35
                g.fillStyle = s.life > 10 ? '#ffe66b' : '#ff7a4d'
                g.fillRect(s.x, s.y, 2, 2)
            }
        }

        // #1305: the strike arc — a jagged bolt jumping the struck module's
        // terminal strips. Geometry-free jitter is fine here: it is the shell
        // (Math.random lives outside the sim, #494), never state.
        const drawZap = (g, hud) => {
            const z = hud.zap
            if (!z) return
            const a = z.t / 14
            for (const [w, col] of [[5, `rgba(255,120,60,${(0.5 * a).toFixed(2)})`], [2, '#fff2b0'], [1, '#fff']]) {
                g.strokeStyle = col; g.lineWidth = w
                g.beginPath(); g.moveTo(z.x, z.top + 2)
                let y = z.top + 2
                while (y < z.bot - 4) {
                    y += 10 + Math.random() * 8
                    g.lineTo(z.x + (Math.random() - 0.5) * 14, Math.min(y, z.bot - 2))
                }
                g.stroke()
            }
            g.lineWidth = 1
        }

        // #1305: red screen-edge flinch. Drawn OUTSIDE the shake translate so
        // the geometry is stable and a harness can pin it by pixels.
        const drawEdgeFlash = (g, hud) => {
            if (hud.flash <= 0) return
            const a = (0.12 + 0.5 * (hud.flash / 30)).toFixed(3)
            g.fillStyle = `rgba(255,40,30,${a})`
            g.fillRect(0, 0, ART.W, 14); g.fillRect(0, ART.H - 14, ART.W, 14)
            g.fillRect(0, 0, 14, ART.H); g.fillRect(ART.W - 14, 0, 14, ART.H)
        }

        raf = requestAnimationFrame(loop)

        // #1473: production-safe feedback state (seed for replay), every build
        exposeFeedbackState(() => ({
            tick: gsRef.current ? gsRef.current.tick : 0,
            score: gsRef.current ? gsRef.current.score : 0,
            done: gsRef.current ? !!gsRef.current.done : false,
            seed: gsRef.current ? gsRef.current.seed : 0,
            round: gsRef.current ? gsRef.current.round : 1,
            strikes: gsRef.current ? gsRef.current.strikes : 0,
        }))

        // DEV hooks + DebugKit
        let dbgMounted = false
        if (import.meta.env.DEV) {
            window.__tmdTest = {
                start: (seed, players) => startPlay(seed >>> 0 || 1, players || 1),
                screen: () => screenRef.current,
                call: (text) => voiceCall(text),
                // #1894: the harness reads/pilots the typed line the same way
                // it reads the mic badge — and asserts delivery with real keys.
                callLine: () => ({ open: callRef.current.open, buf: callRef.current.buf, paused: pausedRef.current }),
                release: (field) => { keys1Ref.current[field] = false },
                keys: () => ({ ...keys1Ref.current }),
                state: () => { const g = gsRef.current; return g ? simState(g) : null },
                hash: () => { const g = gsRef.current; return g ? hash(g) : 0 },
                voiceLog: () => voiceLogRef.current.slice(),
                voiceMode: () => ({ on: voiceRef.current.on, supported: speechSupported(), listening: !!(voiceRef.current.listen && voiceRef.current.listen.active) }),
                hud: () => ({ curtain: hudRef.current.curtain ? hudRef.current.curtain.n : 0, banner: hudRef.current.banner ? { text: hudRef.current.banner.text, ok: hudRef.current.banner.ok } : null }), // #1373, banner for #1894
                solveStep: () => { const g = gsRef.current; if (g && !g.done) spec.tick(solvePad(g)) },
                // #1880 drive: hands the OWN seat to the solver at the sample
                // instant (readOwnPad), with delay 0 so the pad for tick k is
                // computed AT k. tickSim remains the only sim driver; the wire,
                // the ready gate and the hash law all keep running for real.
                autopilot: (on) => {
                    driveAutoRef.current = !!on && screenRef.current === 'play' && !!gsRef.current && !gsRef.current.done
                    if (driveAutoRef.current && net.sync) net.sync.delay = 0
                    return driveAutoRef.current
                },
                // #1637 WATCH: the harness pilots the seat through real keys.
                watching: () => watchingRef.current && screenRef.current === 'play',
                watchSfx: () => watchSfxLog(),
                // #1880: the browser harness reads the link's whole state.
                netState: () => (net.active ? {
                    role: net.role,
                    code: net.room ? net.room.code : '',
                    phase: net.room ? net.room.phase : 'idle',
                    miss: net.miss, desyncs: net.desyncs, frozen: net.desyncFrozen,
                    hostLost: net.hostLost,
                    solo: net.sync ? net.sync.solo() : false,
                    slots: net.room && net.room.slots ? net.room.slots.slice() : [],
                    watch: net.sync ? net.sync.watchSeats.slice() : [],
                    dropped: net.sync && typeof net.sync.droppedSeats === 'function' ? net.sync.droppedSeats() : [],
                    players: gsRef.current ? gsRef.current.players : 0,
                    nextSample: net.sync ? net.sync.stats().nextSample : 0,
                } : null),
                pageTaps: () => pageTapsRef.current,
                probe: () => {
                    const g = gsRef.current
                    return g
                        ? { screen: screenRef.current, tick: g.tick, score: g.score, bombs: g.bombsCleared, strikes: g.strikes, done: !!g.done, won: !!g.won, round: g.round, solved: g.modules.filter(m => m.solved).length }
                        : { screen: screenRef.current, tick: 0, score: 0, bombs: 0, strikes: 0, done: false, won: false, round: 1, solved: 0 }
                },
                rulesFor: () => Object.keys(RULEBOOK).map(k => RULEBOOK[k].map(r => ({ id: r.id, text: r.text }))),
            }
            mountDbg({
                title: 'TALK ME DOWN',
                getState: () => { const g = gsRef.current; return g ? simState(g) : {} },
                actions: [
                    {
                        label: 'PROGNOSIS: can this bomb still be cleared?',
                        run: () => {
                            const g = gsRef.current
                            if (!g) return { error: 'no live bomb' }
                            const open = g.modules.map(m => ({ stamp: m.stamp, solved: m.solved, locked: m.locked > 0, solvable: computeTarget(g, m) !== null }))
                            return { round: g.round, fuseLeft: g.fuse, strikes: g.strikes, modules: open, allClearable: open.every(x => x.solved || x.solvable) }
                        },
                    },
                    { label: 'win now', run: () => { const g = gsRef.current; if (g) { g.fuse = Math.max(g.fuse, 600); let n = 0; while (!g.done && n++ < 60000) step(g, solvePad(g)) } } },
                    {
                        label: 'strike now',
                        run: () => {
                            const g = gsRef.current
                            if (!g || g.done) return { error: 'no live bomb' }
                            const m = g.modules[g.cursor.mod]
                            if (!m || m.solved) return { error: 'cursor module is safe' }
                            const t = computeTarget(g, m)
                            if (m.type === 'N') g.cursor.sub = t ? (t.wire + 1) % m.wires.length : 0
                            else if (m.type === 'D') m.dial = t ? (t.dial + 3) % 10 : 7
                            else g.cursor.sub = t ? (t.seq[0] + 2) % 6 : 0
                            step(g, { a: true })
                            return { strikes: g.strikes }
                        },
                    },
                ],
            })
            dbgMounted = true
        }

        const v = voiceRef.current
        return () => {
            unexposeFeedbackState()
            cancelAnimationFrame(raf)
            if (net.lobby) { try { net.lobby.close() } catch { /* gone */ } } // #1880: the room dies with the page
            window.removeEventListener('keydown', onKeyDown)
            window.removeEventListener('keyup', onKeyUp)
            window.removeEventListener('pointerdown', onPointer)
            if (v.listen) { v.listen.stop(); v.listen = null }
            endRun() // #1711: an unmount mid-run ends the take (no-op when idle)
            unexposeGame() // #1711: safe every build — clears the armed capture outside DEV too
            if (import.meta.env.DEV) {
                if (dbgMounted) unmountDbg()
                delete window.__tmdTest
            }
        }
    // effect wires once; makeSpec is a render-stable factory
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [startPlay, startAttract, toggleVoice, voiceCall])

    return (
        <div className="min-h-[var(--shell-h)] bg-black flex items-center justify-center relative select-none">
            <canvas
                ref={canvasRef}
                className="max-w-full max-h-[var(--shell-h)]"
                style={{ imageRendering: 'pixelated', aspectRatio: `${ART.W} / ${ART.H}`, width: 'min(100vw, calc(var(--shell-h) * 16 / 9))' }}
            />
            {paused && <PauseOverlay game={GAMES.find(g => g.label === 'TALK ME DOWN')} onResume={() => setPaused(false)} />}
            {/* #1880 — ONE join flow, the shared waiting room: the host opens
                a 4-letter code (QR included), the friend takes the manual. */}
            {netUi && screen === 'attract' && (
                <Lobby
                    state={netUi}
                    title="SQUAD LINK"
                    accent={{ text: 'text-amber-300', dim: 'text-amber-100/70', live: 'border-amber-300/50 text-amber-100' }}
                    startHint="SPACE — ARM THE FIRST BOMB"
                    onEntry={(code) => netRef.current.lobby && netRef.current.lobby.join(code)}
                />
            )}
            {/* #1637 WATCH — the proven rulebook defuses the bomb. */}
            {screen === 'play' && watching && <WatchToast className="absolute z-50" />}
            {/* #1654 — the discoverable WATCH line, before the first Y press,
                and the one-tap ▶ WATCH in the clear band (#1656). Multi-screen
                boot (#1656's own note): Space lands in a run from SELECT, so Y
                banks a pending seat at attract/select and startPlay seats it —
                one tap still starts the run AND watches the proven route. */}
            {screen === 'attract' && !netUi && (
                <div className="absolute inset-x-0 z-[70] flex justify-center pointer-events-none" style={{ bottom: '24%' }}>
                    <AttractWatchButton />
                </div>
            )}
            {screen === 'attract' && !netUi && (
                <div className="absolute inset-x-0 z-[70] flex justify-center pointer-events-none" style={{ bottom: '19%' }}>
                    <div className="font-mono text-xs tracking-widest text-emerald-200/70">{WATCH_ATTRACT_HINT}</div>
                </div>
            )}
            {screen === 'play' && !paused && !netUi && (
                <div className="absolute pointer-events-auto z-50" style={{ bottom: 'calc(12.5rem + var(--sab, 0px))', left: 'calc(0.75rem + var(--sal, 0px))' }}>
                    <WatchButton on={watching} />
                </div>
            )}
            {/* #1373: tap-to-talk for seat 1 (#1287 pattern) — phones have no
                V key, and the mic IS this game's co-op mechanic. Bottom-centre
                keeps it clear of the d-pad (left) and A/PAGE (right). */}
            {(TOUCH_UI || URL_TOUCH || micOn) && (screen === 'play' || screen === 'select') && !paused && (
                <button
                    type="button"
                    data-voice-coop={micOn ? 'on' : 'off'}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleVoice() }}
                    className="fixed z-[62] bottom-3 left-1/2 -translate-x-1/2 font-mono text-[10px] tracking-[0.25em] px-2 py-1 border rounded"
                    style={micOn
                        ? { color: '#7dffb0', borderColor: 'rgba(125,255,176,0.55)', background: 'rgba(0,0,0,0.35)', cursor: 'pointer' }
                        : { color: '#8b8b98', borderColor: 'rgba(255,255,255,0.3)', background: 'rgba(0,0,0,0.35)', cursor: 'pointer' }}
                >
                    {micOn ? 'MIC ON — SHOUT' : 'MIC · TAP'}
                </button>
            )}
            <VirtualControls secondAction={{ label: 'PAGE', code: 'KeyB' }} visible={screen === 'play'} />
        </div>
    )
}
