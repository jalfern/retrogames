// #735: the virtual pad scales with the screen — Apple's GCVirtualController
// model: stick bottom-left, big spaced face buttons bottom-right, sized for
// thumbs, larger on iPad, comfortable portrait and landscape.
//
// The law is one number — the button diameter — derived from the SHORTER
// viewport side, so portrait and landscape of the same device are identical
// (orientation symmetry). Everything else derives from it, so a single gate
// on the diameter covers the whole pad.
//
//   btn = clamp(0.215 · min(w, h), 84, 96)
//
// 0.215 · 390 = 84 — the iPhone floor; every iPad (min side >= 585)
// takes the 96 cap. Phones below 390 (SE-class) keep the 64 floor, so a
// bigger button never shrinks on a small phone. Pure on purpose: vpadcheck
// gates the law in Node and the component feeds it the live viewport.

export const VPAD_BTN_FLOOR = 84
export const VPAD_BTN_CAP = 96
export const VPAD_BTN_FRAC = 0.215

export const vpadBtn = (w, h) =>
    Math.round(Math.min(VPAD_BTN_CAP, Math.max(VPAD_BTN_FLOOR, VPAD_BTN_FRAC * Math.min(w, h))))

// The full pad, every dimension derived from the button diameter:
//   gap   between the two face buttons (old: 8px at 56 — the "clearly spaced" gap)
//   stick left control base (fixed stick / diamond gate / legacy d-pad)
//   knob  the sliding thumb knob
//   arm   one cross arm of the legacy d-pad
//   font  face-button label size for a label of `len` chars (readable at a glance)
export const vpadSize = (w, h) => {
    const btn = vpadBtn(w, h)
    const stick = Math.round(btn * 2.14)
    return {
        btn,
        gap: Math.round(btn * 0.14),
        stick,
        knob: Math.round(stick * 0.34),
        arm: Math.round(btn * 0.82),
        font: (len) => Math.round(btn * (len > 5 ? 0.19 : len > 3 ? 0.22 : 0.27)),
    }
}
