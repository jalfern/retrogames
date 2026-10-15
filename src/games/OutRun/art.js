// OUT RUN — art.js : every pixel is generated at runtime. No image assets, no
// copied artwork — original shapes and the arcade's palette. Sprites are baked to
// offscreen canvases once; the renderer blits and scales them by the projected
// road scale so a palm shrinks into the distance and the road rushes past you.

export const SPR = {}

function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }

// ---- cars ----------------------------------------------------------------
function carCanvas(w, h, col, withCouple) {
    const c = cv(w, h), x = c.getContext('2d')
    const bw = w, bh = h
    const r = (a, b, cw, ch, fill) => { x.fillStyle = fill; x.fillRect(Math.round(a), Math.round(b), Math.round(cw), Math.round(ch)) }
    // drop shadow
    x.fillStyle = 'rgba(0,0,0,0.28)'; x.beginPath(); x.ellipse(bw / 2, bh - 2, bw * 0.46, bh * 0.14, 0, 0, Math.PI * 2); x.fill()
    // wheels
    r(bw * 0.06, bh * 0.58, bw * 0.16, bh * 0.40, '#111')
    r(bw * 0.78, bh * 0.58, bw * 0.16, bh * 0.40, '#111')
    r(bw * 0.09, bh * 0.62, bw * 0.10, bh * 0.30, '#2a2a2a')
    r(bw * 0.81, bh * 0.62, bw * 0.10, bh * 0.30, '#2a2a2a')
    // body: dark bottom valance + main coat + lighter highlight band
    r(bw * 0.08, bh * 0.74, bw * 0.84, bh * 0.20, shade(col, -0.35))
    r(bw * 0.06, bh * 0.40, bw * 0.88, bh * 0.42, col)
    r(bw * 0.10, bh * 0.44, bw * 0.80, bh * 0.10, shade(col, 0.22))
    // rear window / cowl
    r(bw * 0.20, bh * 0.26, bw * 0.60, bh * 0.20, '#101820')
    r(bw * 0.22, bh * 0.28, bw * 0.56, bh * 0.06, '#26313d')
    // tail lights
    r(bw * 0.12, bh * 0.52, bw * 0.12, bh * 0.12, '#ff2b2b')
    r(bw * 0.76, bh * 0.52, bw * 0.12, bh * 0.12, '#ff2b2b')
    r(bw * 0.13, bh * 0.54, bw * 0.05, bh * 0.06, '#ff8a8a')
    r(bw * 0.82, bh * 0.54, bw * 0.05, bh * 0.06, '#ff8a8a')
    // exhaust
    r(bw * 0.44, bh * 0.90, bw * 0.12, bh * 0.05, '#333')
    if (withCouple) {
        // driver (left) + passenger (right), wind-in-hair passenger head
        head(x, bw * 0.36, bh * 0.24, bh * 0.14, '#e8b48a', false)
        head(x, bw * 0.62, bh * 0.24, bh * 0.14, '#e8b48a', true)
        // headrests
        r(bw * 0.30, bh * 0.34, bw * 0.12, bh * 0.08, '#5a1414')
        r(bw * 0.56, bh * 0.34, bw * 0.12, bh * 0.08, '#5a1414')
    }
    return c
}

function head(x, cx, cy, r, skin, hair) {
    const c = x
    if (hair) {                              // long hair streaming back in the wind
        c.fillStyle = '#5a3413'
        c.beginPath(); c.moveTo(cx - r * 0.4, cy - r * 0.2)
        c.quadraticCurveTo(cx - r * 2.4, cy - r * 0.6, cx - r * 2.6, cy + r * 1.1)
        c.quadraticCurveTo(cx - r * 1.4, cy + r * 0.4, cx - r * 0.2, cy + r * 0.7)
        c.closePath(); c.fill()
        c.fillStyle = '#6e4118'
        c.fillRect(cx - r * 0.9, cy - r * 0.5, r * 1.6, r * 0.5)
    }
    c.fillStyle = skin; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill()
    c.fillStyle = hair ? '#6e4118' : '#1a1a1a'
    c.beginPath(); c.arc(cx, cy - r * 0.35, r * 0.9, Math.PI, 0); c.fill()   // hair cap
}

// ---- roadside props ------------------------------------------------------
function propCanvas(w, h, draw) { const c = cv(w, h); draw(c.getContext('2d'), w, h); return c }
const rr = (x, a, b, cw, ch, fill) => { x.fillStyle = fill; x.fillRect(Math.round(a), Math.round(b), Math.round(cw), Math.round(ch)) }

function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16)
    let r = (n >> 16) + Math.round(255 * amt), g = ((n >> 8) & 255) + Math.round(255 * amt), b = (n & 255) + Math.round(255 * amt)
    r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b))
    return `rgb(${r},${g},${b})`
}

export function buildSprites() {
    if (SPR.built) return SPR
    SPR.built = true
    SPR.player = [carCanvas(96, 60, '#d81f26', true), carCanvas(96, 60, '#d81f26', true), carCanvas(96, 60, '#d81f26', true)]
    const trafficCols = ['#2a6fd0', '#e0e0e6', '#2fa04a', '#f0a81e', '#8a4ad0', '#18b8c8']
    SPR.traffic = trafficCols.map((col) => carCanvas(76, 52, col, false))
    SPR.trafficHues = trafficCols.length

    SPR.props = {
        palm: propCanvas(48, 150, (x, w, h) => {
            x.strokeStyle = '#8a5a2a'; x.lineWidth = 7; x.beginPath(); x.moveTo(w / 2, h); x.quadraticCurveTo(w / 2 + 4, h * 0.5, w / 2 - 2, h * 0.22); x.stroke()
            x.fillStyle = '#1f7a3a'
            for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * 0.42; x.save(); x.translate(w / 2 - 2, h * 0.22); x.rotate(a); x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(20, -6, 30, 6); x.quadraticCurveTo(18, 2, 0, 4); x.fill(); x.restore() }
            x.fillStyle = '#6e4a1f'; x.beginPath(); x.arc(w / 2 - 2, h * 0.24, 3, 0, Math.PI * 2); x.fill()
        }),
        cactus: propCanvas(40, 130, (x, w, h) => {
            x.fillStyle = '#2f7f3a'; rr(x, w / 2 - 6, h * 0.16, 12, h * 0.84, '#2f7f3a')
            rr(x, w / 2 - 20, h * 0.40, 10, 8, '#2f7f3a'); rr(x, w / 2 - 20, h * 0.30, 8, 20, '#2f7f3a')
            rr(x, w / 2 + 10, h * 0.50, 10, 8, '#2f7f3a'); rr(x, w / 2 + 12, h * 0.36, 8, 22, '#2f7f3a')
            x.fillStyle = shade('#2f7f3a', -0.12); rr(x, w / 2 + 2, h * 0.16, 4, h * 0.84, shade('#2f7f3a', -0.12))
        }),
        pine: propCanvas(56, 150, (x, w, h) => {
            rr(x, w / 2 - 4, h * 0.72, 8, h * 0.28, '#5a3a1a')
            x.fillStyle = '#185f2f'
            for (let i = 0; i < 3; i++) { const yy = h * 0.2 + i * h * 0.22, ww = w * (0.4 + i * 0.28); x.beginPath(); x.moveTo(w / 2, yy - 10); x.lineTo(w / 2 - ww / 2, yy + h * 0.28); x.lineTo(w / 2 + ww / 2, yy + h * 0.28); x.fill() }
            x.fillStyle = '#eaf4ff'; x.beginPath(); x.moveTo(w / 2, h * 0.14); x.lineTo(w / 2 - 6, h * 0.24); x.lineTo(w / 2 + 6, h * 0.24); x.fill()
        }),
        boulder: propCanvas(64, 44, (x, w, h) => { x.fillStyle = '#7a7f8a'; x.beginPath(); x.ellipse(w / 2, h * 0.62, w * 0.42, h * 0.38, 0, 0, Math.PI * 2); x.fill(); x.fillStyle = '#9aa0ab'; x.beginPath(); x.ellipse(w * 0.42, h * 0.5, w * 0.2, h * 0.16, 0, 0, Math.PI * 2); x.fill() }),
        rock: propCanvas(48, 34, (x, w, h) => { x.fillStyle = '#8a8072'; x.beginPath(); x.ellipse(w / 2, h * 0.64, w * 0.42, h * 0.36, 0, 0, Math.PI * 2); x.fill() }),
        boulderr: null,
        windmill: propCanvas(60, 160, (x, w, h) => {
            x.strokeStyle = '#c8b890'; x.lineWidth = 4; x.beginPath(); x.moveTo(w / 2 - 8, h); x.lineTo(w / 2, h * 0.34); x.lineTo(w / 2 + 8, h); x.stroke()
            x.fillStyle = '#e0d0a0'; x.beginPath(); x.arc(w / 2, h * 0.32, 5, 0, Math.PI * 2); x.fill()
            x.strokeStyle = '#f0e6c0'; x.lineWidth = 4
            for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.5; x.beginPath(); x.moveTo(w / 2, h * 0.32); x.lineTo(w / 2 + Math.cos(a) * 26, h * 0.32 + Math.sin(a) * 26); x.stroke() }
        }),
        mesa: propCanvas(120, 70, (x, w, h) => { x.fillStyle = '#a86a3a'; x.beginPath(); x.moveTo(0, h); x.lineTo(w * 0.16, h * 0.34); x.lineTo(w * 0.62, h * 0.30); x.lineTo(w * 0.78, h); x.fill(); x.fillStyle = shade('#a86a3a', 0.1); x.beginPath(); x.moveTo(w * 0.16, h * 0.34); x.lineTo(w * 0.62, h * 0.30); x.lineTo(w * 0.58, h * 0.42); x.lineTo(w * 0.20, h * 0.44); x.fill() }),
        tree: propCanvas(56, 90, (x, w, h) => { rr(x, w / 2 - 5, h * 0.6, 10, h * 0.4, '#5a3a1a'); x.fillStyle = '#2f8f3a'; x.beginPath(); x.arc(w / 2, h * 0.42, w * 0.34, 0, Math.PI * 2); x.fill(); x.fillStyle = shade('#2f8f3a', 0.12); x.beginPath(); x.arc(w * 0.42, h * 0.34, w * 0.18, 0, Math.PI * 2); x.fill() }),
        bush: propCanvas(44, 30, (x, w, h) => { x.fillStyle = '#2f7f3a'; x.beginPath(); x.arc(w * 0.35, h * 0.6, h * 0.5, 0, Math.PI * 2); x.arc(w * 0.65, h * 0.6, h * 0.44, 0, Math.PI * 2); x.fill() }),
        flower: propCanvas(26, 34, (x, w, h) => { x.strokeStyle = '#2f7f3a'; x.lineWidth = 2; x.beginPath(); x.moveTo(w / 2, h); x.lineTo(w / 2, h * 0.4); x.stroke(); const cols = ['#ff5d5d', '#ffd23f', '#ff8ad0']; cols.forEach((col, i) => { x.fillStyle = col; x.beginPath(); x.arc(w / 2 + (i - 1) * 5, h * 0.34 - (i === 1 ? 4 : 0), 4, 0, Math.PI * 2); x.fill() }) }),
        lamp: propCanvas(30, 120, (x, w, h) => { x.strokeStyle = '#d0d0d8'; x.lineWidth = 4; x.beginPath(); x.moveTo(4, h); x.lineTo(4, h * 0.16); x.lineTo(w * 0.7, h * 0.16); x.stroke(); x.fillStyle = '#fff0a0'; x.beginPath(); x.arc(w * 0.7, h * 0.18, 5, 0, Math.PI * 2); x.fill() }),
        tower: propCanvas(70, 150, (x, w, h) => { x.strokeStyle = '#c0c0c8'; x.lineWidth = 4; x.beginPath(); x.moveTo(w * 0.28, h); x.lineTo(w * 0.42, h * 0.36); x.moveTo(w * 0.72, h); x.lineTo(w * 0.58, h * 0.36); x.stroke(); x.fillStyle = '#d8d8e0'; x.beginPath(); x.arc(w / 2, h * 0.28, w * 0.24, Math.PI, 0); x.fill(); x.fillRect(w / 2 - w * 0.24, h * 0.28, w * 0.48, h * 0.1) }),
        sign: propCanvas(56, 60, (x, w, h) => { rr(x, w / 2 - 3, h * 0.5, 6, h * 0.5, '#9aa0ab'); x.fillStyle = '#1560c0'; x.fillRect(2, 4, w - 4, h * 0.5); x.fillStyle = '#fff'; x.fillRect(8, 10, w - 16, 4); x.fillRect(8, 20, w - 24, 3); x.fillRect(8, 26, w - 20, 3) }),
        billboard: propCanvas(96, 80, (x, w, h) => { rr(x, w / 2 - 4, h * 0.55, 8, h * 0.45, '#6a6a72'); x.fillStyle = '#e8483a'; x.fillRect(2, 2, w - 4, h * 0.54); x.fillStyle = '#fff'; x.fillRect(10, 12, w - 20, 8); x.fillRect(10, 28, w * 0.55, 6); x.fillStyle = '#ffd23f'; x.fillRect(10, 38, w * 0.4, 6) }),
    }
    SPR.props.boulderr = SPR.props.boulder
    SPR.goal = goalCanvas(220, 150)
    return SPR
}

function goalCanvas(w, h) {
    const c = cv(w, h), x = c.getContext('2d')
    x.fillStyle = '#c8ccd4'; x.fillRect(8, h * 0.24, 14, h * 0.76); x.fillRect(w - 22, h * 0.24, 14, h * 0.76)
    x.fillStyle = '#101820'; x.fillRect(4, 4, w - 8, h * 0.28)
    x.fillStyle = '#ffd23f'; x.font = 'bold 22px monospace'; x.textAlign = 'center'; x.fillText('GOAL', w / 2, h * 0.24)
    for (let i = 0; i < w; i += 16) { x.fillStyle = (i / 16) % 2 ? '#fff' : '#111'; x.fillRect(4 + i, h * 0.28, 8, 6) }
    return c
}

// ---- backdrops -----------------------------------------------------------
// A wide parallax strip (sky + sun + a distant silhouette band) that the renderer
// scrolls sideways as you curve, so the horizon slides when the road bends.
export function makeBackdrop(theme) {
    const W = 512, H = 122
    const c = cv(W * 2, H), x = c.getContext('2d')
    const g = x.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, theme.sky[0]); g.addColorStop(0.62, theme.sky[1]); g.addColorStop(1, theme.sky[2])
    x.fillStyle = g; x.fillRect(0, 0, W * 2, H)
    if (theme.sun) {
        x.fillStyle = 'rgba(255,240,190,0.95)'; x.beginPath(); x.arc(W * 0.7, H * 0.66, 22, 0, Math.PI * 2); x.fill()
        x.fillStyle = 'rgba(255,220,150,0.35)'; x.beginPath(); x.arc(W * 0.7, H * 0.66, 34, 0, Math.PI * 2); x.fill()
        x.fillStyle = 'rgba(255,240,190,0.95)'; x.beginPath(); x.arc(W * 1.2, H * 0.66, 22, 0, Math.PI * 2); x.fill()
    }
    // distant band silhouette across both halves so it tiles seamlessly when wrapped
    const band = (ox) => {
        const bctx = x
        bctx.save(); bctx.translate(ox, 0)
        if (theme.band === 'ocean') { bctx.fillStyle = '#2a6fae'; bctx.fillRect(0, H - 26, W, 26); bctx.fillStyle = 'rgba(255,255,255,0.25)'; for (let i = 0; i < 8; i++) bctx.fillRect((i * 61) % W, H - 14 - (i % 3) * 4, 24, 2) }
        else if (theme.band === 'mountain') { bctx.fillStyle = '#4a5f8a'; for (let i = 0; i < 6; i++) { const bx = i * (W / 6), bw = W / 6; bctx.beginPath(); bctx.moveTo(bx, H); bctx.lineTo(bx + bw * 0.5, H * 0.30 + (i % 2) * 14); bctx.lineTo(bx + bw, H); bctx.fill(); bctx.fillStyle = '#eaf2ff'; bctx.beginPath(); bctx.moveTo(bx + bw * 0.5, H * 0.30 + (i % 2) * 14); bctx.lineTo(bx + bw * 0.5 - 8, H * 0.42 + (i % 2) * 14); bctx.lineTo(bx + bw * 0.5 + 8, H * 0.42 + (i % 2) * 14); bctx.fill(); bctx.fillStyle = '#4a5f8a' } }
        else if (theme.band === 'mesa') { bctx.fillStyle = '#b07a44'; for (let i = 0; i < 5; i++) { const bx = i * (W / 5) + 8, bw = W / 5 - 14; bctx.beginPath(); bctx.moveTo(bx, H); bctx.lineTo(bx + bw * 0.2, H * 0.58); bctx.lineTo(bx + bw * 0.8, H * 0.55); bctx.lineTo(bx + bw, H); bctx.fill() } }
        else if (theme.band === 'skyline') { bctx.fillStyle = '#3a4a6a'; for (let i = 0; i < 16; i++) { const bx = i * (W / 16), bh = 24 + ((i * 37) % 40); bctx.fillRect(bx + 2, H - bh, W / 16 - 4, bh); bctx.fillStyle = 'rgba(255,240,160,0.5)'; for (let wy = H - bh + 4; wy < H - 4; wy += 8) bctx.fillRect(bx + 5, wy, 3, 3); bctx.fillStyle = '#3a4a6a' } }
        else { bctx.fillStyle = '#5a8f5a'; bctx.fillRect(0, H - 16, W, 16) }
        bctx.restore()
    }
    band(0); band(W)
    return { canvas: c, w: W, h: H }
}
