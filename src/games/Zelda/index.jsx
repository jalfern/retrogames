import React, { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { audioController } from '../../utils/AudioController'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { makeGame, step } from './sim'
import { screenOf, TILE, COLS, ROWS } from './world'

// =====================================================================
// THE LEGEND OF ZELDA (demo) — 3x3 overworld, bomb shop, Level-1 hall.
// sim.js is a pure step(state, input); this file only reads state and
// draws it. Every tile, sprite and note is generated here (no assets).
// =====================================================================

const W = 256
const PLAY_H = 176
const H = 240
const HUD = H - PLAY_H

const SAND = '#c89858'
const SAND_D = '#a87038'
const DK_BG = '#301010'

function tileColor(ch, kind, t, c, r) {
    if (ch === 'W') return `hsl(215,85%,${38 + 8 * Math.sin((t + c * 4 + r * 2) * 0.06)}%)`
    return null
}

const NES = {
    '#': ['#585858', '#282828'], R: ['#783818', '#502008'], x: ['#6868a0', '#383868'],
    g: ['#a8a8a8', '#707070'], C: ['#404040', '#000000'], D: ['#783818', '#000000'],
    S: ['#783818', '#a04040'], T: ['#887050', '#584028'],
}

function drawTile(ctx, ch, x, y, kind, t, c, r) {
    const over = kind === 'over'
    ctx.fillStyle = over ? (SAND) : (kind === 'shop' ? '#382008' : DK_BG)
    ctx.fillRect(x, y, TILE, TILE)
    if (over && (c + r * COLS) % 3 === 0) { ctx.fillStyle = SAND_D; ctx.fillRect(x + 2, y + 2, 3, 3) }
    const w = NES[ch]
    if (w) {
        ctx.fillStyle = w[0]; ctx.fillRect(x, y, TILE, TILE)
        ctx.fillStyle = w[1]
        if (ch === '#') { ctx.fillRect(x, y + 11, TILE, 5); ctx.fillRect(x + 12, y, 4, 11) }
        if (ch === 'R') { ctx.fillRect(x + 2, y + 2, 4, 4); ctx.fillRect(x + 9, y + 8, 5, 4) }
        if (ch === 'x') { ctx.fillRect(x, y + 12, TILE, 4); ctx.fillRect(x + 11, y, 5, 12) }
        if (ch === 'g') { ctx.fillRect(x + 3, y + 2, 10, 12); ctx.fillStyle = '#38200a'; ctx.fillRect(x + 6, y + 6, 4, 6) }
        if (ch === 'C') { ctx.beginPath(); ctx.arc(x + 8, y + 16, 9, Math.PI, 0); ctx.fill() }
        if (ch === 'D') { ctx.fillStyle = '#000'; ctx.fillRect(x + 2, y + 3, 12, 13); ctx.fillStyle = '#f8d878'; ctx.fillRect(x + 7, y + 9, 2, 2) }
        if (ch === 'S') { ctx.fillStyle = '#000'; ctx.fillRect(x + 2, y + 4, 12, 12) }
        if (ch === 'T') { ctx.fillStyle = '#301808'; ctx.fillRect(x + 6, y + 1, 3, 14); ctx.fillRect(x + 3, y + 7, 3, 3) }
    }
    const wc = tileColor(ch, kind, t, c, r)
    if (wc) { ctx.fillStyle = wc; ctx.fillRect(x, y, TILE, TILE) }
    if (ch === 'f') {
        ctx.fillStyle = '#00a800'; ctx.fillRect(x + 7, y + 7, 2, 7)
        ctx.fillStyle = (t >> 4) % 2 ? '#f8d800' : '#f85800'; ctx.fillRect(x + 5, y + 3, 6, 5)
        ctx.fillStyle = '#f8f8f8'; ctx.fillRect(x + 7, y + 5, 2, 2)
    }
    if (ch === ',') { ctx.fillStyle = '#00a800'; ctx.fillRect(x + 3, y + 10, 2, 5); ctx.fillRect(x + 7, y + 8, 2, 7); ctx.fillRect(x + 11, y + 10, 2, 5) }
    if (ch === 'F') { ctx.fillStyle = '#f8d800'; ctx.fillRect(x + 4, y + 4, 8, 9); ctx.fillRect(x + 6, y + 2, 4, 2); ctx.fillStyle = '#a85000'; ctx.fillRect(x + 6, y + 13, 4, 3) }
}

function drawLink(ctx, s) {
    const x = Math.round(s.px + 3); const y = Math.round(s.py + 1)
    if (s.dieT) { ctx.globalAlpha = s.dieT % 8 < 4 ? 1 : 0.3 }
    ctx.fillStyle = '#00a800'; ctx.fillRect(x, y + 6, 10, 9)
    ctx.fillStyle = '#f8b800'; ctx.fillRect(x + 1, y, 8, 6)
    ctx.fillStyle = '#00a800'; ctx.fillRect(x - 1, y - 3, 12, 4)
    ctx.fillStyle = '#000'; const eo = s.dir === 'left' ? -1 : s.dir === 'right' ? 2 : 1
    if (s.dir !== 'up') { ctx.fillRect(x + 2 + eo, y + 2, 1, 2); ctx.fillRect(x + 6 + eo, y + 2, 1, 2) }
    if (s.swing) {
        const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[s.swingDir]
        const prog = Math.sin((s.swing / 12) * Math.PI)
        const len = 6 + 14 * prog
        ctx.fillStyle = '#f8f8f8'
        const bx = x + 5 + dx * 8; const by = y + 8 + dy * 8
        if (dx) ctx.fillRect(Math.min(bx, bx + dx * len), by - 1, Math.abs(len), 3)
        else ctx.fillRect(bx - 1, Math.min(by, by + dy * len), 3, Math.abs(len))
    }
    ctx.globalAlpha = 1
}

const E_COL = {
    octorok: '#d82800', blueoc: '#0058f8', moblin: '#8850f8', tektite: '#00a800',
    keese: '#503080', zol: '#00e8d8', gel: '#00b8a8', stalfos: '#d8d8c8',
    dog: '#f8f8f8', aquamentus: '#00b800',
}

function drawEnemy(ctx, e, t) {
    const x = Math.round(e.x); const y = Math.round(e.y)
    ctx.fillStyle = E_COL[e.type] || '#f8d878'
    if (e.type === 'aquamentus') {
        const bob = Math.sin(t * 0.05) * 3
        ctx.fillRect(x - 4, y - 6 + bob, 24, 20)
        ctx.fillStyle = '#005800'; ctx.fillRect(x + 2, y - 12 + bob, 12, 8)
        ctx.fillStyle = '#f8d800'; ctx.fillRect(x + 4, y - 2 + bob, 2, 2); ctx.fillRect(x + 10, y - 2 + bob, 2, 2)
        ctx.fillStyle = '#d82800'; if (t % 40 < 6) ctx.fillRect(x + 6, y + 4 + bob, 4, 2)
        return
    }
    if (e.type === 'keese') { const flap = (t >> 2) % 2 ? 3 : 0; ctx.fillRect(x + 1, y + 4, 14, 6); ctx.fillRect(x - 1, y + 2 - flap, 4, 3); ctx.fillRect(x + 13, y + 2 - flap, 4, 3); return }
    if (e.type === 'tektite') { const hop = Math.round(e.hop * 6); ctx.fillRect(x + 3, y + 3 - hop, 10, 8); ctx.fillStyle = '#f8d800'; ctx.fillRect(x + 5, y + 5 - hop, 2, 2); ctx.fillStyle = '#e8e8a0'; ctx.fillRect(x - 1, y + 12 - Math.round(hop * 0.4), 3, 4); ctx.fillRect(x + 14, y + 12 - Math.round(hop * 0.4), 3, 4); return }
    if (e.type === 'zol' || e.type === 'gel') {
        const sq = Math.abs(Math.sin(e.t * 0.12))
        const hh = (e.type === 'zol' ? 12 : 8)
        ctx.fillRect(x + 2, y + 16 - hh - Math.round(sq * 2), 12, hh + Math.round(sq * 2))
        ctx.fillStyle = '#000'; ctx.fillRect(x + 5, y + 16 - hh, 2, 2); ctx.fillRect(x + 9, y + 16 - hh, 2, 2); return
    }
    if (e.type === 'moblin') { ctx.fillRect(x + 3, y + 2, 10, 12); ctx.fillStyle = '#583000'; ctx.fillRect(x + 3, y + 14, 4, 3); ctx.fillRect(x + 9, y + 14, 4, 3); ctx.fillStyle = '#e8e8e8'; ctx.fillRect(x + (e.dir === 'left' ? -5 : 15), y + 6, 6, 1); return }
    const wob = e.run ? Math.round(Math.sin(e.t * 0.4) * 1.5) : 0
    ctx.fillRect(x + 2, y + 3 + wob, 12, 11)
    ctx.fillStyle = '#000'; ctx.fillRect(x + 4, y + 6, 2, 2); ctx.fillRect(x + 9, y + 6, 2, 2)
    if (e.type === 'blueoc' || e.type === 'octorok') { ctx.fillStyle = E_COL[e.type]; ctx.fillRect(x + 6, y + 1, 4, 3) }
}

function drawItem(ctx, it, t) {
    const x = Math.round(it.x + 3); const y = Math.round(it.y + 4)
    if (it.kind === 'heart') { const b = (t >> 3) % 2; ctx.fillStyle = '#f80000' + ''; ctx.fillRect(x, y + b * 0, 10, 7); ctx.fillRect(x + 1, y - 2, 3, 3); ctx.fillRect(x + 6, y - 2, 3, 3); ctx.fillStyle = '#f8a8a8'; ctx.fillRect(x + 1, y + 1, 2, 2) }
    else if (it.kind === 'rupee') { ctx.fillStyle = (t >> 4) % 2 ? '#00d800' : '#00a800'; ctx.fillRect(x + 2, y - 3, 6, 13); ctx.fillRect(x, y, 10, 7) }
    else if (it.kind === 'container') { ctx.fillStyle = '#f8d800'; ctx.fillRect(x - 2, y - 4, 14, 14); ctx.fillStyle = '#a85000'; ctx.fillRect(x + 1, y + 2, 8, 4); ctx.fillStyle = '#f85800'; ctx.fillRect(x + 5, y - 1, 2, 2) }
}

function drawShot(ctx, q) {
    ctx.fillStyle = q.kind === 'magic' ? '#f8d800' : q.kind === 'spear' ? '#e8e8e8' : '#a0a0a0'
    if (q.kind === 'magic') { ctx.fillRect(q.x - 4, q.y - 2, 8, 5); ctx.fillStyle = '#f85800'; ctx.fillRect(q.x - 2, q.y - 1, 4, 3) }
    else ctx.fillRect(q.x - 3, q.y - 3, 6, 6)
}

function drawHud(ctx, s) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, PLAY_H, W, HUD)
    ctx.fillStyle = '#f8f8f8'
    ctx.font = '8px monospace'
    ctx.fillText('LIFE', 8, 188)
    for (let i = 0; i < Math.ceil(s.maxHearts / 2); i++) {
        const v = s.hearts - i * 2
        ctx.fillStyle = v >= 2 ? '#f80000' : v === 1 ? '#a00000' : '#400000'
        const x = 8 + (i % 8) * 12; const y = 194 + Math.floor(i / 8) * 12
        ctx.fillRect(x + 1, y + 1, 8, 5); ctx.fillRect(x + 1, y - 1, 3, 3); ctx.fillRect(x + 6, y - 1, 3, 3)
    }
    ctx.fillStyle = '#f8f8f8'; ctx.fillText('MAP', 8, 226)
    // minimap 3x3 + interiors
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
        const cur = s.scr === `${c},${r}`
        ctx.fillStyle = cur ? '#f8d800' : '#585858'
        ctx.fillRect(34 + c * 8, 218 + r * 6, 6, 4)
    }
    const it = s.scr
    if (it.startsWith('D') || it.startsWith('CAVE') || it === 'SHOP') { ctx.fillStyle = '#f85800'; ctx.fillText('·INT·', 34, 238) }
    ctx.fillStyle = '#f8f8f8'
    ctx.fillText('RUPEE', 100, 190); ctx.fillStyle = '#00d800'; ctx.fillRect(102, 194, 6, 9)
    ctx.fillStyle = '#f8f8f8'; ctx.fillText(String(s.rupees), 112, 200)
    ctx.fillText('BOMB', 100, 214); ctx.fillStyle = '#a0a0a0'; ctx.beginPath(); ctx.arc(105, 222, 4, 0, 7); ctx.fill()
    ctx.fillStyle = '#f8f8f8'; ctx.fillText(String(s.bombs), 112, 226)
    ctx.fillText('RING', 160, 190); ctx.fillStyle = '#f858f8'
    ctx.beginPath(); ctx.arc(166, 222, 5, 0, 7); ctx.fill()
    ctx.fillStyle = '#585858'; ctx.fillRect(174, 190, 78, 8)
    ctx.fillStyle = '#f8f8f8'
    const scr = screenOf(s.scr)
    ctx.fillText((scr.name || '').slice(0, 12), 174, 206)
    ctx.fillText(s.flags.sword ? 'BR:MASTER SWORD' : 'BR : - - - - - -', 174, 218)
    ctx.fillText(s.flags.bombsTaken || s.flags.bought ? 'IT:BOMB' : 'IT : - - - -', 174, 230)
}

export default function Zelda() {
    const canvasRef = useRef(null)
    const navigate = useNavigate()
    const gameRef = useRef(null)
    const stateRef = useRef({ screen: 'attract' })
    const keysRef = useRef({})

    useEffect(() => {
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false
        const game = makeGame()
        gameRef.current = game
        const g = game
        const keys = keysRef.current
        let raf = 0
        let acc = 0
        let last = performance.now()
        let wipe = 0
        let msg = null

        const sfx = (evs) => {
            for (const ev of evs) {
                if (ev.e === 'swing') audioController.playSweep(880, 1600, 0.06, 'square', 0.05)
                if (ev.e === 'hurt') audioController.playSweep(300, 90, 0.25, 'sawtooth', 0.1)
                if (ev.e === 'kill') audioController.playNoise(0.1, 0.12)
                if (ev.e === 'rupee') audioController.playTone(1320, 0.06, 'square', 0.08)
                if (ev.e === 'heart') audioController.playSweep(660, 990, 0.1, 'square', 0.08)
                if (ev.e === 'secret' || ev.e === 'boom') audioController.playNoise(0.35, 0.2)
                if (ev.e === 'ding') audioController.playTone(1760, 0.04, 'triangle', 0.08)
                if (ev.e === 'give') audioController.playSweep(523, 1046, 0.3, 'square', 0.09)
                if (ev.e === 'buy') audioController.playTone(990, 0.08, 'square', 0.08)
                if (ev.e === 'talkStart') audioController.playTone(740, 0.05, 'square', 0.06)
                if (ev.e === 'wipe') { wipe = 36; audioController.playSweep(900, 200, 0.2, 'triangle', 0.06) }
                if (ev.e === 'bossdown') audioController.playNoise(0.6, 0.25)
                if (ev.e === 'container') audioController.playSweep(440, 1320, 0.4, 'square', 0.1)
                if (ev.e === 'triforce') audioController.playSweep(260, 2100, 0.8, 'square', 0.12)
                if (ev.e === 'die') audioController.playSweep(400, 40, 0.7, 'sawtooth', 0.15)
            }
        }

        const frame = (now) => {
            raf = requestAnimationFrame(frame)
            const st = stateRef.current
            acc += Math.min(now - last, 250); last = now
            while (acc >= 1000 / 60) {
                acc -= 1000 / 60
                g.tick++
                if (st.screen === 'play') {
                    const s = keys
                    const before = g.events.length
                    step(g, { u: !!s.ArrowUp, d: !!s.ArrowDown, l: !!s.ArrowLeft, r: !!s.ArrowRight, a: !!s.KeyZ || !!s.Space, b: !!s.KeyX || !!s.KeyB })
                    sfx(g.events.splice(0))
                    void before
                    if (g.end === 'dead') { st.screen = 'gameover'; st.t = 0 }
                    if (g.end === 'win') { st.screen = 'win' }
                } else if (st.screen === 'gameover') {
                    st.t = (st.t || 0) + 1
                    if (st.t > 180) { Object.assign(g, makeGame()); g.tick = game.tick; st.screen = 'attract' }
                }
                void msg
            }
            draw(ctx, g, st, game.tick)
        }

        const draw = (c, g, st, t) => {
            c.fillStyle = '#000'; c.fillRect(0, 0, W, H)
            if (st.screen === 'attract' || st.screen === 'gameover' || st.screen === 'win') {
                c.fillStyle = '#000'; c.fillRect(0, 0, W, H)
                c.textAlign = 'center'
                c.fillStyle = '#f8d800'; c.font = 'bold 20px monospace'
                c.fillText('THE LEGEND OF', W / 2, 70)
                c.fillText('Z E L D A', W / 2, 96)
                c.fillStyle = '#f8f8f8'; c.font = '8px monospace'
                c.fillText('HYRULE DEMO  -  FAN TRIBUTE', W / 2, 120)
                if (st.screen === 'attract' && (t >> 5) % 2) { c.fillText('PRESS ANY KEY', W / 2, 170) }
                if (st.screen === 'gameover') { c.fillStyle = '#f80000'; c.fillText('GAME OVER', W / 2, 150) }
                if (st.screen === 'win') {
                    c.fillStyle = '#f8d800'; c.fillText('YOU GOT THE TRIFORCE', W / 2, 140)
                    c.fillStyle = '#f8f8f8'; c.fillText('PEACE RETURNS TO HYRULE', W / 2, 158)
                }
                c.textAlign = 'left'
                return
            }
            const scr = screenOf(g.scr)
            for (let r = 0; r < ROWS; r++) for (let cc = 0; cc < COLS; cc++) {
                drawTile(c, scr.rows[r][cc], cc * TILE, r * TILE, scr.kind, t, cc, r)
            }
            if (scr.blocksState !== false) { for (const b of g.blocks) { c.fillStyle = '#885030'; c.fillRect(b.c * TILE + 1, b.r * TILE + 1, 14, 14); c.fillStyle = '#583018'; c.fillRect(b.c * TILE + 4, b.r * TILE + 4, 8, 8) } }
            for (const p of g.pots) if (!p.smashed) { c.fillStyle = '#c86818'; c.fillRect(p.c * TILE + 3, p.r * TILE + 2, 10, 13); c.fillStyle = '#783808'; c.fillRect(p.c * TILE + 5, p.r * TILE + 4, 6, 3) }
            for (const it of g.items) drawItem(c, it, t)
            for (const e of g.enemies) drawEnemy(c, e, t)
            for (const q of g.shots) drawShot(c, q)
            if (g.bomb) { c.fillStyle = t % 12 < 6 ? '#e8e8e8' : '#a0a0a0'; c.beginPath(); c.arc(g.bomb.x, g.bomb.y, 5, 0, 7); c.fill(); c.fillStyle = '#f85800'; c.fillRect(g.bomb.x - 1, g.bomb.y - 8, 2, 3) }
            if (g.graceDir === null && st.screen === 'play') drawLink(c, g)
            if (g.talk) {
                c.fillStyle = '#f8d800'; c.font = 'bold 9px monospace'
                c.fillText(g.talk.lines[Math.min(g.talk.i, g.talk.lines.length - 1)] || '', 24, PLAY_H - 20)
                c.fillStyle = '#f8f8f8'; c.fillText((g.talk.who === 'old' ? 'OLD MAN' : 'MERCHANT') + ':', 24, PLAY_H - 32)
            }
            if (wipe > 0) {
                wipe--
                const p = 1 - Math.abs(wipe - 18) / 18
                c.fillStyle = '#000'
                for (let i = 0; i < 8; i++) { const bh = (PLAY_H / 8); const h2 = i % 2 ? p * bh : (1 - p) * bh; c.fillRect(i * (W / 8), 0, W / 8, h2) }
            }
            drawHud(c, g)
        }

        const kd = (e) => {
            const st = stateRef.current
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault()
            if (e.code === 'Slash') { navigate(`/mario?game=ZELDA`); return }
            if (st.screen === 'attract') { audioController.unlock && audioController.unlock(); st.screen = 'play'; return }
            if (st.screen === 'win' || st.screen === 'gameover') { st.screen = 'attract'; return }
            keys[e.code] = true
        }
        const ku = (e) => { keys[e.code] = false }
        window.addEventListener('keydown', kd)
        window.addEventListener('keyup', ku)
        raf = requestAnimationFrame(frame)
        window.__zeldaTest = { game: () => gameRef.current, keys, press: (k) => { keys[k] = true; setTimeout(() => { keys[k] = false }, 120) } }
        return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); delete window.__zeldaTest }
    }, [navigate])

    return (
        <div className="flex flex-col items-center justify-center w-full h-full bg-black select-none">
            <canvas ref={canvasRef} width={W} height={H} className="max-w-full max-h-full" style={{ imageRendering: 'pixelated' }} />
            <VirtualControls secondAction={{ label: 'B', code: 'KeyX' }} />
            <PauseOverlay gameId={GAMES.find((x) => x.label === 'ZELDA')?.path} />
        </div>
    )
}
