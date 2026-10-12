// MINESWEEPER — the board, pure and Node-importable. No DOM, no canvas, no
// Math.random: every board falls out of (diff, seed, firstClick), so the
// harness that proves fairness is auditing the SAME code the tab plays with.
//
// The promise this module exists to keep is not "winnable by a perfect
// solver" — it is GUESS-FREE for the rules a human actually has:
//
//   single-square  a clue covering exactly N unknown neighbours has mines
//                  under all of them; a clue already ringed by that many
//                  mines (flagged or derived) is safe everywhere else;
//   subset-pair    two clues whose unknown sets nest: the difference of
//                  their mine counts lives in the difference of the sets;
//   chording       a clue ringed by exactly its count of FLAGS opens the
//                  rest — a shortcut, not a necessity.
//
// The generator therefore REJECTS its own boards: random mine layout, check
// the zero-guess solvers, reshuffle until both pass. The gate is the full
// rule set with a guess count of zero; the SLACK rule (one fewer supply,
// the strongest one) is that every board must also close with CHORDING
// FORBIDDEN — single-square + subset alone, no shortcuts. A board that
// forces a guess, or that only closes under a chord, never ships.

export const FIXED_DT = 1 / 30

export const DIFFS = [
    { name: 'COLT', w: 9, h: 9, mines: 10, cell: 20, par: 70 },
    { name: 'SAPPER', w: 16, h: 12, mines: 18, cell: 14, par: 150 },
    { name: 'GENERAL', w: 22, h: 13, mines: 26, cell: 11, par: 220 },
]

export const GUESS_LIMIT = 0

// mulberry32 — the whole game's fortune comes from this one integer, so a
// board is reproducible from (seed, firstClick) in Node and in the tab.
function rng32(state) {
    let a = state >>> 0
    return () => {
        a = (a + 0x6d2b79f5) >>> 0
        let t = a
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

export const idx = (s, x, y) => y * s.w + x

export function neighbors(s, x, y, cb) {
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue
            const nx = x + dx, ny = y + dy
            if (nx >= 0 && ny >= 0 && nx < s.w && ny < s.h) cb(nx, ny)
        }
    }
}

export function newGame(diffIdx = 0, seed = 20261012) {
    const d = DIFFS[((diffIdx % DIFFS.length) + DIFFS.length) % DIFFS.length]
    const n = d.w * d.h
    return {
        diff: d.name, diffIdx: ((diffIdx % DIFFS.length) + DIFFS.length) % DIFFS.length,
        w: d.w, h: d.h, cell: d.cell, par: d.par,
        totalMines: d.mines, seed: seed >>> 0, rngState: seed >>> 0,
        mines: new Uint8Array(n), clue: new Uint8Array(n),
        open: new Uint8Array(n), flag: new Uint8Array(n),
        opened: 0, flags: 0, planted: false, plantTries: 0, plantMoves: 0,
        cursor: { x: d.w >> 1, y: d.h >> 1 },
        screen: 'idle', end: null, why: '',
        tick: 0, sec: 0, score: 0,
        events: [],
    }
}

function computeClues(s) {
    s.clue.fill(0)
    for (let y = 0; y < s.h; y++) {
        for (let x = 0; x < s.w; x++) {
            if (s.mines[idx(s, x, y)]) continue
            let n = 0
            neighbors(s, x, y, (nx, ny) => { if (s.mines[idx(s, nx, ny)]) n++ })
            s.clue[idx(s, x, y)] = n
        }
    }
}

function clearMineZone(s, fx, fy) {
    const kill = new Set([idx(s, fx, fy)])
    neighbors(s, fx, fy, (nx, ny) => kill.add(idx(s, nx, ny)))
    return kill
}

// Verify the layout the way the gate does: dig the first click, run the
// SLACK solver (chord forbidden — the hard constraint). The full-rule pass
// was deleted deliberately: the solver's chord rule fires only when a
// clue's FLAG count equals its clue, the gate never sets a flag, so
// "full" and "slack" certify exactly the same board here — the second
// solve was pure duplicated work (and GENERAL generation felt it: seconds).
// Returns the ambiguous pocket the failure got stuck on: the safe cells
// the rule set could not crack. Repair pulls mines out of THAT pocket, so
// the hill-climb faces one problem at a time instead of reshuffling the
// whole field (which rejected ~1 board in 500 at real densities and took
// seconds per fair board).
function verifyLayout(s, fx, fy) {
    const g = cloneGame(s)
    g.open.fill(0); g.flag.fill(0); g.opened = 0; g.flags = 0; g.end = null; g.why = ''
    openCell(g, fx, fy)
    const slack = solveOn(g, { subset: true, chord: false })
    if (!slack.win || slack.guesses > GUESS_LIMIT) return { ok: false, stuck: slack.stuck }
    return { ok: true, stuck: [] }
}

// The fairness gate. plantAt() lays a random board and hands it to the
// zero-guess solvers; boards that force a guess — or that only close by
// chording (the slack rule: take away the strongest rule and the win must
// survive) — are not thrown away wholesale, they are REPAIRED: a greedy
// hill-climb that pulls mines out of the ambiguous pocket and re-verifies,
// KEEPING a move only if the stuck pocket strictly shrinks and reverting
// everything else. Random-walk repair oscillated at SAPPER density (89
// moves, mostly regressions); a hill-climb cannot wander. All inside one
// deterministic rng stream: same (seed, firstClick) replays the same
// board, so the harness audits exactly what the player gets.
export function plantAt(s, fx, fy) {
    const rng = rng32(s.rngState)
    const cells = s.w * s.h
    if (s.totalMines > cells - 9) throw new Error(`${s.diff}: ${s.totalMines} mines leave no safe first click`)
    const forbidden = clearMineZone(s, fx, fy)
    let moves = 0
    for (let fresh = 0; fresh < 30; fresh++) {
        s.mines.fill(0)
        const spots = []
        for (let i = 0; i < cells; i++) if (!forbidden.has(i)) spots.push(i)
        for (let i = spots.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1))
            const t = spots[i]; spots[i] = spots[j]; spots[j] = t
        }
        for (let i = 0; i < s.totalMines; i++) s.mines[spots[i]] = 1
        computeClues(s)
        let verdict = verifyLayout(s, fx, fy)
        let lastStuck = -1
        let stall = 0
        for (let iter = 0; iter < 120 && !verdict.ok; iter++) {
            const stuck = verdict.stuck
            // plateau escape: 5 moves with no improvement and the layout is
            // a lost cause — take a fresh random layout rather than burn the
            // budget polishing an ambiguous corpse. (Was 24, then 12: with
            // the honest stall report, a pocket that has not shrunk in a
            // handful of moves almost never shrinks at all — the worst seed
            // spent ~5 s on 16 layouts' worth of useless moves.)
            if (stuck.length === lastStuck) { if (++stall > 5) break } else stall = 0
            lastStuck = stuck.length
            const stuckSet = new Set(stuck)
            const adj = adjOf(s.w, s.h)
            const sources = []
            for (const c of stuck) {
                if (s.mines[c]) sources.push(c)
                else for (const n of adj[c]) if (s.mines[n]) sources.push(n)
            }
            const dests = []
            for (let i = 0; i < cells; i++) {
                if (s.mines[i] || forbidden.has(i) || stuckSet.has(i)) continue
                dests.push(i)
            }
            if (!sources.length || !dests.length) break
            const before = s.mines.slice()
            const a = sources[Math.floor(rng() * sources.length)]
            const b = dests[Math.floor(rng() * dests.length)]
            s.mines[a] = 0
            s.mines[b] = 1
            computeClues(s)
            const v2 = verifyLayout(s, fx, fy)
            if (v2.ok || v2.stuck.length < stuck.length) {
                verdict = v2
                moves++
            } else {
                s.mines.set(before)
                computeClues(s)
            }
        }
        if (verdict.ok) {
            s.rngState = (s.rngState + 0x9e3779b9) >>> 0
            s.planted = true
            s.plantTries = fresh + 1
            s.plantMoves = moves
            openCell(s, fx, fy)
            s.screen = 'play'
            s.events.push({ t: 'plant', x: fx, y: fy, tries: s.plantTries, moves })
            return
        }
    }
    throw new Error(`${s.diff}: no fair board in 30 layouts × 120 repairs — density is a design failure, not a seed problem`)
}

// -------------------------------------------------------------- moves ----
function openCell(s, x, y) {
    const i = idx(s, x, y)
    if (s.open[i]) return false
    s.open[i] = 1
    s.opened++
    if (s.flag[i]) { s.flag[i] = 0; s.flags-- }
    if (s.mines[i]) {
        s.end = 'dead'
        s.why = `a mine at ${x},${y}`
        s.events.push({ t: 'boom', x, y })
        return true
    }
    if (s.clue[i] === 0) {
        let dug = 0
        const stack = [[x, y]]
        const seen = new Set([i])
        while (stack.length) {
            const [cx, cy] = stack.pop()
            neighbors(s, cx, cy, (nx, ny) => {
                const ni = idx(s, nx, ny)
                if (seen.has(ni) || s.open[ni] || s.mines[ni]) return
                seen.add(ni)
                if (!s.open[ni]) { s.open[ni] = 1; s.opened++; dug++ }
                if (s.clue[ni] === 0) stack.push([nx, ny])
            })
        }
        if (dug) s.events.push({ t: 'flood', x, y, dug })
    }
    if (s.opened === s.w * s.h - s.totalMines) {
        s.end = 'win'
        s.score = s.totalMines * 100 + Math.max(0, s.par - s.sec) * 10
        s.why = `${s.totalMines} mines swept in ${s.sec}s — score ${s.score}`
        s.events.push({ t: 'win' })
    }
    return true
}

export function dig(s, x, y) {
    // The first click PLANTS, and a fresh board sits in 'idle' until
    // plantAt promotes it to 'play'. Guarding `!== 'play'` here rejected
    // the very dig meant to make it play — so the browser game could never
    // plant its first click (the Node battery never saw it because it
    // calls plantAt directly). A dig may therefore open a 'play' board or
    // plant an 'idle' one; a finished board is still refused.
    if (s.end || (s.screen !== 'play' && s.screen !== 'idle')) return false
    if (x < 0 || y < 0 || x >= s.w || y >= s.h) return false
    const i = idx(s, x, y)
    if (!s.planted) return plantAt(s, x, y)
    if (s.open[i]) { s.events.push({ t: 'dry', x, y }); return false }
    if (s.flag[i]) { s.events.push({ t: 'nope', x, y }); return false }
    return openCell(s, x, y)
}

export function flag(s, x, y) {
    if (s.end || s.screen !== 'play' || !s.planted) return false
    if (x < 0 || y < 0 || x >= s.w || y >= s.h) return false
    const i = idx(s, x, y)
    if (s.open[i]) return false
    s.flag[i] ^= 1
    s.flags += s.flag[i] ? 1 : -1
    s.events.push({ t: s.flag[i] ? 'flag' : 'unflag', x, y })
    return true
}

export function chord(s, x, y) {
    if (s.end || s.screen !== 'play') return false
    if (x < 0 || y < 0 || x >= s.w || y >= s.h) return false
    const i = idx(s, x, y)
    if (!s.open[i] || s.clue[i] === 0) return false
    let around = 0, covered = []
    neighbors(s, x, y, (nx, ny) => {
        const ni = idx(s, nx, ny)
        if (s.flag[ni]) around++
        if (!s.open[ni]) covered.push([nx, ny])
    })
    if (around !== s.clue[i]) { s.events.push({ t: 'nope', x, y }); return false }
    let acted = false
    for (const [cx, cy] of covered) {
        // openCell unflags as it opens: a WRONG flag chorded into a mine is
        // fatal, exactly like the original — flags are a claim, not a shield.
        if (openCell(s, cx, cy)) acted = true
        if (s.end) break
    }
    if (acted) s.events.push({ t: 'chord', x, y })
    return acted
}

export function step(s) {
    s.tick++
    if (s.screen === 'play' && s.planted && !s.end && s.tick % 30 === 0) s.sec++
}

// ---------------------------------------------------------------- solver ----
// The referee. Works on plain arrays so it can audit a live half-played
// board (PROGNOSIS) or a freshly planted one (the fairness gate) with the
// same code. `opts.chord:false` is the SLACK world — no shortcut allowed.
// Every dig it cannot derive is counted as a guess: fairness is exactly
// `guesses === 0 && win`.
// adjacency cache per board shape — the solver runs thousands of times
// during generation, and recomputing neighbor lists every pass is pure waste.
const ADJ = new Map()
function adjOf(w, h) {
    const key = `${w}x${h}`
    let adj = ADJ.get(key)
    if (!adj) {
        adj = new Array(w * h)
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const out = []
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (!dx && !dy) continue
                        const nx = x + dx, ny = y + dy
                        if (nx >= 0 && ny >= 0 && nx < w && ny < h) out.push(ny * w + nx)
                    }
                }
                adj[y * w + x] = out
            }
        }
        ADJ.set(key, adj)
    }
    return adj
}

// The referee. Works on a clone the caller hands in (open=1 open, mine=1
// mine). `opts.chord:false` is the SLACK world — no shortcut allowed. Every
// dig it cannot DERIVE is a guess, and fairness is exactly `guesses === 0`.
function solveOn(s, opts = {}) {
    const useSubset = opts.subset !== false
    const useChord = opts.chord !== false
    const adj = adjOf(s.w, s.h)
    const cells = s.w * s.h
    const open = Uint8Array.from(s.open)
    let openCount = 0
    for (let i = 0; i < cells; i++) if (open[i]) openCount++
    const plan = []
    let guesses = 0, passes = 0
    let acted = true
    // Stamps instead of fresh Uint8Arrays per pass: a derivation is live
    // for the pass that made it (stamp === token). The referee runs
    // thousands of full solves during generation, and the profile said so.
    const mineStamp = new Int32Array(cells)
    const safeStamp = new Int32Array(cells)
    const uaMark = new Int32Array(cells)
    const ubMark = new Int32Array(cells)
    let token = 0, uaTok = 0, ubTok = 0
    while (acted && openCount < cells - s.totalMines && passes < cells * 4) {
        acted = false
        passes++
        token++
        const safeSet = []
        const ruleOf = new Array(cells)
        const mineSet = []
        const isMine = (c) => mineStamp[c] === token
        const isSafe = (c) => safeStamp[c] === token
        // coverage only changes when cells open (end of pass), so cache
        // it per pass; clues likewise.
        const clues = []
        const covCache = new Map()
        for (let i = 0; i < cells; i++) {
            if (!open[i] || s.clue[i] === 0) continue
            clues.push(i)
            const out = []
            for (const c of adj[i]) if (!open[c]) out.push(c)
            covCache.set(i, out)
        }
        const covC = (i) => covCache.get(i)
        if (globalThis.PASSDUMP) globalThis.PASSDUMP(passes, open, s, mineStamp, token, safeStamp, guesses)
        // single-square: N unknowns under an N-clue are all mines; a clue
        // whose mines are all accounted for is safe everywhere else.
        for (const i of clues) {
            const cov = covC(i)
            if (!cov.length) continue
            let mLeft = s.clue[i], uLen = 0
            for (const c of cov) if (isMine(c)) mLeft--; else uLen++
            if (!uLen) continue
            if (mLeft === uLen) { for (const c of cov) if (!isMine(c)) { mineStamp[c] = token; ruleOf[c] = 'single-mines'; mineSet.push(c) }; acted = true }
            else if (mLeft === 0) { for (const c of cov) if (!isMine(c)) { safeStamp[c] = token; ruleOf[c] = 'single-safe'; safeSet.push(c) }; acted = true }
        }
        // subset-pair: nested unknown sets, the difference of the counts
        // lives in the difference of the sets. Counts are reduced by the
        // derived mines ADJACENT to each clue — never by the filtered set
        // itself. The first version subtracted `ac.filter(isMine)` from a
        // set that had ALREADY filtered mines out, so dm was the raw clue
        // delta and "0 = all safe" fired on every second board: the
        // referee was certifying mines as safe, and because the fairness
        // gate runs this same referee, the illusion confirmed itself.
        // Pairing is restricted to clues that SHARE a covered cell (built
        // off a cell→clues incidence list): clues with no shared unknown
        // can never nest, so the candidate cut changes no verdict — it
        // only stops the pass from being O(clues²) on a stuck GENERAL.
        // Membership is stamps, not Sets: same verdict, no allocation.
        if (useSubset) {
            const byCell = new Map()
            for (const i of clues) {
                for (const c of covC(i)) {
                    let l = byCell.get(c)
                    if (!l) byCell.set(c, l = [])
                    l.push(i)
                }
            }
            const ua = []
            for (const ai of clues) {
                // ua is REBUILT per ai — reusing one array across the loop
                // let stale cells keep a freshly-set uaMark: a pair could
                // nest against cells its own clue never covers and file a
                // true mine into the diff. The brute-force oracle caught
                // the stale reuse deriving (0,6) as a mine with dm=1 vs a
                // two-cell diff. Stale reuse is why a scratch array wants
                // one owner per iteration.
                ua.length = 0
                const covA = covC(ai)
                let kA = s.clue[ai]
                for (const c of covA) {
                    if (isMine(c)) kA--
                    else if (!isSafe(c)) ua.push(c)
                }
                if (kA < 0 || !ua.length) continue
                const uaLen = ua.length
                uaTok++
                for (let j = 0; j < uaLen; j++) uaMark[ua[j]] = uaTok
                const cands = []
                for (const c of covA) {
                    if (isSafe(c)) continue
                    for (const b of byCell.get(c)) if (b !== ai) cands.push(b)
                }
                for (const bi of cands) {
                    const covB = covC(bi)
                    let kB = s.clue[bi]
                    for (const c of covB) if (isMine(c)) kB--
                    if (kB < 0 || kB > kA) continue
                    // ubTok is PER CANDIDATE: a stale mark from the
                    // previous pair must never read as "in this ub".
                    ubTok++
                    let ubLen = 0
                    let nested = true
                    for (const c of covB) {
                        if (isMine(c) || isSafe(c)) continue
                        if (uaMark[c] !== uaTok) { nested = false; break }
                        ubMark[c] = ubTok
                        ubLen++
                    }
                    if (!nested || !ubLen) continue
                    let diffLen = 0
                    for (let j = 0; j < uaLen; j++) {
                        const c = ua[j]
                        if (ubMark[c] !== ubTok && safeStamp[c] !== token) diffLen++
                    }
                    if (!diffLen) continue
                    const dm = kA - kB
                    if (dm === diffLen) { for (let j = 0; j < uaLen; j++) { const c = ua[j]; if (ubMark[c] !== ubTok && safeStamp[c] !== token) { mineStamp[c] = token; ruleOf[c] = 'subset-mines'; mineSet.push(c) } }; acted = true }
                    else if (dm === 0) { for (let j = 0; j < uaLen; j++) { const c = ua[j]; if (ubMark[c] !== ubTok && safeStamp[c] !== token) { safeStamp[c] = token; ruleOf[c] = 'subset-safe'; safeSet.push(c) } }; acted = true }
                }
            }
        }
        if (useChord) {
            for (const i of clues) {
                const cov = covC(i)
                let flagged = 0, restLen = 0
                for (const c of cov) if (s.flag[c]) flagged++; else if (!isMine(c) && !isSafe(c)) restLen++
                if (restLen && flagged === s.clue[i]) {
                    for (const c of cov) if (!s.flag[c] && !isMine(c) && !isSafe(c)) { safeStamp[c] = token; ruleOf[c] = 'chord'; safeSet.push(c) }
                    acted = true
                }
            }
        }
        for (const c of mineSet) {
            if (!s.mines[c]) {
                throw new Error(`fairness solver derived a SAFE cell as MINE at ${c % s.w},${(c / s.w) | 0} (rule: ${ruleOf[c]}) — the referee is broken, every verdict from this rule set is suspect`)
            }
        }
        for (const c of safeSet) {
            if (open[c]) continue
            if (s.mines[c]) {
                throw new Error(`fairness solver derived a MINE as SAFE at ${c % s.w},${(c / s.w) | 0} (rule: ${ruleOf[c]}) — the referee is broken, every verdict from this rule set is suspect`)
            }
            open[c] = 1
            openCount++
            plan.push({ x: c % s.w, y: (c / s.w) | 0, rule: ruleOf[c] })
            acted = true
        }
        // Stalled: derivation stopped with cells left. A solver that DIGS
        // un-derived cells poisons its own state — opening a possible mine
        // drops it from every later coveredOf() while clue[] keeps counting
        // it, and the phantom mine then "proves" safe cells to be mines
        // (that was the single-mines lie at 12,4, thrown from inside the
        // generator's own gate). Guesses are forbidden by definition: the
        // solver returns the stuck state, counts the guess, and STOPS.
        if (!acted && openCount < cells - s.totalMines) guesses++
    }
        // Stamped facts that SURVIVED the whole solve: any cell ever
        // stamped mine (and never opened) or ever stamped safe. Tokens
        // change per pass, so the ledger scans for a NON-ZERO stamp, not
        // the final token — a first version that keyed on the final token
        // silently dropped every earlier pass's derivations, and one that
        // keyed on the final mineSet dropped earlier passes too. The
        // oracle enumerates worlds consistent with the FULL derivation
        // ledger, so a partial ledger fabricates worlds the rules already
        // excluded. The generator owns the mine map here (the player
        // never may); unfairness is only ever the player's.
        const ledgerMines = [], ledgerSafe = []
        for (let i = 0; i < cells; i++) {
            if (mineStamp[i] !== 0 && !open[i]) ledgerMines.push(i)
            else if (safeStamp[i] !== 0) ledgerSafe.push(i)
        }
        const stuck = []
        for (let i = 0; i < cells; i++) if (!open[i] && !s.mines[i]) stuck.push(i)
        return { win: openCount >= cells - s.totalMines, guesses, plan, passes, stuck, derivedMines: ledgerMines, derivedSafe: ledgerSafe }
}

// Solve a copy of the live board — the player's real flags are part of the
// evidence for chording; PROGNOSIS clones first and reports on it.
export function solve(s, opts = {}) {
    return solveOn(cloneGame(s), opts)
}

// The attract autopilot: the CORE rule set only — single-square and subset,
// no chord, no flag bookkeeping — the exact rules the fairness gate proved
// this board closes with. The demo can never show a shortcut the gate did
// not certify, and the player sees a run of pure logic start to finish.
export function nextDigs(s) {
    const r = solve(s, { subset: true, chord: false })
    return r.plan.filter((p) => !s.open[idx(s, p.x, p.y)])
}

// ------------------------------------------------------------- plumbing ----
export function cloneGame(s) {
    return {
        ...s,
        mines: Uint8Array.from(s.mines),
        clue: Uint8Array.from(s.clue),
        open: Uint8Array.from(s.open),
        flag: Uint8Array.from(s.flag),
        cursor: { ...s.cursor },
        events: [],
    }
}

export function stateHash(s) {
    let h = 0x811c9dc5 >>> 0
    const mix = (n) => { h = Math.imul(h ^ (n | 0), 0x01000193) >>> 0 }
    mix(s.w); mix(s.h); mix(s.totalMines); mix(s.opened); mix(s.flags)
    mix(s.open ? Array.prototype.reduce.call(s.open, (a, v) => (a + v * 7) | 0, 0) : 0)
    mix(Array.prototype.reduce.call(s.flag, (a, v) => (a + v * 13) | 0, 0))
    mix(Array.prototype.reduce.call(s.mines, (a, v) => (a + v * 31) | 0, 0))
    mix(s.sec); mix(s.score)
    if (s.end) { mix(s.end === 'win' ? 11 : 12) }
    return h >>> 0
}
