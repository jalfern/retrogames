# ART.md — the look-and-feel bar

Read this before you draw anything. Then read the exemplars: they are the bar.

## Exemplars (match these, not adjectives)

- **SUPER MARIO** — `src/games/SuperMario/index.jsx`, `drawMario` / `drawGoomba`
  (~line 1565). Built in one shot and still the best-looking 2D title here:
  animated sprites, the original's palette, everything moves.
- **IRONKEEP** — `src/games/IronKeep/art.js`. Every texture, sprite and glyph
  generated in code: shade tables, seeded noise, a palette per material.
- **RACCOON HEIST** — `src/games/RaccoonHeist/art.js` + `audio.js`. Procedural
  textures (`fbm`, `makeTex`), lighting, and sound on every action.

## The bar

1. It looks like the original at a glance: the platform's palette, resolution
   and proportions. Someone who played it recognizes it in five seconds.
2. Everything that moves animates: 2–4 frames minimum for walk, run, climb,
   fall, die.
3. Texture, not flat fills: bricks have mortar, ground has grain, skies have
   gradients.
4. A sound on every action (jump, hit, pickup, death), synthesized via
   `AudioController`.
5. Juice: flashes, particles, screen shake on impact, a death animation.
6. The attract mode shows the game off, not a static title.

Original pixel art in the era's style, generated in code. Never copy sprites
or artwork from the original game.
