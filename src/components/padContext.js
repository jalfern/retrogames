import { createContext } from 'react'

// The current game's `pad` declaration (the optional `pad` field on each entry
// of src/config/games.js), provided by GameRoute so the GamepadBridge (which
// B-button code to dispatch) and VirtualControls (which B-button label to show)
// read one source of truth instead of each game hard-coding a secondAction prop.
// Null when the game declares no pad — everything then behaves exactly as before.
export const PadContext = createContext(null)
