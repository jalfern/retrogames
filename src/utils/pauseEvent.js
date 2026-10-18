// The synthetic '?' (#437). VirtualControls already drives games with synthetic
// KeyboardEvents on window; PAUSE does the same for the help/pause key. One
// event object satisfies both pause dialects used across the catalog:
// `e.key === '?'` and `e.shiftKey && e.code === 'Slash'`.

export const PAUSE_EVENT_PROPS = { key: '?', code: 'Slash', shiftKey: true }

export function dispatchPause() {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...PAUSE_EVENT_PROPS }))
    window.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, ...PAUSE_EVENT_PROPS }))
}
