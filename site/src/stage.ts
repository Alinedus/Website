import * as THREE from 'three'
import { Circuit, easeCut } from './circuit'
import { BUILD, CUT, HANDBACK, LOOP, SCENES, clamp01, inRange, loopStyle, smoothstep } from './scenes'
import { emptyJoints, figureState, solveFigure, HEIGHT, HEAD_REST, HEAD_R } from './figure'
import { createFigureView } from './figureView'
import { createArtifact, type ArtifactState } from './artifact'
import { STATIONS } from './stations'
import { ACT2 } from './act2'
import { reducedMotion } from './capability'

/**
 * The WebGL layer. Owns the circuit, the scarlet dot and the ground, and is driven entirely by a
 * single scroll progress value — it holds no state of its own beyond the geometry.
 */

const CHARCOAL = new THREE.Color('#1A1A1A')
const CLOUD = new THREE.Color('#EFEFEF')
const WHITE = new THREE.Color('#FFFFFF')
const SCARLET = new THREE.Color('#FF391F')
const FILL_DARK = new THREE.Color('#232020')
const FILL_LIGHT = new THREE.Color('#DEDAD8')
const DIM_ON_DARK = new THREE.Color('#8B8482')
const DIM_ON_LIGHT = new THREE.Color('#6B6664')

export interface StageReadout {
  /** which station he is at during lap one, or -1 */
  station: number
  /** how far through the current station, 0..1 */
  stationLocal: number
  /** completed laps — what he has actually walked */
  lap: number
  /**
   * What the counters read, 0 to 10.
   *
   * Deliberately not the same as `lap`. Eleven revisions and thirty-eight days are a claim about
   * the industry; how many times he goes round the ring is a matter of pacing. Tying the two
   * together meant slowing him down silently rewrote the numbers, so they are separate.
   */
  tally: number
  /** station marker positions in screen pixels, for the DOM labels */
  screen: { x: number; y: number }[]
  /** how far his head is off his body, 0 to 1 — the corner mark mirrors it */
  headLift: number
}

export interface Stage {
  update(p: number): void
  /**
   * Where his head is on screen right now, in CSS pixels, and how big.
   *
   * The preloader's dot flies to exactly this and then hands over, so the same red dot that was
   * bouncing on the d becomes the head without a cut. If these two ever disagree the illusion
   * breaks instantly, so the number comes from the live projection rather than a constant.
   */
  headScreen(): { x: number; y: number; r: number }
  /** current ink colour, so the DOM can invert in step with the ground */
  ink: THREE.Color
  inkDim: THREE.Color
  readout: StageReadout
}

/**
 * @param logoDotAt where the sign-off logo's d-dot will land, in screen pixels. Asked for live
 *   every frame of the hand-back rather than cached, because the logo is laid out by CSS and a
 *   stale target puts his head a few pixels off the mark, which is exactly what the eye catches.
 */
export function createStage(
  canvas: HTMLCanvasElement,
  logoDotAt: () => { x: number; y: number; r: number } | null = () => null,
): Stage {
  const VIEW_DIR = new THREE.Vector3(1, 1, 1).normalize()
  const FWD = VIEW_DIR.clone().negate()
  const RIGHT = new THREE.Vector3().crossVectors(FWD, new THREE.Vector3(0, 1, 0)).normalize()
  const UP = new THREE.Vector3().crossVectors(RIGHT, FWD).normalize()

  const stair = loopStyle() === 'stair'
  const circuit = new Circuit({
    stepsPerFlight: 11,
    side: 18,
    rise: 0,
    flights: stair ? LOOP.flights : undefined,
    /*
     * Rotated so the top landing is also what looks highest.
     *
     * This number is not cosmetic. In this projection a run going away from the camera falls on
     * screen and one coming toward it rises, by 0.667 a step — twice what a step of climb adds. So
     * which way a flight points decides whether it reads as up or down, and world height only bends
     * the slope. At the wrong rotation the top of the stairs projects within a hair of the bottom
     * of them, and PRESENT — correctly placed on the highest treads in the model — sits at the front
     * of the frame looking like the lowest point on the loop.
     *
     * Searched all forty-four: eleven put the top landing where it reads highest, and 0 is the one
     * that also starts the bottom landing on the tread he rests on.
     */
    cutIndex: stair ? 0 : undefined,
    right: RIGHT,
    up: UP,
  })
  /** how far a tread hangs below its own top, so a flight reads as stairs and not stacked plates */
  const RISER = stair ? LOOP.riser : 1
  /**
   * How wide the view is in Act I.
   *
   * The staircase is a taller object than the ring — 21.0 world units of screen height against the
   * ring's 15.0, with the top landing and the bottom one at opposite ends of the frame. Measured,
   * not guessed: at 26 it fits but leaves 87px above it at 1600x900, which the station labels then
   * overshoot.
   */
  const BASE_FRUSTUM = stair ? 31 : 26
  /** no station name ever lands closer than this to an edge */
  const LABEL_EDGE = 34
  /**
   * How far the loop is lifted in Act I so it sits centred in the frame.
   *
   * The Circuit centres the bbox of its walking surfaces on the origin, which is the right thing
   * for a flat ring and the wrong thing for a staircase: the treads hang below their own tops, and
   * a climb is not symmetrical about its middle once you draw the mass under it. Measured, the
   * staircase's drawn box spans 21.0 screen units with its middle 0.45 below the origin, so that is
   * what it gets back.
   */
  const LOOP_LIFT = stair ? 0.45 : 0
  /**
   * Where the model stands inside the loop.
   *
   * At y=0 it sat 1.75 screen units above the middle of the courtyard, crowded up against the DRAFT
   * flight with the whole lower half of the void empty under it. Solved rather than nudged: -2.14
   * puts its screen centre exactly on the loop's centroid, which is the definition of centred and
   * the furthest it can get from all four flights at once.
   *
   * It floats 2.48 above the landing rather than resting on it. Sitting it on the landing would
   * trade crowding the top flight for crowding the bottom one, and it has always floated anyway —
   * there is no ground in here to stand on.
   */
  const MODEL_Y = stair ? -2.14 : 0
  /** and a nudge further right, on top of the offset that clears Act I's copy — about a centimetre */
  const LOOP_NUDGE = stair ? 1.2 : 0

  /**
   * How a narrow frame is fitted, and where the layout stacks.
   *
   * An orthographic frustum fits its *height* — the width you get is height x aspect. That is the
   * right way round on a landscape screen and catastrophic on a phone: at 390x844 the camera keeps
   * 14 world units of width where the loop alone is 27 across, so most of the drawing falls off the
   * sides. It was never a styling problem; the projection was doing the wrong thing.
   *
   * So below square we fit the width instead — to whatever a square frame would have given — and
   * let the height run long. That rule is continuous at a = 1 by construction, so there is no jump
   * at the threshold and a rotating phone just slides between the two. The drawing stays the size
   * it was composed at, and the surplus vertical space is exactly where the copy needs to go.
   *
   * The horizontal offset that pushes Act I's loop clear of the bottom-left copy eases out over the
   * same range: a narrower frame has less width to give away, and by the time the layout stacks
   * there is nothing beside the drawing left to clear.
   */
  const DESIGN_ASPECT = 16 / 9
  /** a little air either side once the width is the thing being fitted */
  const PORTRAIT_MARGIN = 1.1
  /** how far up the frame the drawing rides on portrait, as a fraction of the visible height */
  const PORTRAIT_LIFT = 0.17
  /**
   * Act II's walk, against the width the frame actually has.
   *
   * Measured: between the cut and the reveal he covers 57 world units, running from 9% to 79% of a
   * 16:9 frame. That is 82 world units wide. A landscape tablet has 61 and a phone 50, so the same
   * walk runs him off the edge — off the left at 1024x768, off both at 390x844.
   *
   * So the walk is scaled by however much width there is, and the camera is offset to put the
   * shortened walk back where the long one sat. Both are continuous and both are exactly zero at
   * the design width, so the desktop and laptop cases are bit-for-bit what they were: he still
   * covers 9% to 79% of the frame, on every screen, because that proportion is what was composed.
   *
   * ACT2_ANCHOR is where he starts, in world units left of centre — the pivot the compression
   * happens around, and therefore how far the camera has to move to undo it.
   */
  const ACT2_DESIGN_W = 46 * DESIGN_ASPECT
  const ACT2_ANCHOR = 33.6
  const aspect = () => window.innerWidth / window.innerHeight

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  /*
   * How many pixels this is allowed to cost.
   *
   * A phone at devicePixelRatio 3 would render 3.4M pixels of antialiased line work for a screen
   * that cannot resolve it. Two is the ceiling on a desktop, where the GPU is not the constraint.
   *
   * Keyed to the device class rather than to the width, because width is the wrong proxy: a
   * portrait tablet is twice as wide as a phone but renders two and a half times the pixels, and
   * under a 4x CPU throttle it was the one device that fell under thirty frames. Everything with a
   * coarse pointer and no hover gets 1.5, which is still comfortably above the point where these
   * diagonals start to crawl.
   */
  const handheld =
    typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, handheld ? 1.5 : 2))

  const scene = new THREE.Scene()
  scene.background = CHARCOAL.clone()

  /** the vertical extent the composition was written in */
  let frustum = 26
  /** and what the camera actually uses, once a narrow frame has been widened to fit (see resize) */
  let viewH = 26
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 900)
  camera.position.copy(VIEW_DIR).multiplyScalar(240)
  camera.lookAt(0, 0, 0)

  // transparent from the start, not toggled later — flipping `transparent` at runtime forces a
  // shader recompile and needs an explicit needsUpdate, which is why the ring refused to fade out
  // for the sign-off the first time round
  const stepFill = new THREE.MeshBasicMaterial({
    color: FILL_DARK.clone(),
    transparent: true,
    polygonOffset: true,
    polygonOffsetFactor: 2,
    polygonOffsetUnits: 2,
  })
  const stepEdge = new THREE.LineBasicMaterial({ color: CLOUD.clone(), transparent: true })

  // The tread he is standing on fills with the accent — a whole lit block under his feet reads far
  // better than a marker dot brightening, and it cannot be mistaken for his head the way a scarlet
  // dot on the ring could.
  const stepFillHot = new THREE.MeshBasicMaterial({
    color: SCARLET.clone(),
    transparent: true,
    polygonOffset: true,
    polygonOffsetFactor: 2,
    polygonOffsetUnits: 2,
  })

  const boxGeo = new THREE.BoxGeometry(circuit.dims.len, circuit.dims.height, circuit.dims.depth)
  const edgeGeo = new THREE.EdgesGeometry(boxGeo)

  const nodes: THREE.Group[] = []
  for (let i = 0; i < circuit.count; i++) {
    const g = new THREE.Group()
    g.add(new THREE.Mesh(boxGeo, stepFill))
    g.add(new THREE.LineSegments(edgeGeo, stepEdge))
    scene.add(g)
    nodes.push(g)
  }

  /* ------------------------------------------------------------------ him */
  // He is ~3.6 world units tall against a 1.64 tread — about the proportion of a person on a
  // walkway, which is what makes the circuit read as something you could actually be trapped on.
  // His height in world units, against a 1.64 tread. Everything else about him is expressed in rig
  // units — stride length, how far the head rides above him, how far it falls to reach the ring —
  // so changing this one number rescales the whole character without his feet sliding.
  const FIGURE_SCALE = 3.1 / HEIGHT
  /** how far his head rides above him before it comes down on the ring */
  const HEAD_RISE = 6.4
  /** and how far below rest it has to travel to sit tangent on the tread, not sunk into it */
  const HEAD_DROP = -HEAD_REST + HEAD_R + 0.06
  const HEAD_FALL: readonly [number, number] = [0.502, 0.527]
  const REBIRTH: readonly [number, number] = [0.585, 0.618]
  const STRIDE = 1.6 * FIGURE_SCALE
  const LAP_LEN = circuit.count * circuit.stepLen
  /** where he comes to rest — just past the cut, so the dot lands beside him and he starts Act II
   *  at the left-hand end of the line.
   *
   *  Expressed as a whole tread rather than a round decimal, and that matters twice over. He has to
   *  stand on the *centre* of a block, because that is the block that lights up under him at THINK;
   *  at 0.03 he stood a third of a tread past its edge and the light appeared behind his feet. And
   *  the lap has to start from exactly here, or he steps backwards to reach its first station. */
  /*
   * Two different places, which used to be one.
   *
   * REST is where lap one starts: the foot of the flat landing, so the first thing he does is walk
   * the thinking side. CUT is where the acceleration leaves him for the stop, the cut and the start
   * of the line.
   *
   * They have to be different on the staircase, and the reason is worth writing down. Which tread
   * he stands on when the loop straightens *is* where he stands on the line — the chain becomes the
   * line, so tread 1 is the left-hand end and tread 23 is the middle. Act II needs him at the left.
   * Meanwhile the flat landing can only begin at tread 23 for the cut that makes the top of the
   * stairs actually read as the top. One tread cannot be both, so it is two.
   */
  const REST_I = stair ? 0 : 1
  const REST_T = REST_I / circuit.count
  const CUT_T = 1 / circuit.count
  /**
   * How many more laps the acceleration runs after lap one.
   *
   * It was nine, and nine laps across eight hundredths of the page is a sprint — by the end he is
   * covering most of a tread per frame. Then four, and now two. Whole laps only: half a lap would
   * leave him stopping on the far side of the ring, and the stop is where his head comes off and
   * the cut lands.
   *
   * The counters do not follow this number down — see `tally` on StageReadout. Eleven revisions
   * and thirty-eight days are a claim about the industry; how many times he goes round is pacing.
   */
  const EXTRA_LAPS = 2
  /**
   * Where the acceleration leaves him, as an absolute lap position.
   *
   * Two laps, plus however much of a third it takes to come to rest on the cut tread rather than
   * the one he set off from. On the flat ring those are the same tread and this is exactly three
   * laps, unchanged.
   */
  const CUT_AT = 1 + REST_T + EXTRA_LAPS + (((CUT_T - REST_T) % 1) + 1) % 1
  /** the whole-lap part of it, so Act II can carry on from the same number and his stride does not jump */
  const LINE_BASE = Math.floor(CUT_AT + 1e-9)

  const figure = createFigureView(RIGHT, UP, VIEW_DIR)
  scene.add(figure.group)
  const joints = emptyJoints()
  const state = figureState()
  const _p = new THREE.Vector3()
  const _d = new THREE.Vector3()

  let lastDist = 0
  let walkAmt = 0
  let facing = 1

  /* -------------------------------------------------------- the artifact */
  const artifact = createArtifact()
  scene.add(artifact.group)

  // The client. Same rig, no scarlet head — the accent belongs to one person on this site, and
  // that distinction is the whole reason his head is red in the first place.
  const client = createFigureView(RIGHT, UP, VIEW_DIR, 0x6b6664)
  scene.add(client.group)
  const _cp = new THREE.Vector3()
  const _cd = new THREE.Vector3()
  let clientFade = 0
  const clientJoints = emptyJoints()
  const clientState = figureState()
  solveFigure(clientState, clientJoints)
  /** how far ahead of him the client walks, as a fraction of the lap — about two treads */
  const CLIENT_GAP = 0.042

  /* ----------------------------------------------------- station labels */
  // No markers on the ring any more — the lit tread says where he is, and the names live outside
  // the ring where they are actually legible instead of sitting on top of the treads.
  const markerAt: THREE.Vector3[] = []
  /**
   * Where each station sits, counted in treads from the one he rests on.
   *
   * On the staircase these are not spaced evenly, because the shape means something now. He rests
   * at the foot of the stairs; the flat landing in front of him is the twelve treads of THINK; the
   * climb carries SKETCH, DRAFT, MODEL and RENDER; tread 34 is the top, which is where he PRESENTS;
   * and REJECT is the whole eleven-step fall from there back down to where he started thinking.
   *
   * Even spacing was right when the loop was a flat ring and one tread was much like another. It is
   * wrong now — putting REJECT six treads along a staircase says nothing, and putting it at the top
   * of the descent says the entire thing.
   */
  const STATION_OFFSET = stair ? [0, 12, 15, 18, 20, 22, 34] : [0, 6, 13, 19, 25, 31, 38]
  /** how far each station's beat runs, in treads, plus the leg home from the last one */
  const SEG_LEN = STATION_OFFSET.map((o, i) =>
    (i + 1 < STATION_OFFSET.length ? STATION_OFFSET[i + 1] : circuit.count) - o,
  )
  /**
   * How much of lap one's scroll each beat gets.
   *
   * Not equal shares, and not pure distance either. Equal shares would run him down eleven steps of
   * REJECT in the same scroll it takes to stand still at the top, and pure distance would give
   * PRESENT — one tread — about seventy pixels of scroll to say its line in. Every beat gets a
   * floor for its copy, and the rest is shared out by how far he has to walk.
   *
   * The floor was four treads' worth, which was fine when the stations were evenly spaced around a
   * ring. Once SKETCH, DRAFT, MODEL and RENDER became single blocks on the climb, four was not a
   * floor at all — those four ran at two fifths of the dwell THINK and PRESENT got, and their copy
   * was gone before it could be read. How many treads a station occupies is a fact about the
   * staircase; how long the reader spends there is a fact about the writing, and this is the number
   * that keeps them from being the same decision.
   */
  const BEAT_FLOOR = 22
  const STATION_SPAN: number[] = (() => {
    const w = SEG_LEN.map((d) => d + BEAT_FLOOR)
    const total = w.reduce((a, b) => a + b, 0)
    const out = [0]
    let acc = 0
    for (const v of w) out.push((acc += v) / total)
    return out
  })()
  /** where THINK's run ends in global progress — its copy starts at the very first frame */
  const STATION0_END =
    SCENES[2].from + STATION_SPAN[1] * (SCENES[2].to - SCENES[2].from)
  /** which tread each station occupies, so the right one can be lit */
  const stationTread: number[] = []
  /** and where that tread is along the lap, so he stands on its centre rather than near it */
  const stationT: number[] = []
  for (let i = 0; i < STATIONS.length; i++) {
    // Snapped to whole treads. Fractional stations put him a third of a tread past the block that
    // lights up under him, so the light appeared behind his feet.
    stationTread.push((REST_I + STATION_OFFSET[i]) % circuit.count)
    stationT.push(REST_T + STATION_OFFSET[i] / circuit.count)
    const v = new THREE.Vector3()
    // The name goes at the MIDDLE of the run it names, not at the tread it starts on. REJECT owns
    // the whole descent, so a label pinned to its first tread sat up at the top and read as naming
    // that one step; centred, it reads as naming the flight. Single-block stations are unaffected —
    // the middle of a one-tread run is that tread.
    circuit.sample(stationT[i] + SEG_LEN[i] / 2 / circuit.count, v, _d, true)
    markerAt.push(v)
  }

  const readout: StageReadout = {
    station: -1,
    stationLocal: 0,
    lap: 0,
    tally: 0,
    screen: STATIONS.map(() => ({ x: 0, y: 0 })),
    headLift: 0,
  }

  /* ----------------------------------------------------------- act two */
  // There was a finished double-storey house standing at EXECUTION — the only lit, materialised
  // object on the site. Removed on the founder's call. It also took the site's only three lights
  // and nine standard materials with it, so nothing here is lit any more; every remaining material
  // is basic or line, and the whole film is drawing rather than rendering.

  // Act I's ring used to be ghosted back here at 16% for the last stretch of Act II — the loop he
  // escaped, small and faint beside the line he is now on. It worked while the proof frame stood
  // under it: "the loop / 38 days" against "the line / 1 session", with the two shapes above the
  // two numbers. The proof frame was cut, and without it the ghost was a loop fading in beside
  // nothing, with no copy to say what it was. It read as a stray rectangle, which is all it was.

  // A strip of eleven empty frames used to run across the REVISIONS beat — the eleven revisions as
  // a contact sheet. Removed: at this zoom they read as eleven blank boxes rather than eleven
  // versions of anything, and the copy already says the number.

  const _m2 = new THREE.Matrix4()
  const _fly = new THREE.Vector3()
  const _edge = new THREE.Vector3()
  const _p2 = new THREE.Vector3()
  /** the scale the figure was last drawn at — FIGURE_SCALE except during the hand-back */
  let figScale = FIGURE_SCALE
  const _s2 = new THREE.Vector3()
  const _look = new THREE.Vector3()
  let markersDirty = true
  /** the run of treads currently lit, as offsets from the one he rests on. -1 for none. */
  let hotFrom = -1
  let hotTo = -1
  let figureShown = false
  let artifactInActTwo = false

  const ink = CLOUD.clone()
  const inkDim = DIM_ON_DARK.clone()

  /**
   * How many treads' worth of walking a tread takes to arrive fully.
   *
   * Short on purpose. A long ramp leaves the leading tread sitting at a tenth of its size for ages,
   * which reads as a speck of grit floating off the end of the loop rather than as a step forming.
   * At this width only one or two are ever mid-arrival, and they are big enough to be steps.
   */
  const REVEAL_FADE = 1.4

  /**
   * How far to lift the line so Act II's copy can never run into it, in world units.
   *
   * Measured in pixels and converted, not set as a fraction of the height — the copy is clamped
   * type, so a block is the same number of pixels tall on every screen. The tallest of them, the
   * card grid at "What collapses", stands 419px off the bottom whether the viewport is 900px or
   * 720px; on a 16:9 laptop the line was landing 34px *inside* it. Thirty grid units clears the
   * tallest block with a four-unit gap, and a tall enough window needs no lift at all.
   */
  const ACT2_CLEAR = 480
  function liftFor(t: number): number {
    const h = window.innerHeight
    return ((Math.max(0, ACT2_CLEAR - h / 2) * viewH) / h) * t
  }

  /** how much of the composed Act II width this frame has, 0..1 — set in update(), read by the walk */
  let actFit = 1
  /** and the camera offset and width headroom that go with it, for placing the house */
  let shiftNow = 0
  let roomNow = 1
  let sizedW = 0
  let sizedH = 0
  function resize() {
    const w = window.innerWidth
    const h = window.innerHeight
    const a = w / h
    // see DESIGN_ASPECT — below square, fit the width to what a square frame would have given.
    // The margin ramps in rather than switching on, or a window at exactly square would jump ten
    // per cent as it crossed.
    const narrow = clamp01((1 - a) / 0.35)
    viewH = a < 1 ? (frustum * (1 + (PORTRAIT_MARGIN - 1) * narrow)) / a : frustum
    camera.left = (-viewH * a) / 2
    camera.right = (viewH * a) / 2
    camera.top = viewH / 2
    camera.bottom = -viewH / 2
    camera.updateProjectionMatrix()
    // Only when it has actually changed. This runs every frame, and on a phone innerHeight moves
    // every time the URL bar slides — reallocating the drawing buffer mid-scroll, which is the one
    // thing guaranteed to drop frames exactly when the reader is scrolling fastest.
    if (w !== sizedW || h !== sizedH) {
      renderer.setSize(w, h, false)
      sizedW = w
      sizedH = h
    }
  }
  window.addEventListener('resize', () => {
    markersDirty = true
    resize()
  })

  function update(p: number) {
    const build = inRange(BUILD, p)
    const straighten = inRange(CUT.unbend, p)
    const invert = inRange(CUT.invert, p)

    circuit.solve(straighten)

    // Solved before the treads, because which treads exist is now a question about where he is.
    const s = place(p)

    // a fully transparent material still costs a draw call and a blend, so once the ring has faded
    // out for the sign-off it is switched off rather than left sitting at zero opacity
    const clear = 1 - inRange([0.94, 0.972], p)
    stepEdge.opacity = clear
    stepFill.opacity = clear
    const ringOn = clear > 0.004

    const n = circuit.count
    const flat = 1 - 0.76 * straighten
    // Each tread hangs below its own walking surface far enough to meet the one under it, so a
    // flight reads as a solid stair rather than a row of floating plates. It unwinds back to a
    // plate as the loop straightens, because by then there is nothing to step down to and the
    // line wants to be a line.
    const riser = 1 + (RISER - 1) * (1 - straighten)
    const drop = circuit.dims.height * (riser - 1) * 0.5

    /*
     * Which treads exist yet.
     *
     * The loop used to assemble itself whole during scene 02, before he had taken a step, and then
     * he walked a circuit that was already there waiting for him. It is the other way round now: a
     * short platform arrives under him while he stands, and from there every tread appears a few
     * paces ahead and stays. He walks the loop into existence.
     *
     * It is a better thing to watch and a truer thing to say. The loop is not somewhere he found —
     * it is something he makes by going round it, which is the entire argument of Act I.
     *
     * Counted in treads from the one he rests on, in the order he actually meets them, so tread 0
     * is the *last* to arrive rather than the first: it is the one he steps onto at the very end
     * of the lap, right before REJECT hands him back to THINK.
     */
    const walked = (s.rawT - REST_T) * n
    // Negative before the circuit starts building, so scene 01 still has him falling onto nothing;
    // by the end of scene 02 it is three, which is the platform he sets off from.
    const lead = -0.6 + 3.6 * build
    for (let i = 0; i < n; i++) {
      const g = nodes[i]
      const ahead = (((i - REST_I) % n) + n) % n
      const born = straighten > 0 ? 1 : clamp01((walked - ahead + lead) / REVEAL_FADE)
      g.visible = ringOn && born > 0.001
      if (!g.visible) continue
      g.position.copy(circuit.positions[i])
      // grown downward only — the top face is the thing he walks on and it must not move
      g.position.y -= drop * born
      g.quaternion.copy(circuit.quats[i])
      g.scale.set(born, riser * born, flat * born)
    }

    // ground: charcoal, a white flash as the line lands, then cloud
    const bg = scene.background as THREE.Color
    if (invert < 0.35) bg.copy(CHARCOAL).lerp(WHITE, invert / 0.35)
    else bg.copy(WHITE).lerp(CLOUD, (invert - 0.35) / 0.65)

    const flip = smoothstep(0.15, 0.6, invert)
    stepEdge.color.copy(CLOUD).lerp(CHARCOAL, flip)
    stepFill.color.copy(FILL_DARK).lerp(FILL_LIGHT, flip)
    ink.copy(CLOUD).lerp(CHARCOAL, flip)
    inkDim.copy(DIM_ON_DARK).lerp(DIM_ON_LIGHT, flip)

    // The camera is settled before anything is placed in front of it, because the hand-back has to
    // convert a screen position back into world space and that inverse is only right if the
    // projection it inverts is this frame's, not the last one's.

    // orbiting would break the ring's closure. zoom is safe.
    frustum = BASE_FRUSTUM + (46 - BASE_FRUSTUM) * smoothstep(0, 1, straighten)
    // Fitted first, not last. Everything below is expressed against the extent the camera actually
    // ends up with, and on a narrow frame that is no longer the same number as `frustum`.
    resize()

    const a = aspect()
    const port = a < 1

    // Act I's copy lives bottom-left, so the ring is pushed off-centre to the right to clear it.
    // The offset eases away as the ring straightens and the line takes the full width — and,
    // separately, as the frame narrows: there is less width to give away, and by the time the
    // layout stacks the copy is underneath the drawing and there is nothing beside it to clear.
    const room = clamp01((a - 1) / (DESIGN_ASPECT - 1))
    // Act II on portrait needs the opposite correction. The pair walks the line at world
    // coordinates fixed by the circuit, and the frame is now about 50 world units wide against the
    // 82 the walk was composed in — so where they sit three quarters across on a laptop they run
    // off the right edge of a phone. The camera pans left with them as the loop straightens.
    // see ACT2_DESIGN_W — how much of the composed width this frame actually has, capped at 1 so a
    // wider-than-16:9 monitor changes nothing
    actFit = Math.min(1, (viewH * a) / ACT2_DESIGN_W)
    const shift =
      (6.6 + LOOP_NUDGE) * (1 - straighten) * room +
      ACT2_ANCHOR * (1 - actFit) * straighten
    // And the mirror of that, vertically, for Act II. A ring needs vertical room; a line needs
    // none, so as it straightens the camera lifts it clear of the copy underneath and it settles
    // as a horizon in the upper third — which is the composition the act wanted anyway, the
    // argument standing in open field below the thing it is about.
    // Act II lifts the line clear of its copy; Act I lifts the staircase to sit centred in frame.
    // They are the same control and they hand over as the loop straightens.
    // On portrait a third term rides the whole drawing up into the top half so the bottom half is
    // clear for the copy. A fraction of the visible height rather than a fixed number of world
    // units, because the vertical extent now varies with how narrow the device is.
    const lift =
      liftFor(smoothstep(0, 1, straighten)) +
      LOOP_LIFT * (1 - straighten) +
      (port ? viewH * PORTRAIT_LIFT : 0)
    shiftNow = shift
    roomNow = room
    camera.position
      .copy(VIEW_DIR)
      .multiplyScalar(240)
      .addScaledVector(RIGHT, -shift)
      .addScaledVector(UP, -lift)
    camera.lookAt(_look.copy(RIGHT).multiplyScalar(-shift).addScaledVector(UP, -lift))
    camera.updateMatrixWorld()

    updateFigure(s)
    updateActOne(p, s.rawT)
    updateActTwo(p)
    artifact.setInk(ink, bg)

    // The world clears out for the sign-off, leaving him and then the logo — but he outlives it,
    // because he still has to carry his own head across to the mark.
    figure.visible(figureShown && (clear > 0.02 || p < HANDBACK.fly[1]))

    updateLabels()
    renderer.render(scene, camera)
  }

  /**
   * The world point that lands on a given screen pixel, at the depth the camera is looking at.
   *
   * The projection is orthographic and the basis is fixed, so this is just the forward transform
   * read backwards: the look target is screen centre, and RIGHT and UP span the frustum.
   */
  function worldAtScreen(sx: number, sy: number, out: THREE.Vector3): THREE.Vector3 {
    const w = window.innerWidth
    const h = window.innerHeight
    const a = ((sx / w) * 2 - 1) * ((viewH * (w / h)) / 2)
    const b = (1 - (sy / h) * 2) * (viewH / 2)
    return out.copy(_look).addScaledVector(RIGHT, a).addScaledVector(UP, b)
  }

  /**
   * Act I's centre: the artifact, the stations and the client.
   *
   * `seg` runs 0..7 across the seven stations. During lap one it advances with him; through the
   * acceleration it is just the lap fraction, so the whole build-and-collapse replays every lap,
   * faster each time. Both cases feed the same code — the acceleration is not a separate animation,
   * it is the same one at a different speed, which is exactly the point being made.
   */
  function updateActOne(p: number, rawT: number) {
    const lapOne = p >= SCENES[2].from && p < SCENES[2].to
    const laps = p >= SCENES[3].from && p < SCENES[3].to
    const live = lapOne || laps

    let seg = -1
    // the same schedule he walks to, so the copy and his feet can never disagree
    if (lapOne) seg = stationSeg((p - SCENES[2].from) / (SCENES[2].to - SCENES[2].from))
    else if (laps) seg = (rawT - Math.floor(rawT)) * STATIONS.length
    // Before the walk starts he is already standing on THINK, while his body draws itself and the
    // loop builds under him. That is where "it all begins with an idea" belongs — at the head
    // coming off, not seven minutes into a walk — so the first station opens with the film.
    else if (p < SCENES[2].from) seg = 0

    readout.station = seg < 0 ? -1 : Math.min(STATIONS.length - 1, Math.floor(seg))
    readout.stationLocal = seg < 0 ? 0 : seg - Math.floor(seg)
    // THINK's progress then runs as one ramp from the first frame to the end of its run, so the
    // panel arrives once rather than lifting out and back in at the scene-03 boundary.
    if (readout.station === 0) readout.stationLocal = clamp01(p / STATION0_END)
    readout.lap = Math.floor(rawT)
    // The counters climb the full ten regardless of how many laps he walks, on the same squared
    // curve as the acceleration itself — so they still start slow, run away, and land on the
    // eleventh revision at the thirty-eighth day exactly as the stop arrives.
    if (laps) {
      const l = (p - SCENES[3].from) / (SCENES[3].to - SCENES[3].from)
      readout.tally = Math.min(10, 1 + Math.floor(l * l * 10))
    }

    if (live) {
      artifact.group.visible = true
      artifact.group.scale.setScalar(0.82)
      artifact.group.position.set(0, MODEL_Y, 0)
      artifact.update(artifactAt(seg))
    } else if (!artifactInActTwo) {
      artifact.group.visible = false
    }

    // The client joins him on the ring at PRESENT and walks it with him — a couple of treads ahead,
    // stepping when he steps — right through the rejection, then fades away. He is not a prop that
    // appears to deliver a line; he is on the loop too, which is rather the point.
    clientFade =
      seg < 0 ? 0 : smoothstep(5, 5.4, seg) * (1 - smoothstep(6.5, 6.95, seg))
    client.visible(clientFade > 0.015)
    if (clientFade > 0.015) {
      circuit.sample(rawT + CLIENT_GAP, _cp, _cd, true)
      client.group.position.copy(_cp)
      client.group.position.y += circuit.dims.height * 0.5

      // same stride as his, a little out of step so they do not read as one animation mirrored
      clientState.phase = state.phase + 0.9
      clientState.walk = state.walk
      solveFigure(clientState, clientJoints)

      // facing the way they are going while they walk; turned back to him when they stop
      const along = _cd.dot(RIGHT) > 0 ? 1 : -1
      client.update(clientJoints, {
        scale: FIGURE_SCALE * 0.94,
        bodyDraw: 1,
        facing: state.walk > 0.35 ? along : -along,
      })
      client.setInk(inkDim, clientFade)
    }

    /*
     * Light the tread he is standing on — and, coming down REJECT, every one he has already taken.
     *
     * Everywhere else a station is one block. The descent is not a place, it is eleven steps of
     * falling back to the beginning, so it lights up behind him a step at a time until the whole
     * flight is scarlet by the time he reaches the bottom. That is the only station whose cost you
     * can see accumulating, which is the right one for it to happen to.
     */
    let a = -1
    let bEnd = -1
    if (live && readout.station >= 0) {
      // Taken from where his feet are, not from which beat the copy is on. Those agree only during
      // the hold at the start of each beat; for the rest of it he is walking and the light was
      // being left behind on the tread he set off from, which is what read as lag.
      const lapFrac = rawT - Math.floor(rawT)
      const under = Math.floor(((((lapFrac - REST_T) % 1) + 1) % 1) * circuit.count + 0.5) % circuit.count
      a = under
      bEnd = under
      // Except coming down REJECT, where every step he has taken stays lit behind him, so the
      // whole flight is scarlet by the time he reaches the bottom.
      if (stair && readout.station === STATIONS.length - 1) {
        a = STATION_OFFSET[readout.station]
        bEnd = Math.max(a, Math.min(circuit.count - 1, under))
      }
    }
    if (a !== hotFrom || bEnd !== hotTo) {
      for (let o = hotFrom; hotFrom >= 0 && o <= hotTo; o++) {
        ;(nodes[(REST_I + o) % circuit.count].children[0] as THREE.Mesh).material = stepFill
      }
      for (let o = a; a >= 0 && o <= bEnd; o++) {
        ;(nodes[(REST_I + o) % circuit.count].children[0] as THREE.Mesh).material = stepFillHot
      }
      hotFrom = a
      hotTo = bEnd
    }
    stepFillHot.opacity = stepFill.opacity

  }

  /**
   * Label positions, pushed clear of the ring so the names sit outside it rather than on top of
   * the treads.
   *
   * Called after the camera has been placed for the frame, not before. Computing these inside
   * updateActOne meant the one and only pass ran against a camera that had not been positioned or
   * given an aspect ratio yet, and every label landed somewhere off-screen.
   */
  function updateLabels() {
    if (!markersDirty) return
    const w = window.innerWidth
    const h = window.innerHeight
    _p2.set(0, 0, 0).project(camera)
    const cx = (_p2.x * 0.5 + 0.5) * w
    const cy = (-_p2.y * 0.5 + 0.5) * h
    for (let i = 0; i < STATIONS.length; i++) {
      _p2.copy(markerAt[i]).project(camera)
      const x = (_p2.x * 0.5 + 0.5) * w
      const y = (-_p2.y * 0.5 + 0.5) * h
      const dx = x - cx
      const dy = y - cy
      const len = Math.hypot(dx, dy) || 1
      // Far enough out that the name clears him when he is standing on that station's tread. The
      // staircase spends its height budget going up, so its labels are pushed sideways harder and
      // vertically less — a name shoved another seventy pixels below REJECT lands under the floor.
      //
      // Measured in pixels because legibility is, but scaled by how much frame there is: on a phone
      // a flat 106px is a quarter of the width, and the seven names ended up flung into the corners
      // with the loop stranded between them. Full strength from 1100px up, so nothing on a laptop
      // or a desktop moves at all.
      const spread = Math.min(1, w / 1100)
      readout.screen[i].x = x + (dx / len) * (stair ? 106 : 98) * spread
      readout.screen[i].y = y + (dy / len) * (stair ? 50 : 70) * spread
      // and never outside the frame, whatever the loop is doing
      readout.screen[i].x = Math.max(LABEL_EDGE, Math.min(w - LABEL_EDGE, readout.screen[i].x))
      readout.screen[i].y = Math.max(LABEL_EDGE, Math.min(h - LABEL_EDGE, readout.screen[i].y))
    }
    markersDirty = false
  }

  function artifactAt(seg: number): ArtifactState {
    const since = (k: number) => clamp01(seg - k)
    return {
      think: since(0) * (1 - since(1)),
      sketch: since(1),
      snap: since(2),
      extrude: since(3),
      fill: since(4),
      collapse: since(6),
    }
  }

  /**
   * Where he is, and what he is doing, at a given scroll position.
   *
   * `rawT` is unwrapped laps — lap 3.4 is 3.4. The fractional part places him on the ring; the
   * whole number is what makes the counters climb later. Distance comes from rawT, so his stride
   * never resets at a lap boundary.
   */
  function place(p: number) {
    let rawT = 0
    let slump = 0
    let lookUp = 0
    let headLift = 0
    let bodyDraw = 1
    let condense = 0
    // the impact as the head strikes the ring
    const headPop =
      1 + 2.0 * inRange([0.521, 0.5285], p) * (1 - inRange([0.5285, 0.549], p))

    if (p < SCENES[0].to) {
      // 01 — the head falls, the body draws itself in beneath it
      const l = p / SCENES[0].to
      headLift = 6.2 * (1 - l) * (1 - l)
      bodyDraw = clamp01((l - 0.12) / 0.6)
      rawT = REST_T
    } else if (p < SCENES[2].from) {
      // 02 — he stands while the ring builds around him
      rawT = REST_T
    } else if (p < SCENES[2].to) {
      // 03 — one lap, holding at each of the seven stations
      rawT = lapWithStations((p - SCENES[2].from) / (SCENES[2].to - SCENES[2].from))
    } else if (p < SCENES[3].to) {
      // 04 — the acceleration, and he starts to trudge. Picks up from where lap one left him, one
      // full lap on from rest, and lands exactly on the tread the cut happens on.
      const l = (p - SCENES[3].from) / (SCENES[3].to - SCENES[3].from)
      rawT = 1 + REST_T + l * l * (CUT_AT - 1 - REST_T)
      slump = smoothstep(0, 0.65, l)
    } else if (p < SCENES[5].from) {
      // 05 — the stop. he comes out of the trudge, looks up, and his own head lifts off him
      const l = (p - SCENES[4].from) / (SCENES[4].to - SCENES[4].from)
      rawT = CUT_AT
      slump = 1 - smoothstep(0, 0.5, l)
      lookUp = smoothstep(0.18, 0.72, l)
      headLift = HEAD_RISE * smoothstep(0.58, 1, l)
      condense = smoothstep(0.62, 1, l)
    } else if (p < SCENES[6].from) {
      // 06 — the head is the blade. It hovers, comes down on the ring, and cuts it; then, once
      // the line is straight, the body draws itself back in underneath — the exact reverse of
      // scene 01, where the head came off the d and grew a body on the way down.
      rawT = CUT_AT
      const fall = inRange(HEAD_FALL, p)
      const born = inRange(REBIRTH, p)
      headLift = (HEAD_RISE + (HEAD_DROP - HEAD_RISE) * fall) * (1 - born)
      condense = 1 - born
      lookUp = 1 - fall
    } else {
      // 07+ — he walks the line, holding at each beat and then moving on. Constant motion here
      // reads as hurried; matching lap one's hold-and-travel rhythm is what makes it feel calm.
      rawT = LINE_BASE + lineWalk(p)
      // and then, at the very end, he folds into his own head again — the same move as the stop,
      // run for the opposite reason. There it was so the head could cut the loop; here it is so
      // the head can go home and be the dot on the d.
      condense = inRange(HANDBACK.fold, p)
    }

    // the impact scales the head about its centre, so it has to rise by the same amount or it
    // grows down through the tread and reads as a sunrise rather than a strike
    headLift += (headPop - 1) * HEAD_R

    return { p, rawT, slump, lookUp, headLift, bodyDraw, condense, headPop }
  }

  /**
   * Where he stands at each Act II beat, as a position along the line.
   *
   * Each beat's distance is proportional to its own scroll span, so his speed is even throughout.
   * Evenly *spaced* stops looked fine on paper but the later beats are much shorter in scroll —
   * execution is barely a sixth of the first beat — so he sprinted at the end while the earlier
   * ones felt right. That part stands.
   *
   * What did not stand was the total. Cutting the ground to a third of the line put him at 0.37 of
   * lap one's pace, which reads as a trudge next to the act he just came out of, and left the right
   * two thirds of the line empty for the whole of Act II. He now walks to 0.8 of it. That is the
   * ceiling, not a preference: Act II is zoomed out to 46 units against Act I's 26, so the same
   * world distance covers a little over half the screen distance, and matching lap one exactly
   * would need 107% of a line that only has 100%.
   *
   * Execution keeps half its proportional share. Arriving slower than you travelled is what
   * arriving looks like.
   */
  /**
   * One entry per beat, plus one for where the last beat ends — so this array is always
   * ACT2.length + 1 long. Drop a beat from act2.ts without re-cutting these and he walks off the
   * end of a list, which is exactly what happened: the tail read ACT2[4] on a four-beat act and
   * threw every frame, which froze the whole DOM layer because stage.update() never returned.
   */
  const LINE_STOPS = [CUT_T, 0.29, 0.574, 0.734, 0.8]

  /**
   * A value that holds, moves, and holds again — one decision at a time.
   *
   * The hold is the whole point. Without it a changing number reads as a wobble; with it each
   * position reads as something somebody just decided, which is the same hold-then-travel rhythm
   * he walks in. Every revision in Act II runs through here.
   */
  function steps(l: number, seq: readonly number[], hold = 0.45): number {
    const n = seq.length - 1
    const seg = clamp01(l) * n
    const i = Math.min(n - 1, Math.floor(seg))
    const f = seg - i
    return seq[i] + (seq[i + 1] - seq[i]) * smoothstep(hold, 1, f)
  }

  function lineWalk(p: number): number {
    const stops = LINE_STOPS
    let t = 0
    let found = false
    for (let i = 0; i < ACT2.length && !found; i++) {
      const b = ACT2[i]
      if (p < b.to) {
        const f = clamp01((p - b.from) / (b.to - b.from))
        t = stops[i] + (stops[i + 1] - stops[i]) * smoothstep(0.32, 1, f)
        found = true
      }
    }
    if (!found) {
      // past the last beat he drifts gently on, alone with the finished house, up to the reveal
      // counted off the end of the list rather than a hard index, so re-cutting Act II cannot
      // silently walk off it again
      const last = ACT2[ACT2.length - 1]
      t = LINE_STOPS[ACT2.length] + 0.04 * smoothstep(last.to, 0.935, p)
    }
    // Measured: he covers 57 world units across the act, and a phone frame is 50 across. His walk
    // does not fit, full stop — no amount of panning fixes that, because a camera that follows him
    // drags the house along with it. So on portrait he walks the same line, the same way, a little
    // over half as far. The length of the line is the argument; how many paces he takes along it
    // is pacing, and pacing is the thing that is allowed to give.
    return LINE_STOPS[0] + (t - LINE_STOPS[0]) * actFit
  }

  function updateFigure(s: ReturnType<typeof place>) {
    // The ring is still a ring until the unbend begins, so laps wrap rather than running out at
    // the last tread. Past that it is a line and must not.
    const ring = s.p < CUT.unbend[0]
    const t01 = s.rawT - Math.floor(s.rawT)
    circuit.sample(ring ? s.rawT : s.rawT >= 1 && t01 === 0 ? 1 : t01, _p, _d, ring)

    // He only walks while you scroll. Driving the cycle off distance rather than time means his
    // feet never slide, and it makes the character feel attached to the reader's own input.
    const dist = s.rawT * LAP_LEN
    const moving = Math.abs(dist - lastDist) > 0.004 ? 1 : 0
    lastDist = dist
    // reduced motion gets him standing at each beat rather than striding between them
    walkAmt = reducedMotion ? 0 : walkAmt + (moving - walkAmt) * 0.16

    const screenDir = _d.dot(RIGHT)
    if (Math.abs(screenDir) > 0.25) facing = screenDir > 0 ? 1 : -1

    state.phase = (dist / STRIDE) * Math.PI * 2
    state.walk = walkAmt * (1 - s.lookUp)
    state.slump = s.slump
    state.lookUp = s.lookUp
    state.headLift = s.headLift
    state.condense = s.condense
    readout.headLift = clamp01(s.headLift / HEAD_RISE)
    solveFigure(state, joints)

    figure.group.position.copy(_p)
    figure.group.position.y += circuit.dims.height * 0.5

    /*
     * The hand-back.
     *
     * By now his body has folded into his head, so what is left on screen is a scarlet disc — the
     * same disc the preloader flew out of the d thirteen viewports ago. It goes home.
     *
     * The target is asked for every frame from the logo's live layout rather than stored, for the
     * same reason the preloader asks at hand-off: a few pixels of disagreement and the eye catches
     * the swap instantly. He also arrives at the dot's *size*, not just its position, which is why
     * the scale is solved from the target radius rather than eased to a guess.
     */
    let scale = FIGURE_SCALE
    const fly = inRange(HANDBACK.fly, s.p)
    if (fly > 0) {
      const target = logoDotAt()
      if (target) {
        const e = easeCut(fly)
        const px = window.innerHeight / viewH
        // He arrives at the dot's size as well as its position. Solved from the target radius
        // rather than eased toward a guess, so the swap is exact at any viewport.
        scale = FIGURE_SCALE + (target.r / (HEAD_R * px) - FIGURE_SCALE) * e
        // The head sits off the group origin by the rig's own head offset — which is scaled, so
        // the correction has to use the scale he is actually at, not the one he started at.
        const from = headScreen().y
        worldAtScreen(target.x, target.y, _fly)
          .addScaledVector(UP, -joints.head.y * scale)
          .addScaledVector(RIGHT, -joints.head.x * scale * facing)
        // and arc, rather than slide — this is a jump, not a transfer
        const rise = Math.min(11, (Math.abs(target.y - from) / px) * 0.3 + 3.4)
        figure.group.position.lerp(_fly, e).addScaledVector(UP, Math.sin(fly * Math.PI) * rise)
      }
    }

    figScale = scale
    figure.update(joints, {
      scale,
      bodyDraw: s.bodyDraw,
      facing,
      headPop: s.headPop,
    })
    figure.setInk(ink)
    // He is always present — through the cut he is nothing but the head, and that head is the
    // thing doing the cutting, so it can never be hidden for lacking a body.
    figureShown = true
  }

  /**
   * Act II. The artifact rebuilds in one continuous move rather than seven staged ones — that
   * single difference is the entire argument, so it gets no stations, no cost chips and no pauses.
   */
  function updateActTwo(p: number) {
    // Runs to 0.936 rather than stopping at 0.9. The house is the payoff of the whole act and it
    // used to be cut off dead about a screen after it was finished; now it stands complete through
    // the stretch the proof frame and the cards used to occupy, and holds it alone.
    const live = p >= ACT2[0].from && p < 0.936
    artifactInActTwo = live
    if (!live) return

    // One continuous build, beat by beat, and it never comes apart. Act I tore the same object
    // down seven times; here every beat only adds, and by EXECUTION it is a finished house. That
    // contrast is the argument, so these ranges are deliberately back to back with no gaps.
    const build = inRange([ACT2[0].from, ACT2[0].to - 0.008], p)
    const upper = inRange([0.752, 0.778], p)
    const balcony = inRange([0.806, 0.83], p)
    const detail = inRange([0.816, 0.845], p)
    const roof = inRange([0.845, 0.868], p)
    const fade = 1 - inRange([0.902, 0.932], p)

    /*
     * The client never stops asking, so the building never stops changing.
     *
     * It used to make one change — the kitchen wall, once, at the beat where he asks — and then
     * build out serenely, which quietly argued the opposite of the point. Thirteen changes now,
     * running unbroken from his first question to EXECUTION, none of them costing anything.
     *
     * The schedules are staggered but they also hand over, and that is not decoration. The ground
     * floor fills with poché the moment the storey above it exists, so anything moving down there
     * after that is moving inside a solid and nobody sees it — I had four of these firing into a
     * filled box before I checked. So the internal walls do their revising while the plan is still
     * open, and the massing takes over once there is a massing to revise. Something is always in
     * flux, never everything at once, and every change is visible at the moment it happens.
     *
     * All of it settles before EXECUTION. The payoff has to hold still.
     */
    const kitchen = steps(inRange([0.704, 0.75], p), [0, 1, 0.62, 1.15, 1])
    const partition = steps(inRange([0.712, 0.756], p), [0, 0.9, -0.45, 1.05, 0.45])
    const setback = steps(inRange([0.778, 0.848], p), [0, 0.9, -0.6, 0.38, 0.62, 0], 0.5)

    artifact.group.visible = true
    /*
     * Sized and placed against the space it actually has, not by eye.
     *
     * Below the line the frame offers roughly 620 x 400px on the right at 1600x900 — everything
     * outboard of the copy. That measurement was taken against the widest block Act II ever had —
     * the four-card grid, since cut — so the clearances below are now conservative, not tight.
     * The building was filling 159 x 153 of that and reading as a thumbnail of the payoff rather
     * than the payoff. At this scale it fills 328 x 316: 91px clear of the line above it, 263px
     * clear of the copy beside it, 74px off the bottom. On a 1280x720 laptop the same numbers come
     * out 72 / 37 / 155, which is the binding case and still clears.
     *
     * Anchored a little right of where he stops walking, so he finishes the act walking toward the
     * thing he has been making rather than standing on top of it. The offset was set by measuring
     * the gap on screen rather than from the bounding box: the box says 37px of clearance at
     * 1280x720 and the render says 11, because the dimension strings reach further out than the
     * roof does and they are still faintly up.
     */
    // Portrait puts it where the frame actually has room: centred under the line rather than
    // outboard of copy that is no longer beside it, and sized against the visible height, which now
    // varies with how narrow the device is. Landscape keeps the numbers measured above.
    // Placed by where it sits in the *frame*, not by a world coordinate, because the frame is the
    // thing that changes. On a wide screen it stands outboard of the copy beside it, exactly where
    // it was measured to; as the frame narrows and the copy moves underneath, it eases to centred
    // and drops to a fraction of the visible height instead of a fixed 16 units below the line.
    // Both ends are exact: at 16:9 this evaluates to 26.5 and -16, the numbers signed off above.
    // Only the horizontal follows the frame. It stands outboard of the copy beside it on a wide
    // screen, exactly where it was measured to, and eases to centred as the copy moves underneath
    // it. Size and drop stay at the signed-off numbers on every screen: growing it on a landscape
    // tablet — which has the same 46 units of height as a desktop and less width — put its roof
    // straight through the line.
    const across = 0.6463 * roomNow * ((viewH * aspect()) / 2)
    artifact.group.scale.setScalar(1.9)
    artifact.group.position
      .copy(RIGHT)
      .multiplyScalar(across - shiftNow)
      .addScaledVector(UP, -16)
    artifact.update({
      think: 0,
      sketch: clamp01(build * 2.6),
      snap: clamp01(build * 2.2 - 0.75),
      extrude: clamp01(build * 1.9 - 0.9),
      fill: 0,
      collapse: 0,
      kitchen,
      partition,
      upper,
      setback,
      balcony,
      detail,
      roof,
      fade,
    })

    /*
     * The client joins him on the line and stays to the end of the road.
     *
     * He used to appear for his one line and fade out twenty scroll-hundredths later, which made
     * him a prop that turns up to deliver a complaint. Act I already had him walking the loop
     * rather than watching it; this is the same idea finished. He meets him here, and from here
     * they cover the rest of the line together — past the revisions, past the house going up, all
     * the way to EXECUTION and the proof. Nobody goes back to the office to come back later. That
     * is the entire difference between the two acts, and now you can see it rather than read it.
     *
     * He clears out before the hand-back: the last thing on screen is one man and his own head.
     */
    const beside = inRange([0.688, 0.708], p) * (1 - inRange([0.928, 0.952], p))
    client.visible(beside > 0.015)
    if (beside > 0.015) {
      client.group.position.copy(_p).addScaledVector(RIGHT, 2.4)
      // He keeps a fixed offset from the man, so he covers the same ground and has to walk it. The
      // joints were solved once at startup and never again out here, which left him sliding along
      // the line in a frozen standing pose. Same rig, same cadence, half a stride behind.
      clientState.phase = state.phase + 0.9
      clientState.walk = state.walk
      solveFigure(clientState, clientJoints)
      const along = _d.dot(RIGHT) > 0 ? 1 : -1
      client.update(clientJoints, {
        scale: FIGURE_SCALE * 0.94,
        bodyDraw: 1,
        // walking, he faces where he is going; stopped, he turns back to the man he is talking to
        facing: state.walk > 0.35 ? along : -along,
      })
      client.setInk(inkDim, beside)
    }
  }

  /**
   * One lap that holds at each station and then walks to the next — hold first, so the station the
   * copy is naming is the station he is actually standing at.
   *
   * It walks the real station positions rather than even sevenths of the lap. Even sevenths started
   * the lap at 0 while he had been standing at REST_T for two whole scenes, so the first frame of
   * scene 03 snapped him 1.3 treads *backwards* — a 53px jump at the exact moment he sets off.
   * Starting from where he already is means the first thing he does is step forward.
   */
  /**
   * Which beat lap one is in, as one continuous number — 0 at THINK, 7 when the lap closes.
   *
   * The single source of truth for both where he is and which line is on screen. They used to be
   * derived separately from the same even sevenths, which agreed only because the sevenths were
   * even; the beats have different lengths now, so anything computing its own segmentation would
   * drift out of step with him within one station.
   */
  function stationSeg(l: number): number {
    const x = clamp01(l)
    const last = STATION_SPAN.length - 2
    let i = 0
    while (i < last && x >= STATION_SPAN[i + 1]) i++
    return i + (x - STATION_SPAN[i]) / (STATION_SPAN[i + 1] - STATION_SPAN[i])
  }

  function lapWithStations(l: number): number {
    const n = STATIONS.length
    const seg = stationSeg(l)
    const i = Math.min(n - 1, Math.floor(seg))
    const f = seg - i
    const from = stationT[i]
    // the last leg carries him back round to station 0, one full lap on from where he began
    const to = i + 1 < n ? stationT[i + 1] : REST_T + 1
    return from + (to - from) * smoothstep(0.45, 1, f)
  }

  function headScreen() {
    // The live scale, not the constant: during the hand-back he is being resized to match the
    // logo's dot, and a caller asking where his head is wants where it actually is.
    const s = figScale
    _p2
      .copy(figure.group.position)
      .addScaledVector(RIGHT, joints.head.x * s * facing)
      .addScaledVector(UP, joints.head.y * s)
    // Its own scratch vector. This borrowed `_look`, which is where the camera's look target is
    // kept — so asking for the head's position quietly destroyed the centre that worldAtScreen
    // inverts against, and the hand-back landed 15px off the mark.
    const edge = _edge.copy(_p2).addScaledVector(RIGHT, HEAD_R * s)
    _p2.project(camera)
    edge.project(camera)
    const w = window.innerWidth
    const h = window.innerHeight
    const x = (_p2.x * 0.5 + 0.5) * w
    const y = (-_p2.y * 0.5 + 0.5) * h
    return { x, y, r: Math.abs((edge.x * 0.5 + 0.5) * w - x) }
  }

  resize()
  return { update, ink, inkDim, readout, headScreen }
}
