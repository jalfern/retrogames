// ULTIMA I — js-dos shell (#1451). The shell is shared (components/DosShell);
// this file declares only the bundle and the primary verbs a phone player needs
// mid-game: A attack · C cast · G get · I inform (talk) · O open · S steal ·
// T transact · Z ztats. Everything else (D drop, R ready, U unlock, W wear,
// X exit, digits for spell levels) is on the ⌨ sheet.
import DosShell from '../../components/DosShell'

const Ultima1Game = () => (
  <DosShell bundleUrl="games/ultima1.jsdos" label="ULTIMA I" keys={['A', 'C', 'G', 'I', 'O', 'S', 'T', 'Z']} />
)

export default Ultima1Game
