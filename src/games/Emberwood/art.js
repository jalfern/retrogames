// EMBERWOOD — every texture is painted at runtime into small canvases, then
// wrapped by the renderer as NearestFilter CanvasTextures. Original pixel art
// in a dusk-amber vale palette; nothing copied from any existing game.

const mk = (w, h) => {
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const g = c.getContext('2d')
    g.imageSmoothingEnabled = false
    return [c, g]
}

let seedN = 12345
const rnd = () => { seedN = (seedN * 16807) % 2147483647; return (seedN - 1) / 2147483646 }

const shade = (hex, amt) => {
    const n = parseInt(hex.slice(1), 16)
    const r = Math.max(0, Math.min(255, (n >> 16) + amt))
    const gg = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt))
    const b = Math.max(0, Math.min(255, (n & 255) + amt))
    return `rgb(${r},${gg},${b})`
}

const speckle = (g, w, h, hex, n, amt) => {
    for (let i = 0; i < n; i++) {
        g.fillStyle = shade(hex, Math.floor((rnd() - 0.5) * amt))
        g.fillRect(Math.floor(rnd() * w), Math.floor(rnd() * h), 1, 1)
    }
}

// ---------------- tiles 16x16 ----------------
export function makeTextures() {
    seedN = 555
    const T = {}

    const tile = (base, grain = 26) => {
        const [c, g] = mk(16, 16)
        g.fillStyle = base; g.fillRect(0, 0, 16, 16)
        speckle(g, 16, 16, base, grain, 22)
        return c
    }

    T.grass = (() => {
        const [c, g] = mk(16, 16)
        g.fillStyle = '#3e7d3a'; g.fillRect(0, 0, 16, 16)
        for (let i = 0; i < 40; i++) {
            const x = Math.floor(rnd() * 16), y = Math.floor(rnd() * 16)
            g.fillStyle = rnd() < 0.5 ? '#48913f' : '#356a32'
            g.fillRect(x, y, 1, 2)
        }
        return c
    })()
    T.grassDark = (() => {
        const [c, g] = mk(16, 16)
        g.fillStyle = '#2f5f2d'; g.fillRect(0, 0, 16, 16)
        for (let i = 0; i < 34; i++) {
            g.fillStyle = rnd() < 0.5 ? '#39713a' : '#274f26'
            g.fillRect(Math.floor(rnd() * 16), Math.floor(rnd() * 16), 1, 2)
        }
        return c
    })()
    T.tallgrass = (() => {
        const [c, g] = mk(16, 16)
        g.clearRect(0, 0, 16, 16)
        for (let x = 1; x < 15; x += 2) {
            const hgt = 7 + Math.floor(rnd() * 5)
            g.fillStyle = '#6fae4e'
            g.fillRect(x, 16 - hgt, 1, hgt)
            g.fillStyle = '#8cc45f'
            g.fillRect(x, 16 - hgt, 1, 2)
            g.fillStyle = '#4c8438'
            g.fillRect(x + 1, 16 - hgt + 2, 1, hgt - 2)
        }
        return c
    })()
    T.path = (() => {
        const [c, g] = mk(16, 16)
        g.fillStyle = '#9b8254'; g.fillRect(0, 0, 16, 16)
        speckle(g, 16, 16, '#9b8254', 46, 30)
        g.fillStyle = '#8a714a'; g.fillRect(3, 5, 2, 1); g.fillRect(9, 11, 3, 1)
        return c
    })()
    T.water = (() => {
        const [c, g] = mk(16, 16)
        g.fillStyle = '#2c5e86'; g.fillRect(0, 0, 16, 16)
        g.fillStyle = '#3b76a3'
        for (let y = 2; y < 16; y += 5) g.fillRect(0, y, 16, 1)
        g.fillStyle = '#5d9cc4'
        for (let i = 0; i < 6; i++) g.fillRect(Math.floor(rnd() * 12), 2 + Math.floor(rnd() * 3) * 5, 3, 1)
        return c
    })()
    T.stone = tile('#6b6b78')
    T.stoneDark = tile('#4e4e5c')
    T.floor = (() => {
        const [c, g] = mk(16, 16)
        g.fillStyle = '#565263'; g.fillRect(0, 0, 16, 16)
        g.strokeStyle = '#484454'; g.strokeRect(0.5, 0.5, 15, 15)
        speckle(g, 16, 16, '#565263', 20, 16)
        return c
    })()
    T.wall = (() => {
        const [c, g] = mk(16, 16)
        g.fillStyle = '#3a3745'; g.fillRect(0, 0, 16, 16)
        g.fillStyle = '#4b4758'
        g.fillRect(1, 1, 6, 3); g.fillRect(9, 1, 6, 3)
        g.fillRect(1, 6, 4, 3); g.fillRect(7, 6, 8, 3)
        g.fillRect(1, 11, 7, 3); g.fillRect(10, 11, 5, 3)
        return c
    })()
    T.wallTop = (() => {
        const [c, g] = mk(16, 16)
        g.fillStyle = '#5c586b'; g.fillRect(0, 0, 16, 16)
        speckle(g, 16, 16, '#5c586b', 24, 18)
        return c
    })()
    T.rock = (() => {
        const [c, g] = mk(16, 16)
        g.fillStyle = '#7a7688'; g.fillRect(0, 0, 16, 16)
        g.fillStyle = '#8d8999'; g.fillRect(3, 2, 10, 4)
        speckle(g, 16, 16, '#7a7688', 30, 24)
        return c
    })()
    T.bush = (() => {
        const [c, g] = mk(14, 10)
        g.clearRect(0, 0, 14, 10)
        g.fillStyle = '#245c28'; g.beginPath(); g.arc(9, 6, 4.5, 0, 7); g.fill()
        g.fillStyle = '#2f7433'; g.beginPath(); g.arc(4, 6, 4, 0, 7); g.fill()
        g.fillStyle = '#3d8a3c'; g.beginPath(); g.arc(6, 4, 3, 0, 7); g.fill()
        g.fillStyle = '#6fae4e'; g.fillRect(5, 2, 1, 1); g.fillRect(9, 3, 1, 1)
        g.fillStyle = '#1c4620'; g.fillRect(3, 8, 8, 1)
        return c
    })()
    T.tree = (() => {
        const [c, g] = mk(24, 30)
        g.clearRect(0, 0, 24, 30)
        g.fillStyle = '#5a3d24'; g.fillRect(10, 22, 4, 8)
        g.fillStyle = '#245c28'; g.beginPath(); g.arc(12, 13, 10, 0, 7); g.fill()
        g.fillStyle = '#2f7433'; g.beginPath(); g.arc(10, 11, 7, 0, 7); g.fill()
        g.fillStyle = '#3d8a3c'; g.beginPath(); g.arc(9, 9, 4, 0, 7); g.fill()
        g.fillStyle = '#1c4620'; g.beginPath(); g.arc(16, 16, 5, 0, 7); g.fill()
        return c
    })()
    T.fence = (() => {
        const [c, g] = mk(16, 16)
        g.clearRect(0, 0, 16, 16)
        g.fillStyle = '#7c5a34'; g.fillRect(2, 4, 2, 10); g.fillRect(12, 4, 2, 10)
        g.fillRect(0, 6, 16, 2); g.fillRect(0, 11, 16, 2)
        return c
    })()
    T.house = (() => {
        const [c, g] = mk(16, 16)
        g.fillStyle = '#8a6a44'; g.fillRect(0, 0, 16, 16)
        g.fillStyle = '#75573a'
        for (let y = 2; y < 16; y += 4) g.fillRect(0, y, 16, 1)
        g.fillStyle = '#3c2c1c'; g.fillRect(6, 9, 4, 7)
        g.fillStyle = '#ffd27a'; g.fillRect(2, 3, 3, 3)
        return c
    })()
    T.roof = (() => {
        const [c, g] = mk(16, 16)
        g.fillStyle = '#a04a3c'; g.fillRect(0, 0, 16, 16)
        g.fillStyle = '#84382e'
        for (let y = 3; y < 16; y += 4) g.fillRect(0, y, 16, 1)
        for (let y = 1; y < 16; y += 4) for (let x = (y % 8 === 1 ? 0 : 8); x < 16; x += 8) g.fillRect(x, y, 1, 2)
        return c
    })()
    T.bridge = (() => {
        const [c, g] = mk(16, 16)
        g.fillStyle = '#8a6236'; g.fillRect(0, 0, 16, 16)
        g.fillStyle = '#6e4c28'
        for (let x = 0; x < 16; x += 4) g.fillRect(x, 0, 1, 16)
        g.fillStyle = '#5a3d20'; g.fillRect(0, 0, 16, 1); g.fillRect(0, 15, 16, 1)
        return c
    })()
    T.sign = (() => {
        const [c, g] = mk(16, 16)
        g.clearRect(0, 0, 16, 16)
        g.fillStyle = '#6e4c28'; g.fillRect(7, 8, 2, 8)
        g.fillStyle = '#a5813f'; g.fillRect(2, 2, 12, 8)
        g.fillStyle = '#7c5f2c'; g.fillRect(2, 2, 12, 1); g.fillRect(2, 9, 12, 1)
        g.fillStyle = '#4a3818'
        g.fillRect(4, 4, 8, 1); g.fillRect(4, 6, 6, 1)
        return c
    })()
    T.crack = (() => {
        const [c, g] = mk(16, 16)
        g.fillStyle = '#4e4a5a'; g.fillRect(0, 0, 16, 16)
        speckle(g, 16, 16, '#4e4a5a', 20, 14)
        g.strokeStyle = '#26232e'; g.lineWidth = 1
        g.beginPath(); g.moveTo(8, 0); g.lineTo(6, 5); g.lineTo(10, 9); g.lineTo(7, 16); g.stroke()
        g.beginPath(); g.moveTo(6, 5); g.lineTo(2, 8); g.moveTo(10, 9); g.lineTo(14, 12); g.stroke()
        return c
    })()
    T.door = (() => {
        const [c, g] = mk(16, 16)
        g.fillStyle = '#5a3d24'; g.fillRect(1, 2, 14, 14)
        g.fillStyle = '#46301c'; g.fillRect(1, 2, 14, 1)
        g.fillStyle = '#ffd27a'; g.fillRect(12, 9, 2, 2)
        return c
    })()
    T.doorBig = (() => {
        const [c, g] = mk(16, 16)
        g.fillStyle = '#6e6550'; g.fillRect(0, 0, 16, 16)
        g.fillStyle = '#56503e'; g.fillRect(2, 2, 12, 12)
        g.fillStyle = '#c9a24a'; g.fillRect(7, 7, 2, 4); g.fillRect(5, 9, 6, 2)
        return c
    })()
    T.plate = (() => {
        const [c, g] = mk(16, 16)
        g.clearRect(0, 0, 16, 16)
        g.strokeStyle = '#c9a24a'; g.lineWidth = 2
        g.beginPath(); g.arc(8, 8, 5, 0, 7); g.stroke()
        return c
    })()
    T.switchP = (() => {
        const [c, g] = mk(16, 16)
        g.fillStyle = '#3a3745'; g.fillRect(2, 2, 12, 12)
        g.fillStyle = '#c94a4a'; g.fillRect(6, 5, 4, 6)
        return c
    })()
    T.portal = (() => {
        const [c, g] = mk(16, 16)
        g.clearRect(0, 0, 16, 16)
        g.fillStyle = '#7ad7ff'; g.beginPath(); g.arc(8, 8, 6, 0, 7); g.fill()
        g.fillStyle = '#bff2ff'; g.beginPath(); g.arc(8, 8, 3, 0, 7); g.fill()
        g.fillStyle = '#2c5e86'; g.beginPath(); g.arc(8, 8, 1, 0, 7); g.fill()
        return c
    })()
    T.stairs = (() => {
        const [c, g] = mk(16, 16)
        g.fillStyle = '#2b2833'; g.fillRect(0, 0, 16, 16)
        g.fillStyle = '#191720'
        g.fillRect(2, 2, 12, 3); g.fillRect(4, 6, 8, 3); g.fillRect(6, 10, 4, 4)
        return c
    })()

    // ---------------- hero: 3 dirs x (walk1, walk2, slash, draw) ----------------
    const hero = (dir, pose) => {
        const [c, g] = mk(16, 18)
        g.clearRect(0, 0, 16, 18)
        const body = '#2e7d4f', bodyD = '#1f5c39', skin = '#e8b48a', hair = '#6b4226'
        const back = dir === 'up'
        // legs
        g.fillStyle = bodyD
        if (pose === 'w1') { g.fillRect(5, 13, 2, 4); g.fillRect(9, 14, 2, 3) }
        else if (pose === 'w2') { g.fillRect(5, 14, 2, 3); g.fillRect(9, 13, 2, 4) }
        else { g.fillRect(5, 14, 2, 3); g.fillRect(9, 14, 2, 3) }
        // torso
        g.fillStyle = body; g.fillRect(4, 7, 8, 7)
        g.fillStyle = bodyD; g.fillRect(4, 12, 8, 2)
        // belt
        g.fillStyle = '#8a6236'; g.fillRect(4, 11, 8, 1)
        // head
        g.fillStyle = skin; g.fillRect(5, 2, 6, 5)
        g.fillStyle = hair; g.fillRect(4, 1, 8, 2)
        if (!back) { g.fillRect(4, 2, 1, 3); g.fillRect(11, 2, 1, 3) }
        if (!back && dir !== 'up') { g.fillStyle = '#222'; g.fillRect(dir === 'left' ? 6 : 9, 4, 1, 1) }
        if (back) { g.fillStyle = hair; g.fillRect(5, 3, 6, 3) }
        // arms + sword
        if (pose === 'slash') {
            g.fillStyle = skin
            if (dir === 'left') g.fillRect(2, 8, 2, 2)
            else if (dir === 'right') g.fillRect(12, 8, 2, 2)
            else g.fillRect(dir === 'up' ? 7 : 12, 5, 2, 2)
        }
        if (pose === 'draw') {
            g.fillStyle = '#8a6236'
            g.fillRect(dir === 'left' ? 1 : 13, 6, 1, 6)
            g.fillStyle = '#e8e2d0'
            g.fillRect(dir === 'left' ? 2 : 12, 8, 3, 1)
        }
        return c
    }
    T.hero = {}
    for (const d of ['left', 'right', 'up', 'down']) {
        T.hero[d] = { w1: hero(d, 'w1'), w2: hero(d, 'w2'), slash: hero(d, 'slash'), draw: hero(d, 'draw') }
    }

    // ---------------- enemies ----------------
    T.cinder = [0, 1].map(f => {
        const [c, g] = mk(14, 14)
        g.clearRect(0, 0, 14, 14)
        g.fillStyle = '#5c2f2f'; g.beginPath(); g.arc(7, 8, 5, 0, 7); g.fill()
        g.fillStyle = '#8a4030'; g.beginPath(); g.arc(6, 7, 3, 0, 7); g.fill()
        g.fillStyle = '#ff9a3c'
        g.fillRect(5, f ? 2 : 3, 1, 3); g.fillRect(8, f ? 3 : 1, 1, 3)
        g.fillStyle = '#ffd27a'; g.fillRect(6, f ? 1 : 2, 1, 2)
        g.fillStyle = '#1a0d0d'; g.fillRect(5, 8, 1, 1); g.fillRect(8, 8, 1, 1)
        return c
    })
    T.bat = [0, 1].map(f => {
        const [c, g] = mk(14, 10)
        g.clearRect(0, 0, 14, 10)
        g.fillStyle = '#3d2c52'; g.beginPath(); g.arc(7, 6, 3, 0, 7); g.fill()
        g.fillStyle = '#57406f'
        if (f) { g.fillRect(0, 2, 5, 2); g.fillRect(9, 2, 5, 2) }
        else { g.fillRect(0, 6, 5, 2); g.fillRect(9, 6, 5, 2) }
        g.fillStyle = '#ff5c5c'; g.fillRect(6, 5, 1, 1); g.fillRect(8, 5, 1, 1)
        return c
    })
    T.spitter = [0, 1].map(f => {
        const [c, g] = mk(14, 14)
        g.clearRect(0, 0, 14, 14)
        g.fillStyle = '#2f6d5c'; g.beginPath(); g.arc(7, 8, 5, 0, 7); g.fill()
        g.fillStyle = '#458f76'; g.beginPath(); g.arc(6, 7, 3, 0, 7); g.fill()
        g.fillStyle = '#bfff9e'; g.fillRect(5, 4, 1, 1); g.fillRect(8, 4, 1, 1)
        if (f) { g.fillStyle = '#8ce0ff'; g.beginPath(); g.arc(7, 1, 2, 0, 7); g.fill() }
        g.fillStyle = '#12332b'; g.fillRect(6, 8, 2, 1)
        return c
    })
    T.husk = [0, 1].map(f => {
        const [c, g] = mk(16, 16)
        g.clearRect(0, 0, 16, 16)
        g.fillStyle = '#5e5544'; g.fillRect(3, 3, 10, 11)
        g.fillStyle = '#79705c'; g.fillRect(4, 4, 8, 8)
        g.fillStyle = '#9d9578'; g.fillRect(5, f ? 5 : 6, 6, 3)
        g.fillStyle = '#2b2618'; g.fillRect(6, 8, 1, 1); g.fillRect(9, 8, 1, 1)
        g.fillStyle = '#453f30'; g.fillRect(3, 13, 4, 3); g.fillRect(9, 13, 4, 3)
        return c
    })
    T.wisp = [0, 1].map(f => {
        const [c, g] = mk(12, 12)
        g.clearRect(0, 0, 12, 12)
        g.fillStyle = f ? 'rgba(160,220,255,0.85)' : 'rgba(120,190,255,0.6)'
        g.beginPath(); g.arc(6, 6, 4, 0, 7); g.fill()
        g.fillStyle = '#eaffff'; g.beginPath(); g.arc(5, 5, 1.5, 0, 7); g.fill()
        return c
    })
    T.sprig = [
        (() => { const [c, g] = mk(12, 12); g.clearRect(0, 0, 12, 12); g.fillStyle = '#5f8f45'; g.fillRect(5, 8, 2, 3); g.fillRect(3, 9, 6, 2); return c })(),
        (() => {
            const [c, g] = mk(12, 14)
            g.clearRect(0, 0, 12, 14)
            g.fillStyle = '#4c8438'; g.fillRect(4, 6, 4, 6)
            g.fillStyle = '#7ab052'; g.fillRect(3, 2, 2, 5); g.fillRect(7, 2, 2, 5); g.fillRect(5, 0, 2, 4)
            g.fillStyle = '#d9ff8a'; g.fillRect(5, 7, 1, 1); g.fillRect(7, 7, 1, 1)
            return c
        })(),
    ]
    T.tuskroot = [0, 1, 2, 3].map(f => {
        const [c, g] = mk(16, 16)
        g.clearRect(0, 0, 16, 16)
        // #877 repaint: a rooted log-boar at final aspect (no vertical stretch;
        // body sits in rows 3..15 like its 12x10 sim footprint). Snout on the
        // texture right = screen west, matching the billboard's mirror rule.
        const tele = f === 2, charge = f === 3
        const bob = f === 1 ? 1 : 0
        const head = charge ? 11 : tele ? 10 : 8 // snout-top row: rage lowers it
        // tail flick
        g.fillStyle = '#5a3d24'; g.fillRect(1, 6 - (charge ? 1 : 0), 2, 2)
        g.fillStyle = '#6e4c28'; g.fillRect(1, 5 - (charge ? 1 : 0), 1, 1)
        // log body (rounded)
        const by = 4 + (charge ? 1 : 0) + bob
        g.fillStyle = '#5a3d24'; g.fillRect(2, by, 12, 9)
        g.fillStyle = '#6e4c28'; g.fillRect(3, by - 1, 10, 1); g.fillRect(3, by + 9, 10, 1)
        // bark grain + top light
        g.fillStyle = '#82603a'; g.fillRect(4, by + 1, 8, 1)
        g.fillStyle = '#422c1a'
        g.fillRect(5, by + 2, 1, 6); g.fillRect(8, by + 1, 1, 5); g.fillRect(11, by + 3, 1, 4)
        if (charge) g.fillRect(6, by + 5, 1, 3)
        // knot
        g.fillStyle = '#422c1a'; g.fillRect(9, by + 3, 2, 2)
        g.fillStyle = '#6e4c28'; g.fillRect(10, by + 3, 1, 1)
        // mossy mane (ruffles when it paws)
        g.fillStyle = '#245c28'; g.fillRect(3, by, 9, 1)
        g.fillStyle = '#3d8a3c'; g.fillRect(4, by - 1, 8, 1)
        g.fillStyle = '#6fae4e'; g.fillRect(5, by - 2, 1, 1); g.fillRect(9, by - 2, 1, 1)
        if (tele) { g.fillStyle = '#6fae4e'; g.fillRect(7, by - 3, 1, 1); g.fillRect(11, by - 2, 1, 1) }
        // root-feet: two-beat gait, reach forward on the charge, paw when telegraphing
        g.fillStyle = '#422c1a'
        if (charge) { g.fillRect(11, 13, 2, 2); g.fillRect(2, 13, 2, 3); g.fillRect(6, 14, 2, 2) }
        else if (tele) { g.fillRect(11, 13, 2, 1); g.fillRect(12, 14, 1, 1); g.fillRect(3, 13, 2, 3); g.fillRect(7, 13, 2, 2) }
        else if (f === 0) { g.fillRect(3, 13, 2, 3); g.fillRect(7, 14, 2, 2); g.fillRect(10, 13, 2, 2) }
        else { g.fillRect(3, 13, 2, 2); g.fillRect(7, 13, 2, 2); g.fillRect(10, 13, 2, 3) }
        if (tele) { g.fillStyle = '#9b8254'; g.fillRect(12, 15, 1, 1); g.fillRect(14, 14, 1, 1) } // pawing dirt
        if (charge) { g.fillStyle = '#8a714a'; g.fillRect(0, 7, 1, 1); g.fillRect(0, 10, 1, 1) } // speed streaks
        // snout wedge + nostril (lowers with the rage)
        g.fillStyle = '#8a5c34'; g.fillRect(13, head, 3, 3)
        g.fillStyle = '#422c1a'; g.fillRect(15, head + 1, 1, 1)
        // curved tusk, two-tone
        g.fillStyle = '#f0e6cc'; g.fillRect(15, head - 2, 1, 1); g.fillRect(14, head - 1, 1, 1); g.fillRect(13, head, 1, 1)
        g.fillStyle = '#c9bd9c'; g.fillRect(14, head, 1, 1)
        // eyes: calm amber -> telegraph white -> charge red
        g.fillStyle = charge ? '#ff5a2a' : tele ? '#fff3cf' : '#ffb238'
        g.fillRect(11, by + 2, 2, 1)
        return c
    })
    T.pod = [0, 1].map(f => {
        const [c, g] = mk(12, 12)
        g.clearRect(0, 0, 12, 12)
        // #877 repaint: a seed-pod of embers — husk plates split by a glowing
        // vein that pulses between the two frames.
        g.fillStyle = '#5c2f2f'
        g.fillRect(2, 4, 8, 7); g.fillRect(3, 3, 6, 1); g.fillRect(3, 11, 6, 1)
        g.fillStyle = '#7c3d30'; g.fillRect(2, 5, 3, 5); g.fillRect(7, 5, 3, 5)
        g.fillStyle = '#9c5238'; g.fillRect(2, 5, 3, 1); g.fillRect(7, 5, 3, 1)
        g.fillStyle = '#3a1c1c'; g.fillRect(5, 3, 2, 9)
        g.fillStyle = f ? '#ff9a3c' : '#c9613a'; g.fillRect(5, f ? 4 : 5, 1, f ? 5 : 4); g.fillRect(6, f ? 6 : 7, 1, 2)
        if (f) { g.fillStyle = '#ffd87a'; g.fillRect(5, 6, 1, 1) }
        // ember stem
        g.fillStyle = '#5c3d2f'; g.fillRect(5, 1, 2, 2)
        g.fillStyle = f ? '#ff9a3c' : '#c9613a'; g.fillRect(5, 0, 2, 1)
        if (f) { g.fillStyle = '#ffd87a'; g.fillRect(5, 0, 1, 1) }
        // dark eyes + root tendril
        g.fillStyle = '#2a1414'; g.fillRect(3, 7, 1, 1); g.fillRect(8, 7, 1, 1)
        g.fillStyle = '#422c1a'; g.fillRect(5, 11, 2, 1)
        return c
    })
    T.maw = {
        closed: (() => {
            const [c, g] = mk(28, 28)
            g.clearRect(0, 0, 28, 28)
            g.fillStyle = '#3c5c2a'; g.beginPath(); g.arc(14, 14, 12, 0, 7); g.fill()
            g.fillStyle = '#2c4520'
            for (let i = 0; i < 10; i++) { const a = i * 0.63; g.fillRect(14 + Math.cos(a) * 11, 14 + Math.sin(a) * 11, 3, 3) }
            g.fillStyle = '#d8ffb0'; g.fillRect(10, 12, 2, 2); g.fillRect(16, 12, 2, 2)
            return c
        })(),
        open: (() => {
            const [c, g] = mk(28, 28)
            g.clearRect(0, 0, 28, 28)
            g.fillStyle = '#3c5c2a'; g.beginPath(); g.arc(14, 14, 12, 0, 7); g.fill()
            g.fillStyle = '#141f0e'; g.beginPath(); g.arc(14, 15, 7, 0, 7); g.fill()
            g.fillStyle = '#ff7a3c'; g.beginPath(); g.arc(14, 15, 4, 0, 7); g.fill()
            g.fillStyle = '#ffd87a'; g.beginPath(); g.arc(14, 15, 2, 0, 7); g.fill()
            g.fillStyle = '#e8ffd0'
            for (let i = 0; i < 5; i++) g.fillRect(8 + i * 3, 9 + (i % 2), 2, 3)
            return c
        })(),
    }
    T.wyrm = {
        closed: (() => {
            const [c, g] = mk(24, 20)
            g.clearRect(0, 0, 24, 20)
            g.fillStyle = '#6e3a2a'; g.beginPath(); g.ellipse(12, 11, 10, 8, 0, 0, 7); g.fill()
            g.fillStyle = '#8f4e33'; g.beginPath(); g.ellipse(11, 9, 7, 5, 0, 0, 7); g.fill()
            g.fillStyle = '#3a1e14'; g.fillRect(6, 12, 12, 3)
            g.fillStyle = '#ffd27a'; g.fillRect(7, 7, 2, 2); g.fillRect(14, 7, 2, 2)
            return c
        })(),
        open: (() => {
            const [c, g] = mk(24, 20)
            g.clearRect(0, 0, 24, 20)
            g.fillStyle = '#6e3a2a'; g.beginPath(); g.ellipse(12, 10, 10, 7, 0, 0, 7); g.fill()
            g.fillStyle = '#ff5a2a'; g.beginPath(); g.ellipse(12, 13, 6, 5, 0, 0, 7); g.fill()
            g.fillStyle = '#ffd27a'; g.beginPath(); g.ellipse(12, 13, 3, 3, 0, 0, 7); g.fill()
            g.fillStyle = '#ffe9c9'
            for (let i = 0; i < 4; i++) g.fillRect(7 + i * 3, 9, 2, 3)
            g.fillStyle = '#ffd27a'; g.fillRect(6, 5, 2, 2); g.fillRect(15, 5, 2, 2)
            return c
        })(),
        seg: (() => {
            const [c, g] = mk(16, 16)
            g.clearRect(0, 0, 16, 16)
            g.fillStyle = '#5c3122'; g.beginPath(); g.arc(8, 8, 6, 0, 7); g.fill()
            g.fillStyle = '#7c4430'; g.beginPath(); g.arc(7, 7, 4, 0, 7); g.fill()
            return c
        })(),
    }

    // ---------------- drops / items ----------------
    T.ember = [0, 1].map(f => {
        const [c, g] = mk(8, 8)
        g.clearRect(0, 0, 8, 8)
        g.fillStyle = '#ffb238'; g.beginPath(); g.arc(4, 4, 3, 0, 7); g.fill()
        g.fillStyle = '#ffe08a'; g.fillRect(f ? 2 : 3, f ? 3 : 2, 2, 2)
        return c
    })
    T.heart = (() => {
        const [c, g] = mk(10, 9)
        g.clearRect(0, 0, 10, 9)
        g.fillStyle = '#e8384a'
        g.fillRect(1, 1, 3, 2); g.fillRect(6, 1, 3, 2)
        g.fillRect(0, 2, 10, 3); g.fillRect(1, 5, 8, 2); g.fillRect(3, 7, 4, 1); g.fillRect(4, 8, 2, 1)
        g.fillStyle = '#ff8896'; g.fillRect(2, 2, 2, 1)
        return c
    })()
    T.key = (() => {
        const [c, g] = mk(10, 10)
        g.clearRect(0, 0, 10, 10)
        g.fillStyle = '#e8c24a'
        g.beginPath(); g.arc(3, 3, 2.5, 0, 7); g.fill()
        g.fillRect(5, 2, 1, 6); g.fillRect(5, 6, 3, 1); g.fillRect(5, 8, 2, 1)
        return c
    })()
    T.bomb = (() => {
        const [c, g] = mk(10, 12)
        g.clearRect(0, 0, 10, 12)
        g.fillStyle = '#2e2c38'; g.beginPath(); g.arc(5, 7, 4, 0, 7); g.fill()
        g.fillStyle = '#57546a'; g.fillRect(3, 4, 2, 2)
        g.fillStyle = '#a5813f'; g.fillRect(5, 1, 1, 3)
        g.fillStyle = '#ff9a3c'; g.fillRect(4, 0, 2, 2)
        return c
    })()
    T.arrow = (() => {
        const [c, g] = mk(12, 4)
        g.clearRect(0, 0, 12, 4)
        g.fillStyle = '#8a6236'; g.fillRect(2, 1, 8, 2)
        g.fillStyle = '#e8e2d0'; g.fillRect(9, 0, 3, 4)
        g.fillStyle = '#d8d0bc'; g.fillRect(0, 0, 2, 1); g.fillRect(0, 3, 2, 1)
        return c
    })()
    T.orb = (() => {
        const [c, g] = mk(8, 8)
        g.clearRect(0, 0, 8, 8)
        g.fillStyle = '#8ce0ff'; g.beginPath(); g.arc(4, 4, 3, 0, 7); g.fill()
        g.fillStyle = '#e6ffff'; g.fillRect(2, 2, 2, 2)
        return c
    })()
    T.chest = {
        closed: (() => {
            const [c, g] = mk(14, 12)
            g.clearRect(0, 0, 14, 12)
            g.fillStyle = '#8a5a2c'; g.fillRect(1, 4, 12, 8)
            g.fillStyle = '#a5713a'; g.fillRect(1, 1, 12, 4)
            g.fillStyle = '#e8c24a'; g.fillRect(1, 5, 12, 2)
            g.fillRect(6, 3, 2, 5)
            return c
        })(),
        open: (() => {
            const [c, g] = mk(14, 12)
            g.clearRect(0, 0, 14, 12)
            g.fillStyle = '#6e4420'; g.fillRect(1, 4, 12, 8)
            g.fillStyle = '#3c2410'; g.fillRect(2, 5, 10, 3)
            g.fillStyle = '#a5713a'; g.fillRect(1, 0, 12, 3)
            return c
        })(),
    }
    return T
}

// particle palette for the renderer's juice layer
export const JUICE = {
    hit: ['#ffd27a', '#ff9a3c', '#fff3cf'],
    blood: ['#8a4030', '#5c2f2f', '#c96a4a'],
    cut: ['#8cc45f', '#6fae4e', '#b7e08a'],
    boom: ['#ffd27a', '#ff9a3c', '#ff5a2a', '#ffe9c9'],
    coin: ['#ffe08a', '#ffb238'],
    magic: ['#8ce0ff', '#bff2ff', '#5d9cc4'],
    dust: ['#9b8254', '#8a714a', '#6e5a3a', '#b09468'],
    shard: ['#7c3d30', '#5c2f2f', '#c9613a'],
}
