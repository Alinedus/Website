/**
 * The scroll map. Single source of truth for the whole film — the DOM sections, the 3D stage and
 * the spine all read their timing from here, so nothing can drift out of sync.
 *
 * All values are global scroll progress, 0 to 1.
 *
 * One deliberate change from the written plan: the cut was specified as 50–54%. At 13 viewports
 * that is half a screen of scrolling for eight distinct moves, which is far too fast for the
 * moment the whole site is built around. It now runs 50–62%. It still *begins* at the halfway
 * mark, so "the loop is cut at the midpoint" holds; it just has room to land. Act II absorbs the
 * cost, dropping from 34% to 26%.
 */

export type Act = 1 | 2 | 0 // 0 is the hinge — belongs to neither side

export interface Scene {
  id: string
  label: string
  note: string
  from: number
  to: number
  act: Act
  /** where this scene looks best as a single composed frame, for the reduced-motion path */
  still: number
}

export const SCENES: Scene[] = [
  { id: '01', label: 'The head comes off', note: 'his head detaches, a body draws itself beneath it, the ground begins to darken', from: 0.0, to: 0.04, act: 1, still: 0.032 },
  { id: '02', label: 'The circuit builds', note: 'the first steps arrive under him — the rest of the loop is built by walking it', from: 0.04, to: 0.12, act: 1, still: 0.113 },
  { id: '03', label: 'Lap one', note: 'seven beats — think, sketch, draft, model, render, present, reject', from: 0.12, to: 0.38, act: 1, still: 0.25 },
  { id: '04', label: 'Laps two and three', note: 'the lap accelerates, the counters climb, progress toward execution stays at zero', from: 0.38, to: 0.46, act: 1, still: 0.432 },
  { id: '05', label: 'Stuck in the endless design loop?', note: '', from: 0.46, to: 0.5, act: 1, still: 0.478 },
  { id: '06', label: 'The cut', note: 'his head comes down on the ring, the loop is pulled straight, the screen inverts', from: 0.5, to: 0.62, act: 0, still: 0.612 },
  // 07 absorbed what was scene 08. The proof frame and the four "what collapses" cards were both
  // cut, so the act now runs from the way out straight to the logo — four statements, the house
  // finishing under them, and then the reveal. Nothing is inserted between the last line and the
  // mark, which is how the script reads.
  { id: '07', label: 'The line', note: 'intent to execution — one surface, changed on the spot, in front of the client', from: 0.62, to: 0.94, act: 2, still: 0.72 },
  { id: '09', label: 'The sign-off', note: 'the d assembles, holds alone, and the word arrives around it', from: 0.94, to: 1.0, act: 2, still: 0.996 },
]

/**
 * Reduced motion gets one composed frame per beat rather than a degraded version of the film.
 * Scenes that carry several distinct events are subdivided, so the story still arrives in full —
 * it just arrives as stills. Values are fractions within each scene.
 */
const STILLS: Record<string, number[]> = {
  '03': [0.08, 0.22, 0.36, 0.5, 0.64, 0.78, 0.93],
  '06': [0.08, 0.24, 0.94],
  '07': [0.1, 0.36, 0.6, 0.78, 0.95],
}

export function quantise(p: number): number {
  const s = sceneAt(p)
  const steps = STILLS[s.id]
  if (!steps) return s.still
  const l = clamp01((p - s.from) / (s.to - s.from))
  const i = Math.min(steps.length - 1, Math.floor(l * steps.length))
  return s.from + steps[i] * (s.to - s.from)
}

/** The seven stations of lap one, as fractions within scene 03. */
export const STATIONS = ['Think', 'Sketch', 'Draft', 'Model', 'Render', 'Present', 'Reject']

/** Beats inside the cut, in global progress. */
export const CUT = {
  descend: [0.455, 0.505] as const,
  snap: [0.505, 0.528] as const,
  unbend: [0.528, 0.592] as const,
  invert: [0.592, 0.618] as const,
}

/** The ring draws itself across scene 02. */
export const BUILD = [0.04, 0.115] as const

/**
 * Which loop Act I is built on.
 *
 * ---------------------------------------------------------------------------------------------
 * TO REVERT: change STYLE to 'ring'. That is the whole revert — nothing else needs touching.
 * To compare the two live without editing anything, load the site with ?loop=ring or ?loop=stair.
 * ---------------------------------------------------------------------------------------------
 *
 * 'stair' is the staircase: a flat landing, two flights climbing, and one steep flight back down
 * to where it started. You climb all day and arrive exactly where you began, which is the film's
 * whole argument stated as a shape.
 *
 * It is an honest staircase, not a true Penrose, and that is a measurement rather than a
 * preference. For the last tread to land on the first one on screen, the loop's total displacement
 * has to point straight down the view axis — the one direction an orthographic camera cannot see.
 * The climb is vertical, so the horizontal loop has to miss itself by the same amount it climbed:
 * at a rise shallow enough to be invisible (1.5 degrees) that is already 0.15 of a side, and at
 * any rise you can actually see it is 0.7 to 1.9 side lengths. The rectangle stops being a
 * rectangle long before the stair starts being a stair.
 *
 * The uniform-drift trick already in circuit.ts is the other way round and no better: it cancels
 * exactly as much screen height as the climb adds, so the ring is mathematically flat on screen
 * however steep its treads are in world space. That is why `rise` was sitting at zero.
 *
 * The flights must sum to zero or the loop does not close — and they have to be *anti-symmetric*
 * or it stops looking square. Opposite sides of the loop run in opposite directions, so they only
 * stay parallel on screen if their rises are equal and opposite. 0 + r + r - 2r closes honestly and
 * draws a visibly skewed quadrilateral; 0 + b + 0 - b closes and draws a parallelogram.
 *
 * The second one is also the better shape for the story: a landing at the bottom to think on, a
 * flight up, a landing at the top to present from, and the fall back down.
 */
const LOOP_RISE = 0.6
export const LOOP = {
  STYLE: 'stair' as 'stair' | 'ring',
  /** per-step climb for each flight, in flight order: bottom landing, up, top landing, down */
  flights: [0, LOOP_RISE, 0, -LOOP_RISE] as const,
  /** how far a tread hangs below its own walking surface, as a multiple of the tread block */
  riser: 3.4,
}

/** ?loop=ring / ?loop=stair overrides the constant above, for comparing them side by side. */
export function loopStyle(): 'stair' | 'ring' {
  const q = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('loop')
  return q === 'ring' || q === 'stair' ? q : LOOP.STYLE
}

/**
 * The hand-back, in global progress.
 *
 * The preloader's dot flew out of the d and became his head. This is the same move run backwards
 * and thirteen viewports later: his body folds into his head, the head jumps, and it lands as the
 * scarlet dot on the d of the finished logo. It is the only thing in the film that happens twice,
 * and the second time is the reason the first one was worth doing.
 *
 * Owned here rather than in stage.ts because the logo has to hold that one dot back until the head
 * gets there, so two files have to agree on the exact frame it lands.
 */
export const HANDBACK = {
  /** the body drawing itself into the head — the reverse of scene 01 */
  fold: [0.9635, 0.9715] as const,
  /** and the head's arc across to the mark */
  fly: [0.9715, 0.9865] as const,
}

/**
 * Document height, in viewports. Lando Norris runs 15.1 and holds; this sits inside that.
 *
 * Went from 13 to 14 when the four middle stations were slowed down. Seven stations share a fixed
 * budget, so giving four of them more dwell has to come from the other three — and PRESENT and
 * REJECT are the two that least deserve to lose it. One more viewport pays for most of the raise
 * instead, and leaves the two that matter within a few per cent of where they were.
 */
export const VIEWPORTS = 14

export function sceneAt(p: number): Scene {
  for (const s of SCENES) if (p < s.to) return s
  return SCENES[SCENES.length - 1]
}

/** 0 before the scene, 0..1 through it, 1 after. */
export function localProgress(s: Scene, p: number): number {
  return clamp01((p - s.from) / (s.to - s.from))
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

export function inRange(r: readonly [number, number], p: number): number {
  return smoothstep(r[0], r[1], p)
}
