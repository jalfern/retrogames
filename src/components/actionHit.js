// The A/B action-zone hit test.
//
// The two on-screen action buttons are drawn B-left / A-right (see
// VirtualControls). This maps a touch point to the action it should fire by
// testing the point against each button's OWN drawn rect — never a zone center
// — so a button and its action can never be swapped. The #734 bug: the old
// zone-center test mapped the left-drawn B to Space (A) and the right-drawn A
// to B, so in Smash TV tapping BOMB fired and tapping FIRE bombed.
//
// Pure on purpose: the component feeds it live getBoundingClientRect() values,
// and vpadcheck feeds it simulated rects, so the same law is proven in both.

// inRect: a point inside a rect (both edges inclusive), false for a null rect.
const inRect = (r, x, y) =>
    !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom

export const actionCodeAt = ({ showA, bCode, aRect, bRect, zoneRect }, x, y) => {
    const hasB = !!bCode
    if (showA && hasB) {
        if (inRect(bRect, x, y)) return bCode   // the drawn B (left) fires B
        if (inRect(aRect, x, y)) return 'Space'  // the drawn A (right) fires A
        // A touch in the gap / padding between or around the buttons: split on
        // the DRAWN side (B is the left button, A the right), not the old
        // swapped zone half. Centre from left/right so no `width` is assumed.
        const cx = (zoneRect.left + zoneRect.right) / 2
        return x < cx ? bCode : 'Space'
    }
    if (hasB) return bCode
    return 'Space'
}
