# ALINED — website

Scene One of an interactive film introducing ALINED, the design intelligence
layer for architects.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
npm run preview
```

---

## Scene One — "From Nothing"

One continuous camera move over roughly 15–20 seconds of unhurried scrolling.
There are no sections and no cuts.

| beat | what happens |
|---|---|
| **nothing** | warm paper, and one red dot waking on it, alone |
| **thought** | the field wakes bead by bead, in the dot's wake |
| **geometry** | anchors find each other; lines draw ahead of the camera |
| **alignment** | depth collapses — every bead agrees on a single plane |
| **ALINED** | the word is what they spelled, and the dot takes its place |

### The idea

The logotype is not a typeface with a dot texture over it — it is a chain of
discrete beads that happen to spell a word. That is also what the product does:
a drawing is a set of anchors, and structure is derived from them.

So the beads in this scene are not "particles arranged to look like a logo".
They are anchors — they hold up the architecture during the fly-through, and
when the camera reaches the one viewpoint where they agree, they *are* the
logotype. **alined = aligned.** The name is the mechanic.

### Rules the code keeps

- **Nothing appears; everything becomes.** No element fades in from nothing.
  Beads travel between three positions they carry as attributes.
- **Red means the machine understood.** `#f5341b` is never decorative. It is
  the dot, the tittle, and the tagline — nothing else.
- **The paper is never left.** `#faf6ee` from the first frame to the last.
- **The wordmark's beads are the architecture's anchors**, chosen by nearest
  match to an exploded copy of the word, so the convergence reads as depth
  collapsing rather than as a shuffle.

---

## How it is built

`three` + `@react-three/fiber`, no helper libraries. One `<Canvas>`.

| file | role |
|---|---|
| `hero/Hero.jsx` | sticky stage, scroll length, reduced-motion branch |
| `hero/Scene.jsx` | camera rig, the beat clock, lockup grid, `i` tittle |
| `hero/ParticleField.jsx` | every bead — one `Points`, one draw call |
| `hero/ArchitectureLines.jsx` | the drawn lines, revealed along the corridor |
| `hero/RedDot.jsx` | the intelligence dot: spring, breath, aura |
| `hero/wordmark.js` | rasterise `alined`, sample it into beads |
| `hero/architecture.js` | procedural massing, planes and plates |
| `hero/dotPath.js` | the dot's route — also the field's reveal order |
| `hero/tokens.js` | brand colours and the beat sheet |

**Performance.** Beads are a single `Points` with a custom shader; positions are
never touched on the CPU, so scroll cost is independent of bead count. Scroll
position lives in a ref, not in state, so scrolling triggers no React renders.
Geometries and materials are explicitly disposed on unmount. The canvas stops
rendering when the stage leaves the viewport.

**Accessibility.** `prefers-reduced-motion` collapses the hero to a single
viewport holding the resolved final frame — the same image, no vestibular load.
The scene's message is also in a visually-hidden `<h1>` for screen readers,
crawlers, and any browser without WebGL.

**Typography.** Outfit is self-hosted (`public/fonts`, SIL OFL) rather than
loaded from Google Fonts. The wordmark's geometry is produced by rasterising
this face and sampling it, so a font that failed to arrive would change the
logo's shape.

---

## Known limits

- **The wordmark is an approximation.** It is sampled from Outfit, which is a
  close geometric match but not the real ALINED letterform. Supplying the
  logotype as **SVG paths** would make the final frame exact — that is the
  single highest-value asset for this scene.
- **`RED` is eyeballed** from the supplied artwork (`hero/tokens.js`). If there
  is an official brand hex, change it in that one place.
- **Frame rate is unverified on real hardware.** It was developed against
  software WebGL (SwiftShader), which is not indicative. It needs a pass on an
  actual GPU, and on the target Android tablet, before it can be called done.
- Scene One only. The remaining movements — thought, geometry, architecture,
  intelligence — are not built, and nothing follows the hero.
