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
import { makeGame, step, stateHash, CFG } from '../src/games/Excitebike/sim.js'
import { track, groundY, featureAt, LAP, MUD, WATER, BOOST } from '../src/games/Excitebike/levels.js'
import { plan, decide } from '../src/games/Excitebike/planner.js'

const MUT = process.argv.includes('--mutate')
let pass = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else fails.push(m) }
const section = (s) => console.log(`\x1b[1m${s}\x1b[0m`)

// ------------------------------------------------------------- terrain audit ----
section('TERRAIN (the course is projected, not trusted)')
{
    for (let i = 0; i < 2; i++) {
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
    for (let i = 0; i < 2; i++) {
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

// --------------------------------------------------- the campaign + the ledger ----
section('THE CAMPAIGN (the autopilot = the attract demo) + LEDGER')
const t0 = Date.now()
const runs = []
for (let i = 0; i < 2; i++) {
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
for (let i = 0; i < 2; i++) {
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
for (let i = 0; i < 2; i++) {
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
}

console.log(`\nexcitecheck: ${pass}/${pass + fails.length} checks passed${fails.length ? `  — ${fails.length} FAILED` : '  — OK'}`)
fails.forEach((f) => console.log(`  FAIL  ${f}`))
process.exit(fails.length ? 1 : 0)
