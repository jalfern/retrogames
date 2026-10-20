// LEMMINGS-LITE — first-run layout, shared with `lemcheck` (#422 items 3-5).
//
// Plain data so the audit can gate it in Node: the dock height that keeps the
// skill bar off the playfield, the attract instruction lines (short enough to
// never clip at 640 px), the HUD count wording, and the badge colors that make
// climbers/diggers readable at a glance.

export const LAYOUT = {
    panelReserve: 52,                     // px docked below the canvas while playing
    maxTextW: 46,                       // widest attract line, in characters
    attractLines: [
        'hold a lemming to preview · release to assign',
        'tap a skill button to pick it',
        'keys: arrows aim · Space assigns · 1-4 pick',
        'this demo replays a proven solution on screen',
    ],
    badge: { climber: '#ffd83d', digger: '#9ad6ff' },
    hud: { pre: 'IN PLAY ', mid: ' · LOST ' },
}
