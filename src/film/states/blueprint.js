import { emptyState, put } from './index.js'

/**
 * blueprint — the logotype read back as a footprint.
 *
 * The word is not illustrated as a building and no building is drawn over it.
 * Every bead of the logotype is taken to be a point on a wall CENTRELINE, and
 * the plan is derived from that the way the product derives structure from
 * anchors: a wall gets two faces, the space between them gets poche, the bays
 * get dimensioned, the one thing the drawing has understood gets a column, and
 * a section is cut through it. Nothing is authored twice — move a letter and
 * every one of those would follow.
 *
 * ── Why the faces are offset by (w/2 − beadRadius) and not by w/2 ─────────
 *
 * The logotype's stroke is a chain of beads of radius r, so its silhouette edge
 * lies exactly r from the centreline. A hollow wall has to put its two faces
 * where that edge already is, or the whole word visibly inflates or deflates as
 * the plan opens. Placing a face bead's CENTRE at the edge would push its own
 * outer edge a further radius out; placing it at (r − faceRadius) lands the
 * outer edge on r exactly. So the wall opens from the inside and the silhouette
 * never breathes — the drawing hollows out rather than growing.
 *
 * ── Identity ──────────────────────────────────────────────────────────────
 *
 * Each bead owns a CONTIGUOUS group of 2·S slots, walked as a boustrophedon
 * around the wall — out along face A, back along face B — so consecutive
 * indices are always the same few centimetres of wall:
 *
 *   bead k, slot 0        face A at the bead        — the wall's near face
 *   bead k, slots 1..S-1  face A walking into the gap the sampler left to the
 *                         next bead, so a face reads as a drafted line rather
 *                         than a dotted one. S adapts to the lattice.
 *   bead k, slots S..2S-1 face B, coming back the other way
 *   … hatch               poche, walked in bead order so it tracks the letters
 *   tail                  column, section cut, dimension chains, sheet marks
 *
 * ── Which POOL index each of those groups lands on ────────────────────────
 *
 * Slot 0 of bead k goes to the pool index that is ALREADY CARRYING bead k —
 * `ctx.wordOf`, the film's own letter assignment. That is the whole transition:
 * the point you are looking at moves a third of a bead sideways and becomes a
 * wall face, so the word visibly splits open rather than dissolving while a
 * drawing assembles somewhere else.
 *
 * This used to assume the wordmark state held bead k at index k. It does not,
 * and never did: `assignWordmark` gives each bead the architectural ANCHOR
 * nearest its exploded position, so bead k lives at an essentially arbitrary
 * index (measured: 0 of 20 beads landed on their own index). The transition
 * was therefore the re-shuffle this comment used to warn about — measured at
 * 98% of the noise floor, i.e. indistinguishable from randomising the pool.
 * Reading `wordOf` removes the assumption instead of restating it.
 *
 * Every other slot is handed out in ascending index order over whatever is
 * left, which is a monotone map and so preserves the coherence of the hatch
 * and the apparatus. With no `ctx.wordOf` the permutation is the identity and
 * the state is byte-identical to a plain linear layout.
 *
 * ── Drafting hierarchy ────────────────────────────────────────────────────
 *
 * Line weights are not decoration, they are the reading order of a drawing:
 * section cut heaviest, then the wall faces, then the sheet and its ticks, then
 * the dimensions, and poche lightest of all. Sizes below encode exactly that.
 *
 * Everything is at z = 0. The movement's camera flattens the view optically;
 * here flatness is literally the subject, so the geometry is flat too.
 */

/** The lattice PointPool's DRAFT motion quantises onto. */
const RULE = 0.25
const ruled = (v) => Math.round(v / RULE) * RULE

/**
 * Sheet, as a fraction of the logotype's width, so the drawing sits in the same
 * proportion of its sheet whatever the lockup measures.
 */
const SHEET_W_FRAC = 0.675
const SHEET_H_FRAC = 0.3
const SHEET_INSET = 1.6 // registration crosses sit this far inside the trim
const BRACKET = 3.2 // corner crop bracket leg

/* ── Neighbourhood ────────────────────────────────────────────────────────
 *
 * The wordmark arrives as a lattice of samples with no notion of a path, so
 * everything below — direction, spacing, which beads form an isolated mark —
 * has to be recovered from the beads themselves. One uniform grid serves all
 * three queries; at ~700 beads it is the difference between 0.5 ms and 30 ms.
 */

/** Cell key. Bounded to ±2047 cells, i.e. ±1200 world units at any sane pitch. */
const cellKey = (cx, cy) => (cx + 2048) * 4096 + (cy + 2048)

function buildGrid(pts, n, cell) {
  const inv = 1 / cell
  const buckets = new Map()
  for (let i = 0; i < n; i++) {
    const key = cellKey(
      Math.floor(pts[i * 3] * inv),
      Math.floor(pts[i * 3 + 1] * inv)
    )
    const b = buckets.get(key)
    if (b) b.push(i)
    else buckets.set(key, [i])
  }
  return { inv, buckets }
}

/**
 * Candidates within one cell of (x,y). Exact for any query radius ≤ cell.
 *
 * Capped, because the cost of every pass below is (beads × candidates) and a
 * degenerate input — a dense blob rather than a lattice of strokes — would make
 * that quadratic. On a real letterform lattice a cell holds one bead and the
 * cap is never reached, so it costs nothing where it does not matter.
 */
const MAX_NEIGHBOURS = 48

function gather(grid, x, y, out) {
  const cx = Math.floor(x * grid.inv)
  const cy = Math.floor(y * grid.inv)
  for (let a = -1; a <= 1; a++) {
    for (let b = -1; b <= 1; b++) {
      const bucket = grid.buckets.get(cellKey(cx + a, cy + b))
      if (!bucket) continue
      for (let k = 0; k < bucket.length; k++) {
        if (out.length >= MAX_NEIGHBOURS) return
        out.push(bucket[k])
      }
    }
  }
}

/**
 * The lattice pitch, measured rather than assumed.
 *
 * The wordmark's sampling step is private to the sampler, but every threshold
 * here — hatch spacing, what counts as "the next bead along the stroke",
 * whether a mark is isolated — is really a multiple of it. The median nearest
 * neighbour recovers it and ignores the outliers at stroke ends.
 */
function measurePitch(pts, n, grid, fallback) {
  const d = []
  const scratch = []
  for (let i = 0; i < n; i++) {
    const x = pts[i * 3]
    const y = pts[i * 3 + 1]
    scratch.length = 0
    gather(grid, x, y, scratch)
    let best = Infinity
    for (let s = 0; s < scratch.length; s++) {
      const j = scratch[s]
      if (j === i) continue
      const dx = pts[j * 3] - x
      const dy = pts[j * 3 + 1] - y
      const q = dx * dx + dy * dy
      if (q > 1e-12 && q < best) best = q
    }
    if (best < Infinity) d.push(Math.sqrt(best))
  }
  if (!d.length) return fallback
  d.sort((a, b) => a - b)
  const m = d[d.length >> 1]
  return m > 1e-4 && Number.isFinite(m) ? m : fallback
}

/**
 * Local stroke direction per bead, as the principal axis of its neighbourhood.
 *
 * PCA rather than "the vector to the nearest neighbour": a junction or a stroke
 * end has a lopsided neighbourhood, and a two-point estimate flips there. A
 * flipped direction swaps that bead's two wall faces, which reads as a bead
 * jumping across the wall — the one artefact that would shred the plan.
 *
 * Also reports whether the stroke continues forward, which is what tells the
 * infill pass where the gap to the next bead is.
 */
function localFrames(pts, n, grid, radius, pitch) {
  const frames = new Float32Array(n * 4) // dx, dy, nx, ny
  const step = new Int8Array(n) // +1 forward, −1 backward, 0 isolated
  const scratch = []
  const r2 = radius * radius
  const along = pitch * 0.55

  for (let i = 0; i < n; i++) {
    const x = pts[i * 3]
    const y = pts[i * 3 + 1]
    scratch.length = 0
    gather(grid, x, y, scratch)

    let sxx = 0
    let sxy = 0
    let syy = 0
    let mass = 0
    for (let s = 0; s < scratch.length; s++) {
      const j = scratch[s]
      if (j === i) continue
      const dx = pts[j * 3] - x
      const dy = pts[j * 3 + 1] - y
      const q = dx * dx + dy * dy
      if (q > r2 || q < 1e-12) continue
      // Linear falloff: the bead one step away defines the stroke, the one two
      // steps away past a corner should not out-vote it.
      const w = 1 - Math.sqrt(q) / radius
      sxx += w * dx * dx
      sxy += w * dx * dy
      syy += w * dy * dy
      mass += w
    }

    let ex = 1
    let ey = 0
    if (mass > 1e-6) {
      // Principal eigenvector of the 2×2 covariance, closed form.
      const tr = sxx + syy
      const det = sxx * syy - sxy * sxy
      const l = tr * 0.5 + Math.sqrt(Math.max(0, tr * tr * 0.25 - det))
      let vx = sxy
      let vy = l - sxx
      let len = Math.hypot(vx, vy)
      if (len < 1e-9) {
        vx = l - syy
        vy = sxy
        len = Math.hypot(vx, vy)
      }
      if (len > 1e-9) {
        ex = vx / len
        ey = vy / len
      }
    }
    // The eigenvector's sign is arbitrary. Forcing it into the upper half-plane
    // keeps face A and face B on consistent sides along a stroke. The pair of
    // face POSITIONS is symmetric, so the seam where a stroke crosses horizontal
    // costs nothing visually — only which index sits on which side.
    if (ey < -1e-9 || (ey <= 1e-9 && ex < 0)) {
      ex = -ex
      ey = -ey
    }

    frames[i * 4] = ex
    frames[i * 4 + 1] = ey
    frames[i * 4 + 2] = ey // normal = direction rotated −90°
    frames[i * 4 + 3] = -ex

    let dir = 0
    for (let s = 0; s < scratch.length; s++) {
      const j = scratch[s]
      if (j === i) continue
      const dx = pts[j * 3] - x
      const dy = pts[j * 3 + 1] - y
      if (dx * dx + dy * dy > r2) continue
      const t = dx * ex + dy * ey
      if (t > along) {
        dir = 1
        break
      }
      if (t < -along) dir = -1
    }
    step[i] = dir
  }

  return { frames, step }
}

/**
 * The beads of the `i`'s tittle — the drawing's one free-standing mark.
 *
 * In plan a mark that belongs to no wall is a COLUMN, so this is not a
 * decorative choice about where to put red: it is the one element of the
 * footprint that the plan reads as structure rather than enclosure.
 *
 * The wordmark sampler already knows which beads these are and hands them over
 * when it can. Failing that they are recovered geometrically: flood the bead
 * lattice into connected components and take the smallest one sitting above the
 * word's middle. Every letter is a chain of many beads; only the tittle is a
 * cluster of two or three floating on its own.
 */
function resolveTittle(ctx, pts, n, grid, pitch, midY) {
  const given = ctx.wordmark.tittleIndices
  if (Array.isArray(given) && given.length) {
    const clean = given.filter((i) => Number.isInteger(i) && i >= 0 && i < n)
    if (clean.length) return clean
  }

  const comp = new Int32Array(n).fill(-1)
  const linkR2 = Math.pow(Math.min(pitch * 1.5, 1 / grid.inv), 2)
  const stack = []
  const scratch = []
  let nc = 0
  for (let seed = 0; seed < n; seed++) {
    if (comp[seed] >= 0) continue
    comp[seed] = nc
    stack.length = 0
    stack.push(seed)
    while (stack.length) {
      const i = stack.pop()
      const x = pts[i * 3]
      const y = pts[i * 3 + 1]
      scratch.length = 0
      gather(grid, x, y, scratch)
      for (let s = 0; s < scratch.length; s++) {
        const j = scratch[s]
        if (comp[j] >= 0) continue
        const dx = pts[j * 3] - x
        const dy = pts[j * 3 + 1] - y
        if (dx * dx + dy * dy > linkR2) continue
        comp[j] = nc
        stack.push(j)
      }
    }
    nc++
  }

  const size = new Int32Array(nc)
  const sumY = new Float64Array(nc)
  for (let i = 0; i < n; i++) {
    size[comp[i]]++
    sumY[comp[i]] += pts[i * 3 + 1]
  }

  const maxSize = Math.max(4, Math.round(n * 0.012))
  let best = -1
  for (let c = 0; c < nc; c++) {
    if (size[c] > maxSize) continue
    const cy = sumY[c] / size[c]
    if (cy <= midY) continue
    if (
      best < 0 ||
      size[c] < size[best] ||
      (size[c] === size[best] && cy > sumY[best] / size[best])
    ) {
      best = c
    }
  }
  if (best < 0) return []

  const out = []
  for (let i = 0; i < n; i++) if (comp[i] === best) out.push(i)
  return out
}

/**
 * Where the dimension chain's ticks go: the gaps between the letters.
 *
 * A bay in this plan is a letter, and a letter is a run of occupied columns
 * with air either side of it — the counters inside `a`, `e` and `d` never read
 * as gaps because the bowl above and below still occupies the column. So the
 * chain is measured off the drawing rather than off font metrics, and it stays
 * right if the typeface ever changes.
 */
function bayStations(pts, n, minX, maxX, pitch) {
  const bin = Math.max(0.15, pitch * 0.5)
  const nb = Math.max(1, Math.ceil((maxX - minX) / bin) + 1)
  const occ = new Uint16Array(nb)
  for (let i = 0; i < n; i++) {
    const b = Math.min(nb - 1, Math.max(0, Math.floor((pts[i * 3] - minX) / bin)))
    occ[b]++
  }

  const stations = [minX]
  let runStart = -1
  for (let b = 0; b < nb; b++) {
    if (occ[b] === 0) {
      if (runStart < 0) runStart = b
    } else if (runStart >= 0) {
      if ((b - runStart) * bin >= pitch * 0.7) {
        stations.push(minX + (runStart + (b - runStart) / 2) * bin)
      }
      runStart = -1
    }
  }
  stations.push(maxX)

  // A bay narrower than this is a sampling artefact, not a bay; a chain of
  // hairline dimensions reads as noise on the sheet.
  const minBay = (maxX - minX) * 0.055
  const merged = [stations[0]]
  for (let i = 1; i < stations.length; i++) {
    if (stations[i] - merged[merged.length - 1] >= minBay) merged.push(stations[i])
  }
  if (merged[merged.length - 1] < maxX - 1e-6) merged[merged.length - 1] = maxX

  // Nothing legible came out of the drawing — fall back to an even set-out so
  // the sheet always carries a chain.
  if (merged.length < 3) {
    merged.length = 0
    for (let i = 0; i <= 5; i++) merged.push(minX + ((maxX - minX) * i) / 5)
  }
  return merged.map(ruled)
}

/**
 * @param {object} ctx film context — see states/index.js
 * @returns {{pos: Float32Array, red: Float32Array}}
 */
export function buildBlueprint(ctx) {
  const { count, wordmark } = ctx
  const rand = typeof ctx.rng === 'function' ? ctx.rng : () => 0.5
  const out = emptyState(count)

  const P = wordmark.points
  const nAll = Math.max(1, Math.min(wordmark.count, Math.floor(P.length / 3)))
  const r0 = wordmark.dotRadius > 1e-4 ? wordmark.dotRadius : 0.6

  // ── Read the letterforms ────────────────────────────────────────────────
  const cell = Math.max(0.6, r0 * 2.7)
  const grid = buildGrid(P, nAll, cell)
  const pitch = Math.min(cell, measurePitch(P, nAll, grid, r0 * 1.6))
  const { frames, step } = localFrames(P, nAll, grid, Math.min(cell, pitch * 1.45), pitch)

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (let i = 0; i < nAll; i++) {
    const x = P[i * 3]
    const y = P[i * 3 + 1]
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const planW = maxX - minX > 1e-3 ? maxX - minX : wordmark.width || 40

  // ── Line weights, in world diameters ────────────────────────────────────
  const FACE_D = r0 * 0.72
  const OFF = r0 - FACE_D / 2 // outer bead edge lands exactly on the old edge
  const HATCH_D = r0 * 0.4
  const DIM_D = r0 * 0.42
  const TICK_D = r0 * 0.52
  const SECTION_D = r0 * 0.86
  const COLUMN_D = r0 * 0.68
  const SHEET_D = r0 * 0.5

  // ── Index budget ────────────────────────────────────────────────────────
  // The faces come first because they ARE the transition: point k was bead k a
  // moment ago and moves a third of a bead sideways.
  //
  // How many points a face needs is a property of the logotype, not a constant:
  // one bead per lattice step leaves a dotted line if the sampler's step is
  // wide, and wastes half the pool if it is fine. So the face is stepped along
  // the stroke until its beads touch, and the pool is divided from there —
  // which is also what keeps this state legible if the wordmark's sampling is
  // ever retuned.
  const APPARATUS_RESERVE = Math.floor(count * 0.18)
  let faceSteps = Math.max(1, Math.min(4, Math.round(pitch / (FACE_D * 0.85))))
  while (faceSteps > 1 && 2 * nAll * faceSteps > count - APPARATUS_RESERVE) faceSteps--
  const wm = Math.min(nAll, Math.floor((count - APPARATUS_RESERVE) / (2 * faceSteps)))
  const GROUP = 2 * faceSteps
  const wallEnd = wm * GROUP

  /**
   * Logical slot for face `f` (0/1), sub-step `s`, of bead `k`.
   *
   * Face B is numbered backwards so the group walks out along one face and
   * returns along the other. Consecutive indices are then always adjacent bits
   * of the same wall, where the old interleaved bands put a whole word-width
   * between a bead and the index next to it.
   */
  const logicalSlot = (s, f, k) => k * GROUP + (f === 0 ? s : GROUP - 1 - s)

  // ── Logical slot → pool index ───────────────────────────────────────────
  // Bead k's first wall face claims the point already carrying bead k; the
  // rest fill the gaps in order. See the header.
  const phys = new Int32Array(count).fill(-1)
  {
    const claimed = new Uint8Array(count)
    const wordOf = ctx.wordOf
    if (wordOf && wordOf.length >= count) {
      const home = new Int32Array(nAll).fill(-1)
      for (let i = 0; i < count; i++) {
        const j = wordOf[i]
        if (j >= 0 && j < nAll && home[j] < 0) home[j] = i
      }
      for (let k = 0; k < wm; k++) {
        const h = home[k]
        if (h >= 0 && !claimed[h]) {
          claimed[h] = 1
          phys[logicalSlot(0, 0, k)] = h
        }
      }
    }
    let p = 0
    for (let L = 0; L < count; L++) {
      if (phys[L] >= 0) continue
      while (p < count && claimed[p]) p++
      phys[L] = p++
    }
  }

  /** Pool index for face `f`, sub-step `s`, of bead `k`. */
  const faceSlot = (s, f, k) => phys[logicalSlot(s, f, k)]

  const tittle = resolveTittle(ctx, P, nAll, grid, pitch, (minY + maxY) * 0.5)
  const isTittle = new Uint8Array(nAll)
  for (const i of tittle) isTittle[i] = 1

  let colX = 0
  let colY = maxY
  if (tittle.length) {
    let sx = 0
    let sy = 0
    for (const i of tittle) {
      sx += P[i * 3]
      sy += P[i * 3 + 1]
    }
    colX = sx / tittle.length
    colY = sy / tittle.length
  } else if (Array.isArray(wordmark.tittle)) {
    colX = wordmark.tittle[0]
    colY = wordmark.tittle[1]
  }
  const COL_R = Math.max(pitch * 0.95, r0 * 1.6)

  // ── The walls ───────────────────────────────────────────────────────────
  for (let k = 0; k < wm; k++) {
    if (isTittle[k]) continue // a free mark is a column, not a wall
    const x = P[k * 3]
    const y = P[k * 3 + 1]
    const dx = frames[k * 4]
    const dy = frames[k * 4 + 1]
    const nx = frames[k * 4 + 2]
    const ny = frames[k * 4 + 3]
    const ahead = step[k]

    for (let s = 0; s < faceSteps; s++) {
      // Sub-steps walk INTO the gap the sampler left to the next bead, which is
      // the only stretch of wall guaranteed to exist. At a stroke end there is
      // no gap, so those points park on the face at zero size rather than
      // overshooting into space — still there, simply not part of this drawing.
      const adv = (ahead * pitch * s) / faceSteps
      const d = s === 0 || ahead !== 0 ? FACE_D : 0
      const ox = dx * adv
      const oy = dy * adv
      put(out, faceSlot(s, 0, k), x + nx * OFF + ox, y + ny * OFF + oy, 0, d)
      put(out, faceSlot(s, 1, k), x - nx * OFF + ox, y - ny * OFF + oy, 0, d)
    }
  }

  // ── The column ──────────────────────────────────────────────────────────
  // The tittle's own beads become the column, so the red mark of the logotype
  // is the red mark of the plan — the same matter, understood as structure.
  // Its centre, inner ring and outer ring are laid by band so the four indices
  // belonging to one tittle bead never land on top of each other.
  const nT = tittle.length
  for (let t = 0; t < nT; t++) {
    const k = tittle[t]
    if (k >= wm) continue
    for (let s = 0; s < faceSteps; s++) {
      const rad = COL_R * (faceSteps > 1 ? 0.15 + (0.85 * s) / (faceSteps - 1) : 0.15)
      for (let f = 0; f < 2; f++) {
        const a = (Math.PI * 2 * t) / nT + f * Math.PI + s * 0.55
        put(
          out,
          faceSlot(s, f, k),
          colX + Math.cos(a) * rad,
          colY + Math.sin(a) * rad,
          0,
          COLUMN_D,
          1
        )
      }
    }
  }

  // ── The sheet apparatus ─────────────────────────────────────────────────
  // Every SET-OUT below — dimension heights, station positions, the cut, the
  // sheet edges — is ruled onto the 0.25 lattice the DRAFT motion quantises to.
  // So while the film is setting the plan out, the apparatus is already where
  // the quantiser wants it and barely moves: the drawing tightens against a
  // sheet that stays put, which is what "ruled and snapped" should look like.
  const marks = []
  const mark = (x, y, d, red = 0) => {
    marks.push(x, y, d, red)
  }
  const run = (x0, y0, x1, y1, stride, d, red = 0) => {
    const L = Math.hypot(x1 - x0, y1 - y0)
    const n = Math.max(1, Math.round(L / stride))
    for (let i = 0; i <= n; i++) {
      const t = i / n
      mark(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, d, red)
    }
  }
  /** The 45° slash a drafter puts where a dimension meets its witness line. */
  const slash = (x, y, half, d) => {
    run(
      x - half * Math.SQRT1_2,
      y - half * Math.SQRT1_2,
      x + half * Math.SQRT1_2,
      y + half * Math.SQRT1_2,
      half * 0.5,
      d
    )
  }
  const cross = (x, y, arm, d) => {
    run(x - arm, y, x + arm, y, arm * 0.5, d)
    run(x, y - arm, x, y + arm, arm * 0.5, d)
  }

  // The rest of the column's ring, and its setting-out cross. The ring is laid
  // by angle so the band stays spatially ordered.
  {
    const ringN = 30
    for (let i = 0; i < ringN; i++) {
      const a = (Math.PI * 2 * i) / ringN
      mark(colX + Math.cos(a) * COL_R, colY + Math.sin(a) * COL_R, COLUMN_D, 1)
    }
    const arm = COL_R * 1.75
    run(colX - arm, colY, colX - COL_R * 1.15, colY, COL_R * 0.32, SHEET_D, 1)
    run(colX + COL_R * 1.15, colY, colX + arm, colY, COL_R * 0.32, SHEET_D, 1)
    run(colX, colY - arm, colX, colY - COL_R * 1.15, COL_R * 0.32, SHEET_D, 1)
    run(colX, colY + COL_R * 1.15, colX, colY + arm, COL_R * 0.32, SHEET_D, 1)
  }

  // ── The section cut ─────────────────────────────────────────────────────
  // Taken through the busiest scanline of the word, so the cut passes through
  // every letter rather than clipping an ascender. Heavy, dashed, with a leg
  // and an arrowhead at each end giving the direction of view: the one line on
  // the sheet that says this plan is a slice through something.
  {
    const bin = Math.max(0.15, pitch * 0.6)
    const rows = new Uint16Array(Math.ceil((maxY - minY) / bin) + 1)
    for (let i = 0; i < nAll; i++) {
      rows[Math.min(rows.length - 1, Math.max(0, Math.floor((P[i * 3 + 1] - minY) / bin)))]++
    }
    let bestRow = 0
    for (let b = 1; b < rows.length; b++) if (rows[b] > rows[bestRow]) bestRow = b
    const secY = ruled(minY + (bestRow + 0.5) * bin)
    const x0 = ruled(minX - planW * 0.065)
    const x1 = ruled(maxX + planW * 0.065)

    const stride = r0 * 0.56
    const on = r0 * 3.2
    const period = on + r0 * 1.25
    for (let x = x0; x <= x1 + 1e-6; x += stride) {
      if ((x - x0) % period < on) mark(x, secY, SECTION_D)
    }
    // Legs and arrowheads point down-sheet: the direction the section is seen.
    const leg = r0 * 2.9
    const head = r0 * 0.95
    for (const ex of [x0, x1]) {
      run(ex, secY, ex, secY - leg, r0 * 0.62, SECTION_D)
      mark(ex, secY - leg, SECTION_D)
      run(ex - head, secY - leg + head * 1.5, ex, secY - leg, head * 0.6, SECTION_D)
      run(ex + head, secY - leg + head * 1.5, ex, secY - leg, head * 0.6, SECTION_D)
    }
  }

  // ── The dimension chains ────────────────────────────────────────────────
  // A bay chain reading the letters, and an overall above it. Both are built
  // from the same stations, so they can never disagree about where the drawing
  // starts and stops.
  {
    const stations = bayStations(P, nAll, minX, maxX, pitch)
    const witnessY = ruled(maxY + r0 * 0.9)
    const dimY1 = ruled(maxY + r0 * 4)
    const dimY2 = ruled(dimY1 + r0 * 3.6)
    const over = r0 * 0.95
    const stride = r0 * 0.7
    const half = r0 * 0.72

    for (const x of stations) {
      run(x, witnessY, x, dimY1 + over, stride, DIM_D)
      slash(x, dimY1, half, TICK_D)
    }
    run(stations[0], dimY1, stations[stations.length - 1], dimY1, stride, DIM_D)

    const ends = [stations[0], stations[stations.length - 1]]
    for (const x of ends) {
      run(x, dimY1 + over, x, dimY2 + over, stride, DIM_D)
      slash(x, dimY2, half, TICK_D)
    }
    run(ends[0], dimY2, ends[1], dimY2, stride, DIM_D)
  }

  // ── The sheet ───────────────────────────────────────────────────────────
  // Crop brackets at the trim corners and registration crosses inside them.
  // Not a full border rule: the corners alone read as a sheet, and a closed
  // rectangle of beads would be a large shape the next movement has to dispose
  // of. The frame proper is a ruled line, not beads — see buildBlueprintLines.
  {
    const hw = ruled(planW * SHEET_W_FRAC)
    const hh = ruled(planW * SHEET_H_FRAC)
    const stride = r0 * 0.78
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        run(sx * hw, sy * hh, sx * (hw - BRACKET), sy * hh, stride, SHEET_D)
        run(sx * hw, sy * hh, sx * hw, sy * (hh - BRACKET), stride, SHEET_D)
        cross(sx * (hw - SHEET_INSET), sy * (hh - SHEET_INSET), r0 * 1.1, SHEET_D)
      }
    }
    cross(0, hh - SHEET_INSET, r0 * 1.1, SHEET_D)
    cross(0, -(hh - SHEET_INSET), r0 * 1.1, SHEET_D)
    cross(hw - SHEET_INSET, 0, r0 * 1.1, SHEET_D)
    cross(-(hw - SHEET_INSET), 0, r0 * 1.1, SHEET_D)
  }

  // ── Poche ───────────────────────────────────────────────────────────────
  // Whatever the apparatus did not need becomes hatch, which is the right way
  // round: poche is a texture, so it should take the slack rather than starve
  // an element the drawing needs to be legible.
  let apparatus = Math.floor(marks.length / 4)
  if (wallEnd + apparatus > count) apparatus = Math.max(0, count - wallEnd)
  const hatchStart = wallEnd
  const hatchEnd = count - apparatus

  {
    // Hatch runs at a constant 45° across the sheet, not at 45° to each wall:
    // that is what makes it read as one poche applied to a drawing rather than
    // as chevrons decorating each letter. Each tick is slid ALONG its wall onto
    // the nearest line of the global 45° family, so ticks in neighbouring walls
    // line up the way a drafter's do.
    const hx = Math.SQRT1_2
    const hy = Math.SQRT1_2
    const px = Math.SQRT1_2 // the family's perpendicular
    const py = -Math.SQRT1_2
    const cav = OFF * 0.94 // the tick runs the full wall body, face to face
    const maxHalf = pitch * 0.55
    const jitter = pitch * 0.05 // breaks the moiré a perfectly regular field makes

    // Poche is a texture, so its density follows the wall's own length, not the
    // pool: ticks roughly a wall-thickness apart, each solid enough to read.
    // Surplus points go into a FINER hatch family rather than more ticks on the
    // same lines — a state that inherits a sparse logotype gets tighter poche,
    // which is the drawing getting better rather than points being wasted.
    const hatchCount = hatchEnd - hatchStart
    const wantTicks = Math.max(1, Math.ceil(wm / 0.55)) // one per 0.55 lattice steps
    const perTick = Math.max(3, Math.min(7, Math.ceil(hatchCount / wantTicks)))
    const nTicks = Math.max(1, Math.ceil(hatchCount / perTick))
    const span = (perTick - 1) / 2
    const spacing = (wm * pitch) / nTicks
    const family = Math.max(pitch * 0.2, Math.min(pitch * 0.82, spacing))

    let i = hatchStart
    for (let t = 0; t < nTicks && i < hatchEnd; t++) {
      const f = (t * wm) / nTicks
      let k = Math.min(wm - 1, Math.floor(f))
      if (k < 0) k = 0
      const jx = (rand() - 0.5) * jitter
      const jy = (rand() - 0.5) * jitter
      if (isTittle[k]) {
        // A column has no cavity to fill; the slot still exists, sized to zero.
        for (let m = 0; m < perTick && i < hatchEnd; m++) put(out, phys[i++], colX, colY, 0, 0)
        continue
      }
      // More ticks than beads means walking into the gap between them, or every
      // tick of a station would land on the identical hatch line.
      const pre = step[k] * pitch * (f - k)
      const bx = P[k * 3] + frames[k * 4] * pre
      const by = P[k * 3 + 1] + frames[k * 4 + 1] * pre
      const dx = frames[k * 4]
      const dy = frames[k * 4 + 1]
      const nx = frames[k * 4 + 2]
      const ny = frames[k * 4 + 3]

      const s = bx * px + by * py
      const dd = dx * px + dy * py
      let slide = 0
      if (Math.abs(dd) > 0.25) {
        // Reaching the nearest line is at most half a family spacing sideways;
        // anything further means the wall runs nearly along the hatch, where
        // sliding would carry the tick away from the stretch it belongs to.
        const lim = Math.min(pitch * 0.6, family * 2)
        slide = (Math.round(s / family) * family - s) / dd
        slide = Math.max(-lim, Math.min(lim, slide))
      }
      const cx = bx + dx * slide + jx
      const cy = by + dy * slide + jy

      // Clip the tick to the wall body: its travel across the wall is its
      // length times the hatch's component along the wall normal.
      const half = Math.min(maxHalf, cav / Math.max(0.38, Math.abs(hx * nx + hy * ny)))
      for (let m = 0; m < perTick && i < hatchEnd; m++) {
        const e = ((m - span) / span) * half
        put(out, phys[i++], cx + hx * e, cy + hy * e, 0, HATCH_D)
      }
    }
    while (i < hatchEnd) put(out, phys[i++], colX, colY, 0, 0)
  }

  // ── Lay the apparatus into the tail ─────────────────────────────────────
  for (let m = 0; m < apparatus; m++) {
    put(out, phys[hatchEnd + m], marks[m * 4], marks[m * 4 + 1], 0, marks[m * 4 + 2], marks[m * 4 + 3])
  }

  return out
}

/**
 * The sheet itself — the only thing in this state that is a LINE rather than a
 * mark, because it is the only thing that is not drawn: it is the paper.
 *
 * Trim, margin, and a light setting-out grid. Feeds the film's shared
 * LineSegments layer; ~30 segments, so it costs nothing.
 *
 * @returns {Float32Array} xyz pairs, 6 floats per segment
 */
export function buildBlueprintLines(ctx) {
  const wordmark = ctx.wordmark
  const P = wordmark.points
  const n = Math.max(1, Math.min(wordmark.count, Math.floor(P.length / 3)))
  let minX = Infinity
  let maxX = -Infinity
  for (let i = 0; i < n; i++) {
    const x = P[i * 3]
    if (x < minX) minX = x
    if (x > maxX) maxX = x
  }
  const planW = maxX - minX > 1e-3 ? maxX - minX : wordmark.width || 40

  const hw = ruled(planW * SHEET_W_FRAC)
  const hh = ruled(planW * SHEET_H_FRAC)
  const mw = hw - SHEET_INSET * 1.5
  const mh = hh - SHEET_INSET * 1.5

  const seg = []
  const line = (x0, y0, x1, y1) => seg.push(x0, y0, 0, x1, y1, 0)
  const rect = (a, b) => {
    line(-a, -b, a, -b)
    line(a, -b, a, b)
    line(a, b, -a, b)
    line(-a, b, -a, -b)
  }
  rect(hw, hh)
  rect(mw, mh)

  // Setting-out grid, on the same 0.25 lattice the marks use so the sheet and
  // the drawing are laid out to one system.
  const gx = ruled(planW * 0.115)
  for (let x = gx; x < mw - 1e-6; x += gx) {
    line(x, -mh, x, mh)
    line(-x, -mh, -x, mh)
  }
  for (let y = gx; y < mh - 1e-6; y += gx) {
    line(-mw, y, mw, y)
    line(-mw, -y, mw, -y)
  }

  return new Float32Array(seg)
}
