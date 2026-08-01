/**
 * The ALINED logotype, authored — not sampled from a typeface.
 *
 * The first build rasterised the word in Outfit and sampled the bitmap on a
 * lattice. It got the FEEL right and the mark wrong, and it always would have:
 * Outfit is somebody else's alphabet, so every proportion, every counter and
 * every join was an approximation of a letterform it had never seen. No amount
 * of tuning sampling parameters closes that gap.
 *
 * So the alphabet is drawn here instead, the way the mark is actually built: a
 * MONOLINE GEOMETRIC skeleton on a unit grid, with beads walked along each
 * stroke at a fixed pitch. Six glyphs, a handful of strokes each. That buys
 * exact control over proportion, bead pitch, overlap and the two red marks —
 * and it removes the webfont from the mark's critical path entirely, so the
 * logo can no longer change shape because a font did or did not arrive.
 *
 * ── The grid ──────────────────────────────────────────────────────────────
 *
 *   1 unit  = one bead pitch
 *   y = 0   baseline
 *   y = 4   x-height        (5 beads tall — matches the reference's counts)
 *   y = 7   ascender        (l, d)
 *
 * Bead diameter is slightly OVER one pitch, so neighbours chain into a
 * continuous stroke while each bead stays visibly individual. That ratio is
 * the single most characteristic thing about the mark: too small and it reads
 * as a dotted line, too large and the letters fill in and become a fat font.
 *
 * Pure geometry — no DOM, no canvas, no three. Testable in node.
 */

const X_HEIGHT = 4
const ASCENDER = 7
const PITCH = 1
const BEAD = 1.16 // diameter, in pitches — chained but individual
const R = 1.35 // corner radius of the geometric bowls

/** Tessellate an arc into a polyline fine enough that bead spacing stays even. */
function arc(cx, cy, r, a0, a1, out) {
  const steps = Math.max(4, Math.ceil((Math.abs(a1 - a0) * r) / 0.25))
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
  }
}

/**
 * A bowl: a rectangle with PER-CORNER radii, walked anticlockwise from the
 * bottom-left.
 *
 * Per-corner rather than uniform, because a geometric `a` and `d` have a
 * STRAIGHT right side — that side IS the stem, and it is what separates an `a`
 * from an `o`. Rounding it produces a bowl the stem then has to meet at a
 * tangent it does not share, which is exactly the notch that appeared between
 * the `d`'s bowl and its ascender.
 */
function bowl(x, y, w, h, [tl, tr, br, bl]) {
  const p = []
  const HP = Math.PI / 2
  p.push([x, y + bl])
  if (tl) arc(x + tl, y + h - tl, tl, Math.PI, HP, p)
  else p.push([x, y + h])
  p.push([x + w - tr, y + h])
  if (tr) arc(x + w - tr, y + h - tr, tr, HP, 0, p)
  p.push([x + w, y + br])
  if (br) arc(x + w - br, y + br, br, 0, -HP, p)
  else p.push([x + w, y])
  p.push([x + bl, y])
  if (bl) arc(x + bl, y + bl, bl, -HP, -Math.PI, p)
  p.push([x, y + bl])
  return p
}

const vline = (x, y0, y1) => [
  [x, y0],
  [x, y1],
]
const hline = (y, x0, x1) => [
  [x0, y],
  [x1, y],
]

/**
 * The alphabet.
 *
 * `w` is the glyph's ink width; `adv` its advance, so the narrow letters carry
 * their own sidebearings instead of inheriting a single gap that is right for a
 * four-unit bowl and far too wide for a one-unit stem.
 */
const BAR_Y = 2.0
const HP = Math.PI / 2

/**
 * The clear space between two letters' rendered edges.
 *
 * Advance is derived from it rather than authored per glyph: ink width, plus
 * one bead diameter for the half-bead each extreme overhangs, plus the gap.
 * A single flat `adv` per letter cannot do this — beads overhang a bowl's ink
 * box on both sides but a bare stem's ink box has NO width at all, so the same
 * number produced a 0.34-unit gap between `a` and `l` and a 1.24-unit gap
 * between `l` and `i`. Nearly four to one, on a mark whose whole character is
 * even rhythm; it read as two words.
 */
const GAP = 0.85
const adv = (inkW) => inkW + BEAD + GAP

/**
 * The `e` is the one letter that cannot be a closed bowl with a bar across it.
 * Its form IS its aperture: a ring broken through the lower right, the
 * crossbar's terminal forming the mouth's upper lip.
 *
 * It was built by FILTERING beads out of a finished bowl, which cannot work.
 * Removing a span from the middle of a polyline leaves its two cut ends
 * ADJACENT, and the bead walk then lays a straight run of beads across the
 * gap — so the letter gained a chord through its own counter and a clot where
 * the bar met the ring, and read as an `8`. An open path has to be authored as
 * an open path.
 */
const eRing = (() => {
  const p = [[4 - R, 0]] // terminal: the bottom edge's right end
  p.push([R, 0])
  arc(R, R, R, -HP, -Math.PI, p) // bottom-left
  p.push([0, X_HEIGHT - R])
  arc(R, X_HEIGHT - R, R, Math.PI, HP, p) // top-left
  p.push([4 - R, X_HEIGHT])
  arc(4 - R, X_HEIGHT - R, R, HP, 0, p) // top-right
  p.push([4, BAR_Y]) // down the right side, stopping at the bar
  return p
})()

const GLYPHS = {
  // Straight right side — the stem that makes it an `a`.
  a: { w: 4, adv: adv(4), strokes: [bowl(0, 0, 4, X_HEIGHT, [R, 0, 0, R])] },
  l: { w: 0, adv: adv(0), strokes: [vline(0, 0, ASCENDER)] },
  i: { w: 0, adv: adv(0), strokes: [vline(0, 0, X_HEIGHT)], tittle: [0, X_HEIGHT + 1.95] },
  n: {
    w: 4,
    adv: adv(4),
    strokes: [
      vline(0, 0, X_HEIGHT - 2),
      (() => {
        const p = []
        arc(2, X_HEIGHT - 2, 2, Math.PI, 0, p)
        return p
      })(),
      vline(4, 0, X_HEIGHT - 2),
    ],
  },
  e: { w: 4, adv: adv(4), strokes: [eRing, hline(BAR_Y, 0, 4)] },
  // The ascender is the bowl's own right side, continued. One stroke, no join.
  d: {
    w: 4,
    adv: adv(4),
    strokes: [bowl(0, 0, 4, X_HEIGHT, [R, 0, 0, R]), vline(4, X_HEIGHT, ASCENDER)],
  },
}

/** Walk a polyline, dropping a bead every `pitch` of arc length. */
function walk(points, pitch, out, ox) {
  let carry = 0
  out.push([points[0][0] + ox, points[0][1]])
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1]
    const [x1, y1] = points[i]
    const seg = Math.hypot(x1 - x0, y1 - y0)
    if (seg < 1e-9) continue
    let t = pitch - carry
    while (t <= seg) {
      out.push([x0 + ((x1 - x0) * t) / seg + ox, y0 + ((y1 - y0) * t) / seg])
      t += pitch
    }
    carry = (carry + seg) % pitch
  }
}

/**
 * @param {object} opts
 * @param {number} opts.targetWidth world units the finished lockup spans
 * @returns the same shape `buildWordmark` returned, so it is a drop-in.
 */
export function buildLogotype({ targetWidth = 40, text = 'alined' } = {}) {
  const raw = []
  let tittleGrid = null
  let ascenderX = 0
  let cursor = 0

  for (const ch of text) {
    const g = GLYPHS[ch]
    if (!g) continue
    for (const s of g.strokes) walk(s, PITCH, raw, cursor)
    if (g.tittle) tittleGrid = [g.tittle[0] + cursor, g.tittle[1]]
    if (ch === 'd') ascenderX = cursor + g.w
    cursor += g.adv
  }

  // Merge beads that land on top of each other where strokes meet, or a join
  // renders as a dark clot twice the weight of the stroke it sits in.
  const merged = []
  const minSep = PITCH * 0.55
  for (const p of raw) {
    let dup = false
    for (const q of merged) {
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) < minSep) {
        dup = true
        break
      }
    }
    if (!dup) merged.push(p)
  }

  // ── Grid → world, centred on the origin ─────────────────────────────────
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const [x, y] of merged) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const scale = targetWidth / (maxX - minX)
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const toWorld = (x, y) => [(x - cx) * scale, (y - cy) * scale]

  const count = merged.length
  const points = new Float32Array(count * 3)
  merged.forEach(([x, y], i) => {
    const [wx, wy] = toWorld(x, y)
    points[i * 3] = wx
    points[i * 3 + 1] = wy
    points[i * 3 + 2] = 0
  })

  const dotRadius = (BEAD * scale) / 2

  // The two red marks are PLACED, never found. Locating them by scanning beads
  // is what put the intelligence dot over the `e`: any search is only as good
  // as its assumptions, and here the position is simply known.
  const tittle = tittleGrid ? [...toWorld(tittleGrid[0], tittleGrid[1]), 0] : [0, 0, 0]
  const [ix, iy] = toWorld(ascenderX, ASCENDER + 1.75)

  return {
    points,
    count,
    // The tittle is drawn as its own mark, and no bead occupies it.
    tittleIndices: [],
    tittle: [tittle[0], tittle[1], 0],
    intelligenceDot: [ix, iy, 0],
    dotRadius,
    /** The free mark is visibly larger than a letter bead in the artwork. */
    dotScale: 1.45,
    tittleScale: 1.1,
    width: targetWidth,
    height: (maxY - minY) * scale,
    bottomY: (minY - cy) * scale,
  }
}
