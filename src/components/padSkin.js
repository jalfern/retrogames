// padSkin.js — ONE visual family for every touch surface (#3127).
//
// The game-side pad bar (VirtualControls, #885/#3108) and the phone half of
// link pads (pages/PadLink.jsx, #893) drew the same glass, the same pressed
// language (sinks + brightens, fades back) and the same knob independently —
// two pages that happened to match drift apart. This module owns the class
// strings both import, so the phone-as-controller page is provably wearing the
// SAME parts as the pad bar, not a copy.
//
// Class strings only: no state, no event bindings. Each surface passes its own
// held flag and handlers — the skin is dumb, the wiring stays local.

// #885 "glass" skin (Apple / Xbox Cloud reference): thin bright ring, faint
// fill with an inner top highlight, and a pressed state that sinks + brightens
// then fades back (the transition lives here so every chip fades the same).
export const GLASS = 'select-none backdrop-blur-md border border-white/10 shadow-[inset_0_1px_2px_rgba(255,255,255,0.35),0_4px_12px_rgba(0,0,0,0.45)] transition-all duration-150'

// Chip: the pressed language of the family — tinted fill, bright ring, sinks
// (scale-95) and brightens while held, fades back via GLASS. `shape` covers
// the shoulder chip (rounded-xl), the round face buttons (rounded-full) and
// the phone page's wider shoulders (rounded-2xl) — one law, any silhouette.
export const chipCls = (held, tintOn, tintOff, shape = 'rounded-xl') =>
    `${shape} px-2 flex items-center justify-center ring-1 ${GLASS} ${held ? `${tintOn} ring-white/90 scale-95 brightness-150` : `${tintOff} ring-white/50`}`

// The analog knob: bright core, thin ring, blur + double shadow — the glass
// law gone circular. Shared by every stick on both pages (5 call sites).
export const KNOB = 'rounded-full bg-white/25 ring-1 ring-white/70 backdrop-blur-md shadow-[inset_0_1px_2px_rgba(255,255,255,0.4),0_2px_8px_rgba(0,0,0,0.4)]'

// The stick well/travel ring: the bright circle a thumb travels inside
// (#885: a visible bright ring, not a ghost).
export const STICK_RING = 'rounded-full border-2 border-white/40 bg-white/5 shadow-[inset_0_0_14px_rgba(255,255,255,0.12)]'

// The POSITION carries the PlayStation glyph, so □/△/○/✕ prefixes in labels
// are stripped — what's left is what the button DOES in this game (#906 law).
export const verbOf = (label) => (label || '').replace(/^(?:[□△○✕×]|L1|L2|R1|R2)\s*/, '')
