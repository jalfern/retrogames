// #601: the one table of CI scopes. ci.yml gates each step with
// `contains(scope keys, '<key>')`; ciscope.mjs turns changed files into keys
// from `paths`; run-checks.mjs replays the whole table (with mutants) nightly.
// Every alias here must exist in package.json — ciscope --selftest proves it,
// and any src/games/<Dir> NOT owned by a scope escalates to "all" so a new
// game can never quietly dodge its gates.

export const CORE = {
  lint: ['lint:ai', 'lint:forge', 'lint:pw'],
  checks: ['aicheck', 'zorkcheck', 'vpadcheck', 'steercheck', 'fitcanvascheck',
    'forgecheck', 'dailylogcheck', 'builtbycheck', 'navcheck', 'visibilitycheck', 'jonqcheck',
    'pulsecheck', 'shiftreportcheck', 'feedbackcheck', 'nightlyheal', 'padlayoutcheck', 'nightlybotcheck',
    'runwaycheck', 'claimcheck', 'robokitcheck', 'tpscheck', 'lanecheck', 'sleepwatchcheck', 'watchcheck', ['watchcheck', true]],
  smoke: ['vpadboot', 'tapstartcheck'],
  paths: [
    'src/components/', 'src/utils/', 'src/config/', 'src/pages/',
    'src/App.jsx', 'src/main.jsx', 'index.html', 'vite.config.js',
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
  gauntlet: { dirs: ['src/games/Gauntlet', 'src/games/FourHalls'], lint: ['lint:gauntlet', 'lint:net', 'lint:rec'], checks: [['gauntletcheck', true], 'netcheck', 'replaycheck', ['replaycheck', true]], smoke: [] },
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
};

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
    if (isDocs(f)) continue;
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
  if (keys.has('core')) return { docs: false, keys: ALL() };
  return { docs, keys: [...keys] };
}

const DOCS = [/^docs\//, /\.md$/i, /^scripts\//, /^\.github\/ISSUE_TEMPLATE\//, /^patches\//, /^public\/demos\//];
function isDocs(f) {
  if (f.startsWith('.github/workflows/')) return false;
  return DOCS.some((r) => r.test(f));
}
