// ULTIMA V — js-dos shell (#1451). Shared shell (components/DosShell); the
// bar carries this title's verbs: A attack · B board · C cast · E enter ·
// J jimmy · O open · S search · T talk. F fire, G get, I ignite, K klimb,
// L look, M mix, P push, R ready, U use, V view, W wear, X exit, Z ztats
// are on the ⌨ sheet.
import DosShell from '../../components/DosShell'

const Ultima5Game = () => (
  <DosShell bundleUrl="games/ultima5.jsdos" label="ULTIMA V" keys={['A', 'B', 'C', 'E', 'J', 'O', 'S', 'T']} />
)

export default Ultima5Game
