/**
 * Brand tokens for the hero.
 *
 * RED is the protagonist of this scene — the "intelligence dot" that floats
 * above the `d` in the wordmark and appears alone in the app icon. It is the
 * ONLY saturated colour in the film and it is never used decoratively: it
 * marks the moments where the system understands something.
 *
 * NOTE: `RED` is eyeballed from the supplied logo artwork. If there is an
 * official brand hex, change it here and nowhere else — every shader, DOM
 * element and material below reads this one value.
 */
export const PAPER = '#faf6ee' // warm paper, matches the app's --paper
export const INK = '#0d0d0d' // the wordmark beads read as pure black
export const RED = '#f5341b' // the intelligence dot
export const GRID = '#e2dccf' // drafting grid behind the lockup

/** Same values as linear-ish RGB triples for shader uniforms. */
export const rgb = (hex) => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
]

/**
 * The scene's beat sheet, in normalised scroll progress.
 *
 * Total scroll distance is set in Hero.jsx so that a natural, unhurried
 * scroll traverses 0 → 1 in roughly 15–20 seconds.
 */
export const BEATS = {
  //         start  end
  VOID: [0.0, 0.07], // paper. the dot wakes, alone.
  AWAKEN: [0.03, 0.56], // the field wakes, bead by bead, in the dot's wake
  CONNECT: [0.24, 0.58], // anchors find each other; architecture draws
  ALIGN: [0.55, 0.87], // everything converges to one plane
  LOCK: [0.84, 1.0], // the dot takes its place. the word is readable.
}
