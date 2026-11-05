// IDLE-KICK — the warden's empty-queue question (#869, shelf-wide since #1571):
// kick the builder now?
//
// #841 put "never idle" inside the FORGE session, but a session only starts
// when the warden kicks: with an empty TARGET nothing ever kicked and the
// builder sat idle 02:28–08:00 on Oct 23. The warden asks this script and it
// answers one line — `KICK <GAME> <gapIndex>` when flagshipStage() finds
// unowned honest gaps, `KICK <GAME> <gapIndex> weak` when the flagship stage
// is spent but the NEVER-DRY rung (#1571) finds a weak game on the whole
// shelf, and `NONE` only when every gap on every unheld title is owned —
// then STOP is legal and nobody is kicked.
// The warden kicks only on KICK. With `qa` as argv[2] it answers for a free QA
// lane instead (#878): the unowned flagship gap it may take when feedback is dry.
//
// It fetches the issues itself (gh api): warden.sh forbids stdin, and passing
// 100 issue bodies as one argument rides the ARG_MAX line. READMEs come from
// the checkout, which the warden has just fetched to origin/main.
// Any failure answers NONE — a broken helper must never fabricate a kick.

import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { FLAGSHIPS, FLAGSHIP_DIRS, parseGaps, flagshipStage, heldGames, qaIdleStage, parseRegistry, weakestStage, heldDirs } from './lib/idle.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

let issues = []
try {
    const raw = execFileSync('gh', [
        'api', 'repos/jalfern/retrogames/issues?state=open&per_page=100',
        '--jq', '[.[] | select(.pull_request | not) | {title, body, labels: [.labels[].name]}]',
    ], { encoding: 'utf8' })
    issues = JSON.parse(raw)
} catch {
    issues = []
}

const qaIssues = issues.filter((i) => i.labels.includes('feedback') || i.labels.includes('building-qa'))
const buildingQa = heldGames(issues.filter((i) => i.labels.includes('building-qa')))
const gapsByGame = Object.fromEntries(FLAGSHIPS.map((g) => {
    let md = ''
    try { md = readFileSync(join(ROOT, 'src/games', FLAGSHIP_DIRS[g], 'README.md'), 'utf8') } catch { md = '' }
    return [g, parseGaps(md)]
}))

// #1571 never-dry backing: when the flagship stage is spent, score the whole
// shelf from the registry (README gaps per title; missing README = no gaps).
const shelf = parseRegistry(readFileSync(join(ROOT, 'src/config/games.js'), 'utf8'))
    .map((g) => {
        let gaps = []
        try { gaps = parseGaps(readFileSync(join(ROOT, 'src/games', g.dir, 'README.md'), 'utf8')) } catch { gaps = [] }
        return { ...g, gaps }
    })

// `idle-kick.mjs qa` (#878) answers for a free QA lane, not the builder: with no
// claimable feedback the QA lane may take the unowned flagship gap itself, instead
// of idling while the builder is busy on a queued title. Same NONE-on-failure rule.
const qaMode = (process.argv[2] || '') === 'qa'
const stage = qaMode
    ? qaIdleStage({ issues, gapsByGame })
    : flagshipStage({ gapsByGame, qaIssues, buildingQa })
      || weakestStage({ games: shelf, qaIssues, heldDirs: heldDirs(shelf, issues.filter((i) => i.labels.includes('building') || i.labels.includes('building-qa'))) })
console.log(stage ? `KICK ${stage.game} ${stage.index}${stage.weak ? ' weak' : ''}` : 'NONE')
