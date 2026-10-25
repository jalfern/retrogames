// BLOB BATTLE — the cabinet. Rules live in ./sim.js (pure, audited by
// `npm run blobcheck`), the CPU in ./planner.js, the online semantics in
// ./net.js. 368x240 arcade frame: two glossy wells side by side, the VS
// column between them carrying rounds, incoming-attack queues and chain
// counters. Modes: 1P vs CPU (default, phone-playable), local 2P (desktop
// keyboard, P1 arrows / P2 WASD+F), and online 2P over room codes
// (?net=host / ?net=join&room=CODE) — lockstep pads on the shared seed, the
// #531 law: both boxes run the SAME sim and hash-check every 30 ticks.

import React, { useEffect, useRef, useState } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import Lobby from '../../components/Lobby'
import VirtualControls from '../../components/VirtualControls'
import AttractMessage from '../../components/AttractMessage'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop, recordLiveTick } from '../../utils/gameContract'
import { fitFill } from '../../utils/fitCanvas'
import { createLobby, lobbyRole, relayFromQuery, seatModel } from '../../utils/lobby.js'
import { createLockStep } from '../../utils/lockstep.js'
import { newGame, step, pairCells, fits, ROWS, COLS, GARBAGE, FIXED_DT, POP_FRAMES, DROP_BEAT, LAND_FRAMES, stateHash, idx, winPresentation } from './sim.js'
import { makeCpu, choosePlacement } from './planner.js'
import { CANVAS, PALETTE, orbSprite, championOrb, text, textWidth, stage, wellFrame } from './art.js'
import { SEATS, PAD_DELAY, HASH_EVERY, toWire, assemblePads, hostSeed } from './net.js'

const W = CANVAS.W, H = CANVAS.H
const SIM_MS = FIXED_DT
const CELL = 16
const WELL_Y = 26
const WELL_X0 = 24
const WELL_X1 = W - 24 - COLS * CELL
const MESSAGES = [
    'CHAIN POPS SEND GARBAGE',
    'CLEAR WHILE INCOMING TO COUNTER',
    '4+ SAME COLOR CONNECTS',
    'HARD DROP SLAMS THE STACK',
    'FIRST TO 2 ROUNDS WINS',
]
const PRESS = 'PRESS ANY KEY  ·  1 EASY · 3 HARD CPU · 2 LOCAL 2P'
const CHAIN_SCALE = [0, 4, 7, 12, 16, 19, 24, 28, 31, 36]
const GO_FRAMES = 180 // 3 s of 3-2-1: both online boxes see the countdown before the board moves

const BlobBattleGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [netUi, setNetUi] = useState(null)
    const [desync, setDesync] = useState(false)
    const desyncRef = useRef(false)
    const [rivalGone, setRivalGone] = useState(false)
    const rivalGoneRef = useRef(false)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const overAtRef = useRef(0)

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const setSc = (s) => { screenRef.current = s; setScreen(s) }

        const canvas = document.createElement('canvas')
        canvas.dataset.blobbattleStage = '1'
        canvas.width = W
        canvas.height = H
        canvas.className = 'block'
        canvas.style.imageRendering = 'pixelated'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false

        let gs = null, demo = null
        let mode = 'cpu'                      // cpu | local | online
        let cpuTier = 'normal'                // easy | normal | hard — the arcade ladder (#863)
        let mySeat = 0
        let raf = 0, last = 0, acc = 0
        let seedCounter = (Date.now() >>> 0) ^ 0xb0b5
        const keys1 = { left: false, right: false, down: false, rot: false, drop: false }
        const keys2 = { left: false, right: false, down: false, rot: false, drop: false }
        let shake = 0, flash = 0, toast = 0, toastMsg = '', toastCol = PALETTE.gold
        const chainFx = [0, 0]
        const say = (m, col) => { toastMsg = m; toastCol = col || PALETTE.gold; toast = 110 }

        // ------------------------------------------------------------ online ----
        // #840 lockstep battle on the #1039 shared lobby: ?net=host /
        // ?net=join&room=CODE / ?relay=ws(s)://host — the same join flow, code
        // and waiting room every multiplayer game uses.
        const nq = new URLSearchParams(window.location.search)
        const netRole = lobbyRole(window.location.search)
        const relayUrl = relayFromQuery(window.location.search)
        const net = { active: !!netRole, role: netRole, phase: netRole ? 'idle' : 'off', slot: netRole === 'host' ? 0 : 1, code: '', seats: [0, 1].slice(0, netRole ? 1 : 0), joinHref: '' }
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
        // mirrors of the two pad streams keyed by tick — lockstep owns the wire
        // law (sample once, D ahead, never resample); these hold EXACTLY the
        // bytes each seat sent, so both boxes apply identical pads per well.
        const padMirror = [new Map(), new Map()]
        const ls = createLockStep({
            delay: PAD_DELAY,
            hashEvery: HASH_EVERY,
            send: (m) => {
                if (m.t === 'pad') padMirror[mySeat].set(m.k, m.p)
                if (net.room) net.room.send(m.t, m)
            },
        })
        let stalledTicks = 0
        let countdown = 0 // 3-2-1 go gate (online only): sim frames still counting
        const pushNetUi = () => setNetUi(net.active ? {
            role: net.role, phase: net.phase, code: net.code, slot: net.slot,
            seats: seatModel(SEATS, net.room ? net.room.slots : [net.slot]),
            joinHref: net.joinHref,
            names: ['HOST', 'CHALLENGER'],
        } : null)

        // rival left (#863): the rival's stream dies mid-match. Freeze the
        // board and offer a Return — never a silent stall. The host learns via
        // the roster delta / the relay's 'gone'; the guest whose HOST left only
        // ever sees the socket close, so the transport close is wired too.
        const rivalLeft = () => {
            if (!net.active || screenRef.current !== 'play' || rivalGoneRef.current) return
            rivalGoneRef.current = true
            setRivalGone(true)
            pausedRef.current = true
            pushNetUi()
        }

        const returnToTitle = () => {
            if (!rivalGoneRef.current) return
            rivalGoneRef.current = false
            setRivalGone(false)
            pausedRef.current = false
            setPaused(false)
            countdown = 0
            gs = null
            if (net.role === 'host') {
                // the room lives on: re-open it so a new challenger can join
                if (net.room) net.room.setPhase('waiting')
            } else {
                // the host took the room with them: drop the net, back to the
                // solo cabinet
                net.active = false
                if (net.room) { try { net.room.reset() } catch { /* gone */ } }
                pushNetUi()
            }
            setSc('attract')
        }

        function buildDemo() {
            demo = newGame(0xa11ce, 2)
            demo._cpu1 = makeCpu(0xa11ce)
            demo._cpu2 = makeCpu(0x51d3)
        }

        const handleEvents = (s, audible) => {
            while (s.events.length) {
                const e = s.events.shift()
                if (!audible) continue
                if (e.t === 'rot') audioController.playTone(560, 0.03, 'square', 0.04)
                else if (e.t === 'lock') audioController.playTone(150, 0.03, 'square', 0.05)
                else if (e.t === 'harddrop') audioController.playNoise(0.05, 0.12)
                else if (e.t === 'pop') {
                    // the original walks the pitch UP per chain step: one rising
                    // note per rung of the ladder, not one flat sweep
                    const semi = CHAIN_SCALE[Math.min(e.chain - 1, CHAIN_SCALE.length - 1)]
                    const f = 240 * Math.pow(2, semi / 12)
                    audioController.playSweep(f, f * 1.22, 0.09, 'square', 0.09)
                    chainFx[e.seat] = 40
                } else if (e.t === 'send') {
                    audioController.playSweep(700, 240, 0.18, 'sawtooth', 0.07)
                } else if (e.t === 'counter') {
                    audioController.playTone(660, 0.06, 'square', 0.08)
                    setTimeout(() => audioController.playTone(880, 0.06, 'square', 0.08), 70)
                    setTimeout(() => audioController.playTone(1320, 0.1, 'square', 0.08), 140)
                    say('COUNTER!', PALETTE.good)
                } else if (e.t === 'garbage') {
                    audioController.playNoise(0.12, 0.22)
                    shake = 10
                } else if (e.t === 'topout') {
                    audioController.playNoise(0.3, 0.25)
                    flash = 20
                } else if (e.t === 'round') {
                    audioController.playTone(523, 0.09, 'square', 0.09)
                    setTimeout(() => audioController.playTone(784, 0.14, 'square', 0.09), 100)
                } else if (e.t === 'match') {
                    [0, 4, 7, 12].forEach((semi, i) => setTimeout(() => audioController.playTone(523 * Math.pow(2, semi / 12), 0.16, 'square', 0.1), i * 110))
                } else if (e.t === 'gravity') {
                    // gravity tightened for the next round — a quick, quiet tick
                    // so the mounting pressure is felt, not just read
                    audioController.playTone(1180, 0.03, 'square', 0.05)
                }
            }
        }

        const finish = (s) => {
            if (!s.over) return
            overAtRef.current = performance.now()
            setSc('over')
        }

        const startPlay = (m, seed, tier) => {
            mode = m
            if (tier) cpuTier = tier
            mySeat = net.active ? net.slot : 0
            seedCounter = (seedCounter * 1103515245 + 12345) >>> 0
            gs = newGame(seed === undefined ? seedCounter : seed >>> 0, m === 'local' ? 2 : 1)
            gs._cpu1 = makeCpu(gs.seed)
            gs._cpu2 = makeCpu(gs.seed ^ 0xbeef, cpuTier)
            ls.reset()
            padMirror[0].clear(); padMirror[1].clear()
            stalledTicks = 0
            desyncRef.current = false
            setDesync(false)
            // a fresh start must clear the desync freeze, or a re-joined match
            // sits on the board forever (#863 re-join wedge)
            pausedRef.current = false
            setPaused(false)
            countdown = m === 'online' ? GO_FRAMES : 0
            keys1.left = keys1.right = keys1.down = keys1.rot = keys1.drop = false
            keys2.left = keys2.right = keys2.down = keys2.rot = keys2.drop = false
            setSc('play')
        }

        if (net.active) {
            const lobby = createLobby({
                slug: 'blob-battle',
                cap: SEATS,
                relay: relayUrl,
                makeTransport,
                shareRelay: !!nq.get('relay'),
                onState: (s) => { net.phase = s.phase; net.code = s.code; net.joinHref = s.joinHref; pushNetUi() },
                onRoster: ({ slots }) => { net.seats = slots.slice(); pushNetUi() },
                onJoin: () => pushNetUi(),
                onLeave: () => { rivalLeft(); pushNetUi() },
                onStart: (m) => { startPlay('online', m.seed >>> 0) },
                on: {
                    pad: (m) => {
                        ls.gotPad(m.k | 0, m.p)
                        padMirror[m.s | 0] && padMirror[m.s | 0].set(m.k | 0, m.p)
                    },
                    hs: (m) => {
                        const r = ls.gotHash(m.k | 0, m.h >>> 0)
                        if (r && r.desync !== undefined) { desyncRef.current = true; setDesync(true); pausedRef.current = true }
                    },
                    gone: () => { rivalLeft() },
                },
            })
            net.lobby = lobby
            net.room = lobby.room
            if (net.role === 'host') lobby.open()
            else lobby.join(nq.get('room'))
            pushNetUi()
        }

        const onlineStart = () => {
            if (!net.lobby) return
            net.lobby.start({ seed: hostSeed() })
        }

        // re-join (#863): a desync froze the match; the host re-rolls the seed
        // and re-kicks the pair. Both boxes restart clean on the fresh seed —
        // the guest rides the existing 'go' handler — so a frozen online match
        // no longer means "refresh to replay".
        const rejoin = () => {
            if (!net.room || net.role !== 'host') return
            const seed = hostSeed()
            net.room.send('go', { seed })
            net.phase = 'racing'
            pushNetUi()
            startPlay('online', seed)
        }

        // per-tick pads for both wells, whatever the mode
        const livePads = () => {
            if (mode === 'online') {
                const k = gs.tick
                ls.pumpTo(k + PAD_DELAY, () => toWire(mySeat === 0 ? keys1 : keys2))
                if (!ls.ready(k)) { stalledTicks++; return null }
                stalledTicks = 0
                const pads = assemblePads(padMirror[0], padMirror[1], k)
                if (gs.tick % 120 === 0) { padMirror[0].forEach((_, t) => { if (t < gs.tick - 60) padMirror[0].delete(t) }); padMirror[1].forEach((_, t) => { if (t < gs.tick - 60) padMirror[1].delete(t) }) }
                return pads
            }
            if (mode === 'local') return [{ ...keys1 }, { ...keys2 }]
            return [{ ...keys1 }, gs._cpu2(gs.wells[1])]
        }

        // ------------------------------------------------------------- paint ----
        const orbs = orbSprite(CELL)
        const orbsSmall = orbSprite(8)
        const champ = championOrb(34)

        const paintWell = (s, w, x, seat) => {
            wellFrame(ctx, x, WELL_Y, COLS, ROWS, CELL)
            const slide = w.phase === 'drop' && w.slide.length
                ? new Map(w.slide.map((e) => [idx(e.r, e.c), e.dy * (w.phaseT / DROP_BEAT)]))
                : null
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    const v = w.board[idx(r, c)]
                    if (!v) continue
                    let sc = 1, alpha = 1
                    if (w.popping && w.popping.some(([pr, pc]) => pr === r && pc === c)) {
                        const p = 1 - w.phaseT / POP_FRAMES
                        sc = 1 + Math.sin(p * Math.PI) * 0.18
                        alpha = p > 0.55 ? 1 - (p - 0.55) / 0.45 : 1
                        ctx.strokeStyle = `rgba(255,255,255,${(0.85 * (1 - p)).toFixed(3)})`
                        ctx.lineWidth = 2
                        ctx.beginPath()
                        ctx.arc(x + c * CELL + CELL / 2, WELL_Y + r * CELL + CELL / 2, CELL * 0.5 + p * CELL * 0.9, 0, Math.PI * 2)
                        ctx.stroke()
                        ctx.lineWidth = 1
                    }
                    const off = slide ? slide.get(idx(r, c)) : undefined
                    if (off !== undefined && off !== 0) {
                        // falling trail: the orb sits in its new cell while a ghost
                        // slides off the old one — collapse reads as motion, pixels stay aligned
                        ctx.globalAlpha = 0.5 * (w.phaseT / DROP_BEAT)
                        ctx.drawImage(orbs[v], x + c * CELL, WELL_Y + (r + off) * CELL, CELL, CELL)
                    }
                    ctx.globalAlpha = Math.max(0, alpha)
                    const sz = CELL * sc
                    ctx.drawImage(orbs[v], x + c * CELL - (sz - CELL) / 2, WELL_Y + r * CELL - (sz - CELL) / 2, sz, sz)
                    ctx.globalAlpha = 1
                }
            }
            if (w.pending > 0) {
                // ghost slabs hover at the lip and slam home as the warning beat ends
                const n = Math.min(w.pending, ROWS)
                const slam = w.phase === 'land' ? 1 - w.phaseT / LAND_FRAMES : 0
                const bob = w.phase === 'land' ? 0 : Math.sin(s.tick / 5) * 1.5
                const a = w.phase === 'land' ? 0.35 + 0.4 * slam : (Math.floor(s.tick / 8) % 2 ? 0.5 : 0.3)
                ctx.globalAlpha = a
                for (let rr = 0; rr < n; rr++) {
                    const y = WELL_Y + rr * CELL - n * CELL - bob + slam * n * CELL
                    const holeCol = w.holes[n - 1 - rr]
                    for (let c = 0; c < COLS; c++) {
                        if (slam > 0 && c === holeCol) continue
                        ctx.drawImage(orbs[GARBAGE], x + c * CELL, y, CELL, CELL)
                    }
                }
                ctx.globalAlpha = 1
            }
            if (w.pending > 0 && Math.floor(s.tick / 8) % 2 === 0 && w.phase !== 'land') {
                text(ctx, '<' + w.pending, x + COLS * CELL + 3, WELL_Y + ROWS * CELL - 16, PALETTE.bad, 2)
            }
            if (w.cur && !w.over) {
                // landing ghost for the hard-drop feel
                let gy = w.cur.y
                while (fits(w, w.cur.x, gy + 1, w.cur.rot)) gy++
                if (gy !== w.cur.y) {
                    ctx.globalAlpha = 0.22
                    for (const [r, c] of pairCells(w.cur.x, gy, w.cur.rot)) {
                        if (r < 0 || r >= ROWS) continue
                        ctx.fillStyle = '#ffffff'
                        ctx.fillRect(x + c * CELL + 2, WELL_Y + r * CELL + 2, CELL - 4, CELL - 4)
                    }
                    ctx.globalAlpha = 1
                }
                const cells = pairCells(w.cur.x, w.cur.y, w.cur.rot)
                ctx.drawImage(orbs[w.cur.c1], x + cells[0][1] * CELL, WELL_Y + cells[0][0] * CELL, CELL, CELL)
                ctx.drawImage(orbs[w.cur.c2], x + cells[1][1] * CELL, WELL_Y + cells[1][0] * CELL, CELL, CELL)
            }
            if (chainFx[seat] > 0) {
                if (w.chain >= 2) {
                    const t = String(w.chain)
                    const big = chainFx[seat] > 32
                    const sc = big ? 5 : 4
                    const cx = x + (COLS * CELL) / 2 - textWidth(t, sc) / 2
                    text(ctx, t, cx, WELL_Y + 60 - (big ? 4 : 0), seat === 0 ? PALETTE.gold : PALETTE.good, sc)
                    text(ctx, 'CHAIN', x + (COLS * CELL) / 2 - textWidth('CHAIN', 2) / 2, WELL_Y + 60 + sc * 5 + 4, seat === 0 ? PALETTE.gold : PALETTE.good, 2)
                }
                chainFx[seat]--
            }
            if (w.next && !w.over) {
                const px = seat === 0 ? x - 20 : x + COLS * CELL + 4
                text(ctx, 'NEXT', px, WELL_Y, PALETTE.dim, 1)
                ctx.globalAlpha = 0.9
                ctx.drawImage(orbsSmall[w.next[0]], px, WELL_Y + 8, 8, 8)
                ctx.drawImage(orbsSmall[w.next[1]], px + 8, WELL_Y + 8, 8, 8)
                ctx.globalAlpha = 1
            }
        }

        const paintCenter = (s) => {
            const cx = W / 2
            text(ctx, 'BLOB BATTLE', (W - textWidth('BLOB BATTLE', 3)) / 2, 6, PALETTE.ink, 3)
            text(ctx, 'VS', cx - textWidth('VS', 4) / 2, WELL_Y + 40, Math.floor(s.tick / 20) % 2 ? PALETTE.gold : PALETTE.bad, 4)
            // round pips: best of 3
            for (let i = 0; i < 2; i++) {
                const px = cx + (i === 0 ? -26 : 12)
                for (let k = 0; k < 2; k++) {
                    ctx.fillStyle = s.wells[i].rounds > k ? PALETTE.gold : 'rgba(125,134,173,0.4)'
                    ctx.beginPath()
                    ctx.arc(px + k * 10, WELL_Y + 80, 3.5, 0, Math.PI * 2)
                    ctx.fill()
                }
            }
            const names = mode === 'online'
                ? (mySeat === 0 ? ['YOU', 'RIVAL'] : ['RIVAL', 'YOU'])
                : mode === 'local' ? ['P1', 'P2'] : ['YOU', 'CPU']
            text(ctx, names[0], WELL_X0, WELL_Y + ROWS * CELL + 6, PALETTE.dim, 1)
            text(ctx, names[1], WELL_X1, WELL_Y + ROWS * CELL + 6, PALETTE.dim, 1)
            text(ctx, String(s.wells[0].score).padStart(6, '0'), WELL_X0 + 30, WELL_Y + ROWS * CELL + 4, PALETTE.ink, 2)
            text(ctx, String(s.wells[1].score).padStart(6, '0'), WELL_X1 - textWidth(String(s.wells[1].score).padStart(6, '0'), 2), WELL_Y + ROWS * CELL + 4, PALETTE.ink, 2)
            text(ctx, 'ROUND ' + s.round, cx - textWidth('ROUND ' + s.round, 1) / 2, WELL_Y + 96, PALETTE.dim, 1)
            if (mode === 'online') {
                text(ctx, 'ROOM ' + net.code, cx - textWidth('ROOM ' + net.code, 1) / 2, H - 12, PALETTE.dim, 1)
                if (stalledTicks > 30) text(ctx, 'SYNC...', cx - textWidth('SYNC...', 2) / 2, WELL_Y + 116, PALETTE.bad, 2)
            }
        }

        // the result podium (#863): the frozen board dims, the crowned winner
        // rises on a gold block, the loser's well tips and spills garbage.
        const paintWin = (s) => {
            const p = winPresentation(s, mode, mySeat)
            ctx.fillStyle = 'rgba(6,6,20,0.82)'
            ctx.fillRect(0, 0, W, H)
            // a clean panel behind the podium: the center (VS column) reads, the
            // side wells stay visible as the final board
            ctx.fillStyle = 'rgba(8,8,24,0.9)'
            ctx.fillRect(116, 20, 136, 202)
            const cx = W / 2
            // winner: gold podium block, center; the crowned champion orb on top
            const bw = 44, bh = 60, by = 118
            const bx = cx - bw / 2
            ctx.fillStyle = 'rgba(255,210,60,0.18)'
            ctx.fillRect(bx, by, bw, bh)
            ctx.strokeStyle = PALETTE.gold
            ctx.lineWidth = 2
            ctx.strokeRect(bx, by, bw, bh)
            ctx.lineWidth = 1
            text(ctx, '1', cx - textWidth('1', 2) / 2, by + 34, PALETTE.gold, 2)
            ctx.drawImage(champ, cx - champ.width / 2, 75, champ.width, champ.height)
            // loser: short block on their own side, tipped, the well spilled
            const lbw = 40, lbh = 42
            const loserLeft = p.loser === 0
            const lbx = loserLeft ? cx - bw - 8 - lbw : cx + bw + 8
            const lby = 178 - lbh
            ctx.save()
            ctx.translate(lbx + lbw / 2, lby + lbh / 2)
            ctx.rotate(loserLeft ? 0.12 : -0.12)
            ctx.fillStyle = 'rgba(90,100,120,0.22)'
            ctx.fillRect(-lbw / 2, -lbh / 2, lbw, lbh)
            ctx.strokeStyle = PALETTE.dim
            ctx.strokeRect(-lbw / 2, -lbh / 2, lbw, lbh)
            text(ctx, '2', -textWidth('2', 2) / 2, -lbh / 2 + 7, PALETTE.dim, 2)
            ctx.restore()
            // the spilled well: grey garbage orbs rolling out at the loser's base
            const sx0 = loserLeft ? lbx - 2 : lbx + lbw - 26
            for (let i = 0; i < 4; i++) ctx.drawImage(orbs[GARBAGE], sx0 + i * 9, 182 + (i % 2 ? 4 : 0), 14, 14)
            // headline + the podium stats, in the house font
            const col = p.youWin ? PALETTE.good : PALETTE.bad
            text(ctx, p.title, cx - textWidth(p.title, 4) / 2, 34, col, 4)
            const rr = `ROUNDS ${p.rounds[0]}-${p.rounds[1]}`
            text(ctx, rr, cx - textWidth(rr, 1) / 2, 60, PALETTE.dim, 1)
            text(ctx, 'ENTER / R REMATCH', cx - textWidth('ENTER / R REMATCH', 1) / 2, 184, PALETTE.dim, 1)
            if (Math.floor(performance.now() / 420) % 2 === 0) text(ctx, 'TAP / ANY KEY', cx - textWidth('TAP / ANY KEY', 2) / 2, 194, PALETTE.ink, 2)
        }

        const paint = () => {
            ctx.save()
            if (shake > 0) { ctx.translate((Math.random() * 2 - 1) * shake * 0.6, (Math.random() * 2 - 1) * shake * 0.6); shake-- }
            ctx.drawImage(stage(), 0, 0)
            const s = screenRef.current === 'attract' ? demo : gs
            if (s) {
                paintWell(s, s.wells[0], WELL_X0, 0)
                paintWell(s, s.wells[1], WELL_X1, 1)
                paintCenter(s)
                if (screenRef.current === 'over' && gs) paintWin(gs)
            }
            if (toast > 0) {
                const a = Math.min(1, toast / 40)
                ctx.globalAlpha = a
                text(ctx, toastMsg, (W - textWidth(toastMsg, 3)) / 2, WELL_Y + 100, toastCol, 3)
                ctx.globalAlpha = 1
                toast--
            }
            if (screenRef.current === 'play' && countdown > 0) {
                // 3-2-1 on both boxes before the first blob moves (#863)
                const n = String(Math.ceil(countdown / 60))
                text(ctx, n, (W - textWidth(n, 6)) / 2, WELL_Y + 58, PALETTE.gold, 6)
            }
            if (flash > 0) {
                ctx.fillStyle = `rgba(255,80,110,${(flash / 20) * 0.35})`
                ctx.fillRect(0, 0, W, H)
                flash--
            }
            ctx.restore()
        }

        // ------------------------------------------------------------- frame ----
        const frame = (ts) => {
            raf = requestAnimationFrame(frame)
            if (!last) last = ts
            const ft = Math.min(ts - last, 250)
            last = ts
            if (pausedRef.current) return
            if (contractHoldsLoop()) { acc = 0 } else {
                acc += ft
                while (acc >= SIM_MS) {
                    acc -= SIM_MS
                    if (screenRef.current === 'attract' && demo) {
                        step(demo, [demo._cpu1(demo.wells[0]), demo._cpu2(demo.wells[1])])
                        handleEvents(demo, false)
                        if (demo.over) buildDemo()
                    } else if (screenRef.current === 'play' && gs && !gs.over) {
                        if (countdown > 0) {
                            countdown--
                        } else {
                            const pads = livePads()
                            if (pads) {
                                step(gs, pads)
                                recordLiveTick([{ left: pads[0].left, right: pads[0].right, down: pads[0].down, a: pads[0].rot, b: pads[0].drop },
                                    { left: pads[1].left, right: pads[1].right, down: pads[1].down, a: pads[1].rot, b: pads[1].drop }])
                                if (mode === 'online') {
                                    if (gs.tick % HASH_EVERY === 0) {
                                        const r = ls.hash(gs.tick, stateHash(gs))
                                        if (r && r.desync !== undefined) { desyncRef.current = true; setDesync(true); pausedRef.current = true }
                                    }
                                    ls.prune(gs.tick)
                                }
                                handleEvents(gs, true)
                                finish(gs)
                            }
                        }
                    }
                }
            }
            paint()
        }

        // ------------------------------------------------------------- input ----
        const ROT_KEYS = new Set(['ArrowUp', 'KeyX', 'Space'])
        const DROP_KEYS = new Set(['KeyB', 'KeyC'])
        const P2 = { KeyA: 'left', KeyD: 'right', KeyS: 'down', KeyW: 'rot', KeyF: 'drop' }

        const startKey = (code) => {
            if (net.active) {
                if (net.role === 'host' && net.phase === 'waiting') onlineStart()
                return
            }
            if (code === 'Digit2') { startPlay('local'); return }
            startPlay('cpu', undefined, code === 'Digit1' ? 'easy' : code === 'Digit3' ? 'hard' : 'normal')
        }

        const onDown = (e) => {
            const code = e.shiftKey && e.code === 'Slash' ? 'Question' : e.code
            if (code === 'Question') {
                if (screenRef.current === 'play') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current) }
                return
            }
            if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Space'].includes(e.code)) e.preventDefault()
            if (P2[e.code] && screenRef.current === 'play' && mode === 'local') keys2[P2[e.code]] = true
            const sc = screenRef.current
            if (sc === 'attract') { startKey(code); return }
            if (sc === 'over') {
                if (performance.now() - overAtRef.current < 800) return
                if (code === 'Enter' || code === 'KeyR' || code === 'Space') {
                    if (net.active) { if (net.role === 'host') onlineStart(); return }
                    startPlay(mode === 'local' ? 'local' : 'cpu')
                    return
                }
                setSc('attract'); return
            }
            if (desyncRef.current && net.active && net.role === 'host' && (code === 'Space' || code === 'Enter')) { rejoin(); return }
            if (rivalGoneRef.current && net.active && (code === 'Space' || code === 'Enter')) { returnToTitle(); return }
            if (pausedRef.current || desyncRef.current) return
            if (code === 'ArrowLeft') keys1.left = true
            else if (code === 'ArrowRight') keys1.right = true
            else if (code === 'ArrowDown') keys1.down = true
            else if (ROT_KEYS.has(code)) keys1.rot = true
            else if (DROP_KEYS.has(code)) keys1.drop = true
        }
        const onUp = (e) => {
            if (e.code === 'ArrowLeft') keys1.left = false
            else if (e.code === 'ArrowRight') keys1.right = false
            else if (e.code === 'ArrowDown') keys1.down = false
            else if (ROT_KEYS.has(e.code)) keys1.rot = false
            else if (DROP_KEYS.has(e.code)) keys1.drop = false
            if (P2[e.code]) keys2[P2[e.code]] = false
        }
        const onPointer = () => {
            const sc = screenRef.current
            if (sc === 'attract') { if (!net.active) startPlay('cpu'); else if (net.role === 'host' && net.phase === 'waiting') onlineStart(); return }
            if (sc === 'play' && desyncRef.current && net.active && net.role === 'host') { rejoin(); return }
            if (sc === 'play' && rivalGoneRef.current && net.active) { returnToTitle(); return }
            if (sc === 'over' && performance.now() - overAtRef.current >= 800) startPlay(mode === 'online' ? 'cpu' : mode)
        }

        window.addEventListener('keydown', onDown)
        window.addEventListener('keyup', onUp)
        window.addEventListener('pointerdown', onPointer)

        const resize = () => {
            const r = wrap.getBoundingClientRect()
            if (!r.width || !r.height) return
            const z = fitFill(W, H, r.width - 8, r.height - 60)
            canvas.style.width = `${W * z}px`
            canvas.style.height = `${H * z}px`
        }
        window.addEventListener('resize', resize)

        buildDemo()
        resize()
        raf = requestAnimationFrame(frame)

        // ---------------------------------------------------------- DEV hook ----
        if (import.meta.env.DEV) {
            window.__blobbattleTest = {
                probe: () => {
                    const s = screenRef.current === 'attract' ? demo : gs
                    return {
                        screen: screenRef.current, mode, cpuTier, over: s.over, winner: s.winner,
                        tick: s.tick, round: s.round, rounds: [s.wells[0].rounds, s.wells[1].rounds],
                        scores: [s.wells[0].score, s.wells[1].score],
                        chains: [s.wells[0].chain, s.wells[1].chain],
                        pending: [s.wells[0].pending, s.wells[1].pending],
                        cur: s.wells[0].cur ? { x: s.wells[0].cur.x, y: s.wells[0].cur.y, rot: s.wells[0].cur.rot } : null,
                        next: [s.wells[0].next, s.wells[1].next],
                        locks0: s.wells[0].locks, locks1: s.wells[1].locks,
                        hash: stateHash(s),
                        countdown,
                        desync: desyncRef.current,
                        rivalGone: rivalGoneRef.current,
                        netPhase: net.active ? net.phase : 'off',
                        netCode: net.active ? net.code : '',
                        seats: net.active && net.room ? net.room.slots.slice() : [],
                    }
                },
                start: (m = 'cpu', sd, tier) => startPlay(m, sd, tier),
                board: (seat) => Array.from((screenRef.current === 'attract' ? demo : gs).wells[seat].board),
                hash: () => (gs ? stateHash(gs) : 0),
                // desync drill seam (blobnet): flip this box's well-0 board so
                // the next hash checkpoint catches the divergence
                corrupt: () => {
                    if (gs && !gs.over) { gs.wells[0].board.fill(1); return 'well 0 flipped' }
                    return 'no game'
                },
                // win-screen seam (#863): force a seat to have taken the match so
                // the result podium (crowned winner, spilled loser) can be
                // photographed / drilled on demand
                finish: (seat) => {
                    if (!gs) return 'no game'
                    seat = seat === 0 ? 0 : 1
                    gs.over = true
                    gs.winner = seat
                    gs.wells[seat].rounds = 2
                    overAtRef.current = performance.now()
                    setSc('over')
                    return 'forced seat ' + seat + ' to take the match'
                },
            }
            mountDbg({
                title: 'BLOB BATTLE',
                getState: () => gs ? [
                    `mode=${mode} round=${gs.round} rounds=${gs.wells[0].rounds}-${gs.wells[1].rounds} tick=${gs.tick} over=${gs.over}`,
                    `p1 ${gs.wells[0].score} chain=${gs.wells[0].chain} in=${gs.wells[0].pending} | p2 ${gs.wells[1].score} chain=${gs.wells[1].chain} in=${gs.wells[1].pending}`,
                ] : ['no game'],
                actions: [
                    { label: 'GARBAGE +2 P1', run: () => { if (!gs) return 'no game'; gs.wells[0].pending += 2; gs.wells[0].holes.push(0, 1); return 'two rows queued against P1' } },
                    { label: 'SEED POP P1', run: () => {
                        if (!gs) return 'no game'
                        const w = gs.wells[0]
                        for (let c = 0; c < 4; c++) w.board[idx(ROWS - 1, c)] = 3
                        return 'a four-pop seeded on the P1 floor'
                    } },
                    { label: 'PLAN P1', run: () => { if (!gs) return 'no game'; const p = choosePlacement(gs.wells[0]); return p ? `best: rot${p.rot} col${p.x} score ${Math.round(p.score)}` : 'no plan' } },
                ],
            })
            exposeGame({
                id: 'blob-battle',
                players: 2,
                buttons: ['left', 'right', 'down', 'a', 'b'],
                reset: (seed, players) => {
                    startPlay(players > 1 ? 'local' : 'cpu', seed >>> 0)
                    if (import.meta.env.DEV) keys1.left = keys1.right = keys1.down = keys1.rot = keys1.drop = false
                },
                tick: (pad, pads) => {
                    if (gs.over) { gs.tick += 1; return }
                    const p1 = pads && pads[0] || pad || {}
                    const p2 = pads && pads[1] || (mode === 'cpu' ? gs._cpu2(gs.wells[1]) : {})
                    step(gs, [
                        { left: !!p1.left, right: !!p1.right, down: !!p1.down, rot: !!p1.a, drop: !!p1.b },
                        { left: !!p2.left, right: !!p2.right, down: !!p2.down, rot: !!p2.a, drop: !!p2.b },
                    ])
                    handleEvents(gs, false)
                },
                state: () => ({
                    tick: gs.tick, score: gs.wells[0].score, done: !!gs.over,
                    seed: gs.seed, round: gs.round, players: mode === 'local' ? 2 : 1,
                    cpuTier,
                    countdown,
                    winner: gs.winner, rounds: [gs.wells[0].rounds, gs.wells[1].rounds],
                    scores: [gs.wells[0].score, gs.wells[1].score],
                    hash: stateHash(gs),
                }),
                canvas: () => canvas,
            })
        }

        return () => {
            if (import.meta.env.DEV) { if (window.__blobbattleTest) delete window.__blobbattleTest; unmountDbg(); unexposeGame() }
            window.removeEventListener('keydown', onDown)
            window.removeEventListener('keyup', onUp)
            window.removeEventListener('pointerdown', onPointer)
            window.removeEventListener('resize', resize)
            cancelAnimationFrame(raf)
            if (net.room) { try { net.room.reset() } catch { /* gone */ } }
            audioController.stopMusic()
            canvas.remove()
        }
    }, [])

    const handleResume = () => { setPaused(false); pausedRef.current = false }
    const play = screen === 'play'

    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden select-none" style={{ touchAction: 'none' }}>
            <div ref={stageRef} className="absolute inset-0 flex items-center justify-center" />

            {screen === 'attract' && !netUi && (
                <div className="absolute inset-0 bg-black/55 flex flex-col items-center justify-center text-center px-6 pointer-events-none">
                    <AttractMessage className="mb-6 text-pink-200/80" messages={MESSAGES} />
                    <p className="text-lg font-mono font-bold animate-pulse text-pink-300">{PRESS}</p>
                </div>
            )}

            {netUi && netUi.phase !== 'racing' && screen === 'attract' && (
                <Lobby
                    state={netUi}
                    title="CHALLENGE"
                    names={netUi.names}
                    startHint="PRESS SPACE TO DROP THE FIRST BLOB"
                    accent={{
                        text: 'text-pink-100',
                        dim: 'text-pink-300/70',
                        live: 'border-pink-300/50 text-pink-100',
                        warn: '#ffd23f',
                        codeGlow: { textShadow: '3px 3px 0 #000' },
                        btn: 'border-pink-300/60 text-pink-100',
                        qr: '#4d0021',
                        qrFrame: '#f9a8d4',
                    }}
                />
            )}

            {desync && (
                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-red-400 font-mono font-black text-3xl text-center px-6">
                    DESYNC &mdash; SIMS DISAGREED
                    {netUi && netUi.role === 'host' ? (
                        <p className="text-sm font-normal text-red-200/80 mt-3 leading-relaxed">
                            a hash mismatch froze the match.<br />
                            <span className="text-base text-pink-200 animate-pulse">PRESS SPACE / TAP TO REJOIN &mdash; YOUR RIVAL FOLLOWS</span>
                        </p>
                    ) : netUi ? (
                        <p className="text-sm font-normal text-red-200/80 mt-3 animate-pulse">WAITING FOR THE HOST TO REJOIN&hellip;</p>
                    ) : (
                        <p className="text-sm font-normal text-red-200/70 mt-2">a hash mismatch froze the match; refresh to replay</p>
                    )}
                </div>
            )}

            {rivalGone && (
                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-red-400 font-mono font-black text-3xl text-center px-6">
                    RIVAL LEFT
                    <p className="text-sm font-normal text-red-200/80 mt-3 leading-relaxed">
                        the board is frozen mid-match.<br />
                        <span className="text-base text-pink-200 animate-pulse">PRESS SPACE / TAP TO RETURN</span>
                    </p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find((g) => g.label === 'BLOB BATTLE')} onResume={handleResume} />}
            <VirtualControls visible={play && !paused && !netUi} secondAction={{ label: 'DROP', code: 'KeyB' }} />
        </div>
    )
}

export default BlobBattleGame
