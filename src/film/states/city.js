/**
 * THE CITY — the site, subdivided.
 *
 * The building does not multiply. Its SITE does. A single region is cut by a
 * binary space partition into a plat of lots, each lot takes a massing, and the
 * one building the film has been drawing since movement 2 turns out to have
 * been one parcel of it all along. Nothing is copied, which matters: a city made
 * of duplicates reads as an array, and an array is the one thing an architect
 * never sees when they look out of a window.
 *
 * ── Why this state is allowed to change world scale ───────────────────────
 *
 * Every other state is authored at the logotype's own scale, because the camera
 * does the framing. Here the scale change IS the subject. The site spans 600
 * units against the building's 40, so the drawing the audience has been living
 * inside becomes 1/15 of the frame — and it can only mean that if the geometry
 * genuinely gets bigger while the BEADS DO NOT. A bead here is the same ~1.1
 * units it was on the wordmark and on the wall; the matter is unchanged and the
 * world grew around it. Scaling the beads too would have been a zoom, and a zoom
 * says nothing.
 *
 * The movement's allocated camera grammar — vertical ascent — is what reads that
 * change: the lens barely moves, the camera simply rises until the site fits.
 * The far edge of the plat sits ~890 units out, past the movement's fog far
 * plane, so the boundary is eaten by its allocated palette event (aerial haze)
 * rather than by a hard edge. That is deliberate: a site with a visible rim is a
 * model, and a site that dissolves is a city.
 *
 * ── The repartition, and why the index order is a spiral ───────────────────
 *
 * The pool is REPARTITIONED, not repositioned. There is one fixed budget of
 * points and several hundred objects to spend it on, so a building here is not a
 * lattice — it is its CORNERS, and then, only if it is tall enough for the
 * verticality to be worth saying, a ladder of corner rings down its height. Four
 * points is a roof. Eight is a box. Twenty-eight is a tower. The lot boundary
 * under it is carried by the line layer, so the ground is drawn and the points
 * are free to be entirely massing.
 *
 * Rule 2 (index is identity) then decides the whole feel of the transition, and
 * two decisions carry it:
 *
 *   · THE HERO OWNS THE LOW INDICES, contiguously. In the building state indices
 *     0..cols are literally the south wall's base row — the red plan line — so
 *     giving the hero's own base ring index 0 upward means those points do not
 *     travel at all. The building you drew stays exactly where it is while the
 *     city arrives around it, which is the only way the audience can be sure it
 *     is the same building. It also gets slightly larger beads and keeps its red
 *     plan, so it stays findable once it is 6% of the frame.
 *
 *   · THE PLAT IS WALKED AS AN OUTWARD BOUSTROPHEDON SPIRAL from the hero — lots
 *     sorted into rings of radius, alternate rings traversed in opposite
 *     directions so the end of one ring is adjacent to the start of the next.
 *     Consecutive indices are therefore neighbouring parcels, and the dispersal
 *     out of the building reads as the city GROWING from it rather than as
 *     confetti. BSP tree order is also spatially coherent and was the obvious
 *     alternative; it assembles the plat from one corner, which says nothing
 *     about the hero, and the hero is the point of the shot.
 *
 * Within a lot the rings are emitted as a boustrophedon too: a ring ends on the
 * corner the next ring begins under, so consecutive indices are always joined by
 * either a roof edge or a vertical edge and a massing never tears.
 *
 * ── Determinism ───────────────────────────────────────────────────────────
 *
 * This module deliberately does NOT draw from ctx.rng. It has two entry points
 * (points and lines) over ONE shared plat, so whichever ran first would consume
 * from the film's shared stream and shift every state built after it — the plat
 * would then depend on the order the integrator happened to call things in.
 * Instead the plat is built once, lazily, from a locally seeded stream (the same
 * PRNG the film uses, from index.js) and cached, exactly as building.js keeps
 * its layout pure so that it "returns bit-identical geometry however many times
 * it is called and in whatever order relative to its sibling states". Art-direct
 * by moving CITY_SEED.
 *
 * Scale note: 1 world unit ~= 0.5 m, as established by building.js. So a storey
 * is 6 units, the site is 300 m across, and a 24-storey tower is 72 m.
 */

import { emptyState, put, rng } from './index.js'

/* ── The site ─────────────────────────────────────────────────────────────── */

/** Half-extent. The plat spans 600 units — the film's one scale change. */
export const SITE_HALF = 300

const CITY_SEED = 0xc17ae5

/**
 * The plaza. A rectangle at the centre that the subdivision may never cut, so
 * the hero ends up standing in a clear parcel of its own.
 *
 * It is not a courtesy to the composition, it is the composition: the height
 * gradient peaks around the centre, so without a reserved parcel the building
 * would be walled in by towers at exactly the moment the audience needs to
 * recognise it. A low civic square ringed by the tallest massing is also the
 * most ordinary thing a city does, which is why it costs nothing to read.
 */
const PLAZA = { hx: 78, hz: 66 }

/**
 * Smallest parcel worth building on (8 m of frontage), and how deep the cutting
 * goes. Together they set the lot count, and the lot count is what the whole
 * state is spending: measured, these give ~375 parcels against a budget of
 * ~1,230 corner rings, which is the number at which the plat's OWN demand for
 * rings (one per RING_SPACING of height) equals the pool almost exactly — so
 * nearly every building gets the description its height asks for and none is
 * rationed. Cutting finer is tempting and costs the skyline: at ~490 lots the
 * budget covers little more than roof-and-base everywhere, and a thirty-storey
 * tower comes out as three floating quads eleven storeys apart.
 */
const MIN_LOT = 16
const MAX_DEPTH = 12
/**
 * Some parcels simply never get cut again. Without this every block reaches the
 * same depth and the plat has one grain instead of a history.
 *
 * It only applies to parcels already under LOT_KEEP_MAX, because a lot's four
 * roof corners are ALL the description it gets: at 25 units they read as a
 * building, and at 110 they read as four unrelated specks with nothing between
 * them. Capping the size is cheaper than special-casing big roofs, and a plat
 * with no superblocks in it is the more ordinary city anyway.
 */
const EARLY_STOP = 0.055
const LOT_KEEP_MAX = 64
/**
 * How far a cut may stray from the middle of its parcel. Wide jitter is more
 * picturesque per cut and much worse overall: lopsided children bottom out
 * against MIN_LOT at different depths, so the plat loses a third of its lots and
 * gains slivers. Measured across the sweep, ±0.16 holds the p90 aspect ratio
 * under 1.9 while keeping every parcel a different size.
 */
const SPLIT_JITTER = 0.32

/**
 * Width taken out of each cut, by depth: avenues, then streets, then lanes,
 * then the gap between two buildings on adjacent lots. The road is subtracted
 * from the split rather than from the lots, which is what makes a street a
 * continuous run across many blocks instead of a gap that jogs. ~19% of the
 * site ends up as movement space, which is what a city spends.
 */
const ROAD = [16, 12, 9, 6.5, 4.5, 3, 2, 1.4, 1.0, 0.9, 0.8, 0.8]

/* ── The skyline ──────────────────────────────────────────────────────────── */

/** Matches building.js: a storey is 6 units, so the whole city is built out of
 *  the same storey the hero is, and every height quantises onto it. */
const STOREY = 6
const MAX_STOREYS = 24
const CAP_STOREYS = 30
/** A few parcels defy the gradient. A skyline with no exceptions reads as a
 *  function plot; a skyline with too many reads as noise. */
const OUTLIER_P = 0.035
/** Bid-rent decay: height falls as 1/(1+(d/FALLOFF)^2) from the centre out. */
const FALLOFF = 170

/* ── The point budget ─────────────────────────────────────────────────────── */

/** World height between corner rings. Constant across the city, so the whole
 *  plat is banded at the same datums and the subdivision reads as quantised
 *  vertically as well as in plan. */
const RING_SPACING = 32
const MIN_RINGS = 2 // roof + base: the least that reads as a box
const MAX_RINGS = 10
/** Width of one ring of the index spiral. ~9 rings across the site. */
const BAND_W = 34
/** Points the hero would like. The exact figure is rounded so that the plat's
 *  budget divides by four (one ring = four corners) with nothing left over. */
const HERO_TARGET = 264

/* ── The hero parcel ──────────────────────────────────────────────────────── */

/**
 * The footprint centreline from building.js, mirrored rather than imported —
 * this module may only import from ./index.js, so the constant is duplicated
 * deliberately. `ctx.plan` overrides it if the integrator ever wires the plan
 * through the context, which is the cheap way to remove the duplication later.
 *
 * If building.js's FOOTPRINT changes, change this with it: the hero must land on
 * the drawing the previous state left, or the one point of the whole movement
 * (that is YOUR building down there) is lost.
 */
const HERO_PLAN = [
  [-20, -12],
  [20, -12],
  [20, 12],
  [4, 12],
  [4, 2],
  [-20, 2],
]
const HERO_H = 12
const HERO_STOREY = 6

/* ── Plat geometry ────────────────────────────────────────────────────────── */

/**
 * Choose a cut coordinate in [a, b], jittered, refusing slivers.
 *
 * `k0`/`k1` are a span already spoken for (the plaza). A surveyor does not run
 * a line through a parcel that exists, they run it along its boundary — so a cut
 * that lands inside the reserve slides to whichever of its edges is nearer, with
 * the road laid OUTSIDE the reserve. That single rule is what guarantees the
 * plaza survives as one leaf, which is what guarantees the hero has a lot.
 */
function splitCoord(a, b, k0, k1, road, rand) {
  const h = road / 2
  let c = a + (b - a) * (0.5 + (rand() - 0.5) * SPLIT_JITTER)
  if (k0 !== null && c > k0 - h && c < k1 + h) {
    c = c - k0 < k1 - c ? k0 - h : k1 + h
  }
  if (c - h - a < MIN_LOT || b - (c + h) < MIN_LOT) return null
  return c
}

/** Depth-first BSP. Leaves land in `lots`, cuts in `cuts` for the line layer. */
function subdivide(node, depth, rand, lots, cuts) {
  const w = node.x1 - node.x0
  const d = node.z1 - node.z0

  if (
    depth >= MAX_DEPTH ||
    Math.max(w, d) < MIN_LOT * 2 ||
    (depth >= 4 && Math.max(w, d) < LOT_KEEP_MAX && rand() < EARLY_STOP)
  ) {
    lots.push(node)
    return
  }

  // Alternate by depth — that is what gives a plat its weave — but override for
  // a lopsided parcel, because splitting the short side of a 3:1 block produces
  // two slivers and slivers are the one lot shape that cannot hold a building.
  let axis = depth & 1
  if (w > d * 1.5) axis = 0
  else if (d > w * 1.5) axis = 1

  const road = ROAD[Math.min(depth, ROAD.length - 1)]
  const touchesPlaza =
    node.x0 < PLAZA.hx &&
    node.x1 > -PLAZA.hx &&
    node.z0 < PLAZA.hz &&
    node.z1 > -PLAZA.hz

  for (let attempt = 0; attempt < 2; attempt++) {
    const onX = axis === 0
    const a = onX ? node.x0 : node.z0
    const b = onX ? node.x1 : node.z1
    const k0 = touchesPlaza ? (onX ? -PLAZA.hx : -PLAZA.hz) : null
    const k1 = onX ? PLAZA.hx : PLAZA.hz
    const c = splitCoord(a, b, k0, k1, road, rand)

    if (c !== null) {
      const h = road / 2
      cuts.push({ onX, c, a: onX ? node.z0 : node.x0, b: onX ? node.z1 : node.x1, depth })
      const A = onX
        ? { x0: node.x0, x1: c - h, z0: node.z0, z1: node.z1 }
        : { x0: node.x0, x1: node.x1, z0: node.z0, z1: c - h }
      const B = onX
        ? { x0: c + h, x1: node.x1, z0: node.z0, z1: node.z1 }
        : { x0: node.x0, x1: node.x1, z0: c + h, z1: node.z1 }
      subdivide(A, depth + 1, rand, lots, cuts)
      subdivide(B, depth + 1, rand, lots, cuts)
      return
    }
    axis = axis === 0 ? 1 : 0
  }

  // Neither axis could be cut without slicing the plaza or shedding a sliver.
  lots.push(node)
}

/**
 * Where a point sits on the square ring through it, as a parameter in [0, 4) —
 * one unit per side, running anticlockwise from the bottom-left corner.
 *
 * This is the square's answer to `atan2`, and it is what the index spiral is
 * sorted by. Exactly one of the two coordinates dominates, which picks the side;
 * the other, normalised by it, is the distance along that side.
 */
function squareParam(x, z) {
  const ax = Math.abs(x)
  const az = Math.abs(z)
  if (ax >= az) {
    const u = ax > 0 ? z / ax : 0
    return x >= 0 ? 1 + (u + 1) / 2 : 3 + (1 - u) / 2
  }
  const u = x / az
  return z >= 0 ? 2 + (1 - u) / 2 : (u + 1) / 2
}

/**
 * How much of a massing survives at height fraction `t`.
 *
 * A stepped setback rather than a taper: the steps land ON the ring datums, so
 * the profile is quantised in exactly the way the plan is, and a tower reads as
 * a stack of decisions rather than as an extrusion with a draft angle.
 */
function tierScale(t, tiers) {
  if (tiers >= 2) return t > 0.78 ? 0.54 : t > 0.46 ? 0.78 : 1
  if (tiers === 1) return t > 0.6 ? 0.74 : 1
  return 1
}

/**
 * Hand out `total` rings across the lots, exactly.
 *
 * Everyone gets MIN_RINGS, because a box with no base does not sit on its lot.
 * The surplus is apportioned by how many rings the building's own height asks
 * for, by largest remainder — so the budget lands on the towers, where a missing
 * band is a lost storey, rather than being spread evenly over sheds that have
 * nothing to say between their roof and their floor.
 */
function apportionRings(lots, total) {
  const n = lots.length
  const rings = new Int32Array(n).fill(MIN_RINGS)
  let left = total - n * MIN_RINGS
  if (left <= 0 || n === 0) return rings

  const want = new Float64Array(n)
  let sum = 0
  for (let i = 0; i < n; i++) {
    want[i] = Math.max(0, lots[i].wantRings - MIN_RINGS)
    sum += want[i]
  }
  if (sum === 0) return rings

  const share = Math.min(1, left / sum)
  const rem = new Array(n)
  for (let i = 0; i < n; i++) {
    const v = want[i] * share
    const f = Math.floor(v)
    rings[i] += f
    left -= f
    rem[i] = [v - f, i]
  }

  rem.sort((p, q) => q[0] - p[0] || p[1] - q[1])
  for (let k = 0; k < rem.length && left > 0; k++) {
    rings[rem[k][1]]++
    left--
  }

  // Only reachable when the pool is generous relative to the plat: the surplus
  // goes to the tallest first, and stops when everything is at its cap.
  if (left > 0) {
    const byHeight = lots.map((_, i) => i).sort((p, q) => lots[q].h - lots[p].h || p - q)
    for (let pass = 0; pass < MAX_RINGS && left > 0; pass++) {
      for (let k = 0; k < n && left > 0; k++) {
        const i = byHeight[k]
        if (rings[i] < MAX_RINGS) {
          rings[i]++
          left--
        }
      }
    }
  }
  return rings
}

/* ── Layout ───────────────────────────────────────────────────────────────
 * Built once per pool size and shared by the point build and the line build, so
 * the two can never disagree about where a lot is. Pure geometry — bead sizes
 * are applied by the caller, which is why this cache keys on `count` alone. */

let cached = null

function layout(count) {
  if (cached && cached.count === count) return cached

  const rand = rng(CITY_SEED)
  const leaves = []
  const cuts = []
  subdivide(
    { x0: -SITE_HALF, x1: SITE_HALF, z0: -SITE_HALF, z1: SITE_HALF },
    0,
    rand,
    leaves,
    cuts
  )

  // The plaza is whichever leaf holds the origin — guaranteed to exist and to
  // contain the whole reserve, because no cut may land strictly inside it.
  let plaza = null
  const lots = []
  for (const L of leaves) {
    if (plaza === null && L.x0 <= 0 && L.x1 >= 0 && L.z0 <= 0 && L.z1 >= 0) {
      plaza = L
      continue
    }
    lots.push(L)
  }
  if (plaza === null) {
    // Rail: keep the hero's parcel open even if the reserve rule is ever broken.
    plaza = { x0: -PLAZA.hx, x1: PLAZA.hx, z0: -PLAZA.hz, z1: PLAZA.hz }
  }

  // ── Massing per lot ─────────────────────────────────────────────────────
  for (const L of lots) {
    const w = L.x1 - L.x0
    const d = L.z1 - L.z0
    L.cx = (L.x0 + L.x1) / 2
    L.cz = (L.z0 + L.z1) / 2

    // A yard, pushed off-centre. A building centred in its lot is a diagram;
    // one pushed to a boundary with its open ground on one side is a building.
    const yx = w * (0.05 + rand() * 0.14)
    const yz = d * (0.05 + rand() * 0.14)
    const ax = 0.2 + rand() * 0.6
    const az = 0.2 + rand() * 0.6
    L.bx0 = L.x0 + yx * ax
    L.bx1 = L.x1 - yx * (1 - ax)
    L.bz0 = L.z0 + yz * az
    L.bz1 = L.z1 - yz * (1 - az)

    const dist = Math.hypot(L.cx, L.cz)
    const core = 1 / (1 + (dist / FALLOFF) * (dist / FALLOFF))
    let st = 1 + Math.round((MAX_STOREYS - 1) * core * (0.42 + rand() * 0.9))
    if (rand() < OUTLIER_P) st = Math.round(st * (1.5 + rand() * 0.8))
    st = Math.max(1, Math.min(CAP_STOREYS, st))

    L.h = st * STOREY
    L.tiers = st > 16 ? 2 : st > 9 ? 1 : 0
    L.wantRings = Math.max(
      MIN_RINGS,
      Math.min(MAX_RINGS, 1 + Math.ceil(L.h / RING_SPACING))
    )
    // A little per-lot variation in bead weight. Without it a field of several
    // thousand identical specks reads as a texture rather than as buildings.
    L.beadMul = 0.9 + rand() * 0.22
  }

  // ── Budget ──────────────────────────────────────────────────────────────
  const ringBudget = Math.floor((count - HERO_TARGET) / 4)
  const heroCount = count - ringBudget * 4

  // Rail: if the plat ever out-runs the pool, the smallest parcels stand down —
  // they are the ones a viewer at altitude would lose first anyway.
  if (lots.length * MIN_RINGS > ringBudget) {
    const keep = Math.max(1, Math.floor(ringBudget / MIN_RINGS))
    lots
      .map((L, i) => [(L.x1 - L.x0) * (L.z1 - L.z0), i])
      .sort((p, q) => p[0] - q[0])
      .slice(0, lots.length - keep)
      .forEach(([, i]) => {
        lots[i].dropped = true
      })
    for (let i = lots.length - 1; i >= 0; i--) if (lots[i].dropped) lots.splice(i, 1)
  }

  // ── Index order: an outward boustrophedon spiral from the hero ──────────
  // SQUARE rings, not circular ones. The site is a square, so a Euclidean
  // radius puts the outer bands entirely in the four corners — four
  // disconnected arcs that an angular sort walks between, which measured as 228
  // cross-site jumps and is exactly the noise rule 2 exists to prevent. Under
  // the Chebyshev radius every band is a closed square annulus reaching the site
  // edge, and because both a band's perimeter and its area grow linearly with
  // the band index, the spacing between consecutive lots comes out CONSTANT
  // (~20 units, measured) from the plaza to the boundary.
  for (const L of lots) {
    const band = Math.floor(Math.max(Math.abs(L.cx), Math.abs(L.cz)) / BAND_W)
    const t = squareParam(L.cx, L.cz) / 4
    // Alternate rings run the opposite way, so the last lot of one ring is the
    // neighbour of the first lot of the next and the spiral never jumps.
    L.key = band + (band & 1 ? 1 - t : t)
  }
  lots.sort((p, q) => p.key - q.key)

  const rings = apportionRings(lots, ringBudget)

  cached = { count, lots, rings, cuts, plaza, heroCount }
  return cached
}

/** Bead diameter, matched to the wordmark's — the city is the same matter. */
function beadOf(ctx) {
  const r = ctx && ctx.wordmark && ctx.wordmark.dotRadius
  return r > 0 ? r * 2 : 1.2
}

/** The hero's plan: the context's if it has one, else the mirrored constant. */
function heroPlan(ctx) {
  const p = ctx && ctx.plan
  return Array.isArray(p) && p.length >= 3 ? p : HERO_PLAN
}

/**
 * `n` points spaced by arc length around a closed polyline, starting at its
 * first vertex — so the hero's base ring begins exactly where the building
 * state's first wall panel began, and those points do not move at all.
 */
function ringSamples(plan, n, out) {
  const V = plan.length
  const seg = new Float64Array(V)
  let total = 0
  for (let i = 0; i < V; i++) {
    const p = plan[i]
    const q = plan[(i + 1) % V]
    seg[i] = Math.hypot(q[0] - p[0], q[1] - p[1])
    total += seg[i]
  }
  for (let k = 0; k < n; k++) {
    let s = (total * k) / n
    let i = 0
    while (i < V - 1 && s > seg[i]) {
      s -= seg[i]
      i++
    }
    const p = plan[i]
    const q = plan[(i + 1) % V]
    const t = seg[i] > 1e-9 ? Math.min(1, s / seg[i]) : 0
    out.push(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)
  }
  return out
}

/** Walk the site boundary; `s` in [0, 8·half). Somewhere sane for a spare point. */
function perimeterPoint(s, half) {
  const side = half * 2
  let t = s % (side * 4)
  if (t < side) return [-half + t, -half]
  t -= side
  if (t < side) return [half, -half + t]
  t -= side
  if (t < side) return [half - t, half]
  return [-half, half - (t - side)]
}

/* ── The state ────────────────────────────────────────────────────────────── */

export function buildCity(ctx) {
  const count = ctx.count
  const bead = beadOf(ctx)
  const L = layout(count)
  const out = emptyState(count)

  let i = 0
  const emit = (x, y, z, size, red) => {
    if (i >= count) return
    put(out, i++, x, y, z, size, red)
  }

  // ── The hero, at index 0 ────────────────────────────────────────────────
  // Same origin, same footprint, same height as the building state left it. The
  // base ring is red because it is still the plan — the identical thing red
  // meant in the previous state — and it is what makes one parcel in six hundred
  // findable from altitude.
  const plan = heroPlan(ctx)
  const hero = L.heroCount
  const nBase = Math.round(hero * 0.44)
  const nRoof = Math.round(hero * 0.26)
  const nMid = Math.round(hero * 0.16)
  const nVert = Math.max(0, hero - nBase - nRoof - nMid)

  const xz = []
  ringSamples(plan, nBase, xz)
  for (let k = 0; k < nBase; k++) emit(xz[k * 2], 0, xz[k * 2 + 1], bead * 1.18, 1)

  xz.length = 0
  ringSamples(plan, nRoof, xz)
  for (let k = 0; k < nRoof; k++) emit(xz[k * 2], HERO_H, xz[k * 2 + 1], bead * 1.05, 0)

  xz.length = 0
  ringSamples(plan, nMid, xz)
  for (let k = 0; k < nMid; k++) {
    emit(xz[k * 2], HERO_STOREY, xz[k * 2 + 1], bead * 0.95, 0)
  }

  // Corner arrises. They carry no weight from altitude, but the movement OPENS
  // forty-six units from this building, where it still has to read as built.
  const V = plan.length
  for (let v = 0; v < V; v++) {
    const per = Math.floor(nVert / V) + (v < nVert % V ? 1 : 0)
    for (let k = 0; k < per; k++) {
      // Alternate corners climb and descend, so consecutive indices stay joined.
      const u = (k + 1) / (per + 1)
      const y = HERO_H * (v & 1 ? 1 - u : u)
      emit(plan[v][0], y, plan[v][1], bead * 0.9, 0)
    }
  }

  // ── The plat ────────────────────────────────────────────────────────────
  const roofD = bead * 0.92
  const bodyD = bead * 0.72
  const lots = L.lots

  for (let li = 0; li < lots.length; li++) {
    const lot = lots[li]
    const k = L.rings[li]
    const cx = (lot.bx0 + lot.bx1) / 2
    const cz = (lot.bz0 + lot.bz1) / 2
    const hw = (lot.bx1 - lot.bx0) / 2
    const hd = (lot.bz1 - lot.bz0) / 2

    // The boustrophedon runs ACROSS lots too: even parcels climb from their
    // base, odd ones descend from their roof, so a lot hands over to its
    // neighbour at the same end of the building. Ending on the ground and
    // resuming twenty-five storeys up was measured as the single largest source
    // of tears in the index order — the step was the tower's full height.
    const up = (li & 1) === 0

    for (let j = 0; j < k; j++) {
      // Counted from the ROOF whichever way the rings are being walked, so the
      // roof always keeps the heavier bead: it is the read from a camera that
      // spends the whole movement above the city.
      const ring = up ? k - 1 - j : j
      const y = k > 1 ? lot.h * (1 - ring / (k - 1)) : lot.h
      const s = tierScale(lot.h > 0 ? y / lot.h : 0, lot.tiers)
      const ex = hw * s
      const ez = hd * s
      const size = (ring === 0 ? roofD : bodyD) * lot.beadMul

      for (let q = 0; q < 4; q++) {
        // Boustrophedon: a ring finishes on the corner the next ring starts
        // under, so every consecutive pair shares an edge of the massing.
        const c = (j & 1 ? 3 - q : q) & 3
        emit(
          c === 1 || c === 2 ? cx + ex : cx - ex,
          y,
          c === 2 || c === 3 ? cz + ez : cz - ez,
          size,
          0
        )
      }
    }
  }

  // Any slot the plat did not claim walks the site boundary — spread, never
  // clumped, so a spare point has somewhere sane to travel from. Its size is
  // small rather than zero: the site edge is real, and it is the first line an
  // architect draws.
  const spare = count - i
  for (let k = 0; k < spare; k++) {
    const p = perimeterPoint(((k + 0.5) / spare) * 8 * SITE_HALF, SITE_HALF)
    emit(p[0], 0, p[1], bead * 0.5, 0)
  }

  return out
}

/* ── The line layer ───────────────────────────────────────────────────────── */

function seg(o, x0, z0, x1, z1) {
  o.push(x0, 0, z0, x1, 0, z1)
}

function rect(o, x0, z0, x1, z1) {
  seg(o, x0, z0, x1, z0)
  seg(o, x1, z0, x1, z1)
  seg(o, x1, z1, x0, z1)
  seg(o, x0, z1, x0, z0)
}

/**
 * The plat, drawn.
 *
 * Every lot boundary, the plaza, the site edge, the centreline of each avenue,
 * and the hero's own plan — the same lines the building movement's layer was
 * drawing, so the drawing under the building survives the hand-off instead of
 * being replaced by a different drawing of the same ground.
 *
 * Lot rectangles are drawn individually rather than as a shared mesh of edges:
 * the roads are the GAPS between them, so no edge is ever coincident with
 * another and there is nothing to de-duplicate. Ground-level only — the massing
 * is carried entirely by the points, which keeps this layer flat enough to give
 * the aerial haze a continuous surface to grade across.
 *
 * Four segments per lot plus a handful: 1,521 measured, of the 6,000 available.
 * The headroom is deliberate — a roof outline per massing would fit inside it if
 * the direction ever wants the city read as surfaces rather than as corners.
 */
export function buildCityLines(ctx) {
  const L = layout(ctx ? ctx.count : 5200)
  const o = []

  rect(o, -SITE_HALF, -SITE_HALF, SITE_HALF, SITE_HALF)
  rect(o, L.plaza.x0, L.plaza.z0, L.plaza.x1, L.plaza.z1)

  const plan = heroPlan(ctx)
  for (let v = 0; v < plan.length; v++) {
    const p = plan[v]
    const q = plan[(v + 1) % plan.length]
    seg(o, p[0], p[1], q[0], q[1])
  }

  for (const lot of L.lots) rect(o, lot.x0, lot.z0, lot.x1, lot.z1)

  // Only the primary cuts. An avenue with a centreline reads as a route through
  // the plat; every lane with one reads as hatching.
  for (const c of L.cuts) {
    if (c.depth >= 3) continue
    if (c.onX) seg(o, c.c, c.a, c.c, c.b)
    else seg(o, c.a, c.c, c.b, c.c)
  }

  return new Float32Array(o)
}
