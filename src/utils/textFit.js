// textFit — shared text-fit mechanism (#1099).
//
// Help/title/pause content must never be clipped by a short viewport or buried
// under the pad / chrome / credits badge. The mechanism is one packing rule:
// measure the content as a list of blocks, and pack them into pages that fit
// the available box (desktop usually fits in one page). PauseOverlay uses this
// for every game; games with custom overlays and demos' captions reuse it too.

// heights -> array of page index-groups. A block taller than `avail` claims a
// page to itself (never dropped, never overlapping the next block).
export const packPages = (heights, avail, gap = 0) => {
    const groups = []
    let cur = []
    let used = 0
    for (let i = 0; i < heights.length; i++) {
        const h = heights[i]
        if (cur.length && used + gap + h > avail) {
            groups.push(cur)
            cur = []
            used = 0
        }
        cur.push(i)
        used += (cur.length > 1 ? gap : 0) + h
    }
    if (cur.length) groups.push(cur)
    return groups
}

// True when an element's box lies fully inside the viewport (within pad px).
export const viewportFits = (el, pad = 4, vw, vh) => {
    const r = el.getBoundingClientRect()
    const w = vw ?? window.innerWidth
    const h = vh ?? window.innerHeight
    return r.top >= pad - 0.5 && r.left >= pad - 0.5 &&
        r.bottom <= h - pad + 0.5 && r.right <= w - pad + 0.5
}

export const rectsOverlap = (a, b) =>
    a.left < b.right - 1 && b.left < a.right - 1 &&
    a.top < b.bottom - 1 && b.top < a.bottom - 1
