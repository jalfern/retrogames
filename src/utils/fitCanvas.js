// fitCanvas — crisp whole-pixel scaling for the arcade.
//
// Every title draws a fixed logical resolution (W×H) into a canvas. Previously
// that canvas was CSS-stretched to fill its box: on a 1x phone the image comes
// out tiny, and on a 2x/3x Retina panel the stretch is a non-integer ratio, so
// even `image-rendering: pixelated` leaves uneven, half-pixels and a soft edge.
//
// The fix splits the work in two. The game keeps drawing its W×H canvas (the
// "source" — the pixel-reading harness checks read it, unchanged). Each frame
// the helper nearest-neighbour-copies the source onto a SEPARATE display canvas
// whose backing store is W×H scaled by the largest INTEGER that still fits the
// container at the current devicePixelRatio. Because the display backing is an
// exact multiple of the source and its CSS size is that multiple divided by
// dpr, every logical pixel lands on a whole number of DEVICE pixels — crisp at
// 1x, 2x and 3x alike — and it fills as much of the screen as a whole multiple
// allows.

// Pure: pick the integer scale. No DOM here, so it runs (and is tested) in Node.
//   W,H        the source's logical resolution (its backing store)
//   cssW,cssH  the container's available size, in CSS px
//   dpr        devicePixelRatio (device px per CSS px)
// Returns the largest integer s >= 1 whose W*s × H*s backing still fits, plus
// the display canvas's backing size (bw,bh) and CSS size (cssW,cssH).
export function fitScale(W, H, cssW, cssH, dpr = 1) {
  const d = (typeof dpr === 'number' && Number.isFinite(dpr) && dpr > 0) ? dpr : 1
  const fits = cssW > 0 && cssH > 0 && W > 0 && H > 0
  const maxS = fits ? Math.min((cssW * d) / W, (cssH * d) / H) : 1
  const s = Math.max(1, Math.floor(maxS + 1e-6))
  return { s, bw: W * s, bh: H * s, cssW: (W * s) / d, cssH: (H * s) / d }
}

// DOM: owns the display canvas and keeps it in step with the container and dpr.
//   source     the game's W×H canvas — kept in the DOM, the harness reads it
//   container  the element the display canvas is centred in (the game's root)
// Returns { display, blit, measure, destroy }. Call blit() once per frame, after
// the source has been drawn, to publish the crisp frame.
export function makeFitCanvas(source, container, { pixelated = true } = {}) {
  if (!source || !container) {
    const noop = () => {}
    return { display: null, blit: noop, measure: noop, destroy: noop, scale: () => 1 }
  }

  const W = source.width, H = source.height
  const display = document.createElement('canvas')
  display.dataset.fit = 'display'
  display.style.position = 'absolute'
  display.style.left = '50%'
  display.style.top = '50%'
  display.style.transform = 'translate(-50%, -50%)'
  display.style.imageRendering = pixelated ? 'pixelated' : 'auto'
  const dctx = display.getContext('2d')

  // Placed right after the source, so `querySelector('canvas')` still resolves
  // to the W×H source (the harness reads it) and the display paints on top.
  if (source.nextElementSibling) container.insertBefore(display, source.nextElementSibling)
  else container.appendChild(display)

  let ro = null
  let last = ''
  function measure() {
    const r = container.getBoundingClientRect()
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1
    const f = fitScale(W, H, r.width, r.height, dpr)
    // Only touch the backing store when it actually changed: a resize resets
    // the 2d context, so we must not do it every frame.
    const key = f.bw + 'x' + f.bh + '@' + dpr
    display.style.width = f.cssW + 'px'
    display.style.height = f.cssH + 'px'
    if (key !== last || display.width !== f.bw || display.height !== f.bh) {
      display.width = f.bw
      display.height = f.bh
      dctx.imageSmoothingEnabled = false
      last = key
    }
    return f
  }

  function blit() {
    if (!display.width) return
    dctx.clearRect(0, 0, display.width, display.height)
    dctx.drawImage(source, 0, 0, W, H, 0, 0, display.width, display.height)
  }

  function destroy() {
    if (ro) ro.disconnect()
    if (typeof window !== 'undefined') window.removeEventListener('resize', onZoom)
    if (display.parentNode) display.parentNode.removeChild(display)
  }

  const onZoom = () => measure()
  measure()
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => measure())
    ro.observe(container)
  }
  if (typeof window !== 'undefined') window.addEventListener('resize', onZoom)

  return { display, blit, measure, destroy, scale: () => (display.width / W) || 1 }
}
