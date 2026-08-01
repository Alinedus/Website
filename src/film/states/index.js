/**
 * The film's states, assembled.
 *
 * ── The contract every state generator obeys ──────────────────────────────
 *
 * A state generator is a PURE function of the shared film context. It returns
 * targets for the ONE persistent point pool:
 *
 *   (ctx) => { pos: Float32Array(N * 4), red: Float32Array(N) }
 *
 *   pos[i*4 + 0..2]  world position of point i in this state
 *   pos[i*4 + 3]     its world DIAMETER here. Zero means "not part of this
 *                    state" — the point is still alive, it simply has no size,
 *                    which is how things vanish without ever being destroyed.
 *   red[i]           0 = ink, 1 = the accent. Never decorative.
 *
 * Rules the generators must respect, because the film has no cuts:
 *
 *  1. N IS FIXED for the whole film. Every state must fill every slot.
 *  2. A point's INDEX IS ITS IDENTITY. Point 4,102 is the same speck of matter
 *     in every state, so if it is a window mullion in one state and a neuron in
 *     the next, the audience watches that specific thing become that other
 *     thing. Generators should therefore assign targets by a rule that keeps
 *     neighbours together (sort by angle, by height, by index band) rather than
 *     at random, or every transition degenerates into noise.
 *  3. States are authored in a SHARED WORLD SCALE. The camera does the framing;
 *     a generator must not "zoom" by making its geometry tiny or enormous
 *     unless the scale change IS the point (the city).
 *  4. No DOM, no three, no React. Geometry only, so every state is testable and
 *     cheap enough to build on the main thread at boot.
 */

import { buildScatter, buildArchitectureState } from './scatterArchitecture.js'
import { buildWordmarkState } from './wordmarkState.js'
import { buildBlueprint } from './blueprint.js'
import { buildBuilding } from './building.js'
import { buildCity } from './city.js'
import { buildNetwork, networkGraph } from './network.js'
import { buildIntelligence } from './intelligence.js'
import { buildMark } from './mark.js'
import { STATES } from '../timeline.js'

/** Total points in the pool. Fixed for the life of the film. */
export const POOL = 5200

const GENERATORS = {
  scatter: buildScatter,
  architecture: buildArchitectureState,
  wordmark: buildWordmarkState,
  blueprint: buildBlueprint,
  building: buildBuilding,
  city: buildCity,
  network: buildNetwork,
  intelligence: buildIntelligence,
  mark: buildMark,
}

/** An empty state — every point present, nothing sized. */
export function emptyState(n = POOL) {
  return { pos: new Float32Array(n * 4), red: new Float32Array(n) }
}

/**
 * Hand a finished state to the states that read it.
 *
 * Three generators are written to take the state before them — network wants
 * the city ("nothing flies" is only literally true if it reads the positions
 * the city actually wrote), intelligence wants the network and its graph (the
 * BFS depth IS the entity's radius), and mark wants the body it is absorbing.
 * Each falls back to a synthesised stand-in, so leaving them unwired never
 * BREAKS the film — it silently makes those three states unrelated to the ones
 * they follow, which measured as a full re-shuffle at two of the film's seams.
 * States are built in timeline order, so wiring them costs one assignment.
 *
 * Written out by name rather than as `ctx[key] = out`: the state key
 * `wordmark` collides with `ctx.wordmark`, the sampled logotype every later
 * state reads its bead geometry from, and clobbering it destroys the film from
 * the blueprint onward.
 */
function publishState(ctx, key, out) {
  if (key === 'city') ctx.city = out
  else if (key === 'network') {
    ctx.network = out
    // The descriptor is a cheap read of network's own cached layout, but a
    // throw here must cost intelligence its graph, never the whole film.
    try {
      ctx.networkGraph = networkGraph(ctx)
    } catch (e) {
      console.warn('networkGraph failed; intelligence will synthesise one', e)
    }
  } else if (key === 'intelligence') ctx.intelligence = out
}

/**
 * Build every state once, at boot.
 *
 * @param {object} ctx shared context — the wordmark geometry, the architecture
 *   descriptors, the pool size, and a deterministic RNG. MUTATED as it goes:
 *   each state that a later one reads is published back onto it.
 * @returns {Array<{pos: Float32Array, red: Float32Array}>} indexed to STATES
 */
export function buildAllStates(ctx) {
  return STATES.map((s) => {
    const gen = GENERATORS[s.key]
    if (!gen) return emptyState(ctx.count)
    const out = gen(ctx)
    if (!out || out.pos.length !== ctx.count * 4) {
      throw new Error(`state "${s.key}" returned the wrong shape`)
    }
    publishState(ctx, s.key, out)
    return out
  })
}

/** Deterministic PRNG — the composition must be identical on every load. */
export function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Write one point's target. */
export function put(out, i, x, y, z, size, red = 0) {
  out.pos[i * 4] = x
  out.pos[i * 4 + 1] = y
  out.pos[i * 4 + 2] = z
  out.pos[i * 4 + 3] = size
  out.red[i] = red
}
