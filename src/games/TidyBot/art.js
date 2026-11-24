// TIDY BOT — skins (#3078). Two painter sets share one signature contract; the
// game shell calls PAINTERS[skin].paintX(...) and the sim never knows which.
//
//   classic    — the dollhouse cutaway shipped since #1143, moved here VERBATIM
//                (tidycheck pins its pixels with a golden region hash so this
//                move cannot silently restyle the default look).
//   reimagined — PAPERCRAFT DIORAMA (Jon's reimagine pick, #3078): the same
//                house rebuilt from construction paper and cardboard — cut-card
//                shapes with hard offset drop-shadows, dashed cut-lines, fold
//                creases, sticky-note tags, marker ink and a daylight craft
//                palette. Presentation only: layout, rules and timings live in
//                sim.js and are untouched.
//
// Painter signature contract (ctx first, live sim second; `tick` is gs.tick):
//   paintRooms(ctx, bg) paintCounter(ctx, bg) paintTable(ctx, bg)
//   paintContainer(ctx, c, gs2, tick, skip)   // skip = the pull-anim slot, if any
//   drawItem(ctx, kind, x, y, s)
//   paintRobot(ctx, gs2, tick, pullKind)
//   paintHud(ctx, gs2, tick)
//   paintAttract(ctx, tick, best) paintOver(ctx, gs2, tick)
// Plus `chrome` — the colors the shell paints for markers, particles and the
// dust of footfalls, so those read on-skin without the shell knowing palettes.

import { VIEW_W, VIEW_H, WALL, COUNTER, STOVE, TABLE, PLANTS, RACK_CAP, RACK_ROWS, RACK_COLS, LEVELS, rackSlot } from './sim.js'

const srand = (seed) => {
    let s = seed >>> 0
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}
const circle = (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2) }
const rr = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r) }
// every painter owns its grain cache, so the same key never leaks colors across skins
const makeBg = () => {
    const cache = {}
    return (key, count, fn) => {
        if (cache[key]) return cache[key]
        const out = []
        const rnd = srand(9931)
        for (let i = 0; i < count; i++) out.push(fn(rnd, i))
        return (cache[key] = out)
    }
}

export const SKIN_IDS = ['classic', 'reimagined']
export const skinFromLocation = () => {
    try {
        const q = new URLSearchParams(window.location.search).get('style')
        if (q && SKIN_IDS.includes(q)) return q
        const stored = window.localStorage.getItem('tidybot.skin')
        if (stored && SKIN_IDS.includes(stored)) return stored
    } catch { /* private mode, no URL — classic */ }
    return 'classic'
}
export const rememberSkin = (skin) => { try { window.localStorage.setItem('tidybot.skin', skin) } catch { /* fine */ } }

// ---------------------------------------------------------------- classic ----
const makeClassic = () => {
    const bg = makeBg()
    // one household item, centered on (x, y) — cores all mutually distinct so the
    // harness can prove each kind is painted exactly where the sim puts it
    const drawItem = (ctx, kind, x, y, s = 1) => {
        ctx.save(); ctx.translate(x, y); ctx.scale(s, s)
        if (kind === 'plate') {
            ctx.fillStyle = '#8f9aa5'; circle(ctx, 0, 0, 6.5); ctx.fill()
            ctx.fillStyle = '#f2f0e6'; circle(ctx, 0, 0, 5.5); ctx.fill()
            ctx.strokeStyle = '#3f6fae'; ctx.lineWidth = 1; circle(ctx, 0, 0, 3.8); ctx.stroke()
            ctx.fillStyle = 'rgba(255,255,255,0.7)'; circle(ctx, -1.6, -1.6, 1.1); ctx.fill()
        } else if (kind === 'cup') {
            ctx.fillStyle = '#a8281e'; circle(ctx, 0, 0, 4.6); ctx.fill()
            ctx.fillStyle = '#e8442e'; circle(ctx, 0, 0, 3.6); ctx.fill()
            ctx.fillStyle = '#7c1c14'; circle(ctx, 0, 0, 2.1); ctx.fill()
            ctx.strokeStyle = '#a8281e'; ctx.lineWidth = 1.6
            ctx.beginPath(); ctx.arc(4.4, 0, 1.9, -Math.PI / 2, Math.PI / 2); ctx.stroke()
        } else if (kind === 'apple') {
            ctx.fillStyle = '#8c1c18'; circle(ctx, 0, 0.5, 4.8); ctx.fill()
            ctx.fillStyle = '#d8342a'; circle(ctx, 0, 0, 4.3); ctx.fill()
            ctx.fillStyle = '#5da83a'; ctx.beginPath(); ctx.ellipse(2.4, -3.4, 2.4, 1.3, -0.5, 0, Math.PI * 2); ctx.fill()
            ctx.fillStyle = '#6c4a20'; ctx.fillRect(-0.6, -5.4, 1.2, 2.4)
            ctx.fillStyle = 'rgba(255,255,255,0.45)'; circle(ctx, -1.5, -1.4, 1); ctx.fill()
        } else {
            ctx.fillStyle = '#2c5f9e'; ctx.fillRect(-3.5, -4.5, 7, 9.5)
            ctx.fillStyle = '#e8ecf2'; ctx.fillRect(-3.5, -4.5, 7, 3.4)
            ctx.fillStyle = '#2c5f9e'
            ctx.beginPath(); ctx.moveTo(-3.5, -4.5); ctx.lineTo(0, -6.6); ctx.lineTo(3.5, -4.5); ctx.closePath(); ctx.fill()
            ctx.fillStyle = '#d8b23a'; ctx.fillRect(-1.4, 0.4, 2.8, 2.6)
        }
        ctx.restore()
    }
    return {
        chrome: {
            ring: 'rgba(95,200,222,0.85)', ringSoft: 'rgba(95,200,222,0.35)', dot: 'rgba(143,224,238,0.8)',
            bracket: 'rgba(95,200,222,0.9)', tag: 'rgba(143,224,238,0.9)',
            arcFlash: '255,210,63', arcTail: '255,233,168',
            fxText: { ok: '#5dff8f', jam: '#ffd23f', bad: '#ff5a4f' },
            burst: { grab: '#ffe9a8', place: '#9fe8b4', jam: '#ffd23f', spill: '#c8b89a', shard: '#e8eef4', heavy: '#9a8a6a' },
            dust: { plankH: '#8a6a3e', tileH: '#9aa488', plank: '#b9864e', tile: '#ccd4bd' },
            ringPop: '143,224,238',
            banner: '#ffd23f', level: '#9fe8b4',
        },
        paintRooms: (ctx) => {
            // kitchen: sage checker tile
            ctx.fillStyle = '#b9c2a4'; ctx.fillRect(WALL, WALL, VIEW_W - WALL * 2, VIEW_H - WALL * 2)
            for (let ty = WALL; ty < VIEW_H - WALL; ty += 16) {
                for (let tx = WALL; tx < VIEW_W - WALL; tx += 16) {
                    if (((tx + ty) / 16) % 2 === 0) continue
                    ctx.fillStyle = '#a7b191'; ctx.fillRect(tx, ty, 16, 16)
                }
            }
            // dining: oak planks (right half, below kitchen line)
            ctx.fillStyle = '#9a6a38'; ctx.fillRect(TABLE.x - 20, 100, VIEW_W - WALL - TABLE.x + 20, VIEW_H - WALL - 100)
            for (const p of bg('plank', 8, (r) => [TABLE.x - 20 + Math.floor(r() * 140), 104 + Math.floor(r() * 120)])) {
                ctx.fillStyle = 'rgba(120,80,40,0.5)'; ctx.fillRect(p[0], p[1], 24 + (p[1] % 3) * 6, 1)
                ctx.fillStyle = 'rgba(210,160,100,0.25)'; ctx.fillRect(p[0], p[1] + 2, 18, 1)
            }
            ctx.strokeStyle = 'rgba(90,60,30,0.55)'; ctx.lineWidth = 1
            ctx.beginPath(); ctx.moveTo(TABLE.x - 20, 100); ctx.lineTo(VIEW_W - WALL, 100); ctx.stroke()
            // grout glints
            ctx.fillStyle = 'rgba(255,255,255,0.10)'
            for (const g of bg('grout', 26, (r) => [WALL + Math.floor(r() * 28) * 8, WALL + Math.floor(r() * 26) * 8])) ctx.fillRect(g[0], g[1], 1, 1)
            // walls
            ctx.fillStyle = '#5a3a22'; ctx.fillRect(0, 0, VIEW_W, WALL); ctx.fillRect(0, VIEW_H - WALL, VIEW_W, WALL)
            ctx.fillRect(0, 0, WALL, VIEW_H); ctx.fillRect(VIEW_W - WALL, 0, WALL, VIEW_H)
            ctx.fillStyle = '#71492b'
            ctx.fillRect(0, 0, VIEW_W, 3); ctx.fillRect(0, VIEW_H - WALL, VIEW_W, 3)
            ctx.fillRect(0, 0, 3, VIEW_H); ctx.fillRect(VIEW_W - WALL, 0, 3, VIEW_H)
        },
        paintCounter: (ctx) => {
            // counter with speckled laminate + steel sink
            ctx.fillStyle = '#7a6a52'; ctx.fillRect(COUNTER.x, COUNTER.y, COUNTER.w, COUNTER.h)
            ctx.fillStyle = '#d9d8cc'; ctx.fillRect(COUNTER.x + 1, COUNTER.y + 1, COUNTER.w - 2, COUNTER.h - 2)
            ctx.fillStyle = 'rgba(120,110,90,0.35)'
            for (const s of bg('lam', 50, (r) => [COUNTER.x + 2 + Math.floor(r() * (COUNTER.w - 4)), COUNTER.y + 2 + Math.floor(r() * (COUNTER.h - 4))])) ctx.fillRect(s[0], s[1], 1, 1)
            ctx.fillStyle = '#9fb2bd'; ctx.fillRect(122, COUNTER.y + 4, 30, COUNTER.h - 8)
            ctx.fillStyle = '#8aa0ad'; ctx.fillRect(124, COUNTER.y + 6, 26, COUNTER.h - 12)
            ctx.fillStyle = '#c9d6de'; ctx.fillRect(126, COUNTER.y + 7, 8, 2)
            ctx.fillStyle = '#66727c'; ctx.fillRect(136, COUNTER.y + 2, 2, 5)
            // stove
            ctx.fillStyle = '#4c565f'; ctx.fillRect(STOVE.x, STOVE.y, STOVE.w, STOVE.h)
            ctx.fillStyle = '#2e353c'; ctx.fillRect(STOVE.x + 2, STOVE.y + 2, STOVE.w - 4, STOVE.h - 4)
            for (const [ox, oy] of [[7, 6], [20, 6], [7, 15], [20, 15]]) {
                ctx.fillStyle = '#141a1f'; circle(ctx, STOVE.x + ox, STOVE.y + oy, 3.4); ctx.fill()
                ctx.strokeStyle = '#59646e'; ctx.lineWidth = 1; circle(ctx, STOVE.x + ox, STOVE.y + oy, 3.4); ctx.stroke()
            }
            // plants
            for (const p of PLANTS) {
                ctx.fillStyle = '#8a4a2c'; ctx.fillRect(p.x + 1, p.y + 5, p.w - 2, p.h - 5)
                ctx.fillStyle = '#3f7d3a'; circle(ctx, p.x + p.w / 2, p.y + 4, 5); ctx.fill()
                ctx.fillStyle = '#57993f'; circle(ctx, p.x + p.w / 2 - 2, p.y + 2, 2.6); ctx.fill()
            }
        },
        paintTable: (ctx) => {
            ctx.fillStyle = '#6e4423'; ctx.fillRect(TABLE.x - 2, TABLE.y - 2, TABLE.w + 4, TABLE.h + 4)
            ctx.fillStyle = '#8a5a30'; ctx.fillRect(TABLE.x, TABLE.y, TABLE.w, TABLE.h)
            ctx.fillStyle = 'rgba(220,180,130,0.18)'
            for (const g of bg('tblgrain', 12, (r) => [TABLE.x + 3 + Math.floor(r() * (TABLE.w - 6)), TABLE.y + 3 + Math.floor(r() * (TABLE.h - 6))])) ctx.fillRect(g[0], g[1], 14, 1)
            // cloth
            ctx.fillStyle = '#c4453a'; ctx.fillRect(TABLE.x + 10, TABLE.y + 8, TABLE.w - 20, TABLE.h - 16)
            ctx.strokeStyle = 'rgba(255,240,230,0.35)'; ctx.lineWidth = 1
            ctx.strokeRect(TABLE.x + 13, TABLE.y + 11, TABLE.w - 26, TABLE.h - 22)
        },
        paintContainer: (ctx, c, gs2, tick, skip) => {
            const cc = c.id === 'dw' ? gs2.dw : gs2.fr
            // cavity + rack when open
            const openT = Math.min(1, cc.door)
            ctx.fillStyle = '#3a2c1e'; ctx.fillRect(c.x, c.y, c.w, c.h)
            ctx.fillStyle = c.id === 'dw' ? '#20303c' : '#dfe6de'
            ctx.fillRect(c.x + 2, c.y + 2, c.w - 4, c.h - 4)
            ctx.strokeStyle = c.id === 'dw' ? 'rgba(140,170,190,0.4)' : 'rgba(150,160,150,0.6)'
            ctx.lineWidth = 1
            // rack shelves sit under slot rows 1..n-1 (#2338); the bottom row
            // rides the cavity floor, so its line lands on the lip and is skipped
            for (let r = 0; r < RACK_ROWS; r++) {
                const ry = rackSlot(c, r * RACK_COLS).y + 5
                if (ry > c.y + c.h - 3) continue
                ctx.beginPath(); ctx.moveTo(c.x + 4, ry); ctx.lineTo(c.x + c.w - 4, ry); ctx.stroke()
            }
            // stowed items inside, small — each at ITS slot (#2338): retrieving
            // a neighbour never shifts the rest of the rack, and all nine DW
            // lodgers stay visible
            const inside = gs2.items.filter((it) => it.state === 'in' && it.cont === c.id)
            inside.forEach((it, i) => {
                const sl = it.slot === null || it.slot === undefined ? i : it.slot
                if (skip && skip.c === c.id && skip.slot === sl % RACK_CAP && skip.kind === it.kind) return // #2343 it left the rack — it rides the reach arc now
                const p = rackSlot(c, sl % RACK_CAP)
                drawItem(ctx, it.kind, p.x, p.y, 0.78) // #2343 0.62 → 0.78: slots guarantee spacing, small glyphs read far better (GardenGuard #2331 precedent)
            })
            // door: slides down over the cavity front
            const dy = c.y + c.h - 2 - (c.h + c.doorLen - 4) * openT
            const dH = (c.h + c.doorLen - 4)
            const body = c.id === 'dw' ? '#b9c4cc' : '#ece6d4'
            const edge = c.id === 'dw' ? '#7e8c96' : '#b0a888'
            if (openT > 0.02) {
                const panelY = c.y + 2 + (c.h + c.doorLen - 4) * openT - (dH - (c.h - 4))
                const py = Math.max(c.y + 2, panelY)
                ctx.globalAlpha = 1
                if (openT >= 0.99) {
                    ctx.fillStyle = edge; ctx.fillRect(c.x, c.y + c.h, c.w, c.doorLen)
                    ctx.fillStyle = body; ctx.fillRect(c.x + 2, c.y + c.h + 2, c.w - 4, c.doorLen - 4)
                    ctx.fillStyle = '#5c6a74'; ctx.fillRect(c.x + c.w / 2 - 7, c.y + c.h + 3, 14, 2.4)
                } else {
                    ctx.fillStyle = edge; ctx.fillRect(c.x, py, c.w, Math.max(6, c.y + c.h - py))
                    ctx.fillStyle = body; ctx.fillRect(c.x + 2, py + 1, c.w - 4, Math.max(4, c.y + c.h - py - 2))
                }
                void dy
            } else {
                // closed face
                ctx.fillStyle = edge; ctx.fillRect(c.x, c.y, c.w, c.h)
                ctx.fillStyle = body; ctx.fillRect(c.x + 2, c.y + 2, c.w - 4, c.h - 4)
                ctx.fillStyle = '#5c6a74'; ctx.fillRect(c.x + c.w / 2 - 7, c.y + 4, 14, 2.4)
                if (c.id === 'dw') {
                    // porthole + program LEDs; the running washer glows and spins
                    ctx.fillStyle = '#1c2c38'; circle(ctx, c.x + c.w / 2, c.y + c.h / 2 + 2, 8); ctx.fill()
                    if (gs2.dwRun) {
                        const spin = tick * 0.25
                        ctx.strokeStyle = '#7ec8ff'; ctx.lineWidth = 1.4
                        for (let k = 0; k < 3; k++) {
                            ctx.beginPath()
                            ctx.arc(c.x + c.w / 2, c.y + c.h / 2 + 2, 5.4, spin + k * 2.1, spin + k * 2.1 + 1.4)
                            ctx.stroke()
                        }
                        const glow = ctx.createRadialGradient(c.x + c.w / 2, c.y + c.h / 2 + 2, 1, c.x + c.w / 2, c.y + c.h / 2 + 2, 12)
                        glow.addColorStop(0, 'rgba(126,200,255,0.35)'); glow.addColorStop(1, 'rgba(126,200,255,0)')
                        ctx.fillStyle = glow; circle(ctx, c.x + c.w / 2, c.y + c.h / 2 + 2, 12); ctx.fill()
                    }
                    for (let k = 0; k < 3; k++) {
                        ctx.fillStyle = gs2.dwRun && tick % 40 < 24 && k === 0 ? '#5dff8f' : gs2.dwRun ? '#2c6a44' : '#2c3a44'
                        ctx.fillRect(c.x + 4 + k * 4, c.y + c.h - 5, 2.4, 2.4)
                    }
                } else {
                    // fridge: ice cube badge
                    ctx.strokeStyle = '#9fc4d8'; ctx.lineWidth = 1
                    ctx.strokeRect(c.x + c.w - 12, c.y + c.h - 12, 7, 7)
                    ctx.beginPath(); ctx.moveTo(c.x + c.w - 8.5, c.y + c.h - 12); ctx.lineTo(c.x + c.w - 8.5, c.y + c.h - 5); ctx.stroke()
                }
            }
            // label tag, below the appliance so the HUD never eats it
            const ty = c.y + c.h + c.doorLen + 2
            ctx.fillStyle = 'rgba(10,8,6,0.55)'; ctx.fillRect(c.x + c.w / 2 - 13, ty, 26, 7)
            ctx.fillStyle = c.id === 'dw' ? '#7ec8ff' : '#a8e6b0'
            ctx.font = 'bold 5px monospace'; ctx.textAlign = 'center'
            ctx.fillText(c.label, c.x + c.w / 2, ty + 5.6)
            ctx.textAlign = 'left'
        },
        drawItem,
        paintRobot: (ctx, gs2, tick, pullKind) => {
            const x = gs2.rx, y = gs2.ry
            const wob = gs2.walk % 16 < 8 ? 0.6 : -0.6
            // shadow
            ctx.fillStyle = 'rgba(0,0,0,0.22)'
            ctx.beginPath(); ctx.ellipse(x, y + 7, 7, 2.6, 0, 0, Math.PI * 2); ctx.fill()
            // treads
            ctx.fillStyle = '#12262e'
            ctx.fillRect(x - 7, y - 6, 3, 12); ctx.fillRect(x + 4, y - 6, 3, 12)
            ctx.fillStyle = '#274652'
            const treadOff = (tick * 1.4) % 4
            for (let t = -6; t < 6; t += 4) {
                const ty = y + t + (treadOff % 4)
                ctx.fillRect(x - 7, ty, 3, 1.4); ctx.fillRect(x + 4, ty, 3, 1.4)
            }
            // chassis
            ctx.fillStyle = '#1d3d4a'; ctx.fillRect(x - 5, y - 5.5 + wob * 0.3, 10, 11)
            ctx.fillStyle = '#5fc8de'; ctx.fillRect(x - 4, y - 4.5 + wob * 0.3, 8, 9)
            ctx.fillStyle = '#8fe0ee'; ctx.fillRect(x - 4, y - 4.5 + wob * 0.3, 8, 2)
            // visor + eye (looks where it walks)
            const d = { up: [0, -1.4], down: [0, 1.4], left: [-1.4, 0], right: [1.4, 0] }[gs2.facing]
            ctx.fillStyle = '#0e2028'; ctx.fillRect(x - 3, y - 2.5 + wob * 0.3, 6, 3.4)
            ctx.fillStyle = tick % 90 < 6 ? '#fff2a0' : '#ffc23f'
            circle(ctx, x + d[0], y - 0.8 + d[1] + wob * 0.3, 1.3); ctx.fill()
            // antenna bob
            ctx.strokeStyle = '#2c5f6e'; ctx.lineWidth = 1
            ctx.beginPath(); ctx.moveTo(x + 2.5, y - 5); ctx.lineTo(x + 3.5 + Math.sin(tick * 0.08) * 1.2, y - 9.5); ctx.stroke()
            ctx.fillStyle = '#ff6a5c'; circle(ctx, x + 3.5 + Math.sin(tick * 0.08) * 1.2, y - 10, 1.3); ctx.fill()
            // held cargo (#2266): front arm floats over the head with a bob;
            // the tray arm holds a steel serving tray out front that tilts
            // with every step — carrying two reads as HEAVY at a glance
            const front = gs2.items.find((it) => it.state === 'held' && it.id === gs2.held)
            const tray = gs2.items.find((it) => it.state === 'held' && it.id === gs2.held2)
            if (front && !(pullKind && pullKind === front.kind)) { // #2343 while its reach arc flies, the arc IS the front cargo
                ctx.fillStyle = 'rgba(255,255,255,0.10)'
                circle(ctx, x, y - 16 + Math.sin(tick * 0.1) * 1, 5); ctx.fill()
                drawItem(ctx, front.kind, x, y - 16 + Math.sin(tick * 0.1) * 1, 0.9)
            }
            if (tray) {
                const fd = { up: [0, -11], down: [0, 11], left: [-11, 0], right: [11, 0] }[gs2.facing]
                const tilt = Math.sin(gs2.walk * 0.3) * 0.14
                ctx.save(); ctx.translate(x + fd[0], y + fd[1]); ctx.rotate(tilt)
                ctx.fillStyle = 'rgba(0,0,0,0.18)'
                ctx.beginPath(); ctx.ellipse(0, 4.4, 8.4, 2, 0, 0, Math.PI * 2); ctx.fill()
                ctx.fillStyle = '#5c6a74'; ctx.fillRect(-8.5, 1.6, 17, 2.6)
                ctx.fillStyle = '#b9c4cc'; ctx.fillRect(-8.5, 0.6, 17, 1.4)
                ctx.fillStyle = '#7e8c96'; ctx.fillRect(-8.5, 0.6, 1.4, 3.6); ctx.fillRect(7.1, 0.6, 1.4, 3.6)
                drawItem(ctx, tray.kind, 0, -3.4 + Math.sin(tick * 0.13) * 0.5, 0.82)
                ctx.restore()
            }
        },
        paintHud: (ctx, gs2, tick) => {
            ctx.fillStyle = 'rgba(16,10,8,0.78)'; ctx.fillRect(0, 0, VIEW_W, 26)
            ctx.fillStyle = 'rgba(255,220,160,0.12)'; ctx.fillRect(0, 25, VIEW_W, 1)
            ctx.font = 'bold 8px monospace'
            ctx.fillStyle = '#c8a06a'; ctx.fillText('SCORE', 6, 8)
            ctx.fillStyle = '#ffffff'; ctx.font = 'bold 11px monospace'
            ctx.fillText(String(gs2.score).padStart(5, '0'), 6, 19)
            // level + clock
            ctx.textAlign = 'center'
            ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 7px monospace'
            ctx.fillText(`LEVEL ${gs2.level + 1}`, VIEW_W / 2, 8)
            const clockLeft = gs2.clock / LEVELS[Math.min(gs2.level, LEVELS.length - 1)]
            ctx.fillStyle = '#3a2c22'; ctx.fillRect(VIEW_W / 2 - 42, 11, 84, 4)
            ctx.fillStyle = clockLeft < 0.2 ? (tick % 20 < 10 ? '#ff5a4f' : '#7c2f28') : '#e8b04a'
            ctx.fillRect(VIEW_W / 2 - 42, 11, 84 * Math.max(0, clockLeft), 4)
            const m = Math.max(0, Math.ceil(gs2.clock / 60))
            ctx.fillStyle = '#f0e0c0'; ctx.font = 'bold 6px monospace'
            ctx.fillText(`${m}s`, VIEW_W / 2, 22)
            // chores — bottom-right corner, out of the main routes
            ctx.textAlign = 'left'
            ctx.font = '6px monospace'
            let cy = 176
            ctx.fillStyle = 'rgba(16,10,8,0.66)'
            ctx.fillRect(VIEW_W - 74, cy - 6, 70, gs2.chores.length * 8 + 4)
            for (const c of gs2.chores) {
                ctx.fillStyle = c.done ? '#5dff8f' : '#d8c8a8'
                ctx.fillText(`${c.done ? '✔' : '·'} ${c.label}`, VIEW_W - 70, cy)
                cy += 8
            }
            // tidy meter, in the HUD strip's right corner
            const roll = gs2.tidies + gs2.jams + gs2.wrongs + gs2.spills + gs2.breaks
            const pct = roll ? gs2.tidies / roll : 1
            ctx.fillStyle = 'rgba(16,10,8,0.66)'; ctx.fillRect(VIEW_W - 50, 4, 46, 10)
            ctx.fillStyle = '#c8a06a'; ctx.font = 'bold 5px monospace'
            ctx.fillText('TIDY', VIEW_W - 48, 9)
            ctx.fillStyle = '#3a2c22'; ctx.fillRect(VIEW_W - 48, 10, 40, 2.5)
            ctx.fillStyle = pct > 0.75 ? '#5dff8f' : pct > 0.45 ? '#ffd23f' : '#ff5a4f'
            ctx.fillRect(VIEW_W - 48, 10, 40 * pct, 2.5)
        },
        paintAttract: (ctx, tick, best) => {
            ctx.fillStyle = 'rgba(12,8,5,0.62)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H)
            ctx.textAlign = 'center'
            const bob = Math.sin(tick * 0.05) * 2
            ctx.fillStyle = 'rgba(20,14,9,0.88)'; ctx.fillRect(VIEW_W / 2 - 110, 46 + bob, 220, 46)
            ctx.strokeStyle = '#c8a06a'; ctx.lineWidth = 2; ctx.strokeRect(VIEW_W / 2 - 110, 46 + bob, 220, 46)
            ctx.font = 'bold 22px monospace'
            ctx.fillStyle = '#5fc8de'; ctx.fillText('TIDY', VIEW_W / 2 - 36, 76 + bob)
            ctx.fillStyle = '#ffd23f'; ctx.fillText('BOT', VIEW_W / 2 + 30, 76 + bob)
            ctx.font = 'bold 7px monospace'; ctx.fillStyle = '#c8a06a'
            ctx.fillText('HOUSEHOLD CHORE SERVICE — 24/7', VIEW_W / 2, 88 + bob)
            if (tick % 60 < 40) {
                ctx.font = 'bold 9px monospace'; ctx.fillStyle = '#ffffff'
                ctx.fillText('PRESS ANY KEY / TAP TO CLOCK IN', VIEW_W / 2, 118)
            }
            if (best) {
                ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 8px monospace'
                ctx.fillText(`BEST ROUND: ${best}`, VIEW_W / 2, 136)
            }
            ctx.textAlign = 'left'
        },
        paintOver: (ctx, gs2, tick) => {
            ctx.fillStyle = 'rgba(12,8,5,0.78)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H)
            ctx.textAlign = 'center'
            const won = gs2.end === 'win'
            ctx.font = 'bold 16px monospace'
            ctx.fillStyle = won ? '#5dff8f' : '#ff5a4f'
            ctx.fillText(won ? 'HOUSE SPOTLESS!' : 'THE HOUSE WINS', VIEW_W / 2, 84)
            ctx.font = '8px monospace'; ctx.fillStyle = '#c8a06a'
            ctx.fillText(gs2.endReason, VIEW_W / 2, 100)
            ctx.font = 'bold 12px monospace'; ctx.fillStyle = '#ffffff'
            ctx.fillText(`SCORE ${gs2.score}`, VIEW_W / 2, 126)
            ctx.font = '7px monospace'; ctx.fillStyle = '#c8a06a'
            ctx.fillText(`TIDY ${gs2.tidies} · JAMS ${gs2.jams} · SPILLS ${gs2.spills} · WRONG ${gs2.wrongs} · SMASHED ${gs2.breaks}`, VIEW_W / 2, 140)
            if (tick % 60 < 40) {
                ctx.font = 'bold 9px monospace'; ctx.fillStyle = '#ffffff'
                ctx.fillText('PRESS ANY KEY TO CLOCK BACK IN', VIEW_W / 2, 168)
            }
            ctx.textAlign = 'left'
        },
    }
}

// ------------------------------------------------------------- reimagined ----
// PAPERCRAFT DIORAMA (#3078): construction paper, card stock, washi tape and
// marker ink. The house is bright daylight craft instead of dusk dollhouse;
// elements are cut cards (rounded corners, hard offset shadows, dashed
// cut-lines, fold creases, a few degrees of tilt). Signatures survive: the
// bot's mint card still reads teal, the apple cutout still reads tomato red,
// so both skins stay sampleable by the same pixel laws.
const PAPER = {
    tileA: '#e2f0e6', tileB: '#d2e8da', gap: '#fbfdf8', grain: 'rgba(110,130,110,0.10)',
    coral: '#f0a888', coralDark: '#d1755a', coralLight: '#ffd6c0',
    kraft: '#a06a34', crease: '#d8a468', wallShadow: 'rgba(80,48,18,0.35)',
    sky: '#bfe0ee', skyEdge: '#7fb2cc', ink: '#2f5f86',
    cream: '#f6efdd', creamEdge: '#d8c284', washi: '#9fd0e8',
    note: '#ffe36e', noteInk: '#6b4a2a',
    cardShadow: 'rgba(70,44,18,0.38)',
    mint: '#4dc9b0', mintEdge: '#2f9e88',
    tomato: '#e0483a', tomatoDark: '#b23226', leaf: '#57b06a',
    brass: '#e0b23a', pop: '#e8442e', stick: '#c99b5e', stickDark: '#9a7038',
    green: '#2f9e52', amber: '#e0a12a', red: '#d8402e',
}

const makeReimagined = () => {
    const bg = makeBg()
    // hard offset card shadow: the diorama's whole signature
    const card = (ctx, x, y, w, h, r, fill, edge) => {
        ctx.fillStyle = PAPER.cardShadow; rr(ctx, x + 1.5, y + 2, w, h, r); ctx.fill()
        ctx.fillStyle = fill; rr(ctx, x, y, w, h, r); ctx.fill()
        if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = 1; rr(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r); ctx.stroke() }
    }
    // strip of washi tape — the diorama's staple
    const tape = (ctx, x, y, w, h, tilt = 0) => {
        ctx.save(); ctx.translate(x, y); ctx.rotate(tilt)
        ctx.fillStyle = 'rgba(159,208,232,0.85)'; ctx.fillRect(-w / 2, -h / 2, w, h)
        ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(-w / 2, -h / 2, w, 1)
        ctx.restore()
    }
    const drawItem = (ctx, kind, x, y, s = 1) => {
        ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.rotate(-0.05)
        ctx.setLineDash([2, 1.6]); ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1
        if (kind === 'plate') {
            ctx.fillStyle = PAPER.cardShadow; circle(ctx, 1.2, 1.6, 6.5); ctx.fill()
            ctx.fillStyle = '#8fb8d4'; circle(ctx, 0, 0, 6.5); ctx.fill(); ctx.stroke()
            ctx.fillStyle = '#eaf4fa'; circle(ctx, 0, 0, 4.4); ctx.fill()
            ctx.strokeStyle = PAPER.ink; ctx.setLineDash([]); circle(ctx, 0, 0, 2.6); ctx.stroke()
        } else if (kind === 'cup') {
            ctx.fillStyle = PAPER.cardShadow; circle(ctx, 1.2, 1.6, 4.6); ctx.fill()
            ctx.fillStyle = PAPER.tomato; circle(ctx, 0, 0, 4.6); ctx.fill(); ctx.stroke()
            ctx.fillStyle = '#f28a7a'; circle(ctx, 0, 0, 3); ctx.fill()
            ctx.strokeStyle = PAPER.tomato; ctx.setLineDash([]); ctx.lineWidth = 1.6
            ctx.beginPath(); ctx.arc(4.4, 0, 1.9, -Math.PI / 2, Math.PI / 2); ctx.stroke()
        } else if (kind === 'apple') {
            ctx.fillStyle = PAPER.cardShadow; circle(ctx, 1.2, 1.6, 4.8); ctx.fill()
            ctx.fillStyle = PAPER.tomato; circle(ctx, 0, 0, 4.8); ctx.fill(); ctx.stroke()
            ctx.setLineDash([]); ctx.rotate(0.05)
            ctx.fillStyle = PAPER.leaf; ctx.beginPath(); ctx.ellipse(2.4, -3.6, 2.6, 1.4, -0.5, 0, Math.PI * 2); ctx.fill()
            ctx.fillStyle = PAPER.stickDark; ctx.fillRect(-0.7, -5.8, 1.4, 2.6)
        } else {
            ctx.fillStyle = PAPER.cardShadow; rr(ctx, -3.5 + 1.2, -4.5 + 1.6, 7, 9.5, 1); ctx.fill()
            ctx.fillStyle = '#9fd4ee'; rr(ctx, -3.5, -4.5, 7, 9.5, 1); ctx.fill(); ctx.stroke()
            ctx.setLineDash([]); ctx.rotate(0.05)
            ctx.fillStyle = PAPER.sky
            ctx.beginPath(); ctx.moveTo(-3.5, -4.5); ctx.lineTo(0, -6.8); ctx.lineTo(3.5, -4.5); ctx.closePath(); ctx.fill()
            ctx.strokeStyle = PAPER.skyEdge; ctx.stroke()
            ctx.fillStyle = PAPER.brass; ctx.fillRect(-1.4, 0.4, 2.8, 2.6)
        }
        ctx.setLineDash([]); ctx.restore()
    }
    return {
        chrome: {
            ring: 'rgba(224,72,58,0.9)', ringSoft: 'rgba(224,72,58,0.35)', dot: 'rgba(242,138,122,0.9)',
            bracket: 'rgba(216,64,46,0.95)', tag: 'rgba(47,95,134,0.95)',
            arcFlash: '255,227,110', arcTail: '255,240,190',
            fxText: { ok: PAPER.green, jam: PAPER.amber, bad: PAPER.red },
            burst: { grab: '#ffdf6e', place: PAPER.green, jam: PAPER.amber, spill: '#e8c9a0', shard: '#f6f2e8', heavy: '#c99b5e' },
            dust: { plankH: '#c97a58', tileH: '#b8d4c0', plank: PAPER.coralLight, tile: '#eef6ef' },
            // #3086: on this skin, event bursts fly as tilted paper confetti in
            // construction-paper colors instead of square pixels. The shell reads
            // this key to opt in — classic has no `confetti` and stays square.
            confetti: [PAPER.tomato, PAPER.note, PAPER.mint, PAPER.washi, PAPER.coralLight, PAPER.leaf],
            ringPop: '242,138,122',
            banner: PAPER.tomato, level: PAPER.green,
        },
        paintRooms: (ctx) => {
            // kitchen: pale-mint paper tiles with white cut-gaps
            ctx.fillStyle = PAPER.tileA; ctx.fillRect(WALL, WALL, VIEW_W - WALL * 2, VIEW_H - WALL * 2)
            for (let ty = WALL; ty < VIEW_H - WALL; ty += 16) {
                for (let tx = WALL; tx < VIEW_W - WALL; tx += 16) {
                    if (((tx + ty) / 16) % 2 !== 0) { ctx.fillStyle = PAPER.tileB; ctx.fillRect(tx + 0.5, ty + 0.5, 15, 15) }
                    ctx.strokeStyle = PAPER.gap; ctx.lineWidth = 1; ctx.strokeRect(tx + 0.5, ty + 0.5, 15, 15)
                }
            }
            // dining: one coral paper sheet with dashed cut-lines
            ctx.fillStyle = PAPER.coral; ctx.fillRect(TABLE.x - 20, 100, VIEW_W - WALL - TABLE.x + 20, VIEW_H - WALL - 100)
            ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = PAPER.coralDark; ctx.lineWidth = 1
            for (const p of bg('cut', 7, (r) => [TABLE.x - 16 + Math.floor(r() * 130), 104 + Math.floor(r() * 118)])) {
                ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + 22, p[1]); ctx.stroke()
            }
            ctx.strokeStyle = 'rgba(255,214,192,0.8)'
            for (const p of bg('cut2', 5, (r) => [TABLE.x - 14 + Math.floor(r() * 120), 106 + Math.floor(r() * 114)])) {
                ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + 16, p[1]); ctx.stroke()
            }
            ctx.restore()
            // the coral sheet's edge over the kitchen floor
            ctx.fillStyle = PAPER.coralDark; ctx.fillRect(TABLE.x - 20, 100, VIEW_W - WALL - TABLE.x + 20, 1)
            // paper grain over all floors
            ctx.fillStyle = PAPER.grain
            for (const g of bg('grain', 60, (r) => [WALL + Math.floor(r() * 29) * 10, WALL + Math.floor(r() * 21) * 10])) ctx.fillRect(g[0], g[1], 1, 1)
            // walls: deep kraft card with fold creases and inner drop-shadows
            ctx.fillStyle = PAPER.kraft
            ctx.fillRect(0, 0, VIEW_W, WALL); ctx.fillRect(0, VIEW_H - WALL, VIEW_W, WALL)
            ctx.fillRect(0, 0, WALL, VIEW_H); ctx.fillRect(VIEW_W - WALL, 0, WALL, VIEW_H)
            ctx.fillStyle = PAPER.crease
            ctx.fillRect(0, 0, VIEW_W, 2); ctx.fillRect(0, VIEW_H - WALL + 1, VIEW_W, 2)
            ctx.fillRect(0, 0, 2, VIEW_H); ctx.fillRect(VIEW_W - WALL + 1, 0, 2, VIEW_H)
            ctx.fillStyle = PAPER.wallShadow
            ctx.fillRect(WALL, WALL, VIEW_W - WALL * 2, 2); ctx.fillRect(WALL, WALL, 2, VIEW_H - WALL * 2)
            ctx.fillRect(VIEW_W - WALL - 2, WALL, 2, VIEW_H - WALL * 2 - 2); ctx.fillRect(WALL, VIEW_H - WALL - 2, VIEW_W - WALL * 2, 2)
        },
        paintCounter: (ctx) => {
            // laminate counter: sky-paper card, sink cut into it
            card(ctx, COUNTER.x, COUNTER.y, COUNTER.w, COUNTER.h, 2, '#d8ecf4', PAPER.skyEdge)
            ctx.fillStyle = 'rgba(127,178,204,0.35)'
            for (const s of bg('lam', 50, (r) => [COUNTER.x + 2 + Math.floor(r() * (COUNTER.w - 4)), COUNTER.y + 2 + Math.floor(r() * (COUNTER.h - 4))])) ctx.fillRect(s[0], s[1], 1, 1)
            ctx.fillStyle = PAPER.sky; rr(ctx, 122, COUNTER.y + 4, 30, COUNTER.h - 8, 3); ctx.fill()
            ctx.fillStyle = '#8fc4da'; rr(ctx, 124, COUNTER.y + 6, 26, COUNTER.h - 12, 2); ctx.fill()
            ctx.fillStyle = '#ffffff'; ctx.fillRect(126, COUNTER.y + 7, 8, 2)
            ctx.fillStyle = PAPER.ink; ctx.fillRect(136, COUNTER.y + 2, 2, 5)
            // stove: charcoal card with button burners
            card(ctx, STOVE.x, STOVE.y, STOVE.w, STOVE.h, 2, '#5a6a74', '#3e4c55')
            for (const [ox, oy] of [[7, 6], [20, 6], [7, 15], [20, 15]]) {
                ctx.fillStyle = '#2e3a42'; circle(ctx, STOVE.x + ox, STOVE.y + oy, 3.4); ctx.fill()
                ctx.strokeStyle = '#c8d2d8'; ctx.lineWidth = 1; ctx.setLineDash([1.5, 1.5]); circle(ctx, STOVE.x + ox, STOVE.y + oy, 3.4); ctx.stroke()
            }
            ctx.setLineDash([])
            // #3086 sticky brass dials on the stove front — same family as the
            // fridge's sticky-note badge: tilted card square, marker knob notch.
            for (const ox of [4.5, 27.5]) {
                ctx.save(); ctx.translate(STOVE.x + ox, STOVE.y + 19); ctx.rotate(0.08)
                ctx.fillStyle = 'rgba(70,44,18,0.3)'; ctx.fillRect(-1.3, -0.8, 3.6, 3.6)
                ctx.fillStyle = PAPER.brass; ctx.fillRect(-1.8, -1.8, 3.6, 3.6)
                ctx.strokeStyle = '#8a6a1e'; ctx.lineWidth = 0.8
                ctx.beginPath(); ctx.moveTo(0, 0.2); ctx.lineTo(0, -1.5); ctx.stroke()
                ctx.restore()
            }
            // plants: tissue puffs in terracotta card pots
            for (const p of PLANTS) {
                card(ctx, p.x + 1, p.y + 5, p.w - 2, p.h - 5, 1.5, '#d1755a')
                ctx.fillStyle = '#6cc47e'; circle(ctx, p.x + p.w / 2, p.y + 4, 5); ctx.fill()
                ctx.fillStyle = '#8fd89a'; circle(ctx, p.x + p.w / 2 - 2, p.y + 2, 2.6); ctx.fill()
            }
        },
        paintTable: (ctx) => {
            card(ctx, TABLE.x - 2, TABLE.y - 2, TABLE.w + 4, TABLE.h + 4, 3, PAPER.coralDark, '#a05636')
            ctx.save(); ctx.translate(TABLE.x + TABLE.w / 2, TABLE.y + TABLE.h / 2); ctx.rotate(-0.012); ctx.translate(-(TABLE.x + TABLE.w / 2), -(TABLE.y + TABLE.h / 2))
            // gingham cloth (#3086): a cream card cut with wavy edges, over-printed
            // with 6px red bands at 0.6 alpha — where bands cross, the print darkens
            // into the checks, which is how real gingham reads. The first pass' 8px
            // grid at 0.85 read as a keyboard, not a picnic cloth.
            const x0 = TABLE.x + 8, y0 = TABLE.y + 6, cw = TABLE.w - 16, ch = TABLE.h - 12
            const base = y0 + ch
            ctx.beginPath()
            ctx.moveTo(x0, y0)
            ctx.lineTo(x0 + cw, y0 + 0.6)
            ctx.quadraticCurveTo(x0 + cw + 0.9, y0 + ch * 0.5, x0 + cw - 0.4, base - 1)
            const seg = cw / 4 // four gentle scallops along the bottom cut
            for (let i = 0; i < 4; i++) {
                const xa = x0 + cw - seg * i, xb = x0 + cw - seg * (i + 1)
                const ya = base - (i % 2 ? 1 : 0.2)
                const yb = base - ((i + 1) % 2 ? 1 : 0.2)
                ctx.quadraticCurveTo((xa + xb) / 2, (ya + yb) / 2 + (i % 2 ? -1.3 : 1.3), xb, yb)
            }
            ctx.lineTo(x0, y0)
            ctx.closePath()
            ctx.fillStyle = PAPER.cream; ctx.fill()
            ctx.save(); ctx.clip() // bands trim to the wavy cut
            ctx.fillStyle = 'rgba(224,72,58,0.6)'
            for (let gy = y0 - 2; gy < base + 2; gy += 6) ctx.fillRect(x0 - 2, gy, cw + 4, 2)
            for (let gx = x0 - 2; gx < x0 + cw + 2; gx += 6) ctx.fillRect(gx, y0 - 2, 2, ch + 4)
            ctx.restore()
            ctx.restore()
        },
        paintContainer: (ctx, c, gs2, tick, skip) => {
            const cc = c.id === 'dw' ? gs2.dw : gs2.fr
            const openT = Math.min(1, cc.door)
            const body = c.id === 'dw' ? PAPER.sky : PAPER.cream
            const edge = c.id === 'dw' ? PAPER.skyEdge : PAPER.creamEdge
            // the folded box: cavity card first
            card(ctx, c.x, c.y, c.w, c.h, 2, c.id === 'dw' ? '#7fb0c8' : '#e4d6ac')
            ctx.fillStyle = c.id === 'dw' ? '#5f93ac' : '#cdbc8e'
            rr(ctx, c.x + 2, c.y + 2, c.w - 4, c.h - 4, 1.5); ctx.fill()
            // rack: dashed pencil lines on the cavity card
            ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1; ctx.setLineDash([2, 2])
            for (let r = 0; r < RACK_ROWS; r++) {
                const ry = rackSlot(c, r * RACK_COLS).y + 5
                if (ry > c.y + c.h - 3) continue
                ctx.beginPath(); ctx.moveTo(c.x + 4, ry); ctx.lineTo(c.x + c.w - 4, ry); ctx.stroke()
            }
            ctx.setLineDash([])
            const inside = gs2.items.filter((it) => it.state === 'in' && it.cont === c.id)
            inside.forEach((it, i) => {
                const sl = it.slot === null || it.slot === undefined ? i : it.slot
                if (skip && skip.c === c.id && skip.slot === sl % RACK_CAP && skip.kind === it.kind) return
                const p = rackSlot(c, sl % RACK_CAP)
                drawItem(ctx, it.kind, p.x, p.y, 0.78)
            })
            // door: a card panel that flips down over the cavity front
            const dH = c.h + c.doorLen - 4
            if (openT > 0.02) {
                const panelY = c.y + 2 + dH * openT - (dH - (c.h - 4))
                const py = Math.max(c.y + 2, panelY)
                if (openT >= 0.99) {
                    card(ctx, c.x, c.y + c.h, c.w, c.doorLen, 2, body, edge)
                    ctx.fillStyle = PAPER.ink; rr(ctx, c.x + c.w / 2 - 7, c.y + c.h + 3, 14, 2.4, 1.2); ctx.fill()
                    tape(ctx, c.x + 4, c.y + c.h + c.doorLen - 2, 9, 3, -0.2)
                } else {
                    card(ctx, c.x, py, c.w, Math.max(6, c.y + c.h - py), 2, body, edge)
                }
            } else {
                // closed face: the appliance's card front
                card(ctx, c.x, c.y, c.w, c.h, 2, body, edge)
                ctx.fillStyle = PAPER.ink; rr(ctx, c.x + c.w / 2 - 7, c.y + 4, 14, 2.4, 1.2); ctx.fill()
                if (c.id === 'dw') {
                    // porthole punched out of the card; running cycle glows through
                    ctx.fillStyle = '#20506e'; circle(ctx, c.x + c.w / 2, c.y + c.h / 2 + 2, 8); ctx.fill()
                    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1; ctx.setLineDash([2, 2]); circle(ctx, c.x + c.w / 2, c.y + c.h / 2 + 2, 8); ctx.stroke(); ctx.setLineDash([])
                    if (gs2.dwRun) {
                        const spin = tick * 0.25
                        ctx.strokeStyle = '#8fe6ff'; ctx.lineWidth = 1.6
                        for (let k = 0; k < 3; k++) {
                            ctx.beginPath()
                            ctx.arc(c.x + c.w / 2, c.y + c.h / 2 + 2, 5.4, spin + k * 2.1, spin + k * 2.1 + 1.4)
                            ctx.stroke()
                        }
                        const glow = ctx.createRadialGradient(c.x + c.w / 2, c.y + c.h / 2 + 2, 1, c.x + c.w / 2, c.y + c.h / 2 + 2, 12)
                        glow.addColorStop(0, 'rgba(143,230,255,0.4)'); glow.addColorStop(1, 'rgba(143,230,255,0)')
                        ctx.fillStyle = glow; circle(ctx, c.x + c.w / 2, c.y + c.h / 2 + 2, 12); ctx.fill()
                    }
                    for (let k = 0; k < 3; k++) {
                        ctx.fillStyle = gs2.dwRun && tick % 40 < 24 && k === 0 ? PAPER.green : gs2.dwRun ? '#8fc79c' : '#c3d4da'
                        rr(ctx, c.x + 4 + k * 4, c.y + c.h - 5, 2.4, 2.4, 1.2); ctx.fill()
                    }
                } else {
                    // fridge: sticky-note badge with a marker ice cube
                    ctx.save(); ctx.translate(c.x + c.w - 11, c.y + c.h - 11); ctx.rotate(0.06)
                    ctx.fillStyle = 'rgba(70,44,18,0.3)'; ctx.fillRect(-4.5 + 1, -4.5 + 1.5, 10, 10)
                    ctx.fillStyle = PAPER.note; ctx.fillRect(-4.5, -4.5, 10, 10)
                    ctx.strokeStyle = PAPER.ink; ctx.lineWidth = 1
                    ctx.strokeRect(-2.5, -2.5, 5, 5)
                    ctx.beginPath(); ctx.moveTo(0, -2.5); ctx.lineTo(0, 2.5); ctx.stroke()
                    ctx.restore()
                }
            }
            // sticky-note name tag below the appliance (never under the HUD)
            const ty = c.y + c.h + c.doorLen + 2
            ctx.save(); ctx.translate(c.x + c.w / 2, ty + 3.5); ctx.rotate(-0.03)
            ctx.fillStyle = 'rgba(70,44,18,0.3)'; ctx.fillRect(-13 + 1, -3.5 + 1.5, 26, 7)
            ctx.fillStyle = PAPER.note; ctx.fillRect(-13, -3.5, 26, 7)
            ctx.fillStyle = c.id === 'dw' ? PAPER.ink : PAPER.green
            ctx.font = 'bold 5px monospace'; ctx.textAlign = 'center'
            ctx.fillText(c.label, 0, 0.6)
            ctx.restore(); ctx.textAlign = 'left'
        },
        drawItem,
        paintRobot: (ctx, gs2, tick, pullKind) => {
            const x = gs2.rx, y = gs2.ry
            const wob = gs2.walk % 16 < 8 ? 0.6 : -0.6
            const rock = Math.sin(gs2.walk * 0.25) * 0.03
            // hard card shadow on the floor
            ctx.fillStyle = 'rgba(70,44,18,0.32)'
            rr(ctx, x - 8 + 2, y - 8 + 3, 16, 16, 3); ctx.fill()
            ctx.save(); ctx.translate(x, y); ctx.rotate(rock)
            // popsicle-stick treads
            card(ctx, -7.5, -6, 3.4, 12, 1.6, PAPER.stick)
            card(ctx, 4.1, -6, 3.4, 12, 1.6, PAPER.stick)
            ctx.fillStyle = PAPER.stickDark
            const treadOff = (tick * 1.4) % 4
            for (let t = -6; t < 6; t += 4) {
                const ty = t + (treadOff % 4)
                ctx.fillRect(-7, ty + wob * 0.3, 2.4, 1.2); ctx.fillRect(4.6, ty + wob * 0.3, 2.4, 1.2)
            }
            // chassis: kraft card with fold flaps, mint painted front
            const cTop = -5.5 + wob * 0.3
            card(ctx, -5.5, cTop, 11, 11, 2, PAPER.stick, PAPER.stickDark)
            ctx.fillStyle = PAPER.stickDark // shoulder folds
            ctx.fillRect(-5.5, cTop + 1, 1.4, 1.2); ctx.fillRect(4.1, cTop + 1, 1.4, 1.2)
            ctx.fillStyle = PAPER.mint; rr(ctx, -4, cTop + 1, 8, 9, 1.5); ctx.fill()
            ctx.strokeStyle = PAPER.mintEdge; ctx.lineWidth = 1; ctx.setLineDash([2, 1.5]); rr(ctx, -4.5, cTop + 0.5, 9, 10, 2); ctx.stroke(); ctx.setLineDash([])
            ctx.fillStyle = '#8adcc8'; ctx.fillRect(-4, cTop + 1, 8, 2)
            ctx.fillStyle = '#7c5426' // #3086 corrugation peek — flute dots where the card's bottom edge tore
            for (const dx of [-2.4, 0, 2.4]) { circle(ctx, dx, cTop + 10.1, 0.9); ctx.fill() }
            // face: white card strip, brass brad eye looks where it walks.
            // The card stays SHORT (bottom ≤ world +0.2 below center) so the
            // mint body remains visible in the 5×5 core sample — the same
            // pixel law tidycheck uses to prove the bot is painted on-sim.
            const d = { up: [0, -1.4], down: [0, 1.4], left: [-1.4, 0], right: [1.4, 0] }[gs2.facing]
            ctx.fillStyle = PAPER.cream; rr(ctx, -3.4, -2.6 + wob * 0.3, 6.8, 2.8, 1.4); ctx.fill()
            ctx.fillStyle = PAPER.brass; circle(ctx, d[0], -0.9 + d[1] + wob * 0.3, 1.35); ctx.fill()
            ctx.fillStyle = '#8a6a1e'; circle(ctx, d[0], -0.9 + d[1] + wob * 0.3, 0.55); ctx.fill()
            ctx.restore()
            // wire-and-pom antenna
            ctx.strokeStyle = PAPER.stickDark; ctx.lineWidth = 1
            ctx.beginPath(); ctx.moveTo(x + 2.5, y - 5); ctx.lineTo(x + 3.5 + Math.sin(tick * 0.08) * 1.2, y - 9.5); ctx.stroke()
            ctx.fillStyle = PAPER.pop; circle(ctx, x + 3.5 + Math.sin(tick * 0.08) * 1.2, y - 10, 1.5); ctx.fill()
            ctx.fillStyle = 'rgba(255,255,255,0.5)'; circle(ctx, x + 3 + Math.sin(tick * 0.08) * 1.2, y - 10.5, 0.5); ctx.fill()
            tape(ctx, x + 2.5, y - 4.8 + wob * 0.3, 6, 3, 0.5) // #3086 washi patch over the antenna joint
            // held cargo: the front cutout floats, the tray is a popsicle plank
            const front = gs2.items.find((it) => it.state === 'held' && it.id === gs2.held)
            const tray = gs2.items.find((it) => it.state === 'held' && it.id === gs2.held2)
            if (front && !(pullKind && pullKind === front.kind)) {
                ctx.fillStyle = 'rgba(255,255,255,0.18)'
                circle(ctx, x, y - 16 + Math.sin(tick * 0.1) * 1, 5); ctx.fill()
                drawItem(ctx, front.kind, x, y - 16 + Math.sin(tick * 0.1) * 1, 0.9)
            }
            if (tray) {
                const fd = { up: [0, -11], down: [0, 11], left: [-11, 0], right: [11, 0] }[gs2.facing]
                const tilt = Math.sin(gs2.walk * 0.3) * 0.14
                ctx.save(); ctx.translate(x + fd[0], y + fd[1]); ctx.rotate(tilt)
                ctx.fillStyle = 'rgba(70,44,18,0.3)'
                rr(ctx, -8.5 + 1, 0.6 + 2, 17, 4, 2); ctx.fill()
                ctx.fillStyle = PAPER.stick; rr(ctx, -8.5, 0.6, 17, 3.6, 2); ctx.fill()
                ctx.fillStyle = PAPER.stickDark; ctx.fillRect(-8.5, 0.6, 1.4, 3.6); ctx.fillRect(7.1, 0.6, 1.4, 3.6)
                drawItem(ctx, tray.kind, 0, -3.4 + Math.sin(tick * 0.13) * 0.5, 0.82)
                ctx.restore()
            }
        },
        paintHud: (ctx, gs2, tick) => {
            // washi strip across the top; marker-ink labels on cream tags
            ctx.fillStyle = 'rgba(63,111,134,0.92)'; ctx.fillRect(0, 0, VIEW_W, 26)
            ctx.fillStyle = 'rgba(159,208,232,0.5)'; ctx.fillRect(0, 24, VIEW_W, 2)
            ctx.save(); ctx.translate(20, 11); ctx.rotate(-0.02)
            ctx.fillStyle = 'rgba(70,44,18,0.3)'; ctx.fillRect(-14 + 1, -8 + 1.5, 28, 16)
            ctx.fillStyle = PAPER.cream; ctx.fillRect(-14, -8, 28, 16)
            ctx.fillStyle = PAPER.noteInk; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center'
            ctx.fillText('SCORE', 0, -1)
            ctx.fillStyle = '#1d3d4a'; ctx.font = 'bold 11px monospace'
            ctx.fillText(String(gs2.score).padStart(5, '0'), 0, 7)
            ctx.restore(); ctx.textAlign = 'left'
            // level + clock on a centered card
            ctx.fillStyle = 'rgba(70,44,18,0.3)'; ctx.fillRect(VIEW_W / 2 - 44 + 1, 3 + 1.5, 88, 19)
            ctx.fillStyle = PAPER.cream; ctx.fillRect(VIEW_W / 2 - 44, 3, 88, 19)
            ctx.textAlign = 'center'
            ctx.fillStyle = PAPER.tomato; ctx.font = 'bold 7px monospace'
            ctx.fillText(`LEVEL ${gs2.level + 1}`, VIEW_W / 2, 10)
            const clockLeft = gs2.clock / LEVELS[Math.min(gs2.level, LEVELS.length - 1)]
            ctx.fillStyle = '#cdbc8e'; ctx.fillRect(VIEW_W / 2 - 42, 12, 84, 4)
            ctx.fillStyle = clockLeft < 0.2 ? (tick % 20 < 10 ? PAPER.red : '#f0b0a4') : PAPER.green
            ctx.fillRect(VIEW_W / 2 - 42, 12, 84 * Math.max(0, clockLeft), 4)
            const m = Math.max(0, Math.ceil(gs2.clock / 60))
            ctx.fillStyle = PAPER.noteInk; ctx.font = 'bold 6px monospace'
            ctx.fillText(`${m}s`, VIEW_W / 2, 21)
            // chore list: a long sticky note in the corner
            ctx.textAlign = 'left'
            ctx.font = '6px monospace'
            let cy = 176
            ctx.fillStyle = 'rgba(70,44,18,0.3)'; ctx.fillRect(VIEW_W - 74 + 1, cy - 6 + 1.5, 70, gs2.chores.length * 8 + 4)
            ctx.fillStyle = 'rgba(255,227,110,0.92)'; ctx.fillRect(VIEW_W - 74, cy - 6, 70, gs2.chores.length * 8 + 4)
            tape(ctx, VIEW_W - 40, cy - 6, 12, 3, 0.12)
            for (const c of gs2.chores) {
                ctx.fillStyle = c.done ? PAPER.green : PAPER.noteInk
                ctx.fillText(`${c.done ? '✔' : '·'} ${c.label}`, VIEW_W - 70, cy)
                cy += 8
            }
            // tidy meter on its own tag
            const roll = gs2.tidies + gs2.jams + gs2.wrongs + gs2.spills + gs2.breaks
            const pct = roll ? gs2.tidies / roll : 1
            ctx.fillStyle = 'rgba(70,44,18,0.3)'; ctx.fillRect(VIEW_W - 50 + 1, 4 + 1.5, 46, 10)
            ctx.fillStyle = PAPER.cream; ctx.fillRect(VIEW_W - 50, 4, 46, 10)
            ctx.fillStyle = PAPER.noteInk; ctx.font = 'bold 5px monospace'
            ctx.fillText('TIDY', VIEW_W - 48, 9)
            ctx.fillStyle = '#cdbc8e'; ctx.fillRect(VIEW_W - 48, 10, 40, 2.5)
            ctx.fillStyle = pct > 0.75 ? PAPER.green : pct > 0.45 ? PAPER.amber : PAPER.red
            ctx.fillRect(VIEW_W - 48, 10, 40 * pct, 2.5)
            ctx.textAlign = 'left'
        },
        paintAttract: (ctx, tick, best) => {
            // daylight wash instead of the dark dim
            ctx.fillStyle = 'rgba(255,248,232,0.30)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H)
            ctx.textAlign = 'center'
            const bob = Math.sin(tick * 0.05) * 2
            const bx = VIEW_W / 2 - 110, by = 46 + bob
            // #3086: the title sign is a cut card like every other surface —
            // rounded corners, a horizontal fold crease across the middle, and
            // folded-back corner flaps with their shadows.
            ctx.fillStyle = PAPER.cardShadow; rr(ctx, bx + 2, by + 2.5, 220, 46, 5); ctx.fill()
            ctx.fillStyle = PAPER.cream; rr(ctx, bx, by, 220, 46, 5); ctx.fill()
            ctx.strokeStyle = PAPER.creamEdge; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); rr(ctx, bx + 2.5, by + 2.5, 215, 41, 4); ctx.stroke(); ctx.setLineDash([])
            ctx.strokeStyle = 'rgba(120,90,50,0.26)'; ctx.lineWidth = 1 // fold crease
            ctx.beginPath(); ctx.moveTo(bx + 4, by + 23); ctx.lineTo(bx + 216, by + 23); ctx.stroke()
            ctx.strokeStyle = 'rgba(255,255,255,0.5)'
            ctx.beginPath(); ctx.moveTo(bx + 4, by + 24); ctx.lineTo(bx + 216, by + 24); ctx.stroke()
            ctx.fillStyle = 'rgba(70,44,18,0.22)' // folded-back corner flaps
            ctx.beginPath(); ctx.moveTo(bx + 220, by + 46); ctx.lineTo(bx + 206, by + 46); ctx.lineTo(bx + 220, by + 32); ctx.closePath(); ctx.fill()
            ctx.beginPath(); ctx.moveTo(bx, by + 46); ctx.lineTo(bx + 13, by + 46); ctx.lineTo(bx, by + 33); ctx.closePath(); ctx.fill()
            ctx.strokeStyle = 'rgba(150,110,60,0.5)'
            ctx.beginPath(); ctx.moveTo(bx + 206, by + 46); ctx.lineTo(bx + 220, by + 32); ctx.stroke()
            ctx.beginPath(); ctx.moveTo(bx + 13, by + 46); ctx.lineTo(bx, by + 33); ctx.stroke()
            tape(ctx, bx + 6, by + 2, 16, 4, -0.35)
            tape(ctx, bx + 214, by + 3, 16, 4, 0.3)
            ctx.font = 'bold 22px monospace'
            ctx.fillStyle = PAPER.ink; ctx.fillText('TIDY', VIEW_W / 2 - 36, 76 + bob)
            ctx.fillStyle = PAPER.tomato; ctx.fillText('BOT', VIEW_W / 2 + 30, 76 + bob)
            ctx.font = 'bold 7px monospace'; ctx.fillStyle = PAPER.noteInk
            ctx.fillText('A PAPERCRAFT HOUSE — SAME CHORES', VIEW_W / 2, 88 + bob)
            if (tick % 60 < 40) {
                // #3086: the call-to-action strip is washi with torn short edges
                ctx.fillStyle = 'rgba(255,227,110,0.95)'
                const px0 = VIEW_W / 2 - 78, pw = 156, pt = 111, ph = 12
                ctx.beginPath(); ctx.moveTo(px0, pt); ctx.lineTo(px0 + pw, pt)
                for (let i = 0; i < 4; i++) ctx.lineTo(px0 + pw - (i % 2 ? 2 : 0), pt + (ph * (i + 1)) / 4)
                ctx.lineTo(px0, pt + ph)
                for (let i = 0; i < 4; i++) ctx.lineTo(px0 + (i % 2 ? 1.8 : 0), pt + ph - (ph * i) / 4)
                ctx.closePath(); ctx.fill()
                ctx.font = 'bold 9px monospace'; ctx.fillStyle = PAPER.noteInk
                ctx.fillText('PRESS ANY KEY / TAP TO CLOCK IN', VIEW_W / 2, 119)
            }
            if (best) {
                ctx.fillStyle = PAPER.green; ctx.font = 'bold 8px monospace'
                ctx.fillText(`BEST ROUND: ${best}`, VIEW_W / 2, 136)
            }
            ctx.textAlign = 'left'
        },
        paintOver: (ctx, gs2, tick) => {
            ctx.fillStyle = 'rgba(255,248,232,0.35)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H)
            ctx.textAlign = 'center'
            const won = gs2.end === 'win'
            ctx.fillStyle = PAPER.cardShadow; ctx.fillRect(VIEW_W / 2 - 118 + 2, 62 + 2.5, 236, 96)
            ctx.fillStyle = PAPER.cream; ctx.fillRect(VIEW_W / 2 - 118, 62, 236, 96)
            tape(ctx, VIEW_W / 2 - 112, 64, 16, 4, -0.3)
            tape(ctx, VIEW_W / 2 + 112, 65, 16, 4, 0.25)
            ctx.font = 'bold 16px monospace'
            ctx.fillStyle = won ? PAPER.green : PAPER.red
            ctx.fillText(won ? 'HOUSE SPOTLESS!' : 'THE HOUSE WINS', VIEW_W / 2, 84)
            ctx.font = '8px monospace'; ctx.fillStyle = PAPER.noteInk
            ctx.fillText(gs2.endReason, VIEW_W / 2, 100)
            ctx.font = 'bold 12px monospace'; ctx.fillStyle = '#1d3d4a'
            ctx.fillText(`SCORE ${gs2.score}`, VIEW_W / 2, 126)
            ctx.font = '7px monospace'; ctx.fillStyle = PAPER.noteInk
            ctx.fillText(`TIDY ${gs2.tidies} · JAMS ${gs2.jams} · SPILLS ${gs2.spills} · WRONG ${gs2.wrongs} · SMASHED ${gs2.breaks}`, VIEW_W / 2, 140)
            if (tick % 60 < 40) {
                ctx.fillStyle = 'rgba(255,227,110,0.95)'
                ctx.fillRect(VIEW_W / 2 - 88, 158, 176, 12)
                ctx.font = 'bold 9px monospace'; ctx.fillStyle = PAPER.noteInk
                ctx.fillText('PRESS ANY KEY TO CLOCK BACK IN', VIEW_W / 2, 166)
            }
            ctx.textAlign = 'left'
        },
    }
}

export const PAINTERS = { classic: makeClassic(), reimagined: makeReimagined() }
