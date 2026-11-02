# ULTIMA I–V — DOS shells

Emulated DOS titles (js-dos / DOSBox-in-wasm). All five shells are thin
wrappers over the shared `src/components/DosShell.jsx`, which owns: the
`mountDos` boot (`before: installDosKeys` — the key-handler capture must be
armed before the emulator registers its listeners), pause overlay, the text
field for name entry, the DEV hook `__dosTest`, and the touch pad.

## Controls (#1451 — Jon's iPhone feedback)

Ultima I–V are single-keypress games: arrows move, letters are verbs. The
original shells offered only ESC/↵/␣ + a text field, so on a phone the games
were unplayable mid-game. The bar now carries, through `utils/dosKeys` (the
proven direct-call actuator — js-dos 8 binds keys on `window`):

- **d-pad** ←↑↓→ step-movement (Ultima also takes numpad diagonals via the ⌨ sheet's digits only where a game maps them; arrows are the honest path)
- **primary verbs** per title (declared in each `index.jsx`, curated from that game's command set)
- **ESC / ↵ / ␣** — intros, dialogs, combat timing
- **⌨ KEYS** — full A–Z + digits sheet: every command in any of the five is two taps away, so a curated pick can never strand a verb (digits matter: Ultima I spell levels are numbers)

Per-title primary verbs:

| title | bar keys |
|---|---|
| ULTIMA I | A C G I O S T Z |
| ULTIMA II | A C G O T V |
| ULTIMA III | A B C E G O T Z |
| ULTIMA IV | A C L O S T X Z |
| ULTIMA V | A B C E J O S T |

## Gate

`npm run doscheck` (alias `doscheck`, `scripts/doscheck.mjs`):
- static: every Ultima shell must route through `components/DosShell` and
  declare ≥6 primary verbs — catches the 3-key-bar regression without booting;
- live (`ultima1`): `__dosTest` exists, the pad declares arrows + verbs + the
  36-key sheet, the pad buttons are on screen, the `window` key handler was
  captured, and an injected key advances the guest frame **past resting drift**
  (a hash move alone is vacuous on an animated screen, so the resting baseline
  is measured first).
