// PAPERS, PLEASE-MIN — booth geometry, in one place so the paint and the
// Node gate (#410) agree on where the wall ends. Every text row the booth
// draws is predicted here; paperscheck proves they fit, that the SCALE box
// never buries the wanted sheet, and that the passport card never covers
// the entrant's face or the ENTRANT label.

export const CW = 680, CHS = 440
export const STRIP_H = 40

export const WALL = {
    // top 44 -> 38: PORTRAIT (#1938) rides the sheet from day 1, so day 7
    // prints nine laws. The lifted rim keeps the deepest wall's wanted sheet
    // above the SCALE box (wantedEnd 356 <= SCALE.y 358) — paperscheck's
    // fit sweep proved the old rim buries it at y=364 with nine rules.
    x: 12, top: 38, labelLine: 14,
    ruleWrap: 34, ruleSize: 11, ruleLine: 12, ruleGap: 4,
    listSize: 10, listLine: 12,
    wantedSize: 9, wantedLine: 10,
    size: 11,
}
// char advance of `${n}px monospace` in Chrome — 0.6em; gates use it to
// prove a line cannot run into the entrant column.
export const CHAR = 0.6

export const SCALE = { x: 12, y: 358, w: 96, h: 30 }
// #1960 THE SHIFT CLOCK — wall clock on the ruled grid between the date
// line and the portrait column. The canvas's top-right corner looks free
// but is NOT: the app's PAUSE / volume / WATCH buttons are HTML overlays
// that sit exactly there (shots proved it) — so the clock hangs where the
// original hangs its instruments, in the booth's own reach, and paperscheck
// pins clearance from the DAY line, the rules text and the portrait column.
export const CLOCK = { x: 215, y: 17, r: 15 }
export const PORTRAIT = { x: 262, y: 26, headCx: 55, headRx: 34, bodyBottom: 122 }
export const PAPERS = { x: 356, y: 40, w: 300, h: 148 }
// the passport photo (#1938): passport-relative box for the mini face draw
// (drawFace at scale s). Shares PAPERS' right margin: 356+232+66=654 <= CW-4.
// #1972 PORTRAIT-DETAIL: s 0.6 -> 0.75 with a zoom-crop — ox centers the
// 82px-wide draw in the 66px frame (the clip in drawPassport trims the
// shoulders), oy lifts the hair to the frame top; the head reads ~50px.
export const PHOTO = { x: 232, y: 24, w: 66, h: 76, s: 0.75, ox: -8, oy: -3 }
export const ID = { x: 356, y: 200, w: 190, h: 64 }
// #1983 THE ARC — the returning entrant's speech bubble. It rides the lane
// under the face column: below the stamp's witness line (baseline y=296,
// centered x=506 — the texts are vertically and horizontally disjoint),
// left of the deduction slip (x=452), above the strip. Longest authored
// line is 20 chars at 10px monospace (20*10*CHAR=120 <= w-14); the ARC
// section of paperscheck pins both fit laws so no future line overflows.
export const BUBBLE = { x: 258, y: 302, w: 190, h: 34 }
export const STAMP = { x: 506, y: 110 }
// #1966 THE PAY ECONOMY — the end-of-day deduction slip, pinned under the
// ID card: below the stamp's witness line (y=296 baseline), above the strip,
// clear of the right margin. paperscheck's WALL section re-pins all three.
export const SLIP = { x: 452, y: 304, w: 202, h: 88 }

export const ruleLines = (text) => {
    const words = text.split(' ')
    let n = 1, line = ''
    for (const w of words) {
        if ((line + w).length > WALL.ruleWrap) { n++; line = '' }
        line += w + ' '
    }
    return n
}

// baselines exactly as paint() walks them; returns the bottom-most text
// row of each wall block so the gate can reason about the column.
export function wallRows(day, ruleTexts) {
    let yy = WALL.top + WALL.labelLine
    for (const t of ruleTexts) yy += ruleLines(t) * WALL.ruleLine + WALL.ruleGap
    const rulesEnd = yy - WALL.ruleGap + WALL.ruleLine
    const listsY = yy + 2
    yy += WALL.labelLine
    const entriesEnd = yy + day.allowed.length * WALL.listLine
    const wantedEnd = yy + day.wanted.length * WALL.wantedLine
    return { rulesEnd, listsY, entries: yy, entriesEnd, wantedEnd, bottom: Math.max(entriesEnd, wantedEnd) }
}

export function wallFit(day, ruleTexts) {
    const r = wallRows(day, ruleTexts)
    const stripTop = CHS - STRIP_H
    const maxRuleW = WALL.ruleWrap * WALL.ruleSize * CHAR
    const labelW = 'ENTRANT 8/8'.length * 10 * CHAR
    return {
        ...r,
        rulesClearScale: r.rulesEnd <= SCALE.y,
        listsClearScale: r.bottom <= SCALE.y,
        listsFit: r.bottom <= stripTop - 6,
        rulesClearEntrant: WALL.x + 2 + maxRuleW <= PORTRAIT.x - 4,
        cardClearsFace: PAPERS.x >= PORTRAIT.x + PORTRAIT.headCx + PORTRAIT.headRx + 2,
        cardClearsLabel: PAPERS.x >= PORTRAIT.x + PORTRAIT.headCx + labelW / 2 + 2,
        scaleClearsStrip: SCALE.y + SCALE.h <= stripTop,
        fits: r.rulesEnd <= stripTop - 6,
    }
}
