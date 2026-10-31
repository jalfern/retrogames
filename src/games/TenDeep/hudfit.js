// hudfit — text-fit for the party strip (TEN-DEEP #1282).
//
// The foot of the screen is 24 logical px of mini panels; at 6px monospace the
// names are unreadable on a phone in portrait, and the left level tag and right
// class tag can collide. This is the discipline `utils/textFit.js` (#1099) applies
// to help pages — measure the content, never assume it fits — applied per panel.
//
// It is browser-free on purpose: a canvas 2D context is used when present
// (`ctx.measureText`), otherwise a conservative monospace advance estimate. The
// estimator keeps the fit logic provable in `tendeepcheck` (pure Node, no canvas)
// while the real ctx is authoritative in the browser.

// Conservative monospace advance for our HUD fonts: a bitmap mono glyph is ~0.6
// of its em wide; rounded up so we never size ON the edge and clip.
export const monoAdvance = 0.62
export const estWidth = (size, len) => Math.ceil(size * monoAdvance * len)

// Pick the largest size from `sizes` (descending) at which `text` fits `maxW`,
// then ellipsize with '…' until it truly fits at that size.
// Returns { size, text } — `text` is guaranteed ≤ maxW unless even the smallest
// size cannot hold one plus the ellipsis (then it is as short as possible).
export const fitSize = (text, maxW, sizes = [7, 6, 5], ctx = null) => {
    const width = (s, t) => (ctx && ctx.measureText
        ? ctx.measureText(t).width
        : estWidth(s, t.length))
    const list = [...sizes].sort((a, b) => b - a)
    let chosen = list[list.length - 1]
    for (const s of list) {
        if (width(s, text) <= maxW) { chosen = s; break }
        chosen = s
    }
    let out = text
    while (out.length > 1 && width(chosen, out) > maxW) out = out.slice(0, -1)
    if (width(chosen, out) > maxW && out.length > 1) {
        out = out.slice(0, -1) // last char still too wide: shrink once more
    }
    if (out !== text && out.length > 0) {
        // reserve room for the ellipsis; drop chars until "…"+body fits
        let body = text
        while (body.length > 1 && width(chosen, body + '…') > maxW) body = body.slice(0, -1)
        out = width(chosen, body + '…') <= maxW ? body + '…' : body
    }
    return { size: chosen, text: out }
}

// The party strip's two-column bottom row: a left level tag ("L12") and a right
// class tag ("MAGUS*"). `leftMax` and `rightMax` are each column's usable width;
// returns the shared largest size (so the two columns align) at which BOTH fit
// with no collision, ellipsizing whichever side is still too long.
export const fitTwoCols = (left, right, leftMax, rightMax, sizes = [7, 6, 5], ctx = null) => {
    const width = (s, t) => (ctx && ctx.measureText
        ? ctx.measureText(t).width
        : estWidth(s, t.length))
    const list = [...sizes].sort((a, b) => b - a)
    let size = list[list.length - 1]
    for (const s of list) {
        if (width(s, left) <= leftMax && width(s, right) <= rightMax) { size = s; break }
        size = s
    }
    return {
        size,
        left: fitSize(left, leftMax, [size], ctx).text,
        right: fitSize(right, rightMax, [size], ctx).text,
    }
}
