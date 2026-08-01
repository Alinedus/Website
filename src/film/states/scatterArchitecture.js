/**
 * The film's first two states, ported from movement 1.
 *
 * These were originally three attribute sets inside the hero's own shader. They
 * are now ordinary states on the film's single spine, which is what removes the
 * only remaining hard cut in the piece: movement 1 no longer "ends" and hand
 * over to a second system, it simply stops being the state the pool is nearest.
 *
 * Point identity across the whole film is established HERE, because these are
 * the states every later one inherits its indexing from:
 *
 *   [0, anchorCount)          the architecture's anchors, in edge order
 *   [anchorCount, count)      ambient dust in a shell around the corridor
 *
 * Later states must respect that banding — a point that was a wall corner
 * should become a wall corner, not a random neuron — or the transitions read as
 * noise instead of transformation.
 */

import { emptyState } from './index.js'

/** World diameter of an unresolved anchor bead. Small: in the middle of the
 *  film the drawn LINES carry the read and the beads are only their anchors. */
const ANCHOR_D = 0.13

/**
 * ── THE SHEET ─────────────────────────────────────────────────────────────
 *
 * The film opened on absolutely nothing, and "absolutely nothing" was rendered
 * the way every particle film renders it: an empty page with a circle in the
 * middle of it, then specks fading up. Two clichés stacked on each other — on
 * the one frame the whole site is judged by.
 *
 * An architect's emptiness is not a void. It is a PREPARED SURFACE. Before a
 * single line is drawn there is already a sheet: a trim edge, a margin with a
 * binding side, corner registration, zone stations along the bottom, setting
 * out. That is what "before the drawing" actually looks like to the people
 * this product is for, and it is a COMPOSITION rather than an absence.
 *
 * It is drawn by the same pool as everything else, at low ink weight, so it
 * obeys the film's one rule: nothing is created, things only become other
 * things. These marks are the field that gathers into the architecture a few
 * seconds later.
 *
 * Sized to the opening camera — (0,0,26) looking at (0,0,2) at 35°, so the
 * frame at the sheet's depth is about ±12 by ±7.6 at 16:9. The sheet sits
 * inside that with air around it.
 */
const SHEET_HW = 9.6
const SHEET_HH = 5.6
const SHEET_Z = 0.4
const SHEET_MARGIN = 0.62
/** The lower-left third intersection — where the pen goes down. */
export const SHEET_X3 = -SHEET_HW / 3
export const SHEET_Y3 = -SHEET_HH / 3
/** Construction weight. Visible, and unmistakably not the drawing. */
const SHEET_INK = 0.22
const SHEET_D = 0.115

/** Walk a straight run, dropping marks at a fixed pitch. */
function rule(list, x0, y0, x1, y1, pitch, ink, d) {
  const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / pitch))
  for (let i = 0; i <= n; i++) {
    list.push([x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, ink, d])
  }
}

/** The sheet's furniture, as (x, y, ink, diameter) in the plane z = SHEET_Z. */
function sheetMarks() {
  const m = []
  const W = SHEET_HW
  const H = SHEET_HH
  const g = SHEET_MARGIN
  const gl = g * 1.9 // the binding edge is wider — a real sheet is asymmetric
  // Trim. The firmest thing in the frame, and still a fifth of full ink.
  rule(m, -W, -H, W, -H, 0.085, SHEET_INK, SHEET_D)
  rule(m, -W, H, W, H, 0.085, SHEET_INK, SHEET_D)
  rule(m, -W, -H, -W, H, 0.085, SHEET_INK, SHEET_D)
  rule(m, W, -H, W, H, 0.085, SHEET_INK, SHEET_D)
  // Margin.
  rule(m, -W + gl, -H + g, W - g, -H + g, 0.115, SHEET_INK * 0.5, SHEET_D * 0.85)
  rule(m, -W + gl, H - g, W - g, H - g, 0.115, SHEET_INK * 0.5, SHEET_D * 0.85)
  rule(m, -W + gl, -H + g, -W + gl, H - g, 0.115, SHEET_INK * 0.5, SHEET_D * 0.85)
  rule(m, W - g, -H + g, W - g, H - g, 0.115, SHEET_INK * 0.5, SHEET_D * 0.85)
  // Registration, just inside the trim at each corner.
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const cx = sx * (W - 0.36)
    const cy = sy * (H - 0.36)
    rule(m, cx - 0.28, cy, cx + 0.28, cy, 0.075, SHEET_INK * 1.6, SHEET_D)
    rule(m, cx, cy - 0.28, cx, cy + 0.28, 0.075, SHEET_INK * 1.6, SHEET_D)
  }
  // Zone stations along the bottom trim: this sheet is one of a set.
  for (let i = 1; i < 8; i++) {
    const x = -W + (2 * W * i) / 8
    rule(m, x, -H, x, -H + 0.32, 0.075, SHEET_INK * 1.25, SHEET_D)
  }
  // Setting out. Faintest of all, and they cross exactly where the pen lands.
  rule(m, SHEET_X3, -H + g, SHEET_X3, H - g, 0.19, SHEET_INK * 0.36, SHEET_D * 0.8)
  rule(m, -W + gl, SHEET_Y3, W - g, SHEET_Y3, 0.19, SHEET_INK * 0.36, SHEET_D * 0.8)
  return m
}

export function buildScatter(ctx) {
  const { count, anchors, anchorCount, rng } = ctx
  const out = emptyState(count)

  // The sheet is drawn by the LAST marks in the pool — the dust band, the one
  // group no later state assigns meaning to, so borrowing it here costs
  // nothing downstream and every mark still has exactly one identity.
  const sheet = sheetMarks()
  const sheetStart = Math.max(anchorCount, count - sheet.length)
  const sheetN = Math.min(sheet.length, count - sheetStart)

  for (let i = 0; i < count; i++) {
    const inSheet = i >= sheetStart && i - sheetStart < sheetN
    if (inSheet) {
      const [sx, sy, ink, d] = sheet[i - sheetStart]
      out.pos[i * 4] = sx
      out.pos[i * 4 + 1] = sy
      out.pos[i * 4 + 2] = SHEET_Z
      out.pos[i * 4 + 3] = d
      out.ink[i] = ink
      continue
    }

    const isAnchor = i < anchorCount
    let x
    let y
    let z

    if (isAnchor) {
      // Beads begin dispersed around where they will be needed, so the
      // gathering reads as focusing rather than as teleportation.
      const spread = 22
      x = anchors[i * 3] + (rng() - 0.5) * spread
      y = anchors[i * 3 + 1] + (rng() - 0.5) * spread * 0.6
      z = anchors[i * 3 + 2] + (rng() - 0.5) * spread
    } else {
      // Dust sits in a shell AROUND the corridor rather than inside it, so it
      // never drifts through the lens and becomes a black disc.
      const a = rng() * Math.PI * 2
      const r = 46 + rng() * 46
      x = Math.cos(a) * r
      y = Math.sin(a) * r * 0.55 + 4
      z = 4 - rng() * 140
    }

    const d = ANCHOR_D * (0.72 + rng() * 0.56)
    out.pos[i * 4] = x
    out.pos[i * 4 + 1] = y
    out.pos[i * 4 + 2] = z
    out.pos[i * 4 + 3] = d
    // Unresolved matter is drawn at construction weight. It was at full ink,
    // which is why the opening read as a scatter of hard black specks — dust
    // on a lens — rather than as tone the drawing has not yet resolved out of.
    // It comes up to full weight as the architecture assembles.
    out.ink[i] = isAnchor ? 0.4 : 0.26
  }

  // The sheet is the SURFACE, not the drawing, so it is exempt from the wake
  // order that reveals everything else in the dot's path. Published here so
  // context.js can stamp those marks with the sentinel that bypasses it —
  // without which the prepared sheet is invisible on frame zero, which is the
  // one frame it exists for.
  out.sheetBand = [sheetStart, sheetStart + sheetN]
  return out
}

export function buildArchitectureState(ctx) {
  const { count, anchors, anchorCount, rng } = ctx
  const out = emptyState(count)

  for (let i = 0; i < count; i++) {
    const d = ANCHOR_D * (0.72 + rng() * 0.56)
    if (i < anchorCount) {
      out.pos[i * 4] = anchors[i * 3]
      out.pos[i * 4 + 1] = anchors[i * 3 + 1]
      out.pos[i * 4 + 2] = anchors[i * 3 + 2]
      out.pos[i * 4 + 3] = d
    } else {
      // Dust holds its shell — it is the depth of the room, not a participant.
      const a = rng() * Math.PI * 2
      const r = 46 + rng() * 46
      out.pos[i * 4] = Math.cos(a) * r
      out.pos[i * 4 + 1] = Math.sin(a) * r * 0.55 + 4
      out.pos[i * 4 + 2] = 4 - rng() * 140
      out.pos[i * 4 + 3] = d * 0.7
    }
  }

  return out
}
