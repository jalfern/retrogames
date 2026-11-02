// ULTIMA III — js-dos shell (#1451). Shared shell (components/DosShell); the
// bar carries this title's verbs: A attack · B board · C cast · E enter ·
// G get · O open · T talk · Z ztats. K klimb, L look, R ready, W wear, X exit
// are on the ⌨ sheet.
import DosShell from '../../components/DosShell'

const Ultima3Game = () => (
  <DosShell bundleUrl="games/ultima3.jsdos" label="ULTIMA III" keys={['A', 'B', 'C', 'E', 'G', 'O', 'T', 'Z']} />
)

export default Ultima3Game
