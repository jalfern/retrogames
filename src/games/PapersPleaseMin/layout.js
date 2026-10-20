// PAPERS, PLEASE-MIN — booth geometry, in one place so the paint and the
// Node gate (#410) agree on where the wall ends. Every text row the booth
// draws is predicted here; paperscheck proves they fit, that the SCALE box
// never buries the wanted sheet, and that the passport card never covers
// the entrant's face or the ENTRANT label.

export const CW = 680, CHS = 440
export const STRIP_H = 40

export const WALL = {
    x: 12, top: 44, labelLine: 14,
    ruleWrap: 34, ruleSize: 11, ruleLine: 12, ruleGap: 4,
    listSize: 10, listLine: 12,
    wantedSize: 9, wantedLine: 10,
    size: 11,
}
// char advance of `${n}px monospace` in Chrome — 0.6em; gates use it to
// prove a line cannot run into the entrant column.
export const CHAR = 0.6

export const SCALE = { x: 12, y: 358, w: 96, h: 30 }
export const PORTRAIT = { x: 262, y: 26, headCx: 55, headRx: 34, bodyBottom: 122 }
export const PAPERS = { x: 356, y: 40, w: 300, h: 148 }
export const ID = { x: 356, y: 200, w: 190, h: 64 }
export const STAMP = { x: 506, y: 110 }

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
