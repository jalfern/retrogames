// BOULDER DASH — cave construction. Caves are CARVED out of solid rock in code
// (the IronKeep / Lemmings lesson): every builder starts from a mountain of
// dirt with a steel shell, then opens chambers and sets gems, boulders and a
// firefly with named ops. `scripts/dashcheck.mjs` proves each cave with the real
// planner — it actually digs the route to the quota and the exit, with every
// hazard live — and asserts each level's `proves` token was really observed:
//
//   dig      the planned route chewed dirt to get anywhere (level 1)
//   fell     a boulder dropped under its own gravity this run (level 2)
//   roll     a falling rock levelled out off a ledge (level 2)
//   convert  a gem fell and gave up, turning to dirt (level 3)
//   fly,burn a firefly ignited and a chain spread — and steel contained it (4)
//   push     the digger shoved a push wall sideways one cell (level 5, #2411)
//   crush    a shoved wall destroyed the rock in its path (level 5)
//   amoeba   the slime wave grew into open space (level 5)
//   dissolve the wave took a diamond down with it (level 5)
//   gait     a two-phase head CORNERED at a wall, its children marching on (6, #2428)
//   pour     a dropping head claimed DOWN first — slime poured off its shelf (6)
//   vise     two waves claimed the same pass — the mirrored twins closed (6)
//   drift    the butterfly flapped in open ground on its own (8, #2453)
//   grab     the transport butterfly took a gem mid-flight (9, #2463)
//   ferryDrop the butterfly let its cargo go over a drop cell (9, #2463)
//
// Two construction rules keep an unattended CI gate honest:
//   1. the HARVEST gems (the quota) always sit on solid dirt with plain dirt
//      above, so the player's own digging can never dislodge a gem onto their
//      head or turn the paydirt to rubble. Reaching them is a lateral dig.
//   2. the DEMO hazards (the fell / roll / convert / burn the level `proves`)
//      live in isolated pockets that drain on their own at tick 0, away from
//      both the harvest and the route. So a mechanic is proven LIVE without the
//      win ever riding on dodging it — and a `--mutate` that silences the rule
//      silences the token, turning the gate red. Fire, in particular, is boxed
//      behind steel: the wall is the lesson, the chain never crosses it.

import { W, H, EMPTY, DIRT, BOULDER, DIAMOND, STEEL, AMO_HEAD, PUSHWALL } from './sim.js'

class Carve {
    constructor() { this.g = new Uint8Array(W * H).fill(DIRT) }
    set(x, y, t) { if (x >= 0 && x < W && y >= 0 && y < H) this.g[y * W + x] = t; return this }
    rect(x0, y0, x1, y1, t) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, t); return this }
    row(y, x0, x1, t) { return this.rect(x0, y, x1, y, t) }
    col(x, y0, y1, t) { return this.rect(x, y0, x, y1, t) }
    shell() {
        this.row(0, 0, W - 1, STEEL); this.row(H - 1, 0, W - 1, STEEL)
        this.col(0, 0, H - 1, STEEL); this.col(W - 1, 0, H - 1, STEEL)
        return this
    }
    // a supported seam: every gem rests on dirt with dirt overhead — stable.
    seam(y, x0, x1) { for (let x = x0; x <= x1; x++) this.set(x, y, DIAMOND); return this }
    gems(spec) { for (const [x, y] of spec) this.set(x, y, DIAMOND); return this }
}

export const LEVELS = [
    {
        // Teach the cut: dig, gather the quota, find the way out. No hazards.
        name: 'FIRST CUT', timeTicks: 1600, need: 5,
        spawn: { x: 3, y: 18 }, exit: { x: 36, y: 3 },
        proves: ['dig'],
        build() {
            const c = new Carve()
            c.shell()
            c.rect(2, 16, 4, 20, EMPTY)                 // start chamber
            c.rect(34, 2, 37, 5, EMPTY)                 // exit chamber
            c.seam(18, 8, 13)                           // supported harvest seam
            return c.g
        },
    },
    {
        // Gravity is real and unattended: a stacked pair of boulders drains into
        // an open pocket the moment the cave wakes, lands and levels off over the
        // ledge. The harvest seam sits low and stable, far from that drama.
        name: 'THE CHUTE', timeTicks: 1800, need: 6,
        spawn: { x: 3, y: 18 }, exit: { x: 37, y: 2 },
        proves: ['fell', 'roll'],
        build() {
            const c = new Carve()
            c.shell()
            c.rect(2, 16, 4, 20, EMPTY)
            c.rect(34, 1, 38, 3, EMPTY)
            // the demo: two boulders stacked above an open pocket — the lower
            // lands, the upper is blocked by it and rolls to level out. The
            // shaft above the pocket is open so they actually drain at tick 0.
            c.rect(15, 6, 19, 9, EMPTY)
            c.col(14, 4, 9, STEEL)
            c.set(17, 5, EMPTY)
            c.set(17, 3, BOULDER); c.set(17, 4, BOULDER)
            c.seam(18, 8, 14)                           // stable harvest
            return c.g
        },
    },
    {
        // The cost of greed: a gem lip over an open cavity gives up and turns to
        // dirt the instant the cave wakes — a demonstration you cannot buy back.
        // The real harvest is a supported seam along the floor, long before you
        // would ever think to cut up under the pretty diamonds in the roof.
        name: 'RICH SEAM', timeTicks: 1800, need: 6,
        spawn: { x: 3, y: 18 }, exit: { x: 37, y: 18 },
        proves: ['convert'],
        build() {
            const c = new Carve()
            c.shell()
            c.rect(2, 16, 4, 20, EMPTY)
            c.rect(34, 16, 38, 20, EMPTY)
            // the demo: three gems on the lip of an empty cavity -> they fall and
            // convert (gemlost) on the cavity floor at the very start
            c.rect(16, 8, 20, 10, EMPTY)
            c.gems([[17, 7], [18, 7], [19, 7]])
            c.seam(18, 8, 13)                           // stable harvest
            return c.g
        },
    },
    {
        // Respect the walls. A param crucium — the firefly automaton — burns in a
        // steel-lined dirt cell, turning everything it touches into a spreading
        // chain. Steel is the one surface the chain respects: the harvest lies on
        // the safe side of that glowing partition, and the exit beyond it. Since
        // #2364 the pit also has a door: a two-cell DUST SEAM in the east wall
        // catches fire the moment the fly first bores through it (the ring still
        // contains the chain — steel is the surface fire respects), and beyond
        // lies a steel-lined flight corridor across the cavern roof with a steel
        // dead end at col 29. The fly only ever turns against steel, so its
        // patrol shuttles pit<->corridor forever and can never dive into dust:
        // the harvest at row 18 provably stays cool. The gap in the tube floor at
        // col 22 is the invitation — climb into the corridor and it becomes a
        // game of chicken with the fire line.
        name: 'FLY PIT', timeTicks: 2200, need: 6,
        spawn: { x: 3, y: 18 }, exit: { x: 36, y: 3 },
        flies: [{ x: 11, y: 8, dir: 1 }],
        // #2374 readability: the two seam cells are still plain DIRT in the CA
        // (behaviour unchanged), but the painter tints cells listed here so the
        // dust door reads differently from ordinary rock BEFORE it ignites.
        // dashcheck pins that this list stays exactly the bored seam.
        dust: [[15, 8], [16, 8]],
        proves: ['fly', 'burn'],
        build() {
            const c = new Carve()
            c.shell()
            c.rect(2, 16, 4, 20, EMPTY)                 // start, bottom-left
            c.rect(34, 2, 37, 5, EMPTY)                 // exit, top-right
            // sealed firefly cell: a solid steel block, then a dirt core carved
            // back inside it — the fly burns the core, the ring holds the fire in
            c.rect(9, 2, 16, 10, STEEL)
            c.rect(11, 4, 14, 8, DIRT)
            // the escape seam (#2364): dust through the east wall, opening onto
            // a roof corridor lined top and bottom with steel and dead-ended at
            // col 29. Fire never crosses steel, so the chain stays in pit+seam;
            // the fly turns only when blocked, so the patrol stays in air.
            c.set(15, 8, DIRT); c.set(16, 8, DIRT)
            c.rect(17, 7, 29, 7, STEEL)                 // corridor ceiling
            c.rect(17, 9, 29, 9, STEEL)                 // corridor floor
            c.set(29, 8, STEEL)                        // dead end — the turn-around
            c.set(22, 9, EMPTY)                        // the gap — the climb-in point
            // the harvest: a supported seam along the START row, east of the
            // steel cell — the player tunnels along it laterally and never digs
            // beneath a gem, so nothing of the paydirt ever drains away.
            c.seam(18, 20, 26)
            return c.g
        },
    },
    {
        // The later variants come home (#2411). A full-height steel divide cuts
        // the cavern — the ONLY way east is a tube carved through it, and the
        // tube is bolted by a push wall. Shove the bolt east and it slides over
        // the pit in the floor and drops out of the way: push + gravity, the
        // classic vault crack. Deeper east, a second wall slams a boulder out
        // of the corridor (crush — the rock is gone, the wall follows it into
        // the next pit, and the tube opens again). Both walls and their pits
        // are load-bearing: dashcheck's `push`/`crush` mutants strand the
        // planner in this cave, and the every-cave-winnable gate goes red.
        // Below the tube, a slime pocket (Boulder Dash II's amoeba) crawls
        // east across its chamber and DISSOLVES the bait vein at its far wall
        // in front of anyone who digs down to watch. Containment is a law, not
        // a hope: the wave claims only EMPTY and DIAMOND, and uncarved DIRT
        // never qualifies — so the pocket, ringed by solid rock, cannot reach
        // the tube, the harvest at row 18 west of the divide, or the exit.
        name: 'SLIME VAULT', timeTicks: 2400, need: 6,
        spawn: { x: 3, y: 18 }, exit: { x: 36, y: 10 },
        amoebaDir: [1, 0],
        proves: ['dig', 'push', 'fell', 'crush', 'amoeba', 'dissolve'],
        // #2417 readability data (painter-only — the grid is untouched, the
        // sim never sees it). bolts: every pushwall and the way it gives, so
        // the painter can shade a one-cell arrow on the give side — the
        // mechanic teaches itself, no tutorial. dashcheck pins both lists to
        // the grid: if the vault is re-carved and the data lags, red.
        bolts: [[22, 10, 'E'], [26, 10, 'E']],
        // lids: the dirt row directly above the slime pocket — two cells under
        // the tube. A green grain telegraph reads "danger below" BEFORE the
        // player digs in (the pocket was invisible until the second dig).
        lids: [[24, 12], [25, 12], [26, 12], [27, 12], [28, 12]],
        build() {
            const c = new Carve()
            c.shell()
            c.rect(2, 16, 4, 20, EMPTY)                 // start, bottom-left (west side)
            c.seam(18, 8, 13)                           // supported harvest — the whole quota, west of the divide
            c.rect(20, 1, 21, 20, STEEL)                // the divide: full height, no way around but the tube
            c.rect(18, 10, 32, 10, EMPTY)               // the tube, straight through it
            c.row(9, 18, 29, STEEL)                     // tube roof — the corridor reads as a tunnel
            c.set(23, 11, EMPTY); c.set(29, 11, EMPTY)  // the two pits the bolts drop into
            c.rect(33, 8, 37, 12, EMPTY)                // exit chamber, east
            c.set(22, 10, PUSHWALL)                     // the vault bolt (floor holds it; the pit is one cell east)
            c.set(26, 10, PUSHWALL)                     // the choke: shove east, the boulder is next
            c.set(28, 10, BOULDER)
            c.rect(24, 13, 28, 16, EMPTY)               // the slime pocket, sealed by untouched dirt
            c.set(24, 14, AMO_HEAD); c.set(24, 15, AMO_HEAD); c.set(25, 15, AMO_HEAD)
            // the bait vein sits ON the pocket floor with nothing above it —
            // loose gems over open space would fall and greed-turn to dirt long
            // before the wave arrives (construction rule 1, learned the sharp way).
            c.set(27, 16, DIAMOND); c.set(28, 16, DIAMOND)
            return c.g
        },
    },
    {
        // The amoeba FAMILY comes home (#2428). Three sealed pockets, one
        // creature law each, and none of them can reach the harvest at row 18
        // or the exit shaft at col 36 — containment is the same construction
        // law as SLIME VAULT (uncarved DIRT is absolute; growth claims only
        // EMPTY and DIAMOND). West pocket: a TWO-PHASE wave that corners on
        // its turn passes and drives on its extend passes, eating the bait
        // gems on its floor. Middle: a mirrored CLASSIC pair in a two-row
        // corridor, seeded at both ends and closing like a vise — every pass
        // both fronts claim, which is the `vise` receipt. East: a DROPPER in
        // a shaft — down is its first offer, so it pours to the floor.
        name: 'GOO GALLERY', timeTicks: 2400, need: 6,
        spawn: { x: 3, y: 18 }, exit: { x: 36, y: 2 },
        amoebaDir: [1, 0], amoebaVariant: 'twophase',
        amoebas: [
            { cells: [[30, 2]], dir: [1, 0], variant: 'drop' },
            { cells: [[20, 12], [20, 13]], dir: [1, 0], variant: 'classic' },
            { cells: [[34, 12], [34, 13]], dir: [-1, 0], variant: 'classic' },
        ],
        proves: ['dig', 'amoeba', 'dissolve', 'gait', 'pour', 'vise'],
        // #2417-style readability data (painter-only): dirt rows capping the
        // three slime pockets — the green grain telegraph reads "danger below".
        lids: [[6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3], [12, 3], [13, 3],
            [14, 3], [15, 3], [16, 3], [30, 1],
            [20, 11], [21, 11], [22, 11], [23, 11], [24, 11], [25, 11], [26, 11],
            [27, 11], [28, 11], [29, 11], [30, 11], [31, 11], [32, 11], [33, 11], [34, 11]],
        build() {
            const c = new Carve()
            c.shell()
            c.rect(2, 16, 4, 20, EMPTY)                 // start, bottom-left
            c.rect(34, 1, 37, 4, EMPTY)                 // exit, top-right
            c.seam(18, 8, 13)                           // supported harvest — 6 on the seam, quota 6
            // pocket A — the two-phase creature's chamber (wave 0), sealed by
            // untouched dirt all around. Bait gems sit ON the pocket floor (row
            // 6 stays uncarved under them — construction rule 1; loose gems over
            // open space fall and greed-turn to dirt before the wave arrives).
            c.rect(6, 4, 16, 5, EMPTY)
            c.rect(15, 6, 16, 8, EMPTY)                 // the elbow — where the gait turns the corner
            c.set(6, 4, AMO_HEAD); c.set(6, 5, AMO_HEAD)
            // bait gems in the creature's DRIVE lane (row 5), on solid floor:
            // the front marches east through here, so the dissolve is certain.
            c.set(13, 5, DIAMOND); c.set(14, 5, DIAMOND)
            // pocket B — the dropper's shaft (wave 1): one column, air rows 2..8,
            // dirt floor below. Down is its first offer; it pours and stalls.
            c.col(30, 2, 8, EMPTY)
            // pocket C — the vise (waves 2+3): a two-row corridor with classic
            // waves seeded at both ends, dirs 180° apart. Dirt roof and floor.
            c.rect(20, 12, 34, 13, EMPTY)
            return c.g
        },
    },
    {
        // THE MULTI-HEAD AMOEBA comes home (#2444). One fork wave, seeded in a
        // sealed chamber with a stone pillar at its heart: a single origin, but
        // the head plants perpendicular siblings as it drives, so two (then up to
        // CFG.amoForkMax) fingers grow at once, corner independently, and reach
        // AROUND the pillar — the forking blob Boulder Dash is famous for and the
        // README gap said was missing. Containment is the same law as every other
        // cave here: the pocket is ringed by uncarved DIRT (growth claims only
        // EMPTY/DIAMOND), the harvest seam at row 18 and the exit are outside the
        // ring, and the live-head cap + #2411 gens-expiry make the wave advance
        // and DISSOLVE rather than flood. dashcheck pins all of it, and a mute of
        // amoFork (→ single-finger growth) goes the fork pin red.
        name: 'FORK BASIN', timeTicks: 2400, need: 6,
        spawn: { x: 3, y: 18 }, exit: { x: 36, y: 2 },
        amoebaDir: [1, 0], amoebaVariant: 'fork',
        amoebas: [{ cells: [[23, 6]], dir: [1, 0], variant: 'fork' }],
        proves: ['dig', 'amoeba', 'dissolve', 'fork'],
        // #2417-style readability telegraph (painter-only): the dirt row capping
        // the pocket reads "danger below".
        lids: [[22, 3], [23, 3], [24, 3], [25, 3], [26, 3], [27, 3], [28, 3]],
        // #2438 polish (painter-only): the stone pillar the fork fingers must
        // wrap, marked so the multi-head reach reads before the blob arrives.
        // dashcheck pins every cell to the pillar rock; if the pocket is
        // re-carved and the data lags, red.
        pillar: [[25, 5], [26, 5], [25, 6], [26, 6], [25, 7], [26, 7]],
        build() {
            const c = new Carve()
            c.shell()
            c.rect(2, 16, 4, 20, EMPTY)                 // start, bottom-left
            c.rect(34, 1, 37, 4, EMPTY)                 // exit, top-right
            c.seam(18, 8, 13)                           // supported harvest — quota lives here, far from the slime
            // the fork pocket, sealed by untouched dirt all around. Sized so the
            // capped blob fills it, hits its boundaries, then expires — the same
            // self-limiting life as SLIME VAULT's wave (a roomier pocket would
            // leave it still growing at the end of the drive window).
            c.rect(22, 4, 28, 8, EMPTY)
            c.rect(25, 5, 26, 7, DIRT)                  // the pillar the forking fingers must wrap
            c.set(23, 6, AMO_HEAD)                     // one origin, driving east
            // bait gems on the pocket floor, on solid ground (construction rule 1:
            // nothing loose over open space) — the wave dissolves them as it wraps.
            c.set(26, 8, DIAMOND); c.set(27, 8, DIAMOND)
            return c.g
        },
    },
    {
        // THE BUTTERFLY WEAVES THE CAVERN (#2453). The README's oldest
        // actionable gap: "the fly turns only against steel, so it never weaves
        // into the cavern proper the way an original butterfly could". The
        // originals had TWO critters — the boring, burning firefly (FLY PIT)
        // and the butterfly, which flitted through open ground changing course
        // on its own. `meta.butterflies` declares the second kind: same fly
        // automaton with drift flaps on (deterministic hash-of-moment turns in
        // open air, #2364 momentum intact) but it does NOT bore dust and does
        // NOT ignite — the two critters differ exactly as the originals did.
        // The gallery is a steel ring, so neither fire nor butterfly needs a
        // containment invention: the butterfly exits through the open tube at
        // col 27 only after the player digs the roof lane below it open, then
        // roams the dig lanes — contact is still fatal, the harvest seam at
        // row 18 is provably cool (nothing in this cave ever burns: no
        // ignition source, and dust only burns when touched by fire).
        name: 'GOSSAMER HOLLOW', timeTicks: 2400, need: 6,
        spawn: { x: 3, y: 18 }, exit: { x: 36, y: 2 },
        butterflies: [{ x: 26, y: 5, dir: 1 }],
        proves: ['dig', 'drift'],
        // readability telegraph (painter-only, #2417 style): the steel row
        // capping the gallery reads "roof over the hollow" — the tube mouth at
        // col 27 is where the butterfly will come out once the lane opens.
        lids: [[9, 3], [10, 3], [11, 3], [12, 3], [13, 3], [14, 3], [15, 3], [16, 3],
            [17, 3], [18, 3], [19, 3], [20, 3], [21, 3], [22, 3], [23, 3], [24, 3],
            [25, 3], [26, 3], [27, 3], [28, 3], [29, 3], [30, 3], [31, 3]],
        // #2438 polish (painter-only): the dirt cap where the harvest lane meets
        // the tube column — tinting it reads "dig here and the hollow opens"
        // before the descent is ever used (the mouth is invisible from below
        // until dug). dashcheck pins it to DIRT over a clear tube.
        tubes: [[27, 18]],
        build() {
            const c = new Carve()
            c.shell()
            c.rect(2, 16, 4, 20, EMPTY)                 // start, bottom-left
            c.rect(34, 1, 37, 4, EMPTY)                 // exit, top-right
            c.seam(18, 8, 13)                           // supported harvest, quota 6
            // the hollow: an open gallery across the cavern roof — steel-ringed
            // top, bottom and both sides, and open nothing else.
            c.rect(10, 5, 30, 11, EMPTY)
            c.row(4, 9, 31, STEEL); c.row(12, 9, 31, STEEL)
            c.col(9, 4, 12, STEEL); c.col(31, 4, 12, STEEL)
            // pillars so the drift has something to weave around
            c.rect(15, 6, 16, 7, STEEL)
            c.rect(24, 9, 25, 10, STEEL)
            // the tube: an open col through the ring floor, down to one cell
            // above the harvest lane. Steel on both faces — and open ground
            // carries no fuel — so nothing burning ever travels it either way.
            c.col(27, 12, 17, EMPTY)
            return c.g
        },
    },
    {
        // THE TRANSPORT BUTTERFLY (#2463). The originals' butterflies grabbed a
        // diamond and dropped it on the far side — a transport puzzle in its own
        // right. SILK GULCH's quota cannot be dug: three gems sit on the open
        // seam, one rests in a steel pocket at the foot of the shaft, and the
        // last TWO ride with the butterflies (a loaded fly is born carrying —
        // `carry:1`). A loaded transport flies with momentum like any fly, but
        // at the drop cell — the steel pad at (20,16) — the cargo lets go: a
        // real, collectable gem resting on steel (it never falls, never
        // greed-turns; the pad's steel floor is the law that keeps it a gem).
        // The burdened fly perishes of the landing (carryDone: the originals'
        // "carries it until it dies", our one honest simplification — our flies
        // are otherwise unkillable), so a loaded fly always tries the pad: if
        // the pad still holds a gem the fly BOUNCES (diamonds block flies) and
        // waits above, cycling down until the player empties the pad. Supply is
        // exactly the quota: seam 3 + pocket 1 + ferried 2 = need 6. Silence
        // flyCarry and the ferries die — dashcheck strands the planner at 4/6
        // and the level fails: the transport is load-bearing, not decoration.
        // The third butterfly is unburdened and weaves the steel-ringed gallery
        // (#2453 drift proof); the shaft is a two-cell dust bore (the fly that
        // drops bears through it, igniting — but a butterfly lights nothing, so
        // the bore stays dark and cool and the harvest at row 18 is provably
        // safe). The dust marks are the readability seam of #2374 again: the
        // bore column is where a winged delivery comes through.
        name: 'SILK GULCH', timeTicks: 2400, need: 6,
        spawn: { x: 3, y: 18 }, exit: { x: 36, y: 2 },
        butterflies: [
            { x: 12, y: 7, dir: 1 },             // the weaver (drift proof, no cargo)
            { x: 20, y: 13, dir: 0, carry: 1 }, // burdened: dives the shaft to the pad
            { x: 20, y: 16, dir: 0, carry: 1 }, // burdened: born on the pad — instant drop
        ],
        dropCells: [[20, 16]],
        // the mine: the loaded-only column from the gallery mouth to the pad.
        // An UNburdened butterfly refuses these cells (it turns above the mouth —
        // only the burdened dive), so the weaver can never dive into the pocket
        // or wander the harvest tunnels: containment by rule, not layout.
        mine: [[20, 12], [20, 13], [20, 14], [20, 15], [20, 16]],
        proves: ['dig', 'drift', 'ferryDrop', 'carryDone'],
        // readability (painter-only, #2374 tint law): the shaft column a loaded
        // transport comes down — dashcheck pins both marks to open mine cells.
        dust: [[20, 13], [20, 14]],
        // the pocket mouth telegraph (dashcheck pins: DIRT directly west of the
        // pad-approach air, on the tunnel's last dig).
        pads: [[18, 16]],
        build() {
            const c = new Carve()
            c.shell()
            c.rect(2, 16, 4, 20, EMPTY)                 // start, bottom-left
            c.rect(34, 1, 37, 4, EMPTY)                 // exit, top-right
            c.seam(18, 8, 10)                          // harvest — half the quota, dig-free
            // the pocket: steel cup at the foot of the shaft, entered by one
            // dig east from the tunnel's end. Its gem rests ON STEEL — never
            // falls, never converts; it waits for a pickaxe. The pad cell
            // (20,16) itself starts EMPTY: only ferry-drops put a gem there.
            c.rect(19, 15, 21, 17, STEEL)
            c.set(19, 16, DIAMOND)                     // the pocket gem (supplied, not dig-seam)
            c.set(20, 16, EMPTY)                       // the pad
            // the shaft: open column from the gallery mouth to the pad (dark —
            // butterflies ignite nothing), cheeks and floor steel.
            c.col(20, 12, 15, EMPTY)
            // the gallery: steel-ringed flight deck with pillars to weave (the
            // weaver's stage, #2453 style). The mouth is the mine's first cell.
            c.rect(10, 5, 30, 11, EMPTY)
            c.row(4, 9, 31, STEEL); c.row(12, 9, 31, STEEL)
            c.col(9, 4, 12, STEEL); c.col(31, 4, 12, STEEL)
            c.rect(14, 7, 15, 8, STEEL)
            c.rect(24, 8, 25, 9, STEEL)
            // approach tunnel from the start chamber; its last cell is the cap
            // the player must dig east to reach the pocket.
            c.row(16, 5, 18, EMPTY)
            return c.g
        },
    },
]

export function buildLevel(idx) {
    const lv = LEVELS[idx % LEVELS.length]
    const { build: _build, ...meta } = lv                // functions must not ride in cloneable state
    return { meta, grid: lv.build() }
}
