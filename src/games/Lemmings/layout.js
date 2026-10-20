// LEMMINGS-LITE — first-run layout, shared with `lemcheck` (#422 items 3-5).
//
// Plain data so the audit can gate it in Node: the dock height that keeps the
// skill bar off the playfield, the HUD count wording, and the badge colors
// that make climbers/diggers readable at a glance. The attract copy moved to
// ./attract.js in the #365 rule-6 sweep (one cycling message, no wall).

export const LAYOUT = {
    panelReserve: 52,                     // px docked below the canvas while playing
    badge: { climber: '#ffd83d', digger: '#9ad6ff' },
    hud: { pre: 'IN PLAY ', mid: ' · LOST ' },
}
