// PAPERS, PLEASE-MIN — the rule engine. Two independent paths over one day:
//
//   decide(view)  what the BOOTH can know: reads ONLY fields the UI prints
//                 (papers, the wall calendar, the entry list, the wanted
//                 sheet, the scale) and carries a visible EVIDENCE string
//                 with every violation. The game never reads anything else.
//   judge(truth)  what a perfect inspector of the REAL person would say.
//
// The fairness prover in scripts/paperscheck.mjs grades the two against
// each other on every generated applicant: if they ever disagree, the
// generator printed a lie with no visible witness — an UNFAIR paper — and
// the suite goes red. `reads` on each rule is the promise decide keeps;
// the evidence string is the promise the booth keeps to the player.

// ---- calendar: serials over REAL month lengths. y*365 + prefix(MDAYS)[m-1]
// + d makes the serial exact days-since-epoch, so dnum and dadd are ONE clock:
// dnum(dadd(x, n)) - dnum(x) === n for every date this sim can build, seams
// included. Arstotzka here has no leap days — dadd never emits Feb 29 — so
// 365-day years and MDAYS agree for all constructible dates (paperscheck's
// CALENDAR section pins the identity law and the short-month CURFEW seam).
const MDAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const MPREFIX = MDAYS.reduce((a, k) => [...a, (a.at(-1) || 0) + k], [0]).slice(0, 12)
export const dnum = (dt) => dt.y * 365 + MPREFIX[dt.m - 1] + dt.d
export const dfmt = (dt) => `${dt.y}.${String(dt.m).padStart(2, '0')}.${String(dt.d).padStart(2, '0')}`
export const dadd = (dt, n) => {
    let { y, m, d } = dt
    d += n
    while (d > MDAYS[m - 1]) { d -= MDAYS[m - 1]; m += 1; if (m > 12) { m = 1; y += 1 } }
    // backward carry: the day-6 EXPIRED paper asks for yesterday, and NOV 01's
    // yesterday is OCT 31 — not NOV 00. (The frozen Oct 11 start never took
    // dadd below d=1; #1889's rolled week crossed the seam and shipped the
    // missing carry. paperscheck's CALENDAR section pins both directions.)
    while (d < 1) { m -= 1; if (m < 1) { m = 12; y -= 1 } d += MDAYS[m - 1] }
    return { y, m, d }
}
// adult = the printed DOB put them on earth 18 printed years before today.
// Both numbers are on the wall or in the hand — nothing hidden.
export const isAdult = (dob, today) => today.y - dob.y >= 18

// ---- the rulebook. `text` is what the wall prints when the rule wakes up.
export const RULES = {
    PASSPORT: { text: 'EVERY ENTRANT MUST PRESENT A PASSPORT.', reads: 'papers' },
    ALLOWED: { text: 'ENTRY ONLY FROM COUNTRIES ON THE ENTRY LIST.', reads: 'passport.country + wall list' },
    EXPIRED: { text: 'A PASSPORT EXPIRED BEFORE TODAY IS VOID. THROUGH TODAY IS VALID.', reads: 'passport.expiry + wall date' },
    WEIGHT: { text: 'PASSPORT WEIGHT MUST MATCH THE BOOTH SCALE.', reads: 'passport.weight + booth scale' },
    WANTED: { text: 'DENY ANYONE ON THE WANTED SHEET — NAME *AND* PASSPORT NO.', reads: 'passport.name + passport.no + wanted sheet' },
    IDMATCH: { text: 'IF AN ID CARD IS SHOWN, ITS NAME MUST MATCH THE PASSPORT.', reads: 'passport.name + id-card name' },
    IDREQ: { text: 'ADULTS MUST CARRY AN ID CARD. CHILDREN (BY DOB) ARE EXEMPT.', reads: 'papers + passport DOB + wall date' },
    CURFEW: { text: 'CURFEW: PASSPORTS EXPIRING SOONER THAN 7 DAYS FROM TODAY ARE VOID.', reads: 'passport.expiry + wall date' },
    // One printed line — the wall's fit law (layout.js) is the reason the
    // text stays short: day 7 is the deepest wall the booth is allowed.
    PORTRAIT: { text: 'THE PHOTO MUST MATCH THE FACE.', reads: 'passport.photo + entrant face' },
}

// the rulebook grows one line a day; day 7 is the full sheet. PORTRAIT
// (#1938) rides from day 1: the +1-per-day growth law leaves no free slot
// (day 6 wakes IDREQ, day 7 CURFEW), and unlike the paper laws the photo
// check needs no teaching — the two faces sit side by side on the wall.
const DAY_RULES_BASE = ['PASSPORT', 'ALLOWED', 'PORTRAIT']
export const DAY_RULES = [
    DAY_RULES_BASE,
    ['PASSPORT', 'ALLOWED', 'PORTRAIT', 'EXPIRED'],
    ['PASSPORT', 'ALLOWED', 'PORTRAIT', 'EXPIRED', 'WEIGHT'],
    ['PASSPORT', 'ALLOWED', 'PORTRAIT', 'EXPIRED', 'WEIGHT', 'WANTED'],
    ['PASSPORT', 'ALLOWED', 'PORTRAIT', 'EXPIRED', 'WEIGHT', 'WANTED', 'IDMATCH'],
    ['PASSPORT', 'ALLOWED', 'PORTRAIT', 'EXPIRED', 'WEIGHT', 'WANTED', 'IDMATCH', 'IDREQ'],
    // day 7: the state tightens again — a passport must carry a full week
    // of validity. (Where that meets the expires-TODAY doctrine, the newer,
    // harsher law speaks; both booths — decide and judge — agree, and the
    // prover is the referee.)
    ['PASSPORT', 'ALLOWED', 'PORTRAIT', 'EXPIRED', 'WEIGHT', 'WANTED', 'IDMATCH', 'IDREQ', 'CURFEW'],
]
export const newRuleOfDay = (day) => (day >= 2 ? DAY_RULES[day - 1][DAY_RULES[day - 1].length - 1] : null)

// ---- PORTRAIT: the face on the paper vs the face at the counter.
// Compared FEATURES are structural — cut, shape, glasses, facial hair,
// brows, mouth (#1972: the original's eye roams a whole face, so the
// set grew from four to six). Colors (skin, hair color, shirt) are NEVER
// evidence: time fades hair, heat changes clothes; a photo taken years
// ago is not a forgery. The descriptor fields are exactly what the booth
// PAINTS (index.jsx renders both portraits from these), so every diff
// decide names is pixels on the canvas — the papersplay gates sample them.
export const FEATURES = ['style', 'narrow', 'glasses', 'must', 'brow', 'mouth']
export const STYLE_NAMES = ['CAP', 'THIN', 'SIDE-LEFT', 'SIDE-RIGHT']
export function portraitDiffs(face, photo) {
    const ev = []
    if (!face || !photo) return ev
    if (face.style !== photo.style) ev.push(`PHOTO HAIR ${STYLE_NAMES[photo.style]} vs ENTRANT ${STYLE_NAMES[face.style]}`)
    if (face.narrow !== photo.narrow) ev.push(`PHOTO FACE ${photo.narrow ? 'NARROW' : 'WIDE'} vs ENTRANT ${face.narrow ? 'WIDE' : 'NARROW'}`)
    if (face.glasses !== photo.glasses) ev.push(photo.glasses ? 'PHOTO WEARS GLASSES, ENTRANT DOES NOT' : 'ENTRANT WEARS GLASSES, PHOTO DOES NOT')
    if (face.must !== photo.must) ev.push(photo.must ? 'PHOTO HAS FACIAL HAIR, ENTRANT HAS NONE' : 'ENTRANT HAS FACIAL HAIR, PHOTO HAS NONE')
    if (face.brow !== photo.brow) ev.push(photo.brow ? 'PHOTO BROWS THICK, ENTRANT THIN' : 'ENTRANT BROWS THICK, PHOTO THIN')
    if (face.mouth !== photo.mouth) ev.push(photo.mouth ? 'PHOTO MOUTH OPEN, ENTRANT SHUT' : 'ENTRANT MOUTH OPEN, PHOTO SHUT')
    return ev
}

// ---- decide: the booth's eye. `view` is exactly what the canvas paints.
// Returns {verdict, violations:[{rule, evidence}]}. Every evidence string
// is assembled from the view — a human reading the booth could repeat it.
export function decide(view) {
    const v = []
    const p = view.person
    const pp = p.passport
    const has = (r) => view.rules.includes(r)
    if (has('PASSPORT') && p.papers.indexOf('passport') < 0) {
        v.push({ rule: 'PASSPORT', evidence: 'NO PASSPORT PRESENTED' })
        return { verdict: 'deny', violations: v }
    }
    if (has('ALLOWED') && view.allowed.indexOf(pp.country) < 0) {
        v.push({ rule: 'ALLOWED', evidence: `${pp.country} IS NOT ON THE ENTRY LIST` })
    }
    if (has('EXPIRED') && dnum(pp.expiry) < view.dateNum) {
        v.push({ rule: 'EXPIRED', evidence: `EXPIRED ${dfmt(pp.expiry)} < TODAY ${dfmt(view.date)}` })
    }
    // no witness, no ruling: if the scale is not on the wall, the booth
    // has no visible proof and MUST NOT deny. (Gen guarantees the witness
    // on every WEIGHT day; paperscheck proves the guarantee is kept.)
    if (has('WEIGHT') && typeof view.scale === 'number' && view.scale !== pp.weight) {
        v.push({ rule: 'WEIGHT', evidence: `SCALE ${view.scale}KG vs PASSPORT ${pp.weight}KG` })
    }
    if (has('WANTED')) {
        const hit = view.wanted.find((w) => w.name === pp.name && w.id === pp.id)
        if (hit) v.push({ rule: 'WANTED', evidence: `WANTED: ${hit.name} #${hit.id}` })
    }
    if (has('IDMATCH') && p.idcard && p.idcard.name !== pp.name) {
        v.push({ rule: 'IDMATCH', evidence: `ID "${p.idcard.name}" vs PASSPORT "${pp.name}"` })
    }
    if (has('IDREQ') && p.papers.indexOf('idcard') < 0 && isAdult(pp.dob, view.date)) {
        v.push({ rule: 'IDREQ', evidence: `ADULT (DOB ${dfmt(pp.dob)}) WITHOUT ID CARD` })
    }
    if (has('CURFEW') && dnum(pp.expiry) - view.dateNum <= 6) {
        v.push({ rule: 'CURFEW', evidence: `EXPIRES ${dfmt(pp.expiry)} — CURFEW WANTS 7 DAYS OF GRACE` })
    }
    if (has('PORTRAIT') && p.passport) {
        const diffs = portraitDiffs(p.face, p.passport.photo)
        if (diffs.length) v.push({ rule: 'PORTRAIT', evidence: diffs.join('; ') })
    }
    return { verdict: v.length ? 'deny' : 'approve', violations: v }
}

// ---- judge: the truth path, independent of the booth. `truth` is what the
// generator KNOWS but the canvas may not: the real weight, whether the
// person is truly the one on the sheet. It applies the SAME day's rules —
// no one is guilty of a law that has not woken up yet.
export function judge(day) {
    const v = []
    const t = day.truth
    const p = day.person
    const has = (r) => day.rules.includes(r)
    if (has('PASSPORT') && !t.hasPassport) v.push({ rule: 'PASSPORT' })
    if (has('ALLOWED') && !day.allowed.includes(t.country)) v.push({ rule: 'ALLOWED' })
    if (has('EXPIRED') && dnum(t.expiry) < dnum(day.date)) v.push({ rule: 'EXPIRED' })
    // the lie lives ON THE PAPER: the passport says a weight the person
    // does not carry. The scale is the booth's WITNESS, not the verdict —
    // judge never looks at it (that is why a scale-free booth on a WEIGHT
    // day is proven unfair, not merely inconvenient).
    if (has('WEIGHT') && p.passport && p.passport.weight !== t.trueWeight) v.push({ rule: 'WEIGHT' })
    if (has('WANTED') && t.wanted) v.push({ rule: 'WANTED' })
    if (has('IDMATCH') && p.idcard && t.idName !== t.trueName) v.push({ rule: 'IDMATCH' })
    if (has('IDREQ') && !t.hasIdCard && isAdult(t.dob, day.date)) v.push({ rule: 'IDREQ' })
    if (has('CURFEW') && dnum(t.expiry) - dnum(day.date) <= 6) v.push({ rule: 'CURFEW' })
    // the truth of a forged photo is the generator's, not the booth's: the
    // booth must catch it through the printed descriptors (portraitDiffs),
    // and the prover grades the two paths as usual.
    if (has('PORTRAIT') && t.photoMismatch) v.push({ rule: 'PORTRAIT' })
    return { verdict: v.length ? 'deny' : 'approve', violations: v }
}
