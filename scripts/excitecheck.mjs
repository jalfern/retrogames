// EXCITEBIKE — the harness. No browser, a few seconds. This is the gate for
// the issue's muscle ("as faithful to the NES original as possible"): the
// course is audited as DATA before anyone rides it (the loop must close, no
// control point may teleport off-screen, every gameplay band must sit on
// ground that exists, and a wide-open-throttle ride must never die stuck in a
// hole); the autopilot — the SAME call the attract demo replays — then clears
// both tracks in FIRST, with its score ledger recomputed from the events it
// booked and the replay proven hash-for-hash; and the SLACK RULE re-wins both
// tracks with less clock at every lap line, thicker mud, and an engine that
// overheats sooner. A level the machine only barely wins is not humanly
// winnable, and a check a mutant can't turn red is a check that stopped
// touching its rule.
//
//   npm run excitecheck
//   npm run excitecheck -- --mutate   # re-break the load-bearing rules; a
//                                     # surviving mutant means a check died
import { readFileSync } from 'node:fs'
import { makeGame, step, stateHash, CFG } from '../src/games/Excitebike/sim.js'
import { track, groundY, featureAt, LAP, MUD, WATER, BOOST, TRACK_COUNT, nextSel, trackName, buildTrack, registerCustom, customCount, TRANSIENT, setTestTrack, clearTestTrack, hasTestTrack, ownTerrain, PACE } from '../src/games/Excitebike/levels.js'
import { plan, decide } from '../src/games/Excitebike/planner.js'
import { compileCustom, auditCustomData, encodeCustom, decodeCustom, fitsAt, stampAt, SPAN, EDGE, STAMP_KINDS, CUSTOM_KEY, CUSTOM_MAX, LAPS_DEFAULT, LAPS_MIN, LAPS_MAX, lapsOf, TOOLS, NAME_MAX, NAME_WHEEL, pushName, popName, designName, lapLabel, overBookLabel, lapCycle, badgeCompact, lapTipFor, LAP_TIP, BOB_TICKS, bikeBob, KIND_COLOR, toolLabelColor } from '../src/games/Excitebike/custom.js'
import { demoSeats, demoSeatTrack, demoSeatLabel, demoSeatName } from '../src/games/Excitebike/attract.js'

const MUT = process.argv.includes('--mutate')
let pass = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else fails.push(m) }
const section = (s) => console.log(`\x1b[1m${s}\x1b[0m`)

// ------------------------------------------------------------- terrain audit ----
section('TERRAIN (the course is projected, not trusted)')
{
    for (let i = 0; i < TRACK_COUNT; i++) {
        const tr = track(i)
        // the lap closes: height and shape must not teleport at the seam
        const a = groundY(tr.ground, LAP - 2), b = groundY(tr.ground, 2)
        ok(Math.abs(a - b) < 6, `track ${i + 1}: lap seam jumps ${a.toFixed(0)}->${b.toFixed(0)} (rider breaks an axle at the line)`)
        // every control point is on-screen and inside the lap
        let off = 0
        for (const [x, h] of tr.cps) { if (x < 0 || x > LAP || h < 40 || h > 165) off++ }
        ok(off === 0, `track ${i + 1}: ${off} control points off-screen/out of bounds`)
        // monotonic control points (no backward course)
        let back = 0
        for (let k = 1; k < tr.cps.length; k++) if (tr.cps[k][0] <= tr.cps[k - 1][0] - 1) back++
        ok(back === 0, `track ${i + 1}: ${back} control points run backward`)
        // every feature band lies on real ground inside the lap
        for (const band of tr.bands) {
            if (band.whoops) {
                ok(band.whoops[0] > 0 && band.whoops[1] < LAP, `track ${i + 1}: whoop band outside the lap`)
                continue
            }
            const [kind, x0, x1] = band
            ok(x0 > 0 && x1 < LAP && x1 > x0, `track ${i + 1}: ${kind} band lies off the course`)
            ok(groundY(tr.ground, (x0 + x1) / 2) > 40, `track ${i + 1}: ${kind} band sits above the world`)
        }
        ok(tr.steps.length >= 1, `track ${i + 1}: no up-step/step crest — the level-geometry muscle was never used`)
    }
    // a wide-open-throttle, no-skill ride must not die STUCK in a hole. The
    // up-steps live at the tops of ramps so a charging rider always tops them;
    // only the water hole may bite (and it recovers).
    for (let i = 0; i < TRACK_COUNT; i++) {
        const g = makeGame(i, { count: 0 })
        let maxStuck = 0, stuck = 0
        for (let t = 0; t < 6000 && !g.end; t++) {
            step(g, { g: true })   // pure throttle, zero skill
            if (g.crash > 0 || g.stall > 0) stuck++; else stuck = 0
            maxStuck = Math.max(maxStuck, stuck)
            g.events.length = 0
        }
        ok(maxStuck < 400, `track ${i + 1}: WOT ride stuck ${maxStuck} ticks (a hole you cannot ride out is an unfair level, not difficulty)`)
    }
    // the gas gauge actually boils at WOT — heat is a real constraint
    {
        const g = makeGame(0, { count: 0 })
        let boiled = false
        for (let t = 0; t < 3000 && !boiled; t++) { step(g, { g: true }); boiled = g.events.some((e) => e.type === 'overheat'); g.events.length = 0 }
        ok(boiled, 'full throttle never overheated the engine — heat/overheat is theatre')
    }}

// --------------------------------------------------------------- splash ----
section('SPLASH (the roster of six — the NES menu law, #2563)')
{
    ok(TRACK_COUNT === 6, `the splash catalogues SIX courses, got ${TRACK_COUNT} (the NES roster)`)
    const names = [...Array(TRACK_COUNT)].map((_, i) => trackName(i))
    ok(new Set(names).size === TRACK_COUNT, `roster names repeat: ${names.join(',')}`)
    ok(names.every((n) => n && n === n.toUpperCase()), `every course has a carved-in marquee name: ${names.join(',')}`)
    ok(JSON.stringify(names) === JSON.stringify(['MOTOCROSS', 'SUPERCROSS', 'SAND CROSS', 'SLALOM CROSS', 'BIG AIR', 'K.O. CROSS']),
        `the shipped roster is MOTOCROSS, SUPERCROSS, SAND CROSS, SLALOM CROSS, BIG AIR, K.O. CROSS — got ${names.join(', ')}`)
    // the cursor law: ±1 with wrap, for every roster size the shell may pass
    for (let n = 1; n <= 8; n++) {
        ok(nextSel(0, -1, n) === n - 1 && nextSel(n - 1, 1, n) === 0, `cursor wrap broken at n=${n}`)
    }
    ok(nextSel(2, 1) === 3 && nextSel(5, 1) === 0 && nextSel(0, -1) === 5, 'cursor law on the six-course roster')
    // grade pips are the menu's honesty column: one per course, climbing
    const bites = [...Array(TRACK_COUNT)].map((_, i) => track(i).bite)
    ok(bites.every((b, i) => b === i + 1), `grade pips climb 1..6 in roster order, got ${bites.join(',')}`)
    // BYTE PIN: the two original circuits are carved stone. The witnesses
    // (CRASH LEAGUE receipts, attract replay, contact pins) were tuned on
    // their exact ground — a splash PR must not reshape them.
    const PIN = [66775052, 68196743]
    for (const i of [0, 1]) {
        const g = track(i).ground
        let s = 0
        for (let x = 0; x < g.length; x++) s += Math.round(g[x] * 100)
        ok(s === PIN[i], `track ${i + 1} (${names[i]}) ground fingerprint moved (${s} != ${PIN[i]}) — the shipped courses are byte-pinned`)
    }
    ok(JSON.stringify(track(0).steps) === JSON.stringify([{ x: 2744, rise: 46, grade: 0.319 }, { x: 2750, rise: 2, grade: 0.333 }, { x: 3680, rise: 50, grade: 0.313 }]), 'MOTOCROSS up-steps moved — the auditor record is pinned')
    ok(JSON.stringify(track(1).steps) === JSON.stringify([{ x: 2846, rise: 38, grade: 0.442 }, { x: 2852, rise: 2, grade: 0.333 }, { x: 3820, rise: 56, grade: 0.35 }]), 'SUPERCROSS up-steps moved — the auditor record is pinned')
}

// --------------------------------------------------- the campaign + the ledger ----
section('THE CAMPAIGN (the autopilot = the attract demo) + LEDGER')
const t0 = Date.now()
const runs = []
for (let i = 0; i < TRACK_COUNT; i++) {
    let ledger = 0
    const r = plan({
        track: i,
        onEvent: (e) => {
            if (e.type === 'air' || e.type === 'boost' || e.type === 'lap' || e.type === 'finish' || e.type === 'flyby') ledger += e.pts
        },
    })
    runs.push({ r, ledger })
    const ms = Date.now() - t0
    ok(r.ok, `track ${i + 1}: autopilot did not clear in FIRST (end=${r.end} rank=${r.rank})`)
    ok(r.receipts.airs >= 3, `track ${i + 1}: only ${r.receipts.airs} scored airs — it never really jumped the ramps`)
    ok(r.receipts.boosts >= 1, `track ${i + 1}: never took a boost — the boost straight is a prop it walked past`)
    ok(r.game.score === ledger, `track ${i + 1}: ledger lies — score ${r.game.score}, booked events ${ledger}`)
    ok(ms < 15000, `the solve took ${ms}ms — the gate must stay in seconds`)
}

// ------------------------------------------------------------ determinism ----
section('DETERMINISM (the attract replay is not theatre)')
for (let i = 0; i < TRACK_COUNT; i++) {
    const { r } = runs[i]
    const g = makeGame(i, {})
    for (const inp of r.script) step(g, inp)
    ok(g.score === r.game.score && g.tick === r.game.tick, `track ${i + 1}: replay diverged from the proven run`)
    // drop one pump/fire mid-run; the bike must be a different bike a few
    // ticks later (a check that only compares the end of a run proves nothing)
    const j = r.script.findIndex((x) => x.j)
    ok(j > 0, `track ${i + 1}: the winning run never jumped/pumped — tamper probe cannot run`)
    const a = makeGame(i, {}), b = makeGame(i, {})
    for (let k = 0; k < j + 6 && k < r.script.length; k++) {
        step(a, k === j ? {} : r.script[k])
        step(b, r.script[k])
    }
    ok(stateHash(a) !== stateHash(b), `track ${i + 1}: dropping a jump changed nothing — the sim ignores air`)
}

// ------------------------------------------------------------- slack rule ----
section('SLACK (one fewer of every supply, same win — or the goods were theatre)')
for (let i = 0; i < TRACK_COUNT; i++) {
    for (const tax of [4, 8]) {
        const r = plan({ track: i, bonusTax: tax })
        ok(r.ok, `track ${i + 1}: ZERO SLACK — with ${34 - tax}s (not ${34}) at the line it finishes ${r.end} rank ${r.rank}`)
    }
    const mud = plan({ track: i, mudTax: 0.01 })
    ok(mud.ok, `track ${i + 1}: thicker mud (one pump short of traction) is unbeatable — the mud was not beatable, it was avoided`)
    const hot = plan({ track: i, heatTax: 1.5 })
    ok(hot.ok, `track ${i + 1}: an engine that overheats sooner cannot finish — heat was a wall, not a resource`)
    const all = plan({ track: i, bonusTax: 4, mudTax: 0.008, heatTax: 1.0 })
    ok(all.ok, `track ${i + 1}: stripped of slack on EVERY supply it cannot win (end=${all.end} rank=${all.rank})`)
}

// ------------------------------------------------- per-course league ----
section('PER-COURSE LEAGUE (later circuits bite harder — #2573)')
{
    // The original's later circuits ran faster; here each course carries a
    // `pace` and the front ranks of PACK_TIER (1, 2/3, 1/3, 0, 0) carry it.
    // The ramp is capped by the margin law, not guessed: +0.15 on the leader
    // finished a near-perfect autopilot lap 3.1px ahead of MARIO and lost
    // FIRST under every SLACK tax, so the bite tops out where a taxed win
    // survives (+0.06 at K.O. CROSS — see the SLACK section).
    const PACE = [0, 0, 0.02, 0.03, 0.04, 0.06]
    for (let i = 0; i < TRACK_COUNT; i++) {
        ok((track(i).pace || 0) === PACE[i], `track ${i + 1}: pace ${(track(i).pace || 0).toFixed(2)}, want ${PACE[i].toFixed(2)} — the later-circuit ramp is the law`)
    }
    const ko = makeGame(5, {})
    const WANT = [5.36, 5.22, 5.07, 4.88, 4.66]   // +0.06/+0.04/+0.02 on the front ranks
    ko.rivals.forEach((r, j) => ok(Math.abs(r.base - WANT[j]) < 1e-9 && r.v === r.base,
        `K.O. CROSS ${r.name} seats at base ${r.base}, want ${WANT[j]} (PACK_TIER × pace 0.06)`))
    ok(ko.rivals.every((r, j) => j === 0 || ko.rivals[j - 1].base > r.base), 'the pace nudge reordered the pack — ranks must hold')
    // Customs/drafts: the baseline-pack remainder is CLOSED — GRADED PACK
    // (#2642, below) grades every built custom. The compiler still emits pure
    // geometry with no pace key: the grade is build-time law, not compiler output.
    const draft = compileCustom([{ kind: STAMP_KINDS[0], x: 900 }])
    ok(draft && !('pace' in draft), 'a compiled draft carries pace — grading must live in buildTrack, not the compiler')
    // Item 6, the lap book: the shipped mode runs TWO laps on every circuit
    // (the original's lap-count variation lives only in VS-mode options this
    // port does not model). Pin the uniformity so a silent drift reddens here.
    for (let i = 0; i < TRACK_COUNT; i++) {
        ok(makeGame(i, {}).laps === 2 && CFG.laps === 2, `track ${i + 1}: laps drifted from the two-lap book`)
    }
}

// --------------------------------------------------------- crash league ----
section('CRASH LEAGUE (rivals are riding bodies — receipts exact, #2384)')
const LEAGUE = []
{
    // The five rivals fly the same always-ballistic law the player does, land
    // inside a skill-scaled version of the player's own window, and pay for a
    // wipeout with frozen distance. Receipts are deterministic: exact ticks,
    // exact riders, exact lips. The front office (MARIO/KATO/GORDON) is clean
    // on both tracks; SONJA repeats the MOTOCROSS jump lip every lap; IVAN
    // eats the SUPERCROSS whoop field twice. If the terrain, pace lines or
    // skill tiers move, these receipts move — and this section says so loudly.
    // Skill tiers move, these receipts move — and this section says so loudly.
    // #2391 update: the league now reacts to the player. On MOTOCROSS the
    // bump at t818 (IVAN) changes his phase, and he lands CLEAN at the lip on
    // lap 2 — IVAN's old lap-2 receipt retired honestly as a consequence of
    // contact, SONJA keeps hers. SUPERCROSS receipts unchanged.
    // #2420 update: the pack is solid to itself and the grid staggers 14px
    // (the original's start row), so every phase moved. MOTOCROSS now takes
    // FOUR wipeouts — SONJA's two lip crashes each pull IVAN's chain-wreck
    // behind them (why 'wreck', on:SONJA), and IVAN's old clean lap-2 landing
    // went with the phase. SUPERCROSS keeps its two IVAN receipts.
    const RECEIPTS = {
        0: [
            { t: 489, name: 'SONJA', x: 1369 },
            { t: 503, name: 'IVAN', x: 1353 },
            { t: 1960, name: 'SONJA', x: 1370 },
            { t: 2036, name: 'IVAN', x: 1355 },
        ],
        1: [
            { t: 514, name: 'IVAN', x: 1404 },
            { t: 2060, name: 'IVAN', x: 1404 },
        ],
    }
    const replay = (i) => {
        const { r } = runs[i]
        const g = makeGame(i, {})
        const crashes = []          // { t, name, x, dDown, churnBefore/After, gained150 }
        const ups = []
        let maxRel = 0
        for (let k = 0; k < r.script.length; k++) {
            step(g, r.script[k])
            for (const e of g.events) {
                if (e.type === 'rcrash') {
                    const q = g.rivals.find((x) => x.name === e.name)
                    crashes.push({ t: g.tick, name: e.name, why: e.why, on: e.on || '', x: Math.round(e.x), d: q.d, leadGap: Math.max(...g.rivals.map((x) => x.d)) - q.d, k })
                } else if (e.type === 'rup') ups.push({ t: g.tick, name: e.name })
            }
            g.events.length = 0
            for (const q of g.rivals) maxRel = Math.max(maxRel, q.air ? q.alt - groundY(track(i).ground, q.d) : 0)
        }
        return { g, crashes, ups, maxRel }
    }
    const rivalRank = (g, name) => 1 + g.rivals.filter((q) => q.name !== name && q.d > g.rivals.find((x) => x.name === name).d + 0.01).length

    for (let i = 0; i < 2; i++) {
        const { crashes, ups, maxRel } = replay(i)
        LEAGUE.push({ i, crashes, ups, maxRel, script: runs[i].r.script })
        ok(crashes.length === RECEIPTS[i].length, `track ${i + 1}: ${crashes.length} rival wipeouts, want ${RECEIPTS[i].length} (${JSON.stringify(crashes.map((c) => c.name))})`)
        RECEIPTS[i].forEach((w, k) => {
            const c = crashes[k]
            ok(c && c.name === w.name && c.t === w.t && Math.abs(c.x - w.x) <= 2,
                `track ${i + 1}: wipeout ${k + 1} was ${c ? `${c.name}@t${c.t} x${c.x}` : 'missing'}, want ${w.name}@t${w.t} x${w.x}`)
        })
        ok(maxRel >= 15, `track ${i + 1}: highest any rival left the ground was ${maxRel.toFixed(1)}px — they are bobbing, not flying`)
        // every wreck ends on two wheels before the flag
        for (const c of crashes) ok(ups.some((u) => u.name === c.name && u.t > c.t), `track ${i + 1}: ${c.name} went down at t${c.t} and never came up`)
        // a crash costs GROUND: distance freezes while down (110 ticks) plus a
        // slow remount — 150 ticks later the wreck gained < 250px, and the gap
        // to the race leader among rivals widened by >= 150px.
        ok(crashes.every((c) => {
            const st = makeGame(i, {})
            for (let k = 0; k <= c.k + 150 && k < runs[i].r.script.length; k++) { step(st, runs[i].r.script[k]); st.events.length = 0 }
            const q = st.rivals.find((x) => x.name === c.name)
            return q.d - c.d < 250 && (Math.max(...st.rivals.map((x) => x.d)) - q.d) - c.leadGap >= 150
        }), `track ${i + 1}: a wiped-out rival kept pace with the field — down costs nothing`)
    }
    // skill tiers: the front office lands what it takes off
    LEAGUE.forEach(({ i, crashes }) => {
        ok(!crashes.some((c) => ['MARIO', 'KATO', 'GORDON'].includes(c.name)), `track ${i + 1}: a front-office rider fell — the skill tiers are a lottery`)
    })
    // SONJA's lap-2 wipeout at the big-jump lip is at the SAME place as lap 1:
    // the danger is terrain, not chance.
    {
        const s = LEAGUE[0].crashes.filter((c) => c.name === 'SONJA')
        ok(s.length >= 2 && Math.abs(s[0].x - s[s.length - 1].x) <= 4, `SONJA's wipeouts moved (${JSON.stringify(s.map((c) => c.x))}) — crash sites must be terrain-fixed`)
    }
    // live churn (#2420): the wreck takes its witness. IVAN chains behind
    // SONJA's lip crash on both laps — lap 1 while he is still in her
    // slipstream (14 ticks), lap 2 after her body has aged but is still alive
    // inside the rivalDown window (76 < 110). SUPERCROSS proves the contrast:
    // the tail rider falls ALONE (nobody behind), so nobody chains.
    {
        const cs = LEAGUE[0].crashes
        ok(cs.filter((c) => c.why === 'wreck' && c.on === 'SONJA').length === 2,
            `MOTOCROSS made ${cs.filter((c) => c.why === 'wreck').length} chain-wrecks, want 2 — SONJA's lip should pull IVAN in every lap`)
        ok(cs[0].name === 'SONJA' && cs[1].why === 'wreck' && cs[1].on === 'SONJA' && cs[1].t - cs[0].t <= 30 &&
            cs[2].name === 'SONJA' && cs[3].why === 'wreck' && cs[3].on === 'SONJA' && cs[3].t - cs[2].t < 110,
            `the chain did not follow the lip crash inside the body's lifetime (${JSON.stringify(cs.map((c) => [c.name, c.t, c.why]))}) — the pack is not solid`)
        ok(!LEAGUE[1].crashes.some((c) => c.why === 'wreck'),
            'SUPERCROSS chained a rival behind its own tail rider — there is no one back there to chain')
    }
    // determinism: the same script replays to the same wipeouts
    {
        const again = replay(0)
        ok(JSON.stringify(again.crashes.map((c) => [c.t, c.name])) === JSON.stringify(LEAGUE[0].crashes.map((c) => [c.t, c.name])), 'rival wipeouts are not deterministic — attract lies')
    }
}

// ------------------------------------------------------- contact (#2391) ----
section('CONTACT (the league is solid — receipts exact, #2391)')
{
    // The law: flybys pay for crossing bodies airborne, downed rivals are
    // SOLID (wipeout or hold, never a ride-through), a fast close onto a
    // riding back bumps (momentum transfers) and over the crash line wipes
    // out, a rival catching your back swerves. One drama per pair per
    // contactCool. The campaign replay above shows the pack engaged:
    // exact counts, exact first-crossings, both tracks.
    const replayContact = (i) => {
        const g = makeGame(i, {})
        const hits = []
        for (let k = 0; k < runs[i].r.script.length; k++) {
            step(g, runs[i].r.script[k])
            for (const e of g.events) {
                if (e.type === 'flyby' || e.type === 'bump' || e.type === 'jolt' || e.type === 'rub') {
                    const q = g.rivals.find((x) => x.name === e.name)
                    hits.push({ t: g.tick, type: e.type, name: e.name, down: q ? q.down > 0 : false })
                }
                if (e.type === 'crash') hits.push({ t: g.tick, type: 'crash', name: '', why: e.why })
                if (e.type === 'rrub') hits.push({ t: g.tick, type: 'rrub', name: e.a })
            }
            g.events.length = 0
        }
        return hits
    }
    const WANTS = {
        0: {
            flybys: 5, bumps: 0, jolts: 0, crashes: 0, rubs: 0, rrubs: 0,
            firstFlyby: { t: 551, name: 'IVAN', overWreck: true },
            overAllFive: true,
        },
        1: {
            // #2457 re-record: with a lane axis the autopilot LEARNS lines —
            // five passes that used to be forced (8 flybys/5 bumps, creeping
            // and scraping line 0) became clean cross-line drafts. The pack
            // still crashes (CRASH LEAGUE unchanged); the league just got
            // smarter. Rubs are proven by the rigs below, not this campaign —
            // a planner that steers never creeps.
            flybys: 3, bumps: 0, jolts: 0, crashes: 0, rubs: 0, rrubs: 0,
            firstFlyby: { t: 573, name: 'IVAN', overWreck: true },
        },
    }
    const contactRuns = [0, 1].map(replayContact)
    contactRuns.forEach((hits, i) => {
        const w = WANTS[i]
        const fl = hits.filter((h) => h.type === 'flyby')
        const bu = hits.filter((h) => h.type === 'bump')
        const jo = hits.filter((h) => h.type === 'jolt')
        const cr = hits.filter((h) => h.type === 'crash')
        const ru = hits.filter((h) => h.type === 'rub')
        const rr = hits.filter((h) => h.type === 'rrub')
        ok(fl.length === w.flybys, `track ${i + 1}: ${fl.length} flybys, want ${w.flybys}`)
        ok(bu.length === w.bumps, `track ${i + 1}: ${bu.length} bumps, want ${w.bumps}`)
        ok(jo.length === w.jolts && cr.length === w.crashes, `track ${i + 1}: jolt ${jo.length}/crash ${cr.length}, want 0/0 — the autopilot eats the new law`)
        ok(ru.length === w.rubs && rr.length === w.rrubs, `track ${i + 1}: rub ${ru.length}/rrub ${rr.length}, want 0/0 — the autopilot creeps instead of taking the line`)
        const f0 = fl[0]
        ok(f0 && f0.t === w.firstFlyby.t && f0.name === w.firstFlyby.name,
            `track ${i + 1}: first flyby was ${f0 ? `${f0.name}@t${f0.t}` : 'none'}, want ${w.firstFlyby.name}@t${w.firstFlyby.t}`)
        ok(f0 && f0.down === w.firstFlyby.overWreck, `track ${i + 1}: the first flyby must clear a DOWNED rider (the wreck showcase)`)
        if (w.overAllFive) {
            const names = new Set(fl.map((h) => h.name))
            ok(names.size === 5, `track 1: the pack was not fully passed on the air (${[...names].join(',')})`)
        }
        // one drama per pair: same-rival bumps never land inside contactCool
        for (let a = 0; a < bu.length; a++) for (let b = a + 1; b < bu.length; b++) {
            if (bu[a].name === bu[b].name) ok(bu[b].t - bu[a].t >= 90, `track ${i + 1}: ${bu[a].name} bumped twice in ${bu[b].t - bu[a].t} ticks — the derby clause is dead`)
        }
    })
    // ---- synthetic rigs: each fires one rule at an exact tick ----------------
    const rig = (v, gap, rv, down, airAlt) => {
        const g = makeGame(0, { count: 0 })
        const q = g.rivals.find((r) => r.name === 'KATO')
        g.x = 2000; g.total = 2000
        g.alt = groundY(track(0).ground, 2000) + (airAlt || 0)
        g.v = v; g.onGround = !airAlt
        q.d = 2000 + gap; q.v = rv; q.down = down
        q.alt = groundY(track(0).ground, q.d % LAP); q.cool = 0
        return { g, q }
    }
    // wreck solid: v5 closes on a frozen rival -> wipeout at t10, why wreck
    {
        const { g } = rig(5, 60, 0, 40)
        let hit = null
        for (let t = 1; t <= 30 && !hit; t++) {
            step(g, { g: true })
            for (const e of g.events) if (e.type === 'crash') hit = { t, why: e.why }
            g.events.length = 0
        }
        ok(hit && hit.t === 10 && hit.why === 'wreck', `the wreck did not bite as scripted (${JSON.stringify(hit)}) — solid rivals are theatre`)
    }
    // the same rig with 20px of air is a clean flyby at the same tick, +150
    {
        const { g } = rig(5, 60, 0, 40, 20)
        let hit = null
        for (let t = 1; t <= 30 && !hit; t++) {
            g.v = 5
            step(g, {})
            for (const e of g.events) if (e.type === 'flyby' || e.type === 'crash') hit = { t, type: e.type, score: g.score }
            g.events.length = 0
        }
        ok(hit && hit.type === 'flyby' && hit.t === 10 && hit.score === 150, `flying the same line paid ${JSON.stringify(hit)}, want flyby@t10 150pts`)
    }
    // slow arrival at a wreck holds the bike (v→0) without a crash
    {
        const { g } = rig(0.5, 24, 0, 40)
        let held = 0
        for (let t = 1; t <= 40 && !held; t++) {
            step(g, {})
            if (g.v === 0 && g.crash === 0) held = t
            g.events.length = 0
        }
        ok(held > 0 && held <= 30 && g.crash === 0, `a crawling bike at a wreck neither stopped nor crashed (held=${held}, crash=${g.crash}) — the lane is neither blocked nor solid`)
    }
    // bump: momentum transfers both ways at t4 (v 6.05 -> 5.04, KATO gains)
    {
        const { g, q } = rig(6, 24, 2, 0)
        let hit = null
        for (let t = 1; t <= 30 && !hit; t++) {
            const v0 = g.v; const dv0 = q.v
            step(g, { g: true })
            for (const e of g.events) if (e.type === 'bump') hit = { t, cv: e.cv, lost: +(v0 - g.v).toFixed(2), rivalGain: +(q.v - dv0).toFixed(2) }
            g.events.length = 0
        }
        ok(hit && hit.t === 4 && hit.cv > 1.6 && hit.cv < 3.4, `close onto a riding back did not bump as scripted (${JSON.stringify(hit)})`)
        ok(hit && hit.lost > 0.8 && hit.rivalGain > 0.4, `the bump moved no one (${JSON.stringify(hit)}) — momentum transfer is theatre`)
    }
    // closing above the crash line wipes out: 'contact' at t2
    {
        const { g } = rig(6, 20, 0.2, 0)
        let hit = null
        for (let t = 1; t <= 30 && !hit; t++) {
            step(g, { g: true })
            for (const e of g.events) if (e.type === 'crash') hit = { t, why: e.why }
            g.events.length = 0
        }
        ok(hit && hit.t === 2 && hit.why === 'contact', `slamming a crawling rival did not wipe the rider out (${JSON.stringify(hit)})`)
    }
    // jolt: a faster rival catching the player's back swerves at t8 (v x ~0.55)
    {
        const { g, q } = rig(1.6, -40, 5, 0)
        let hit = null
        for (let t = 1; t <= 30 && !hit; t++) {
            step(g, {})
            for (const e of g.events) if (e.type === 'jolt') hit = { t, name: e.name, rv: +q.v.toFixed(2) }
            g.events.length = 0
        }
        ok(hit && hit.t === 9 && hit.rv < 3, `the catching rival did not swerve (${JSON.stringify(hit)}) — run-over theatre`)
    }
    // flyby pays ONCE per airborne pass (hover across the zone: one event)
    {
        const { g } = rig(2, 8, 2, 0, 20)
        let n = 0
        for (let t = 1; t <= 30; t++) {
            g.v = 2
            step(g, {})
            g.alt = groundY(track(0).ground, g.x) + 20; g.air = true
            for (const e of g.events) if (e.type === 'flyby') n++
            g.events.length = 0
        }
        ok(n === 1 && g.score === 150, `hovering across a rider paid ${n} flybys (${g.score} pts) — the once-per-pass law is dead`)
    }
    // a ground pass at pace is exactly ONE rub (cooldown) — never a spam, and never silent
    {
        const { g } = rig(6, 30, 5, 0)
        let n = 0
        for (let t = 1; t <= 40; t++) {
            step(g, { g: true })
            n += g.events.filter((e) => ['bump', 'flyby', 'jolt', 'crash'].includes(e.type)).length
            g.events.length = 0
        }
        ok(n === 1, `a ground pass made ${n} contact events, want exactly one rub per pass`)
    }
    // determinism: replay the campaign scripts twice — same contact receipts
    {
        const a = JSON.stringify(contactRuns[0].map((h) => [h.t, h.type, h.name]))
        const b = JSON.stringify(replayContact(0).map((h) => [h.t, h.type, h.name]))
        ok(a === b, 'contact receipts are not deterministic — attract lies')
    }
}

// ---------------------------------------------------------- pack (#2420) ----
section('PACK (the league is solid to itself — receipts exact, #2420)')
{
    // Rival-vs-rival contact: the same body law the player pays, mirrored
    // onto the pack. Chain wrecks (the tail rides into a body it inherits),
    // hazard hops (skill decides who reads the body early enough to fly it),
    // bump momentum both ways, a blocked lane that HOLDS, one drama per pair,
    // and one master switch (packK) that ghosts it all away. The MOTOCROSS
    // campaign carries the organic proof (CRASH LEAGUE pins the chains); the
    // rigs below fire each rule at an exact tick on the flat start straight.
    const rig2 = (chaserName, gap0, down = 400, vd = 0) => {
        const g = makeGame(0, { count: 0 })
        const tr = track(0)
        const v = g.rivals.find((r) => r.name === 'GORDON')
        const c = g.rivals.find((r) => r.name === chaserName)
        v.d = 150; v.down = down; v.v = vd; v.alt = groundY(tr.ground, 150); v.air = false; v.cool = 0; v.tk = 0
        c.d = 150 - gap0; c.v = 5; c.alt = groundY(tr.ground, c.d); c.air = false; c.cool = 0; c.tk = 0; c.down = 0
        return { g, v, c }
    }
    // skill gradient, same rig: KATO (0.92) reads the wreck at 39px and flies
    // it clean; IVAN (0.52) commits at 29px, arrives nose-low, and chains.
    {
        const { g, v, c } = rig2('KATO', 70)
        const hits = []
        for (let t = 1; t <= 40; t++) {
            c.v = 5.0
            step(g, {})
            for (const e of g.events) if (['rhop', 'rcrash', 'rbump'].includes(e.type) && (e.name === 'KATO' || e.a === 'KATO' || e.b === 'KATO')) hits.push(`${t}:${e.type}${e.why ? e.why : ''}`)
            g.events.length = 0
        }
        ok(hits.length === 1 && hits[0] === '8:rhop' && c.d > v.d,
            `the front office did not clear the wreck cleanly (${JSON.stringify(hits)}, d ${c.d.toFixed(0)} vs ${v.d.toFixed(0)}) — hazard hops are not a skill yet`)
    }
    {
        const { g, v, c } = rig2('IVAN', 70)
        const hits = []
        for (let t = 1; t <= 20; t++) {
            c.v = 5.0
            step(g, {})
            for (const e of g.events) if (['rhop', 'rcrash'].includes(e.type)) hits.push(`${t}:${e.type}${e.why ? e.why : ''}`)
            g.events.length = 0
        }
        ok(hits.join(',') === '10:rhop,12:rcrashwreck',
            `the tail rider did not chain behind the body (${JSON.stringify(hits)}) — the pack ghosts or overpunishes`)
        ok(c.d < v.d, 'the chained rider ended up THROUGH the body — solidity is theatre')
    }
    // determinism: the same rigs replay to the same chain beats
    {
        const beats = () => {
            const out = []
            for (const n of ['KATO', 'IVAN']) {
                const { g, c } = rig2(n, 70)
                for (let t = 1; t <= 40; t++) {
                    c.v = 5.0
                    step(g, {})
                    for (const e of g.events) if (['rhop', 'rcrash'].includes(e.type)) out.push(n + t + e.type)
                    g.events.length = 0
                }
            }
            return out.join(',')
        }
        ok(beats() === beats(), 'pack receipts are not deterministic — attract lies')
    }
    // rbump: closing at 2.2 over a riding back transfers momentum BOTH ways
    {
        const { g, v, c } = rig2('IVAN', 30, 0, 3.6)
        let hit = null
        for (let t = 1; t <= 20 && !hit; t++) {
            v.v = 3.6
            const cv0 = c.v, vv0 = v.v, vd0 = v.d
            c.v = v.v + 2.2
            step(g, {})
            for (const e of g.events) if (e.type === 'rbump') hit = { t, a: e.a, b: e.b, cv: e.cv, lost: +(cv0 - c.v).toFixed(2), gain: +(v.v - vv0).toFixed(2), shove: +(v.d - vd0 - v.v).toFixed(0) }
            g.events.length = 0
            v.v = 3.6
        }
        ok(hit && hit.a === 'IVAN' && hit.b === 'GORDON' && hit.cv > 1.6 && hit.cv < 3.4,
            `closing on a riding back did not bump as scripted (${JSON.stringify(hit)})`)
        ok(hit && hit.lost > 0.5 && hit.gain > 0.3 && hit.shove === 3,
            `the pack bump moved no one (${JSON.stringify(hit)}) — two-way transfer is theatre`)
    }
    // a body met AT the box wipes the rider (too late to hop): wreck on:GORDON t1
    {
        const { g, v, c } = rig2('IVAN', 12)
        let hit = null
        for (let t = 1; t <= 20 && !hit; t++) {
            c.v = 5
            step(g, {})
            for (const e of g.events) if (e.type === 'rcrash') hit = { t, why: e.why, on: e.on }
            g.events.length = 0
        }
        ok(hit && hit.t === 1 && hit.why === 'wreck' && hit.on === 'GORDON',
            `slamming a body at v5 was not a chain-wreck (${JSON.stringify(hit)})`)
    }
    // slamming a RIDING back over the crash line: contact wipeout at t1
    {
        const { g, v, c } = rig2('IVAN', 12, 0, 1.5)
        let hit = null
        for (let t = 1; t <= 20 && !hit; t++) {
            v.v = 1.5; c.v = 5.6
            step(g, {})
            for (const e of g.events) if (e.type === 'rcrash') hit = { t, why: e.why, on: e.on }
            g.events.length = 0
        }
        ok(hit && hit.t === 1 && hit.why === 'contact' && hit.on === 'GORDON',
            `slamming a crawling rival's back did not go over the bars (${JSON.stringify(hit)})`)
    }
    // the blocked lane HOLDS: a rolling stop waits BEHIND the body (never
    // creeping through it), and when the rider remounts the held bike drives
    // on around the empty space
    {
        const { g, c } = rig2('IVAN', 12.5, 20)   // body walks back at t20
        c.v = 0.2                                       // rolling stop, well under wreckV
        let held = 0, crash0 = 0
        for (let t = 1; t <= 80; t++) {
            step(g, {})
            if (c.held > 0) held++
            crash0 += g.events.filter((e) => e.type === 'rcrash').length
            g.events.length = 0
        }
        ok(held > 10 && crash0 === 0,
            `a rolling stop at a body neither held nor waited (held=${held}, crashes=${crash0}) — the lane is not blocked`)
        ok(c.held === 0 && c.v > 1, `the held bike never released after the wreck cleared (held=${c.held}, v ${c.v.toFixed(2)}) — the latch is a parking brake`)
    }
    // one drama per pair: after IVAN's chain, reviving both and re-closing on
    // the SAME pair pays nothing until the 90-tick cooldown expires
    {
        const { g, v, c } = rig2('IVAN', 12)
        let n = 0
        for (let t = 1; t <= 20; t++) {
            c.v = 5
            if (t > 12) { c.down = 0; c.cool = 0; v.down = 400 }   // both revived, still paired
            step(g, {})
            n += g.events.filter((e) => ['rcrash', 'rbump'].includes(e.type)).length
            g.events.length = 0
        }
        ok(n === 1, `the same pair made ${n} dramas in 20 ticks, want 1 — the pack derby clause is dead`)
    }
    // bounded pack: the campaign stays a race, not a demolition derby.
    {
        const all = LEAGUE.flatMap((l) => l.crashes)
        ok(all.length <= 8, `the league fell ${all.length} times across both tracks — that is a derby, not a race`)
        ok(!all.some((c) => ['MARIO', 'KATO', 'GORDON'].includes(c.name)), 'the front office piled up — the skill gradient is broken')
    }
    // the master switch: contactK=0 must ghost the pack AND silence the reads
    {
        const before = []
        const after = []
        const probe = (sink) => {
            const { g, c } = rig2('IVAN', 70)
            for (let t = 1; t <= 20; t++) {
                c.v = 5.0
                step(g, {})
                for (const e of g.events) if (['rhop', 'rcrash', 'rbump'].includes(e.type)) sink.push(t + ':' + e.type)
                g.events.length = 0
            }
            return c.d
        }
        const d1 = probe(before)
        const save = CFG.contactK
        CFG.contactK = 0
        const d2 = probe(after)
        CFG.contactK = save
        ok(before.length === 2 && after.length === 0 && d2 > d1,
            `contactK did not switch the pack law off (${JSON.stringify(before)} -> ${JSON.stringify(after)}) — the switch is paint`)
    }
    // packK alone: ghost the pack, keep the player's law armed
    {
        const save = CFG.packK
        CFG.packK = 0
        const { g, c } = rig2('IVAN', 70)
        let n = 0
        for (let t = 1; t <= 20; t++) {
            c.v = 5.0
            step(g, {})
            n += g.events.filter((e) => ['rhop', 'rcrash', 'rbump'].includes(e.type)).length
            g.events.length = 0
        }
        CFG.packK = save
        ok(n === 0 && c.d > 150, `packK=0 still fired ${n} pack events / stopped the rider — the pack switch does not own its own law`)
    }
}

// ------------------------------------------------------- lane (#2457) ----
section('LANE (the axis is real — same-line law, cross-line draft, #2457)')
{
    const laneRig = (o = {}) => {
        const g = makeGame(0, { count: 0 })
        const tr = track(0)
        const q = g.rivals.find((r) => r.name === 'KATO')
        g.x = 2000; g.total = 2000
        g.alt = groundY(tr.ground, 2000) + (o.airAlt || 0)
        g.v = o.v ?? 5; g.onGround = !o.airAlt
        if (o.airAlt) { g.air = true; g.vy = o.vy ?? 0 }
        g.lane = o.lane ?? 0
        q.d = 2000 + (o.gap ?? 6); q.v = o.rv ?? 5; q.down = o.down ?? 0
        q.alt = groundY(tr.ground, q.d % LAP); q.cool = 0; q.tk = 0; q.lane = o.rLane ?? 0
        return { g, q }
    }
    const drain = (g) => { const n = g.events.length; g.events.length = 0; return n }
    // steering: full authority on the ground, half in the air, clamped to the track
    {
        const g = makeGame(0, { count: 0 }); g.v = 5
        for (let t = 1; t <= 10; t++) step(g, { l: true })
        ok(Math.abs(g.lane - 0.2) < 1e-9, `ground steering moved ${g.lane.toFixed(3)}, want 0.200`)
        for (let t = 1; t <= 60; t++) step(g, { l: true })
        ok(g.lane === 1, `steering ran past the far edge (lane ${g.lane}) — the track has no wall`)
        for (let t = 1; t <= 10; t++) step(g, { r: true })
        ok(Math.abs(g.lane - 0.8) < 1e-9, `steer-back moved to ${g.lane.toFixed(3)}, want 0.800`)
        const g2 = makeGame(0, { count: 0 }); g2.v = 5
        g2.air = true; g2.alt += 5; g2.vy = 1
        for (let t = 1; t <= 10; t++) step(g2, { l: true })
        ok(Math.abs(g2.lane - 0.08) < 1e-9, `air steering bit at ${g2.lane.toFixed(3)}, want half authority 0.080`)
    }
    // same-line rub: matched speed behind a riding back is contact now, not a
    // silent rank-steal — the player pays a scrape and the rival gets shoved.
    {
        const { g, q } = laneRig({ gap: 8, rv: 5 })
        let rub = null
        for (let t = 1; t <= 15 && !rub; t++) {
            const v0 = g.v
            step(g, {})
            const e = g.events.find((x) => x.type === 'rub')
            if (e) rub = { t, lost: +(v0 - g.v).toFixed(3), shove: +q.lane.toFixed(2) }
            drain(g)
        }
        ok(rub && rub.lost > 0.04, `the rub cost nothing (${JSON.stringify(rub)}) — the ghost is still free`)
        ok(rub && rub.shove >= 0.3, `the rubbed rival stayed in the way (lane ${rub && rub.shove}) — rub never opens a line`)
    }
    // cross-line twin of the exact same rig: SILENT. A pass on another line is
    // a clean draft — no rub, no bump, no phantom anything.
    {
        const { g } = laneRig({ gap: 8, rv: 5, lane: 0.5 })
        let n = 0
        for (let t = 1; t <= 15; t++) { step(g, {}); n += g.events.filter((e) => ['rub', 'bump', 'jolt', 'flyby', 'crash'].includes(e.type)).length; drain(g) }
        ok(n === 0, `a cross-line pass paid ${n} contact events — the lane gate does not own the law`)
    }
    // flyby only pays when you cross THEIR body, not the air beside it
    {
        const { g } = laneRig({ gap: 60, rv: 0, down: 40, airAlt: 20, vy: 0 })
        let hit = null
        for (let t = 1; t <= 30 && !hit; t++) {
            g.v = 5
            step(g, {})
            const e = g.events.find((x) => x.type === 'flyby')
            if (e) hit = { t, score: g.score }
            drain(g)
        }
        ok(hit && hit.t === 10 && hit.score === 150, `same-line air pass paid ${JSON.stringify(hit)}, want flyby@t10 150pts`)
        const c = laneRig({ gap: 60, rv: 0, down: 40, airAlt: 20, vy: 0, lane: 0.5 })
        let paid = 0
        for (let t = 1; t <= 30; t++) { c.g.v = 5; step(c.g, {}); paid += c.g.events.filter((e) => e.type === 'flyby').length; drain(c.g) }
        ok(paid === 0 && c.g.score === 0, `cross-line air paid ${paid} flybys — the award is not tied to the body`)
    }
    // a body blocks ITS line only: cross it and you ride on untouched
    {
        const { g } = laneRig({ gap: 60, rv: 0, down: 40, lane: 0.5 })
        let crashed = false
        for (let t = 1; t <= 30; t++) { step(g, { g: true }); if (g.crash > 0) crashed = true; drain(g) }
        ok(!crashed && g.total > 2060, `crossing a wreck on the far line still ate it (crash=${crashed}) — bodies do not own the whole track`)
    }
    // pack rub: two rivals, matched pace, same line — they separate LATERALLY.
    // The invariance twin (laneK=0) proves v and d never move, so the whole
    // CRASH LEAGUE receipt book is untouched by the axis.
    {
        const packRig = (laneK) => {
            const save = CFG.laneK
            CFG.laneK = laneK
            const g = makeGame(0, { count: 0 })
            const tr = track(0)
            const a = g.rivals.find((r) => r.name === 'IVAN')
            const b = g.rivals.find((r) => r.name === 'GORDON')
            b.d = 150; b.v = 4; b.alt = groundY(tr.ground, 150); b.down = 0; b.cool = 0
            a.d = 144; a.v = 4; a.alt = groundY(tr.ground, 144); a.down = 0; a.cool = 0
            const out = []
            let rubs = 0
            for (let t = 1; t <= 24; t++) {
                a.v = 4; b.v = 4                      // hold the pair pace-matched (the ghost band)
                step(g, {})
                rubs += g.events.filter((e) => e.type === 'rrub').length
                out.push(`${b.d.toFixed(4)}`)
                drain(g)
            }
            CFG.laneK = save
            return { trace: out.join('|'), rubs, lane: b.lane }
        }
        const on = packRig(1), off = packRig(0)
        ok(on.rubs >= 1 && off.rubs === 0, `pack rub fired ${on.rubs} with the axis on, ${off.rubs} off — the switch does not own it`)
        ok(on.trace === off.trace, 'pack rub moved a rival along the TRACK — the axis must be lateral-only (league receipts!)')
        ok(on.lane >= 0.3, `the pack never separated (lane ${on.lane.toFixed(2)}) — rrub is theatre`)
    }
    // byte-identity: MOTOCROSS never touches the axis — the pinned 5-flyby
    // showcase rides line 0 exactly as it did before the axis existed
    {
        const g = makeGame(0, {})
        let rubs = 0, maxLane = 0
        for (let k = 0; k < runs[0].r.script.length; k++) {
            step(g, runs[0].r.script[k])
            rubs += g.events.filter((e) => e.type === 'rub' || e.type === 'rrub').length
            maxLane = Math.max(maxLane, g.lane, ...g.rivals.map((r) => r.lane))
            drain(g)
        }
        ok(rubs === 0 && maxLane === 0, `MOTOCROSS engaged the axis (rubs ${rubs}, maxLane ${maxLane.toFixed(2)}) — the opt-in purity broke`)
    }
    // master switch: laneK=0 — the script's steering inputs go nowhere
    {
        const save = CFG.laneK
        CFG.laneK = 0
        const g = makeGame(0, { count: 0 }); g.v = 5
        for (let t = 1; t <= 20; t++) step(g, { l: true, g: true })
        const pure = g.lane === 0
        CFG.laneK = save
        ok(pure, 'laneK=0 still steered — the master switch is paint')
    }
}

// ------------------------------------------------ bargain (#2460 item 1) ----
section('BARGAIN (the pack contests your line — #2460)')
{
    const bargRig = (o = {}) => {
        const g = makeGame(0, { count: 0 })
        const tr = track(0)
        const q = g.rivals.find((r) => r.name === 'KATO')
        g.x = 2000; g.total = 2000
        g.alt = groundY(tr.ground, 2000); g.v = o.v ?? 5
        g.lane = o.lane ?? 0.5
        q.d = 2000 - (o.behind ?? 30); q.v = o.rv ?? 5; q.down = 0; q.cool = 0; q.tk = 0
        q.alt = groundY(tr.ground, ((q.d % LAP) + LAP) % LAP); q.lane = 0
        // keep the pair firmly on the ground: the duel law deliberately rests
        // while riders fly (no line changes in the air), so pins hold BOTH
        // wheels down to probe the law itself, not the air cadence.
        const pin = () => {
            g.air = false; g.vy = 0; g.alt = groundY(tr.ground, g.x)
            q.air = false; q.vy = 0; q.alt = groundY(tr.ground, ((q.d % LAP) + LAP) % LAP)
        }
        return { g, q, pin }
    }
    // the contest: a matched-speed rider behind, you settle onto the far line
    // — KATO LATCHES (a bargain event) and walks onto your line, stopping AT
    // it. He stays ~20px back (outside the body box) so the mirror is honest
    // pack-craft, not contact theatre.
    {
        const { g, q, pin } = bargRig({})
        let engaged = false, mono = true, prev = 0
        for (let t = 1; t <= 70; t++) {
            g.v = 5; q.v = 5; pin()
            step(g, {})
            if (g.events.some((e) => e.type === 'bargain' && e.name === 'KATO')) engaged = true
            if (q.lane < prev - 1e-12) mono = false
            prev = q.lane
            g.events.length = 0
        }
        ok(engaged, 'no rival ever contested the far line — the pack still holds its lines (#2460)')
        ok(mono && q.lane === 0.5, `the bargainer reached ${q.lane.toFixed(3)} (monotone ${mono}), want the mirror parked exactly on line 0.500`)
        ok(q.lane <= 0.5 + 1e-12, 'the bargainer crossed past the player line — mirroring, not cutting off')
    }
    // fairness: out-pace the duel and the line is yours — a 0.5/5 pair never
    // latches (|relV| > the rub band), so no new contact physics is invented.
    {
        const { g, q } = bargRig({ v: 5.5 })
        let n = 0
        for (let t = 1; t <= 40; t++) {
            g.v = 5.5; q.v = 5
            step(g, {})
            n += g.events.filter((e) => e.type === 'bargain').length
            g.events.length = 0
        }
        ok(n === 0 && q.lane === 0, `a faster pass got contested anyway (${n} bargains, lane ${q.lane.toFixed(2)}) — bargaining must be speed-matched only`)
    }
    // hazard refusal: a downed body inside KATO's read window outranks your
    // line — ground before lines. (The body sits at gap 30 of a react ~39.)
    {
        const { g, q, pin } = bargRig({})
        const iv = g.rivals.find((r) => r.name === 'IVAN')
        iv.d = q.d + 30; iv.alt = groundY(track(0).ground, ((iv.d % LAP) + LAP) % LAP); iv.down = 60; iv.v = 0; iv.cool = 0
        let n = 0, moved = 0
        for (let t = 1; t <= 3; t++) {     // gaps 30→24.8→19.6 all inside [hazMin, react]
            g.v = 5; q.v = 5; pin()
            step(g, {})
            n += g.events.filter((e) => e.type === 'bargain').length
            moved = Math.max(moved, q.lane)
            g.events.length = 0
        }
        ok(n === 0 && moved === 0, `a rider contested while reading a wreck (${n} bargains, lane ${moved.toFixed(2)}) — hazard reads must outrank line choice`)
    }
    // release + cooldown: bring your line back and the duel is over; the
    // released rider cools on its own line (bargCool) before it dares again.
    {
        const { g, q, pin } = bargRig({})
        for (let t = 1; t <= 20; t++) { g.v = 5; q.v = 5; pin(); step(g, {}); g.events.length = 0 }
        const peak = q.lane
        ok(peak > 0.05, `no mirror after 20 matched ticks (${peak.toFixed(3)}) — the engage side of the duel is dead`)
        for (let t = 1; t <= 2; t++) { g.lane = 0; g.v = 5; q.v = 5; pin(); step(g, {}); g.events.length = 0 }
        let n2 = 0
        for (let t = 1; t <= 40; t++) {
            g.lane = 0.5; g.v = 5; q.v = 5; pin()
            step(g, {})
            n2 += g.events.filter((e) => e.type === 'bargain').length
            g.events.length = 0
        }
        ok(n2 === 0 && q.lane < peak, `a released rival re-latched immediately (${n2} bargains, lane ${q.lane.toFixed(3)}) — the cooldown is paint`)
    }
    // skill grades the contest: MARIO crowds you hard, IVAN rides his line.
    {
        const g = makeGame(0, { count: 0 })
        const tr = track(0)
        const m = g.rivals.find((r) => r.name === 'MARIO')
        const iv = g.rivals.find((r) => r.name === 'IVAN')
        g.x = 2000; g.total = 2000; g.alt = groundY(tr.ground, 2000); g.v = 5; g.lane = 0.5
        m.d = 1970; m.v = 5; m.alt = groundY(tr.ground, 1970); m.lane = 0; m.cool = 0
        iv.d = 1940; iv.v = 5; iv.alt = groundY(tr.ground, 1940); iv.lane = 0; iv.cool = 0
        for (let t = 1; t <= 30; t++) {
            g.v = 5; m.v = 5; iv.v = 5
            g.air = false; g.vy = 0; g.alt = groundY(tr.ground, g.x)
            m.air = false; m.vy = 0; m.alt = groundY(tr.ground, m.d % LAP)
            iv.air = false; iv.vy = 0; iv.alt = groundY(tr.ground, iv.d % LAP)
            step(g, {}); g.events.length = 0
        }
        ok(m.lane > 0.1 && iv.lane > 0.04 && m.lane > iv.lane * 1.3,
            `skill did not grade the contest (MARIO ${m.lane.toFixed(3)} vs IVAN ${iv.lane.toFixed(3)}) — every rider bargains the same`)
    }
    // receipts: the duel is LATERAL ONLY — the same rig with bargK=0 must
    // leave every v, d and score byte-for-byte where the CRASH LEAGUE left it.
    {
        const traceOf = (bargK) => {
            const save = CFG.bargK
            CFG.bargK = bargK
            const { g, q, pin } = bargRig({})
            const out = []
            for (let t = 1; t <= 60; t++) { pin(); step(g, {}); out.push(`${q.d.toFixed(6)}|${q.v.toFixed(6)}|${g.total.toFixed(6)}|${g.score}`); g.events.length = 0 }
            CFG.bargK = save
            return out.join('_')
        }
        ok(traceOf(1) === traceOf(0), 'bargaining moved v or d — the CRASH LEAGUE receipts must not feel the duel')
    }
}

// ------------------------------------------------------- rules the game promised ----
section('RULES THE CARTRIDGE PROMISED')
{
    // the water hole stalls a slow bike — and pumping walks it out
    {
        const tr = track(0)
        const g = makeGame(0, { count: 0 })
        // park it slow, right at the water
        const wb0 = tr.bands.find((b) => b[0] === WATER)
        g.x = wb0[1] + 20
        g.alt = groundY(tr.ground, g.x); g.v = 2.0; g.stall = 0
        let sawStall = false
        for (let t = 0; t < 200 && !sawStall; t++) { step(g, { g: true }); sawStall = g.events.some((e) => e.type === 'stall'); g.events.length = 0 }
        ok(sawStall, 'a slow bike in the water did not stall — the water hole is a rumble strip')
        const g2 = makeGame(0, { count: 0 })
        const wband = tr.bands.find((b) => b[0] === WATER)
        g2.x = wband[1] + 20; g2.alt = groundY(tr.ground, g2.x); g2.stall = 1
        let out = false
        for (let t = 0; t < 300 && !out; t++) { step(g2, { j: t % 2 === 0 }); out = g2.events.some((e) => e.type === 'unstall'); g2.events.length = 0 }
        ok(out, 'pumping never walked the bike out of a stall — mash is theatre')
    }
    // the mud bleeds speed when coasting (the pump kick is what fights it)
    {
        const tr = track(0)
        const m = tr.bands.find((b) => b[0] === MUD)
        const g = makeGame(0, { count: 0 })
        g.x = m[1] + 10; g.alt = groundY(tr.ground, g.x); g.v = 5
        let worse = 0
        for (let t = 0; t < 80; t++) {
            if (g.x > m[1] + 4 || g.x < m[0]) { g.x = m[1]; g.alt = groundY(tr.ground, g.x) }
            const v0 = g.v; step(g, {})   // coast: mud drag has no gas to fight
            if (g.v < v0 - 0.001) worse++
            g.events.length = 0
        }
        ok(worse > 40, `mud did not bleed speed while coasting (only ${worse}/80 ticks) — mud is floor polish`)
    }
    // boost sets speed AND is a floor (slower than it, faster is kept). The
    // assertion names a concrete number, NOT CFG.boostV — reading the constant
    // the mutant edits is a circular check (boostV=0 made `v >= boostV` true
    // for a bike that never launched).
    {
        const g = makeGame(0, { count: 0 })
        g.v = 3; g.boostAt = -1e6
        g.x = 3950; g.alt = groundY(track(0).ground, 3950)
        step(g, { g: true })
        ok(g.v >= 6, `a boost only nudged to ${g.v.toFixed(2)} — the arrows did not launch the bike`)
    }
    // the wet skip: holding gas over water at a run does NOT stall it
    {
        const tr = track(0)
        const w = tr.bands.find((b) => b[0] === WATER)
        const g = makeGame(0, { count: 0 })
        g.v = 5.4
        let clean = true
        for (let t = 0; t < 200 && clean; t++) {
            // keep it pinned to the water band with throttle (real bike would
            // coast through; we re-pin altitude so the probe isolates stall)
            if (g.x > w[1] - 240 && g.x < w[0]) { g.x = w[1] - 30; g.alt = groundY(tr.ground, g.x) }
            step(g, { g: true })
            if (g.stall > 0 || g.events.some((e) => e.type === 'stall')) clean = false
            g.events.length = 0
        }
        ok(clean, 'a fast charging bike stalled in the water — the skip was removed')
    }
    // the third side of lean: a CORRECTLY levelled landing must survive. The
    // crash-only probes can't see a threshold so tight it punishes good
    // riders — this is the one that can fail by being too strict.
    {
        const clean = () => {
            const g = makeGame(0, { count: 0 }); g.v = 5
            g.x = 1000; g.alt = groundY(track(0).ground, 1000) + 26
            g.air = true; g.vy = -1; g.pitch = 0; g.jumpT = 0
            for (let k = 0; k < 60 && g.air; k++) step(g, {})
            return g.crash === 0 && !g.end
        }
        ok(clean(), 'a level, neutral landing on ordinary ground crashes the rider — lean thresholds punish good play')
    }
    // lean both ways is a real crash surface (rolling the sim to a nose-low landing)
    {
        let sawForward = 0, sawBack = 0
        const g = makeGame(0, { count: 0 })
        g.v = 6
        for (let t = 0; t < 12000 && (sawForward < 1 || sawBack < 1); t++) {
            g.x = (t * 6) % (LAP - 200); g.alt = groundY(track(0).ground, g.x) + 40
            g.air = true; g.vy = 1; g.jumpT = 0
            const dir = sawForward < 1 ? { d: true } : { u: true }
            for (let k = 0; k < 120; k++) {
                step(g, dir)
                if (g.crash > 0) { if (g.crashWhy === 'forward') sawForward++; else if (g.crashWhy === 'backward') sawBack++; break }
                if (g.end) break
            }
            g.events.length = 0
        }
        ok(sawForward > 0, 'nose-down landings never crashed — the forward wipeout (and the lean-back skill) is gone')
        ok(sawBack > 0, 'nose-up over-rotations never crashed — the endo/backflip skill is gone')
    }
    // the step must be top-able: a WOT rider who taps on the ramp reaches the deck
    {
        const tr = track(0)
        const g = makeGame(0, { count: 0 })
        g.v = 6
        let topped = false
        for (let t = 0; t < 1200 && !topped; t++) {
            step(g, { g: true, j: g.x > 2600 && g.x < 2640 })
            if (g.x > 2760 && g.x < 2900 && g.alt > 124 && g.crash === 0) topped = true
            if (g.crash > 0) { g.crash = 0; g.stall = 0; g.v = 6 }
            g.events.length = 0
        }
        ok(topped, 'a WOT rider over the up-step never reached the deck — the step is a wall, not a jump')
    }
    // clock counts down and ends the game
    {
        const g = makeGame(0, { count: 0 })
        g.clock = 2
        let ended = ''
        for (let t = 0; t < 200 && !ended; t++) { step(g, {}); ended = g.end || ''; g.events.length = 0 }
        ok(ended === 'time', 'the clock never ran the bike out of time — the countdown is a decoration')
    }
    // DebugKit's decide() actually answers (never throws, always names a lever)
    {
        const g = makeGame(0, {})
        step(g, { g: true })
        const d = decide(g, { pump: 0 })
        ok(d && ('g' in d), 'decide() gave no throttle verdict')
    }
}

// ------------------------------------------------------------ mutations ----
if (MUT) {
    section('MUTATIONS — each MUST turn an honest check red')
    const probeBoost = () => {
        const g = makeGame(0, { count: 0 }); g.v = 3; g.boostAt = -1e6
        g.x = 3950; g.alt = groundY(track(0).ground, 3950)
        step(g, { g: true })
        return g.v >= 6
    }
    const probeStall = () => {
        const tr = track(0); const w = tr.bands.find((b) => b[0] === WATER)
        const g = makeGame(0, { count: 0 })
        g.x = w[1] + 20; g.alt = groundY(tr.ground, g.x); g.v = 2.0
        for (let t = 0; t < 200; t++) { step(g, { g: true }); if (g.events.some((e) => e.type === 'stall')) return true; g.events.length = 0 }
        return false
    }
    const probeHeat = () => {
        const g = makeGame(0, { count: 0 })
        for (let t = 0; t < 3000; t++) { step(g, { g: true }); if (g.events.some((e) => e.type === 'overheat')) return true; g.events.length = 0 }
        return false
    }
    const probeCrash = () => {
        const g = makeGame(0, { count: 0 }); g.v = 6
        for (let t = 0; t < 4000; t++) {
            g.x = (t * 6) % (LAP - 200); g.alt = groundY(track(0).ground, g.x) + 40; g.air = true; g.vy = 1; g.jumpT = 0
            for (let k = 0; k < 120; k++) { step(g, { d: true }); if (g.crash > 0) return true; if (g.end) break }
            g.events.length = 0
        }
        return false
    }
    const probeBack = () => {
        const g = makeGame(0, { count: 0 }); g.v = 6
        for (let t = 0; t < 4000; t++) {
            g.x = (t * 6) % (LAP - 200); g.alt = groundY(track(0).ground, g.x) + 40; g.air = true; g.vy = 1; g.jumpT = 0
            for (let k = 0; k < 120; k++) { step(g, { u: true }); if (g.crash > 0) return true; if (g.end) break }
            g.events.length = 0
        }
        return false
    }
    const tryMut = (name, apply, probe, expect = true) => {        const base = probe()
        ok(base === expect, `mutation harness broken: baseline for '${name}' is ${base}, expected ${expect}`)
        const save = apply()
        const v = probe()
        for (const k of Object.keys(save)) CFG[k] = save[k]
        console.log(`  mut ${name}: ${v === expect ? 'SURVIVED (BAD)' : 'caught by the audit'}`)
        ok(v !== expect, `${name} SURVIVED — a check stopped touching this rule`)
    }
    const flat = (patch) => () => { const s = {}; for (const k of Object.keys(patch)) { s[k] = CFG[k]; CFG[k] = patch[k] } return s }
    tryMut('boostV=0 (arrows are paint)', flat({ boostV: 0 }), probeBoost)
    tryMut('waterStall=0 (the hole never bites)', flat({ waterStall: 0 }), probeStall)
    tryMut('heatBoil=inf (engine is immortal)', flat({ heatBoil: 1e9 }), probeHeat)
    tryMut('landFwd=inf (nose-down landings are free)', flat({ landFwd: 1e9 }), probeCrash)
    // NB no "tight thresholds" mutant: the in-air stabilizer (pitch eases to
    // the landing slope with no input) makes an over-tight envelope an
    // EQUIVALENT mutant — it never punishes a stabilizing rider. The
    // clean-land check in RULES is the real guard on that path.
    tryMut('mudDrag=0 (water/mud is just road)', flat({ mudDrag: 0, waterDrag: 0 }), () => {
        // hold a bike IN the water, coasting (no gas, no pump). With drag the
        // hole bleeds it under the stall floor; with drag gone it coasts on.
        const tr = track(0); const w = tr.bands.find((b) => b[0] === WATER)
        const mid = (w[1] + w[2]) / 2
        const g = makeGame(0, { count: 0 }); g.v = 3; g.x = mid; g.alt = groundY(tr.ground, mid)
        let clean = true
        for (let t = 0; t < 120; t++) {
            g.x = mid; g.alt = groundY(tr.ground, mid)   // keep it soaked
            step(g, {})
            if (g.stall > 0 || g.events.some((e) => e.type === 'stall')) { clean = false; break }
            g.events.length = 0
        }
        return clean   // drag present => stalls => clean=false; drag gone => true
    }, false)
    tryMut('brake=inf (the bike cannot slow — no skip, all stall)', flat({ brake: 9 }), () => {
        // the lever brake owns is DECELERATION. From a run, braking must take a
        // real, readable distance to stop (not one brick-wall tick). A bike
        // that cannot feather the gas into the water cannot choose to skip it.
        const g = makeGame(1, { count: 0 }); g.x = 100; g.alt = groundY(track(1).ground, 100); g.v = 6
        let ticks = 0
        for (let t = 0; t < 400 && g.v > 0.2; t++) { step(g, { b: true }); ticks++; g.events.length = 0 }
        return ticks >= 18   // a real brake takes >=18 ticks; brake=9 stops in 1
    })
    tryMut('crashMash=0 (mash will not walk it out)', flat({ crashMash: 0 }), () => {
        // the arcade contract: mashing A after a wipeout beats just waiting.
        // grade the DIFFERENTIAL — mash recovery vs coast recovery.
        const rec = (mash) => {
            const g = makeGame(0, { count: 0 }); g.crash = 100
            let t = 0
            while (g.crash > 0 && t < 600) { step(g, mash ? { j: t % 2 === 0 } : {}); t++; g.events.length = 0 }
            return t
        }
        return rec(true) < rec(false)
    })
    tryMut('landBack=1e9 (over-rotation is free)', flat({ landBack: 1e9 }), probeBack)
    tryMut('count=inf (the gate never lifts)', () => { const s = { count: CFG.count }; CFG.count = 1e9; return s }, () => {
        const g = makeGame(0, {})
        for (let t = 0; t < 400; t++) step(g, { g: true })
        return g.total > 1
    })
    // ---- crash-league mutants (#2384) — each edits one load-bearing law ----
    const replay0Crashes = () => {
        const g = makeGame(0, {})
        const hits = []
        for (let k = 0; k < LEAGUE[0].script.length; k++) {
            step(g, LEAGUE[0].script[k])
            for (const e of g.events) if (e.type === 'rcrash') hits.push({ name: e.name, d: g.rivals.find((x) => x.name === e.name).d, k })
            g.events.length = 0
        }
        return { hits }
    }
    tryMut('rivalDown=0 (a wipeout costs no ground)', flat({ rivalDown: 0 }), () => {
        const { hits } = replay0Crashes()
        if (!hits.length) return false
        const c = hits[0]
        const st = makeGame(0, {})
        for (let k = 0; k <= c.k + 150 && k < LEAGUE[0].script.length; k++) { step(st, LEAGUE[0].script[k]); st.events.length = 0 }
        return st.rivals.find((x) => x.name === c.name).d - c.d < 250   // baseline: frozen + slow remount
    })
    tryMut('rivalTolMul=9 (the league is crash-proof)', flat({ rivalTolMul: 9 }), () => replay0Crashes().hits.length === 4)
    tryMut('rivalTolMul=0.2 (even the front office falls)', flat({ rivalTolMul: 0.2 }), () => {
        for (const { i, script } of LEAGUE) {
            const g = makeGame(i, {})
            for (let k = 0; k < script.length; k++) {
                step(g, script[k])
                if (g.events.some((e) => e.type === 'rcrash' && ['MARIO', 'KATO', 'GORDON'].includes(e.name))) return false
                g.events.length = 0
            }
        }
        return true
    })
    // ---- contact mutants (#2391) — each edits one load-bearing clause ----
    const rigMut = (v, gap, rv, down, airAlt) => {
        const g = makeGame(0, { count: 0 })
        const q = g.rivals.find((r) => r.name === 'KATO')
        g.x = 2000; g.total = 2000
        g.alt = groundY(track(0).ground, 2000) + (airAlt || 0)
        g.v = v; g.onGround = !airAlt
        q.d = 2000 + gap; q.v = rv; q.down = down
        q.alt = groundY(track(0).ground, q.d % LAP); q.cool = 0
        return { g, q }
    }
    const probeWreck = () => {
        const { g } = rigMut(5, 60, 0, 40)
        for (let t = 1; t <= 30; t++) {
            step(g, { g: true })
            if (g.events.some((e) => e.type === 'crash' && e.why === 'wreck')) return true
            g.events.length = 0
        }
        return false
    }
    const probeFlyPts = () => {
        const { g } = rigMut(5, 60, 0, 40, 20)
        for (let t = 1; t <= 30; t++) {
            g.v = 5
            step(g, {})
            if (g.events.some((e) => e.type === 'flyby') && g.score >= 150) return true
            g.events.length = 0
        }
        return false
    }
    tryMut('contactK=0 (the whole contact law is paint — wrecks)', flat({ contactK: 0 }), probeWreck)
    tryMut('contactK=0 (the whole contact law is paint — flyby pay)', flat({ contactK: 0 }), probeFlyPts)
    tryMut('wreckV=9 (you can ride through a downed rider)', flat({ wreckV: 9 }), probeWreck)
    tryMut('contactSwap=0 (the bump moves no one)', flat({ contactSwap: 0 }), () => {
        const { g } = rigMut(6, 24, 2, 0)
        for (let t = 1; t <= 30; t++) {
            const v0 = g.v
            step(g, { g: true })
            if (g.events.some((e) => e.type === 'bump')) return v0 - g.v > 0.8
            g.events.length = 0
        }
        return false
    })
    tryMut('contactCrash=9 (slamming a back is free)', flat({ contactCrash: 9 }), () => {
        const { g } = rigMut(6, 20, 0.2, 0)
        for (let t = 1; t <= 30; t++) {
            step(g, { g: true })
            if (g.events.some((e) => e.type === 'crash' && e.why === 'contact')) return true
            if (g.events.some((e) => e.type === 'bump')) return false
            g.events.length = 0
        }
        return false
    })
    tryMut('contactCool=0 (one pass, many drams)', flat({ contactCool: 0 }), () => {
        const { g } = rigMut(6, 30, 5, 0)
        let n = 0
        for (let t = 1; t <= 40; t++) {
            step(g, { g: true })
            n += g.events.filter((e) => ['bump', 'jolt', 'flyby'].includes(e.type)).length
            g.events.length = 0
        }
        return n === 1
    })
    // ---- pack mutants (#2420) — each edits one load-bearing clause ----
    const rig2m = (chaserName, gap0, down = 400, vd = 0) => {
        const g = makeGame(0, { count: 0 })
        const tr = track(0)
        const v = g.rivals.find((r) => r.name === 'GORDON')
        const c = g.rivals.find((r) => r.name === chaserName)
        v.d = 150; v.down = down; v.v = vd; v.alt = groundY(tr.ground, 150); v.air = false; v.cool = 0; v.tk = 0
        c.d = 150 - gap0; c.v = 5; c.alt = groundY(tr.ground, c.d); c.air = false; c.cool = 0; c.tk = 0; c.down = 0
        return { g, v, c }
    }
    const chaseHits = (name, n = 20) => {
        const { g, c } = rig2m(name, 70)
        let hits = 0
        for (let t = 1; t <= n; t++) {
            c.v = 5.0
            step(g, {})
            hits += g.events.filter((e) => ['rhop', 'rcrash', 'rbump'].includes(e.type)).length
            g.events.length = 0
        }
        return hits
    }
    tryMut('packK=0 (the pack is paint)', flat({ packK: 0 }), () => chaseHits('IVAN') === 2)
    tryMut('haz reads off (no line choice — the front office chains too)', flat({ hazBase: 0, hazSkill: 0 }), () => {
        const { g, v, c } = rig2m('KATO', 70)
        let hopped = false, crashed = false
        for (let t = 1; t <= 40; t++) {
            c.v = 5.0
            step(g, {})
            for (const e of g.events) { if (e.type === 'rhop') hopped = true; if (e.type === 'rcrash') crashed = true }
            g.events.length = 0
        }
        return hopped && !crashed && c.d > v.d
    })
    tryMut('contactSwap=0 (the pack bump moves no one)', flat({ contactSwap: 0 }), () => {
        const { g, v, c } = rig2m('IVAN', 30, 0, 3.6)
        for (let t = 1; t <= 20; t++) {
            v.v = 3.6
            c.v = v.v + 2.2
            const cv0 = c.v
            step(g, {})
            const e = g.events.find((x) => x.type === 'rbump')
            g.events.length = 0
            v.v = 3.6
            if (e) return cv0 - c.v > 0.5
        }
        return false
    })
    tryMut('wreckV=9 (a downed rival cannot chain the pack)', flat({ wreckV: 9 }), () => chaseHits('IVAN') === 2)
    // ---- lane mutants (#2457) — each edits one load-bearing clause ----
    const laneRigM = (o = {}) => {
        const g = makeGame(0, { count: 0 })
        const tr = track(0)
        const q = g.rivals.find((r) => r.name === 'KATO')
        g.x = 2000; g.total = 2000
        g.alt = groundY(tr.ground, 2000); g.v = o.v ?? 5
        g.lane = o.lane ?? 0
        q.d = 2000 + (o.gap ?? 8); q.v = o.rv ?? 5; q.down = o.down ?? 0
        q.alt = groundY(tr.ground, q.d % LAP); q.cool = 0; q.tk = 0; q.lane = o.rLane ?? 0
        return { g, q }
    }
    const probeSteer = () => {
        const g = makeGame(0, { count: 0 }); g.v = 5
        for (let t = 1; t <= 10; t++) step(g, { l: true })
        return g.lane > 0.15
    }
    const probeCrossSilent = () => {
        const { g } = laneRigM({ gap: 8, rv: 5, lane: 0.5 })
        let n = 0
        for (let t = 1; t <= 15; t++) { step(g, {}); n += g.events.filter((e) => ['rub', 'bump', 'jolt', 'flyby', 'crash'].includes(e.type)).length; g.events.length = 0 }
        return n === 0
    }
    const probeScrape = () => {
        const { g } = laneRigM({ gap: 8, rv: 5 })
        for (let t = 1; t <= 15; t++) {
            const v0 = g.v
            step(g, {})
            if (g.events.some((e) => e.type === 'rub')) return v0 - g.v > 0.04   // concrete number, not CFG
            g.events.length = 0
        }
        return false
    }
    const probeRubFires = () => {
        const { g } = laneRigM({ gap: 8, rv: 5 })
        for (let t = 1; t <= 15; t++) {
            step(g, {})
            if (g.events.some((e) => e.type === 'rub')) return true
            g.events.length = 0
        }
        return false
    }
    tryMut('laneRate=0 (steering is paint)', flat({ laneRate: 0 }), probeSteer)
    tryMut('laneTouch=9 (lines collapse — cross-line passes pay again)', flat({ laneTouch: 9 }), probeCrossSilent)
    tryMut('laneScrape=0 (the rub costs nothing — ghost reborn)', flat({ laneScrape: 0 }), probeScrape)
    tryMut('laneK=0 (the axis switch is paint)', flat({ laneK: 0 }), probeRubFires)
    tryMut('laneW=0 (rub never opens a line)', flat({ laneW: 0 }), () => {
        const { g, q } = laneRigM({ gap: 8, rv: 5 })
        for (let t = 1; t <= 15; t++) {
            step(g, {})
            if (g.events.some((e) => e.type === 'rub')) return q.lane >= 0.3
            g.events.length = 0
        }
        return false
    })
    tryMut('laneHome=1 (a shoved rival snaps home instantly — re-rubs forever)', flat({ laneHome: 1 }), () => {
        const { g } = laneRigM({ gap: 8, rv: 5 })
        let rubs = 0
        for (let t = 1; t <= 60; t++) {
            step(g, {})
            rubs += g.events.filter((e) => e.type === 'rub').length
            g.events.length = 0
        }
        return rubs === 1   // baseline: one bite, then the shove has them abreast; snaps-home: bites per rubCool
    })
    // ---- bargain mutants (#2460) — each edits one load-bearing clause ----
    const bargRigM = (o = {}) => {
        const g = makeGame(0, { count: 0 })
        const tr = track(0)
        const q = g.rivals.find((r) => r.name === 'KATO')
        g.x = 2000; g.total = 2000
        g.alt = groundY(tr.ground, 2000); g.v = o.v ?? 5
        g.lane = o.lane ?? 0.5
        q.d = 2000 - (o.behind ?? 30); q.v = o.rv ?? 5; q.down = 0; q.cool = 0; q.tk = 0
        q.alt = groundY(tr.ground, ((q.d % LAP) + LAP) % LAP); q.lane = 0
        const pin = () => {
            g.air = false; g.vy = 0; g.alt = groundY(tr.ground, g.x)
            q.air = false; q.vy = 0; q.alt = groundY(tr.ground, ((q.d % LAP) + LAP) % LAP)
        }
        return { g, q, pin }
    }
    const probeBargain = () => {
        const { g, q, pin } = bargRigM({})
        let eng = false
        for (let t = 1; t <= 70; t++) {
            g.v = 5; q.v = 5; pin()
            step(g, {})
            if (g.events.some((e) => e.type === 'bargain' && e.name === 'KATO')) eng = true
            g.events.length = 0
        }
        return eng && q.lane === 0.5
    }
    const probeHazStays = () => {
        const { g, q, pin } = bargRigM({})
        const iv = g.rivals.find((r) => r.name === 'IVAN')
        iv.d = q.d + 30; iv.alt = groundY(track(0).ground, ((iv.d % LAP) + LAP) % LAP); iv.down = 60; iv.v = 0; iv.cool = 0
        let moved = 0
        for (let t = 1; t <= 3; t++) { g.v = 5; q.v = 5; pin(); step(g, {}); moved = Math.max(moved, q.lane); g.events.length = 0 }
        return moved === 0
    }
    tryMut('bargK=0 (the pack never bargains — #2460)', flat({ bargK: 0 }), probeBargain)
    tryMut('bargRate=0 (bargaining is theatre)', flat({ bargRate: 0 }), probeBargain)
    tryMut('bargRange=0 (blind to your gap)', flat({ bargRange: 0 }), probeBargain)
    tryMut('bargain ignores hazard reads (lines outrank ground)', flat({ hazBase: 0, hazSkill: 0 }), probeHazStays)
    // ---- graded-pack mutant (#2642) — PACE lives on its own knob ----
    {
        const crowdedS = [...Array(11)].map((_, k) => ({ kind: ['WHOOPS', 'MUD', 'WATER', 'BOOST'][k % 4], x: 120 + k * 340 }))
        const probeGrade = () => {
            const cl = buildTrack(compileCustom([{ kind: 'BOOST', x: 900 }])).pace
            const cr = buildTrack(compileCustom(crowdedS)).pace
            return cr <= cl / 3   // honest law: crowded refunds most of the grade
        }
        const honest = probeGrade()
        ok(honest, 'mutation harness broken: baseline crowded-vs-clean grade does not hold')
        const k0 = PACE.K; PACE.K = 0
        const survived = probeGrade()
        PACE.K = k0
        console.log(`  mut paceK=0 (grade ignores terrain): ${survived ? 'SURVIVED (BAD)' : 'caught by the audit'}`)
        ok(!survived, 'paceK=0 SURVIVED — the graded-pack law stopped touching terrain')
    }
}

// ---------------------------------------------------------------- edit ----
section('EDIT TRACK (a course is data: the compiler, the law, the grown roster, #2576)')
{
    const fpG = (g) => { let s = 0; for (let x = 0; x < g.length; x++) s += Math.round(g[x] * 100); return s }
    const A = [
        { kind: 'RAMP', x: 1200 }, { kind: 'WHOOPS', x: 2000 }, { kind: 'MUD', x: 2600 },
        { kind: 'BOOST', x: 3200 }, { kind: 'WATER', x: 3800 }, { kind: 'STEP', x: 4400 },
    ]
    const B = [
        { kind: 'RAMP', x: 840 }, { kind: 'WHOOPS', x: 1400 }, { kind: 'WATER', x: 1800 },
        { kind: 'BOOST', x: 2200 }, { kind: 'MUD', x: 2600 }, { kind: 'RAMP', x: 3000 },
        { kind: 'STEP', x: 3600 }, { kind: 'BOOST', x: 4200 }, { kind: 'WHOOPS', x: 4800 },
        { kind: 'WATER', x: 5200 }, { kind: 'MUD', x: 5600 },
    ]
    const da = buildTrack(compileCustom(A))
    const db = buildTrack(compileCustom(B))
    const auditA = auditCustomData(da, groundY); const auditB = auditCustomData(db, groundY)
    ok(auditA.ok, `reference draft A refused: ${auditA.why}`)
    ok(auditB.ok, `reference draft B (11 stamps) refused: ${auditB.why}`)

    // determinism: the compiler is a pure fold over sorted stamps
    ok(fpG(da.ground) === fpG(buildTrack(compileCustom(A)).ground), 'compiling the same draft twice gave different ground')
    ok(fpG(da.ground) === fpG(buildTrack(compileCustom([...A].reverse())).ground), 'stamp ORDER changed the compiled course')

    // stamps are REAL geometry, not bands: each kind must show up in the ground
    const rampStep = da.steps.find((s) => s.x >= 1200 && s.x <= 1680)
    ok(rampStep && rampStep.rise >= 44 && rampStep.grade > 0.28, `RAMP did not carve a clearable step (steps ${JSON.stringify(da.steps)})`)
    const stepStep = da.steps.find((s) => s.x >= 4400 && s.x <= 4860)
    ok(stepStep && stepStep.rise >= 40, 'STEP did not carve its deck crest')
    let wmin = 1e9, wmax = -1e9
    for (let x = 2000; x <= 2260; x++) { const h = groundY(da.ground, x); wmin = Math.min(wmin, h); wmax = Math.max(wmax, h) }
    ok(wmax - wmin >= 10, `WHOOPS stamped no real bumps (range ${(wmax - wmin).toFixed(1)})`)
    ok(groundY(da.ground, 3900) < groundY(da.ground, 3700) - 10, 'WATER sits on flat ground — the bowl is theatre')
    ok(Math.abs(groundY(da.ground, 100) - 96) < 3 && fpG(da.ground) !== fpG(buildTrack(compileCustom([])).ground), 'the untouched lap moved under the stamps')

    // refusals: each illegal draft must be refused BY NAME
    const refuse = (stamps, want) => {
        const r = auditCustomData(buildTrack(compileCustom(stamps)), groundY)
        ok(!r.ok && (!want || r.why === want), `illegal draft gave ${JSON.stringify(r)} (want refusal ${want || 'of any kind'})`)
    }
    refuse([], 'DRAW SOMETHING FIRST')
    refuse([{ kind: 'RAMP', x: 1200 }, { kind: 'STEP', x: 1400 }], 'OBSTACLES OVERLAP')
    refuse([{ kind: 'RAMP', x: EDGE - 40 }], 'KEEP CLEAR OF THE START LINE')
    refuse([{ kind: 'BOOST', x: 6200 }], null) // eats the closing cp / hangs off the lap — seam or band law must catch it
    ok(SPAN.BOOST + 6200 > LAP - EDGE, 'the past-edge probe is no longer past the edge — retune it')

    // the live-cursor law agrees with the SAVE law (one law, two readers)
    let placed = []
    for (const st of A) { ok(fitsAt(placed, st.kind, st.x), `editor cursor would have refused stamp ${st.kind}@${st.x} that the audit accepts`); placed.push(st) }
    ok(!fitsAt(placed, 'STEP', 1400), 'cursor fits an overlapping stamp the audit refuses')
    ok(!fitsAt(placed, 'RAMP', 40), 'cursor fits a stamp inside the seam margin')
    ok(stampAt(placed, 2100) === 1, 'ERASE points at the wrong stamp')

    // storage codec: round-trips, and garbage is an empty shelf
    const enc = encodeCustom([{ name: 'CUSTOM', stamps: A.map((s) => [s.kind, s.x]) }, { name: 'WILDPARK', stamps: B.map((s) => [s.kind, s.x]) }])
    const dec = decodeCustom(enc)
    ok(dec.length === 2 && dec[1].name === 'WILDPARK' && JSON.stringify(dec[0].stamps) === JSON.stringify(A.map((s) => [s.kind, s.x])), 'codec round-trip lost or renamed a course')
    ok(!decodeCustom('{oops').length && !decodeCustom('[{"stamps":[["NOPE",100]]}]').length && !decodeCustom('{"a":1}').length && !decodeCustom(null).length, 'codec let garbage through')
    ok(typeof CUSTOM_KEY === 'string' && CUSTOM_MAX === 3 && STAMP_KINDS.length === 6, 'the editor contract (key/slots/vocabulary) moved')

    // the roster grows, the shipped six stay carved stone
    const pinsBefore = [...Array(TRACK_COUNT)].map((_, i) => fpG(track(i).ground))
    const i6 = registerCustom(da, 0); const i7 = registerCustom(db, 1)
    ok(i6 === 6 && i7 === 7 && customCount() === 2, `customs must register at 6/7, got ${i6}/${i7} (count ${customCount()})`)
    ok(track(6).name === 'CUSTOM' && track(7).name === 'CUSTOM' && track(6).bite === 7, 'customs do not present as CUSTOM grade-7 rides')
    ok(pinsBefore.every((p, i) => p === fpG(track(i).ground)), 'REGISTERING CUSTOMS MOVED A SHIPPED COURSE')
    ok(nextSel(8, 1, 9) === 0 && nextSel(0, -1, 9) === 8, 'the splash cursor must wrap the grown roster (6 + 2 customs + EDIT)')
    ok(nextSel(5, 1) === 0 && nextSel(0, -1) === 6 - 1 && TRACK_COUNT === 6, 'the shipped n=6 cursor law moved')
    const dB = buildTrack(compileCustom([{ kind: 'RAMP', x: 5600 }, { kind: 'BOOST', x: 1000 }]))
    ok(registerCustom(dB, 1) === 7 && customCount() === 2 && fpG(track(7).ground) === fpG(dB.ground), 'resaving slot 1 must replace, not stack')
    ok(registerCustom(dB, customCount() + 1) === -1, 'a hole is not a legal slot')

    // a saved custom is RIDABLE by the same engine: WOT never dies stuck, the
    // run is deterministic, and both reference drafts finish their two laps.
    for (const [i, label] of [[6, 'draft A'], [7, 'draft B']] ) {
        const g = makeGame(i, { count: 0 })
        let maxStuck = 0, stuck = 0
        for (let t = 0; t < 9000 && !g.end; t++) {
            step(g, { g: true })
            if (g.crash > 0 || g.stall > 0) stuck++; else stuck = 0
            maxStuck = Math.max(maxStuck, stuck); g.events.length = 0
        }
        ok(maxStuck < 400 && g.lap >= 2 && g.end, `${label} at WOT: ${g.end ?? 'unfinished'} lap ${g.lap}, maxStuck ${maxStuck} — a custom the throttle alone cannot finish is not saveable`)
        const h = makeGame(i, { count: 0 })
        for (let t = 0; t < 2000 && !h.end; t++) { step(h, { g: true }); h.events.length = 0 }
        const h2 = makeGame(i, { count: 0 })
        for (let t = 0; t < 2000 && !h2.end; t++) { step(h2, { g: true }); h2.events.length = 0 }
        ok(stateHash(h) === stateHash(h2), `${label}: the custom ride is not deterministic`)
    }
}

// ---------------------------------------------------------------- test ride ----
section('TEST RIDE (the bay seats an unsaved draft — TRANSIENT, #2587)')
{
    const fpG = (g) => { let s = 0; for (let x = 0; x < g.length; x++) s += Math.round(g[x] * 100); return s }
    // the same reference draft the EDIT block uses (CACHE keeps its slots —
    // registration is process state, the names here are block-scoped)
    const A = [
        { kind: 'RAMP', x: 1200 }, { kind: 'WHOOPS', x: 2000 }, { kind: 'MUD', x: 2600 },
        { kind: 'BOOST', x: 3200 }, { kind: 'WATER', x: 3800 }, { kind: 'STEP', x: 4400 },
    ]
    const da = buildTrack(compileCustom(A))
    ok(TRANSIENT === -1, 'TRANSIENT must stay -1 (the seat alias the shell hands makeGame)')
    // #2625 re-recorded with LAP: the LAW (not just the numbers) — TEST/LAP sit
    // before the verbs, EXIT stays last, and the backward wrap from the first
    // stamp still lands on EXIT.
    ok(TOOLS.indexOf('TEST') === 6 && TOOLS.indexOf('LAP') === 7 && TOOLS.indexOf('ERASE') === 8 && TOOLS.indexOf('NAME') === 9 && TOOLS.indexOf('SAVE') === 10 && TOOLS[TOOLS.length - 1] === 'EXIT' && TOOLS.length === 12, 'the TEST/LAP/NAME tools must sit before the verbs — the strip wrap pins depend on it (#2651 grew the strip to 12)')
    ok(nextSel(0, -1, TOOLS.length) === TOOLS.length - 1 && nextSel(TOOLS.length - 1, 1, TOOLS.length) === 0, 'the tool strip wrap moved — first stamp back must reach EXIT, forward from EXIT must reach RAMP')

    // with the bay not seated, track(-1) is the plain roster wrap it always was
    ok(fpG(track(TRANSIENT).ground) === fpG(track(customCount() + TRACK_COUNT - 1).ground), 'track(-1) stopped wrapping the roster when no test is seated')

    // refusal before seating: ONE legality law — the blank draft refuses by
    // name here exactly as SAVE refuses it, so the shell never seats a phantom
    ok(!auditCustomData(buildTrack(compileCustom([])), groundY).ok, 'a blank draft passed the law the bay must refuse with')

    // seat draft A (registered above at slot 0): the TRANSIENT course is
    // byte-identical to what SAVE would store — TEST compiles, never re-shapes
    setTestTrack(da)
    ok(hasTestTrack() && track(TRANSIENT) === da, 'the seated draft is not what track(TRANSIENT) returns')
    ok(fpG(track(TRANSIENT).ground) === fpG(da.ground), 'the test course differs from the compiled draft — TEST is not riding SAVE data')

    // it RIDES: one lap, real sim, rivals on real pace, deterministic
    const rideT = (hash) => {
        const g = makeGame(TRANSIENT, { count: 0, laps: 1 })
        let stuck = 0, maxStuck = 0
        for (let t = 0; t < 9000 && !g.end; t++) {
            step(g, { g: true })
            if (g.crash > 0 || g.stall > 0) stuck++; else stuck = 0
            maxStuck = Math.max(maxStuck, stuck); g.events.length = 0
        }
        if (hash) return { h: stateHash(g), g }
        return { g, maxStuck }
    }
    const gT = makeGame(TRANSIENT, { count: 0, laps: 1 })
    ok(gT.track === TRANSIENT && gT.laps === 1, `a test seat must be TRANSIENT for one lap (track ${gT.track}, laps ${gT.laps})`)
    const runA = rideT()
    ok(runA.g.end === 'win' && runA.g.lap >= 1 && runA.maxStuck < 400, `draft A at WOT on a TEST lap: ${runA.g.end ?? 'unfinished'} lap ${runA.g.lap} maxStuck ${runA.maxStuck}`)
    ok(runA.g.rivals.every((r) => r.d > 1000), 'rivals did not ride the test terrain (pace lines blind to TRANSIENT?)')
    const d1 = rideT(true), d2 = rideT(true)
    ok(d1.h === d2.h, 'the TEST lap is not deterministic — the same draft cannot be re-tested fairly')

    // the roster never saw it: the phantom is not CACHE's guest
    ok(customCount() === 2 && fpG(track(6).ground) === fpG(da.ground) && fpG(track(7).ground) === fpG(track(customCount() + TRACK_COUNT - 1).ground), 'the test seat leaked into the roster')

    // clearing returns the alias to the plain wrap
    clearTestTrack()
    ok(!hasTestTrack() && fpG(track(TRANSIENT).ground) === fpG(track(7).ground), 'after clearing, track(-1) must return to the roster wrap')
}

// ---------------------------------------------------------------- own exit ----
section('OWN EXIT (your track gives you back — ownTerrain, #2603)')
{
    const fpG = (g) => { let s = 0; for (let x = 0; x < g.length; x++) s += Math.round(g[x] * 100); return s }
    // THE LAW, one line: the league commits, your terrain gives you back.
    for (let i = 0; i < TRACK_COUNT; i++) ok(!ownTerrain(i), `league track ${i + 1} counts as own terrain — the bay exit would leak into the league`)
    ok(ownTerrain(TRANSIENT), 'the bay TEST draft is not own terrain — TEST lost its exit')
    const c0 = customCount() // the EDIT block registered its two reference drafts
    ok(c0 === 2, `expected the 2 reference customs seated from the EDIT block, got ${c0}`)
    for (let k = 0; k < c0; k++) ok(ownTerrain(TRACK_COUNT + k), `registered custom slot ${k + 1} is not own terrain — a saved design lost its exit`)
    ok(!ownTerrain(TRACK_COUNT + c0), 'an unregistered slot counts as own terrain (roster density lies)')
    ok(!ownTerrain(TRACK_COUNT + c0 + 5) && !ownTerrain(-2), 'indices outside the roster must not be own terrain')
    // a seated ride reports its index — ownTerrain reads gs.track
    ok(makeGame(TRACK_COUNT + 1, { count: 0 }).track === TRACK_COUNT + 1, 'a seated custom ride does not report its roster index')

    // RELOAD LAW: the bay redraws exactly what you rode. Abandoning reads the
    // seated entry's own `stamps` (the compile output rides inside it) and
    // recompiles — byte-identical terrain, no storage round trip, no
    // reinterpretation. What you edit is what you rode.
    for (let k = 0; k < c0; k++) {
        const i = TRACK_COUNT + k
        const seated = track(i)
        const st = (seated.stamps || []).map(([kind, x]) => ({ kind, x }))
        ok(st.length > 0, `custom ${k + 1}: the seated entry carries no stamps — the bay reload would open blank on a ridden course`)
        const re = buildTrack(compileCustom(st, seated.name))
        ok(fpG(re.ground) === fpG(seated.ground), `bay reload ${k + 1}: terrain differs from the seated custom — Esc loads a different course`)
        ok(JSON.stringify(re.cps) === JSON.stringify(seated.cps), `bay reload ${k + 1}: control points moved through the round trip`)
        ok(JSON.stringify(re.bands) === JSON.stringify(seated.bands), `bay reload ${k + 1}: feature bands moved through the round trip`)
        ok(JSON.stringify(re.stamps) === JSON.stringify(seated.stamps), `bay reload ${k + 1}: stamps moved (sort/shape law broken)`)
        ok(auditCustomData(re, groundY).ok === auditCustomData(seated, groundY).ok, `bay reload ${k + 1}: audit answers differently for the reload than for the seated course`)
    }
    // reload never re-registers: no phantom row, the roster stays as density says
    ok(customCount() === c0, 'the reload path registered a phantom custom')

    // abandoning submits nothing: the ONLY writer of the leaderboard is the
    // shell's finish(), reached only when the sim ends inside screen `play` —
    // the sim module itself must stay free of persistence (a sim that booked
    // scores at abandon would forge the league from a walk-out).
    ok(!/localStorage|excitebike\.board/.test(
        readFileSync(new URL('../src/games/Excitebike/sim.js', import.meta.url), 'utf8') +
        readFileSync(new URL('../src/games/Excitebike/levels.js', import.meta.url), 'utf8')
    ), 'the pure sim/levels layer touches the leaderboard — abandon-submits-nothing is no longer structural')
}

// ---------------------------------------------------------------- your laps ----
section('YOUR LAPS (the designer sets the race length — #2625 stage 1)')
{
    const src = readFileSync(new URL('../src/games/Excitebike/index.jsx', import.meta.url), 'utf8')
    const D = [{ kind: 'RAMP', x: 1200 }, { kind: 'BOOST', x: 2400 }, { kind: 'STEP', x: 3400 }]

    // THE LAW: a custom runs the laps ITS DESIGNER chose; the league keeps the
    // two-lap book. 1–8 offered, house default 2 — every design saved before
    // this law deviates by nothing.
    ok(LAPS_MIN === 1 && LAPS_MAX === 8 && LAPS_DEFAULT === 2, `the lap book moved (min ${LAPS_MIN}, max ${LAPS_MAX}, default ${LAPS_DEFAULT})`)
    ok([1, 2, 3, 4, 5, 6, 7, 8].every((n) => lapsOf(n) === n), 'lapsOf refused a legal number — the designer lost a page of the book')
    ok([0, 9, -1, 1.5, '3', NaN, null, undefined, true].every((v) => lapsOf(v) === LAPS_DEFAULT), 'lapsOf must fall back to the house book for anything illegal, never invent a length')

    // config, not terrain: the compiler never hears about laps, so every ground/
    // cps/bands fingerprint from the EDIT block holds by construction.
    ok(!('laps' in compileCustom(D)), 'compileCustom output carries laps — laps are race config, not geometry')

    // engine contract: an explicit laps rides, an omitted laps is the book.
    ok(makeGame(0, { count: 0 }).laps === CFG.laps && makeGame(0, { count: 0, laps: 1 }).laps === 1 && makeGame(0, { count: 0, laps: 8 }).laps === 8, 'makeGame stopped honoring the laps option (or its default)')
    ok([...Array(TRACK_COUNT)].every((_, i) => makeGame(i, { gear: 'high' }).laps === 2), 'a league seat picked up a lap-count change — the league book is two, everywhere')

    // codec: round-trip the designer's number; old-format and garbage fall back,
    // they never drop the design.
    const enc = encodeCustom([{ name: 'RUSH', stamps: D.map((s) => [s.kind, s.x]), laps: 5 }])
    const dec = decodeCustom(enc)
    ok(dec.length === 1 && dec[0].laps === 5 && dec[0].name === 'RUSH', 'the codec lost the designer\'s number (or the name)')
    const legacy = decodeCustom('[{"name":"OLD","stamps":[["RAMP",1200]]}]')
    ok(legacy.length === 1 && legacy[0].laps === LAPS_DEFAULT, 'a pre-#2625 saved design must decode on the house book, not vanish')
    const junk = decodeCustom('[{"name":"BAD","stamps":[["RAMP",1200]],"laps":9},{"name":"WORSE","stamps":[["RAMP",1200]],"laps":"few"}]')
    ok(junk.length === 2 && junk.every((e) => e.laps === LAPS_DEFAULT), 'a garbage laps value must fall back to the book — validated, never fatal')
    ok(JSON.parse(encodeCustom([{ name: 'X', stamps: [['RAMP', 1200]], laps: 99 }]))[0].laps === LAPS_DEFAULT, 'encode let an illegal laps value out')

    // seats carry laps: two copies of ONE draft, differing only in the designer's
    // number — the lengths they race are then provably different.
    const d1 = buildTrack(compileCustom(D)); d1.laps = 1
    const d3 = buildTrack(compileCustom(D)); d3.laps = 3
    ok(registerCustom(d1, 0) === 6 && registerCustom(d3, 1) === 7 && track(6).laps === 1 && track(7).laps === 3, 'registered customs lost their stored laps')
    ok(makeGame(6, { count: 0, laps: lapsOf(track(6).laps) }).laps === 1 && makeGame(7, { count: 0, laps: lapsOf(track(7).laps) }).laps === 3, 'the seat wiring (ownTerrain ? stored laps) does not deliver the designer\'s number to the engine')

    // the length is REAL: a 1-lap ride ends at the first line-cross, a 3-lap
    // ride is still racing long past it, and the same draft with no stored
    // deviation rides the book. Deterministic throughout — QA can re-run it.
    const wot = (i, laps) => {
        const g = makeGame(i, { count: 0, ...(laps ? { laps } : {}) })
        for (let t = 0; t < 9000 && !g.end; t++) { step(g, { g: true }); g.events.length = 0 }
        return g
    }
    const g1 = wot(6, lapsOf(track(6).laps)); const g3 = wot(7, lapsOf(track(7).laps)); const g2 = wot(6)
    ok(g1.end === 'win' && g1.lap >= 1 && g1.laps === 1, `the one-lap ride did not end at its line (${g1.end ?? 'unfinished'} lap ${g1.lap}/${g1.laps})`)
    ok(g3.end === 'win' && g3.lap >= 3 && g3.tick > g1.tick * 2, `the three-lap ride is not racing three times the distance (${g3.end ?? 'unfinished'} lap ${g3.lap}, ticks ${g3.tick} vs ${g1.tick})`)
    ok(g2.end === 'win' && g2.lap >= 2 && g2.tick > g1.tick && g2.tick < g3.tick, 'an unstored ride deviated from the two-lap book between the one- and three-lap rides')
    const hA = stateHash(wot(6, 1)); const hB = stateHash(wot(6, 1))
    ok(hA === hB, 'the laps-1 ride is not deterministic — the same design cannot be raced fairly twice')

    // source pins: the wiring the Node harness cannot drive directly (startPlay's
    // spread, save/hydrate/abandon, LAP-as-setting) is at least pinned by name —
    // exciteplay drives the keys themselves.
    ok(/ownTerrain\(trackIdx\) && t0 && t0\.laps/.test(src), 'startPlay stopped gating stored laps behind ownTerrain — the league could inherit a designer number')
    ok(/built\.laps = lapsOf\(draft\.laps\)/.test(src), 'saveDraft stopped storing the designer\'s number with the design')
    ok(/built\.laps = lapsOf\(e\.laps\)/.test(src), 'hydrate stopped restoring stored laps to the roster')
    ok(/draft\.laps = lapsOf\(t && t\.laps\)/.test(src), 'abandon no longer carries the number you rode back into the bay')
    ok(/if \(kind === 'LAP'\)/.test(src), 'the LAP tool lost its setting-branch — a cycle should never push a stamp')
}

// ---------------------------------------------------------------- graded pack ----
section('GRADED PACK (customs ride a graded pack — terrain-derived pace, #2642)')
{
    const D2 = [{ kind: 'RAMP', x: 1200 }, { kind: 'BOOST', x: 2400}, { kind: 'STEP', x: 3400 }]
    const clean = buildTrack(compileCustom([{ kind: 'BOOST', x: 900}]))
    const mk = (st) => buildTrack(compileCustom(st))
    const crowded = [...Array(11)].map((_, k) => ({ kind: ['WHOOPS', 'MUD', 'WATER', 'BOOST'][k % 4], x: 120 + k * 340 }))
    const slab = [...Array(12)].map((_, k) => ({ kind: 'WHOOPS', x: 120 + k * 340 }))

    // THE LAW: buildTrack grades the drawn course — H is what the terrain takes
    // from the pack (pace-line losses + whoop coverage) and the grade gives it
    // back, capped at #2573's measured ceiling.
    ok(PACE.CAP === 0.06, `the cap drifted from the measured ceiling (${PACE.CAP}) — +0.06 is where a taxed win survives`)
    ok(clean.pace === PACE.CAP, `a clean lap did not grade at the cap (${clean.pace}) — the pack should ride the ceiling where terrain costs nothing`)
    ok(Math.abs(mk(D2).pace - 0.0576) < 1e-9, `the reference draft re-graded (${mk(D2).pace}, want 0.0576) — deterministic grade drifted`)
    ok(buildTrack(compileCustom([{ kind: 'MUD', x: 1200 }])).pace < clean.pace, 'a mud pit did not cost the pack its grade — terrain is being ignored')

    // monotone: adding any obstacle to a draft never RAISES the grade.
    const mono = ['RAMP', 'STEP', 'WHOOPS', 'MUD', 'WATER'].every((kind) => mk([...D2, { kind, x: 4800 }]).pace <= mk(D2).pace)
    ok(mono, 'adding an obstacle raised a custom\'s pack grade — the law is not monotone in terrain')

    // range: every honest draft rides inside [0, cap].
    const range = [clean, mk(D2), mk(crowded), mk(slab)].every((t) => t.pace >= 0 && t.pace <= PACE.CAP)
    ok(range, 'a pack grade left the [0, cap] band — the measured ceiling or the floor broke')

    // crowded refunds the grade; a full whoop slab refunds it ALL (and is a
    // legal design — the packs get their baseline back exactly where the
    // terrain already fights the player hardest).
    ok(auditCustomData(mk(slab), groundY).ok, 'the whoop-slab draft became illegal — the slab law needs a real design')
    ok(mk(slab).pace === 0, `a full whoop slab graded ${mk(slab).pace}, want 0 — a crowded course must stay on the baseline pack`)
    const crowdedRef = mk(crowded).pace
    ok(Math.abs(crowdedRef - 0.0142) < 1e-9, `the crowded reference re-graded (${crowdedRef}, want 0.0142) — crowded drafts kept most of the cap and the determinism broke`)
    ok(crowdedRef <= clean.pace / 3, `a crowded draft kept ${crowdedRef} of ${clean.pace} — crowded courses still ride too fast`)

    // the league table outranks the grader: a table pace (including a true 0)
    // survives buildTrack — `??`, never `||`.
    ok(buildTrack({ ...compileCustom([{ kind: 'BOOST', x: 900}]), pace: 0 }).pace === 0, 'buildTrack overwrote a table pace of 0 — the league calibration would silently re-grade')

    // TRANSIENT drafts are graded too (TEST rides the same law SAVE will).
    setTestTrack(clean)
    ok(track(TRANSIENT).pace === PACE.CAP, 'the TEST seat rides ungraded — the bay previews a different pack than SAVE will race')
    clearTestTrack()

    // SEAT RECEIPT: the sim pays the grade exactly as #2573 pays the league —
    // PACK_TIER on the front ranks, tail untouched, ranks unshuffled.
    const crowd = mk(crowded)
    const slot = customCount()
    ok(registerCustom(crowd, slot) === TRACK_COUNT + slot, 'the graded custom did not register for the seat receipt')
    const gs = makeGame(TRACK_COUNT + slot, { count: 0 })
    const WANT = [5.30, 5.18, 5.05, 4.88, 4.66].map((b, j) => +(b + crowd.pace * [1, 2 / 3, 1 / 3, 0, 0][j]).toFixed(4))
    gs.rivals.forEach((r, j) => ok(Math.abs(r.base - WANT[j]) < 1e-9 && r.v === r.base,
        `graded seat ${r.name} base ${r.base}, want ${WANT[j]} (PACK_TIER × pace ${crowd.pace})`))
    ok(gs.rivals.every((r, j) => j === 0 || gs.rivals[j - 1].base > r.base), 'the grade reordered the pack — ranks must hold')

    // WINNABLE: a WOT ride of the crowded graded course finishes FIRST — the
    // grade never makes your own design unwinnable — and twice, identically.
    const wot = (i) => {
        const g = makeGame(i, { count: 0 })
        for (let t = 0; t < 9000 && !g.end; t++) { step(g, { g: true }); g.events.length = 0 }
        return g
    }
    const wr1 = wot(TRACK_COUNT + slot)
    ok(wr1.end === 'win', `a WOT ride could not win its own crowded course (${wr1.end ?? 'unfinished'}) — the grade made the design unbeatable`)
    ok(stateHash(wot(TRACK_COUNT + slot)) === stateHash(wr1), 'the graded ride is not deterministic — the same design cannot be raced fairly twice')

    // visible grammar: the splash row wears the grade (exciteplay drives the DOM).
    const sx = readFileSync(new URL('../src/games/Excitebike/index.jsx', import.meta.url), 'utf8')
    ok(/data-pack=\{PK\}/.test(sx) && /pack grade \$\{PK\} of 3/.test(sx), 'the splash stopped wearing the pack grade — customs lost their catalogue grammar')
}

// ---------------------------------------------------------------- attract seats ----
section('ATTRACT DESIGN (viewer seats + rotation — the marquee flies your garage, #2647)')
{
    const sx = readFileSync(new URL('../src/games/Excitebike/index.jsx', import.meta.url), 'utf8')

    // THE SEAT LAW, straight from the pure module the shell reads.
    ok(JSON.stringify(demoSeats(0)) === '[0]', 'no designs saved and the marquee lost MOTOCROSS — zero-custom attract must stay byte-honest')
    ok(JSON.stringify(demoSeats(3)) === '[0,1,2,3]', 'the seat rotation stopped being MOTOCROSS-then-designs-in-roster-order')
    ok(JSON.stringify(demoSeats(-2)) === '[0]', 'a negative design count grew the seat ladder')
    const seat3 = demoSeats(3)
    ok(demoSeatTrack(seat3[1], TRACK_COUNT) === TRACK_COUNT && demoSeatTrack(seat3[3], TRACK_COUNT) === TRACK_COUNT + 2, 'seat→track drifted off the roster (CUSTOM k rides TRACK_COUNT+k−1)')
    ok(demoSeatLabel(0) === 'MOTOCROSS' && demoSeatLabel(2) === 'CUSTOM 2', 'seat labels left the roster grammar (the badge must name what flies)')

    // A design's seat rides REAL terrain: register the reference draft, then
    // the seat's script is the SAME autopilot's honest one-lap — and twice,
    // identically. (One lap is the attract seat: the whole draft in a breath.)
    const ATTR = [{ kind: 'RAMP', x: 1200 }, { kind: 'WHOOPS', x: 2000 }, { kind: 'MUD', x: 2600 }, { kind: 'BOOST', x: 3200 }, { kind: 'WATER', x: 3800 }, { kind: 'STEP', x: 4400 }]
    const attrBuilt = buildTrack(compileCustom(ATTR, 'ATRACT'))
    ok(auditCustomData(attrBuilt, groundY).ok, 'the attract fixture draft refused — the fixture died before it was graded')
    const aSeat = registerCustom(attrBuilt, 0)
    ok(aSeat === TRACK_COUNT && track(aSeat).name === 'ATRACT', 'the fixture could not enter the roster as CUSTOM 1 — no seat to grade')
    const lapA = plan({ track: aSeat, laps: 1 })
    const lapB = plan({ track: aSeat, laps: 1 })
    ok(lapA.end === 'win', `the autopilot could not finish the design's lap (${lapA.end ?? 'unfinished'}) — the attract seat has no script to fly`)
    ok(lapA.ticks < 2000, `the attract one-lap ran ${lapA.ticks} ticks — laps:1 stopped reaching the seat's plan (the demo would marathon your design)`)
    ok(lapA.script.length === lapA.ticks, 'the attract script does not cover the seat it was planned for')
    ok(JSON.stringify(lapA.script) === JSON.stringify(lapB.script), 'the attract ride is not deterministic — the same design would fly different dirt each cycle')

    // The lazy cache keys on terrain IDENTITY: re-saving swaps CACHE's object,
    // so an identity miss re-plans and the demo never rides stale dirt.
    const attrBefore = track(aSeat)
    registerCustom(buildTrack(compileCustom(ATTR.map((s) => ({ ...s, x: s.x + 100 })), 'ATRACT v2')), 0)
    ok(track(aSeat) !== attrBefore && track(aSeat).name === 'ATRACT v2', 'a re-save stopped swapping the terrain object — an identity-keyed cache would replay stale dirt forever')

    // THE VIEWER LAW, source-pinned (exciteplay drives it with real frames).
    // Before this law the MOTOCROSS replay reached its finish at t2561 and
    // finish(true) wrote the BOT's score into excitebike.board, then the
    // marquee froze on the over screen until a key was touched.
    ok(/vsc === 'attract' \|\| vsc === 'tracks'/.test(sx), 'the viewer-seat guard left doSim — bot scores would land on the player’s leaderboard again')
    ok(sx.indexOf("vsc === 'attract'") < sx.indexOf("else finish(gs.end === 'win')"), 'the viewer guard no longer sits BEFORE finish() — a demo end could submit before the seat law sees it')
    ok(/demoSeq = \(demoSeq \+ 1\) % seats\.length/.test(sx), 'tickDemo stopped rotating the attract seat — saved designs are back to never entering the demo')
    ok(/if \(idx === 0\) return provenRun\(\)/.test(sx), 'MOTOCROSS stopped riding the memoized proven run — the zero-custom demo lost its byte-honesty')
    ok(/plan\(\{ track: idx, laps: 1 \}\)/.test(sx), 'attract seats no longer lazy-plan designs through the proven autopilot — the demo would fly scripts the engine never rolled')
    ok(/demoCache\.has\(t\)/.test(sx), 'the lazy-plan cache lost its terrain-identity key — re-saved designs would ride stale demos')
    ok(/data-demo-track/.test(sx) && /DEMO · \{demoTrack\}/.test(sx), 'the marquee stopped wearing the seat badge — the garage cannot see itself from across the room')
}

// ------------------------------------------------------------------- name rides ----
section('NAME RIDES THE NAME (letter wheel + badge grammar — your design is called by its own name, #2651)')
{
    const sx = readFileSync(new URL('../src/games/Excitebike/index.jsx', import.meta.url), 'utf8')

    // THE WHEEL — 27 glyphs, A opens it, space closes the loop; the cap is the
    // badge's budget (compileCustom slices 12).
    ok(NAME_WHEEL.length === 27 && NAME_WHEEL[0] === 'A' && NAME_WHEEL[NAME_WHEEL.length - 1] === ' ', 'the letter wheel lost a glyph — the pad law is A–Z + space, wrapping')
    ok(NAME_MAX === 12, 'the name cap moved off the bay grammar — badge and storage would disagree')
    ok(pushName('AB', 'C') === 'ABC' && pushName('', 'Z') === 'Z', 'the wheel commit stopped appending')
    ok(pushName('ABCDEFGHIJKL', 'X') === null, 'a thirteenth letter slipped past the cap — the marquee badge could grow past its budget')
    ok(popName('AB') === 'A' && popName('A') === '' && popName('') === '', 'DEL undercut the name — below empty is not a thing')

    // SAVE GRAMMAR: storage sees one shape (upper, collapsed, capped), and the
    // unnamed draft lands on the placeholder the badge fallback expects.
    ok(designName(' skate  park ') === 'SKATE PARK', 'the save grammar stopped uppercasing/collapsing — one name would render three ways')
    ok(designName('') === 'CUSTOM' && designName('   ') === 'CUSTOM' && designName(null) === 'CUSTOM', 'an unnamed draft stopped landing on CUSTOM — the attract fallback would see empty names')
    ok(designName('skateboardparkextra') === 'SKATEBOARDPA', 'the save-time cap moved — stored names would overflow the badge budget')

    // THE BADGE LAW, pure: MOTOCROSS untouchable; a real name rides; a
    // placeholder (or nothing) reads EXACTLY the old roster bytes.
    ok(demoSeatName(0, 'JUNK') === 'MOTOCROSS', 'a name leaked onto the MOTOCROSS seat — the byte-pinned course is never a design')
    ok(demoSeatName(1, 'SKATEPARK') === 'SKATEPARK', "the badge stopped riding the design's own name")
    ok(demoSeatName(3, ' skate  park ') === 'SKATE PARK', 'badge text skipped the collapse — raw roster noise would reach the marquee')
    ok(demoSeatName(2, 'CUSTOM 2') === 'CUSTOM 2' && demoSeatName(2, 'CUSTOM') === 'CUSTOM 2' && demoSeatName(2, '') === 'CUSTOM 2' && demoSeatName(2, null) === 'CUSTOM 2', 'the roster fallback moved — pre-naming saves must read exactly as before (#2647)')

    // end-to-end grammar: a named save seats as its name, and its attract seat
    // reads that name off the roster.
    const NL = [{ kind: 'RAMP', x: 1200 }, { kind: 'BOOST', x: 2400 }, { kind: 'MUD', x: 3200 }]
    const named = buildTrack(compileCustom(NL, designName('skate park')))
    ok(auditCustomData(named, groundY).ok, 'the naming fixture refused before it could be graded')
    ok(registerCustom(named, 0) === TRACK_COUNT, 'the named fixture could not enter the roster (slot 0)')
    ok(track(TRACK_COUNT).name === 'SKATE PARK', 'the seated track kept raw input as its name — the marquee would ride un-normalized dirt')
    ok(demoSeatName(1, track(TRACK_COUNT).name) === 'SKATE PARK', 'the seat badge and the stored name disagree — the marquee names a different dirt than the board holds')

    // SOURCE PINS — exciteplay drives these with real keys and real taps.
    ok(/TOOLS\[draft\.tool\] === 'NAME'/.test(sx), 'the arrows stopped steering the letter wheel on the NAME row')
    ok(/pushName\(draft\.name, NAME_WHEEL\[draft\.nameSel\]\)/.test(sx), 'the A/SPACE commit stopped riding the pure wheel helper — the cap law would live twice')
    ok(/e\.code === 'Backspace'/.test(sx) && /label: 'DEL', code: 'Backspace'/.test(sx), 'the pad lost its DEL button — phones cannot take a letter back')
    ok(/compileCustom\(draft\.stamps, designName\(draft\.name\)\)/.test(sx), 'saveDraft stopped storing the drafted name — the badge would never ride a real name')
    ok(/NAME_WHEEL\[draft\.nameSel\]/.test(sx), 'the bay stopped showing the naming line — the wheel would be blind')
    ok(/TOOLS\.length >= 12 \? 4 : 10/.test(sx) && /TOOLS\.length >= 12 \? 6 : 8/.test(sx), 'the tool strip stopped shrinking type/gutter — the verbs ran off the 256px canvas')
    ok(/data-demo-name=\{demoTrack\}/.test(sx), 'the badge stopped wearing the name in the DOM — prod cannot see it rides')
    ok(/demoSeatName\(seat, seat === 0 \? null :/.test(sx), 'tickDemo stopped asking the name law at the seat change — the badge is back to roster numbers')
    ok(/t\.name !== 'CUSTOM' \? t\.name : ''/.test(sx), 'abandon stopped carrying the name back to the bay — re-saving would silently rename the design')
}

// ---- #2632 YOUR-LAPS POLISH — the four view-layer tells graded as pure
// helpers (the page paints them; exciteplay drives them with real keys):
// the over screen announces the book, the LAP wheel tells at its ends, the
// splash badge has a phone-width form, and the first default-book SAVE
// teaches the LAP tool once per storage. ----
section('YOUR-LAPS POLISH (#2632): over-book line, book-end tells, compact badge, first-SAVE tip')
{
    ok(lapLabel(1) === '1 LAP' && lapLabel(5) === '5 LAPS', '#2632: a single lap must read "1 LAP", not "1 LAPS"')
    ok(overBookLabel(1, 5) === 'CUSTOM 1 · 5 LAPS', '#2632: the over screen no longer spells the book the way the body asks')
    ok(overBookLabel(1, LAPS_DEFAULT) === '', '#2632: a default-book run announced a book — the plain board line is byte law')
    ok(overBookLabel(0, 5) === '' && overBookLabel(-5, 5) === '', '#2632: a league seat (or a bogus one) must never wear the CUSTOM label')
    ok(lapCycle(2).laps === 3 && lapCycle(2).tell === null, '#2632: a mid-book LAP press changed rules (3 expected, no tell)')
    ok(lapCycle(7).laps === 8 && lapCycle(7).tell === 'top', '#2632: arriving at the top of the book stopped carrying the tell')
    ok(lapCycle(8).laps === 1 && lapCycle(8).tell === 'wrap', '#2632: the 8->1 wrap stopped carrying the tell (or the wheel itself moved)')
    ok(lapCycle(LAPS_MAX).tell === 'wrap' && lapCycle(LAPS_MIN).tell === null, '#2632: the tell misfires at the wrong end of the book')
    ok(badgeCompact(LAPS_DEFAULT) === '★' && badgeCompact(3) === '★ 3L', '#2632: compact badge grammar moved (default stays silent, deviation reads 3L)')
    ok(lapTipFor(LAPS_DEFAULT, false) === LAP_TIP, '#2632: the first default-book SAVE no longer teaches the LAP tool')
    ok(lapTipFor(LAPS_DEFAULT, true) === '' && lapTipFor(5, false) === '', '#2632: the LAP tip nagged again, or preached to a designer who already sets the length')
    ok(LAP_TIP === 'TIP: LAP SETS YOUR RACE LENGTH', '#2632: the tip line drifted from the issue body')

    // SOURCE PINS — the page must ride the helpers, not law them a second time.
    const sx = readFileSync(new URL('../src/games/Excitebike/index.jsx', import.meta.url), 'utf8')
    ok(/overBookLabel\(gs\.track - TRACK_COUNT \+ 1, gs\.laps\)/.test(sx), '#2632: finish() stopped asking the pure book law — the over line would law twice')
    ok(/const c = lapCycle\(draft\.laps\)/.test(sx), '#2632: the bay stopped cycling LAP through the pure wheel helper')
    ok(/draft\.flashCell = draft\.tool; draft\.flashT = 5/.test(sx), '#2632: the white flinch left the LAP bump at the ends of the book')
    ok(/lapTipFor\(draft\.laps, seenTip\)/.test(sx) && /LAP_TIP_KEY/.test(sx), '#2632: the first-SAVE tip stopped reading storage before it spoke')
    ok(/data-over-book=\{end\.book\}/.test(sx), '#2632: the over screen stopped wearing the book in the DOM — prod cannot see it rides')
    ok(/data-badge-compact=\{badgeCompact\(L\)\}/.test(sx), '#2632: the badge lost its compact phone form — the 375px row crowds the pack pips')
}

// ---- #2665 BAY STAMP AND KIND PALETTE ------------------------------------
// The bay owed two view laws (README honest gap: "a silhouette + colour bar,
// not the animated NES stamp cursor; palette labels are text"). The laws live
// in custom.js; these pins grade the laws AND the wiring that paints them.
section('BAY STAMP AND KIND PALETTE (#2665): bob law, splash cadence, colour-identity strip')
{
    const sx2 = readFileSync(new URL('../src/games/Excitebike/index.jsx', import.meta.url), 'utf8')
    ok(BOB_TICKS === 15, '#2665: the bay bob left the splash cadence (BOB_TICKS must stay 15 ticks = the svg 0.5s steps(1) beat at 60fps)')
    let vals = new Set()
    for (let v = 0; v <= 900; v++) vals.add(bikeBob(v))
    ok([...vals].sort().join(',') === '0,1', `#2665: bikeBob left its two frames (${[...vals].sort().join(',')}) — the NES stamp is A/B, not a glide`)
    ok(bikeBob(0) === 0 && bikeBob(BOB_TICKS - 1) === 0 && bikeBob(BOB_TICKS) === 1 && bikeBob(2 * BOB_TICKS) === 0,
        '#2665: the bob flipped off its boundaries (hold BOB_TICKS, flip once per period)')
    const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
    ok(/@keyframes bikebob/.test(css) && /bikebob 0\.5s steps\(1\)/.test(sx2) && BOB_TICKS * 2 / 60 === 0.5,
        '#2665: bay and splash no longer beat as one clock (splash bikebob 0.5s ↔ BOB_TICKS*2 frames @60)')
    const lawKinds = [...STAMP_KINDS, 'TEST', 'LAP', 'ERASE', 'SAVE', 'EXIT']
    ok(lawKinds.every((k) => /^#[0-9a-f]{6}$/i.test(KIND_COLOR[k] || '')), '#2665: a tool lost its kind colour (or took an alpha — the strip colour must read straight off the pixels)')
    ok(lawKinds.every((k) => toolLabelColor(k) === KIND_COLOR[k]) && toolLabelColor('NAME') === '#f8f8f8',
        '#2665: toolLabelColor stopped mirroring KIND_COLOR (or the NAME fallback fell over)')
    ok(lawKinds.every((k) => toolLabelColor(k).length === 7), '#2665: a label colour grew an alpha suffix — opaque is the pixel-proof law')
    ok(!/const KIND_COLOR = \{/.test(sx2), '#2665: a second KIND_COLOR appeared in the page — the palette identity law lives in custom.js, once')
    ok(/const by = Math\.round\(gy\) - bikeBob\(vclock\)/.test(sx2), '#2665: the bay stamp stopped seating on the surface and bobbing by the law')
    ok(/bayPaint\.cx = cx; bayPaint\.gy = gy; bayPaint\.on = kind !== 'ERASE'/.test(sx2), '#2665: the probe stopped taking the stamp paint-time receipt (cx/gy/on)')
    ok(/ctx\.fillStyle = toolLabelColor\(TOOLS\[i\]\)/.test(sx2) && !/rgba\(248,248,248,0\.5\)/.test(sx2),
        '#2665: grey chalk is back on the palette strip — labels wear their kind colour now (law once, from custom.js)')
}

console.log(`\nexcitecheck: ${pass}/${pass + fails.length} checks passed${fails.length ? `  — ${fails.length} FAILED` : '  — OK'}`)
fails.forEach((f) => console.log(`  FAIL  ${f}`))
process.exit(fails.length ? 1 : 0)
