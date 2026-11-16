#!/bin/zsh
# Render parity (README "Render parity"): the native diorama against the web's
# own frames. `--web` first recaptures parity/web with render.js in Chrome
# (Vite + system Chrome, GPU WebGL2) — do that after any render.js / art.js change.
set -e
cd "${0:A:h}/.."
if [[ "$1" == "--web" ]]; then node scripts/webframes.mjs; fi
swift build -q -c release --product emberwood-render
.build/release/emberwood-render frames
.build/release/emberwood-render compare
