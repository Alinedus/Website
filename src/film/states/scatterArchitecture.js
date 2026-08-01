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

export function buildScatter(ctx) {
  const { count, anchors, anchorCount, rng } = ctx
  const out = emptyState(count)

  for (let i = 0; i < count; i++) {
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
  }

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
