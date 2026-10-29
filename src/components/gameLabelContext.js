// The label/theme/footer the Layout footer renders under the game. A game can
// set it dynamically (e.g. footer 'none' while the touch pad owns the bottom
// band) — the route wrapper sets the registry values on mount.
import { createContext } from 'react'

export const GameLabelContext = createContext({
  label: '',
  setGameInfo: () => { }
})
