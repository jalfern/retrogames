// #925: the phone link-pad thumb layout, expressed as a pure law so it can be
// gated in Node the same way #735 gated vpadSize. The old pad put the A/B/X/Y
// face buttons in a flat row between the two sticks — no thumb can reach them
// while holding a phone in landscape. This is the Xbox Cloud Gaming touch
// layout instead: left stick bottom-left, the face buttons in a thumb diamond
// bottom-right, a smaller right stick between them, L/R shoulders in the top
// corners and START small at top centre.
//
// vpadSize still owns every control's SIZE (orientation-symmetric); this module
// only decides WHERE each sits. Safe-area insets (--sat/--sab/--sal/--sar) are
// applied by the component on top of these zero-safe-area rectangles, so they
// push controls inward and only widen the gaps — the reach quadrants below hold.

import { vpadSize } from '../components/vpadSize.js'

export const PAD_FACE_KEYS = ['A', 'B', 'X', 'Y']

export const padLayout = (w, h) => {
    const { btn, gap, stick, knob } = vpadSize(w, h)
    const r = btn + gap                 // diamond arm: centre-to-centre spacing
    const pad = Math.max(10, Math.round(btn * 0.14))
    const aim = Math.round(stick * 0.66)
    const aimKnob = Math.round(aim * 0.34)
    const sw = Math.round(btn * 1.5)
    const sh = Math.round(btn * 0.62)
    const startW = Math.round(btn * 0.9)

    const bx = w - pad - btn / 2 - r          // diamond cluster centre
    const by = h - pad - btn / 2 - r
    const aimCx = w * 0.45                     // right stick: left of the diamond

    const centre = (cx, cy, width, height) =>
        ({ cx: Math.round(cx), cy: Math.round(cy), w: width, h: height,
           x: Math.round(cx - width / 2), y: Math.round(cy - height / 2) })

    const move = centre(pad + stick / 2, h - pad - stick / 2, stick, stick)
    const aimEl = centre(aimCx, h - pad * 0.3 - aim / 2, aim, aim)
    const faces = {
        Y: centre(bx, by - r, btn, btn),
        X: centre(bx - r, by, btn, btn),
        B: centre(bx + r, by, btn, btn),
        A: centre(bx, by + r, btn, btn),
    }
    const L = centre(pad + sw / 2, pad + sh / 2, sw, sh)
    const R = centre(w - pad - sw / 2, pad + sh / 2, sw, sh)
    const start = centre(w / 2, pad + sh / 2, startW, sh)

    return {
        btn, gap, stick, knob, aimKnob, r, pad, sw, sh, startW,
        move, aim: aimEl, ...faces, L, R, start,
    }
}

const intersect = (a, b) => {
    const x = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
    const y = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
    return x > 0 && y > 0
}

// A landscape viewport where every control lands under a thumb and none collide.
export const reachReport = (w, h) => {
    const L = padLayout(w, h)
    const fails = []
    const push = (ok, msg) => { if (!ok) fails.push(msg); return ok }

    const cyc = (L.Y.cy + L.A.cy) / 2         // diamond cluster centre (Y/A are the column)
    push(cyc > h * 0.5, `the face-diamond cluster sits in the bottom half (cluster cy ${cyc.toFixed(0)} > ${(h * 0.5).toFixed(0)})`)
    const facesRight = PAD_FACE_KEYS.every((k) => L[k].cx > w / 2)
    push(facesRight, `every face button is on the right half (right thumb)`)
    push(L.A.cy > h * 0.7, `A is low (A.cy ${L.A.cy} > ${(h * 0.7).toFixed(0)})`)
    push(L.move.cx < w / 2 && L.move.cy > h * 0.7, `MOVE stick is bottom-left`)
    push(L.aim.w < L.stick, `right stick is smaller than the left (${L.aim.w} < ${L.stick})`)
    push(L.aim.cy > h * 0.7, `right stick sits at the bottom`)
    push(L.move.x + L.move.w < L.aim.x, `right stick clears the MOVE stick`)
    push(L.aim.x + L.aim.w < L.X.x, `right stick clears the face diamond`)
    push(L.L.cx < w * 0.25 && L.L.cy < h * 0.35, `L shoulder is top-left corner`)
    push(L.R.cx > w * 0.75 && L.R.cy < h * 0.35, `R shoulder is top-right corner`)
    push(Math.abs(L.start.cx - w / 2) < w * 0.1 && L.start.cy < h * 0.35, `START is small top-centre`)

    const ctrl = { ...PAD_FACE_KEYS.reduce((a, k) => ({ ...a, [k]: L[k] }), {}), move: L.move, aim: L.aim, L: L.L, R: L.R, start: L.start }
    const names = Object.keys(ctrl)
    const hits = []
    for (let i = 0; i < names.length; i++)
        for (let j = i + 1; j < names.length; j++)
            if (intersect(ctrl[names[i]], ctrl[names[j]])) hits.push(`${names[i]}~${names[j]}`)
    push(hits.length === 0, `no two controls overlap (${hits.join(', ')})`)

    return { ok: fails.length === 0, fails, layout: L }
}
