// THE LINKING BOOKS (#1031) — touching an Age's book does not cut: the page
// opens into the starfield and the travel animates. Everything here is pure:
// fixed tick count, a deterministic star table (no Math.random anywhere) and a
// 2D painter, so scripts/mystcheck.mjs can require that one instant paints
// the same picture twice, two instants differ, every Age wears its own
// palette, and the field fully covers the swap window mid-flight.
//
// In the 1993 original the sequence is: the book's page rushes up to fill the
// screen, a seam of light opens across the dark, and blue-white stars wheel
// outward on a slow swirl until the new Age resolves out of them. The overlay
// covers the world the whole time the node swap happens underneath it.

export const LINK_TICKS = 175

// The six book touch-points, keyed `<node>/<id>` (spot ids repeat across
// nodes, so the node is part of the key). The four Ages' home books, the
// Channelwood hub book and its landing panel — every other travel is a step,
// not a leap. The red and blue books are voices, not doors: they stay out.
const BOOKS = {
  'towerTop/mechanicalBook': 'mechanical',
  'library/fireplace': 'selenitic',
  'cabin/safe': 'stoneship',
  'cave/channelwoodDoor': 'channelwood',
  'chanWheel/hubBook': 'channelwood',
  'channelwood/retChannelwood': 'myst',
  // #1035 — every Age says goodbye through the starfield, not a cut: leaving
  // Selenitic, Stoneship or Mechanical flies home to MYST the way Channelwood's
  // landing panel already did (#1032). Intra-Age steps (pier↔deck, terrace↔wheel)
  // stay plain walks — in 1993 only crossing between worlds folded space.
  'selenitic/retSelenitic': 'myst',
  'stoneship/retStoneship': 'myst',
  'mechanical/retMechanical': 'myst',
}

export function linkingBook(node, id) {
  return BOOKS[`${node}/${id}`] || null
}

// Per-Age cover ink (the rushing page), starfield floor and tint. MYST's
// linking light ran deep blue-white for every book; the Ages' own light leaks
// into the edges, so each leap still feels like the world you are heading to.
export const LINK_PALETTE = {
  mechanical: { ink: '#140b06', floor: '#07070f', tint: [255, 150, 60] },
  selenitic: { ink: '#07120c', floor: '#06080f', tint: [110, 230, 150] },
  stoneship: { ink: '#0b0f13', floor: '#06080f', tint: [160, 200, 224] },
  channelwood: { ink: '#071214', floor: '#06080f', tint: [120, 220, 220] },
  myst: { ink: '#100d06', floor: '#06080f', tint: [150, 170, 230] },
}

export function linkTint(age) {
  const p = LINK_PALETTE[age] || LINK_PALETTE.myst
  return p.tint
}

// The page cover: opaque from first touch (the world swaps underneath it),
// held through the flight, fading to zero exactly when the sim clears the
// link (the last frame and the unmount agree — no white flash).
export function linkEnvelope(t) {
  const p = t / LINK_TICKS
  if (p < 0.30) return 1
  return Math.max(0, (1 - p) / 0.30)
}

const hash = (i, j) => {
  let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(j + 0x165667b1, 0xc2b2ae35)
  x ^= x >>> 15; x = Math.imul(x, 0x2545f491); x ^= x >>> 13
  return x >>> 0
}

// One starfield, stable for the whole flight (and across saves — the linking
// light is a world constant, not a per-seed roll): angle, swirl, spin, a
// personal speed/phase/size and a rough 0..255 colour mix per star.
export function linkStars(n = 240) {
  const out = new Array(n)
  for (let i = 0; i < n; i++) {
    const h = hash(i + 1, 7)
    const h2 = hash(i + 1, 13)
    const h3 = hash(i + 1, 23)
    out[i] = {
      a: (h % 6283) / 1000,
      swirl: 0.5 + (h2 % 900) / 1000,
      spin: ((h3 % 400) - 200) / 1000,
      rate: 0.35 + (h % 997) / 1600,
      ph: (h2 % 991) / 1000,
      sz: 0.6 + (h3 % 130) / 100,
      cr: 170 + (h % 80),
      cg: 190 + (h2 % 60),
      cb: 235 + (h3 % 20),
    }
  }
  return out
}

function lerp(a, b, k) { return a + (b - a) * k }

// #1035 — arrival acceleration. The original's linking light did not wheel at a
// constant rate: it gathered speed hard toward the moment the Age resolved, so the
// last beat of the fade rushes and the arrival lands instead of petering out. A
// pure, monotonic ramp of `prog` (calm at the start, ~3× pull at arrival) — no
// clock, no random; the harness proves it never slows and ends steep.
export function linkAccel(prog) {
  const p = Math.max(0, Math.min(1, prog))
  return 1 + 1.9 * p * p * p
}

// #1035 — the seam of light does not crack open stiff and straight; the 1993 rift
// shimmered and wavered as it broke through the dark. Pure in `prog` (no Math.
// random — replay determinism is the whole contract): three incommensurate sines
// tilt the angle, breathe the thickness and rock the length, so the rift reads as
// living light rather than a bar. Returns the open fraction too, so the painter
// shares one source of truth.
export function linkSeam(prog) {
  const p = Math.max(0, Math.min(1, (prog - 0.10) / 0.22))
  const e = p * p * (3 - 2 * p)
  const wob = Math.sin(prog * 38.0) * 0.028 + Math.sin(prog * 71.0 + 1.3) * 0.016 + Math.sin(prog * 13.0) * 0.011
  return {
    p,
    e,
    angle: -0.35 + wob,
    len: 0.72 * (1 + 0.06 * Math.sin(prog * 47.0 + 0.5)),
    thick: 0.028 * (1 + 0.35 * Math.sin(prog * 53.0 + 2.1)),
    waver: wob,
  }
}

// Paint the linking animation at `prog` (0..1) across a w x h canvas.
export function drawLink(ctx, age, prog, w, h) {
  const pal = LINK_PALETTE[age] || LINK_PALETTE.myst
  const cx = w * 0.5, cy = h * 0.5, R = Math.hypot(w, h) * 0.55
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R)
  g.addColorStop(0, pal.floor)
  g.addColorStop(1, '#020204')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  // the page rushes up: an Age-ink panel with a double-rule cover border
  if (prog < 0.24) {
    const cp = prog / 0.24
    const e = cp * cp * (3 - 2 * cp)
    const bw = w * (0.06 + 0.94 * e), bh = h * (0.06 + 0.94 * e)
    ctx.fillStyle = pal.ink
    ctx.fillRect(cx - bw / 2, cy - bh / 2, bw, bh)
    ctx.strokeStyle = `rgba(${linkTint(age).join(',')},${(0.5 * (1 - e)).toFixed(3)})`
    ctx.lineWidth = Math.max(1, w * 0.006)
    ctx.strokeRect(cx - bw * 0.46, cy - bh * 0.44, bw * 0.92, bh * 0.88)
  }

  // age-light haze at the edges — the destination bleeding through the dark
  const [tr, tg, tb] = linkTint(age)
  ctx.fillStyle = `rgba(${tr},${tg},${tb},0.05)`
  ctx.fillRect(0, 0, w, h)

  // the seam of light opens across the page as the starfield breaks through:
  // a soft rift, brightest at its heart, not a hard bar — and it shimmers and
  // wavers as it spreads (#1035 linkSeam).
  if (prog > 0.10 && prog < 0.42) {
    const { e: se, angle, len: lenF, thick: thickF, waver } = linkSeam(prog)
    const len = w * lenF * se, thick = Math.max(1, h * thickF * (1 - se * 0.4))
    ctx.save()
    ctx.translate(cx, cy + h * waver * 0.6)
    ctx.rotate(angle)
    const rg = ctx.createLinearGradient(-len / 2, 0, len / 2, 0)
    rg.addColorStop(0, 'rgba(210,228,255,0)')
    rg.addColorStop(0.5, `rgba(225,238,255,${(0.7 * se * (1 - se * 0.5)).toFixed(3)})`)
    rg.addColorStop(1, 'rgba(210,228,255,0)')
    ctx.fillStyle = rg
    ctx.beginPath()
    ctx.ellipse(0, 0, len / 2, thick / 2, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    const cg = ctx.createRadialGradient(cx, cy + h * waver * 0.6, 0, cx, cy + h * waver * 0.6, h * 0.42 * se)
    cg.addColorStop(0, `rgba(215,232,255,${(0.34 * se * (1 - se * 0.35)).toFixed(3)})`)
    cg.addColorStop(1, 'rgba(215,232,255,0)')
    ctx.fillStyle = cg
    ctx.fillRect(0, 0, w, h)
  }

  // the stars wheel outward on a slow swirl that accelerates like the original's
  // hyperspace pull (#1035 linkAccel: the field gathers speed toward arrival);
  // each streak points home to the centre
  const accel = linkAccel(prog)
  for (const st of linkStars()) {
    const c = (prog * st.rate * accel + st.ph) % 1
    const q = c * c
    const rr = (0.02 + q * 0.95) * R
    if (rr < 2) continue
    const ang = st.a + q * st.swirl * accel + prog * st.spin
    const ca = Math.cos(ang), sa = Math.sin(ang)
    const tail = Math.min(rr, (0.02 + Math.max(0, q - 0.09) * 0.95) * R)
    const x0 = cx + ca * tail, y0 = cy + sa * tail
    const x1 = cx + ca * rr, y1 = cy + sa * rr
    const fade = Math.sin(Math.PI * c)
    const cr = Math.round(lerp(st.cr, tr, 0.18))
    const cg = Math.round(lerp(st.cg, tg, 0.18))
    const cb = Math.round(lerp(st.cb, tb, 0.18))
    ctx.strokeStyle = `rgba(${cr},${cg},${cb},${(0.18 + 0.72 * fade).toFixed(3)})`
    ctx.lineWidth = Math.max(1, st.sz * (0.5 + q))
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.stroke()
  }
}
