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
    // #1943 RELIEF: ruleGap 4 -> 3 frees 9px (nine rules on day 7), which
    // pays for the wanted rows to grow for the first time since the fit law
    // (size 9 -> 10, line 10 -> 11). Worst buildable day now lands y=352,
    // 6px of slack instead of 2 — the sheet reads bigger, not just brighter.
    x: 12, top: 38, labelLine: 14,
    ruleWrap: 34, ruleSize: 11, ruleLine: 12, ruleGap: 3,
    listSize: 10, listLine: 12,
    wantedSize: 10, wantedLine: 11,
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
// #1943 PORTRAIT LEGIBILITY: the clip law admits s up to ~0.97 (widest head
// inside the frame + centered head), so the zoom goes to s 0.90 (ox -16,
// oy -2): the head runs ~61px — the original's photo fills its frame the
// same way — and the chin crops at the bottom edge like a real ID photo.
// paperscheck pins s >= 0.85 and head width s*68 >= 54 so it cannot regress.
export const PHOTO = { x: 232, y: 24, w: 66, h: 76, s: 0.9, ox: -16, oy: -2 }
// #2072 HOLD TO INSPECT — the original lets the inspector lift a document
// and lean in. Press-and-hold the photo (passport on the counter) and the
// print grows to a larger crop while held; release lifts it back. Booth-side
// paint only: the PORTRAIT evidence (drawFace at the counter, portraitPix)
// never sees this scale, so the zoom cannot fake or hide a match. paperscheck
// pins s strictly above PHOTO.s (a zoom that doesn't zoom is a lie) and the
// hold at a comfortable 1/6-2/3 s.
export const PHOTO_ZOOM = { s: 1.12, hold: 11 }

// #1982 THE RECOGNITION CUE — a returning neighbor gets the door its own
// voice: two ascending triangle notes (welcome-up) as they step up to the
// glass. The pair must be distinct from every tone the booth already owns
// (stamps 300/190, deny 760 / approve 560, payday 880+1175, month chime
// 988, brow tick 1050, clock tick 1150) — paperscheck pins the arithmetic
// disjointness, papersplay counts the arrivals. Decor: the sim never sees
// it, so determinism and every replay pin stand untouched.
export const RECOGNITION = { notes: [523, 784], dur: [0.07, 0.10], gain: 0.05, wave: 'triangle' }
// #1976 THE PRINT AGES — the original's passport photos are old prints: the
// whole print (face AND its background) sits desaturated and yellowed while
// the entrant at the counter is live color. A warm amber wash over the photo
// print, inside the frame line, is the cheap honest look: it rides entirely
// free of the PORTRAIT rule (drawFace descriptors never change — the tint is
// booth-side paint, the same doctrine as the settle drop). paperscheck pins
// the wash's warmth (r > g > b) and papersplay counts its pixels in the frame.
export const PHOTO_TINT = 'rgba(146,102,28,0.30)'
export const ID = { x: 356, y: 200, w: 190, h: 64 }
// #1983 THE ARC — the returning entrant's speech bubble. It rides the lane
// under the face column: below the stamp's witness line (baseline y=296,
// centered x=506 — the texts are vertically and horizontally disjoint),
// left of the deduction slip (x=452), above the strip. Longest authored
// line is 20 chars at 10px monospace (20*10*CHAR=120 <= w-14); the ARC
// section of paperscheck pins both fit laws so no future line overflows.
export const BUBBLE = { x: 258, y: 302, w: 190, h: 34 }
export const STAMP = { x: 506, y: 110 }
// #1891 THE EVIDENCE LINE — the booth quotes the clause behind a deny in the
// controls strip, where the strip's own layout leaves a clean corridor: the
// left control text ends by x≈254 (31 chars at 13px from x=12), the right
// CORRECT/MISTAKE note starts by x≈613, and the strip floor is y=440. The
// zone below stays clear of the strike boxes (x<90), the score/CR line
// (x 100..230) and — because the strip begins at y=400 — of the speech
// bubble (bottom ≤349) and the deduction slip (bottom ≤392). The evidence
// wraps at wrap chars so 54*9px*CHAR = 291px centered on cx spans
// 268..560. paperscheck re-pins all of these numbers.
export const EVID = { cx: 414, y: 414, line: 12, size: 9, wrap: 54 }
// #1891 PAPER WEIGHT — documents do not teleport onto the counter: a new
// applicant's papers drop in and settle (dy over ticks, 0 when at rest).
// Shell-only decor: the sim never sees it, so determinism and every replay
// pin stand untouched.
export const SETTLE = {
    ticks: 12,
    dy: (t) => (t <= 0 ? 0 : t >= 10 ? -10 : t >= 7 ? -5 : t >= 4 ? -2 : 0),
}
// #2021 THE INSPECTOR STAYS — the original keeps the violation inspector on
// screen; here the case rides PINNED after the stamp's ink fades: the judged
// document keeps the counter while the citation stays readable, and only when
// the read window closes does the document get taken up and the next papers
// drop (SETTLE). 132 ticks ≈ 2.2 s at 60 Hz — long enough to take in a
// witness line plus three evidence clauses. Never a lock: a fresh ruling
// (act) cuts the pin short at any time, and the drop landing ends it.
export const QUOTE = { hold: 132 }
// #1966 THE PAY ECONOMY — the end-of-day deduction slip, pinned under the
// ID card: below the stamp's witness line (y=296 baseline), above the strip,
// clear of the right margin. paperscheck's WALL section re-pins all three.
// #1968 PHONE LEGIBILITY: the five-row stack (PAY/RENT/SOUP/HEAT/BALANCE)
// grows to 11px rows on a 13px pitch — at a 390px phone the canvas scales to
// ~0.57, which put the old 10px/12 rows near 6px. The stack still ends inside
// the paper: worst baseline y=row0+4*pitch=388, ink bottom 391 <= 392.
export const SLIP = { x: 452, y: 304, w: 202, h: 88, head: 13, dash: 18, row0: 32, pitch: 13, size: 11 }
// #1968 RENT AHEAD — the night's biggest bill printed on the wall while the
// booth can still act on it (the original shows the schedule in the apartment;
// we have no apartment). Hangs in the corridor under the SCALE box: baseline
// below SCALE's bottom (388) and above the strip (400), where nothing else
// paints. paperscheck pins the corridor and the width.
export const RENT = { x: 12, y: 397, size: 8 }
// #1968 THE WAGE FLICKER — per-stamp pay feedback: +5 rises off the CR
// readout when a correct stamp earns it. The band rides inside the controls
// strip (y >= 400), right of any CR text (CR's longest ~"CR 350" ends by
// x≈228) and left of the CORRECT/MISTAKE note (x >= ~613).
export const PAYFX = { ticks: 45, rise: 12, x: 234, base: CHS - 19 }

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
