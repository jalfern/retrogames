// IDLE — what the builder does when the board holds nothing to claim (#841,
// extended to the whole shelf by #1571).
//
// The old rule STOPped the studio on an empty queue. The new tail of the
// claim order (after claimOrder misses and after the QA-borrow step —
// FORGE.md step 2 keeps QA borrow first, and never here, since a live QA
// lane owns `feedback`) is two rungs: first Jon's flagship polish stage —
// one of his flagship games, oldest item in its README's honest-gaps list
// that no open QA issue already owns; then (#1571) the NEVER-DRY rung: the
// weakest game on the SHELF, judged by open QA feedback naming it plus the
// README honest gaps nobody owns. File the stage as its own issue, then
// claim it normally. STOP is legal only when the whole shelf is gap-free
// and unheld — and then the only question Jon ever sees is "which new
// flagship title?", at most once a week (lib/jonq.mjs caps it).
//
// Flagship order is Jon's (#841): SSX, Emberwood, COMET DRIFT HD, Myst.

export const FLAGSHIPS = ['SSX', 'Emberwood', 'COMET DRIFT HD', 'Myst']

export const FLAGSHIP_DIRS = {
    'SSX': 'SSX',
    'Emberwood': 'Emberwood',
    'COMET DRIFT HD': 'CometDriftHD',
    'Myst': 'Myst',
}

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()

// Parse a game README's "## Honest gaps" section into ordered gap strings.
// Top-level "- " bullets are gaps; indented continuation lines and sub-bullets
// belong to the gap they follow ("oldest" = first in README order).
// A bullet marked "**CLOSED by #<n>**" is shipped work, not a gap: keeping it
// re-kicks free lanes onto closed work (#961: Emberwood's portrait gap #0,
// closed by #959/#960, kept getting kicked because the marker was decorative).
export function parseGaps(md) {
    const out = []
    let inSection = false
    for (const line of String(md || '').split('\n')) {
        if (/^##\s+Honest gaps/i.test(line)) { inSection = true; continue }
        if (inSection && /^##\s/.test(line)) break
        if (!inSection) continue
        const bullet = line.match(/^\s*- (.+)/)
        if (bullet) {
            if (line.startsWith('- ')) out.push(bullet[1].trim())
            else if (out.length) out[out.length - 1] += ' ' + bullet[1].trim()
        } else if (/^\s+\S/.test(line) && out.length) {
            out[out.length - 1] += ' ' + line.trim()
        }
    }
    return out.filter((g) => !/CLOSED by #\d+/i.test(g))
}

// A gap is OWNED when an open QA issue already says it: the issue names its
// game (title or body) AND repeats the gap's opening words. When the match is
// ambiguous the builder treats the gap as owned — polish is QA's lane and this
// stage exists only for what QA has not reached (FORGE.md step 2).
export function ownsGap(qaIssues, game, gap, handleLen = 40) {
    const handle = norm(gap).slice(0, handleLen)
    if (!handle) return true
    const gameName = norm(game)
    return qaIssues.some((q) => {
        const text = `${q.title || ''} ${q.body || ''}`
        const n = norm(text)
        return n.includes(gameName) && n.includes(handle)
    })
}

// Flagship names held by open `building-qa` issues — QA is inside those games
// and the idle stage must never touch them. Derived live (#869: the warden
// needs the same skip the FORGE playbook promises, from the issue list).
export function heldGames(buildingQaIssues) {
    return FLAGSHIPS.filter((g) => buildingQaIssues.some(
        (q) => norm(`${q.title || ''} ${q.body || ''}`).includes(norm(g))))
}

// Pick the flagship polish stage. gapsByGame: { <FLAGSHIPS name>: string[] }
// (README order = oldest first). qaIssues: open issues on the QA lanes
// (feedback/building-qa) as {title, body}. buildingQa: flagship names the QA
// lane currently holds — never touch those games. Returns { game, gap, index }
// or null (every gap owned => STOP is finally legal).
export function flagshipStage({ gapsByGame = {}, qaIssues = [], buildingQa = [] } = {}) {
    const held = new Set(buildingQa.map(norm))
    for (const game of FLAGSHIPS) {
        if (held.has(norm(game))) continue
        const gaps = gapsByGame[game] || []
        for (let i = 0; i < gaps.length; i++) {
            if (!ownsGap(qaIssues, game, gaps[i])) return { game, gap: gaps[i], index: i }
        }
    }
    return null
}

// #878 — the unified queue for a free QA lane. Builder and QA used to pull from
// separate queues, so a lane idled whenever its own queue ran dry: on Oct 23 the
// Studio QA stream sat idle for hours with feedback empty while SSX's honest gaps
// were unowned (the builder's flagship path, #869 idle-kick, only fires when the
// whole builder is free, so a busy builder left the flagship gaps to nobody).
//
// qaIdleStage is the pure half of that fix: name the flagship polish stage a
// free QA lane may take when there is no claimable feedback, or null. The
// unified order is steer/next/queue/feedback first (the caller asks only on a
// feedback miss), then the flagship stage. One lane per game is kept: every game
// another lane is already inside — a `building` title (the builder's live game)
// or a `building-qa` title (any QA lane) — is skipped, so the builder and a QA
// lane can never be sent at the same flagship.
export function qaIdleStage({ issues = [], gapsByGame = {} } = {}) {
    const lbl = (i, l) => (i.labels || []).includes(l)
    const claimableFeedback = issues.some((i) => lbl(i, 'feedback')
        && !lbl(i, 'building-qa') && !lbl(i, 'waiting-jon') && !lbl(i, 'needs-approval'))
    if (claimableFeedback) return null
    const qaIssues = issues.filter((i) => lbl(i, 'feedback') || lbl(i, 'building-qa'))
    const held = heldGames(issues.filter((i) => lbl(i, 'building') || lbl(i, 'building-qa')))
    return flagshipStage({ gapsByGame, qaIssues, buildingQa: held })
}

// ---- the never-dry rung (#1571) ----------------------------------------
// Jon's standing rule (#1544/#1557): the lanes never run dry. When the
// ladder, the QA-borrow and the flagship stage all miss, pick the weakest
// game on the shelf and ship one real gameplay fix. Weakest is judged by
// what the board can honestly see: open QA feedback naming the game, plus
// README honest gaps no QA issue owns. Ties break toward the older title
// (registry order — first registered weakens first), and one lane per game
// still holds: any title a `building` or `building-qa` issue is inside is
// skipped, exactly like flagshipStage skips QA-held flagships.

// Parse the registry's raw text into shelf order: [{dir, label}]. The
// registry imports each game by directory and each route entry carries the
// player-facing label; matching component aliases back to dirs lets the
// score name games the way feedback issues name them ("COMET DRIFT HD",
// not src/games/CometDrift). Plain Node cannot import the registry (JSX),
// so this is the honest static read — same shape modelindexcheck uses.
export function parseRegistry(text) {
    const aliasToDir = new Map()
    const out = []
    const seen = new Set()
    for (const line of String(text || '').split('\n')) {
        const imp = line.match(/import\s+(?:\{[^}]*\}\s+from\s+)?'\.\.\/games\/([\w]+)'/)
        if (imp) {
            const alias = line.match(/import\s+(\w+)\s+from/)?.[1]
            if (alias) aliasToDir.set(alias, imp[1])
            if (!seen.has(imp[1])) { seen.add(imp[1]); out.push({ dir: imp[1], label: null }) }
            continue
        }
        const lazy = line.match(/const\s+(\w+)\s*=\s*lazy\(\(\)\s*=>\s*import\('\.\.\/games\/([\w]+)'\)/)
        if (lazy) {
            aliasToDir.set(lazy[1], lazy[2])
            if (!seen.has(lazy[2])) { seen.add(lazy[2]); out.push({ dir: lazy[2], label: null }) }
        }
    }
    // Route entries are multi-line objects; scan the whole text so a
    // `component: X,` on one line and its `label: '…'` several lines down
    // still pair up (line-based matching silently labeled nothing, #1571).
    for (const m of String(text || '').matchAll(/component:\s*(\w+)\s*,\s*(?:[\w:'\s\[\]{}.,-]*?\n\s*)?label:\s*'([^']+)'/g)) {
        const dir = aliasToDir.get(m[1])
        const hit = dir && out.find((g) => g.dir === dir)
        if (hit && hit.label == null) hit.label = m[2]
    }
    return out
}

// "CometDrift" reads as "comet drift" — feedback issues name games in words.
const dirWords = (dir) => norm(String(dir).replace(/([a-z0-9])([A-Z])/g, '$1 $2'))

// games: registry order [{dir, label}] with gaps attached by the caller:
//   { dir, label, gaps: string[] }  (README order = oldest first)
// qaIssues: open feedback/building-qa issues {title, body}.
// heldDirs: dirs another lane is inside (building / building-qa titles).
// Returns { game, dir, gap, index, score, weak: true } — gap/index point at
// the oldest UNOWNED README gap (gap null + index -1 when the game is only
// named by feedback and its gap list is empty), or null when nothing on the
// shelf is weak enough to matter (every score 0 — only then is STOP legal).
export function weakestStage({ games = [], qaIssues = [], heldDirs = [] } = {}) {
    const held = new Set(heldDirs.map(norm))
    let best = null
    for (const g of games) {
        if (held.has(norm(g.dir))) continue
        const name = g.label || dirWords(g.dir)
        if (/^demos?\b/i.test(name)) continue
        const gaps = (g.gaps || []).filter((x) => !ownsGap(qaIssues, name, x))
        const words = norm(name)
        const dwords = dirWords(g.dir)
        const named = qaIssues.filter((q) => {
            const n = norm(`${q.title || ''} ${q.body || ''}`)
            return (words.length > 2 && n.includes(words)) || (dwords.length > 3 && n.includes(dwords))
        }).length
        const score = gaps.length + named
        if (score > 0 && (!best || score > best.score)) {
            best = {
                game: name, dir: g.dir,
                gap: gaps[0] || null,
                index: gaps.length ? (g.gaps || []).indexOf(gaps[0]) : -1,
                score, weak: true,
            }
        }
    }
    return best
}

// Dirs held by open building/building-qa issues — same one-lane-per-game law
// heldGames() applies to the flagships, for the whole shelf.
export function heldDirs(games, issues) {
    return games.filter((g) => issues.some((q) => {
        const lbl = q.labels || []
        if (!lbl.includes('building') && !lbl.includes('building-qa')) return false
        const n = norm(`${q.title || ''} ${q.body || ''}`)
        return (g.label && n.includes(norm(g.label))) || n.includes(dirWords(g.dir)) || n.includes(norm(g.dir))
    })).map((g) => g.dir)
}
