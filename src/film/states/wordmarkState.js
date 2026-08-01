/**
 * THE LOGOTYPE — the state movement 1 resolves to, and the film's first
 * moment of legibility.
 *
 * Which points become letters is not arbitrary and not random. Each letterform
 * bead claims the ARCHITECTURAL ANCHOR nearest to an exploded copy of its own
 * position — the wordmark scaled up and pushed back through the corridor. The
 * convergence then reads as DEPTH COLLAPSING: the beads were always in roughly
 * the right place on screen and only ever needed to agree on one plane. That is
 * precisely what the product's name means, so the mechanic and the word are the
 * same idea.
 *
 * The assignment is computed once and EXPORTED, because every later state needs
 * it: the points that were letters must stay a coherent group as they become a
 * plan, a building, a city and a mind, or the film's closing loop cannot land.
 */

import { emptyState } from './index.js'

const SPREAD_XY = 2.15

/**
 * @returns {{ state, wordOf: Int32Array, letterIds: Int32Array }}
 *   `wordOf[i]` is the wordmark bead index that point i carries, or -1.
 *   `letterIds` lists the point indices that form the logotype, in bead order.
 */
export function assignWordmark(ctx) {
  const { count, anchors, anchorCount, wordmark, rng } = ctx
  const { points: word, count: wordCount, tittleIndices } = wordmark

  const tittle = new Set(tittleIndices || [])
  const taken = new Uint8Array(anchorCount)
  const wordOf = new Int32Array(count).fill(-1)
  const letterIds = []

  for (let j = 0; j < wordCount; j++) {
    // The tittle is drawn as its own red mark, so no bead may claim it.
    if (tittle.has(j)) continue

    const px = word[j * 3] * SPREAD_XY
    const py = word[j * 3 + 1] * SPREAD_XY + 3
    const pz = -14 - rng() * 82

    let best = -1
    let bestD = Infinity
    for (let i = 0; i < anchorCount; i++) {
      if (taken[i]) continue
      const dx = anchors[i * 3] - px
      const dy = anchors[i * 3 + 1] - py
      const dz = (anchors[i * 3 + 2] - pz) * 0.28 // favour screen agreement
      const d = dx * dx + dy * dy + dz * dz
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    if (best < 0) break

    taken[best] = 1
    wordOf[best] = j
    letterIds.push(best)
  }

  return { wordOf, letterIds: Int32Array.from(letterIds) }
}

export function buildWordmarkState(ctx) {
  const { count, wordmark, wordOf } = ctx
  const out = emptyState(count)
  const beadD = wordmark.dotRadius * 2

  for (let i = 0; i < count; i++) {
    const j = wordOf[i]
    if (j >= 0) {
      out.pos[i * 4] = wordmark.points[j * 3]
      out.pos[i * 4 + 1] = wordmark.points[j * 3 + 1]
      out.pos[i * 4 + 2] = wordmark.points[j * 3 + 2]
      out.pos[i * 4 + 3] = beadD
    } else {
      // Everything else stands down — size zero, but it keeps a position, so
      // it is dismissed rather than deleted and can be recalled later.
      // Parked just behind the lockup plane on a wide, quiet field.
      const a = (i * 2.399963) % (Math.PI * 2) // golden angle: even, non-clumping
      const r = 26 + (i % 97) * 0.55
      out.pos[i * 4] = Math.cos(a) * r
      out.pos[i * 4 + 1] = Math.sin(a) * r * 0.45
      out.pos[i * 4 + 2] = -6 - (i % 31) * 0.8
      out.pos[i * 4 + 3] = 0
    }
  }

  return out
}
