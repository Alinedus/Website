/**
 * The wordmark, rebuilt as anchor points.
 *
 * The ALINED logotype is not a typeface with a dot texture over it — it is a
 * chain of discrete beads that happen to spell a word. That is also, exactly,
 * what the product does: a drawing is a set of anchors, and structure is
 * derived from them. So the hero's final frame is not "particles arranged to
 * look like a logo". The particles ARE the logo, at its own construction.
 *
 * We rasterise the word once to an offscreen canvas and sample it on a regular
 * lattice. Sampling at a step close to the glyph's own stroke width yields a
 * one-to-two bead chain rather than a filled slab, which is the logo's actual
 * construction. The renderer then draws each bead at a radius slightly larger
 * than half the lattice step, so neighbours overlap into continuous strokes —
 * the chained look of the artwork, with no glyph outlines involved.
 *
 * Everything here is pure geometry: no React, no three, no DOM beyond the
 * offscreen canvas.
 */

const TEXT = 'alined'
const FONT_PX = 200
const FONT_WEIGHT = 400
const SAMPLE_STEP = 15 // lattice pitch ≈ the stem width, so a stroke is ONE bead
const ALPHA_MIN = 140 // coverage needed for a bead to exist
const TARGET_WIDTH = 40 // world units the finished lockup spans
const LETTER_SPACING = '0.07em'

/** Wait for the face so we sample Outfit, not a fallback with other metrics. */
async function fontReady() {
  if (typeof document === 'undefined' || !document.fonts) return
  try {
    await document.fonts.load(`${FONT_WEIGHT} ${FONT_PX}px Outfit`)
    await document.fonts.ready
  } catch {
    /* fall through to whatever the platform gives us */
  }
}

/**
 * @returns {Promise<{
 *   points: Float32Array,      // xyz per bead, centred on the origin, z = 0
 *   count: number,
 *   tittleIndices: number[],   // beads the `i`'s tittle occupies (excluded)
 *   tittle: [number, number, number],          // where the red tittle sits
 *   intelligenceDot: [number, number, number], // the free red dot over the `d`
 *   dotRadius: number,         // world radius that makes neighbours chain
 *   width: number,
 *   height: number,
 *   bottomY: number,           // baseline-ish anchor for the tagline
 * }>}
 */
export async function buildWordmark() {
  await fontReady()

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const font = `${FONT_WEIGHT} ${FONT_PX}px Outfit, system-ui, sans-serif`

  // Measure first so the bitmap is only as large as it needs to be.
  ctx.font = font
  if ('letterSpacing' in ctx) ctx.letterSpacing = LETTER_SPACING
  const m = ctx.measureText(TEXT)
  const ascent = m.actualBoundingBoxAscent || FONT_PX * 0.75
  const descent = m.actualBoundingBoxDescent || FONT_PX * 0.25
  const pad = Math.ceil(FONT_PX * 0.4)

  canvas.width = Math.ceil(m.width) + pad * 2
  canvas.height = Math.ceil(ascent + descent) + pad * 2

  // Re-set: resizing a canvas clears its 2D state.
  ctx.font = font
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#000'
  // The artwork sets the beads with air between the letters; without a little
  // tracking the chains of adjacent glyphs touch and the word closes up.
  if ('letterSpacing' in ctx) ctx.letterSpacing = LETTER_SPACING
  const baselineY = pad + ascent
  ctx.fillText(TEXT, pad, baselineY)

  const { data, width: W, height: H } = ctx.getImageData(
    0,
    0,
    canvas.width,
    canvas.height
  )

  // ── Sample the lattice ──────────────────────────────────────────────────
  const raw = []
  for (let y = 0; y < H; y += SAMPLE_STEP) {
    for (let x = 0; x < W; x += SAMPLE_STEP) {
      if (data[(y * W + x) * 4 + 3] >= ALPHA_MIN) raw.push([x, y])
    }
  }
  if (!raw.length) throw new Error('wordmark: sampled zero beads')

  // ── Canvas px → world units, centred on the origin ──────────────────────
  const xs = raw.map((p) => p[0])
  const ys = raw.map((p) => p[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  const scale = TARGET_WIDTH / (maxX - minX || 1)
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2

  const count = raw.length
  const points = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    points[i * 3 + 0] = (raw[i][0] - cx) * scale
    points[i * 3 + 1] = -(raw[i][1] - cy) * scale // canvas y grows down
    points[i * 3 + 2] = 0
  }

  // ── Locate the two red marks ────────────────────────────────────────────
  // Both are found from the sampled beads rather than from font metrics, so
  // they stay correct if the typeface, weight or lattice pitch is ever
  // changed. `i` is the third glyph and `d` the sixth; their approximate
  // centres come from prefix measurement, and the actual mark is the topmost
  // bead in a narrow column around each.
  const columnCentre = (glyphIndex) => {
    const before = ctx.measureText(TEXT.slice(0, glyphIndex)).width
    const own = ctx.measureText(TEXT[glyphIndex]).width
    return ((pad + before + own / 2 - cx) * scale)
  }

  const topmostNear = (worldX, halfBand) => {
    let best = -1
    let bestY = -Infinity
    for (let i = 0; i < count; i++) {
      const px = points[i * 3]
      if (Math.abs(px - worldX) > halfBand) continue
      const py = points[i * 3 + 1]
      if (py > bestY) {
        bestY = py
        best = i
      }
    }
    return { index: best, y: bestY }
  }

  const band = TARGET_WIDTH * 0.045
  const iTittle = topmostNear(columnCentre(2), band) // dot of the `i`
  const dAscender = topmostNear(columnCentre(5), band) // top of the `d` stem

  const dotRadius = SAMPLE_STEP * scale * 0.62 // > half-pitch ⇒ beads chain

  // The tittle is a mark, not a bead: at this lattice pitch it can sample to
  // two or three beads stacked, and colouring only the topmost leaves a black
  // one hanging under a red one. Claim the whole cluster — everything in the
  // `i`'s column sitting clear of the x-height.
  const tittleIndices = []
  if (iTittle.index >= 0) {
    const xi = points[iTittle.index * 3]
    for (let i = 0; i < count; i++) {
      if (Math.abs(points[i * 3] - xi) > dotRadius * 1.8) continue
      if (points[i * 3 + 1] < iTittle.y - dotRadius * 2.2) continue
      tittleIndices.push(i)
    }
  }

  // The tittle renders as its own round mark, not as tinted beads: at this
  // lattice pitch the cluster is two or three beads tall, which reads as a red
  // dash rather than the single dot the artwork draws.
  let tittle = [0, 0, 0]
  if (tittleIndices.length) {
    let sx = 0
    let sy = 0
    for (const i of tittleIndices) {
      sx += points[i * 3]
      sy += points[i * 3 + 1]
    }
    tittle = [sx / tittleIndices.length, sy / tittleIndices.length, 0]
  }

  // The free red dot sits clear of the `d`'s ascender, as in the artwork —
  // it belongs to no letter, which is the whole point of it.
  const intelligenceDot = [
    columnCentre(5),
    dAscender.y + dotRadius * 3.1,
    0,
  ]

  return {
    points,
    count,
    tittleIndices,
    tittle,
    intelligenceDot,
    dotRadius,
    width: TARGET_WIDTH,
    height: (maxY - minY) * scale,
    bottomY: -(maxY - cy) * scale,
  }
}
