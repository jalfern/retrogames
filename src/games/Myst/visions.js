// THE SPECTATOR (#1024) — the glass sphere shows other Ages as live visions.
// Each lens is a circular glass pane painted at runtime on a 2D canvas: a
// miniature of its Age, every movement a pure function of world time `t`
// (seconds) — no Math.random anywhere, so the harness can require that two
// instants differ on a linked lens and match on a sealed one.

const L = 0.5

function sky(ctx, w, h, top, bottom) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, top)
  g.addColorStop(1, bottom)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

function gear(ctx, x, y, r, teeth, ang, fill, stroke) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(ang)
  ctx.fillStyle = fill
  ctx.strokeStyle = stroke
  ctx.lineWidth = Math.max(1, r * 0.06)
  ctx.beginPath()
  for (let i = 0; i < teeth * 2; i++) {
    const rr = i % 2 ? r * 0.82 : r
    const a0 = (i / (teeth * 2)) * Math.PI * 2
    const a1 = ((i + 1) / (teeth * 2)) * Math.PI * 2
    ctx.lineTo(Math.cos(a0) * rr, Math.sin(a0) * rr)
    ctx.lineTo(Math.cos(a1) * rr, Math.sin(a1) * rr)
  }
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.24, 0, Math.PI * 2)
  ctx.strokeStyle = stroke
  ctx.stroke()
  ctx.restore()
}

// SELENITIC — the green storm world: grey dome under a deep-water sky, the
// close moon, the sounding rings, a flash now and then (t % 6.4, fixed).
function selenitic(ctx, w, h, t) {
  const flash = t % 6.4 < 0.16 ? 1 - (t % 6.4) / 0.16 : 0
  sky(ctx, w, h, flash ? '#3f5f52' : '#15251f', flash ? '#28443a' : '#0b1410')
  ctx.fillStyle = `rgba(224,238,224,${0.85 + flash * 0.15})`
  ctx.beginPath()
  ctx.arc(w * 0.72, h * 0.26, h * 0.15, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = `rgba(120,150,124,${0.28 + flash * 0.2})`
  ctx.beginPath()
  ctx.arc(w * 0.72, h * 0.26, h * 0.2, 0, Math.PI * 2)
  ctx.fill()
  const domeY = h * 0.98
  ctx.fillStyle = flash ? '#5c7460' : '#38473d'
  ctx.beginPath()
  ctx.ellipse(w * 0.42, domeY, w * 0.46, h * 0.52, 0, Math.PI, 0)
  ctx.fill()
  for (let i = 0; i < 4; i++) {
    const rr = 0.14 + i * 0.11 + 0.014 * Math.sin(t * 0.8 + i * 1.7)
    ctx.strokeStyle = `rgba(140,220,150,${0.5 - i * 0.09 + flash * 0.2})`
    ctx.lineWidth = Math.max(1, h * 0.02)
    ctx.beginPath()
    ctx.ellipse(w * 0.42, domeY + h * 0.02, w * rr, h * rr * 0.42, 0, Math.PI, 0)
    ctx.stroke()
  }
}

// STONESHIP — the grey sea world: rolling bands of ocean, a low sun with a
// halo, the ship moored with its sails lifting on the swell.
function stoneship(ctx, w, h, t) {
  sky(ctx, w, h, '#3a3f46', '#8d949b')
  ctx.fillStyle = 'rgba(255,236,200,0.9)'
  ctx.beginPath()
  ctx.arc(w * 0.26, h * 0.34, h * 0.1, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,236,200,0.16)'
  ctx.beginPath()
  ctx.arc(w * 0.26, h * 0.34, h * 0.19, 0, Math.PI * 2)
  ctx.fill()
  const seaY = h * 0.56
  ctx.fillStyle = '#41505a'
  ctx.fillRect(0, seaY, w, h - seaY)
  for (let i = 0; i < 5; i++) {
    const yy = seaY + ((i + 0.5) / 5) * (h - seaY)
    ctx.strokeStyle = `rgba(150,166,178,${0.16 + (i / 5) * 0.3})`
    ctx.lineWidth = Math.max(1, h * 0.024)
    ctx.beginPath()
    for (let x = 0; x <= w; x += 4) {
      const y = yy + Math.sin(x * 0.09 + t * (1.1 + i * 0.25) + i * 2.1) * h * 0.028
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  const bob = Math.sin(t * 1.3) * h * 0.02
  ctx.save()
  ctx.translate(w * 0.66, seaY + h * 0.05 + bob)
  ctx.rotate(Math.sin(t * 1.3 + 0.6) * 0.05)
  ctx.fillStyle = '#20262c'
  ctx.beginPath()
  ctx.moveTo(-w * 0.16, 0)
  ctx.lineTo(w * 0.16, 0)
  ctx.lineTo(w * 0.11, h * 0.09)
  ctx.lineTo(-w * 0.11, h * 0.09)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#20262c'
  ctx.lineWidth = Math.max(1, w * 0.012)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, -h * 0.34)
  ctx.stroke()
  ctx.fillStyle = 'rgba(226,222,208,0.92)'
  ctx.beginPath()
  ctx.moveTo(0, -h * 0.33)
  ctx.quadraticCurveTo(w * (0.1 + 0.02 * Math.sin(t * 0.9)), -h * 0.2, w * 0.02, -h * 0.04)
  ctx.lineTo(0, -h * 0.04)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

// MECHANICAL — the forge world: an iron sky lit from the furnace horizon, two
// great gears meshed and turning opposite, sparks climbing the dark.
function mechanical(ctx, w, h, t) {
  const glow = 0.7 + 0.22 * Math.sin(t * 2.1) + 0.08 * Math.sin(t * 5.3)
  sky(ctx, w, h, '#150f0b', `rgba(${Math.round(120 + 90 * glow)},${Math.round(52 + 40 * glow)},18,1)`)
  ctx.fillStyle = `rgba(255,150,40,${0.16 * glow})`
  ctx.beginPath()
  ctx.ellipse(w * 0.5, h * 0.96, w * 0.55, h * 0.3, 0, Math.PI, 0)
  ctx.fill()
  const ang = t * 0.55
  gear(ctx, w * 0.36, h * 0.62, h * 0.26, 9, ang, '#2b2118', `rgba(255,170,80,${0.55 + 0.2 * glow})`)
  gear(ctx, w * 0.68, h * 0.68, h * 0.19, 7, -ang * (9 / 7) + 0.3, '#241b14', `rgba(255,170,80,${0.5 + 0.2 * glow})`)
  for (let k = 0; k < 8; k++) {
    const seed = k * 7.31
    const rise = ((t * (0.5 + (k % 3) * 0.22) + seed) % 1)
    const px = w * (0.3 + 0.4 * ((Math.sin(seed) + 1) / 2)) + Math.sin(t * 3 + seed) * w * 0.03
    const py = h * (0.92 - rise * 0.75)
    ctx.fillStyle = `rgba(255,${170 + (k % 4) * 20},60,${0.85 * (1 - rise)})`
    ctx.fillRect(px, py, Math.max(1, w * 0.012), Math.max(1, w * 0.012))
  }
}

// CHANNELWOOD — the water world: cloud banks drifting over an endless sea,
// falls threading the far edge, the star-wheel standing in silhouette.
function channelwood(ctx, w, h, t) {
  sky(ctx, w, h, '#7f9aa4', '#c9d8db')
  for (let i = 0; i < 3; i++) {
    const drift = (t * (4 + i * 2.5) + i * w * 0.4) % (w * 1.6) - w * 0.3
    ctx.fillStyle = `rgba(255,255,255,${0.22 + i * 0.07})`
    ctx.beginPath()
    ctx.ellipse(drift, h * (0.16 + i * 0.13), w * (0.3 - i * 0.06), h * 0.07, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  const seaY = h * 0.62
  ctx.fillStyle = '#6d8b93'
  ctx.fillRect(0, seaY, w, h - seaY)
  for (let i = 0; i < 4; i++) {
    ctx.strokeStyle = `rgba(220,235,238,${0.18 + 0.08 * Math.sin(t * 1.7 + i)})`
    ctx.lineWidth = Math.max(1, h * 0.02)
    ctx.beginPath()
    for (let x = 0; x <= w; x += 5) {
      const y = seaY + ((i + 0.6) / 4) * (h - seaY) + Math.sin(x * 0.1 - t * 1.4 + i * 1.3) * h * 0.02
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  ctx.fillStyle = 'rgba(235,245,246,0.5)'
  for (let k = 0; k < 3; k++) {
    const fx = w * (0.08 + k * 0.06)
    ctx.fillRect(fx, seaY - h * 0.2, Math.max(1, w * 0.014), h * 0.2 * (0.7 + 0.3 * Math.sin(t * 2 + k * 2)))
  }
  const cx = w * 0.7, cy = h * 0.44, R = h * 0.3
  const wa = t * 0.35
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(wa)
  ctx.strokeStyle = 'rgba(52,62,58,0.9)'
  ctx.lineWidth = Math.max(1, h * 0.035)
  ctx.beginPath()
  ctx.arc(0, 0, R, 0, Math.PI * 2)
  ctx.stroke()
  for (let i = 1; i <= 3; i++) {
    ctx.lineWidth = Math.max(1, h * 0.016)
    ctx.beginPath()
    ctx.arc(0, 0, R * (1 - i * 0.22), 0, Math.PI * 2)
    ctx.stroke()
  }
  for (let s = 0; s < 5; s++) {
    const a = (s / 5) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R)
    ctx.stroke()
  }
  ctx.restore()
}

// A sealed lens: grey cloud churn, no picture — the sphere shows the ages you
// have linked, and keeps its secrets dark until then.
function sealed(ctx, w, h, t) {
  sky(ctx, w, h, '#101014', '#1c1c22')
  for (let i = 0; i < 3; i++) {
    const a = t * 0.18 * (1 + i * 0.4) + i * 2.1
    ctx.strokeStyle = `rgba(120,124,138,${0.12 + i * 0.05})`
    ctx.lineWidth = Math.max(1, h * 0.05)
    ctx.beginPath()
    ctx.arc(w * L, h * L, h * (0.14 + i * 0.12), a, a + 2.2)
    ctx.stroke()
  }
  ctx.fillStyle = `rgba(160,168,180,${0.1 + 0.05 * Math.sin(t * 0.9)})`
  ctx.beginPath()
  ctx.arc(w * L, h * L, h * 0.05, 0, Math.PI * 2)
  ctx.fill()
}

const SCENES = { selenitic, stoneship, mechanical, channelwood }

// Paint one age-vision into `ctx`, clipped to a glass lens inscribed in the
// (w x h) canvas, with rim and a specular sweep so each pane reads as a sphere.
export function drawVision(ctx, age, t, unlocked, w, h) {
  const cx = w * L, cy = h * L, r = Math.min(w, h) * 0.48
  ctx.clearRect(0, 0, w, h)
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.clip()
  if (unlocked && SCENES[age]) SCENES[age](ctx, w, h, t)
  else sealed(ctx, w, h, t)
  const glass = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.5, r * 0.1, cx, cy, r)
  glass.addColorStop(0, 'rgba(255,255,255,0.16)')
  glass.addColorStop(0.35, 'rgba(255,255,255,0.02)')
  glass.addColorStop(1, 'rgba(0,0,0,0.42)')
  ctx.fillStyle = glass
  ctx.fillRect(0, 0, w, h)
  ctx.restore()
  ctx.strokeStyle = 'rgba(214,178,110,0.55)'
  ctx.lineWidth = Math.max(1, w * 0.014)
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'
  ctx.lineWidth = Math.max(1, w * 0.02)
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.86, Math.PI * 1.15, Math.PI * 1.5)
  ctx.stroke()
}
