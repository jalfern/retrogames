# /retrogames/demos/

Self-contained technology demos (Jon, 2026-10-19: demos live only here — no
registry entries, no arcade links). Each demo is one HTML file; the only
permitted sibling files are shared generators (`ocean.stars.js`, `credits.js`)
loaded by relative `<script src>` — never absolute URLs (the per-demo `*check`
"self-contained" gates enforce that).

## Adding a demo — checklist

1. `public/demos/<name>.html` — self-contained, zero libraries, synthesized
   audio only (unlock on first click), drag-to-look, a `__<name>Test` DEV hook
   (`ready`, `frames`, `setPose`, …) so the harness can sense it.
2. Credits card (#674) — mandatory, two tags before `</body>`:

   ```html
   <script>
   window.DEMO_CREDITS = {
     name: 'NAME', accent: '#rrggbb',        // accent = the demo's own key color
     issues: [123], span: '~Nh', shipped: 'YYYY-MM-DD',
     assist: 'solo',                        // solo = goal only | guided = methods spelled out
     note: 'one honest line about the brief',
   };
   </script>
   <script src="credits.js"></script>
   ```

   `credits.js` renders the bottom-right `BUILT BY QWEN ▸` tag and the card
   (model + Mac Studio, issue link, issue→ship span, help level). Keep the
   facts honest: `assist` must match the wording of the source issue;
   `span` is the issue-opened→shipped span, labelled as such on the card.
   Builder model is centralized in `credits.js` (`MODEL`).
3. Link it from `index.html`: a card with `id="<name>"`, href resolved from
   `base` in the page script, an entry in `window.DEMO_INDEX` (same four
   facts), and the card stays inside `.wrap`.
4. `npm run creditscheck` — proves every demo + the index carry complete,
   consistent credit cards (and opens one card in headless Chrome).
5. `scripts/<name>check.mjs` + npm alias — the demo's own pixel gate.

## Files

- `credits.js` — shared credits injector (#674), configured via
  `window.DEMO_CREDITS` (demos) / `window.DEMO_INDEX` (the index page).
- `ocean.stars.js` — Yale BSC star data for OCEAN/MOUNTAINS skies
  (`node scripts/build-ocean-stars.mjs` regenerates).
