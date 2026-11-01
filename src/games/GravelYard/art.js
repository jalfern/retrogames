// GRAVEL YARD — procedural art (#1253). Golden-hour heavy-metal yard at 32px
// tiles: sun-baked dirt with tire ruts, a gravel pile with visible wet seams,
// a green shaker screen plant that shudders, graded stockpile cones, a red
// customer trailer, and two tracked/wheeled machines with 2-frame motion.
// Everything generated in code; no sprite from any original game.

export const TILE = 32
export const CANVAS_W = 512
export const CANVAS_H = 344
export const WORLD_X = 0
export const WORLD_Y = 44

const PAL = {
    dirtA: '#b08050', dirtB: '#a07048', rut: '#8a5c38', speck: '#c89868', speckLo: '#7c5030',
    fenceA: '#7a6248', fenceB: '#5a4632', wire: '#c8b890',
    gravel: '#a08658', gravelHi: '#d8bc84', gravelLo: '#5e4628',
    wet: '#56483a', wetHi: '#8a7048',
    coarse: '#8d7a60', coarseHi: '#b09878', coarseLo: '#5e4c38',
    fines: '#c8a878', finesHi: '#e0c898', finesLo: '#8a7048',
    pit: '#6a4828', pitLo: '#4c3218',
    green: '#3e8a3a', greenHi: '#5cb050', greenLo: '#245822',
    steel: '#8a939c', steelHi: '#c8d0d8', steelLo: '#4c565e',
    yellow: '#e8b020', yellowHi: '#ffd048', yellowLo: '#a06c10',
    red: '#c03828', redHi: '#e86048', redLo: '#7c1c14',
    track: '#2c2620', trackHi: '#4a4238',
    black: '#1c1614', glass: '#58a8c8', glassHi: '#a0e0f0',
    ink: '#181418', paper: '#f0e8d0',
}

function mk(w, h) {
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const g = c.getContext('2d')
    g.imageSmoothingEnabled = false
    return [c, g]
}

// deterministic speckle so tiles look identical across builds
function speckle(g, w, h, n, colors, salt = 0) {
    let s = (salt + 1) * 0x9e3779b9
    const rnd = () => { s = (Math.imul(s ^ (s >>> 15), 2246822507) ^ (Math.imul(s ^ (s >>> 13), 3266489909))) >>> 0; return (s >>> 8) / 16777216 }
    for (let i = 0; i < n; i++) {
        g.fillStyle = colors[Math.floor(rnd() * colors.length)]
        g.fillRect(Math.floor(rnd() * w), Math.floor(rnd() * h), 1 + Math.floor(rnd() * 2), 1)
    }
}

let cache = null
export function sprites() {
    if (cache) return cache
    cache = build()
    return cache
}

function build() {
    const S = {}

    // --- dirt ground, two alternating tiles with ruts -------------------------
    S.dirt = []
    for (let i = 0; i < 2; i++) {
        const [c, g] = mk(TILE, TILE)
        g.fillStyle = i ? PAL.dirtB : PAL.dirtA
        g.fillRect(0, 0, TILE, TILE)
        speckle(g, TILE, TILE, 26, [PAL.speck, PAL.speckLo], i * 3 + 1)
        if (i) { // tire rut
            g.fillStyle = PAL.rut
            g.fillRect(0, 12, TILE, 3)
            g.fillRect(0, 20, TILE, 2)
            g.fillStyle = 'rgba(255,255,255,0.06)'
            g.fillRect(0, 11, TILE, 1)
        }
        S.dirt.push(c)
    }

    // --- fence: timber post run -----------------------------------------------
    {
        const [c, g] = mk(TILE, TILE)
        g.fillStyle = PAL.fenceB
        g.fillRect(0, 14, TILE, 6)
        g.fillStyle = PAL.fenceA
        g.fillRect(0, 14, TILE, 2)
        g.fillStyle = PAL.fenceA
        g.fillRect(13, 8, 6, 20)
        g.fillStyle = PAL.fenceB
        g.fillRect(17, 8, 2, 20)
        g.fillStyle = PAL.wire
        g.fillRect(0, 22, TILE, 1)
        S.fence = c
    }

    // --- gravel pile cells: cone size by units (0..4), wet seams speckled ----
    // #1306 golden hour: amber cones with a long cast shadow to the lower
    // right; wet cells shimmer between two glisten frames.
    S.pile = { dry: [], wet: [], wetB: [] }
    const GLINT_A = [[9, 16, 3, 2], [19, 21, 2, 2]]
    const GLINT_B = [[13, 13, 2, 2], [22, 24, 3, 2], [7, 22, 2, 2]]
    for (let u = 0; u <= 4; u++) {
        for (const wet of [false, true]) {
            const frames = wet ? 2 : 1
            for (let fr = 0; fr < frames; fr++) {
                const [c, g] = mk(TILE, TILE)
                if (u === 0) { // dug-out pit
                    g.fillStyle = PAL.pit
                    g.fillRect(0, 0, TILE, TILE)
                    speckle(g, TILE, TILE, 14, [PAL.pitLo], u * 7 + (wet ? 3 : 1))
                    g.fillStyle = 'rgba(0,0,0,0.25)'
                    g.fillRect(4, 4, TILE - 8, TILE - 8)
                } else {
                    g.fillStyle = wet ? PAL.wet : (u % 2 ? PAL.dirtB : PAL.dirtA)
                    g.fillRect(0, 0, TILE, TILE)
                    const hgt = 4 + u * 6
                    g.fillStyle = 'rgba(24,12,4,0.30)' // long golden-hour shadow
                    g.beginPath(); g.ellipse(TILE / 2 + 4, TILE - 3, 6 + u * 2.5, 3, 0, 0, Math.PI * 2); g.fill()
                    const base = wet ? PAL.gravelLo : PAL.gravel
                    const hi = wet ? PAL.wetHi : PAL.gravelHi
                    g.fillStyle = base
                    g.beginPath()
                    g.moveTo(2, TILE - 2)
                    g.lineTo(TILE / 2, TILE - 2 - hgt)
                    g.lineTo(TILE - 2, TILE - 2)
                    g.closePath()
                    g.fill()
                    g.fillStyle = hi
                    g.beginPath()
                    g.moveTo(TILE / 2 - 3, TILE - 8 - hgt / 2)
                    g.lineTo(TILE / 2, TILE - 2 - hgt)
                    g.lineTo(TILE / 2 + 2, TILE - 6 - hgt / 2)
                    g.closePath()
                    g.fill()
                    speckle(g, TILE, TILE - 4, u * 6 + 4, wet ? [PAL.wetHi, PAL.gravelLo] : [PAL.gravelHi, PAL.gravelLo], u * 13 + (wet ? 9 : 5))
                    if (wet) { // glisten — frame B is brighter on other pixels
                        g.fillStyle = fr ? 'rgba(150,190,220,0.5)' : 'rgba(90,130,160,0.35)'
                        for (const [gx, gy, gw, gh] of (fr ? GLINT_B : GLINT_A)) g.fillRect(gx, gy, gw, gh)
                    }
                }
                if (!wet) S.pile.dry.push(c)
                else S.pile[fr ? 'wetB' : 'wet'].push(c)
            }
        }
    }

    // --- stockpile cones (bay units 0..8) ---------------------------------------
    S.bay = { coarse: [], fines: [] }
    for (const [grade, base, hi, lo] of [['coarse', PAL.coarse, PAL.coarseHi, PAL.coarseLo], ['fines', PAL.fines, PAL.finesHi, PAL.finesLo]]) {
        for (let u = 0; u <= 8; u++) {
            const [c, g] = mk(TILE, TILE)
            g.fillStyle = PAL.dirtA
            g.fillRect(0, 0, TILE, TILE)
            speckle(g, TILE, TILE, 12, [PAL.speck, PAL.speckLo], u + base.length)
            if (u > 0) {
                const rr = 4 + u * 1.6
                g.fillStyle = lo
                g.beginPath(); g.ellipse(TILE / 2, TILE - 4, rr + 2, rr / 2 + 1, 0, 0, Math.PI * 2); g.fill()
                g.fillStyle = base
                g.beginPath(); g.ellipse(TILE / 2, TILE - 6 - u * 0.9, rr, rr / 2, 0, 0, Math.PI * 2); g.fill()
                g.fillStyle = hi
                g.beginPath(); g.ellipse(TILE / 2 - 2, TILE - 8 - u * 0.9, rr / 2.4, rr / 4, 0, 0, Math.PI * 2); g.fill()
                speckle(g, TILE, TILE, u * 4, [base, lo, hi], u * 3 + grade.length)
            }
            S.bay[grade].push(c)
        }
    }

    // --- the screen plant: 96x64 green shaker (cols 7-9, rows 1-2) ----------
    {
        const [c, g] = mk(TILE * 3, TILE * 2)
        const W = TILE * 3, H = TILE * 2
        // legs
        g.fillStyle = PAL.track
        for (const lx of [8, 40, 76]) g.fillRect(lx, H - 10, 8, 10)
        // deck body
        g.fillStyle = PAL.greenLo
        g.fillRect(2, 8, W - 4, H - 18)
        g.fillStyle = PAL.green
        g.fillRect(2, 8, W - 4, H - 24)
        g.fillStyle = PAL.greenHi
        g.fillRect(2, 8, W - 4, 4)
        // corrugation
        g.fillStyle = 'rgba(0,0,0,0.18)'
        for (let x = 6; x < W - 4; x += 6) g.fillRect(x, 14, 2, H - 30)
        // discharge chutes at the east end (coarse above fines)
        g.fillStyle = PAL.steelLo
        g.fillRect(W - 12, 18, 12, 8)
        g.fillRect(W - 12, 34, 12, 8)
        g.fillStyle = PAL.steel
        g.fillRect(W - 12, 18, 12, 3)
        g.fillRect(W - 12, 34, 12, 3)
        // hopper feed funnel on the south face, center third
        g.fillStyle = PAL.steelLo
        g.beginPath()
        g.moveTo(28, H - 10)
        g.lineTo(68, H - 10)
        g.lineTo(60, H - 26)
        g.lineTo(36, H - 26)
        g.closePath(); g.fill()
        g.fillStyle = PAL.steel
        g.beginPath()
        g.moveTo(30, H - 11)
        g.lineTo(66, H - 11)
        g.lineTo(59, H - 25)
        g.lineTo(37, H - 25)
        g.closePath(); g.fill()
        g.fillStyle = PAL.black
        g.fillRect(38, H - 24, 20, 6)
        // console box at the east face corner
        g.fillStyle = PAL.yellowLo
        g.fillRect(72, H - 26, 20, 18)
        g.fillStyle = PAL.yellow
        g.fillRect(72, H - 26, 20, 12)
        g.fillStyle = PAL.glass
        g.fillRect(75, H - 23, 14, 6)
        g.fillStyle = PAL.glassHi
        g.fillRect(75, H - 23, 14, 2)
        // exhaust stack
        g.fillStyle = PAL.steelLo
        g.fillRect(10, 0, 5, 12)
        g.fillStyle = PAL.steel
        g.fillRect(10, 0, 2, 12)
        S.plant = c
    }

    // --- customer trailer at the dock (red semi, seen from the side/top) -----
    {
        const [c, g] = mk(TILE * 2, TILE * 2)
        g.fillStyle = PAL.redLo
        g.fillRect(2, 4, TILE * 2 - 4, TILE * 2 - 8)
        g.fillStyle = PAL.red
        g.fillRect(4, 6, TILE * 2 - 8, TILE * 2 - 14)
        g.fillStyle = PAL.redHi
        g.fillRect(4, 6, TILE * 2 - 8, 3)
        g.fillStyle = PAL.steelLo
        g.fillRect(2, TILE * 2 - 8, TILE * 2 - 4, 4)
        g.fillStyle = PAL.track
        g.fillRect(6, TILE * 2 - 6, 8, 5); g.fillRect(TILE * 2 - 14, TILE * 2 - 6, 8, 5)
        g.fillStyle = PAL.ink
        g.font = '7px "Press Start 2P", monospace'
        g.fillText('SALE', 14, 26)
        S.trailer = c
    }

    // --- order board post --------------------------------------------------------
    {
        const [c, g] = mk(TILE, TILE)
        g.fillStyle = PAL.fenceA
        g.fillRect(14, 12, 4, 20)
        g.fillStyle = PAL.ink
        g.fillRect(2, 2, 28, 14)
        g.fillStyle = PAL.paper
        g.fillRect(3, 3, 26, 12)
        g.fillStyle = PAL.ink
        g.font = '5px "Press Start 2P", monospace'
        g.fillText('ORDERS', 4, 11)
        S.board = c
    }

    // --- digger (facing right; ~40x30, rotated by the renderer) -------------
    // #1390: body and boom draw separately so the dig job can swing the boom —
    // four frames the renderer indexes by dig progress (digSwingFrame).
    const diggerBody = (g, frame) => {
        // tracks
        g.fillStyle = PAL.track
        g.fillRect(4, 18, 28, 9)
        g.fillStyle = PAL.trackHi
        for (let x = 6 + frame * 4; x < 32; x += 4) g.fillRect(x, 19, 2, 7)
        g.fillStyle = PAL.steelLo
        g.fillRect(4, 26, 28, 2)
        // body
        g.fillStyle = PAL.yellowLo
        g.fillRect(6, 8, 24, 11)
        g.fillStyle = PAL.yellow
        g.fillRect(6, 8, 24, 7)
        g.fillStyle = PAL.yellowHi
        g.fillRect(6, 8, 24, 2)
        // cab
        g.fillStyle = PAL.ink
        g.fillRect(10, 2, 12, 8)
        g.fillStyle = PAL.glass
        g.fillRect(11, 3, 10, 5)
        g.fillStyle = PAL.glassHi
        g.fillRect(11, 3, 10, 1)
    }
    const diggerBoom = (g, drop) => {
        // boom + bucket lowered `drop` px into the pile
        g.fillStyle = PAL.yellow
        g.fillRect(28, 10 + drop, 10, 4)
        g.fillStyle = PAL.yellowLo
        g.fillRect(28, 13 + drop, 10, 2)
        // bucket at the tip
        g.fillStyle = PAL.steelLo
        g.fillRect(35, 13 + drop, 5, 7)
        g.fillStyle = PAL.steel
        g.fillRect(35, 13 + drop, 5, 3)
        g.fillStyle = PAL.ink
        g.fillRect(30, 14 + drop, 4, 3) // dipper joint
    }
    S.digger = []
    for (let frame = 0; frame < 2; frame++) {
        const [c, g] = mk(40, 30)
        diggerBody(g, frame)
        diggerBoom(g, 0)
        S.digger.push(c)
    }
    S.diggerDig = [] // 0 = raised, 3 = full bite
    for (const drop of [0, 2, 4, 6]) {
        const [c, g] = mk(40, 30)
        diggerBody(g, 0)
        diggerBoom(g, drop)
        if (drop >= 4) { // gravel riding in the bucket on the deep frames
            g.fillStyle = PAL.gravelHi
            g.fillRect(35, 11 + drop, 5, 2)
        }
        S.diggerDig.push(c)
    }

    // --- dump truck (facing right; 42x26) --------------------------------------
    const truckBase = (g, frame) => {
        // wheels
        g.fillStyle = PAL.track
        for (const wx of [8, 16, 30, 38]) { g.fillRect(wx - 3, 20, 6, 6) }
        g.fillStyle = PAL.trackHi
        for (const wx of [8, 16, 30, 38]) g.fillRect(wx - 3 + frame, 22, 2, 2)
        // chassis
        g.fillStyle = PAL.ink
        g.fillRect(4, 16, 36, 4)
        // cab
        g.fillStyle = PAL.red
        g.fillRect(6, 6, 12, 10)
        g.fillStyle = PAL.redHi
        g.fillRect(6, 6, 12, 2)
        g.fillStyle = PAL.glass
        g.fillRect(7, 8, 7, 5)
        g.fillStyle = PAL.glassHi
        g.fillRect(7, 8, 7, 1)
    }
    const truckBed = (g, angle) => {
        // bed, raised `angle` rad around the rear pivot (40,16) when tipping
        g.save()
        if (angle) { g.translate(40, 16); g.rotate(angle); g.translate(-40, -16) }
        g.fillStyle = PAL.redLo
        g.fillRect(18, 4, 22, 12)
        g.fillStyle = PAL.red
        g.fillRect(18, 4, 22, 9)
        g.fillStyle = PAL.redHi
        g.fillRect(18, 4, 22, 2)
        g.restore()
    }
    S.truck = []
    for (let frame = 0; frame < 2; frame++) {
        const [c, g] = mk(42, 26)
        truckBase(g, frame)
        truckBed(g, 0)
        S.truck.push(c)
    }
    // #1390: bed raised while tipping (3 frames, rear-dump pivot at x=40);
    // the load slides out the back on the raised frames.
    S.truckTip = []
    for (const [angle, spill] of [[0.18, false], [0.35, true], [0.52, true]]) {
        const [c, g] = mk(42, 26)
        truckBase(g, 0)
        truckBed(g, angle)
        if (spill) {
            g.fillStyle = PAL.gravel
            for (const [sx, sy, ss] of [[36, 18, 3], [33, 22, 2], [38, 23, 2]]) g.fillRect(sx, sy, ss, ss)
            g.fillStyle = PAL.gravelHi
            g.fillRect(35, 20, 2, 2)
        }
        S.truckTip.push(c)
    }
    // gravel mound that rides in the truck bed (drawn over the bed)
    S.bedLoad = []
    for (let n = 1; n <= 4; n++) {
        const [c, g] = mk(24, 12)
        g.fillStyle = PAL.gravel
        g.beginPath()
        g.moveTo(1, 12)
        g.lineTo(4, 12 - 2 - n * 2)
        g.lineTo(12, 10 - n * 2)
        g.lineTo(20, 12 - n)
        g.lineTo(23, 12)
        g.closePath(); g.fill()
        speckle(g, 24, 12, n * 5, [PAL.gravelHi, PAL.gravelLo], n)
        S.bedLoad.push(c)
    }

    return S
}
