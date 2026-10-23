// IDLE — what the builder does when the board holds nothing to claim (#841).
//
// The old rule STOPped the studio on an empty queue. The new tail of the
// claim order (after claimOrder misses and after the QA-borrow step —
// FORGE.md step 2 keeps QA borrow first, and never here, since a live QA
// lane owns `feedback`): pick one of Jon's flagship games and take the
// oldest item in its README's honest-gaps list that no open QA issue
// already owns; file that stage as its own issue, then claim it normally.
// Only when EVERY flagship gap is owned is STOP legal.
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
    return out
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
