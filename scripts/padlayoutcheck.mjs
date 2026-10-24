// padlayoutcheck — #925 thumb-reach law, in Node.
//
// The phone link-pad once stacked A/B/X/Y in a flat row between the two sticks;
// every button but the middle two was unreachable with a thumb on a landscape
// phone. This gates the Xbox-style layout law (#925) at the phone and tablet
// sizes the pad actually runs at, so a silent revert — faces back to a row, a
// stick drifting into a thumb zone, controls overlapping — fails here, not in a
// Jon playtest. It is the seed of #925 part 3: the recurring "top-of-screen UI
// overlaps the HUD" family now has a geometry gate that runs at phone AND iPad.
//
//   npm run padlayoutcheck

import { reachReport, padLayout, PAD_FACE_KEYS } from '../src/pages/padLayout.js'
import { vpadSize } from '../src/components/vpadSize.js'

let pass = 0, fail = 0
const ok = (cond, msg) => { if (cond) { pass++ } else { fail++; console.error(`  FAIL: ${msg}`) } }

// Landscape viewports: iPhone 12/13/14, iPhone SE landscape, iPad landscape.
const VIEWPORTS = [
    ['iPhone 12/13 landscape', 844, 390],
    ['iPhone SE landscape', 667, 375],
    ['iPhone 14 Pro Max landscape', 932, 430],
    ['iPad landscape', 1024, 768],
]

for (const [label, w, h] of VIEWPORTS) {
    const { ok: good, fails } = reachReport(w, h)
    ok(good, `${label} (${w}x${h}): all controls thumb-reachable` + (fails.length ? ` — ${fails.join('; ')}` : ''))
}

// The face diamond fills a square cluster exactly: A hugs the bottom-right of
// the cluster, no dead space, so the diamond reads as one thumb group.
for (const [, w, h] of VIEWPORTS) {
    const L = padLayout(w, h)
    ok(L.B.cx === L.A.cx + L.r && L.A.cy === L.B.cy + L.r, `diamond A/B arm consistent at ${w}x${h}`)
    ok(Math.abs(L.X.cy - L.B.cy) <= 1 && Math.abs(L.Y.cx - L.A.cx) <= 1, `diamond is a plus (X~B row, Y~A column) at ${w}x${h}`)
    ok(L.r === L.btn + L.gap, `arm equals btn+gap at ${w}x${h}`)
    ok(L.aim.w < L.stick, `right stick < left stick at ${w}x${h}`)
}

// Sizes still follow the vpadSize law (never re-scaled here).
{
    const L = padLayout(844, 390)
    const sz = vpadSize(844, 390)
    ok(L.btn === sz.btn && L.stick === sz.stick, `padLayout reuses vpadSize btn/stick (${L.btn}/${L.stick})`)
}

// --- mutant that dies: the old layout, faces in a row between the sticks ----
// A/B/X/Y on the horizontal mid-line, centred between the two bottom sticks —
// the exact layout #925 reports. The reach gate must go red on it.
const mutantReach = (w, h) => {
    const { btn, gap, stick } = vpadSize(w, h)
    const rowY = h * 0.5
    const rowW = 4 * btn + 3 * gap
    const cx0 = w / 2 - rowW / 2 + btn / 2
    const faces = PAD_FACE_KEYS.map((k, i) => ({ k, cx: cx0 + i * (btn + gap), cy: rowY, w: btn, h: btn }))
    const fails = []
    if (!faces.every((f) => f.cx > w / 2)) fails.push('faces straddle the centre (old mid-row)')
    if (!faces.every((f) => f.cy > h * 0.4)) fails.push('faces sit on the mid-line, not the thumb zone')
    if (faces[0].cy <= h * 0.7) fails.push('no face reaches the bottom of the screen')
    return fails.length === 0
}
ok(mutantReach(844, 390) === false, 'mid-row mutant FAILS the reach law (this is the #925 bug)')
ok(reachReport(844, 390).ok === true, 'the real layout PASSES where the mid-row mutant fails')

console.log(`padlayoutcheck: ${pass}/${pass + fail}`)
process.exit(fail ? 1 : 0)
