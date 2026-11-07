// BOMB DEFUSE — the simultaneous two-hand co-op defusal pair (#1800).
//
// The recorder's fifth title under PLAICRAFT S1 (#1711): every step needs
// BOTH seats inside one sync window — key turns, matched blades, and the
// vent load-share. Solo = your CPU partner covers seat 2 (honest pads inside
// the seeded sim); 2P is a desktop keyboard option (Jon's rule: no second
// touchpad). Rules engine: ./engine.js (pure). Look: a 1990s military field
// disposal unit — gunmetal, rivets, seven-segment fuse, glowing harness,
// analog gauge. All synthesized, RETRO bar (docs/ART.md).
import { useCallback, useEffect, useRef, useState } from 'react'
import PauseOverlay from '../../components/PauseOverlay.jsx'
import VirtualControls from '../../components/VirtualControls.jsx'
import Lobby from '../../components/Lobby.jsx'
import { GAMES } from '../../config/games.js'
import {
    exposeGame, unexposeGame, armLiveCapture, contractHoldsLoop, recordLiveTick,
    recordVoiceCmd, isRecording, seedFromQuery, exposeFeedbackState, unexposeFeedbackState,
} from '../../utils/gameContract.js'
import { initAutoRecord, askConsent, beginRun, endRun, startBusy, setStartBusy } from '../../utils/autoRecord.js'
import { startSpeechListen } from '../../utils/speechListen.js'
import { mountDbg, unmountDbg } from '../../utils/DebugKit.js'
import { makeTransport } from '../../utils/linkPeers.js'
import { createLobby, lobbyRole, relayFromQuery } from '../../utils/lobby.js'
import { createDefuseSync, snapshotNet, restoreNet, packSnap, DROP_GRACE, HASH_EVERY } from './net.js'
import * as E from './engine.js'
import { sfx } from './audio.js'
import { parseCall } from './voice.js'

const FIXED_DT = 1000 / 60
const W = 640
const H = 360

// ---- palette (the unit: gunmetal + olive PCB + hazard) ----------------------
const C = {
    plate: '#31362c', plateHi: '#3c4234', plateLo: '#22261d', edge: '#14170f',
    steel: '#4a5044', steelHi: '#5d6552', steelLo: '#33382c',
    screen: '#0d120c', green: '#7dff9a', greenDim: '#2c5e39', amber: '#ffc23e',
    red: '#ff4a3e', redDim: '#5e1d18', brass: '#d8b23e', chrome: '#c9d2cf',
    wire: ['#e04338', '#3f7de0', '#49c25f', '#e8cf3e'],
    ink: '#0c0f08', label: '#9aa68b',
}
const WIRE_GLOW = ['rgba(224,67,56,0.5)', 'rgba(63,125,224,0.5)', 'rgba(73,194,95,0.5)', 'rgba(232,207,62,0.5)']

const ATTRACT_MSGS = [
    'EVERY STEP NEEDS BOTH PLAYERS',
    'TURN TWO KEYS  ·  SNIP MATCHED BLADES',
    'ONE HOLDS THE BAR  ·  ONE SEATS THE NEEDLE',
    'STRIKES EAT TIME — THE CLOCK IS THE DANGER',
    'SOLO: A CPU PARTNER COVERS SEAT 2',
]

const humanSeed = () => {
    const pin = seedFromQuery()
    return pin != null ? (pin >>> 0 || 1) : 1 + Math.floor(Math.random() * 65535)
}

// seven-segment digit map (a, b, c, d, e, f, g)
const SEG = [[1, 1, 1, 1, 1, 1, 0], [0, 1, 1, 0, 0, 0, 0], [1, 1, 0, 1, 1, 0, 1], [1, 1, 1, 1, 0, 0, 1],
    [0, 1, 1, 0, 0, 1, 1], [1, 0, 1, 1, 0, 1, 1], [1, 0, 1, 1, 1, 1, 1], [1, 1, 1, 0, 0, 0, 0],
    [1, 1, 1, 1, 1, 1, 1], [1, 1, 1, 1, 0, 1, 1]]

function drawSeg(g, x, y, d, w, h, col, glow) {
    const s = SEG[d] ?? [0, 0, 0, 0, 0, 0, 0]
    const t = Math.max(2, Math.round(h * 0.14))
    const on = (i) => {
        g.fillStyle = col
        if (glow) { g.shadowColor = col; g.shadowBlur = 7 }
        return i
    }
    const bar = (bx, by, bw, bh) => g.fillRect(bx, by, bw, bh)
    if (on(s[0])) bar(x + t, y, w - 2 * t, t)
    if (on(s[1])) bar(x + w - t, y + t, t, (h - 3 * t) / 2)
    if (on(s[2])) bar(x + w - t, y + (h + t) / 2, t, (h - 3 * t) / 2)
    if (on(s[3])) bar(x + t, y + h - t, w - 2 * t, t)
    if (on(s[4])) bar(x, y + (h + t) / 2, t, (h - 3 * t) / 2)
    if (on(s[5])) bar(x, y + t, t, (h - 3 * t) / 2)
    if (on(s[6])) bar(x + t, y + (h - t) / 2, w - 2 * t, t)
    g.shadowBlur = 0
}

function drawSegText(g, x, y, text, dh, col, glow) {
    const w = Math.round(dh * 0.52)
    let cx = x
    for (const ch of String(text)) {
        if (ch === ':') {
            g.fillStyle = col
            g.fillRect(cx + 1, y + dh * 0.3, 3, 3)
            g.fillRect(cx + 1, y + dh * 0.62, 3, 3)
            cx += w
        } else if (ch === ' ') cx += w
        else { drawSeg(g, cx, y, Number(ch), w, dh, col, glow); cx += w + 2 }
    }
}

// chassis + PCB — static texture built once (grain is decor, not sim)
let chassisTex = null
function chassis() {
    if (chassisTex) return chassisTex
    const cv = document.createElement('canvas')
    cv.width = W; cv.height = H
    const g = cv.getContext('2d')
    g.fillStyle = C.edge; g.fillRect(0, 0, W, H)
    g.fillStyle = C.plate; g.fillRect(6, 6, W - 12, H - 12)
    const grad = g.createLinearGradient(0, 0, 0, H)
    grad.addColorStop(0, 'rgba(255,255,255,0.05)')
    grad.addColorStop(1, 'rgba(0,0,0,0.28)')
    g.fillStyle = grad; g.fillRect(6, 6, W - 12, H - 12)
    for (let i = 0; i < 2400; i++) {
        g.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.05)'
        g.fillRect(Math.random() * W, Math.random() * H, 1, 1)
    }
    // rivets
    for (const [rx, ry] of [[16, 16], [W - 16, 16], [16, H - 16], [W - 16, H - 16], [W / 2 - 4, 12], [W / 2 + 4, 12]]) {
        g.fillStyle = '#181b12'; g.beginPath(); g.arc(rx, ry, 4, 0, 7); g.fill()
        g.fillStyle = '#575e4b'; g.beginPath(); g.arc(rx - 1, ry - 1, 2, 0, 7); g.fill()
    }
    // hazard stripe corners
    g.save()
    g.beginPath(); g.rect(6, 6, 90, 12); g.clip()
    for (let i = -20; i < 110; i += 14) { g.fillStyle = '#d7a41f'; g.save(); g.translate(i, 6); g.rotate(0.5); g.fillRect(0, -8, 7, 40); g.restore() }
    g.restore()
    g.save()
    g.beginPath(); g.rect(W - 96, H - 18, 90, 12); g.clip()
    for (let i = -20; i < 110; i += 14) { g.fillStyle = '#d7a41f'; g.save(); g.translate(W - 96 + i, H - 18); g.rotate(0.5); g.fillRect(0, -8, 7, 40); g.restore() }
    g.restore()
    chassisTex = cv
    return cv
}

// ---- the bomb face -----------------------------------------------------------
function drawBombView(g, gs, now, opts = {}) {
    const dim = opts.dim || 0
    // after the win the run is past its last bomb — show the closed case only
    const st = gs.done ? null : E.curStep(gs)
    const live = !gs.done && gs.intro <= 0 && opts.paused !== true
    const cx = 320, cy = 200

    // bomb body — steel case
    g.save()
    g.fillStyle = C.steelLo; g.fillRect(96, 74, 448, 250)
    g.fillStyle = C.steel; g.fillRect(100, 78, 440, 242)
    g.strokeStyle = C.steelHi; g.lineWidth = 2; g.strokeRect(104, 82, 432, 234)
    g.strokeStyle = C.ink; g.strokeRect(96, 74, 448, 250)

    // fuse plate
    g.fillStyle = C.screen; g.fillRect(cx - 92, 86, 184, 44)
    g.strokeStyle = '#000'; g.strokeRect(cx - 92, 86, 184, 44)
    const secs = Math.max(0, Math.ceil(gs.fuse / 60))
    const fuseCol = secs <= 10 ? C.red : secs <= 20 ? C.amber : C.green
    const blink = secs <= 10 && Math.floor(now / 250) % 2 === 0
    drawSegText(g, cx - 66, 92, `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`, 32, blink ? '#200806' : fuseCol, true)
    g.font = '8px "Press Start 2P", monospace'; g.textAlign = 'center'
    g.fillStyle = C.label; g.fillText('FUSE', cx, 146)

    // step dots
    if (st) {
    const n = gs.bombs[gs.bomb].steps.length
    for (let i = 0; i < n; i++) {
        const done = i < gs.step
        g.fillStyle = done ? C.green : gs.step === i ? (Math.floor(now / 300) % 2 ? C.amber : '#6b5210') : '#1c1f16'
        g.fillRect(cx + 100 + i * 16, 100, 11, 11)
        g.strokeStyle = '#000'; g.strokeRect(cx + 100 + i * 16, 100, 11, 11)
    }
    g.fillStyle = C.label; g.fillText(`BOMB ${gs.bomb + 1}/${E.BOMBS}`, cx + 100 + (n * 16) / 2 - 2, 130)

    // strike lamps (left bank)
    for (let i = 0; i < Math.max(3, gs.strikes); i++) {
        g.fillStyle = i < gs.strikes ? C.red : '#241210'
        g.beginPath(); g.arc(124 + i * 15, 108, 5, 0, 7); g.fill()
        g.strokeStyle = '#000'; g.stroke()
    }
    g.fillStyle = C.label; g.fillText('STRIKES', 124 + Math.max(2, gs.strikes - 1) * 7, 130)

    // kind-specific panel
    if (st.kind === E.SYNC) {
        g.font = '10px "Press Start 2P", monospace'
        g.fillStyle = live && Math.floor(now / 400) % 2 ? C.amber : '#6b5210'
        g.fillText('TURN BOTH KEYS', cx, 176)
        for (let i = 0; i < 2; i++) {
            const kx = i === 0 ? 150 : 490
            // chrome key barrel
            g.fillStyle = '#12150e'; g.beginPath(); g.arc(kx, cy + 10, 26, 0, 7); g.fill()
            g.fillStyle = C.chrome; g.beginPath(); g.arc(kx, cy + 10, 20, 0, 7); g.fill()
            g.fillStyle = C.steelLo; g.beginPath(); g.arc(kx, cy + 10, 15, 0, 7); g.fill()
            // key blade rotates in when the seat turns its key
            const on = gs.keys[i]
            g.save()
            g.translate(kx, cy + 10)
            g.rotate(on ? 0.78 : -0.35)
            g.fillStyle = on ? C.brass : '#7a6f4a'
            if (on) { g.shadowColor = C.brass; g.shadowBlur = 10 }
            g.fillRect(-3, -26, 6, 22)
            g.beginPath(); g.arc(0, 0, 8, 0, 7); g.fill()
            g.shadowBlur = 0
            g.restore()
            g.fillStyle = C.label; g.font = '8px "Press Start 2P", monospace'
            g.fillText(`P${i + 1}${opts.cpu2 && i === 1 ? ' CPU' : ''}${opts.youSeat === i ? ' YOU' : ''}`, kx, cy + 52)
        }
        drawWindowBar(g, gs, (gs.keys[0] || gs.keys[1]) && !(gs.keys[0] && gs.keys[1]) ? gs.keyT : 0)
    } else if (st.kind === E.CUT) {
        g.font = '10px "Press Start 2P", monospace'
        const flick = Math.floor(now / 260) % 2
        g.fillStyle = C.label; g.fillText('TARGET', cx, 170)
        g.fillStyle = C.wire[st.color]
        if (flick || gs.armed[0] || gs.armed[1]) { g.shadowColor = WIRE_GLOW[st.color]; g.shadowBlur = 12 }
        g.fillText(E.COLORS[st.color], cx, 188)
        g.shadowBlur = 0
        // the harness — four curved cables
        for (let i = 0; i < 4; i++) {
            const wx = 240 + i * 54
            const crossed = gs.armed[0] && gs.armed[1]
            g.strokeStyle = C.wire[i]
            g.lineWidth = 5
            if (WIRE_GLOW[i] && (i === st.color || crossed)) { g.shadowColor = WIRE_GLOW[i]; g.shadowBlur = 10 }
            g.beginPath()
            g.moveTo(wx, 212)
            g.bezierCurveTo(wx - 12, 238, wx + 12, 262, wx, 292)
            g.stroke()
            g.shadowBlur = 0
        }
        g.lineWidth = 1
        // cutter arms — one per seat, colored by the selector
        for (let i = 0; i < 2; i++) {
            const ax = i === 0 ? 150 : 490
            const sel = gs.sel[i]
            g.fillStyle = '#14170f'; g.fillRect(ax - 26, 206, 52, 96)
            g.strokeStyle = C.steelHi; g.strokeRect(ax - 26, 206, 52, 96)
            g.fillStyle = C.wire[sel]
            if (gs.armed[i]) { g.shadowColor = WIRE_GLOW[sel]; g.shadowBlur = 12 }
            g.fillRect(ax - 16, 216, 32, 12)
            g.shadowBlur = 0
            // blade glyph
            g.strokeStyle = gs.armed[i] ? C.brass : C.chrome
            g.lineWidth = 3
            const close = gs.armed[i] ? 0.12 : 0.5
            g.beginPath(); g.moveTo(ax - 12, 296); g.lineTo(ax + 12, 296 - 14 * close)
            g.moveTo(ax - 12, 296 - 14 * close); g.lineTo(ax + 12, 296)
            g.stroke(); g.lineWidth = 1
            g.fillStyle = C.label; g.font = '8px "Press Start 2P", monospace'
            g.fillText(`P${i + 1}${opts.cpu2 && i === 1 ? ' CPU' : ''}${opts.youSeat === i ? ' YOU' : ''}`, ax, 250)
            g.fillStyle = C.wire[sel]; g.font = '7px "Press Start 2P", monospace'
            g.fillText(E.COLORS[sel][0], ax, 268)
        }
        drawWindowBar(g, gs, (gs.armed[0] || gs.armed[1]) && !(gs.armed[0] && gs.armed[1]) ? gs.armedT : 0)
    } else {
        // VENT — gauge + stabilizer bars
        g.font = '10px "Press Start 2P", monospace'
        g.fillStyle = C.label
        g.fillText(`P${st.holder + 1} HOLDS  ·  P${2 - st.holder} SEATS`, cx, 172)
        const unvented = live && !gs.held
        // gauge face
        g.fillStyle = '#0b0e07'; g.beginPath(); g.arc(cx, cy + 18, 66, 0, 7); g.fill()
        g.strokeStyle = unvented && Math.floor(now / 200) % 2 ? C.red : C.chrome
        g.lineWidth = 3; g.beginPath(); g.arc(cx, cy + 18, 66, 0, 7); g.stroke(); g.lineWidth = 1
        // ticks
        for (let d = -120; d <= 120; d += 20) {
            const rad = ((d - 90) * Math.PI) / 180
            g.strokeStyle = d >= 60 ? C.red : C.chrome
            g.beginPath()
            g.moveTo(cx + Math.cos(rad) * 56, cy + 18 + Math.sin(rad) * 56)
            g.lineTo(cx + Math.cos(rad) * 62, cy + 18 + Math.sin(rad) * 62)
            g.stroke()
        }
        // green zone arc — map needle-units (-1000..1000) to gauge degrees (-90..90)
        const a0 = ((((gs.zone - E.ZONE_HALF[gs.bomb]) / 1000) * 90) - 90) * Math.PI / 180
        const a1 = ((((gs.zone + E.ZONE_HALF[gs.bomb]) / 1000) * 90) - 90) * Math.PI / 180
        g.strokeStyle = C.green; g.lineWidth = 9
        g.shadowColor = C.green; g.shadowBlur = 8
        g.beginPath(); g.arc(cx, cy + 18, 48, a0, a1); g.stroke()
        g.shadowBlur = 0; g.lineWidth = 1
        // needle
        const nd = ((E.needleOf(gs) / 1000) * 90 - 90) * Math.PI / 180
        g.strokeStyle = unvented ? '#ff8a7e' : '#fff2ea'; g.lineWidth = 2.5
        g.beginPath(); g.moveTo(cx, cy + 18); g.lineTo(cx + Math.cos(nd) * 54, cy + 18 + Math.sin(nd) * 54); g.stroke(); g.lineWidth = 1
        g.fillStyle = C.brass; g.beginPath(); g.arc(cx, cy + 18, 5, 0, 7); g.fill()
        g.fillStyle = C.label; g.font = '8px "Press Start 2P", monospace'; g.fillText('PRESSURE', cx, cy + 96)
        // stabilizer bars — the holder's seat bar glows when pinned
        for (let i = 0; i < 2; i++) {
            const bx = i === 0 ? 128 : 512
            const isHolder = st.holder === i
            const pinned = isHolder && gs.held
            g.fillStyle = '#14170f'; g.fillRect(bx - 10, 180, 20, 90)
            g.fillStyle = pinned ? C.green : isHolder ? '#43502f' : '#20241b'
            if (pinned) { g.shadowColor = C.green; g.shadowBlur = 12 }
            g.fillRect(bx - 6, pinned ? 186 : 186, 12, pinned ? 78 : 30)
            g.shadowBlur = 0
            g.strokeStyle = isHolder ? C.amber : '#000'
            g.strokeRect(bx - 10, 180, 20, 90)
            g.fillStyle = isHolder ? C.amber : C.label; g.font = '8px "Press Start 2P", monospace'
            g.fillText(`P${i + 1}${opts.cpu2 && i === 1 ? ' CPU' : ''}${opts.youSeat === i ? ' YOU' : ''}`, bx, 288)
        }
    }

    } // end step-dots + kind panels (live bombs only)

    // banner text (defused / strike feedback rides the shell hud, drawn outside)
    g.textAlign = 'left'
    g.restore()
    if (dim) { g.fillStyle = `rgba(8,10,6,${dim})`; g.fillRect(0, 0, W, H) }
}

function drawWindowBar(g, gs, hold) {
    if (hold <= 0) return
    const w = E.curWindow(gs)
    const f = Math.max(0, 1 - hold / w)
    g.fillStyle = '#12150e'; g.fillRect(220, 312, 200, 10)
    g.fillStyle = f > 0.5 ? C.green : f > 0.25 ? C.amber : C.red
    g.fillRect(222, 314, 196 * f, 6)
    g.strokeStyle = '#000'; g.strokeRect(220, 312, 200, 10)
    g.fillStyle = C.label; g.font = '7px "Press Start 2P", monospace'; g.textAlign = 'center'
    g.fillText('SYNC WINDOW', 320, 336)
    g.textAlign = 'left'
}

function drawIntro(g, gs) {
    if (gs.intro <= 0 || gs.done) return
    const st = E.curStep(gs)
    g.fillStyle = 'rgba(6,8,4,0.72)'; g.fillRect(150, 150, 340, 60)
    g.strokeStyle = C.amber; g.strokeRect(150, 150, 340, 60)
    g.textAlign = 'center'
    g.font = '12px "Press Start 2P", monospace'; g.fillStyle = C.amber
    g.fillText(E.KIND_NAME[st.kind], 320, 176)
    g.font = '7px "Press Start 2P", monospace'; g.fillStyle = C.green
    g.fillText(st.kind === E.SYNC ? 'BOTH KEYS, ONE WINDOW' : st.kind === E.CUT ? 'BOTH BLADES, ONE COLOR' : 'HOLD  +  SEAT, TOGETHER', 320, 196)
    g.textAlign = 'left'
}

// HUD chrome: score + seats + mic (outside the case)
function drawHudFrame(g, gs, opts) {
    g.textAlign = 'left'
    g.font = '8px "Press Start 2P", monospace'
    g.fillStyle = C.label; g.fillText('SCORE', 24, 344)
    drawSegText(g, 70, 332, String(gs ? gs.score : 0).padStart(5, '0'), 16, C.green, false)
    g.fillStyle = opts.coop ? C.green : C.amber
    g.fillText(opts.coop ? 'P2 CO-OP' : 'P2 CPU', 520, 344)
    if (opts.mic) { g.fillStyle = C.red; g.fillText('MIC', 470, 344) }
}

export default function BombDefuseGame() {
    const canvasRef = useRef(null)
    const [paused, setPaused] = useState(false)
    const [uiScreen, setUiScreen] = useState('attract')
    const [micOn, setMicOn] = useState(false)
    const pausedRef = useRef(false)
    const screenRef = useRef('attract')
    const gsRef = useRef(null)
    const attractRef = useRef(null)
    const seedRef = useRef(0)
    const seatsRef = useRef(1)
    const selectRef = useRef(1)
    const coopRef = useRef(false)
    const keys1Ref = useRef({})
    const keys2Ref = useRef({})
    const hudRef = useRef({ flash: 0, shake: 0, sparks: [], banner: null, bannerT: 0, boomT: 0 })
    const hintRef = useRef(null)
    const msgRef = useRef({ idx: 0, at: 0 })
    const overAtRef = useRef(0)
    const voiceRef = useRef({ on: false, listen: null })
    // #1819 online — lobby + lockstep sync live here; the loop reads netRef.current
    const netRef = useRef({
        active: false, role: null, lobby: null, room: null, sync: null,
        miss: 0, desyncs: 0, desyncFrozen: false,
    })
    const [netUi, setNetUi] = useState(null)

    useEffect(() => { pausedRef.current = paused }, [paused])

    const setScreen = useCallback((s) => { screenRef.current = s; setUiScreen(s) }, [])

    const startPlay = useCallback((seed, players) => {
        gsRef.current = E.createGame(seed, players)
        seedRef.current = seed
        seatsRef.current = players
        coopRef.current = players > 1
        hudRef.current = { flash: 0, shake: 0, sparks: [], banner: null, bannerT: 0, boomT: 0 }
        hintRef.current = null
        setScreen('play')
    }, [setScreen])

    const startAttract = useCallback(() => {
        attractRef.current = E.createGame(1000 + Math.floor(Math.random() * 8999), 2)
        setScreen('attract')
    }, [setScreen])

    const humanStart = useCallback((seed, players) => {
        if (startBusy()) return
        setStartBusy(true)
        askConsent()
            .then(() => { startPlay(seed, players); beginRun() })
            .finally(() => setStartBusy(false))
    }, [startPlay])

    // ---- voice: coaching words only, never act (#1247) ----------------------
    const voiceCall = useCallback((text) => {
        const gs = gsRef.current
        const st = gs && !gs.done ? E.curStep(gs) : null
        const intent = st ? parseCall(text, st.holder) : null
        const ok = !!intent && st !== null
        hintRef.current = ok ? { kind: intent.kind, color: intent.color, seat: intent.seat, t: 45 } : hintRef.current
        recordVoiceCmd({ said: String(text || '').slice(0, 80), intent: ok ? intent : null, ok, ...(!ok ? { why: 'NO MATCH' } : {}) })
    }, [])

    const toggleVoice = useCallback(() => {
        const v = voiceRef.current
        v.on = !v.on
        setMicOn(v.on)
        if (v.on) v.listen = startSpeechListen({ onPhrase: (p) => voiceCall(p), onError: () => { /* badge tells the truth */ } })
        else if (v.listen) { v.listen.stop(); v.listen = null }
    }, [voiceCall])

    // ---- fx pump ------------------------------------------------------------
    const pumpFx = useCallback((f) => {
        const hud = hudRef.current
        if (f.k === 'key') { sfx.key(); hud.sparks.push(...Array.from({ length: 4 }, () => ({ x: (f.seat === 0 ? 150 : 490) + (Math.random() - 0.5) * 14, y: 210 + (Math.random() - 0.5) * 14, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 2, life: 12 }))) }
        else if (f.k === 'click') { sfx.click(); hud.banner = { text: 'KEYS TURNED', ok: true }; hud.bannerT = 50 }
        else if (f.k === 'snip') { sfx.snip(); hud.sparks.push(...Array.from({ length: 5 }, () => ({ x: (f.seat === 0 ? 150 : 490) + (Math.random() - 0.5) * 18, y: 220 + (Math.random() - 0.5) * 10, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 3, life: 12 }))) }
        else if (f.k === 'cut') { sfx.cut(); hud.banner = { text: 'WIRE OUT', ok: true }; hud.bannerT = 50 }
        else if (f.k === 'vent') sfx.creak()
        else if (f.k === 'sealed') { sfx.sealed(); hud.banner = { text: 'SEALED', ok: true }; hud.bannerT = 50 }
        else if (f.k === 'dud') sfx.dud()
        else if (f.k === 'nick') {
            sfx.nick(); hud.flash = 10; hud.shake = 6
            hud.sparks.push(...Array.from({ length: 8 }, () => ({ x: (f.seat === 0 ? 150 : 490) + (Math.random() - 0.5) * 24, y: 240 + (Math.random() - 0.5) * 30, vx: (Math.random() - 0.5) * 4, vy: -Math.random() * 3, life: 12 })))
            hud.banner = { text: 'WIRES NICKED −2S', ok: false }; hud.bannerT = 40
        }
        else if (f.k === 'strike') { sfx.strike(); hud.flash = 26; hud.shake = 12; hud.banner = { text: `STRIKE! ${f.why}`, ok: false }; hud.bannerT = 60 }
        else if (f.k === 'surge') { sfx.surge(); hud.flash = 34; hud.shake = 16; hud.banner = { text: 'PRESSURE SURGE', ok: false }; hud.bannerT = 60 }
        else if (f.k === 'defused') { sfx.defused(); hud.banner = { text: `BOMB ${f.bomb} DOWN`, ok: true }; hud.bannerT = 80 }
        else if (f.k === 'boom') { sfx.boom(); hud.boomT = 70; hud.shake = 24 }
        else if (f.k === 'win') sfx.win()
    }, [])

    // ---- game contract spec ---------------------------------------------------
    const makeSpec = () => {
        let prevPad = {}
        return {
            id: 'bomb-defuse',
            method: 'dpad',
            get players() { return seatsRef.current },
            buttons: ['a', 'b'],
            reads: ['up', 'down', 'left', 'right', 'a', 'b'],
            sources: () => {
                const solo = netRef.current.sync && netRef.current.sync.solo()
                return [{ kind: 'human' }, seatsRef.current > 1 && !solo ? { kind: 'human' } : { kind: 'cpu' }]
            },
            reset: (seed, players) => { startPlay(seed >>> 0 || 1, Math.max(1, Math.min(2, players | 0 || 1))) },
            tick: (pad, pads) => {
                const g = gsRef.current
                if (!g || g.done) return
                const merged = [pads && pads[0] ? pads[0] : pad]
                if (g.players > 1) merged.push((pads && pads[1]) || {})
                const cm = E.curStep(g)
                const moved = !!cm && cm.kind === E.CUT && ((merged[0].left && !prevPad.left) || (merged[0].right && !prevPad.right) || (merged[0].up && !prevPad.up) || (merged[0].down && !prevPad.down))
                prevPad = { ...merged[0] }
                E.step(g, merged)
                while (g.events.length) {
                    const f = g.events.shift()
                    if (moved && f.k === 'key') sfx.move()
                    pumpFx(f)
                }
                if (g.done && screenRef.current === 'play') { overAtRef.current = performance.now(); setScreen('over') }
            },
            state: () => {
                const g = gsRef.current || E.createGame(1, 1)
                return { ...E.simState(g), players: seatsRef.current }
            },
            canvas: () => canvasRef.current,
        }
    }

    useEffect(() => {
        const cvs = canvasRef.current
        if (!cvs) return undefined
        const voice = voiceRef.current
        cvs.width = W; cvs.height = H
        const spec = makeSpec()
        startAttract()
        if (import.meta.env.DEV) exposeGame(spec)
        initAutoRecord()
        armLiveCapture(spec)
        exposeFeedbackState(() => ({
            game: 'bomb-defuse',
            seed: seedRef.current || (gsRef.current && gsRef.current.seed) || 0,
            score: gsRef.current ? gsRef.current.score : 0,
            done: !!(gsRef.current && gsRef.current.done),
        }))

        // ---- online (#1819): one lobby, one seed, two hands on two boxes ----
        const nq = new URLSearchParams(location.search)
        const urlRole = lobbyRole(location.search)
        const net = netRef.current
        net.active = urlRole !== null
        net.role = urlRole
        const pushNetUi = () => setNetUi(net.lobby ? net.lobby.state() : null)
        net.sync = createDefuseSync({
            mySeat: urlRole === 'host' ? 0 : 1,
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
            hudRef.current.bannerT = 80
            if (net.role === 'host') hostSnap()
            else {
                net.desyncFrozen = true
                if (net.room) net.room.send('res', { e: 'req' })
            }
        }
        const startNetMatch = (m) => {
            const seed = ((m && m.seed) >>> 0) || 1
            gsRef.current = E.createGame(seed, 2)
            seedRef.current = seed
            seatsRef.current = 2
            coopRef.current = true
            hudRef.current = { flash: 0, shake: 0, sparks: [], banner: { text: 'CREW LINKED — BOTH HANDS', ok: true }, bannerT: 70, boomT: 0 }
            hintRef.current = null
            net.miss = 0
            net.desyncFrozen = false
            const room = net.room
            const mySeat = room && room.yourSlot >= 0 ? room.yourSlot : (net.role === 'host' ? 0 : 1)
            net.sync.mySeat = mySeat
            const humans = room && room.slots ? room.slots.slice() : [mySeat]
            net.sync.watchSeats = humans.filter((s) => s !== mySeat).sort((a, b) => a - b)
            net.sync.reset(0)
            // consent rides the kick gesture (host press) / prior grant (guest);
            // a rejected consent just plays unrecorded — honest.
            askConsent().then(() => beginRun()).catch(() => {})
            setScreen('play')
        }
        const onlineStart = () => {
            if (!net.lobby || net.role !== 'host' || !net.room || startBusy()) return
            if (net.room.phase !== 'waiting') net.room.setPhase('waiting')
            net.lobby.start({ seed: humanSeed() })
        }
        if (net.active) {
            net.lobby = createLobby({
                slug: 'bomb-defuse',
                cap: 2,
                relay: relayFromQuery(location.search),
                makeTransport,
                shareRelay: !!nq.get('relay'),
                onState: (st) => {
                    if (st.role) net.role = st.role
                    // a bare ?net=join with no code gets the shared entry card
                    if (urlRole === 'guest' && !nq.get('room') && st.phase === 'idle' && !st.code) st.phase = 'entry'
                    pushNetUi()
                },
                onStart: (m) => startNetMatch(m),
                onJoin: () => pushNetUi(),
                onLeave: () => {
                    pushNetUi()
                    // a pending resync could wait forever — drive on; the
                    // missing seat demotes through the stall law below
                    net.desyncFrozen = false
                },
                on: {
                    pad: (m) => net.sync.gotPad(m),
                    hs: (m) => { const d = net.sync.gotHash(m.k | 0, m.h >>> 0); if (d) netDesync() },
                    res: (m) => {
                        if (m.e === 'req') { if (net.role === 'host') hostSnap() }
                        else if (m.e === 'snp') {
                            const got = net.sync.snapInbox.push(m)
                            if (got && net.role === 'guest' && net.desyncFrozen) {
                                // restore at the host's tick; pad streams are
                                // PRESERVED (the sampling law) — no sync.reset
                                gsRef.current = restoreNet(got.snap)
                                net.desyncFrozen = false
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

        const pressMin = (keys, field) => { keys[field] = true; keys[field + '_rel'] = false }
        const releaseMin = (keys, field) => { keys[field + '_rel'] = true }
        const settleReleases = (keys) => {
            for (const k of Object.keys(keys)) {
                if (k.endsWith('_rel') && keys[k]) keys[k.slice(0, -4)] = false
            }
        }
        const clearKeys = () => {
            for (const k of Object.keys(keys1Ref.current)) keys1Ref.current[k] = false
            for (const k of Object.keys(keys2Ref.current)) keys2Ref.current[k] = false
        }

        const S1 = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Space: 'a', KeyB: 'b' }
        const S2 = { KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down', KeyF: 'a', KeyG: 'b' }

        const beginSelect = () => { clearKeys(); selectRef.current = seatsRef.current > 1 ? 2 : 1; setScreen('select'); sfx.blip() }

        const onKeyDown = (e) => {
            if (e.code === 'Escape' || e.code === 'Backquote' || (e.shiftKey && e.code === 'Digit1')) {
                if (screenRef.current === 'play') { e.preventDefault(); setPaused(p => !p) }
                return
            }
            if (e.code === 'KeyV') { e.preventDefault(); toggleVoice(); return }
            if (screenRef.current === 'attract') {
                if (net.active) {
                    // the lobby owns the attract: the host kicks (Space/Enter),
                    // the guest waits for the go — crew size is fixed at 2 online
                    if (net.role === 'host' && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); onlineStart() }
                    return
                }
                beginSelect(); return
            }
            if (screenRef.current === 'over') {
                if (performance.now() - overAtRef.current > 700) {
                    if (net.active) { if (net.role === 'host') onlineStart() }
                    else { clearKeys(); humanStart(humanSeed(), seatsRef.current) }
                }
                return
            }
            if (screenRef.current === 'select') {
                if (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'Digit2') {
                    selectRef.current = selectRef.current === 1 ? 2 : 1; sfx.move()
                }
                if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); humanStart(humanSeed(), selectRef.current) }
                return
            }
            if (pausedRef.current) return
            const f1 = S1[e.code]
            if (f1) { e.preventDefault(); pressMin(keys1Ref.current, f1); return }
            if (seatsRef.current > 1) {
                const f2 = S2[e.code]
                if (f2) { e.preventDefault(); pressMin(keys2Ref.current, f2) }
            }
        }
        const onKeyUp = (e) => {
            const f1 = S1[e.code]
            if (f1) releaseMin(keys1Ref.current, f1)
            const f2 = S2[e.code]
            if (f2 && seatsRef.current > 1) releaseMin(keys2Ref.current, f2)
        }
        const onPointer = (ev) => {
            if (ev.target && ev.target.closest && (ev.target.closest('[data-vc]') || ev.target.closest('[role="dialog"]') || ev.target.closest('input,button'))) return
            if (screenRef.current === 'attract') {
                if (net.active) { if (net.role === 'host') onlineStart() }
                else beginSelect()
            }
            else if (screenRef.current === 'over' && performance.now() - overAtRef.current > 700) {
                if (net.active) { if (net.role === 'host') onlineStart() }
                else humanStart(humanSeed(), seatsRef.current)
            }
            else if (screenRef.current === 'select') humanStart(humanSeed(), selectRef.current)
        }
        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)
        window.addEventListener('pointerdown', onPointer)

        const padFrom = (keys) => ({
            left: !!keys.left, right: !!keys.right, up: !!keys.up, down: !!keys.down,
            a: !!keys.a, b: !!keys.b,
        })

        let raf = 0
        let last = performance.now()
        let acc = 0
        const loop = (now) => {
            raf = requestAnimationFrame(loop)
            acc += Math.min(now - last, FIXED_DT * 5)
            last = now
            const g = canvasRef.current ? canvasRef.current.getContext('2d') : null
            if (!g) return
            while (acc >= FIXED_DT) { acc -= FIXED_DT; simTick() }
            drawScene(g, now)
        }

        const simTick = () => {
            if (screenRef.current === 'attract' && attractRef.current) {
                const a = attractRef.current
                if (!contractHoldsLoop()) {
                    E.step(a, E.solvePads(a))
                    while (a.events.length) pumpFx(a.events.shift())
                }
                if (a.done) { attractRef.current = E.createGame(1000 + Math.floor(Math.random() * 8999), 2); return }
                return
            }
            if (screenRef.current === 'select') return
            if (screenRef.current !== 'play' || pausedRef.current) return
            if (contractHoldsLoop()) return
            if (net.active) {
                const gs = gsRef.current
                if (!gs) return
                if (!net.desyncFrozen) {
                    let pads
                    if (net.sync.solo()) {
                        // survivor: no peer to sync with — held keys drive seat
                        // 0 and the engine partner covers seat 1 (players=1).
                        if (gs.players > 1) gs.players = 1
                        pads = [padFrom(keys1Ref.current), {}]
                    } else {
                        const k = gs.tick + 1
                        net.sync.pumpTo(k + net.sync.delay, () => padFrom(keys1Ref.current))
                        if (!net.sync.ready(k)) {
                            net.miss++
                            if (net.miss >= DROP_GRACE) {
                                const seat = net.sync.watchSeats[0]
                                if (seat !== undefined && net.sync.demote(seat)) {
                                    gs.players = 1
                                    hudRef.current.banner = { text: 'PARTNER LINK LOST — CPU PARTNER IN', ok: false }
                                    hudRef.current.bannerT = 90
                                    sfx.strike()
                                }
                                net.miss = 0
                            }
                            settleReleases(keys1Ref.current)
                            return
                        }
                        net.miss = 0
                        pads = net.sync.assemble(k)
                    }
                    spec.tick(pads[0], pads)
                    if (isRecording() && !contractHoldsLoop()) recordLiveTick(pads)
                    if (isRecording() && screenRef.current === 'over') endRun()
                    if (!gs.done && !net.sync.solo() && gs.tick % HASH_EVERY === 0) {
                        const d = net.sync.hash(gs.tick, E.hash(gs))
                        if (d) netDesync()
                    }
                    settleReleases(keys1Ref.current)
                    if (!gs.done && screenRef.current === 'play' && Math.ceil(gs.fuse / 60) <= 10 && gs.tick % 30 === 0) sfx.tick()
                }
                return
            }
            const p1 = padFrom(keys1Ref.current)
            const pads = seatsRef.current > 1 ? [p1, padFrom(keys2Ref.current)] : [p1]
            spec.tick(p1, pads)
            // the Gauntlet funnel (#1249): this loop bypasses contract step() —
            // feed the live capture here, never both.
            if (isRecording() && !contractHoldsLoop()) recordLiveTick(pads)
            // bank the last tick, THEN close the take (#1711)
            if (isRecording() && screenRef.current === 'over') endRun()
            settleReleases(keys1Ref.current)
            settleReleases(keys2Ref.current)
            // fuse ticks in the last ten seconds (shell clock, never sim state)
            const gs = gsRef.current
            if (gs && !gs.done && screenRef.current === 'play' && Math.ceil(gs.fuse / 60) <= 10 && gs.tick % 30 === 0) sfx.tick()
        }

        const drawScene = (g, now) => {
            g.save()
            g.drawImage(chassis(), 0, 0)
            const hud = hudRef.current
            if (hud.shake > 0) g.translate((Math.random() - 0.5) * hud.shake, (Math.random() - 0.5) * hud.shake)

            if (screenRef.current === 'play' || screenRef.current === 'over') {
                const gs = gsRef.current
                if (gs) {
                    drawBombView(g, gs, now, {
                        paused: pausedRef.current,
                        cpu2: seatsRef.current === 1 || (net.active && net.sync && net.sync.solo()),
                        youSeat: net.active && net.sync && !net.sync.solo() ? net.sync.mySeat : -1,
                    })
                    drawIntro(g, gs)
                    for (const s of hud.sparks) {
                        s.x += s.vx; s.y += s.vy; s.vy += 0.18
                        g.fillStyle = `rgba(255,${180 + Math.floor(Math.random() * 60)},80,${s.life / 14})`
                        g.fillRect(s.x, s.y, 2, 2)
                    }
                    hud.sparks = hud.sparks.filter(s => --s.life > 0)
                    if (hud.banner && hud.bannerT > 0) {
                        g.textAlign = 'center'
                        g.font = '12px "Press Start 2P", monospace'
                        g.fillStyle = hud.banner.ok ? C.green : C.red
                        g.shadowColor = hud.banner.ok ? C.green : C.red; g.shadowBlur = 10
                        g.fillText(hud.banner.text, 320, 56)
                        g.shadowBlur = 0; g.textAlign = 'left'
                        hud.bannerT--
                        if (hud.bannerT <= 0) hud.banner = null
                    }
                    if (hintRef.current) {
                        const hn = hintRef.current
                        g.strokeStyle = 'rgba(125,255,154,0.7)'; g.lineWidth = 2
                        if (hn.kind === 'sync') g.strokeRect(118, 158, 404, 120)
                        else if (hn.kind === 'color') { g.strokeRect(230 + hn.color * 54 - 6, 206, 24, 92) }
                        else if (hn.kind === 'hold') g.strokeRect((hn.seat === 0 ? 128 : 512) - 14, 176, 28, 98)
                        else g.strokeRect(252, 150, 136, 136)
                        g.lineWidth = 1
                        if (--hn.t <= 0) hintRef.current = null
                    }
                    drawHudFrame(g, gs, { coop: seatsRef.current > 1 && !(net.active && net.sync && net.sync.solo()), mic: voiceRef.current.on })
                    if (hud.flash > 0) {
                        g.fillStyle = `rgba(255,60,40,${Math.min(0.35, hud.flash / 60)})`
                        g.fillRect(0, 0, W, H); hud.flash--
                    }
                    if (hud.boomT > 0) {
                        const t = hud.boomT / 70
                        g.fillStyle = `rgba(255,${140 + Math.floor(80 * t)},40,${0.75 * t})`
                        g.beginPath(); g.arc(320, 200, (1 - t) * 420 + 40, 0, 7); g.fill()
                        if (t > 0.6) { g.fillStyle = 'rgba(255,250,230,0.9)'; g.fillRect(0, 0, W, H) }
                        hud.boomT--
                    }
                }
                if (hud.shake > 0) hud.shake -= 0.5
                if (screenRef.current === 'over') drawOver(g, now)
            } else if (screenRef.current === 'select') {
                drawHudFrame(g, null, { coop: false, mic: voiceRef.current.on })
                drawSelect(g)
            } else {
                const a = attractRef.current
                if (a) drawBombView(g, a, now, { cpu2: false, dim: 0 })
                g.fillStyle = 'rgba(8,10,6,0.66)'; g.fillRect(0, 0, W, H)
                g.fillStyle = 'rgba(6,8,4,0.78)'; g.fillRect(110, 96, 420, 84)
                g.strokeStyle = C.amber; g.strokeRect(110, 96, 420, 84)
                g.textAlign = 'center'
                g.font = '24px "Press Start 2P", monospace'
                g.fillStyle = Math.floor(now / 500) % 2 ? C.red : '#8a2019'
                g.shadowColor = C.red; g.shadowBlur = 14
                g.fillText('BOMB DEFUSE', 320, 132)
                g.shadowBlur = 0
                g.font = '8px "Press Start 2P", monospace'; g.fillStyle = C.amber
                g.fillText('BOTH HANDS ON THE WIRE — ALWAYS', 320, 160)
                const m = msgRef.current
                if (now - m.at > 2600) { m.at = now; m.idx = (m.idx + 1) % ATTRACT_MSGS.length }
                g.font = '9px "Press Start 2P", monospace'; g.fillStyle = C.green
                g.fillText(net.active ? (net.role === 'host' ? 'ROOM LIVE — SHARE THE CODE' : "WAITING FOR THE HOST'S KICK…") : ATTRACT_MSGS[m.idx], 320, 214)
                if ((!net.active || net.role === 'host') && Math.floor(now / 500) % 2) { g.fillStyle = '#fff'; g.fillText(net.active ? 'SPACE STARTS THE CREW' : 'PRESS ANY KEY / TAP', 320, 250) }
                g.textAlign = 'left'
            }
            g.restore()
        }

        const drawOver = (g, now) => {
            const gs = gsRef.current
            if (!gs) return
            g.fillStyle = 'rgba(6,8,4,0.74)'; g.fillRect(120, 108, 400, 144)
            g.strokeStyle = gs.won ? C.green : C.red; g.lineWidth = 2; g.strokeRect(120, 108, 400, 144); g.lineWidth = 1
            g.textAlign = 'center'
            g.font = '18px "Press Start 2P", monospace'
            g.fillStyle = gs.won ? C.green : C.red
            g.shadowColor = g.fillStyle; g.shadowBlur = 12
            g.fillText(gs.won ? 'ALL BOMBS DEFUSED' : 'KABOOM', 320, 148)
            g.shadowBlur = 0
            g.font = '8px "Press Start 2P", monospace'; g.fillStyle = C.label
            g.fillText(gs.won ? `CLEAN RUN  ·  STRIKES ${gs.strikes}` : `THE CLOCK WON ON BOMB ${gs.bomb + 1}`, 320, 176)
            drawSegText(g, 264, 192, String(gs.score).padStart(5, '0'), 22, C.amber, true)
            if (performance.now() - overAtRef.current > 700 && Math.floor(now / 460) % 2) {
                g.font = '9px "Press Start 2P", monospace'; g.fillStyle = '#fff'
                g.fillText(net.active
                    ? (net.role === 'host' ? 'SPACE — RUN IT BACK' : 'WAITING FOR THE HOST…')
                    : 'TRY AGAIN — ANY KEY', 320, 238)
            }
            g.textAlign = 'left'
        }

        const drawSelect = (g) => {
            g.fillStyle = 'rgba(6,8,4,0.82)'; g.fillRect(140, 96, 360, 150)
            g.strokeStyle = C.amber; g.strokeRect(140, 96, 360, 150)
            g.textAlign = 'center'
            g.font = '12px "Press Start 2P", monospace'; g.fillStyle = C.amber
            g.fillText('CREW SIZE', 320, 124)
            const pick = selectRef.current
            for (const n of [1, 2]) {
                const x = n === 1 ? 224 : 416
                const on = pick === n
                g.fillStyle = on ? '#1c2416' : '#12150e'; g.fillRect(x - 56, 140, 112, 66)
                g.strokeStyle = on ? C.green : '#333'
                g.strokeRect(x - 56, 140, 112, 66)
                g.font = '10px "Press Start 2P", monospace'; g.fillStyle = on ? C.green : C.label
                g.fillText(n === 1 ? 'SOLO' : 'CO-OP', x, 164)
                g.font = '7px "Press Start 2P", monospace'; g.fillStyle = C.label
                g.fillText(n === 1 ? '+ CPU PARTNER' : '2 KEYBOARD CREWS', x, 182)
            }
            g.font = '8px "Press Start 2P", monospace'; g.fillStyle = C.label
            g.fillText('ARROWS PICK — SPACE STARTS', 320, 224)
            g.fillStyle = '#9aa68b'; g.font = '7px "Press Start 2P", monospace'
            g.fillText('P1 ARROWS+SPACE+B   ·   P2 WASD+F+G', 320, 238)
            g.textAlign = 'left'
        }

        raf = requestAnimationFrame(loop)

        if (import.meta.env.DEV) {
            window.__bdTest = {
                state: () => (gsRef.current ? { ...E.simState(gsRef.current), players: seatsRef.current } : null),
                screen: () => screenRef.current,
                start: (seed = 42, players = 1) => { humanStart(seed, players); return true },
                solve: (n = 1) => {
                    const g = gsRef.current
                    if (!g) return null
                    for (let i = 0; i < n && !g.done; i++) {
                        const pads = E.solvePads(g)
                        E.step(g, pads)
                        while (g.events.length) pumpFx(g.events.shift())
                    }
                    if (g.done && screenRef.current === 'play') { overAtRef.current = performance.now(); setScreen('over') }
                    return E.simState(g)
                },
                step: (n = 1) => { for (let i = 0; i < n; i++) simTick(); return gsRef.current ? E.simState(gsRef.current) : null },
                press: (code) => { const f1 = S1[code]; if (f1) pressMin(keys1Ref.current, f1); const f2 = S2[code]; if (f2) pressMin(keys2Ref.current, f2) },
                release: (code) => { const f1 = S1[code]; if (f1) releaseMin(keys1Ref.current, f1); const f2 = S2[code]; if (f2) releaseMin(keys2Ref.current, f2) },
                net: () => ({
                    active: net.active, role: net.role,
                    code: net.room ? net.room.code : '', phase: net.room ? net.room.phase : '',
                    seat: net.sync ? net.sync.mySeat : -1,
                    watch: net.sync ? net.sync.watchSeats.slice() : [],
                    solo: net.sync ? net.sync.solo() : false,
                    stalls: net.sync ? net.sync.stats().stalls : 0,
                    miss: net.miss, desyncs: net.desyncs, frozen: net.desyncFrozen,
                }),
                kick: () => { onlineStart(); return true },
            }
            mountDbg({
                title: 'BOMB DEFUSE',
                getState: () => {
                    const g = gsRef.current
                    if (!g) return ['no game']
                    const st = E.curStep(g)
                    return [
                        `bomb ${g.bomb + 1}/${E.BOMBS} step ${g.step + 1}/${g.bombs[g.bomb].steps.length} ${E.KIND_NAME[st.kind]}`,
                        `fuse ${Math.ceil(g.fuse / 60)}s window ${E.curWindow(g)} strikes ${g.strikes} score ${g.score}`,
                        st.kind === E.SYNC ? `keys ${g.keys[0] ? 'P1' : '--'} ${g.keys[1] ? 'P2' : '--'}` : '',
                        st.kind === E.CUT ? `target ${E.COLORS[st.color]} sel ${E.COLORS[g.sel[0]]}/${E.COLORS[g.sel[1]]} armed ${g.armed.map(a => (a ? 'Y' : 'n')).join('')}` : '',
                        st.kind === E.VENT ? `holder P${st.holder + 1} needle ${E.needleOf(g)} zone ${g.zone}±${E.ZONE_HALF[g.bomb]} held ${g.held}` : '',
                        `done ${g.done} won ${g.won} seats ${seatsRef.current}`,
                        net.active ? `net ${net.role || '?'} ${net.room ? net.room.phase : ''} code ${net.room ? net.room.code : '----'} seat ${net.sync ? net.sync.mySeat : -1} solo ${net.sync ? net.sync.solo() : false} desyncs ${net.desyncs}` : '',
                    ].filter(Boolean)
                },
                actions: [
                    { label: 'SOLVE 200 TICKS', run: () => { if (import.meta.env.DEV && window.__bdTest) window.__bdTest.solve(200) } },
                    { label: 'SELF BOOM', run: () => { const g = gsRef.current; if (g && !g.done) { g.fuse = 1 } } },
                ],
            })
        }

        return () => {
            cancelAnimationFrame(raf)
            window.removeEventListener('keydown', onKeyDown)
            window.removeEventListener('keyup', onKeyUp)
            window.removeEventListener('pointerdown', onPointer)
            if (voice.listen) voice.listen.stop()
            if (isRecording()) endRun()
            if (net.lobby) net.lobby.close() // #1819: don't leave the relay socket open
            if (import.meta.env.DEV) { unexposeGame(); unmountDbg(); delete window.__bdTest }
            unexposeFeedbackState()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const entry = GAMES.find(g => g.label === 'BOMB DEFUSE')

    return (
        <div className="relative flex h-full w-full items-center justify-center bg-black">
            <canvas
                ref={canvasRef}
                className="max-h-full max-w-full"
                style={{ imageRendering: 'pixelated', aspectRatio: `${W} / ${H}` }}
            />
            {netUi && uiScreen === 'attract' && (
                <Lobby
                    state={netUi}
                    title="DEFUSE CREW"
                    accent={{ text: 'text-amber-300', dim: 'text-amber-100/70', live: 'border-amber-300/50 text-amber-100' }}
                    startHint="SPACE — START THE RUN"
                    onEntry={(code) => netRef.current.lobby && netRef.current.lobby.join(code)}
                />
            )}
            {paused && <PauseOverlay gameEntry={entry} onResume={() => setPaused(false)} />}
            {micOn && (
                <div className="pointer-events-none absolute top-2 right-2 rounded bg-red-700/80 px-2 py-1 font-mono text-xs text-white">
                    MIC ON — words coach, pads commit
                </div>
            )}
            <VirtualControls visible={!paused && uiScreen === 'play'} secondAction={{ label: 'HOLD', code: 'KeyB' }} />
        </div>
    )
}
