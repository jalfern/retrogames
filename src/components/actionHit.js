// The A/B action-zone hit test.
//
// The two on-screen action buttons are drawn B-left / A-right (see
// VirtualControls). This maps a touch point to the action it should fire by
// testing the point against each button's OWN drawn rect — never a zone center
// — so a button and its action can never be swapped. The #734 bug: the old
// zone-center test mapped the left-drawn B to Space (A) and the right-drawn A
// to B, so in Smash TV tapping BOMB fired and tapping FIRE bombed.
//
// #735: the hit area is LARGER than the drawn circle. Each button claims a
// circle of HIT_R · (drawn short side) around its centre — a thumb that lands
// on the ring around the button, or in the gap between the two, goes to the
// NEARER button (ties to the left-drawn B, matching the drawn-side split).
// Only a point outside both hit circles falls back to the zone-center split,
// so the #734 invariant holds at every size.
//
// Pure on purpose: the component feeds it live getBoundingClientRect() values,
// and vpadcheck feeds it simulated rects, so the same law is proven in both.

// Hit radius as a multiple of the drawn short half-side: 1.4 gives a 40%
// extension past the drawn edge, enough at every pad size that the two
// circles overlap across the gap (gap = 0.28·btn < 2 · 0.4·btn/2), so a touch
// anywhere between the buttons is inside at least one circle.
export const HIT_R = 1.4

// inRect: a point inside a rect (both edges inclusive), false for a null rect.
const inRect = (r, x, y) =>
    !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom

const hitRadius = (r) => (Math.min(r.width, r.height) / 2) * HIT_R
const dist = (r, x, y) =>
    Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2))

export const actionCodeAt = ({ showA, bCode, aRect, bRect, zoneRect }, x, y) => {
    const hasB = !!bCode
    if (showA && hasB) {
        if (inRect(bRect, x, y)) return bCode   // the drawn B (left) fires B
        if (inRect(aRect, x, y)) return 'Space'  // the drawn A (right) fires A
        if (aRect && bRect) {
            // The extended ring: a touch past the drawn edge (or in the gap)
            // goes to the nearer button.
            const dB = dist(bRect, x, y)
            const dA = dist(aRect, x, y)
            if (dB <= hitRadius(bRect) && dA <= hitRadius(aRect))
                return dB <= dA ? bCode : 'Space'
            if (dB <= hitRadius(bRect)) return bCode
            if (dA <= hitRadius(aRect)) return 'Space'
        }
        // A touch outside both hit circles (zone padding): split on the DRAWN
        // side (B is the left button, A the right), not the old swapped zone
        // half. Centre from left/right so no `width` is assumed.
        const cx = (zoneRect.left + zoneRect.right) / 2
        return x < cx ? bCode : 'Space'
    }
    if (hasB) return bCode
    return 'Space'
}
