import { useEffect, useRef, useState, useCallback } from 'react'
import { audioController } from '../../utils/AudioController'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { mountDbg } from '../../utils/DebugKit'
import { makeGame, step, fmtTime, CFG } from './sim'
import { decide } from './planner'
import { TRACK, BOOSTS, SCENERY, TX, TY, ROAD_R, KERB_R, WALL_R } from './track.js'

// =====================================================================
// SUPER MARIO KART — the arcade's Mode 7 title. The ground is ONE 2048²
// texture built from track.js at boot, then sampled scanline by scanline
// under a rotating camera — the SNES trick that defined the console.
// The sim is pure (sim.js); the attract demo is the autopilot's own
// proven 5-lap win (planner.js), running tick for tick like the harness
// audited it. No assets; every pixel and note is synthesized here.
// =====================================================================

const W = 256
const H = 224
const HORIZON = 78
const PLAY_H = 200
const CAM_H = 55
const PP = 520
const BACK = 92
const FOG_C = [0xa8, 0xc8, 0xf8]

const T = TRACK

// ---- ground texture: the whole circuit painted once ----
function buildGround() {
    const c = document.createElement('canvas')
    c.width = TX; c.height = TY
    const x = c.getContext('2d')
    x.fillStyle = '#30a028'; x.fillRect(0, 0, TX, TY)
    x.fillStyle = '#289020'
    for (let gy = 0; gy < TY; gy += 64) for (let gx = ((gy / 64) % 2) * 64; gx < TX; gx += 128) x.fillRect(gx, gy, 64, 64)
    x.fillStyle = '#248018'
    for (let i = 0; i < TX * TY / 900; i++) x.fillRect((i * 149) % TX, (i * 383) % TY, 2, 3)

    const path = new Path2D()
    path.moveTo(T.pts[0].x, T.pts[0].y)
    for (let i = 1; i < T.N; i++) path.lineTo(T.pts[i].x, T.pts[i].y)
    path.closePath()

    x.lineJoin = 'round'; x.lineCap = 'round'
    x.strokeStyle = '#248018'; x.lineWidth = (WALL_R - ROAD_R) * 2
    x.stroke(path)
    x.strokeStyle = '#d82800'; x.lineWidth = (KERB_R - ROAD_R) * 2 + 6
    x.stroke(path)
    x.strokeStyle = '#e8d8b8'; x.lineWidth = ROAD_R * 2
    x.stroke(path)
    x.save(); x.clip(path)
    x.strokeStyle = '#d0c098'; x.lineWidth = 3
    for (let gx = 0; gx < TX; gx += 46) { x.beginPath(); x.moveTo(gx, 0); x.lineTo(gx, TY); x.stroke() }
    for (let gy = 0; gy < TY; gy += 46) { x.beginPath(); x.moveTo(0, gy); x.lineTo(TX, gy); x.stroke() }
    x.restore()
    x.setLineDash([46, 46])
    x.strokeStyle = '#f8f8f8'; x.lineWidth = KERB_R - ROAD_R + 4
    x.stroke(path)
    x.setLineDash([])
    x.strokeStyle = '#f8f8f8'; x.lineWidth = 16
    x.stroke(path)
    x.setLineDash([34, 34])
    x.strokeStyle = '#d82800'; x.lineWidth = 16
    x.stroke(path)
    x.setLineDash([])

    for (const b of BOOSTS) {
        x.save(); x.translate(b.x, b.y); x.rotate(b.a)
        x.fillStyle = '#f8d800'; x.fillRect(-54, -ROAD_R + 16, 108, 2 * ROAD_R - 32)
        x.fillStyle = '#d85800'
        for (let k = 0; k < 3; k++) {
            const cx = -36 + k * 36
            x.beginPath()
            x.moveTo(cx, -60); x.lineTo(cx + 22, 0); x.lineTo(cx, 60); x.lineTo(cx + 8, 60); x.lineTo(cx + 30, 0); x.lineTo(cx + 8, -60)
            x.closePath(); x.fill()
        }
        x.restore()
    }
    const s0 = T.pts[0]
    x.save(); x.translate(s0.x, s0.y); x.rotate(s0.a)
    for (let r = 0; r < 3; r++) for (let col = 0; col < 16; col++) {
        x.fillStyle = (r + col) % 2 ? '#f8f8f8' : '#181818'
        x.fillRect(-24 + r * 16, -ROAD_R + col * 24, 16, 24)
    }
    x.restore()
    x.fillStyle = '#585868'; x.fillRect(1040, 1060, 260, 130)
    x.fillStyle = '#383848'; x.fillRect(1040, 1060, 260, 26)
    x.fillStyle = '#d82800'
    for (let i = 0; i < 6; i++) x.fillRect(1052 + i * 42, 1108, 24, 44)
    return x.getImageData(0, 0, TX, TY)
}

// ---- sky: fixed parallax mask, sampled against camera heading ----
function buildSky() {
    const mtn = new Float32Array(512)
    for (let i = 0; i < 512; i++) {
        const t = (i / 512) * Math.PI * 2
        mtn[i] = 26 + 14 * Math.abs(Math.sin(t * 3 + 1)) + 10 * Math.abs(Math.sin(t * 7 + 2)) + 6 * Math.abs(Math.sin(t * 13))
    }
    const cloud = new Uint8Array(60 * 256)
    for (let y = 0; y < 60; y++) for (let xx = 0; xx < 256; xx++) {
        const v = Math.sin(xx * 0.10 + y * 0.04) + Math.sin(xx * 0.047 - y * 0.11 + 2) + Math.sin(xx * 0.021 + y * 0.18)
        cloud[y * 256 + xx] = y >= 6 && y <= 52 && v > 1.0 ? 1 : 0
    }
    return { mtn, cloud }
}

// ---- sprites, painted here like everything else ----
function sprite(w, h, paint) {
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    paint(c.getContext('2d'))
    return c
}
function buildSprites() {
    const body = (col, helmet) => sprite(56, 64, (x) => {
        x.fillStyle = '#181818'; x.fillRect(2, 40, 14, 22); x.fillRect(40, 40, 14, 22)
        x.fillStyle = '#303030'; x.fillRect(16, 52, 24, 10)
        x.fillStyle = col; x.fillRect(10, 16, 36, 34)
        x.fillStyle = '#00000044'; x.fillRect(10, 16, 36, 6)
        x.fillStyle = '#f8d8a8'; x.fillRect(20, 2, 16, 14)
        x.fillStyle = helmet; x.fillRect(18, 0, 20, 8)
        x.fillStyle = '#f8f8f8'; x.fillRect(14, 44, 28, 6)
    })
    return {
        mario: body('#e02020', '#e02020'),
        daisy: body('#f8b800', '#f8b800'),
        yoshi: body('#20b020', '#e05028'),
        peach: body('#f878b8', '#f8d8f8'),
        bowser: body('#58a818', '#d89000'),
        banana: sprite(26, 20, (x) => {
            x.fillStyle = '#f8d800'
            x.beginPath(); x.ellipse(13, 12, 11, 6, -0.4, 0, 7); x.fill()
            x.fillStyle = '#a87800'; x.fillRect(3, 12, 5, 4); x.fillRect(18, 6, 5, 4)
        }),
        shell: sprite(30, 26, (x) => {
            x.fillStyle = '#20c020'; x.beginPath(); x.ellipse(15, 13, 13, 10, 0, 0, 7); x.fill()
            x.fillStyle = '#a8f8a8'; x.beginPath(); x.ellipse(15, 10, 8, 5, 0, 0, 7); x.fill()
            x.fillStyle = '#186000'; x.fillRect(2, 18, 26, 4)
        }),
        box: sprite(40, 40, (x) => {
            x.fillStyle = '#f8b800'; x.fillRect(2, 2, 36, 36)
            x.fillStyle = '#d87800'; x.fillRect(2, 2, 36, 4); x.fillRect(2, 34, 36, 4); x.fillRect(2, 2, 4, 36); x.fillRect(34, 2, 4, 36)
            x.fillStyle = '#f8f8f8'; x.font = 'bold 26px monospace'; x.fillText('?', 12, 30)
        }),
        mushroom: sprite(30, 26, (x) => {
            x.fillStyle = '#e02020'; x.beginPath(); x.ellipse(15, 12, 13, 10, 0, Math.PI, 0); x.fill()
            x.fillStyle = '#f8e8c8'; x.fillRect(8, 12, 14, 12)
            x.fillStyle = '#f8f8f8'; x.beginPath(); x.arc(8, 7, 3, 0, 7); x.arc(21, 6, 4, 0, 7); x.fill()
        }),
        tree: sprite(70, 96, (x) => {
            x.fillStyle = '#784818'; x.fillRect(30, 58, 10, 38)
            x.fillStyle = '#186810'; x.beginPath(); x.arc(35, 40, 26, 0, 7); x.fill()
            x.fillStyle = '#208018'; x.beginPath(); x.arc(27, 32, 16, 0, 7); x.arc(45, 36, 14, 0, 7); x.fill()
        }),
        stand: sprite(110, 74, (x) => {
            x.fillStyle = '#585868'; x.fillRect(4, 20, 102, 54)
            x.fillStyle = '#303040'; x.fillRect(4, 20, 102, 8)
            for (let r = 0; r < 3; r++) for (let c2 = 0; c2 < 12; c2++) {
                x.fillStyle = ['#e02020', '#2050e0', '#f8d800', '#f8f8f8', '#20a020'][(r * 7 + c2 * 3) % 5]
                x.fillRect(8 + c2 * 8, 32 + r * 14, 5, 8)
            }
            x.fillStyle = '#d82800'; x.fillRect(4, 8, 102, 10)
        }),
        gantry: sprite(120, 120, (x) => {
            x.fillStyle = '#e8e8e8'; x.fillRect(6, 10, 12, 110); x.fillRect(102, 10, 12, 110)
            x.fillStyle = '#d82800'; x.fillRect(0, 0, 120, 26)
            x.fillStyle = '#f8f8f8'; x.font = 'bold 11px monospace'; x.fillText('MARIO CIRCUIT', 12, 17)
        }),
    }
}

export default function MarioKart() {
    const canvasRef = useRef(null)
    const [paused, setPaused] = useState(false)
    const [padOn, setPadOn] = useState(false)
    const pausedRef = useRef(false)
    const gameRef = useRef(null)
    const screenRef = useRef('attract')
    const keysRef = useRef({})
    const tapRef = useRef(null)

    const handleResume = useCallback(() => { setPaused(false); pausedRef.current = false }, [])

    useEffect(() => {
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false
        const ground = buildGround()
        const gnd = new Uint32Array(ground.data.buffer)
        const sky = buildSky()
        const S = buildSprites()
        const frame = ctx.createImageData(W, PLAY_H)
        const px = new Uint32Array(frame.data.buffer)
        const g = makeGame()
        gameRef.current = g
        const keys = keysRef.current
        const st = { screen: 'attract', endT: 0 }
        screenRef.current = 'attract'

        // best-lap persistence: the renderer's memory, never the sim's
        // (determinism in Node stays hash-for-hash; this only decorates)
        const BEST_KEY = 'arcade.kart.bestLap'
        const readBest = () => {
            try { return Number(localStorage.getItem(BEST_KEY)) || 0 } catch { return 0 }
        }
        st.best = readBest()

        let raf = 0; let acc = 0; let last = performance.now()
        let camA = g.karts[0].a
        let shake = 0

        const sfx = (evs, live) => {
            if (!live) return
            for (const ev of evs) {
                if (ev.e === 'count') audioController.playTone(660, 0.12, 'square', 0.12)
                if (ev.e === 'go') audioController.playSweep(440, 880, 0.4, 'square', 0.14)
                if (ev.e === 'pickup') audioController.playTone(ev.item === 'mushroom' ? 990 : 740, 0.08, 'square', 0.12)
                if (ev.e === 'shell') audioController.playSweep(1000, 220, 0.18, 'sawtooth', 0.12)
                if (ev.e === 'banana') audioController.playNoise(0.08, 0.1)
                if (ev.e === 'boost') audioController.playSweep(300, 1100, 0.4, 'square', 0.12)
                if (ev.e === 'dash') audioController.playSweep(500, 1400, 0.22, 'triangle', 0.1)
                if (ev.e === 'spin' && ev.who === 'PLAYER') { audioController.playNoise(0.35, 0.18); shake = 26 }
                if (ev.e === 'bump' && ev.who === 'PLAYER') { audioController.playNoise(0.12, 0.15); shake = 10 }
                if (ev.e === 'lap' && ev.who === 'PLAYER') { audioController.playTone(880, 0.1, 'square', 0.12); audioController.playTone(1320, 0.1, 'square', 0.08) }
                if (ev.e === 'end') { if (ev.place === 1) audioController.playFanfare(); else audioController.playDeath() }
            }
        }

        const project = (wx, wy) => {
            const dx = wx - g.karts[0].x; const dy = wy - g.karts[0].y
            const ca = Math.cos(camA); const sa = Math.sin(camA)
            const f = dx * ca + dy * sa
            const l = dx * -sa + dy * ca
            return { f, l }
        }

        const raster = () => {
            const p = g.karts[0]
            const ca = Math.cos(camA); const sa = Math.sin(camA)
            const cx = p.x - ca * BACK; const cy = p.y - sa * BACK
            const aN = ((camA / (Math.PI * 2)) * 512) % 512
            const cA = ((camA / (Math.PI * 2)) * 256 * 1.6 + g.tick * 0.04) % 256
            for (let y = 0; y < HORIZON; y++) {
                const t = y / HORIZON
                const sr = 0x20 + t * 0x88 | 0; const sg = 0x38 + t * 0x90 | 0; const sb = 0xf8
                const row = (sr) | (sg << 8) | (sb << 16) | 0xff000000
                let o = y * W
                for (let x = 0; x < W; x++) {
                    const mh = sky.mtn[(x + aN | 0) & 511]
                    if (y > HORIZON - mh) {
                        px[o++] = y > HORIZON - mh + 5 ? 0xffa87868 : 0xff906050
                        continue
                    }
                    if (y < 60 && sky.cloud[((y * 256) + ((x + cA) & 255)) | 0]) { px[o++] = 0xfff8f8f8; continue }
                    px[o++] = row
                }
            }
            for (let y = HORIZON; y < PLAY_H; y++) {
                const dd = (CAM_H * PP) / (y - HORIZON + 0.6)
                const dl = dd / PP
                const fr = dd > 2200 ? Math.min(0.8, (dd - 2200) / 1400) : 0
                const cosd = ca * dd; const sind = sa * dd
                let wx = cx + cosd + sa * 128 * dl
                let wy = cy + sind - ca * 128 * dl
                const stepX = -sa * dl; const stepY = ca * dl
                let o = y * W
                if (fr > 0) {
                    for (let x = 0; x < W; x++) {
                        const tx = wx | 0; const ty = wy | 0
                        const c = (tx < 0 || ty < 0 || tx >= TX || ty >= TY) ? 0x30a028 : gnd[ty * TX + tx]
                        const r = c & 255; const gg = (c >> 8) & 255; const b = (c >> 16) & 255
                        px[o++] = ((r + (FOG_C[0] - r) * fr) | 0) | (((gg + (FOG_C[1] - gg) * fr) | 0) << 8) | (((b + (FOG_C[2] - b) * fr) | 0) << 16) | 0xff000000
                        wx += stepX; wy += stepY
                    }
                } else {
                    for (let x = 0; x < W; x++) {
                        const tx = wx | 0; const ty = wy | 0
                        px[o++] = (tx < 0 || ty < 0 || tx >= TX || ty >= TY) ? 0x30a028 : gnd[ty * TX + tx]
                        wx += stepX; wy += stepY
                    }
                }
            }
            ctx.putImageData(frame, 0, 0)
        }

        const drawSprites = () => {
            ctx.save()
            ctx.beginPath(); ctx.rect(0, 0, W, PLAY_H); ctx.clip()
            const items = []
            for (const k of g.karts.slice(1)) items.push({ x: k.x, y: k.y, a: k.a, img: S[k.color], w: 56, h: 64, o: k })
            for (const b of g.bananas) items.push({ x: b.x, y: b.y, a: 0, img: S.banana, w: 26, h: 20 })
            for (const s of g.shells) items.push({ x: s.x, y: s.y, a: s.a, img: S.shell, w: 30, h: 26 })
            for (const b of g.boxes) if (!b.taken) items.push({ x: b.x, y: b.y, a: 0, img: S.box, w: 40, h: 40, bob: true })
            for (const sc of SCENERY) items.push({ x: sc.x, y: sc.y, a: 0, img: S[sc.kind === 'tree' ? 'tree' : 'stand'], w: sc.kind === 'tree' ? 70 : 110, h: sc.kind === 'tree' ? 96 : 74 })
            const s0 = T.pts[0]
            items.push({ x: s0.x + 120, y: s0.y - 25, a: 0, img: S.gantry, w: 120, h: 120 })
            for (const it of items) {
                const pr = project(it.x, it.y)
                if (pr.f < 30 || pr.f > 2600) continue
                const s = PP / pr.f
                const sy = HORIZON + CAM_H * s
                const sx = W / 2 + pr.l * s
                const w = Math.min(300, it.w * s * 0.9); const h = Math.min(320, it.h * s * 0.9)
                const bob = it.bob ? Math.sin(g.tick * 0.1 + it.x) * 3 * s : 0
                if (sx + w < 0 || sx - w > W) continue
                ctx.globalAlpha = 0.25
                ctx.fillStyle = '#000'
                ctx.fillRect(sx - w / 2, sy - 3 * s, w, 6 * s)
                ctx.globalAlpha = 1
                ctx.save()
                ctx.translate(sx, sy - h / 2 + bob)
                if (it.o) ctx.rotate(it.o.a - camA)
                ctx.drawImage(it.img, -w / 2, -h / 2, w, h)
                ctx.restore()
            }
            ctx.restore()
            const P = g.karts[0]
            const tilt = P.spinT > 0 ? g.tick * 0.32 : P.steerVis * 0.18 + (P.driftT ? P.steerVis * 0.22 : 0)
            const bounce = P.offroad && P.v > 1 ? (g.tick >> 1) % 2 : 0
            ctx.save()
            ctx.translate(W / 2, PLAY_H - 30 + bounce)
            ctx.rotate(tilt)
            ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-34, 22, 68, 9)
            ctx.drawImage(S.mario, -38, -40, 76, 88)
            if (P.boostT > 0) {
                ctx.fillStyle = (g.tick >> 1) % 2 ? '#f8d800' : '#f85800'
                ctx.fillRect(-30, 40, 12, 10 + (g.tick % 6)); ctx.fillRect(18, 40, 12, 10 + ((g.tick + 3) % 6))
            }
            ctx.restore()
        }

        const drawHud = () => {
            const P = g.karts[0]
            ctx.fillStyle = '#000'
            ctx.font = 'bold 12px monospace'
            ctx.fillStyle = '#f8f8f8'
            ctx.fillText(`LAP ${Math.min(P.lap + 1, 5)}/5`, 6, 14)
            ctx.fillText(fmtTime(Math.max(0, g.tick - P.lapStart)), 6, 28)
            const suff = ['st', 'nd', 'rd', 'th', 'th'][P.place - 1]
            ctx.fillStyle = P.place === 1 ? '#f8d800' : '#f8f8f8'
            ctx.font = 'bold 20px monospace'
            const ps = `${P.place}${suff}`
            ctx.fillText(ps, W - 10 - ctx.measureText(ps).width, 22)
            ctx.fillStyle = '#101018'; ctx.fillRect(0, PLAY_H, W, H - PLAY_H)
            ctx.fillStyle = '#383848'; ctx.fillRect(0, PLAY_H, W, 2)
            ctx.strokeStyle = '#f8d800'; ctx.lineWidth = 2
            ctx.strokeRect(8, PLAY_H + 6, 34, 16)
            if (P.item) {
                const im = { banana: S.banana, shell: S.shell, mushroom: S.mushroom }[P.item]
                ctx.drawImage(im, 10, PLAY_H + 5, 30, 20)
            }
            ctx.fillStyle = '#f8f8f8'; ctx.font = 'bold 11px monospace'
            ctx.fillText(`${Math.round(P.v * 19.5)} KM/H`, 52, PLAY_H + 18)
            const barW = Math.round(P.v / (CFG.top + CFG.boostOver) * 84)
            ctx.fillStyle = '#282838'; ctx.fillRect(150, PLAY_H + 10, 84, 8)
            ctx.fillStyle = P.boostT > 0 ? '#f8d800' : P.offroad ? '#f85800' : '#20c020'
            ctx.fillRect(150, PLAY_H + 10, barW, 8)
            if (g.phase === 'count' || (g.phase === 'race' && g.tick - g.karts[0].lapStart < 40)) {
                ctx.textAlign = 'center'
                ctx.font = 'bold 48px monospace'
                ctx.fillStyle = g.phase === 'race' ? '#20e020' : '#f8f8f8'
                ctx.fillText(g.phase === 'race' ? 'GO!' : String(Math.ceil(g.count / 60)), W / 2, 120)
                ctx.textAlign = 'left'
            }
        }

        const drawAttract = () => {
            ctx.fillStyle = 'rgba(0,0,0,0.45)'
            ctx.fillRect(0, 30, W, 74)
            ctx.textAlign = 'center'
            ctx.fillStyle = '#e02020'
            ctx.font = 'bold 26px monospace'
            ctx.fillText('SUPER', W / 2 + 2, 56 + 2)
            ctx.fillStyle = '#f8f8f8'
            ctx.fillText('SUPER', W / 2, 56)
            ctx.fillStyle = '#f8d800'
            ctx.fillText('KART', W / 2, 84)
            ctx.font = 'bold 11px monospace'
            ctx.fillStyle = '#a8c8f8'
            ctx.fillText('MARIO CIRCUIT - 5 LAPS', W / 2, 98)
            if ((g.tick >> 5) % 2) {
                ctx.fillStyle = '#f8f8f8'
                ctx.fillText('PRESS ANY KEY / TAP', W / 2, 124)
            }
            ctx.fillStyle = '#88a8d8'; ctx.font = '8px monospace'
            ctx.fillText('attract: autopilot demo (its own proven win)', W / 2, 140)
            if (st.best) {
                ctx.fillStyle = '#f8d800'
                ctx.fillText('BEST LAP ' + fmtTime(st.best), W / 2, 154)
            }
            ctx.textAlign = 'left'
        }

        const drawEnd = () => {
            const P = g.karts[0]
            ctx.fillStyle = 'rgba(0,0,20,0.7)'; ctx.fillRect(0, 40, W, 90)
            ctx.textAlign = 'center'
            ctx.font = 'bold 24px monospace'
            ctx.fillStyle = g.end === 'win' ? '#f8d800' : '#f85800'
            ctx.fillText(g.end === 'win' ? 'YOU WIN!' : `${P.place}TH PLACE`, W / 2, 74)
            ctx.font = 'bold 12px monospace'
            ctx.fillStyle = '#f8f8f8'
            ctx.fillText(`TIME ${fmtTime(P.finishT || g.tick)}  BEST ${st.best ? fmtTime(st.best) : '--'}`, W / 2, 96)
            if ((g.tick >> 5) % 2) ctx.fillText('TAP OR ANY KEY', W / 2, 118)
            ctx.textAlign = 'left'
        }

        const tickWorld = (live) => {
            const inp = st.plan
                ? decide(g)
                : { u: !!keys.ArrowUp, d: !!keys.ArrowDown, l: !!keys.ArrowLeft, r: !!keys.ArrowRight, drift: !!(keys.KeyX || keys.KeyC), item: !!keys.Space }
            step(g, live ? inp : decide(g))
            const evs = g.events.splice(0)
            if (import.meta.env.DEV) {
                const log = (window.__kartLog ||= [])
                for (const ev of evs) log.push({ ...ev, t: g.tick })
                if (log.length > 2000) log.splice(0, log.length - 2000)
            }
            sfx(evs, live)
            if (live) {
                for (const ev of evs) {
                    if (ev.e === 'lap' && ev.who === 'PLAYER' && ev.t > 60) {
                        if (!st.best || ev.t < st.best) {
                            st.best = ev.t
                            try { localStorage.setItem(BEST_KEY, String(ev.t)) } catch { /* private mode: session-only */ }
                        }
                    }
                }
            }
            if (!live && g.end) { st.endT++; if (st.endT > 240) { Object.assign(g, makeGame()); st.endT = 0 } }
            if (live && g.end) { st.screen = 'end'; screenRef.current = 'end'; st.endT = 0; setPadOn(false) }
        }

        const loop = (now) => {
            raf = requestAnimationFrame(loop)
            acc += Math.min(now - last, 250); last = now
            while (acc >= 1000 / 60) {
                acc -= 1000 / 60
                if (!pausedRef.current) tickWorld(st.screen === 'race')
                const want = g.karts[0].a
                let da = want - camA
                while (da > Math.PI) da -= Math.PI * 2
                while (da < -Math.PI) da += Math.PI * 2
                camA += da * 0.12
            }
            const shk = shake > 0 ? ((shake-- % 4) - 1.5) : 0
            ctx.save()
            ctx.translate(shk, 0)
            raster()
            drawSprites()
            ctx.restore()
            drawHud()
            if (st.screen === 'attract') drawAttract()
            if (st.screen === 'end') drawEnd()
        }

        const resetTo = (screen) => {
            Object.assign(g, makeGame())
            st.screen = screen; screenRef.current = screen
            st.endT = 0
            camA = g.karts[0].a
            // the pad would only cover the canvas on attract/end — withdraw
            // it there (the tap lands on the canvas itself, see tapRef)
            setPadOn(screen === 'race')
        }

        // Phone players have no keys to press: a tap on the bare canvas is
        // the attract/end actuator while the pad is withdrawn.
        tapRef.current = () => {
            if (pausedRef.current) return
            if (st.screen === 'attract') { audioController.init(); resetTo('race') }
            else if (st.screen === 'end') resetTo('attract')
        }

        const kd = (e) => {
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault()
            if (e.code === 'Question') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); return }
            if (pausedRef.current) return
            if (st.screen === 'attract') {
                audioController.init()
                resetTo('race')
                return
            }
            if (st.screen === 'end') {
                st.endT++
                if (st.endT > 20) resetTo('attract')
                return
            }
            keys[e.code] = true
        }
        const ku = (e) => { keys[e.code] = false }
        window.addEventListener('keydown', kd)
        window.addEventListener('keyup', ku)
        raf = requestAnimationFrame(loop)

        const unmount = mountDbg({
            title: 'SUPER MARIO KART',
            getState: () => {
                const P = g.karts[0]
                return [
                    `screen ${st.screen}  phase ${g.phase}  end ${g.end}`,
                    `pos ${P.place}  lap ${P.lap}/5  item ${P.item || '-'}  v ${P.v.toFixed(2)}`,
                    `surf ${T.nearest(P.x, P.y, P.hint).surf}  spin ${P.spinT}  boost ${P.boostT}`,
                    `bananas ${g.bananas.length}  shells ${g.shells.length}  tick ${g.tick}`,
                ]
            },
            actions: [
                { label: 'teleport to grid', run: () => { const P = g.karts[0]; const p = T.pts[4]; P.x = p.x; P.y = p.y; P.idx = 4; P.hint = 4; P.a = p.a; return 'ok' } },
                { label: 'give shell', run: () => { g.karts[0].item = 'shell'; return 'shell' } },
                { label: 'give banana', run: () => { g.karts[0].item = 'banana'; return 'banana' } },
                { label: 'boost', run: () => { g.karts[0].boostT = 90; return 'boost' } },
                { label: 'instant lap', run: () => { const P = g.karts[0]; P.lap = Math.min(5, P.lap + 1); return `lap ${P.lap}` } },
            ],
        })

        window.__kartTest = {
            game: () => g,
            keys,
            screen: () => st.screen,
            press: (k) => { keys[k] = true; setTimeout(() => { keys[k] = false }, 150) },
            setPlan: (v) => { st.plan = !!v },
            best: () => st.best,
        }

        return () => {
            cancelAnimationFrame(raf)
            window.removeEventListener('keydown', kd)
            window.removeEventListener('keyup', ku)
            unmount()
            delete window.__kartTest
        }
    }, [])

    return (
        <div
            className="relative flex flex-col items-center justify-center w-full h-full bg-black select-none"
            onPointerDown={() => tapRef.current && tapRef.current()}
        >
            <canvas ref={canvasRef} width={W} height={H} className="max-w-full max-h-full" style={{ imageRendering: 'pixelated' }} />
            <VirtualControls secondAction={{ label: 'B', code: 'KeyX' }} visible={padOn && !paused} />
            {paused && <PauseOverlay game={GAMES.find((x) => x.label === 'SUPER MARIO KART')} onResume={handleResume} />}
        </div>
    )
}
