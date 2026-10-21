// COMET DRIFT GP — the attract course selector (#534). On a phone the title's
// ‹ › chevrons are the ONLY course control: the stick sends no arrow keys and
// every other tap starts the race. This is the pure geometry + hit test the
// renderer and the pointer handler share, so cometcheck can audit the targets
// in Node (thumb-sized, off-centre, symmetric, never eating the start zone).
//
// All positions are in CANVAS space (the adaptive layout's W x H source
// pixels); the HUD scales with `hs`, the short-axis scale the rest of the
// attract uses, so the targets stay a thumb's size at any aspect.

// The selector row: the two chevron hit-boxes flank the circuit name, which
// sits dead-centre. `left` / `right` are the box centres, `hw` / `hh` their
// half-extents. A tap on a chevron cycles the course; a tap anywhere else on
// the attract (the name, the prompt, the sky) starts the race.
export function selectorGeom(W, H, hs) {
    const rowY = Math.round(H * 0.47)
    const off = Math.round(88 * hs)               // chevron offset from centre
    const hw = Math.max(1, Math.round(32 * hs))   // hit-box half-width
    const hh = Math.max(1, Math.round(20 * hs))   // hit-box half-height
    return {
        w: W, h: H, hs, rowY, hw, hh, off,
        left: [Math.round(W / 2 - off), rowY],
        right: [Math.round(W / 2 + off), rowY],
    }
}

// Which target a (canvas-space) point lands on: -1 the left chevron, +1 the
// right, 0 neither (a tap anywhere else). The two boxes never overlap and the
// centre — the start zone — stays clear of both.
export function selectorHit(geom, cx, cy) {
    const inBox = (c) => Math.abs(cx - c[0]) <= geom.hw && Math.abs(cy - c[1]) <= geom.hh
    if (inBox(geom.left)) return -1
    if (inBox(geom.right)) return 1
    return 0
}

// #502 item 5: the mini-map preview box on the attract selector — a small
// panel in the centre zone between the chevrons showing the shape of the
// SELECTED circuit, so cycling courses shows the track, not just its name.
// It must never overlap either chevron hit-box (a preview is not a button).
export function previewBox(W, H, hs) {
    const geom = selectorGeom(W, H, hs)
    const w = Math.max(1, Math.round(104 * hs))
    const h = Math.max(1, Math.round(30 * hs))
    const cx = Math.round(W / 2); const cy = geom.rowY
    return { x: cx - Math.round(w / 2), y: cy - Math.round(h / 2), w, h }
}
