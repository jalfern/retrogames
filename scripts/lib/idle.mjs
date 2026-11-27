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
// Flagship order is Jon's (#841, extended by his answered dry-shelf question
// #2795 of 2026-11-20 — "both flagships starting with double dragon"):
// SSX, Emberwood, COMET DRIFT HD, Myst, DOUBLE DRAGON, R-TYPE.

export const FLAGSHIPS = ['SSX', 'Emberwood', 'COMET DRIFT HD', 'Myst', 'DOUBLE DRAGON', 'R-TYPE']

export const FLAGSHIP_DIRS = {
    'SSX': 'SSX',
    'Emberwood': 'Emberwood',
    'COMET DRIFT HD': 'CometDriftHD',
    'Myst': 'Myst',
    'DOUBLE DRAGON': 'DoubleDragon',
    'R-TYPE': 'RType',
}

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()

// Parse a game README's "## Honest gaps" section into ordered gap strings.
// Top-level "- " bullets are gaps; indented continuation lines and sub-bullets
// belong to the gap they follow ("oldest" = first in README order).
// A bullet marked "**CLOSED by #<n>**" is shipped work, not a gap: keeping it
// re-kicks free lanes onto closed work (#961: Emberwood's portrait gap #0,
// closed by #959/#960, kept getting kicked because the marker was decorative).
// A bullet marked "**BLOCKED**" is the mirror case: fidelity-blocked work —
// behaviour whose spec is the original, where the original material that would
// define it is not in the repo and FORGE.md's network boundary ("GitHub, npm,
// and docs you already use") says don't guess. It stays honest prose but must
// not score for weakestStage: a gap no lane may build is not weakness.
// Without this, every free session re-runs the same "is this gap actually
// buildable?" investigation before it can decline the kick (this session's
// #1571 kick named BOULDER DASH gap 0 — the amoeba reactivity law the slot-a
// lane had already ruled original-blocked on 2026-11-16, in its own STATE).
// Unlike CLOSED, BLOCKED names no PR — it owns nothing, it only declines.
// A bullet marked "**DISCLAIMER**" is the third class: a documented judgement
// call — a solver disclaimer (why FORGE's slack rule cannot apply), a decided
// state (a jonq answer or audit closed the question), or a non-feature by Jon's
// own rule. The prose stays in the README (it is still honest reporting), but a
// behaviour the maintainers chose on purpose is not weakness and must not score
// (#2488: GardenGuard's "No puzzle-slack solver" + auto-bank prose kept
// topping the ladder at 2 while the whole shelf waited for real work).
// Only the bold marker declines — the bare word must not, same law as BLOCKED.
// A `### Restored in …` subsection inside Honest gaps is shipped history, not
// an open gap: an h3 heading ends the section (h3 is nested in the h2, so the
// old h2-only stop ran straight through the restored bullets), and a bullet
// reading "Restored in the #N pass" is the same class as CLOSED by #N.
// Evidence (#3553, 2026-11-26): ADVENTURE scored 13 on never-dry where the
// honest count was 1 — nine of thirteen came from Restored subsections or the
// variant-selector line whose own SELECT GAME text names its shipping pass.
export function parseGaps(md) {
    const out = []
    let inSection = false
    for (const line of String(md || '').split('\n')) {
        if (/^##\s+Honest gaps/i.test(line)) { inSection = true; continue }
        if (inSection && /^##+\s/.test(line)) break
        if (!inSection) continue
        const bullet = line.match(/^\s*- (.+)/)
        if (bullet) {
            if (line.startsWith('- ')) out.push(bullet[1].trim())
            else if (out.length) out[out.length - 1] += ' ' + bullet[1].trim()
        } else if (/^\s+\S/.test(line) && out.length) {
            out[out.length - 1] += ' ' + line.trim()
        }
    }
    // #3672: strikethrough is the repo's dominant closed-gap notation —
    // `~~gap~~ #NNNN: what shipped instead` in ≥10 READMEs. Evidence
    // (2026-11-26): idle-kick scored CENTIPEDE 5 with three struck-through
    // bullets (#3620/#3631/#3632) and Pac-Man gap 0 the same shape; a
    // free lane had to recompute by hand to dodge it (#3661's note). A
    // top-level bullet that STARTS with ~~ is shipped work, not a gap;
    // a mid-bullet ~~ must not close the rest (the strikethroughs stay in
    // the README as history — the parser declines, the prose remains).
    return out.filter((g) => !/CLOSED by #\d+/i.test(g) && !/\*\*BLOCKED\*\*/.test(g) && !/\*\*DISCLAIMER\*\*/.test(g)
        && !/Restored (in|by)( the)? #\d+/i.test(g)
        && !/^~~/.test(g.trim()))
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
        // #2571: title-only — QA/POLISH issue TITLES always name their game,
        // while bodies are exactly where why-weakest derivations verbatim-name
        // the SKIPPED candidates ("SSX/Emberwood/COMET/Myst gap-free"). Body
        // matching phantom-held every quoted title out of idle-kick.
        (q) => norm(q.title || '').includes(norm(g))))
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
    // #3093: `lane:manual` feedback belongs to a hand-run lane (docs/MANUAL-LANE.md) —
    // not claimable QA work, and it must not count as feedback that keeps the QA
    // lanes off flagship stages either.
    const claimableFeedback = issues.some((i) => lbl(i, 'feedback')
        && !lbl(i, 'building-qa') && !lbl(i, 'waiting-jon') && !lbl(i, 'needs-approval') && !lbl(i, 'lane:manual'))
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
        // #3479: the alias slot needs `\w+` — every *default* import
        // (`import DefenderGame from '../games/Defender'`) failed the old
        // optional-braces group, silently dropping 21 statically-imported
        // titles off the never-dry shelf (phantom idle-kick, 2026-11-26).
        const imp = line.match(/import\s+(?:\{[^}]*\}|\w+)\s+from\s+'\.\.\/games\/([\w]+)'/)
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
// qaIssues: open feedback/building-qa issues {title, body, labels}.
//   `waiting-jon` issues still OWN gaps (suppression, safe direction) but do
//   not NAMED-count toward weakness (#3074 — see the law in the loop).
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
        // #3074: a `waiting-jon` feedback names weakness no lane may act on.
        // The library's own law — BLOCKED gaps ("a gap no lane may build is
        // not weakness") and #2488's DISCLAIMER rule — declines unactionable
        // README bullets; the named count must honour the same law or a frozen
        // QA item keeps its title weakest forever. Evidence: Nov 23, idle-kick
        // answered `KICK CONTRA -1 weak` on a shelf with zero unowned gaps,
        // the score produced entirely by #2971 (feedback + waiting-jon) —
        // both builder slots re-kick at CONTRA every tick until Jon's phone
        // lands, and three same-source overrides (#3064/#3066/#3067) were all
        // this phantom rung. NOTE the asymmetry: ownership STAYS label-blind
        // (above) — a waiting-jon issue still suppresses the gaps it owns, so
        // this filter can never turn a suppressed gap into a fresh kick.
        const named = qaIssues.filter((q) => {
            if ((q.labels || []).includes('waiting-jon')) return false
            // #3093: same law — a fix owned by a hand-run lane (`lane:manual`)
            // is weakness no automatic lane may act on.
            if ((q.labels || []).includes('lane:manual')) return false
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
        // #2571: title-only, same law as heldGames — bodies quote ladders.
        const n = norm(q.title || '')
        return (g.label && n.includes(norm(g.label))) || n.includes(dirWords(g.dir)) || n.includes(norm(g.dir))
    })).map((g) => g.dir)
}

// ---- per-slot never-dry eligibility (#1615) --------------------------
// The #869 idle-kick predates the second builder slot: the warden asked it
// under `ALIVE == no` (slot a's pgrep) and kickstarted com.jalfern.forge
// only, so on Nov 5 the pulse sat at builders=0/2 queue=0 with slot b free
// and never aimed at a stage. #1615: EVERY free builder slot earns the
// never-dry kick when its ladder came up empty, throttled to one such kick
// per slot per 30 minutes so a slot that keeps finding nothing worth doing
// cannot loop, and a halt still freezes the whole thing.
// slots: [{ id, free, loaded, target, lastKick }] —
//   free    no session of this slot is running (and no QA item in its slot)
//   loaded  its launchd job is installed (slot b's trial can be reverted)
//   target  step 4 handed this slot real work THIS tick — step 4 owns it
//   lastKick epoch seconds of this slot's last never-dry kick, null = never
// Returns the eligible slots in slot order; "queue has a stage" stays
// idle-kick.mjs's answer — this only says who may be asked to hear it.
export function neverDrySlots({ halted = false, slots = [], now = 0, throttleSec = 1800 } = {}) {
    if (halted) return []
    return slots.filter((s) => s && s.free === true
        && s.loaded !== false
        && !s.target
        && (s.lastKick == null || now - s.lastKick >= throttleSec))
}
