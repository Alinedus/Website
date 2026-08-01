/**
 * THE MARK — the film arrives back at the thing it opened with.
 *
 * Movement 1 resolved a corridor of architecture into a logotype. Ninety
 * seconds later the same pool has been a plan, a building, a city, a graph and
 * a mind, and this state ends it by putting the letters back — not a redrawn
 * copy of them, THE SAME BEADS IN THE SAME PLACES. The lettered points read
 * their positions straight out of `ctx.wordmark.points`, at the sampler's own
 * bead diameter, and they are the same POOL INDICES the wordmark state used
 * (`ctx.wordOf`). So the closing frame is not merely similar to the opening
 * one: point 4,102 was that stroke of the `n` at the beginning and it is that
 * stroke of the `n` at the end, having been a wall, a lot and a filament in
 * between. That is the loop the film opened, closed literally rather than
 * rhymed.
 *
 * ── The other four fifths of the pool ─────────────────────────────────────
 *
 * The logotype needs ~700 beads and the pool is 5,200, so most of the film's
 * matter has nothing to be here. It is sized to ZERO — the film never destroys
 * anything — but a dismissed point still has a POSITION, and that position is
 * the only thing this state can author about the last gesture of the film.
 *
 * The shader lerps position and size together (PointPool: `mix(aFromA, aToA,
 * uMorph)`), so a dormant point travels toward its rest position while it
 * shrinks. Its rest position IS therefore the direction it appears to go as it
 * disappears. Park the surplus far out and the ending reads as the mind blowing
 * away; park it on the mark and the ending reads as the mind being absorbed
 * into it. Movement 7 owns "wick into the mark", so:
 *
 *   · every surplus point settles onto the PAGE — a sheet at z = 0 around the
 *     lockup, walked in Hilbert order so index neighbours stay neighbours;
 *   · the page's grain within reach of the letterforms is DRAWN INTO them, hard
 *     (`WICK_MAX`), the way ink is pulled into paper it is already touching. So
 *     roughly a third of the surplus ends up inside the mark's own silhouette
 *     and the rest lies quiet on the sheet around it.
 *
 * That second rule is also what makes the ending clean rather than a pop. Size
 * reaches zero only at the very end of the morph, and `gl_PointSize` is clamped
 * to a 1-px floor, so dormant matter stays a speck of dust right up until it
 * winks out all at once. Dust that has wicked INTO a letterform winks out
 * underneath a black bead, where there is nothing to see; only the sparse
 * outfield clears in the open, and by then it is a fine even tone lifting off a
 * page. Nothing else in the state fights that reading: no drift, no scatter, no
 * second density.
 *
 * ── Flat, on purpose ──────────────────────────────────────────────────────
 *
 * Everything is at z = 0. The movement's camera does the framing by pulling
 * back — it is the film's one reverse move, from 3.2 units out to the wide
 * head-on shot movement 1 ended on — so the state must not do any framing of
 * its own. And flatness here is literally the subject: the last image of the
 * film is a document at noon, which is a plane. (Blueprint takes the same
 * licence for the same reason; every other state stays a volume.)
 *
 * ── What this state deliberately does NOT do ──────────────────────────────
 *
 * No lines layer. The final frame is the mark alone on paper; a ruled sheet
 * border would both add a second subject and lean on movement 2's drafting
 * grammar. No accent either — see `red`, below.
 *
 * ── Determinism ───────────────────────────────────────────────────────────
 *
 * No `ctx.rng` is consumed. Every stochastic-looking value is a pure hash of
 * the point's own index, as in building.js, network.js and intelligence.js, so
 * this state returns bit-identical geometry however many times it is called and
 * in whatever order relative to its siblings — and, being the last state built,
 * it cannot shift anyone else's stream by drawing from the shared one.
 */

import { emptyState, put } from './index.js'

/* ── Tunables ───────────────────────────────────────────────────────────── */

/**
 * The page, as multiples of the lockup's OWN measured extents, so the mark sits
 * in the same proportion of its sheet whatever the type measures. At the
 * default 40-unit lockup this is a 60 × 25 page — comfortably inside the final
 * framing on every aspect, with margins wide enough to read as margins.
 */
const SHEET_W = 1.5
const SHEET_H = 2.6
/** Floor on the page's height, as a fraction of its half-width: a wide, thin
 *  wordmark must still land on something shaped like a sheet. */
const SHEET_H_MIN = 0.28

/**
 * Rows crowd toward the line of type as |v|^BAND_P. Deliberately gentle: the
 * grain has to stay ISOTROPIC to read as paper rather than as a comb, and the
 * concentration the ending actually needs comes from the wick below, which
 * gathers what it takes and leaves the rest evenly laid.
 */
const BAND_P = 1.25

/** Grain jitter, in cells. Enough that the field never resolves into a visible
 *  lattice; small enough that it still reads as laid rather than scattered. */
const JITTER = 0.34

/** How far the mark can draw the page in, in BEAD RADII — so it tracks the
 *  logotype's own lattice if the sampler is ever retuned — and how hard. 0.9
 *  rather than 1 leaves each wicked speck a tenth of its own approach, which is
 *  what keeps the fringe a fringe instead of a set of exact duplicates. */
const WICK_REACH_R = 6
const WICK_MAX = 0.9

/**
 * Hilbert lattice for the page. The sub-rectangle used is 128 × ROWS, matched
 * to the sheet's aspect so the cells come out SQUARE; a square curve stretched
 * onto a 2.4:1 page would space the dust three times further apart across than
 * down, which reads as vertical combing.
 */
const HILBERT_N = 128

/**
 * Resolution the INCOMING body is ranked at, when one is wired (see
 * `pageOrder`). Deliberately far COARSER than the page's own lattice.
 *
 * A Hilbert curve preserves neighbourhoods in ONE direction only: consecutive
 * positions on the curve are always spatially close, but two spatially CLOSE
 * cells can sit far apart along it. Ranking the body at the page's own 128
 * makes that failure the common case, because the entity's projection is
 * savagely concentrated — measured, 5,200 points land in 1,378 of 7,296 cells
 * and ONE of them holds 408 — so a pair either side of a cell boundary ends up
 * separated on the page by every point in between.
 *
 * Coarse, the curve decides only which REGION of the page a region of the body
 * lands in, and index order lays the grain down inside it. 8 nests exactly
 * inside 128, so the two curves still agree about where a region is. Swept: a
 * neighbourhood of the body survives into 10.9% / 8.0% / 7.9% / 6.9% of the
 * page at KEY_N 4 / 8 / 16 / 32, against a 27% noise floor, while the
 * disturbance to the incoming index order climbs steadily across the same
 * sweep. 8 is where the survival curve flattens.
 */
const KEY_N = 8

/* ── Pure hash noise ────────────────────────────────────────────────────── */

/** Deterministic uint32 from three integers. */
function hashU(i, j, k) {
  let h =
    Math.imul(i ^ 0x27d4eb2d, 0x165667b1) ^
    Math.imul(j + 0x9e3779b9, 0x85ebca6b) ^
    Math.imul(k + 0x7f4a7c15, 0x27d4eb2f)
  h ^= h >>> 15
  h = Math.imul(h, 0x2545f491)
  h ^= h >>> 13
  return h >>> 0
}

/** Deterministic [0,1) from one integer and a salt. */
const hash1i = (i, salt) => hashU(i, salt * 0x9e37 + 17, 0x5bf0) / 4294967296

const smooth = (t) => t * t * (3 - 2 * t)

/**
 * Canonical Hilbert d→xy. `n` must be a power of two.
 *
 * The step down the curve is `t >>>= 2` rather than the textbook
 * `Math.floor(t / 4)`: identical while d stays inside 32 bits, which at
 * n = 128 it does by four orders of magnitude, and worth having because this
 * runs 16,384 times on the main thread at boot where V8 is still interpreting.
 */
function hilbertD2XY(n, d, out) {
  let t = d
  let x = 0
  let y = 0
  for (let s = 1; s < n; s *= 2) {
    const rx = 1 & (t >>> 1)
    const ry = 1 & (t ^ rx)
    if (ry === 0) {
      if (rx === 1) {
        x = s - 1 - x
        y = s - 1 - y
      }
      const tmp = x
      x = y
      y = tmp
    }
    x += s * rx
    y += s * ry
    t >>>= 2
  }
  out[0] = x
  out[1] = y
  return out
}

/** The inverse: canonical Hilbert xy→d. `n` must be a power of two. */
function hilbertXY2D(n, x, y) {
  let d = 0
  let ax = x
  let ay = y
  for (let s = n >> 1; s > 0; s >>= 1) {
    const rx = (ax & s) > 0 ? 1 : 0
    const ry = (ay & s) > 0 ? 1 : 0
    d += s * s * ((3 * rx) ^ ry)
    if (ry === 0) {
      if (rx === 1) {
        ax = n - 1 - ax
        ay = n - 1 - ay
      }
      const t = ax
      ax = ay
      ay = t
    }
  }
  return d
}

/* ── The order the page is laid down in ─────────────────────────────────── */

/**
 * Which dormant point gets which cell of the page.
 *
 * Index order is the honest default and the only thing this module can know on
 * its own. It is right whenever the state before this one lays its points out
 * along a 1-D walk, which is what every state up to the network does.
 *
 * INTELLIGENCE does not. It is a three-dimensional body, and a compact clump of
 * it is drawn from many former districts — so a clump of matter the audience
 * can see maps to index runs scattered all over the page, and the last gesture
 * of the film reads as the mind shattering rather than settling. (Measured
 * against a random pairing: index order alone scored 67% of the noise floor.)
 *
 * So when the integrator hands over the body being absorbed, the page is
 * ordered by WHERE EACH POINT IS IN IT, projected onto the page's own plane and
 * ranked along the SAME Hilbert curve, over the SAME 128 × `rows` sub-rectangle,
 * that the page itself is walked with. Both sides then read the identical
 * curve, so the r-th point of the body takes the r-th cell of the sheet and a
 * neighbourhood of the entity lands as a PATCH: the body lies down on the paper.
 *
 * Sharing the sub-rectangle is the load-bearing half of that. Ranking on a
 * square 128 × 128 grid while the page walks 128 × 57 puts the two curves out of
 * correspondence — locality survives the projection and is then thrown away by
 * the mismatch, which measured as 38% of index-neighbours landing on opposite
 * sides of the sheet. A space-filling curve only preserves neighbourhoods
 * against ITSELF.
 *
 * Ties break on index, so the result is deterministic, and with nothing wired
 * the ordering is exactly the index order it always was.
 */
function pageOrder(ctx, dormant, nDormant, rows) {
  const src = ctx.intelligence || ctx.intelligenceState
  const pos = src && (src.pos || src)
  if (!pos || typeof pos.length !== 'number' || pos.length < ctx.count * 4) return
  if (nDormant < 2) return

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (let d = 0; d < nDormant; d++) {
    const i = dormant[d]
    const x = pos[i * 4]
    const y = pos[i * 4 + 1]
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  if (!(maxX > minX) || !(maxY > minY)) return

  const spanX = maxX - minX
  const spanY = maxY - minY
  // The key grid nests inside the page's, at the same aspect, so a coarse cell
  // is exactly a block of page cells at the same position along the curve.
  const keyRows = Math.max(1, Math.round((rows * KEY_N) / HILBERT_N))
  const key = new Float64Array(nDormant)
  for (let d = 0; d < nDormant; d++) {
    const i = dormant[d]
    const x = pos[i * 4]
    const y = pos[i * 4 + 1]
    const gx = Number.isFinite(x)
      ? Math.min(KEY_N - 1, Math.max(0, ((x - minX) / spanX) * KEY_N)) | 0
      : 0
    const gy = Number.isFinite(y)
      ? Math.min(keyRows - 1, Math.max(0, ((y - minY) / spanY) * keyRows)) | 0
      : 0
    key[d] = hilbertXY2D(KEY_N, gx, gy)
  }

  const order = Array.from({ length: nDormant }, (_, d) => d)
  order.sort((a, b) => key[a] - key[b] || dormant[a] - dormant[b])
  const sorted = Int32Array.from(order, (d) => dormant[d])
  dormant.set(sorted, 0)
}

/* ── Which points are letters ───────────────────────────────────────────── */

/**
 * The `i`'s tittle is a MARK, not a bead: the sampler resolves it to a cluster
 * two or three beads tall, the movement draws it as its own red dot, and the
 * wordmark state therefore lets no point claim it. This state has to make the
 * identical exclusion or the closing frame grows a black dash over the `i` that
 * the opening frame never had.
 */
function tittleMask(ctx, nAll) {
  const mask = new Uint8Array(nAll)
  const given = ctx.wordmark.tittleIndices
  if (Array.isArray(given)) {
    for (const j of given) if (Number.isInteger(j) && j >= 0 && j < nAll) mask[j] = 1
  }
  return mask
}

/**
 * `beadOf[i]` — the wordmark bead point i carries here, or -1 for dormant.
 *
 * The film's own assignment (`ctx.wordOf`, computed once in context.js and used
 * by the wordmark state) is what closes the loop, so it is taken verbatim
 * whenever it is present. The fallback exists only so the module stands alone
 * under test: it hands the k-th kept bead to pool index k, which is the same
 * bead-order-is-index-order convention blueprint.js reads the lockup by, and it
 * keeps neighbouring beads on neighbouring indices.
 */
function assignBeads(ctx, nAll, isTittle) {
  const count = ctx.count
  const beadOf = new Int32Array(count).fill(-1)
  const supplied = ctx.wordOf

  if (supplied && supplied.length >= count) {
    for (let i = 0; i < count; i++) {
      const j = supplied[i]
      if (j >= 0 && j < nAll && !isTittle[j]) beadOf[i] = j
    }
    return beadOf
  }

  let k = 0
  for (let j = 0; j < nAll && k < count; j++) {
    if (isTittle[j]) continue
    beadOf[k++] = j
  }
  return beadOf
}

/* ── The page ───────────────────────────────────────────────────────────── */

/**
 * The sheet, MEASURED from the lockup rather than read off `wordmark.width` /
 * `height` — a hand-set page is exactly how the mark ends up off-centre on its
 * own sheet when the sampler is retuned.
 *
 * Measured over EVERY bead, including the tittle's, so the page's centre is the
 * lockup's own centre — which the sampler puts on the origin, and the origin is
 * what the movement's pull-back is aimed at. Measuring the drawn subset instead
 * would let the tittle's exclusion nudge the whole page off the camera's axis.
 */
function sheetOf(word, nAll) {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (let j = 0; j < nAll; j++) {
    const x = word[j * 3]
    const y = word[j * 3 + 1]
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  if (!(maxX > minX)) {
    minX = -20
    maxX = 20
    minY = -5
    maxY = 5
  }
  const halfW = Math.max(1, (maxX - minX) * 0.5) * SHEET_W
  const halfH = Math.max(
    Math.max(0.5, (maxY - minY) * 0.5) * SHEET_H,
    halfW * SHEET_H_MIN
  )
  return { cx: (minX + maxX) * 0.5, cy: (minY + maxY) * 0.5, halfW, halfH }
}

/* ── The wick ───────────────────────────────────────────────────────────── */

/**
 * A bucket grid over the drawn beads, so "how far is the page from the mark
 * here" is a handful of cell lookups rather than 700 distances per site.
 *
 * The grid covers the mark's bounding box grown by the wick's reach and nothing
 * more: the great majority of the page lies outside that box and is rejected by
 * one comparison, which is where the speed actually comes from.
 */
function beadGrid(word, drawn, n, reach) {
  const cell = Math.max(reach * 0.5, 1e-3)
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (let d = 0; d < n; d++) {
    const j = drawn[d]
    const x = word[j * 3]
    const y = word[j * 3 + 1]
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  if (!(maxX >= minX)) return null

  const x0 = minX - reach
  const y0 = minY - reach
  const nx = Math.max(1, Math.ceil((maxX + reach - x0) / cell) + 1)
  const ny = Math.max(1, Math.ceil((maxY + reach - y0) / cell) + 1)
  const buckets = new Array(nx * ny)
  for (let d = 0; d < n; d++) {
    const j = drawn[d]
    const ix = Math.min(nx - 1, Math.max(0, Math.floor((word[j * 3] - x0) / cell)))
    const iy = Math.min(ny - 1, Math.max(0, Math.floor((word[j * 3 + 1] - y0) / cell)))
    const b = iy * nx + ix
    if (buckets[b]) buckets[b].push(j)
    else buckets[b] = [j]
  }
  return { cell, x0, y0, nx, ny, buckets, x1: maxX + reach, y1: maxY + reach }
}

/**
 * Nearest drawn bead to (x,y) within `reach`, into `out` as [bx, by, distance].
 *
 * Two rings of cells is exactly enough at cell = reach/2: anything closer than
 * `reach` is inside that neighbourhood by construction, so the answer is the
 * true nearest and not an approximation of it.
 */
function nearestBead(grid, word, x, y, reach, out) {
  if (x < grid.x0 || x > grid.x1 || y < grid.y0 || y > grid.y1) return false
  const ix = Math.min(grid.nx - 1, Math.max(0, Math.floor((x - grid.x0) / grid.cell)))
  const iy = Math.min(grid.ny - 1, Math.max(0, Math.floor((y - grid.y0) / grid.cell)))
  const r2max = reach * reach
  let best = -1
  let bestD2 = r2max
  for (let jy = Math.max(0, iy - 2); jy <= Math.min(grid.ny - 1, iy + 2); jy++) {
    for (let jx = Math.max(0, ix - 2); jx <= Math.min(grid.nx - 1, ix + 2); jx++) {
      const b = grid.buckets[jy * grid.nx + jx]
      if (!b) continue
      for (let s = 0; s < b.length; s++) {
        const j = b[s]
        const dx = word[j * 3] - x
        const dy = word[j * 3 + 1] - y
        const d2 = dx * dx + dy * dy
        if (d2 < bestD2) {
          bestD2 = d2
          best = j
        }
      }
    }
  }
  if (best < 0) return false
  out[0] = word[best * 3]
  out[1] = word[best * 3 + 1]
  out[2] = Math.sqrt(bestD2)
  return true
}

/* ── The state ──────────────────────────────────────────────────────────── */

/**
 * @param {object} ctx the film context — `wordmark` and `wordOf` are what this
 *   state reads; `anchors` and `rng` are deliberately untouched.
 * @returns {{pos: Float32Array, red: Float32Array}}
 */
export function buildMark(ctx) {
  const count = ctx.count
  const out = emptyState(count)
  const word = ctx.wordmark && ctx.wordmark.points
  const nAll = word
    ? Math.max(0, Math.min(ctx.wordmark.count | 0, Math.floor(word.length / 3)))
    : 0

  // A wordmark that failed to sample is not a reason to hand the film a state
  // full of NaNs: every point still gets a resting place on the page, the film
  // simply ends on an empty sheet.
  const r0 = ctx.wordmark && ctx.wordmark.dotRadius > 1e-4 ? ctx.wordmark.dotRadius : 0.6
  const bead = r0 * 2

  const isTittle = nAll ? tittleMask(ctx, nAll) : new Uint8Array(0)
  const beadOf = nAll ? assignBeads(ctx, nAll, isTittle) : new Int32Array(count).fill(-1)

  // ── The letters ───────────────────────────────────────────────────────
  // One pass, which also takes the census the page needs: WHICH beads are drawn
  // (the sheet is measured from them and the wick pulls toward them, so all
  // three read one set) and which points are left over, in index order.
  const drawn = new Int32Array(count)
  const dormant = new Int32Array(count)
  let nDrawn = 0
  let nDormant = 0
  for (let i = 0; i < count; i++) {
    const j = beadOf[i]
    if (j >= 0) {
      // Verbatim: the same three floats the wordmark state wrote, at the same
      // diameter. Anything derived here — a re-centring, a nudge, a re-scale —
      // would show as the mark twitching at the end of a 90-second loop.
      put(out, i, word[j * 3], word[j * 3 + 1], word[j * 3 + 2], bead, 0)
      drawn[nDrawn++] = j
    } else {
      dormant[nDormant++] = i
    }
  }

  const sheet = sheetOf(word, nAll)
  const reach = r0 * WICK_REACH_R
  const grid = nDrawn ? beadGrid(word, drawn, nDrawn, reach) : null

  // Rows of the page's lattice, matched to the sheet's aspect so its cells come
  // out SQUARE: a square Hilbert curve stretched onto a 2.4:1 page would space
  // the dust three times further apart across than down, which reads as combing.
  const rows = Math.max(
    1,
    Math.min(HILBERT_N, Math.round((HILBERT_N * sheet.halfH) / sheet.halfW))
  )

  // Decide the order the page is laid down in before any cell is handed out.
  // AFTER `rows`, which is half of the curve the ordering has to agree with.
  pageOrder(ctx, dormant, nDormant, rows)

  /**
   * One dormant speck's resting place: its cell on the page, warped toward the
   * line of type, then offered to the mark.
   */
  const hit = [0, 0, 0]
  const rest = (i, gx, gy) => {
    const jx = (hash1i(i, 3) - 0.5) * 2 * JITTER
    const jy = (hash1i(i, 7) - 0.5) * 2 * JITTER
    const u = Math.max(-1, Math.min(1, ((gx + 0.5 + jx) / HILBERT_N) * 2 - 1))
    const v = Math.max(-1, Math.min(1, ((gy + 0.5 + jy) / rows) * 2 - 1))

    let x = sheet.cx + u * sheet.halfW
    // The band curve crowds the page toward the line of type without ever
    // folding it: |v|^p is monotone, so neighbours stay in order.
    let y = sheet.cy + Math.sign(v) * Math.pow(Math.abs(v), BAND_P) * sheet.halfH

    // Whatever the page has laid down within reach of a letterform is pulled
    // into it. Smoothstepped rather than linear so the fringe has no edge of its
    // own: at the reach it is nothing, and it goes near-total only where the
    // grain is already touching the ink.
    if (grid && nearestBead(grid, word, x, y, reach, hit)) {
      const pull = WICK_MAX * smooth(1 - hit[2] / reach)
      x += (hit[0] - x) * pull
      y += (hit[1] - y) * pull
    }

    // Size zero — dismissed, not destroyed. Red zero with it: the accent at the
    // end of the film belongs to the free dot arriving home above the `d`, and a
    // second red anywhere on the page would divide the one thing the last frame
    // has to say.
    put(out, i, x, y, 0, 0, 0)
  }

  // ── The page, walked in Hilbert order ─────────────────────────────────
  // The curve runs over the full square and is RESTRICTED to the rows the
  // sheet's aspect allows. A restriction of a Hilbert curve is still a Hilbert
  // curve on the sub-rectangle — consecutive cells stay adjacent — which is the
  // whole reason for one: consecutive pool indices are spatial neighbours in
  // every state that feeds this one, so they have to land as a PATCH on the page
  // or the settling reads as confetti.
  //
  // Sites are handed out at an even stride ALONG the curve rather than collected
  // and then sampled, so the page costs one pass and no allocation.
  const nRect = HILBERT_N * rows
  const xy = [0, 0]
  let lastX = 0
  let lastY = 0
  let rank = 0
  let seen = 0
  for (let d = 0; d < HILBERT_N * HILBERT_N && rank < nDormant; d++) {
    hilbertD2XY(HILBERT_N, d, xy)
    if (xy[1] >= rows) continue
    lastX = xy[0]
    lastY = xy[1]
    seen++
    // Runs more than once only when the pool outnumbers the page's cells, where
    // the per-point jitter is what keeps the coincident specks apart.
    while (rank < nDormant && Math.floor((rank * nRect) / nDormant) < seen) {
      rest(dormant[rank++], lastX, lastY)
    }
  }
  // Integer rounding can leave a speck or two over; they belong at the end of
  // the curve, with the neighbours they arrived beside.
  while (rank < nDormant) rest(dormant[rank++], lastX, lastY)

  return out
}
