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
