# alined — the website

A scroll-driven film in fourteen viewports. A figure walks a staircase he can
climb all day and arrive exactly where he began; at the halfway mark the loop is
cut, pulled straight, and the ground inverts. The second act rebuilds the same
object in one continuous gesture and ends on the logo.

Vanilla TypeScript and Three.js — no framework. One continuous 3D timeline
driven by a single scroll progress value, with the DOM layer reading its timing
from the same map, so the two can never drift.

## Running it

```bash
cd site
npm install
npm run dev
```

`npm run build` writes `site/dist`; `npm run preview` serves that build.

From the repo root, `npm run build`, `npm run dev` and `npm run preview` all
delegate into `site/`.

## Layout

| | |
|---|---|
| `site/src` | the film — see the map below |
| `site/public` | the two Geist faces and the logo SVGs |
| `brand-assets` | the full brand kit: logos, palette, both typefaces |
| `alined-website-plan.html` | the original written plan |

The interesting files, in the order the film uses them:

- `scenes.ts` — the scroll map. **Single source of truth for all timing.** Every
  other file reads its ranges from here.
- `circuit.ts` — the loop: a chain of treads that solves from ring to line.
- `figure.ts` / `figureView.ts` — the walker, solved from stride distance rather
  than time, so his feet never slide.
- `stage.ts` — the WebGL layer. Owns the camera, the circuit and the two figures.
- `artifact.ts` — the building: a bubble diagram that becomes a plan, then a
  model, then a finished house.
- `ui.ts` — the DOM layer: copy, counters, station labels, the sign-off.
- `stations.ts` / `act2.ts` — all the copy, and nothing else.

## Deploying

Vercel builds from `main`. Either root directory works:

- **Root = `site`** (cleaner) — Vercel reads `site/vercel.json`.
- **Root = repo root** — Vercel reads `vercel.json`, which delegates into `site/`.

The two configs are kept equivalent on purpose, so the root directory is a
preference rather than something that has to be right.

### Why the cache headers are what they are

Both configs set two `Cache-Control` rules, and the split matters:

- `/assets/*` gets **a year, immutable**. Vite content-hashes these, so any
  change ships under a new filename — the old one can never go stale.
- `/fonts/*` and `/logo/*` get **a day**. These keep their filenames, so a long
  cache would mean swapping a logo takes twelve months to reach anyone.

`vercel.json` cannot carry comments: the schema sets `additionalProperties:
false`, so an invented `comment` key fails validation and the deploy never
starts. That is why this explanation is here instead. Validate changes against
`https://openapi.vercel.sh/vercel.json` rather than by deploying and seeing.

## Notes

- **`site/src/act2.ts` → `FORM_ENDPOINT`** is empty, so the sign-off's message
  box opens the visitor's own mail client. Set it to a form endpoint and the
  same form posts in the background instead. Nothing else changes.
- `?loop=ring` and `?loop=stair` switch Act I's shape for comparison.
- `?instant` skips the preloader — useful when testing a specific scroll point.
