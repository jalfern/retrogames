const px = (ctx, x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), Math.ceil(w), Math.ceil(h)) }

export const BIOMES = [
    { max: 14, a: '#1c4a86', b: '#255c9e', name: 'water' },
    { max: 20, a: '#c9ae6c', b: '#b3975a', name: 'sand' },
    { max: 54, a: '#48812f', b: '#3a6c26', name: 'grass' },
    { max: 74, a: '#75654f', b: '#5e5140', name: 'rock' },
    { max: 999, a: '#e6ebf2', b: '#c9d2dd', name: 'snow' },
]
export const biomeOf = (h) => BIOMES.find((b) => h <= b.max)

export function drawPearl(ctx, x, y, k, f) {
    const r = 2.4 * k
    const wob = Math.sin(f * 0.1) * k * 0.6
    px(ctx, x - r, y - r + wob, r * 2, r * 2, '#d8b840')
    px(ctx, x - r * 0.6, y - r * 0.9 + wob, r * 1.2, r * 1.2, '#f4e08a')
    px(ctx, x - r * 0.3, y - r * 0.7 + wob, r * 0.5, r * 0.5, '#fffbe8')
    px(ctx, x - r * 0.9, y + r * 0.5 + wob, r * 0.7, r * 0.5, '#8a6a18')
}

export function drawBook(ctx, x, y, k, f) {
    const wob = Math.sin(f * 0.08) * k * 0.8
    y += wob
    px(ctx, x - 5 * k, y - 3 * k, 4.4 * k, 3 * k, '#f2ecd8')
    px(ctx, x + 0.6 * k, y - 3 * k, 4.4 * k, 3 * k, '#f2ecd8')
    px(ctx, x - 5 * k, y - 3 * k, 4.4 * k, 0.7 * k, '#c9c0a4')
    px(ctx, x + 0.6 * k, y - 3 * k, 4.4 * k, 0.7 * k, '#c9c0a4')
    px(ctx, x - 0.8 * k, y - 3.4 * k, 1.6 * k, 3.4 * k, '#6a2a8a')
    px(ctx, x - 5.6 * k, y - 3.4 * k, 11.2 * k, 0.8 * k, '#8a3ab0')
    px(ctx, x - 5.6 * k, y - 0.6 * k, 11.2 * k, 0.8 * k, '#4a1a6a')
    const g = (Math.sin(f * 0.2) + 1) / 2
    ctx.globalAlpha = 0.3 + g * 0.4
    px(ctx, x - 0.5 * k, y - 5.4 * k, k, k, '#ffe89a')
    px(ctx, x - 3 * k, y - 4.8 * k, 0.7 * k, 0.7 * k, '#ffe89a')
    px(ctx, x + 2.4 * k, y - 5 * k, 0.7 * k, 0.7 * k, '#ffe89a')
    ctx.globalAlpha = 1
}

export function drawBalloon(ctx, x, y, k, f, i) {
    const wob = Math.sin(f * 0.05 + i * 2) * k
    px(ctx, x - 3 * k + wob, y - 12 * k, 6 * k, 6 * k, i % 2 ? '#b03838' : '#c89030')
    px(ctx, x - 2 * k + wob, y - 11 * k, 2 * k, 3 * k, '#e07048')
    px(ctx, x - 0.5 * k + wob * 0.4, y - 6 * k, k, 4 * k, '#6a5a40')
    px(ctx, x - 1 * k + wob * 0.2, y - 2 * k, 2 * k, 2 * k, '#d8b840')
    px(ctx, x - 0.4 * k + wob * 0.2, y - 1.6 * k, k, k, '#fff2b0')
}

export function drawCastle(ctx, x, y, k, stage) {
    const wallH = (7 + stage * 3) * k
    px(ctx, x - 14 * k, y - wallH, 28 * k, wallH, '#8a8fa8')
    px(ctx, x - 14 * k, y - wallH, 28 * k, 1.4 * k, '#b8bccf')
    for (let i = 0; i < 7; i++) px(ctx, x - 13 * k + i * 4 * k, y - wallH - 2 * k, 2 * k, 2 * k, '#9a9fb8')
    px(ctx, x - 3 * k, y - 4.4 * k, 6 * k, 4.4 * k, '#3a3050')
    px(ctx, x - 3 * k, y - 4.4 * k, 6 * k, 0.8 * k, '#5a4a78')
    if (stage >= 1) {
        px(ctx, x - 16 * k, y - wallH - 6 * k, 5 * k, wallH + 6 * k, '#7d8299')
        px(ctx, x + 11 * k, y - wallH - 6 * k, 5 * k, wallH + 6 * k, '#7d8299')
        px(ctx, x - 16 * k, y - wallH - 8 * k, 5 * k, 2 * k, '#5d6279')
        px(ctx, x + 11 * k, y - wallH - 8 * k, 5 * k, 2 * k, '#5d6279')
    }
    if (stage >= 2) {
        px(ctx, x - 6 * k, y - wallH - 10 * k, 12 * k, 10 * k, '#9aa0b8')
        px(ctx, x - 6 * k, y - wallH - 12 * k, 12 * k, 2 * k, '#6d7289')
    }
    if (stage >= 3) {
        px(ctx, x - 2.4 * k, y - wallH - 18 * k, 4.8 * k, 6 * k, '#aaa8c8')
        px(ctx, x - 3 * k, y - wallH - 19 * k, 6 * k, k, '#7a7898')
    }
    if (stage >= 4) {
        px(ctx, x - 1.4 * k, y - wallH - 24 * k, 2.8 * k, 5 * k, '#c8c0e0')
        px(ctx, x - 2 * k, y - wallH - 25 * k, 4 * k, k, '#8a88a8')
        ctx.globalAlpha = 0.7
        px(ctx, x - 0.5 * k, y - wallH - 27 * k, k, 2 * k, '#ffe89a')
        ctx.globalAlpha = 1
    }
    ctx.globalAlpha = 0.25
    px(ctx, x - 15 * k, y, 30 * k, 1.6 * k, '#000')
    ctx.globalAlpha = 1
}

export function drawTower(ctx, x, y, k, f, alive, toppled) {
    if (toppled) {
        px(ctx, x - 8 * k, y - 2.4 * k, 16 * k, 2.4 * k, '#41394f')
        px(ctx, x - 6 * k, y - 6 * k, 5 * k, 3.6 * k, '#362e44')
        px(ctx, x + 1.4 * k, y - 4.6 * k, 4.4 * k, 2.2 * k, '#2e2638')
        px(ctx, x - 2.4 * k, y - 8 * k, 3.4 * k, 2.4 * k, '#362e44')
        px(ctx, x + 3 * k, y - 8 * k, 2 * k, k, '#4a4258')
        ctx.globalAlpha = 0.3
        px(ctx, x - 10 * k, y, 20 * k, 1.6 * k, '#000')
        const d = (Math.sin(f * 0.11) + 1) / 2
        ctx.globalAlpha = 0.18 + d * 0.12
        px(ctx, x - 5 * k, y - 3 * k, 10 * k, k, '#8a7f96')
        ctx.globalAlpha = 1
        return
    }
    if (!alive) {
        px(ctx, x - 7 * k, y - 3 * k, 14 * k, 3 * k, '#4a4258')
        px(ctx, x - 5 * k, y - 5 * k, 4 * k, 2 * k, '#3a3248')
        px(ctx, x + 1 * k, y - 4 * k, 3 * k, k, '#3a3248')
        ctx.globalAlpha = 0.25
        px(ctx, x - 8 * k, y, 16 * k, 1.4 * k, '#000')
        ctx.globalAlpha = 1
        return
    }
    px(ctx, x - 5 * k, y - 16 * k, 10 * k, 16 * k, '#463a58')
    px(ctx, x - 5 * k, y - 16 * k, 10 * k, 1.2 * k, '#5d4f72')
    px(ctx, x - 6 * k, y - 18 * k, 12 * k, 2 * k, '#322840')
    px(ctx, x - 6 * k, y - 19.4 * k, 3 * k, 1.4 * k, '#322840')
    px(ctx, x - 1 *.5 * k, y - 19.4 * k, 3 * k, 1.4 * k, '#322840')
    px(ctx, x + 3.5 * k, y - 19.4 * k, 3 * k, 1.4 * k, '#322840')
    px(ctx, x - 2 * k, y - 12 * k, 4 * k, 5 * k, '#2a2038')
    const g = (Math.sin(f * 0.15) + 1) / 2
    ctx.globalAlpha = 0.5 + g * 0.5
    px(ctx, x - 1.5 * k, y - 11 * k, 3 * k, 3 * k, '#8a3ad0')
    ctx.globalAlpha = 1
    px(ctx, x - 2.4 * k, y - 7 * k, 4.8 * k, 4 * k, '#241a30')
    px(ctx, x - 6 * k, y, 12 * k, k, '#241a30')
    ctx.globalAlpha = 0.25
    px(ctx, x - 8 * k, y, 16 * k, 1.4 * k, '#000')
    ctx.globalAlpha = 1
}

export function drawWizard(ctx, x, y, k, f) {
    const bob = Math.sin(f * 0.12) * k
    y += bob
    ctx.globalAlpha = 0.22
    ctx.beginPath(); ctx.ellipse(x, y - bob, 3.4 * k, k, 0, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1
    px(ctx, x - 3 * k, y - 8 * k, 6 * k, 8 * k, '#5a2050')
    px(ctx, x - 3 * k, y - 8 * k, 6 * k, k, '#7a3070')
    px(ctx, x - 3.6 * k, y - 5 * k + Math.sin(f * 0.2) * k * 0.4, 1.4 * k, 4 * k, '#48183e')
    px(ctx, x + 2.2 * k, y - 5 * k - Math.sin(f * 0.2) * k * 0.4, 1.4 * k, 4 * k, '#48183e')
    px(ctx, x - 2 * k, y - 11 * k, 4 * k, 3 * k, '#3a1432')
    px(ctx, x - 2.6 * k, y - 12 * k, 5.2 * k, 1.4 * k, '#2a0e24')
    px(ctx, x - 1.4 * k, y - 10.4 * k, 2.8 * k, 1 * k, '#c8a890')
    const g = (Math.sin(f * 0.18) + 1) / 2
    ctx.globalAlpha = 0.4 + g * 0.4
    px(ctx, x - 4.6 * k, y - 7 * k, k, k, '#c060ff')
    ctx.globalAlpha = 1
}

export function drawGiant(ctx, x, y, k, f, hurt) {
    ctx.globalAlpha = 0.22
    ctx.beginPath(); ctx.ellipse(x, y, 4.5 * k, 1.2 * k, 0, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1
    const c = hurt ? '#c87050' : '#8a5a30', c2 = hurt ? '#e09070' : '#a87040'
    px(ctx, x - 3.4 * k, y - 13 * k, 6.8 * k, 9 * k, c)
    px(ctx, x - 3.4 * k, y - 13 * k, 6.8 * k, k, c2)
    px(ctx, x - 1.6 * k, y - 16 * k, 3.2 * k, 3 * k, c2)
    px(ctx, x - 1.6 * k, y - 15 * k, 3.2 * k, 0.8 * k, '#5a3a18')
    px(ctx, x - 5.4 * k, y - 12 * k + Math.sin(f * 0.15) * k, 2 * k, 6 * k, c)
    px(ctx, x + 3.4 * k, y - 12 * k - Math.sin(f * 0.15) * k, 2 * k, 6 * k, c)
    px(ctx, x - 3 * k, y - 4 * k, 2.6 * k, 4 * k, c)
    px(ctx, x + 0.4 * k, y - 4 * k, 2.6 * k, 4 * k, c)
    px(ctx, x - 2.4 * k, y - 11.4 * k, 1.2 * k, k, '#201008')
    px(ctx, x + 1.2 * k, y - 11.4 * k, 1.2 * k, k, '#201008')
}

export function drawWolf(ctx, x, y, k, f, chase) {
    ctx.globalAlpha = 0.2
    ctx.beginPath(); ctx.ellipse(x, y, 5 * k, k, 0, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1
    const step = Math.sin(f * (chase ? 0.5 : 0.2)) * k
    px(ctx, x - 4 * k, y - 4 * k, 8 * k, 2.6 * k, '#5a5a66')
    px(ctx, x + 2.6 * k, y - 5.6 * k, 2.4 * k, 2.4 * k, '#6a6a78')
    px(ctx, x + 3.4 * k, y - 6.4 * k, k, k, '#6a6a78')
    px(ctx, x + 4.4 * k, y - 5 * k, 1.2 * k, 0.8 * k, '#3a3a44')
    px(ctx, x - 5 * k, y - 5 * k, 1.4 * k, 1.4 * k, '#4a4a56')
    px(ctx, x - 3 * k + step, y - 1.6 * k, k, 1.6 * k, '#44444f')
    px(ctx, x - 0.5 * k - step, y - 1.6 * k, k, 1.6 * k, '#44444f')
    px(ctx, x + 1.6 * k + step, y - 1.6 * k, k, 1.6 * k, '#44444f')
    px(ctx, x - 2 * k, y - 3.4 * k, 5 * k, k, '#7a7a88')
}

export function drawCow(ctx, x, y, k) {
    ctx.globalAlpha = 0.2
    ctx.beginPath(); ctx.ellipse(x, y, 4 * k, k, 0, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1
    px(ctx, x - 3.4 * k, y - 3.4 * k, 6.8 * k, 2.4 * k, '#e8e4da')
    px(ctx, x - 1.4 * k, y - 3.4 * k, 2 * k, k, '#3a3630')
    px(ctx, x + 0.6 * k, y - 2.4 * k, 1.4 * k, 0.8 * k, '#3a3630')
    px(ctx, x + 2.8 * k, y - 4.4 * k, 2 * k, 1.8 * k, '#e8e4da')
    px(ctx, x - 2.6 * k, y - 1 * k, k, k, '#c9c2b4')
    px(ctx, x + 1.6 * k, y - 1 * k, k, k, '#c9c2b4')
}

export function drawHut(ctx, x, y, k, v, f, burn, dead) {
    if (dead) {
        ctx.globalAlpha = 0.2
        ctx.beginPath(); ctx.ellipse(x, y, 5 * k, k, 0, 0, Math.PI * 2); ctx.fill()
        ctx.globalAlpha = 1
        px(ctx, x - 3.4 * k, y - 1.6 * k, 2.4 * k, 1.6 * k, '#3a3028')
        px(ctx, x + 0.4 * k, y - 2.2 * k, 2 * k, 2.2 * k, '#322820')
        px(ctx, x - 1 * k, y - 1.2 * k, 1.6 * k, 1.2 * k, '#453a2e')
        return
    }
    const wall = burn > 0 ? '#6a4a30' : ['#c9a86a', '#b8905a', '#d0b878'][v]
    ctx.globalAlpha = 0.2
    ctx.beginPath(); ctx.ellipse(x, y, 5.4 * k, k, 0, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1
    px(ctx, x - 4 * k, y - 4 * k, 8 * k, 4 * k, wall)
    px(ctx, x - 4 * k, y - 4 * k, 8 * k, 0.7 * k, burn > 0 ? '#7a5a3a' : '#e0d0a0')
    ctx.beginPath()
    ctx.moveTo(x - 5.4 * k, y - 4 * k); ctx.lineTo(x, y - 8.4 * k); ctx.lineTo(x + 5.4 * k, y - 4 * k)
    ctx.closePath(); ctx.fillStyle = burn > 0 ? '#4a3018' : '#7a5a30'; ctx.fill()
    ctx.beginPath()
    ctx.moveTo(x - 5 * k, y - 4 * k); ctx.lineTo(x, y - 7.8 * k); ctx.lineTo(x + 5 * k, y - 4 * k)
    ctx.closePath(); ctx.fillStyle = burn > 0 ? '#5a3c20' : '#96703c'; ctx.fill()
    px(ctx, x - 1 * k, y - 2.6 * k, 2 * k, 2.6 * k, '#4a3418')
    if (burn > 0) {
        const fl = (Math.sin(f * 0.3 + x) + 1) / 2
        ctx.globalAlpha = 0.75 + fl * 0.25
        px(ctx, x - 1.6 * k, y - (9 + fl * 3) * k, 1.4 * k, 2.4 * k, '#e05818')
        px(ctx, x + 0.4 * k, y - (8 + fl * 2.4) * k, 1.1 * k, 2 * k, '#ff9830')
        px(ctx, x - 0.6 * k, y - (10.5 + fl * 2) * k, k, 1.6 * k, '#ffd060')
        ctx.globalAlpha = 1
    }
}

export function drawFireball(ctx, x, y, k) {
    ctx.globalAlpha = 0.5
    px(ctx, x - 2.4 * k, y - 2.4 * k, 4.8 * k, 4.8 * k, '#ff6a20')
    ctx.globalAlpha = 1
    px(ctx, x - 1.6 * k, y - 1.6 * k, 3.2 * k, 3.2 * k, '#ffa040')
    px(ctx, x - k, y - k, 2 * k, 2 * k, '#ffe0a0')
}

export function drawBolt(ctx, x, y, k, col) {
    px(ctx, x - k, y - k, 2 * k, 2 * k, col)
    px(ctx, x - 2.4 * k, y - 0.5 * k, 1.6 * k, k, col)
    px(ctx, x + k, y - 0.5 * k, 1.6 * k, k, col)
}
