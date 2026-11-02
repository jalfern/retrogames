// ULTIMA II — js-dos shell (#1451). Shared shell (components/DosShell); the
// bar carries this title's verbs: A attack · C cast · G get · O open ·
// T transact · V view stats. B (buy)/S (sell) and the rest live on the ⌨ sheet.
import DosShell from '../../components/DosShell'

const Ultima2Game = () => (
  <DosShell bundleUrl="games/ultima2.jsdos" label="ULTIMA II" keys={['A', 'C', 'G', 'O', 'T', 'V']} />
)

export default Ultima2Game
