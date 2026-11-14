// #601: the one table of CI scopes. ci.yml gates each step with
// `contains(scope keys, '<key>')`; ciscope.mjs turns changed files into keys
// from `paths`; run-checks.mjs replays the whole table (with mutants) nightly.
// Every alias here must exist in package.json — ciscope --selftest proves it,
// and any src/games/<Dir> NOT owned by a scope escalates to "all" so a new
// game can never quietly dodge its gates.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CORE = {
  lint: ['lint:ai', 'lint:forge', 'lint:pw'],
  checks: ['aicheck', 'zorkcheck', 'vpadcheck', 'steercheck', 'fitcanvascheck',
    'ciyamlcheck', 'shimcheck', 'forgecheck', 'dailylogcheck', 'builtbycheck', 'navcheck', 'visibilitycheck', 'jonqcheck',
    'pulsecheck', 'shiftreportcheck', 'scrubcheck', 'feedbackcheck', 'feedbackreplay', 'nightlyheal', 'padlayoutcheck', 'nightlybotcheck', 'audiocheck', 'dvhcheck',
    // #1667 moved watchcheck to `smoke` (line below) but left its --mutate entry
// here; the rewritten check is browser-only (requireDevServer hard-exits, and no
// --mutate path survives the rewrite), so it froze the browser-free nightly
// static job red every night from 2026-11-06 (#601). Smoke carries it now.
'runwaycheck', 'claimcheck', 'neverbudrycheck', 'robokitcheck', 'tpscheck', 'lanecheck', 'sleepwatchcheck', 'rewritecheck', 'watchsoakcheck', 'watchphonecheck', 'watchpillcheck', 'watchbudgetcheck', 'nightlyverdictcheck', ['muteguardcheck', true], 'reactcheck', ['keycheck', true]],
  smoke: ['vpadboot', 'tapstartcheck', 'watchcheck'],
  paths: [
    'src/components/', 'src/utils/', 'src/config/', 'src/pages/',
    'src/App.jsx', 'src/main.jsx', 'src/index.css', 'index.html', 'vite.config.js',
    'package.json', 'package-lock.json', 'vercel.json', '.github/workflows/',
    'public/games/', 'public/js-dos/', 'public/icons/', 'public/sw.js',
    'relay/',
  ],
};

// game dir(s) + owned scripts. checks entries: alias or [alias, mutateOnNightly].
export const SCOPES = {
  mario: { dirs: ['src/games/SuperMario', 'src/games/SuperMarioClassic'], lint: ['lint:mario'], checks: [], smoke: [] },
  fps: { dirs: ['src/games/IronKeep'], lint: ['lint:fps'], checks: [], smoke: [] },
  ai: { dirs: ['src/ai', 'src/games/Zork', 'src/games/KingsQuest'], lint: ['lint:ai'], checks: ['aicheck', 'zorkcheck'], smoke: [] },
  heist: { dirs: ['src/games/RaccoonHeist'], lint: ['lint:heist'], checks: ['heistcheck'], smoke: ['heistsmoke'] },
  robot: { dirs: ['src/games/RobotLab', 'src/utils/robot'], lint: [], checks: ['robokitcheck'], smoke: [] },
  bee: { dirs: ['src/games/Beezee'], lint: ['lint:bee'], checks: ['beecheck'], smoke: [] },
  lem: { dirs: ['src/games/Lemmings'], lint: ['lint:lem'], checks: ['lemcheck', 'recmethods', ['recmethods', true]], smoke: [] },
  zelda: { dirs: ['src/games/Zelda'], lint: ['lint:zelda'], checks: ['zeldacheck'], smoke: ['zeldaplay'] },
  dash: { dirs: ['src/games/BoulderDash'], lint: ['lint:dash'], checks: ['dashcheck'], smoke: [] },
  sonar: { dirs: ['src/games/Sonar'], lint: ['lint:sonar'], checks: ['sonarcheck'], smoke: [] },
  metroid: { dirs: ['src/games/MetroidLite'], lint: ['lint:metroid'], checks: ['metroidcheck'], smoke: [] },
  runner: { dirs: ['src/games/MomentumRunner'], lint: ['lint:runner'], checks: ['runnercheck'], smoke: [] },
  ice: { dirs: ['src/games/IceClimber'], lint: ['lint:ice'], checks: ['icecheck'], smoke: [] },
  galaga: { dirs: ['src/games/Galaga'], lint: ['lint:galaga'], checks: ['galactcheck'], smoke: [] },
  polar: { dirs: ['src/games/Polarity'], lint: ['lint:polar'], checks: ['polarcheck'], smoke: ['polarplay'] },
  missile: { dirs: ['src/games/MissileBattle'], lint: ['lint:missile'], checks: ['missilecheck'], smoke: ['missileplay'] },
  sim: { dirs: ['src/games/SimCityMin'], lint: ['lint:sim'], checks: ['citycheck'], smoke: ['cityplay'] },
  britannia: { dirs: ['src/games/Britannia'], lint: ['lint:britannia'], checks: ['britanniacheck'], smoke: [] },
  outpost: { dirs: ['src/games/Outpost'], lint: ['lint:outpost'], checks: ['outpostcheck'], smoke: ['outpostplay'] },
  papers: { dirs: ['src/games/PapersPleaseMin'], lint: ['lint:papers'], checks: ['paperscheck'], smoke: ['papersplay'] },
  lode: { dirs: ['src/games/LodeRunnerLite'], lint: ['lint:lode'], checks: [['lodecheck', true]], smoke: ['lodeplay'] },
  archery: { dirs: ['src/games/ArenaArchery'], lint: ['lint:archery'], checks: [['archerycheck', true]], smoke: ['archeryplay'] },
  dog: { dirs: ['src/games/Dogfight'], lint: ['lint:dog'], checks: [['dogfightcheck', true]], smoke: ['dogfightplay'] },
  sweep: { dirs: ['src/games/Minesweeper'], lint: ['lint:sweep'], checks: [['sweepcheck', true]], smoke: [] },
  paper: { dirs: ['src/games/Paperboy'], lint: ['lint:paper'], checks: [['papercheck', true]], smoke: ['paperplay'] },
  tendeep: { dirs: ['src/games/TenDeep'], lint: ['lint:tendeep'], checks: [['tendeepcheck', true]], smoke: ['tendeepplay'] },
  firecrew: { dirs: ['src/games/FireCrew'], lint: ['lint:firecrew'], checks: [['firecrewcheck', true]], smoke: ['firecrewplay'] },
  hunter: { dirs: ['src/games/SpyHunter'], lint: ['lint:hunter'], checks: [['huntercheck', true]], smoke: [] },
  excite: { dirs: ['src/games/Excitebike'], lint: ['lint:excite'], checks: [['excitecheck', true]], smoke: ['exciteplay'] },
  kart: { dirs: ['src/games/MarioKart'], lint: ['lint:kart'], checks: ['kartcheck'], smoke: [] },
  tetris: { dirs: ['src/games/Tetris'], lint: ['lint:tetris'], checks: ['tetrischeck', ['tetrischeck', true]], smoke: [] },
  joust: { dirs: ['src/games/Joust'], lint: ['lint:joust'], checks: ['joustcheck', ['joustcheck', true]], smoke: [] },
  qbert: { dirs: ['src/games/QBert'], lint: ['lint:qbert'], checks: ['qbertcheck', ['qbertcheck', true]], smoke: [] },
  ark: { dirs: ['src/games/Arkanoid'], lint: ['lint:ark'], checks: ['arkcheck'], smoke: [] },
  dug: { dirs: ['src/games/DigDug'], lint: ['lint:dug'], checks: [['dugcheck', true]], smoke: [] },
  bob: { dirs: ['src/games/BubbleBobble'], lint: ['lint:bob'], checks: [['bobcheck', true], 'recmethods', ['recmethods', true]], smoke: [] },
  marble: { dirs: ['src/games/MarbleMadness'], lint: ['lint:marble'], checks: ['marblecheck'], smoke: [] },
  gauntlet: { dirs: ['src/games/Gauntlet', 'src/games/FourHalls'], lint: ['lint:gauntlet', 'lint:net', 'lint:rec'], checks: [['gauntletcheck', true], 'netdemocheck', 'netcheck', 'replaycheck', ['replaycheck', true]], smoke: [] },
  myst: { dirs: ['src/games/Myst'], lint: ['lint:myst'], checks: [['mystcheck', true]], smoke: [] },
  bards: { dirs: ['src/games/BardsTale'], lint: ['lint:bards'], checks: ['bardscheck'], smoke: [] },
  ssx: { dirs: ['src/games/SSX', 'public/models/ssx/'], lint: ['lint:ssx'], checks: ['ssxcheck'], smoke: ['ssxplay'] },
  pop: { dirs: ['src/games/PrinceOfPersia'], lint: ['lint:pop'], checks: ['popcheck'], smoke: [] },
  smash: { dirs: ['src/games/SmashTV'], lint: ['lint:smash'], checks: [['smashcheck', true]], smoke: [] },
  outrun: { dirs: ['src/games/OutRun'], lint: ['lint:outrun'], checks: [['outruncheck', true]], smoke: [] },
  lander: { dirs: ['src/games/LunarLander'], lint: ['lint:lander'], checks: [['landercheck', true], 'landerpolicy', 'landerheatcheck'], smoke: [] },
  tempest: { dirs: ['src/games/Tempest'], lint: ['lint:tempest'], checks: [['tempestcheck', true]], smoke: [] },
  pacman: { dirs: ['src/games/Pacman'], lint: ['lint:pacman'], checks: [['pacmancheck', true]], smoke: [] },
  pong: { dirs: ['src/games/Pong'], lint: ['lint:pong'], checks: [['pongcheck', true]], smoke: [] },
  frogger: { dirs: ['src/games/Frogger'], lint: ['lint:frogger'], checks: [['froggercheck', true]], smoke: [] },
  attract: { dirs: [], anyAttract: true, lint: ['lint:attract'], checks: [['attractcheck', true]], smoke: [] },
  comet: { dirs: ['src/games/CometDrift'], lint: ['lint:comet'], checks: ['cometcheck'], smoke: [] },
  // #1502: Rogue dodged its gate since the batch-14 port — the dir was
  // unowned (escalate-to-all ran every OTHER suite but never roguecheck).
  rogue: { dirs: ['src/games/Rogue'], lint: ['lint:rogue'], checks: [['roguecheck', true]], smoke: [] },
  rally: { dirs: ['src/games/RallyCoDriver'], lint: [], checks: [['rallycheck', true], ['rallylinkcheck', true]], smoke: [] },
};

// #1575: the explicit manual park. A check script that joins scripts/ with a
// package.json alias must face its own audit — ciscope --selftest fails if an
// aliased scripts/*check.mjs is in NEITHER a scope above (some scope's
// lint/checks/smoke) NOR this list. ws3check sat un-audited since 2ee8b35
// exactly because neither table knew about it (#1387's hole). Parking here is
// the honest way to say "I run this by hand, CI does not"; promote a check by
// moving its file into a scope's `checks` and OUT of this list — a stale
// entry (scoped check still listed, or listed file without an alias) also
// reds the selftest, so the park can never rot silently.
export const MANUAL_CHECKS = [
  "scripts/adventurecheck.mjs",
  "scripts/asteroidscheck.mjs",
  "scripts/audcheck.mjs",
  "scripts/autopilotcheck.mjs",
  "scripts/blackholecheck.mjs",
  "scripts/blobcheck.mjs",
  "scripts/bombcheck.mjs",
  "scripts/boredomcheck.mjs",
  "scripts/cachecheck.mjs",
  "scripts/campfirecheck.mjs",
  "scripts/carpetcheck.mjs",
  "scripts/chromeguardcheck.mjs",
  // #1622: needs playwright's bundled headless shell installed — CI runners
  // get system Chrome only, so the ladder's shell fallback can't be proven there.
  "scripts/chromesmokecheck.mjs",
  "scripts/civcheck.mjs",
  "scripts/cometdrifthdcheck.mjs",
  "scripts/cometdrifthdphonecheck.mjs",
  "scripts/cometdrifthdsandcheck.mjs",
  "scripts/cometdrifthdscenerycheck.mjs",
  "scripts/contractcheck.mjs",
  "scripts/creditscheck.mjs",
  "scripts/deepglasscheck.mjs",
  "scripts/defendercheck.mjs",
  "scripts/defusecheck.mjs",
  "scripts/defuselinkcheck.mjs",
  "scripts/doscheck.mjs",
  "scripts/emberwoodcheck.mjs",
  "scripts/evocheck.mjs",
  "scripts/filmstripcheck.mjs",
  "scripts/floorbosscheck.mjs",
  "scripts/fpscheck.mjs",
  // #2182: FURLONG — browser-driven like the other demo gates (needs the dev
  // server); advisory from the lane: npm run furlongcheck.
  "scripts/furlongcheck.mjs",
  "scripts/gardencheck.mjs",
  "scripts/gravelcheck.mjs",
  // #2147: STRIDELINE — browser-driven like the other demo gates (needs the
  // dev server); advisory from the lane: npm run horsecheck.
  "scripts/horsecheck.mjs",
  "scripts/horsegeminicheck.mjs",
  "scripts/invaderscheck.mjs",
  "scripts/ironringcheck.mjs",
  "scripts/juicecheck.mjs",
  // kongcheck: the b27 DonkeyKong harness — seeded sim sweep + mutants, run by hand
  // (browser-free, but the lane cadence keeps it out of the static scope).
  "scripts/kongcheck.mjs",
  "scripts/landerreplaycheck.mjs",
  "scripts/learnedwalkcheck.mjs",
  "scripts/levelcheck.mjs",
  "scripts/lobbycheck.mjs",
  "scripts/mariocheck.mjs",
  "scripts/missilecmdcheck.mjs",
  "scripts/modelindexcheck.mjs",
  "scripts/mountainscheck.mjs",
  "scripts/mystviewcheck.mjs",
  "scripts/neonraincheck.mjs",
  "scripts/oceancheck.mjs",
  "scripts/padlinkcheck.mjs",
  // #1625: the Plaicraft gate regenerates 20 recorded runs and rolls the
  // trained seat — ~40 s per pass; advisory-only, driven from the lane
  // (npm run plaicraftcheck). Deterministic: same commit, same numbers.
  "scripts/plaicraftcheck.mjs",
  "scripts/platecheck.mjs",
  "scripts/peoplecheck.mjs",
  "scripts/physicswalkcheck.mjs",
  "scripts/pickcheck.mjs",
  "scripts/plantcheck.mjs",
  "scripts/pwacheck.mjs",
  "scripts/reefcheck.mjs",
  // #1711: consent + session-store gate; pure Node with a loopback stub store,
  // driven from the lane (npm run recordcheck), deterministic.
  "scripts/recordcheck.mjs",
  // #1711 S5: runs the PRODUCTION worker.js in Node (cfworkers shim + faithful
  // R2 mock) and grades the store's HTTP surface; --mutate strips the consent
  // door from worker.js SOURCE. Pure Node, deterministic, lane-driven.
  "scripts/relaycheck.mjs",
  "scripts/roomcheck.mjs",
  "scripts/shelfcheck.mjs",
  "scripts/shorecheck.mjs",
  "scripts/slotcheck.mjs",
  "scripts/soscheck.mjs",
  "scripts/soslinkcheck.mjs",
  "scripts/ssxmodelcheck.mjs",
  "scripts/ssxmountaincheck.mjs",
  "scripts/ssxterraincheck.mjs",
  "scripts/stickwalkcheck.mjs",
  "scripts/stormcheck.mjs",
  "scripts/textfitcheck.mjs",
  "scripts/tidycheck.mjs",
  "scripts/tmdlinkcheck.mjs",
  "scripts/touchselectcheck.mjs",
  "scripts/viperpitcheck.mjs",
  "scripts/voicecheck.mjs",
  "scripts/voicecmdcheck.mjs",
  "scripts/volcanocheck.mjs",
  "scripts/ws2check.mjs",
  "scripts/ws3check.mjs",
  "scripts/zorkuicheck.mjs",
];

// #887: code that EVERY game page loads. A PR touching any of it pays the
// nightly play-smoke set on the PR itself (ci.yml's `prsmokes` job, advisory),
// so an off-prod break like #868's relay-CORS console.error is seen before
// merge, not in the next morning's freeze. Deliberately NOT CORE.paths:
// the lockfile and workflow files fan out the static gates but a game page
// doesn't load them — game-only PRs keep paying nothing extra.
export const SHARED = [
  'src/components/', 'src/utils/', 'src/pages/', 'src/config/',
  'src/App.jsx', 'src/main.jsx', 'index.html', 'vite.config.js',
  'public/sw.js', 'relay/', 'scripts/lib/',
];

// #1387: scripts/** is docs to isDocs() below (#601), but ~25 harness checks
// pin the RAW TEXT of script files (`read('scripts/telemetry.sh')` & friends).
// A scripts-only PR therefore ran only ciscope --selftest while the checks
// those edits can stale never faced it (#1299 stale-broke the #1269 pin and
// red-shitted main for ~24 h). Fix: derive the pin map from the checks
// themselves — scan every CI-run check script for file-path literals it reads,
// and map each target to the scope keys that execute the reading check (and a
// check script to the scopes that run IT, so editing a check faces its gates).
// Derived, not hand-kept: the list can never go stale itself.
const HERE = dirname(fileURLToPath(import.meta.url));

// package.json -> Map<'scripts/x.mjs', Set<alias>> of scripts CI can invoke.
export function aliasFiles() {
  const pkg = JSON.parse(readFileSync(join(HERE, '..', 'package.json'), 'utf8'));
  const out = new Map();
  for (const [alias, cmd] of Object.entries(pkg.scripts)) {
    for (const m of cmd.matchAll(/node\s+(?:--\S+\s+)*(scripts\/[\w./-]+\.mjs)/g)) {
      if (!out.has(m[1])) out.set(m[1], new Set());
      out.get(m[1]).add(alias);
    }
  }
  return out;
}

// Map<'scripts/x.mjs', Set<key>> — which CI scopes run each check script.
export function checkScopes() {
  const byAlias = new Map();
  const add = (key, entries) => {
    for (const e of entries) {
      const a = Array.isArray(e) ? e[0] : e;
      if (!byAlias.has(a)) byAlias.set(a, new Set());
      byAlias.get(a).add(key);
    }
  };
  add('core', [...CORE.lint, ...CORE.checks, ...CORE.smoke]);
  for (const [k, s] of Object.entries(SCOPES)) add(k, [...s.lint, ...s.checks, ...s.smoke]);
  const out = new Map();
  for (const [file, aliases] of aliasFiles()) {
    const keys = new Set();
    for (const a of aliases) for (const k of byAlias.get(a) ?? []) keys.add(k);
    if (keys.size) out.set(file, keys);
  }
  return out;
}

// File-path literals a check source reads: repo-relative ('scripts/x.sh'),
// '../'-relative, bare filenames (the local `read` helpers anchor scripts/),
// and all-literal `join(here|ROOT, ...)` forms. Deliberately literal-only:
// variable paths resolve to fixtures/temp dirs, never to pinned repo text.
const READ_PATHS = [
  /(?:readFileSync|readFile|read)\(\s*['"]((?:scripts|docs|public|relay|src)\/[^'"]+)['"]/g,
  /(?:readFileSync|readFile|read)\(\s*['"](\.\.\/[\w./-]+)['"]/g,
  /(?:readFileSync|readFile|read)\(\s*['"]([\w-]+\.(?:sh|mjs|md|tsv))['"]/g,
  /join\(\s*(ROOT|root|HERE|here)\b((?:\s*,\s*'[^']*')+)\s*\)/g,
];

export function derivePins() {
  const scopes = checkScopes();
  const pins = {};
  const put = (f, keys) => {
    const rel = normalize(f).replace(/^\.\//, '');
    if (!existsSync(join(HERE, '..', rel))) return;  // fixtures/typos: no pin
    (pins[rel] ??= new Set());
    for (const k of keys) pins[rel].add(k);
  };
  for (const [file, keys] of scopes) {
    put(file, keys);                      // a check script faces its own gates
    const src = readFileSync(join(HERE, '..', file), 'utf8');
    for (const re of READ_PATHS) {
      for (const m of src.matchAll(re)) {
        const target = m[2] !== undefined
          ? [m[1].toLowerCase().startsWith('root') ? '' : 'scripts',
             ...m[2].match(/'([^']*)'/g).map((s) => s.slice(1, -1))].filter(Boolean).join('/')
          : (m[1].startsWith('..') ? join('scripts', m[1])
            : (m[1].includes('/') ? m[1] : join('scripts', m[1])));
        const rel = normalize(target);
        if (isDocs(rel) && !scopes.has(rel)) put(rel, keys);  // docs-swallowed only
      }
    }
  }
  return Object.fromEntries(Object.entries(pins).map(([f, k]) => [f, [...k].sort()]));
}

// computed at the bottom of this file: derivePins() consults DOCS/isDocs.
export let PINS = {};

export function touchesShared(files) {
  return files.some((f) => SHARED.some((p) => f === p || f.startsWith(p)));
}

// changed files -> { docs, keys } ; keys is the expanded gate list — 'all'
// fans out to every scope so ci.yml's contains() conditions stay uniform.
export function classify(files) {
  const ALL = () => ['all', 'core', ...Object.keys(SCOPES)];
  const keys = new Set();
  let docs = true;
  for (const f of files) {
    if (isDocs(f)) {
      // #1387: docs-shaped but pinned — some CI check reads this file's raw
      // text, so a change here can stale that pin. Not docs: run its checks.
      const pk = PINS[f];
      if (pk) { docs = false; for (const k of pk) keys.add(k); }
      else continue;
    } else {
      docs = false;
      let hit = false;
      for (const p of CORE.paths) if (f.startsWith(p)) { hit = true; keys.add('core'); break; }
      if (hit) continue;
      if (/^src\/games\/[^/]+\/attract\.js$/.test(f)) keys.add('attract');
      const ownedDir = (d) => f === d || f.startsWith(d.replace(/\/$/, '') + '/');
      for (const [k, s] of Object.entries(SCOPES)) {
        if (s.dirs.some(ownedDir)) keys.add(k);
      }
      // an unknown game dir must never dodge its gates — escalate.
      if (/^src\/games\//.test(f) && !keys.has('core')) {
        const owned = Object.values(SCOPES).some((s) => s.dirs.some(ownedDir));
        if (!owned) return { docs: false, keys: ALL() };
      }
    }
  }
  if (keys.has('core')) return { docs: false, keys: ALL() };
  return { docs, keys: [...keys] };
}

const DOCS = [/^docs\//, /\.md$/i, /^scripts\//, /^\.github\/ISSUE_TEMPLATE\//, /^patches\//, /^public\/demos\//];
function isDocs(f) {
  if (f.startsWith('.github/workflows/')) return false;
  return DOCS.some((r) => r.test(f));
}

// PINS must exist before classify() runs, but derivePins() needs isDocs —
// initialize here, at module bottom, where both exist. (#1387)
PINS = derivePins();
