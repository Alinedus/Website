/**
 * The seven stations of lap one, and the real copy for each.
 *
 * The numbers here are the ones you signed off. They are the spine of Act I — if they ever change,
 * they change here and nowhere else.
 */

export interface Station {
  key: string
  /** what appears at the centre of the ring while he is here */
  artifact: string
  /** the line that lands, verbatim */
  line: string
  /** the second line, under it */
  sub?: string
  cost: string
  /** true for the client's line — the only scarlet type in Act I */
  client?: boolean
}

export const STATIONS: Station[] = [
  {
    key: 'Think',
    artifact: 'a bubble diagram',
    line: 'It all begins with an idea.',
    sub: 'A thought worth building.',
    cost: '+2h',
  },
  {
    key: 'Sketch',
    artifact: 'a loose hand line',
    line: 'The idea becomes sketches.',
    sub: 'Exploring various possibilities.',
    cost: '+4h',
  },
  {
    key: 'Draft',
    artifact: 'the plan, snapped to grid',
    line: 'Sketches become drawings.',
    sub: 'Every line now becomes precise.',
    cost: '+2d',
  },
  {
    key: 'Model',
    artifact: 'walls rising',
    line: 'Drawings transform into 3D models.',
    sub: 'Geometry takes precedence.',
    cost: '+3d',
  },
  {
    key: 'Render',
    artifact: 'six hours of noise resolving',
    line: 'The model becomes a presentation.',
    sub: 'Rendered. Refined. Ready.',
    cost: '+8h',
  },
  {
    key: 'Present',
    artifact: 'the client, watching',
    line: 'The designer presents. The client reviews.',
    cost: '0',
  },
  {
    key: 'Reject',
    artifact: 'everything, in reverse',
    line: '“Can we try another option?”',
    sub: 'And… back to the beginning.',
    cost: '−6d',
    client: true,
  },
]

/** The three statements that take the full screen between laps in scene 04. */
export const LAP_LINES = [
  'The change was small. The cost was not.',
  'Feedback only arrives after the expensive part is finished.',
  'You are not paid for revisions. You do them anyway.',
]

/** Counters through the acceleration. Lap 0 is lap one. */
export function counters(lap: number) {
  const l = Math.max(0, Math.min(10, lap))
  return {
    revision: 1 + l,
    day: Math.round(4 + l * 3.4),
    fee: Math.round(100 - l * 6.6),
  }
}
