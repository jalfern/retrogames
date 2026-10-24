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
      { id: 'dockSea', label: 'the open sea', yaw: 90, w: 120, h: 20, msg: 'The ship that brought you is gone. There is no way off this island — yet.' },
    ],
  },
  cliffPath: {
    pos: [0, 4.2, 18], yaw: 180, sky: 'dusk', amb: 'wind',
    caption: 'A path cut into the cliffs above the sea',
    expect: ['cliffFace', 'sea'],
    spots: [
      { id: 'backDock', label: 'back to the dock', yaw: 0, w: 80, h: 40, to: 'dock' },
      { id: 'toBoat', label: 'the wrecked boat on the beach', yaw: 90, w: 70, h: 30, to: 'beach' },
      { id: 'toLanding', label: 'the wooden landing', yaw: 180, w: 90, h: 40, to: 'landing' },
    ],
  },
  beach: {
    pos: [-14, 0.6, 18], yaw: 0, sky: 'dusk', amb: 'sea',
    caption: 'The beach below the cliffs — a rotted boat',
    expect: ['boat'],
    spots: [
      { id: 'backPath', label: 'back up the path', yaw: -45, w: 70, h: 40, to: 'cliffPath' },
      { id: 'boat', label: 'the boat', yaw: 0, w: 60, h: 30, msg: 'A fishing boat, salt-rotted. It will never sail again.' },
    ],
  },
  landing: {
    pos: [0, 8.3, 13.5], yaw: 180, sky: 'day', amb: 'wind',
    caption: 'The great stone stairway rises into the trees',
    expect: ['landingStair', 'landingTree'],
    spots: [
      { id: 'backCliff', label: 'down to the path', yaw: 0, w: 80, h: 40, to: 'cliffPath' },
      { id: 'palmIllusion', label: 'a palm tree that does not belong here', yaw: -90, w: 40, h: 60, msg: 'The palm flickers — an illusion. Its trunk hides something cold and iron.', reveal: 'towerLever' },
      { id: 'toStairs', label: 'the stairway', yaw: 180, w: 80, h: 60, to: 'stairTop' },
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
    pos: [0.9, 1.7, 1.4], yaw: 180, sky: 'interior', amb: 'gears',
    caption: 'Inside the clock tower — a great brass mechanism',
    expect: ['towerGear'],
    spots: [
      { id: 'outTower', label: 'back out', yaw: 0, w: 80, h: 40, to: 'stairTop' },
      { id: 'towerClimb', label: 'climb the ladder to the top', yaw: -90, w: 40, h: 50, to: 'towerTop' },
    ],
  },
  towerTop: {
    pos: [0.3, 1.8, 1.3], yaw: 180, sky: 'day', amb: 'gears',
    caption: 'The belfry: a book with cogs for a clasp, and a great lever',
    expect: ['towerLever'],
    spots: [
      { id: 'downTower', label: 'climb down', yaw: 0, w: 80, h: 40, to: 'towerBase' },
      { id: 'mechanicalBook', label: 'the book of cogs', yaw: 180, w: 30, h: 26, act: 'mechanicalBook' },
      { id: 'towerLever', label: 'pull the great lever', yaw: 60, w: 26, h: 30, act: 'towerLever' },
    ],
  },
  cabin: {
    pos: [0.3, 1.7, 1.6], yaw: -60, sky: 'interior', amb: 'wind',
    caption: 'A wooden cabin — Atrus\'s workshop',
    expect: ['cabinShelf'],
    spots: [
      { id: 'outCabin', label: 'step back outside', yaw: 0, w: 80, h: 40, to: 'stairTop' },
      { id: 'safe', label: 'a black iron safe', yaw: 180, w: 30, h: 26, act: 'safe' },
      { id: 'cabinShelf', label: 'shelves of tools and link stones', yaw: -90, w: 30, h: 26, msg: 'Eight stone markers, each etched with a link-symbol. Four glow faintly — the Ages you have found.' },
    ],
  },

  // ---- Ages -------------------------------------------------------------
  selenitic: {
    pos: [0, 1.7, -16], yaw: 0, sky: 'selenitic', amb: 'sphere',
    caption: 'SELENITIC — the moonlit landing: green rock under a huge moon',
    expect: ['sphere'],
    spots: [
      { id: 'retSelenitic', label: 'the return panel', yaw: 180, w: 60, h: 36, to: 'library' },
      { id: 'sphere', label: 'a stone sphere on a dial', yaw: 0, w: 40, h: 34, act: 'sphere' },
      { id: 'pageSeleniticRed', label: 'a red page pinned to the rock', yaw: -55, w: 24, h: 24, act: 'takePage', page: 'red:selenitic', gone: 'pageRed_selenitic' },
      { id: 'pageSeleniticBlue', label: 'a blue page beside the water', yaw: 70, w: 24, h: 24, act: 'takePage', page: 'blue:selenitic', gone: 'pageBlue_selenitic' },
      { id: 'toSelSound', label: 'a path winding down to a field of stones', yaw: -118, w: 50, h: 40, to: 'selSound' },
    ],
  },
  selSound: {
    pos: [0, 1.7, -46], yaw: 0, sky: 'selenitic', amb: 'stones',
    caption: 'The sounding path — six stones of decreasing size hum faintly in the moonlight',
    expect: ['selStones'],
    spots: [
      { id: 'backSel', label: 'back to the landing', yaw: 180, w: 50, h: 36, to: 'selenitic' },
      { id: 'stone0', label: 'the huge first stone', yaw: -14, w: 26, h: 12, act: 'toneStone', tone: 0 },
      { id: 'stone1', label: 'a large stone', yaw: 10, w: 22, h: 12, act: 'toneStone', tone: 1 },
      { id: 'stone2', label: 'a stone, smaller still', yaw: -8, w: 18, h: 12, act: 'toneStone', tone: 2 },
      { id: 'stone3', label: 'a mid-sized stone', yaw: 14, w: 15, h: 12, act: 'toneStone', tone: 3 },
      { id: 'stone4', label: 'a small stone', yaw: -4, w: 12, h: 12, act: 'toneStone', tone: 4 },
      { id: 'stone5', label: 'the smallest stone', yaw: 8, w: 10, h: 12, act: 'toneStone', tone: 5 },
      { id: 'lookMoon', label: 'the low moon over the field', yaw: 40, w: 40, h: 30, act: 'lookMoon' },
      { id: 'toSelThrone', label: 'the opened gate in the cliff', yaw: 0, w: 30, h: 40, to: 'selThrone', need: 'selPath', needMsg: 'A solid slab of green-black rock seals the passage. The stones would know better than you what opens it.' },
    ],
  },
  selThrone: {
    pos: [0, 1.5, -2], yaw: 0, sky: 'selenitic', amb: 'wind',
    caption: 'A stone chamber — a bronze-collared throne faces a window arch, worn with eight notches',
    expect: ['selChair', 'selMoon'],
    spots: [
      { id: 'backSelSound', label: 'back out to the stones', yaw: 180, w: 50, h: 36, to: 'selSound' },
      { id: 'selChair', label: 'swivel the great throne', yaw: 8, w: 30, h: 34, act: 'selChair' },
      { id: 'throneCarving', label: 'a carving above the arch', yaw: 0, w: 26, h: 12, act: 'throneCarving' },
      { id: 'lookMoon', label: 'the moon in the arch', yaw: -16, w: 24, h: 20, act: 'lookMoon' },
      { id: 'toSelGate', label: 'the doorway high in the cliff', yaw: 90, w: 34, h: 40, to: 'selGate', need: 'selAlign', needMsg: 'A seamless wall of rock, cold and green-black. No seam, no handle — the mountain keeps its own counsel.' },
    ],
  },
  selGate: {
    pos: [0, 4.5, -10], yaw: 0, sky: 'selenitic', amb: 'wind',
    caption: 'Terraces cut into the mountain flank — switchback steps climb toward the summit',
    expect: ['selMountain'],
    spots: [
      { id: 'backThrone', label: 'the doorway back into the mountain', yaw: 180, w: 40, h: 36, to: 'selThrone' },
      { id: 'upTop', label: 'the switchback steps', yaw: 24, w: 40, h: 40, to: 'selTop' },
      { id: 'lookMoon', label: 'the moon above the peak', yaw: -30, w: 40, h: 26, act: 'lookMoon' },
    ],
  },
  selTop: {
    pos: [0, 9.5, -6], yaw: 0, sky: 'selenitic', amb: 'wind',
    caption: 'The summit ledge — the moon huge overhead, and a brass gear in a wall slot',
    expect: ['selGear'],
    spots: [
      { id: 'downGate', label: 'down the steps to the terraces', yaw: 180, w: 40, h: 36, to: 'selGate' },
      { id: 'takeGear', label: 'the brass gear in the stone slot', yaw: 0, w: 26, h: 26, act: 'takeGear', gone: 'gearSelenitic' },
      { id: 'lookMoon', label: 'the moon, close enough to touch', yaw: 62, w: 50, h: 34, act: 'lookMoon' },
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
    caption: 'MECHANICAL — the book rests on its pedestal; the tower looms to the north',
    expect: ['mechBookStand'],
    spots: [
      { id: 'retMechanical', label: 'the return panel', yaw: 180, w: 60, h: 36, to: 'library' },
      { id: 'matchbook', label: 'a matchbook on the pedestal rail', yaw: -50, w: 22, h: 22, act: 'takeMatch', gone: 'matchbook' },
      { id: 'pageMechanicalBlue', label: 'a blue page by the steam vent', yaw: -15, w: 24, h: 24, act: 'takePage', page: 'blue:mechanical', gone: 'pageBlue_mechanical' },
      { id: 'toTowerWalk', label: 'the path around the tower base', yaw: 55, w: 70, h: 40, to: 'mechWalk' },
    ],
  },
  mechWalk: {
    pos: [3.2, 1.7, -8.5], yaw: 25, sky: 'mechanical', amb: 'gears',
    caption: 'The tower base — gears the size of houses, and a cage hanging high on its rails',
    expect: ['mechCallLever'],
    spots: [
      { id: 'backLand', label: 'back to the landing', yaw: -140, w: 70, h: 40, to: 'mechanical' },
      { id: 'switchPanel', label: 'a panel of iron switches', yaw: -30, w: 34, h: 30, act: 'switchPanel' },
      { id: 'mechCall', label: 'the cage call lever', yaw: 12, w: 26, h: 34, act: 'mechCall' },
      { id: 'boardCar', label: 'step into the cage', yaw: 8, w: 22, h: 30, to: 'mechCar', need: 'mechCarDown', needMsg: 'The cage hangs twenty metres up its rails. The call lever is bolted to the wall beside it.' },
    ],
  },
  mechCar: {
    pos: [0, 1.7, -6.4], yaw: 0, sky: 'mechanical', amb: 'gears',
    caption: 'Inside the bronze cage — the deck grates over the drop',
    expect: ['mechCageGrate'],
    spots: [
      { id: 'cageRaise', label: 'pull the cage up', yaw: 0, w: 26, h: 34, act: 'cageRaise', visits: 'mechTop' },
      { id: 'cageDescend', label: 'send the cage down', yaw: 0, w: 26, h: 20, act: 'cageDescend' },
      { id: 'cageOut', label: 'step out', yaw: 180, w: 40, h: 30, act: 'cageOut', visits: ['mechTop', 'mechanical'] },
    ],
  },
  mechTop: {
    pos: [0, 1.7, -6.0], yaw: 0, sky: 'mechanical', amb: 'gears',
    caption: 'The gantry at the top of the tower — the control-room door, and a page glinting under a gear',
    expect: ['mechDoorSteel'],
    spots: [
      { id: 'mechSendDown', label: 'the cage send-down lever', yaw: -12, w: 26, h: 30, act: 'mechSendDown' },
      { id: 'mechDoorBtn', label: 'the door release button', yaw: 2, w: 20, h: 22, act: 'mechDoorBtn' },
      { id: 'enterRoom', label: 'through the open door', yaw: 2, w: 24, h: 34, to: 'mechRoom', need: 'mechDoorOpen', needMsg: 'The steel door is shut. Its release jams — something heavy is in the way.' },
      { id: 'cageBoardTop', label: 'step back into the cage', yaw: -18, w: 22, h: 30, act: 'cageBoardTop', visits: 'mechCar' },
      { id: 'pageMechanicalRed', label: 'a red page under a great gear', yaw: 22, w: 24, h: 24, act: 'takePage', page: 'red:mechanical', gone: 'pageRed_mechanical', need: 'switchPanel', needMsg: 'A heavy gear seals the alcove. The switches govern which gears turn.' },
    ],
  },
  mechRoom: {
    pos: [0, 1.7, 1.2], yaw: 180, sky: 'mechanical', amb: 'sphere',
    caption: 'The control room — two floor plates, a latch lever, and the SPECTATOR',
    expect: ['mechSpectator'],
    spots: [
      { id: 'exitRoom', label: 'back out to the gantry', yaw: 0, w: 50, h: 36, to: 'mechTop', need: 'mechDoorOpen', needMsg: 'The door has shut behind you. The plates govern it now.' },
      { id: 'stepPlateD', label: 'the plate beside the door', yaw: -35, w: 24, h: 16, act: 'stepPlateD' },
      { id: 'stepPlateE', label: 'the plate by the cage shaft', yaw: 35, w: 24, h: 16, act: 'stepPlateE' },
      { id: 'mechLatch', label: 'the latch lever between the plates', yaw: 0, w: 22, h: 24, act: 'mechLatch' },
      { id: 'spectator', label: 'the great glass sphere', yaw: 180, w: 34, h: 30, act: 'spectator' },
    ],
  },
  channelwood: {
    pos: [0, 1.7, -24], yaw: 0, sky: 'channelwood', amb: 'falls',
    caption: 'CHANNELWOOD — a world of waterfalls and slow stone stars',
    expect: ['starWheel'],
    spots: [
      { id: 'retChannelwood', label: 'the return panel', yaw: 180, w: 60, h: 36, to: 'cave' },
      { id: 'starWheel', label: 'a great stone star over the falls', yaw: 0, w: 40, h: 34, act: 'starWheel' },
      { id: 'toChanChannels', label: 'the cut stone channels', yaw: -55, w: 60, h: 40, to: 'chanChannels' },
    ],
  },
  chanChannels: {
    pos: [0, 1.7, -40], yaw: 0, sky: 'channelwood', amb: 'falls',
    caption: 'The channels — broad stone cuts brimmed with slow water, running toward the falls',
    expect: ['chanSluice'],
    spots: [
      { id: 'retChanChannels', label: 'back to the landing', yaw: 180, w: 50, h: 36, to: 'channelwood' },
      { id: 'chanFlood', label: 'the great flood lever', yaw: -22, w: 26, h: 32, act: 'chanFlood' },
      { id: 'boardRaft', label: 'the float at the head of the channel', yaw: 12, w: 28, h: 30, to: 'chanWheel', need: 'chanFlood', needMsg: 'The channel runs dry to its sluice; the float sits hard on the mud. The water lever governs it.' },
      { id: 'pageChannelwoodBlue', label: 'a blue page on the wood bridge', yaw: 55, w: 24, h: 24, act: 'takePage', page: 'blue:channelwood', gone: 'pageBlue_channelwood' },
      { id: 'lookFalls', label: 'the falls at the end of the channels', yaw: 0, w: 44, h: 26, msg: 'Water crowds the sluice and pours over the lip beyond — the whole world here drains one way.' },
    ],
  },
  chanWheel: {
    pos: [0, 3.6, -56], yaw: 0, sky: 'channelwood', amb: 'wind',
    caption: 'The star terrace — the great stone wheel turns above the head of the channels',
    expect: ['starWheel'],
    spots: [
      { id: 'retChanWheel', label: 'down off the float', yaw: 180, w: 50, h: 36, to: 'chanChannels' },
      { id: 'starWheel', label: 'the great stone star', yaw: 0, w: 40, h: 34, act: 'starWheel' },
      { id: 'pageChannelwoodRed', label: 'a red page in the wheel shelter', yaw: -50, w: 24, h: 24, act: 'takePage', page: 'red:channelwood', gone: 'pageRed_channelwood' },
      { id: 'lookFalls2', label: 'the falls, far below', yaw: 30, w: 40, h: 26, msg: 'From the terrace the channels are dark ribbons sewing the island shut, all of them running to the lip.' },
    ],
  },
}

export const AGE_LIST = ['selenitic', 'stoneship', 'mechanical', 'channelwood']
