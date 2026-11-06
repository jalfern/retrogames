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
//
// #794: `opts` lets the HD twin place the same contract on its own attract
// stack — the row rides the stacked layout (rowY), and the chevron boxes sit
// outside the measured name (off / hw / hh). Defaults reproduce the 2D
// geometry byte for byte. selectorHit is shape-agnostic, so both twins share
// one hit test.
export function selectorGeom(W, H, hs, opts = {}) {
    const rowY = opts.rowY !== undefined ? Math.round(opts.rowY) : Math.round(H * 0.47)
    const off = opts.off !== undefined ? Math.round(opts.off) : Math.round(88 * hs)
    const hw = opts.hw !== undefined ? Math.max(1, Math.round(opts.hw)) : Math.max(1, Math.round(32 * hs))
    const hh = opts.hh !== undefined ? Math.max(1, Math.round(opts.hh)) : Math.max(1, Math.round(20 * hs))
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

// #1737: the COMET CUP arming target on the attract. A pill below the panel
// edge (the panel ends at H*0.78) so a phone thumbs the points grand prix
// without touching the #534 selector row — the chevron contract stays
// byte-identical (existing geometry + gates unchanged); this is its own,
// separate target on the clear canvas under the panel.
export function cupBadgeGeom(W, H, hs) {
    return {
        w: W, h: H, hs,
        cx: Math.round(W / 2),
        cy: Math.round(H * 0.83),
        hw: Math.max(1, Math.round(78 * hs)),
        hh: Math.max(1, Math.round(16 * hs)),
    }
}

// True when a canvas-space point lands on the cup badge (tap arms/disarms the
// grand prix). Never overlaps the chevron boxes: the badge sits below rowY.
export function cupBadgeHit(g, cx, cy) {
    return Math.abs(cx - g.cx) <= g.hw && Math.abs(cy - g.cy) <= g.hh
}
