// ULTIMA IV — js-dos shell (#1451). Shared shell (components/DosShell); the
// bar carries this title's verbs: A attack · C cast · L locate · O open ·
// S search · T talk · X exit · Z ztats. J jimmy, M mix, P peer, R ready,
// U use, W wear, Y yell are on the ⌨ sheet.
import DosShell from '../../components/DosShell'

const Ultima4Game = () => (
  <DosShell bundleUrl="games/ultima4.jsdos" label="ULTIMA IV" keys={['A', 'C', 'L', 'O', 'S', 'T', 'X', 'Z']} />
)

export default Ultima4Game
