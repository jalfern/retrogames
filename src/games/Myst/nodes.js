// MYST — node graph. Pure data: every first-person view is a node with a
// camera pose (pos, yaw) and hotspots. A hotspot is a clickable region that
// either travels (to:) or acts (do:). Dirs are screen-space hints for the
// arrow-key traversal (left/center/right of the view), yaw offsets are where
// the hotspot sits in the panorama (degrees, 0 = camera forward).

export const NODES = {
  dock: {
    pos: [0, 1.7, 28], yaw: 0, sky: 'dusk', amb: 'sea',
    caption: 'The dock at Myst — you have arrived',
    expect: ['dockPlank'],
    spots: [
      { id: 'dockBeach', label: 'climb the path', yaw: 0, w: 90, h: 40, to: 'cliffPath' },
      { id: 'dockSea', label: 'the open sea', yaw: 0, w: 120, h: 20, msg: 'The ship that brought you is gone. There is no way off this island — yet.' },
    ],
  },
  cliffPath: {
    pos: [0, 4.2, 18], yaw: 180, sky: 'dusk', amb: 'wind',
    caption: 'A path cut into the cliffs above the sea',
    expect: ['cliffFace', 'sea'],
    spots: [
      { id: 'backDock', label: 'back to the dock', yaw: 180, w: 80, h: 40, to: 'dock' },
      { id: 'toBoat', label: 'the wrecked boat on the beach', yaw: 90, w: 70, h: 30, to: 'beach' },
      { id: 'toLanding', label: 'the wooden landing', yaw: 0, w: 90, h: 40, to: 'landing' },
    ],
  },
  beach: {
    pos: [-14, 0.6, 18], yaw: 0, sky: 'dusk', amb: 'sea',
    caption: 'The beach below the cliffs — a rotted boat',
    expect: ['boat'],
    spots: [
      { id: 'backPath', label: 'back up the path', yaw: 90, w: 70, h: 40, to: 'cliffPath' },
      { id: 'boat', label: 'the boat', yaw: 0, w: 60, h: 30, msg: 'A fishing boat, salt-rotted. It will never sail again.' },
    ],
  },
  landing: {
    pos: [0, 8.3, 12], yaw: 180, sky: 'day', amb: 'wind',
    caption: 'The great stone stairway rises into the trees',
    expect: ['landingStair', 'landingTree'],
    spots: [
      { id: 'backCliff', label: 'down to the path', yaw: 180, w: 80, h: 40, to: 'cliffPath' },
      { id: 'palmIllusion', label: 'a palm tree that does not belong here', yaw: -45, w: 40, h: 60, msg: 'The palm flickers — an illusion. Its trunk hides something cold and iron.', reveal: 'towerLever' },
      { id: 'toStairs', label: 'the stairway', yaw: 0, w: 80, h: 60, to: 'stairTop' },
    ],
  },
  stairTop: {
    pos: [0, 10.5, -10], yaw: 0, sky: 'day', amb: 'birds',
    caption: 'At the top of the stairway, Myst\'s library stands open',
    expect: ['library'],
    spots: [
      { id: 'backLanding', label: 'down the stairway', yaw: 180, w: 80, h: 40, to: 'landing' },
      { id: 'towerDoor', label: 'the clock tower door', yaw: 90, w: 40, h: 50, to: 'towerBase', need: 'towerLever', needMsg: 'The tower door is shut tight.' },
      { id: 'cabinDoor', label: 'a wooden cabin in the trees', yaw: -90, w: 40, h: 44, to: 'cabin' },
      { id: 'libraryDoor', label: 'the library', yaw: 0, w: 70, h: 50, to: 'library' },
    ],
  },
  library: {
    pos: [0, 1.7, 0], yaw: 0, sky: 'interior', amb: 'fire',
    caption: 'The library of Myst — shelves of Ages in every direction',
    expect: ['libraryShelf'],
    spots: [
      { id: 'outLibrary', label: 'out to the stairway', yaw: 180, w: 80, h: 40, to: 'stairTop' },
      { id: 'redBook', label: 'a red book on a stand', yaw: -35, w: 26, h: 30, act: 'redBook' },
      { id: 'blueBook', label: 'a blue book on a stand', yaw: 35, w: 26, h: 30, act: 'blueBook' },
      { id: 'fireplace', label: 'the fireplace', yaw: 90, w: 34, h: 30, act: 'fireplace' },
      { id: 'ladderDown', label: 'a ladder down into the dark', yaw: -90, w: 30, h: 40, to: 'cave' },
      { id: 'pedestal', label: 'an empty pedestal slot', yaw: 0, w: 24, h: 26, act: 'pedestal' },
      { id: 'shelfNote', label: 'a bookshelf of handwritten notes', yaw: 150, w: 30, h: 26, act: 'shelfNote' },
    ],
  },
  cave: {
    pos: [0, 1.7, -10], yaw: 0, sky: 'interior', amb: 'drip',
    caption: 'A cavern beneath the library — star charts glow overhead',
    expect: ['starPanel'],
    spots: [
      { id: 'ladderUp', label: 'up the ladder', yaw: 180, w: 80, h: 40, to: 'library' },
      { id: 'starPanel', label: 'a stone panel of star symbols', yaw: 0, w: 40, h: 30, act: 'starPanel' },
      { id: 'channelwoodDoor', label: 'a wooden door in the rock', yaw: 60, w: 34, h: 40, to: 'channelwood', need: 'starPanel', needMsg: 'The wood door will not budge. Something locks it from within the stone.' },
      { id: 'rocketDoor', label: 'a seam of metal in the cliff wall', yaw: -60, w: 34, h: 40, msg: 'Water pours across a seam of metal — a hidden door, and no handle to be seen.', reveal: 'rocketSeen' },
    ],
  },
  towerBase: {
    pos: [6, 1.7, -4], yaw: 0, sky: 'interior', amb: 'gears',
    caption: 'Inside the clock tower — a great brass mechanism',
    expect: ['towerGear'],
    spots: [
      { id: 'outTower', label: 'back out', yaw: 180, w: 80, h: 40, to: 'stairTop' },
      { id: 'towerClimb', label: 'climb the ladder to the top', yaw: 0, w: 40, h: 50, to: 'towerTop' },
    ],
  },
  towerTop: {
    pos: [6, 9.7, -4], yaw: 0, sky: 'day', amb: 'gears',
    caption: 'The belfry: a book with cogs for a clasp, and a great lever',
    expect: ['towerLever'],
    spots: [
      { id: 'downTower', label: 'climb down', yaw: 180, w: 80, h: 40, to: 'towerBase' },
      { id: 'mechanicalBook', label: 'the book of cogs', yaw: 0, w: 30, h: 26, act: 'mechanicalBook' },
      { id: 'towerLever', label: 'pull the great lever', yaw: 60, w: 26, h: 30, act: 'towerLever' },
    ],
  },
  cabin: {
    pos: [-10, 1.7, -4.5], yaw: -45, sky: 'interior', amb: 'wind',
    caption: 'A wooden cabin — Atrus\'s workshop',
    expect: ['cabinShelf'],
    spots: [
      { id: 'outCabin', label: 'step back outside', yaw: 180, w: 80, h: 40, to: 'stairTop' },
      { id: 'safe', label: 'a black iron safe', yaw: 0, w: 30, h: 26, act: 'safe' },
      { id: 'cabinShelf', label: 'shelves of tools and link stones', yaw: -45, w: 30, h: 26, msg: 'Eight stone markers, each etched with a link-symbol. Four glow faintly — the Ages you have found.' },
    ],
  },

  // ---- Ages -------------------------------------------------------------
  selenitic: {
    pos: [0, 1.7, -16], yaw: 0, sky: 'selenitic', amb: 'sphere',
    caption: 'SELENITIC — a green world of concentric rings and sound',
    expect: ['sphere'],
    spots: [
      { id: 'retSelenitic', label: 'the return panel', yaw: 180, w: 60, h: 36, to: 'library' },
      { id: 'sphere', label: 'a stone sphere on a dial', yaw: 0, w: 40, h: 34, act: 'sphere' },
      { id: 'pageSeleniticRed', label: 'a red page pinned to the rock', yaw: -55, w: 24, h: 24, act: 'takePage', page: 'red:selenitic', gone: 'pageRed_selenitic' },
      { id: 'pageSeleniticBlue', label: 'a blue page beside the water', yaw: 70, w: 24, h: 24, act: 'takePage', page: 'blue:selenitic', gone: 'pageBlue_selenitic' },
    ],
  },
  stoneship: {
    pos: [0, 1.7, -24], yaw: 0, sky: 'stoneship', amb: 'sea',
    caption: 'STONESHIP — a grey island in a still, glass sea',
    expect: ['observatory'],
    spots: [
      { id: 'retStoneship', label: 'the return panel', yaw: 180, w: 60, h: 36, to: 'library' },
      { id: 'observatory', label: 'a stone observatory on the ridge', yaw: 0, w: 44, h: 40, act: 'observatory' },
      { id: 'pageStoneshipRed', label: 'a red page caught in the rocks', yaw: -60, w: 24, h: 24, act: 'takePage', page: 'red:stoneship', gone: 'pageRed_stoneship' },
      { id: 'pageStoneshipBlue', label: 'a blue page on the pier', yaw: 55, w: 24, h: 24, act: 'takePage', page: 'blue:stoneship', gone: 'pageBlue_stoneship' },
    ],
  },
  mechanical: {
    pos: [0, 1.7, -14], yaw: 0, sky: 'mechanical', amb: 'gears',
    caption: 'MECHANICAL — a world of brass, steam and turning cogs',
    expect: ['switchPanel'],
    spots: [
      { id: 'retMechanical', label: 'the return panel', yaw: 180, w: 60, h: 36, to: 'library' },
      { id: 'switchPanel', label: 'a panel of iron switches', yaw: 0, w: 40, h: 30, act: 'switchPanel' },
      { id: 'matchbook', label: 'a matchbook on a bracket', yaw: -50, w: 22, h: 22, act: 'takeMatch', gone: 'matchbook' },
      { id: 'pageMechanicalRed', label: 'a red page under a gear', yaw: 60, w: 24, h: 24, act: 'takePage', page: 'red:mechanical', gone: 'pageRed_mechanical', need: 'switchPanel', needMsg: 'A heavy gear seals the alcove. The switches govern which gears turn.' },
      { id: 'pageMechanicalBlue', label: 'a blue page by the steam vent', yaw: -70, w: 24, h: 24, act: 'takePage', page: 'blue:mechanical', gone: 'pageBlue_mechanical' },
    ],
  },
  channelwood: {
    pos: [0, 1.7, -20], yaw: 0, sky: 'channelwood', amb: 'falls',
    caption: 'CHANNELWOOD — a world of waterfalls and slow stone stars',
    expect: ['starWheel'],
    spots: [
      { id: 'retChannelwood', label: 'the return panel', yaw: 180, w: 60, h: 36, to: 'cave' },
      { id: 'starWheel', label: 'a great stone star over the falls', yaw: 0, w: 40, h: 34, act: 'starWheel' },
      { id: 'pageChannelwoodRed', label: 'a red page in a pool', yaw: -55, w: 24, h: 24, act: 'takePage', page: 'red:channelwood', gone: 'pageRed_channelwood' },
      { id: 'pageChannelwoodBlue', label: 'a blue page on the wood bridge', yaw: 60, w: 24, h: 24, act: 'takePage', page: 'blue:channelwood', gone: 'pageBlue_channelwood' },
    ],
  },
}

export const AGE_LIST = ['selenitic', 'stoneship', 'mechanical', 'channelwood']
