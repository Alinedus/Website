/**
 * The film's single timeline.
 *
 * There are no sections. The whole experience is ONE pinned stage, ONE canvas
 * and ONE scroll progress P in [0,1], and everything on screen is a function
 * of P. That is what makes hard cuts structurally impossible rather than
 * merely avoided.
 *
 * ── The keyframe model ────────────────────────────────────────────────────
 *
 * The persistent point pool moves through a sequence of STATES. Each state is
 * a full set of targets for every point; the pool is only ever interpolating
 * between two adjacent states. So the film is, literally, a single continuous
 * interpolation from the first state to the last — nothing is created, nothing
 * is destroyed, things only become other things.
 *
 * MOVEMENTS are the art direction laid over that spine: which states they
 * span, what the camera does, which auxiliary layers are lit. A movement
 * boundary is therefore just a change of styling over an unbroken morph, which
 * is exactly the "no hard scene changes" requirement.
 */

/**
 * States, in order. `hold` is how long the film rests on this state before it
 * begins moving to the next; `morph` is how long that move takes. Both in
 * seconds of unhurried scrolling — see SECONDS_TO_VH in Film.jsx.
 */
/**
 * ── THE RHYTHM ────────────────────────────────────────────────────────────
 *
 * These numbers ARE the edit, and the first version of them was a metronome:
 * six of the nine holds were 3.5 seconds and four of the morphs were exactly
 * 5.0. Nine near-equal beats is not a film, it is a slideshow with dissolves —
 * and 56% of the runtime was spent IN those dissolves, so more than half the
 * piece was the mush between compositions rather than the compositions.
 *
 * A film has a shape. This one now accelerates: every morph after the title
 * card is shorter than the one before it (4.2 → 3.7 → 3.4 → 3.1 → 2.9 → 2.6 →
 * 2.3), so the idea visibly compounds — plan, building, city, graph arriving
 * faster and faster — and then the last transition DECELERATES into the
 * climax at 3.8. Holds are all distinct and are spent where the frames earn
 * them: the two strongest compositions in the film, the drafting table and the
 * aerial plan, get the longest ones in the body, and the resolution gets 6.5
 * seconds because it is the only frame anybody is asked to act on.
 *
 * The opening hold drops from 2.0 to 1.2. Nobody scrolls to look at an empty
 * page for two seconds; they scroll to find out whether anything happens.
 *
 * Morph share is now 46%, from 56%, and the film is 57 seconds instead of 71 —
 * which also takes four thousand pixels off the scroll contract.
 */
export const STATES = [
  { key: 'scatter', hold: 1.2, morph: 4.2 },
  { key: 'architecture', hold: 2.6, morph: 3.7 },
  { key: 'wordmark', hold: 4.2, morph: 3.4 },
  { key: 'blueprint', hold: 4.0, morph: 3.1 },
  { key: 'building', hold: 2.8, morph: 2.9 },
  { key: 'city', hold: 3.8, morph: 2.6 },
  { key: 'network', hold: 2.4, morph: 2.3 },
  { key: 'intelligence', hold: 3.2, morph: 3.8 },
  { key: 'mark', hold: 6.5, morph: 0 },
]

export const STATE_INDEX = Object.fromEntries(STATES.map((s, i) => [s.key, i]))

/** Total runtime in seconds at a natural scroll pace. */
export const RUNTIME_S = STATES.reduce((a, s) => a + s.hold + s.morph, 0)

/**
 * Cumulative P at which each state's hold begins and its morph-out ends.
 * Built once at module load.
 */
const CUTS = (() => {
  const out = []
  let t = 0
  for (const s of STATES) {
    const holdStart = t / RUNTIME_S
    t += s.hold
    const morphStart = t / RUNTIME_S
    t += s.morph
    out.push({ key: s.key, holdStart, morphStart, morphEnd: t / RUNTIME_S })
  }
  return out
})()

export const STATE_CUTS = CUTS

/** Smooth, symmetric. Never linear — linear reads as machinery, not as film. */
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/**
 * Resolve P into the pair of states currently being interpolated.
 *
 * @returns {{ from: number, to: number, morph: number, key: string }}
 *   `morph` is eased 0..1 from `from` to `to`. When the film is resting on a
 *   state, from === to and morph === 0.
 */
export function resolveStates(P) {
  const p = Math.min(1, Math.max(0, P))
  for (let i = 0; i < CUTS.length; i++) {
    const c = CUTS[i]
    if (p < c.morphStart) return { from: i, to: i, morph: 0, key: c.key }
    if (p < c.morphEnd) {
      const raw = (p - c.morphStart) / (c.morphEnd - c.morphStart || 1)
      return { from: i, to: Math.min(i + 1, CUTS.length - 1), morph: easeInOut(raw), key: c.key }
    }
  }
  const last = CUTS.length - 1
  return { from: last, to: last, morph: 0, key: CUTS[last].key }
}

/**
 * Movements — the art direction over the spine.
 *
 * Each movement OWNS a set of states. Ownership is exclusive, so at rest
 * exactly one movement is lit; across a morph the two involved cross-fade.
 * That is the whole hand-off mechanism, and it is why there is no seam.
 */
export const MOVEMENTS = [
  { key: 'nothing', owns: ['scatter', 'architecture', 'wordmark'] },
  { key: 'blueprint', owns: ['blueprint'] },
  { key: 'building', owns: ['building'] },
  { key: 'city', owns: ['city'] },
  { key: 'network', owns: ['network'] },
  { key: 'intelligence', owns: ['intelligence'] },
  { key: 'resolution', owns: ['mark'] },
]

/**
 * The span a movement's camera is authored over — from the first frame its
 * geometry starts arriving to the last frame it is still the subject.
 *
 * This is used ONLY to derive the movement's local t for its camera intent.
 * How LIT a movement is has to be a different question, because these spans
 * necessarily overlap: two consecutive movements share the morph between them.
 */
export function movementWindow(m) {
  const first = STATE_INDEX[m.owns[0]]
  const last = STATE_INDEX[m.owns[m.owns.length - 1]]
  const start = first === 0 ? 0 : CUTS[first - 1].morphStart
  const end = last >= CUTS.length - 1 ? 1 : CUTS[last].morphStart
  return [start, Math.max(start + 1e-4, end)]
}

export const MOVEMENT_WINDOWS = Object.fromEntries(
  MOVEMENTS.map((m) => [m.key, movementWindow(m)])
)

/**
 * How present a STATE is at P — 1 while the film rests on it, ramping across
 * the morphs either side.
 *
 * Auxiliary layers must be tied to states, not to movements. A movement's
 * window spans two states and stays open through the second one's hold, so a
 * layer keyed to the movement outlives its own geometry: the corridor's
 * architecture lines were still fully lit over the finished logotype and then
 * over the blueprint, drawing a wireframe city across a flat drafting sheet.
 * The lines belong to the shape the points are currently making, and that is
 * exactly what this measures.
 */
export function stateWeight(key, P) {
  const i = STATE_INDEX[key]
  if (i == null) return 0
  const c = CUTS[i]

  // Rising: the morph that brings the pool INTO this state.
  let rise = 1
  if (i > 0) {
    const prev = CUTS[i - 1]
    if (P <= prev.morphStart) return 0
    if (P < prev.morphEnd) {
      rise = (P - prev.morphStart) / (prev.morphEnd - prev.morphStart || 1)
    }
  }

  // Falling: the morph that takes it out again.
  //
  // The film's LAST state has no morph out, so its span is zero and its window
  // closed at exactly P = 1 — which is precisely the value `prefers-reduced-
  // motion` pins the film to, since that path HOLDS the resolved final frame
  // rather than animating to it. A half-open `P >= morphEnd` test therefore
  // returned 0 for every state at once: no movement was lit, so the camera had
  // no intent, the look never blended, `reveal` stayed at 0, and the lockup,
  // the tagline and the invitation all sat at opacity 0. A reduced-motion
  // visitor got a blank sheet of paper with no way to reach the CTA. A state
  // that never morphs out never ends.
  const span = c.morphEnd - c.morphStart
  let fall = 1
  if (span > 0) {
    if (P >= c.morphEnd) return 0
    if (P > c.morphStart) fall = 1 - (P - c.morphStart) / span
  }

  return Math.min(1, Math.max(0, Math.min(rise, fall)))
}

/**
 * How lit a movement is: the presence of the states it OWNS.
 *
 * Weighting by the movement's window instead is what let the night register
 * bleed across the entire daylit city — the network movement's window covers
 * the city's hold, so both palettes were fully live and the blended background
 * came out mid-grey. Ownership is unambiguous: every state belongs to exactly
 * one movement, adjacent states cross-fade across their morph by construction,
 * and each movement therefore has sole possession of its own held frames.
 */
export function movementWeight(key, P) {
  const m = MOVEMENTS.find((x) => x.key === key)
  if (!m) return 0
  let w = 0
  for (const k of m.owns) w += stateWeight(k, P)
  return Math.min(1, w)
}
