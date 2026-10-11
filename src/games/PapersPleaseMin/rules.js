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

// ---- calendar: tiny self-contained serials (y*372 + (m-1)*31 + d). Dates
// never cross the 31st, so the serial is an exact order for this game.
export const dnum = (dt) => dt.y * 372 + (dt.m - 1) * 31 + dt.d
export const dfmt = (dt) => `${dt.y}.${String(dt.m).padStart(2, '0')}.${String(dt.d).padStart(2, '0')}`
const MDAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
export const dadd = (dt, n) => {
    let { y, m, d } = dt
    d += n
    while (d > MDAYS[m - 1]) { d -= MDAYS[m - 1]; m += 1; if (m > 12) { m = 1; y += 1 } }
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
}

// the rulebook grows one line a day; day 7 is the full sheet.
export const DAY_RULES = [
    ['PASSPORT', 'ALLOWED'],
    ['PASSPORT', 'ALLOWED', 'EXPIRED'],
    ['PASSPORT', 'ALLOWED', 'EXPIRED', 'WEIGHT'],
    ['PASSPORT', 'ALLOWED', 'EXPIRED', 'WEIGHT', 'WANTED'],
    ['PASSPORT', 'ALLOWED', 'EXPIRED', 'WEIGHT', 'WANTED', 'IDMATCH'],
    ['PASSPORT', 'ALLOWED', 'EXPIRED', 'WEIGHT', 'WANTED', 'IDMATCH', 'IDREQ'],
    // day 7: the state tightens again — a passport must carry a full week
    // of validity. (Where that meets the expires-TODAY doctrine, the newer,
    // harsher law speaks; both booths — decide and judge — agree, and the
    // prover is the referee.)
    ['PASSPORT', 'ALLOWED', 'EXPIRED', 'WEIGHT', 'WANTED', 'IDMATCH', 'IDREQ', 'CURFEW'],
]
export const newRuleOfDay = (day) => (day >= 2 ? DAY_RULES[day - 1][DAY_RULES[day - 1].length - 1] : null)

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
    return { verdict: v.length ? 'deny' : 'approve', violations: v }
}
