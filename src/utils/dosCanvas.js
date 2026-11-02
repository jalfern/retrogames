/**
 * dosCanvas — reading what a js-dos emulator is actually drawing.
 *
 * The `eye` sensor arm (CGA font OCR, ego sprite match, screen fingerprints)
 * starts here, so the two things it must never get wrong are handled once:
 *
 * 1. **Find the canvas.** js-dos has nested it in shadow roots in some versions,
 *    so a plain querySelector is not enough — walk shadow roots too, then fall
 *    back to any canvas on the page.
 * 2. **Sample the emulator's own buffer, not the displayed element.** The canvas
 *    is CSS-scaled with `image-rendering: pixelated`, and on a HiDPI screen the
 *    backing store is far bigger than the 320x200 the guest is drawing. Sampling
 *    the displayed pixels gives you resampled mush and an OCR atlas that
 *    "works on my machine". So: redraw into an exact 320x200 buffer. (Same trap
 *    `evocheck` hit reading Mario's HiDPI-scaled HUD band.)
 */

export const VGA = { w: 320, h: 200 }

/**
 * js-dos ignores the keyboard until its container has focus — a synthetic
 * keydown reaches the window handlers but DOSBox drops it while blurred (the
 * emulator tracks a `blur` state, which is exactly why the old manual buttons
 * only worked after you clicked the game). Focus it before injecting keys.
 */
export function focusEmulator(root) {
  const el = (root && root.querySelector('.jsdos-rso, .js-dos-container, canvas')) || findCanvas(root) || root
  if (!el) return false
  try {
    if (typeof el.focus === 'function') el.focus({ preventScroll: true })
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }))
  } catch { /* older browsers */ }
  return true
}

export function findCanvas(root) {
  if (typeof document === 'undefined') return null
  const scope = root || document
  let c = scope.querySelector && scope.querySelector('canvas')
  if (c) return c

  const walk = (el) => {
    if (!el) return null
    if (el.shadowRoot) {
      const sc = el.shadowRoot.querySelector('canvas')
      if (sc) return sc
      for (const child of el.shadowRoot.children) {
        const r = walk(child); if (r) return r
      }
    }
    for (const child of el.children || []) {
      const r = walk(child); if (r) return r
    }
    return null
  }

  c = walk(scope === document ? document.body : scope)
  if (c) return c
  return document.querySelector('canvas')
}

/**
 * Copy the emulator's frame into an exact w×h buffer.
 * @returns {{ w:number, h:number, data:Uint8ClampedArray }|null}
 */
export function sampleBuffer(root, { w = VGA.w, h = VGA.h } = {}) {
  const canvas = findCanvas(root)
  if (!canvas) return null
  try {
    const tmp = document.createElement('canvas')
    tmp.width = w
    tmp.height = h
    const ctx = tmp.getContext('2d', { willReadFrequently: true })
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(canvas, 0, 0, w, h)
    const img = ctx.getImageData(0, 0, w, h)
    return { w, h, data: img.data, canvas }
  } catch {
    // Cross-origin-tainted canvas would land here; ours are same-origin.
    return null
  }
}

export function toDataUrl(root, { w = VGA.w, h = VGA.h, type = 'image/jpeg', quality = 0.7 } = {}) {
  const canvas = findCanvas(root)
  if (!canvas) return null
  try {
    const tmp = document.createElement('canvas')
    tmp.width = w
    tmp.height = h
    const ctx = tmp.getContext('2d')
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(canvas, 0, 0, w, h)
    return tmp.toDataURL(type, quality)
  } catch {
    return null
  }
}

/**
 * A coarse fingerprint of a frame — the "which screen am I standing on" signal
 * for the screen graph, computed from 8x8 blocks so a single animating sprite
 * (Graham himself, the bear, the waterfalls) cannot change it.
 *
 * Cheap and deterministic; NOT a perceptual hash in the cryptographic sense.
 */
export function framePrint(root, { cols = 20, rows = 12 } = {}) {
  const buf = sampleBuffer(root)
  if (!buf) return null
  const { w, h, data } = buf
  const bw = Math.floor(w / cols)
  const bh = Math.floor(h / rows)
  const out = []
  for (let ry = 0; ry < rows; ry++) {
    for (let rx = 0; rx < cols; rx++) {
      let lum = 0
      let n = 0
      for (let y = ry * bh; y < (ry + 1) * bh; y += 2) {
        for (let x = rx * bw; x < (rx + 1) * bw; x += 2) {
          const i = (y * w + x) * 4
          lum += (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000
          n++
        }
      }
      out.push(n ? Math.round(lum / n / 16) : 0)   // 4 bits of brightness per block
    }
  }
  return { cols, rows, blocks: out, hash: hashBlocks(out) }
}

function hashBlocks(blocks) {
  let h = 0x811c9dc5
  for (let i = 0; i < blocks.length; i++) {
    h ^= blocks[i]
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/** Distance between two fingerprints — how sure are we that this is a new room. */
export function printDistance(a, b) {
  if (!a || !b || a.blocks.length !== b.blocks.length) return Infinity
  let d = 0
  for (let i = 0; i < a.blocks.length; i++) d += Math.abs(a.blocks[i] - b.blocks[i])
  return d / a.blocks.length
}

/**
 * Sub-region variant of framePrint (#1463): computes the block fingerprint of a
 * rectangular area of the guest framebuffer, identified by its top-left corner
 * (x, y) and dimensions (w, h) in emulator coordinates (320×200).
 *
 * WHY: Ultima I–V's animated title flames fill the top ~40% of the screen and
 * produce restDrift as large as a menu advance. By restricting the fingerprint to
 * the lower area where the menu is drawn, the distance metric becomes sensitive to
 * state changes while the flame noise is excluded entirely.
 *
 * @param {Element} root - container element to find the canvas within
 * @param {object} opts
 * @param {number} opts.x - left edge of sub-region (emulator coords)
 * @param {number} opts.y - top edge of sub-region (emulator coords)
 * @param {number} opts.w - width of sub-region
 * @param {number} opts.h - height of sub-region
 * @param {number} [opts.cols=10] - number of horizontal blocks in the sub-grid
 * @param {number} [opts.rows=8] - number of vertical blocks in the sub-grid
 * @returns {{ cols, rows, blocks, hash, x, y, w, h }|null}
 */
export function subPrint(root, { x = 0, y = 0, w = VGA.w, h = VGA.h, cols = 10, rows = 8 } = {}) {
  const buf = sampleBuffer(root)
  if (!buf) return null
  const sx = Math.max(0, Math.min(x, buf.w - 1))
  const sy = Math.max(0, Math.min(y, buf.h - 1))
  const sw = Math.max(1, Math.min(w, buf.w - sx))
  const sh = Math.max(1, Math.min(h, buf.h - sy))
  const bw = Math.floor(sw / cols)
  const bh = Math.floor(sh / rows)
  if (bw < 1 || bh < 1) return null
  const out = []
  for (let ry = 0; ry < rows; ry++) {
    for (let rx = 0; rx < cols; rx++) {
      let lum = 0
      let n = 0
      for (let py = sy + ry * bh; py < sy + (ry + 1) * bh; py += 2) {
        for (let px = sx + rx * bw; px < sx + (rx + 1) * bw; px += 2) {
          const i = (py * buf.w + px) * 4
          lum += (buf.data[i] * 299 + buf.data[i + 1] * 587 + buf.data[i + 2] * 114) / 1000
          n++
        }
      }
      out.push(n ? Math.round(lum / n / 16) : 0)
    }
  }
  return { cols, rows, blocks: out, hash: hashBlocks(out), x: sx, y: sy, w: sw, h: sh }
}

/**
 * Per-band luminance profile for a vertical stack of equal-height horizontal
 * strips (#1463). Designed to detect a menu-highlight bar: one strip has a
 * distinctly higher mean luminance (the selected item's background).
 *
 * @param {Element} root - container element
 * @param {object} opts
 * @param {number} opts.y - top of the first band
 * @param {number} [opts.x=0] - left edge of sampled columns
 * @param {number} [opts.w=320] - width of sampled columns
 * @param {number} [opts.itemHeight=16] - height of each menu item in pixels
 * @param {number} [opts.count=5] - number of menu bands to sample
 * @returns {{ bands: Array<{ index, meanLuma, peakLuma, litRatio }>, highlight: number|null }|null}
 */
export function bandProfile(root, { y = 0, x = 0, w = VGA.w, itemHeight = 16, count = 5 } = {}) {
  const buf = sampleBuffer(root)
  if (!buf) return null
  const bands = []
  for (let i = 0; i < count; i++) {
    const bandY = Math.min(y + i * itemHeight, buf.h - 1)
    const bandH = Math.min(itemHeight, buf.h - bandY)
    if (bandH < 1) { bands.push({ index: i, meanLuma: 0, peakLuma: 0, litRatio: 0 }); continue }
    let sum = 0, peak = 0, lit = 0, n = 0
    for (let py = bandY; py < bandY + bandH; py++) {
      for (let px = x; px < Math.min(x + w, buf.w); px += 2) {
        const idx = (py * buf.w + px) * 4
        const l = (buf.data[idx] * 299 + buf.data[idx + 1] * 587 + buf.data[idx + 2] * 114) / 1000
        sum += l
        if (l > peak) peak = l
        if (l > 80) lit++
        n++
      }
    }
    bands.push({ index: i, meanLuma: n ? sum / n : 0, peakLuma: peak, litRatio: n ? lit / n : 0 })
  }
  const maxLuma = bands.length ? Math.max(...bands.map(b => b.meanLuma)) : 0
  const highlight = bands.length ? bands.find(b => b.meanLuma === maxLuma && maxLuma > 40)?.index ?? null : null
  return { bands, highlight }
}

/**
 * Mean color + saturation stats for a rectangular sub-region (#1463).
 * Unlike framePrint (which quantizes to 4-bit brightness), this preserves color
 * identity: a highlight bar that swaps black background for white is unambiguous
 * regardless of brightness-level changes elsewhere on the screen.
 *
 * @param {Element} root - container element
 * @param {object} opts
 * @param {number} opts.x - left edge (emulator coords)
 * @param {number} opts.y - top edge
 * @param {number} opts.w - width
 * @param {number} opts.h - height
 * @returns {{ meanR, meanG, meanB, meanLuma, colorDistance }|null}
 *   colorDistance = sqrt((R-G)² + (G-B)² + (R-B)²) — a cheap hue+saturation metric
 */
export function regionStats(root, { x = 0, y = 0, w = VGA.w, h = VGA.h } = {}) {
  const buf = sampleBuffer(root)
  if (!buf) return null
  const sx = Math.max(0, Math.min(x, buf.w - 1))
  const sy = Math.max(0, Math.min(y, buf.h - 1))
  const sw = Math.max(1, Math.min(w, buf.w - sx))
  const sh = Math.max(1, Math.min(h, buf.h - sy))
  let rSum = 0, gSum = 0, bSum = 0, n = 0
  for (let py = sy; py < sy + sh; py += 2) {
    for (let px = sx; px < sx + sw; px += 2) {
      const i = (py * buf.w + px) * 4
      rSum += buf.data[i]
      gSum += buf.data[i + 1]
      bSum += buf.data[i + 2]
      n++
    }
  }
  if (!n) return null
  const meanR = rSum / n, meanG = gSum / n, meanB = bSum / n
  const meanLuma = (meanR * 299 + meanG * 587 + meanB * 114) / 1000
  const colorDistance = Math.sqrt(
    (meanR - meanG) ** 2 + (meanG - meanB) ** 2 + (meanR - meanB) ** 2
  )
  return { meanR, meanG, meanB, meanLuma, colorDistance }
}
