import * as THREE from 'three'

/**
 * The thing he is actually making.
 *
 * One object carries the whole chain. The plan and the model are not two things that cross-fade —
 * they are the same walls at different heights, so the extrusion at MODEL is literally the drawing
 * standing up. That is the point Act II later contradicts: in Act I it costs three days and is
 * torn down again seven times; in Act II it is one continuous gesture that never comes apart.
 *
 * Act I states, all 0..1 and independent so the caller can drive them from station progress:
 *   think    a bubble diagram — rooms as circles, lines for what sits next to what
 *   sketch   the walls appear, jittered and overshooting, drawn by hand
 *   snap     jitter goes to zero and the dimension strings arrive
 *   extrude  walls rise
 *   fill     a render resolves out of noise
 *   collapse it all comes apart in reverse order
 *
 * Act II adds the rest of the building on top, and only ever adds — nothing here collapses:
 *   kitchen  the wall the client asks about, dragged rather than rebuilt
 *   upper    the floor slab and the second storey, set back to leave a terrace
 *   setback  where the second storey's front face sits — the revisions, tried in the room
 *   balcony  the rail around the deck
 *   detail   openings, and the one scarlet door
 *   roof     the roof slab and the slats over the terrace
 *
 * Everything above the ground floor is a single LineSegments — one draw call for the whole house —
 * with a per-segment draw-on shader, so it is *drawn* rather than faded in. The ground floor keeps
 * its box-per-wall rig because those walls have to extrude and one of them has to slide.
 *
 * Nothing on this site is lit or materialised any more. This is a drawing all the way through.
 */

/** x1, z1, x2, z2 — the ground floor: envelope, one partition, the kitchen run, and a door gap. */
const WALLS: [number, number, number, number][] = [
  [-4.2, -3.0, 4.2, -3.0],
  [4.2, -3.0, 4.2, 3.0],
  [4.2, 3.0, -4.2, 3.0],
  [-4.2, 3.0, -4.2, -3.0],
  [0.6, -3.0, 0.6, 0.7],
  [0.6, 0.7, 4.2, 0.7],
  [-4.2, -0.7, -1.5, -0.7],
  [-4.2, -2.9, -4.2, -1.4],
]
/** the kitchen run — the wall the client asks to move */
const KITCHEN = 6
/**
 * The internal partition, which is two walls meeting at a corner. Both indices move together.
 *
 * The run slides along the envelope; the leg keeps one end pinned to the back wall and stretches
 * to follow. Picked over the other partitions because this pair is the only one whose free ends
 * both land on envelope walls — anything else leaves a gap when it moves.
 */
const PART_RUN = 5
const PART_LEG = 4

const GX = 4.2
const GZ = 3.0
const THICK = 0.22
const PLAN_H = 0.06
const WALL_H = 2.4
const SCALE = 0.82

/** floor and roof slabs */
const SLAB = 0.18
/** the second storey */
const UPPER_H = 2.3
/**
 * Where the second storey's front face sits. Everything in front of it is left open, and the
 * ground floor's roof becomes the terrace — the setback is the balcony. One move, two results,
 * which is the kind of thing that makes a plan look designed rather than assembled.
 *
 * At 0.5 the terrace ate forty per cent of the depth, which left the storey above it so shallow
 * that in an isometric looking down at 35 degrees the roof's top face was bigger than the wall
 * underneath it and the whole thing read as a lid on a box. 1.3 gives a terrace you could put a
 * table on and a volume that still reads as a storey.
 */
const UP_X0 = -GX
/** the upper volume stops short of the far end, and the gap is the terrace */
const UP_X1 = 2.75
const UP_Z0 = -GZ
/** and it cantilevers past the front, so the entrance is under an overhang */
const UP_Z1 = GZ + 0.95
const RAIL_H = 0.94
const EAVE = 0.32
/** the roof is a plane, not a lid */
const ROOF_T = 0.15
/** how far slabs eat into the walls they meet, so nothing is ever exactly coplanar */
const LAP = 0.07

const P_UPPER = 0
const P_BALCONY = 1
const P_ROOF = 2
const P_DETAIL = 3

/**
 * How dark each plane of the building sits against the page.
 *
 * Not a light — nothing on this site is lit, and the moment you add one you are rendering rather
 * than drawing. This is the flat-tone convention an architectural axonometric has always used:
 * the plane facing up reads lightest, the two visible sides step down from it, and the difference
 * between them is what makes a box a box instead of six lines.
 *
 * The values are small on purpose. Enough to separate the planes and no more — the drawing still
 * has to look drawn.
 */
const TONE_GLSL = `
  float toneOf(vec3 n) {
    // abs, so a plane's tone does not depend on which way its winding happened to point the
    // normal. Only the +x, +y and +z faces are ever visible in this projection anyway, and one
    // opening was coming out lighter than the wall it was cut into purely because its quad was
    // wound the other way round.
    vec3 a = abs(n);
    if (a.y > 0.5) return 0.06;
    if (a.x > 0.5) return 0.19;
    return 0.34;
  }
`
/** how much darker an opening sits than the wall it is cut into — glass, not a hole */
const GLASS_TINT = 0.34
/** and the apron it stands on. Big enough to seat the building, small enough to stay in frame. */
const SITE_TINT = 0.05
const SITE_PAD = 1.3

export interface ArtifactState {
  think: number
  sketch: number
  snap: number
  extrude: number
  fill: number
  collapse: number
  /** Act II only: how far the kitchen run has been dragged. The wall the client asks about. */
  kitchen?: number
  /** and how far the internal partition has slid. The wall he asks about next. */
  partition?: number
  /** the floor slab and the second storey going up */
  upper?: number
  /** where the storey's front face sits, relative to SET_Z — the options tried in the meeting */
  setback?: number
  /** the rail around the terrace */
  balcony?: number
  /** openings, and the door */
  detail?: number
  /** the roof slab */
  roof?: number
  /** 1 visible, 0 gone. Act II leaves it standing and then fades it, rather than cutting it. */
  fade?: number
}

export interface ArtifactView {
  group: THREE.Group
  update(s: ArtifactState): void
  /** ink for the line work; page for the poché, which has to match the ground exactly */
  setInk(c: THREE.Color, page?: THREE.Color): void
}

export function createArtifact(): ArtifactView {
  const group = new THREE.Group()

  const edgeMat = new THREE.LineBasicMaterial({ color: 0xefefef, transparent: true })
  const fillMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 2,
    uniforms: {
      uColor: { value: new THREE.Color('#3A3634') },
      uPage: { value: new THREE.Color('#EFEFEF') },
      uInk: { value: new THREE.Color('#1A1A1A') },
      uReveal: { value: 0 },
      uPoche: { value: 0 },
    },
    // These boxes are rotated per wall, so the tone has to come from the *world* normal or every
    // wall running the other way would be shaded as though it faced the same direction.
    vertexShader: `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    // Two jobs. In Act I, a chunky per-fragment dissolve — architects know this texture intimately,
    // it is what a render looks like resolving out of noise, and it costs one hash instead of a
    // post chain. In Act II, poché: the same walls filled flat in the colour of the page, which is
    // not a render but a drawing convention, and is the only reason the axonometric reads at all.
    // Without it every back edge shows through every front one and a house becomes a cage.
    fragmentShader: `
      uniform vec3 uColor;
      uniform vec3 uPage;
      uniform vec3 uInk;
      uniform float uReveal;
      uniform float uPoche;
      varying vec3 vNormal;
      ${TONE_GLSL}
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        if (uPoche > 0.004) {
          gl_FragColor = vec4(mix(uPage, uInk, toneOf(vNormal)), uPoche);
          #include <colorspace_fragment>
          return;
        }
        if (uReveal <= 0.001) discard;
        float n = hash(floor(gl_FragCoord.xy / 3.0));
        if (n > uReveal) discard;
        gl_FragColor = vec4(uColor, 1.0);
        #include <colorspace_fragment>
      }
    `,
  })

  const boxGeo = new THREE.BoxGeometry(1, 1, 1)
  const edgeGeo = new THREE.EdgesGeometry(boxGeo)

  const walls = WALLS.map(() => {
    const g = new THREE.Group()
    g.add(new THREE.Mesh(boxGeo, fillMat))
    g.add(new THREE.LineSegments(edgeGeo, edgeMat))
    group.add(g)
    return g
  })

  /* ------------------------------------------------------- the building */
  const house = buildHouse()
  const houseMat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uColor: { value: new THREE.Color(0xefefef) },
      uAccent: { value: new THREE.Color('#FF391F') },
      uOpacity: { value: 1 },
      uUpper: { value: 0 },
      uBalcony: { value: 0 },
      uRoof: { value: 0 },
      uDetail: { value: 0 },
      uSetback: { value: 0 },
      uMidY: { value: 0 },
    },
    vertexShader: `
      attribute vec3 aAnchor;
      attribute float aFront;
      attribute float aFrontA;
      attribute float aOrder;
      attribute float aPhase;
      attribute float aBase;
      attribute float aAccent;
      uniform float uUpper, uBalcony, uRoof, uDetail, uSetback, uMidY;
      varying float vDraw;
      varying float vAccent;
      void main() {
        float prog = aPhase < 0.5 ? uUpper
                   : aPhase < 1.5 ? uBalcony
                   : aPhase < 2.5 ? uRoof
                   : uDetail;
        // Each segment starts when the phase reaches its own order and takes the rest of the
        // phase to run out to full length, so the building draws itself edge by edge. Verticals
        // are wound bottom-first in buildHouse, which is why walls grow upward rather than down.
        float d = clamp((prog - aOrder * 0.62) / 0.38, 0.0, 1.0);
        vec3 p = position;
        vec3 a = aAnchor;
        p.z += uSetback * aFront;
        a.z += uSetback * aFrontA;
        vec3 q = mix(a, p, d);
        // everything above the ground floor rides on however tall the ground floor currently is
        q.y += uMidY * aBase;
        vDraw = d;
        vAccent = aAccent;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(q, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform vec3 uAccent;
      uniform float uOpacity;
      varying float vDraw;
      varying float vAccent;
      void main() {
        if (vDraw < 0.004) discard;
        gl_FragColor = vec4(mix(uColor, uAccent, vAccent), uOpacity);
        #include <colorspace_fragment>
      }
    `,
  })
  const houseGeo = new THREE.BufferGeometry()
  houseGeo.setAttribute('position', new THREE.Float32BufferAttribute(house.pos, 3))
  houseGeo.setAttribute('aAnchor', new THREE.Float32BufferAttribute(house.anchor, 3))
  houseGeo.setAttribute('aFront', new THREE.Float32BufferAttribute(house.front, 1))
  houseGeo.setAttribute('aFrontA', new THREE.Float32BufferAttribute(house.frontA, 1))
  houseGeo.setAttribute('aOrder', new THREE.Float32BufferAttribute(house.order, 1))
  houseGeo.setAttribute('aPhase', new THREE.Float32BufferAttribute(house.phase, 1))
  houseGeo.setAttribute('aBase', new THREE.Float32BufferAttribute(house.base, 1))
  houseGeo.setAttribute('aAccent', new THREE.Float32BufferAttribute(house.accent, 1))
  const building = new THREE.LineSegments(houseGeo, houseMat)
  building.frustumCulled = false
  building.visible = false
  building.renderOrder = 2
  group.add(building)

  // The poché behind the line work: the same masses, filled flat in the page colour, pushed back a
  // hair so their own outlines still sit on top. It reads as nothing at all — which is the point.
  // All it does is stop the far side of the building drawing through the near side.
  const solidMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: true,
    // Winding here is whatever the geometry happened to be written in, and half of it is single
    // plates rather than closed volumes. Culling was on by default, which silently ate the ground
    // shadow — and would have eaten a wall panel the day one got wound the other way round.
    side: THREE.DoubleSide,
    // Only ever has to beat geometry that is *exactly* coplanar with it — a wall panel's own
    // outline. Kept as small as will do that, because anything larger starts winning against
    // real separation and lets edges that should be inside the building draw through it.
    polygonOffset: true,
    polygonOffsetFactor: 0.6,
    polygonOffsetUnits: 1,
    uniforms: {
      uPage: { value: new THREE.Color('#EFEFEF') },
      uInk: { value: new THREE.Color('#1A1A1A') },
      uUpper: { value: 0 },
      uRoof: { value: 0 },
      uDetail: { value: 0 },
      uSetback: { value: 0 },
      uMidY: { value: 0 },
      uOpacity: { value: 1 },
    },
    vertexShader: `
      attribute float aFront;
      attribute float aPhase;
      attribute float aBase;
      attribute float aTint;
      uniform float uUpper, uRoof, uDetail, uSetback, uMidY, uOpacity;
      varying float vAlpha;
      varying float vTint;
      varying vec3 vNormal;
      void main() {
        float prog = aPhase < 0.5 ? uUpper : aPhase < 1.5 ? uRoof : uDetail;
        // trails the line work, so each piece is drawn before it starts hiding what is behind it
        vAlpha = clamp((prog - 0.55) / 0.4, 0.0, 1.0) * uOpacity;
        vTint = aTint;
        vNormal = normal;
        vec3 q = position;
        q.z += uSetback * aFront;
        q.y += uMidY * aBase;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(q, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uPage;
      uniform vec3 uInk;
      varying float vAlpha;
      varying float vTint;
      varying vec3 vNormal;
      ${TONE_GLSL}
      void main() {
        if (vAlpha < 0.004) discard;
        gl_FragColor = vec4(mix(uPage, uInk, min(0.92, toneOf(vNormal) + vTint)), vAlpha);
        // ShaderMaterial does not get the output-colourspace conversion for free, and these tones
        // have to sit in the same space as the page they are mixed from
        #include <colorspace_fragment>
      }
    `,
  })
  const solidGeo = new THREE.BufferGeometry()
  solidGeo.setAttribute('position', new THREE.Float32BufferAttribute(house.sPos, 3))
  solidGeo.setAttribute('normal', new THREE.Float32BufferAttribute(house.sNrm, 3))
  solidGeo.setAttribute('aTint', new THREE.Float32BufferAttribute(house.sTint, 1))
  solidGeo.setAttribute('aFront', new THREE.Float32BufferAttribute(house.sFront, 1))
  solidGeo.setAttribute('aPhase', new THREE.Float32BufferAttribute(house.sPhase, 1))
  solidGeo.setAttribute('aBase', new THREE.Float32BufferAttribute(house.sBase, 1))
  const solid = new THREE.Mesh(solidGeo, solidMat)
  solid.frustumCulled = false
  solid.visible = false
  solid.renderOrder = 1
  group.add(solid)

  /* ---------------------------------------------------------- dimensions */
  // Two strings below and beside the plan, with end ticks. They only exist once it is a drawing.
  const dimMat = new THREE.LineBasicMaterial({ color: 0xff391f, transparent: true, opacity: 0 })
  const dimPts: number[] = []
  const dim = (x1: number, z1: number, x2: number, z2: number) => {
    dimPts.push(x1, 0, z1, x2, 0, z2)
    const nx = (z2 - z1) === 0 ? 0 : 0.28
    const nz = (x2 - x1) === 0 ? 0 : 0.28
    dimPts.push(x1 - nx, 0, z1 - nz, x1 + nx, 0, z1 + nz)
    dimPts.push(x2 - nx, 0, z2 - nz, x2 + nx, 0, z2 + nz)
  }
  dim(-4.2, 3.9, 4.2, 3.9)
  dim(5.1, -3.0, 5.1, 3.0)
  dim(-4.2, -3.9, 0.6, -3.9)
  const dims = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(dimPts, 3)),
    dimMat,
  )
  group.add(dims)

  /* ---------------------------------------------------- the bubble diagram */
  // What thinking looks like in this profession, before there is anything to draw: rooms as loose
  // circles, and lines for what has to sit next to what. It was seven scattered dots floating above
  // the object, which read as dust rather than as thought.
  //
  // A bubble diagram is the honest answer because it is a real precursor and not a placeholder —
  // it lies flat in the same footprint the plan will occupy, at the plan's own height, so SKETCH
  // resolves it in place instead of cutting away from it. Every architect has drawn one.
  //
  // Authored in arrival order: circulation first, then the rooms hanging off it, largest down. A
  // link cannot arrive before both bubbles it joins.
  const BUBBLES: [number, number, number][] = [
    [0.0, 0.2, 0.62], // circulation — the hub everything else connects through
    [-2.3, -1.1, 1.15], // living
    [2.4, -1.6, 0.95], // kitchen
    [-2.6, 1.9, 0.85], // dining
    [2.7, 1.9, 0.78], // bed
    [0.3, 2.7, 0.5], // entry
    [0.1, -2.8, 0.42], // service
  ]
  const LINKS: [number, number][] = [
    [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [1, 3], [2, 4],
  ]

  const bubbleMat = new THREE.LineBasicMaterial({ color: 0xefefef, transparent: true })
  const bubbles = new THREE.Group()
  const RING_N = 44
  const ringPts: number[] = []
  for (let i = 0; i <= RING_N; i++) {
    const a = (i / RING_N) * Math.PI * 2
    ringPts.push(Math.cos(a), 0, Math.sin(a))
  }
  const ringGeo = new THREE.BufferGeometry().setAttribute(
    'position',
    new THREE.Float32BufferAttribute(ringPts, 3),
  )
  // Each ring owns its geometry so it can carry its own draw range — they are swept open one at a
  // time, not scaled up. Everything on this site is drawn rather than popped, and a circle that
  // sweeps is the closest a ring gets to being drawn by hand.
  const rings = BUBBLES.map(([x, z, r]) => {
    const l = new THREE.Line(ringGeo.clone(), bubbleMat)
    l.position.set(x, PLAN_H, z)
    l.scale.setScalar(r)
    l.frustumCulled = false
    bubbles.add(l)
    return l
  })
  const linkPts = new Float32Array(LINKS.length * 6)
  const linkGeo = new THREE.BufferGeometry()
  linkGeo.setAttribute('position', new THREE.BufferAttribute(linkPts, 3))
  const linkLines = new THREE.LineSegments(linkGeo, bubbleMat)
  linkLines.frustumCulled = false
  bubbles.add(linkLines)
  group.add(bubbles)

  group.scale.setScalar(SCALE)

  function update(s: ArtifactState) {
    const n = walls.length
    let midY = PLAN_H

    for (let i = 0; i < n; i++) {
      const g = walls[i]
      let [x1, z1, x2, z2] = WALLS[i]

      // The partition is an L of two walls, so it has to move as one or the corner comes apart:
      // the run slides bodily and the leg simply gets longer to keep meeting it. Applied to the
      // raw endpoints rather than the finished box, because the leg's *length* is what changes.
      const pz = s.partition ?? 0
      if (pz !== 0) {
        if (i === PART_RUN) { z1 += pz; z2 += pz }
        else if (i === PART_LEG) { z2 += pz }
      }

      // walls draw in one after another as the sketch is made
      const drawn = clamp01(s.sketch * (n + 2) - i)
      // and come apart in reverse, so the render goes before the plan does
      const gone = clamp01(s.collapse * (n + 3) - (n - 1 - i))
      const alive = drawn * (1 - gone)
      if (alive <= 0.001) {
        g.visible = false
        continue
      }
      g.visible = true

      // hand-drawn wobble, gone once it snaps to the grid
      const j = (1 - s.snap) * 0.34
      const over = (1 - s.snap) * 0.3
      const ax = x1 + (hash(i * 2.3) - 0.5) * j - dir(x1, x2) * over
      const az = z1 + (hash(i * 5.9) - 0.5) * j - dir(z1, z2) * over
      const bx = x2 + (hash(i * 13.1) - 0.5) * j + dir(x1, x2) * over
      const bz = z2 + (hash(i * 17.7) - 0.5) * j + dir(z1, z2) * over

      const dx = bx - ax
      const dz = bz - az
      const len = Math.hypot(dx, dz) * drawn
      const h = PLAN_H + (WALL_H - PLAN_H) * s.extrude * (1 - gone)
      midY = h
      // the one wall the client asks about — dragged, not rebuilt
      const kz = i === KITCHEN ? (s.kitchen ?? 0) * 1.9 : 0

      g.position.set((ax + bx) / 2, h / 2 + gone * -2.5, (az + bz) / 2 + kz)
      g.rotation.y = Math.atan2(-dz, dx)
      g.scale.set(Math.max(len, 1e-3), h, THICK * (1 - gone * 0.8))
    }

    const fade = s.fade ?? 1
    const upper = s.upper ?? 0
    fillMat.uniforms.uReveal.value = s.fill * (1 - s.collapse * 2.2)
    edgeMat.opacity = (1 - clamp01(s.collapse * 1.4)) * fade
    // Kept low — dimension strings count as the drafting grid, and the grid never shouts. They go
    // entirely once the building starts: by then they are down to six per cent and invisible, but
    // they reach further out than the roof does, so all they were still doing was pushing the
    // silhouette out into the copy beside it.
    dimMat.opacity =
      0.32 * s.snap * (1 - s.extrude * 0.8) * (1 - clamp01(s.collapse * 2)) * (1 - clamp01(upper * 4)) * fade
    dims.visible = dimMat.opacity > 0.01

    /* ------------------------------------------------ the rest of it */
    const balcony = s.balcony ?? 0
    const roof = s.roof ?? 0
    const detail = s.detail ?? 0
    building.visible = upper > 0.002 && fade > 0.004
    solid.visible = upper > 0.55 && fade > 0.004
    // the ground floor fills too, or the storey above would draw straight through it
    const poche = clamp01((upper - 0.35) / 0.35) * fade
    fillMat.uniforms.uPoche.value = poche
    fillMat.depthWrite = poche > 0.5
    if (building.visible) {
      const u = houseMat.uniforms
      u.uUpper.value = upper
      u.uBalcony.value = balcony
      u.uRoof.value = roof
      u.uDetail.value = detail
      u.uSetback.value = s.setback ?? 0
      u.uMidY.value = midY
      u.uOpacity.value = edgeMat.opacity
      const v = solidMat.uniforms
      v.uUpper.value = upper
      v.uRoof.value = roof
      v.uDetail.value = detail
      v.uSetback.value = u.uSetback.value
      v.uMidY.value = midY
      v.uOpacity.value = fade
    }

    const show = s.think
    bubbles.visible = show > 0.01
    bubbleMat.opacity = show
    if (bubbles.visible) {
      const u = show * (BUBBLES.length + 2)
      for (let i = 0; i < rings.length; i++) {
        const on = clamp01(u - i)
        rings[i].visible = on > 0.002
        rings[i].geometry.setDrawRange(0, on > 0.002 ? Math.max(2, Math.ceil(on * (RING_N + 1))) : 0)
      }
      for (let k = 0; k < LINKS.length; k++) {
        const [ai, bi] = LINKS[k]
        const grow = clamp01(u - Math.max(ai, bi) - 0.6)
        const A = BUBBLES[ai]
        const B = BUBBLES[bi]
        const len = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1
        const dx = (B[0] - A[0]) / len
        const dz = (B[1] - A[1]) / len
        // edge to edge, not centre to centre — a chord through a bubble reads as a mistake
        const x0 = A[0] + dx * A[2]
        const z0 = A[1] + dz * A[2]
        const x1 = B[0] - dx * B[2]
        const z1 = B[1] - dz * B[2]
        const o = k * 6
        linkPts[o] = x0
        linkPts[o + 1] = PLAN_H
        linkPts[o + 2] = z0
        linkPts[o + 3] = x0 + (x1 - x0) * grow
        linkPts[o + 4] = PLAN_H
        linkPts[o + 5] = z0 + (z1 - z0) * grow
      }
      linkGeo.attributes.position.needsUpdate = true
    }
  }

  return {
    group,
    update,
    setInk: (c, page) => {
      edgeMat.color.copy(c)
      bubbleMat.color.copy(c)
      houseMat.uniforms.uColor.value.copy(c)
      fillMat.uniforms.uInk.value.copy(c)
      solidMat.uniforms.uInk.value.copy(c)
      if (page) {
        fillMat.uniforms.uPage.value.copy(page)
        solidMat.uniforms.uPage.value.copy(page)
      }
    },
  }
}

/* ------------------------------------------------------------------------ */

interface SegOpts {
  phase: number
  order: number
  /** which vertices slide when the storey's front face is moved */
  front?: 'none' | 'near' | 'far' | 'all'
  /** 0 for anything measured from the ground, 1 for anything sitting on the ground floor */
  base?: number
  /** 1 to draw in scarlet — the door, and only the door */
  accent?: number
  /** fill this panel as well as outlining it */
  solid?: boolean
  /** darker than its plane would otherwise be — glazing, and the ground */
  tint?: number
}

/**
 * Everything above the ground floor, baked once into one interleaved buffer.
 *
 * Each segment stores its own endpoint in `position` and the segment's anchor in `aAnchor`; the
 * shader lerps between them so a line runs out from its anchor rather than appearing whole. The
 * box edge list below is wound so that the four vertical edges list their lower vertex first,
 * which is the entire reason walls grow upward.
 */
function buildHouse() {
  const pos: number[] = []
  const anchor: number[] = []
  const front: number[] = []
  const frontA: number[] = []
  const order: number[] = []
  const phase: number[] = []
  const base: number[] = []
  const accent: number[] = []

  const sPos: number[] = []
  const sNrm: number[] = []
  const sTint: number[] = []
  const sFront: number[] = []
  const sPhase: number[] = []
  const sBase: number[] = []

  type V = { x: number; y: number; z: number }

  /**
   * Two triangles of fill, behind whatever line work sits on the same plane.
   *
   * The normal goes with them. It is not there for lighting — nothing on this site is lit — it is
   * there so the shader can pick a flat tone per plane, which is the convention every architectural
   * axonometric has used since long before anyone rendered anything.
   */
  function face(a: V, b: V, c: V, d: V, fa: number, fb: number, fc: number, fd: number, o: SegOpts) {
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z
    const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z
    let nx = uy * vz - uz * vy
    let ny = uz * vx - ux * vz
    let nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz) || 1
    nx /= len; ny /= len; nz /= len
    // 0 rises with the storey, 1 with the roof, 2 with the openings — the fill has to arrive when
    // the thing it belongs to does, and glazing belongs to the detail pass
    const ph = o.phase === P_ROOF ? 1 : o.phase === P_DETAIL ? 2 : 0
    const push = (v: V, f: number) => {
      sPos.push(v.x, v.y, v.z)
      sNrm.push(nx, ny, nz)
      sTint.push(o.tint ?? 0)
      sFront.push(f)
      sPhase.push(ph)
      sBase.push(o.base ?? 1)
    }
    push(a, fa); push(b, fb); push(c, fc)
    push(a, fa); push(c, fc); push(d, fd)
  }

  function seg(a: V, b: V, fa: number, fb: number, o: SegOpts) {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z)
    anchor.push(a.x, a.y, a.z, a.x, a.y, a.z)
    front.push(fa, fb)
    frontA.push(fa, fa)
    for (let k = 0; k < 2; k++) {
      order.push(o.order)
      phase.push(o.phase)
      base.push(o.base ?? 1)
      accent.push(o.accent ?? 0)
    }
  }

  const EDGES: [number, number][] = [
    [0, 1], [2, 3], [4, 5], [6, 7],
    [0, 2], [1, 3], [4, 6], [5, 7],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ]

  function box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, o: SegOpts) {
    const hx = sx / 2
    const hy = sy / 2
    const hz = sz / 2
    const v = (i: number): V => ({
      x: cx + (i & 1 ? hx : -hx),
      y: cy + (i & 2 ? hy : -hy),
      z: cz + (i & 4 ? hz : -hz),
    })
    const f = (p: V) =>
      o.front === 'all' ? 1
        : o.front === 'far' ? (p.z > cz ? 1 : 0)
          : o.front === 'near' ? (p.z < cz ? 1 : 0)
            : 0
    for (const [i, j] of EDGES) {
      const a = v(i)
      const b = v(j)
      seg(a, b, f(a), f(b), o)
    }
    // the six faces, wound as quads. The material draws both sides, so winding does not matter —
    // and the tone comes off abs(normal) for the same reason.
    const FACES: [number, number, number, number][] = [
      [0, 1, 3, 2], [4, 6, 7, 5],
      [0, 4, 5, 1], [2, 3, 7, 6],
      [0, 2, 6, 4], [1, 5, 7, 3],
    ]
    for (const [i, j, k, l] of FACES) {
      const a = v(i)
      const b = v(j)
      const c = v(k)
      const d = v(l)
      face(a, b, c, d, f(a), f(b), f(c), f(d), o)
    }
  }

  /**
   * A flat rectangle on a plane — a wall, or an opening in one. Four segments, wound so it runs
   * round from a bottom corner.
   *
   * Walls above the ground floor are drawn as planes, not prisms. A second set of boxes stacked on
   * the first turned the whole thing into a thicket of parallel lines: with no hidden-line removal
   * every back edge shows through every front one, and at this size it read as scribble rather than
   * as a building. An architect sketching an axonometric this fast draws planes anyway.
   */
  function panel(
    axis: 'x' | 'z',
    at: number,
    u0: number,
    u1: number,
    y0: number,
    y1: number,
    o: SegOpts,
  ) {
    const pt = (u: number, y: number): V =>
      axis === 'z' ? { x: u, y, z: at } : { x: at, y, z: u }
    const mid = (u0 + u1) / 2
    const fu = (u: number) =>
      o.front === 'all' ? 1
        : o.front === 'far' ? (u > mid ? 1 : 0)
          : o.front === 'near' ? (u < mid ? 1 : 0)
            : 0
    const c: [V, number][] = [
      [pt(u0, y0), fu(u0)],
      [pt(u1, y0), fu(u1)],
      [pt(u1, y1), fu(u1)],
      [pt(u0, y1), fu(u0)],
    ]
    for (let k = 0; k < 4; k++) {
      const [a, fa] = c[k]
      const [b, fb] = c[(k + 1) % 4]
      seg(a, b, fa, fb, o)
    }
    if (o.solid) face(c[0][0], c[1][0], c[2][0], c[3][0], c[0][1], c[1][1], c[2][1], c[3][1], o)
  }

  /** the flat quad the whole thing stands on */

  /** a single run — rails, posts, slats. One line where a prism would have drawn twelve. */
  function line(a: V, b: V, fa: number, fb: number, o: SegOpts) {
    seg(a, b, fa, fb, o)
  }

  /* ========================================================= the building
   *
   * It was two stacked boxes with identical windows punched in a grid, which is a building but not
   * a piece of architecture — and this is a site architects are going to look at. The moves that do
   * the work here are the ones that would do it in a real drawing:
   *
   *   the upper volume cantilevers past the front instead of sitting square on the plan, so the
   *   entrance sits under an overhang and the massing has a direction
   *
   *   it covers only part of the footprint, leaving an open terrace at one end rather than a
   *   symmetrical setback
   *
   *   the long side is glazed floor to ceiling with slim mullions, instead of holes cut in a wall
   *
   *   the cantilevered face carries a run of vertical louvres, which is the single most
   *   unmistakably architectural texture there is and costs fourteen quads
   *
   *   the roof is a thin plane with a real overhang, not a lid
   *
   * ====================================================================== */

  // the slab: the ground floor's ceiling, and the terrace deck where nothing sits on it
  box(0, SLAB / 2 - LAP / 2, 0, GX * 2, SLAB + LAP, GZ * 2, { phase: P_UPPER, order: 0 })

  const y0 = SLAB - LAP
  const y1 = SLAB + UPPER_H
  const uz = (UP_Z1 + UP_Z0) / 2
  const udz = UP_Z1 - UP_Z0

  // the upper volume — back, the two flanks, the cantilevered face, one partition
  panel('z', UP_Z0, UP_X0, UP_X1, y0, y1, { phase: P_UPPER, order: 0.16, solid: true })
  panel('x', UP_X0, UP_Z0, UP_Z1, y0, y1, { phase: P_UPPER, order: 0.3, front: 'far', solid: true })
  panel('x', UP_X1, UP_Z0, UP_Z1, y0, y1, { phase: P_UPPER, order: 0.44, front: 'far', solid: true })
  panel('z', UP_Z1, UP_X0, UP_X1, y0, y1, { phase: P_UPPER, order: 0.58, front: 'all', solid: true })
  panel('x', -1.1, UP_Z0, UP_Z1 - 1.7, y0, y1 - 0.34, { phase: P_UPPER, order: 0.78, front: 'far', solid: true })

  // The soffit under the cantilever — the underside you can see precisely because it hangs out over
  // nothing. Darker than the walls: it is the one plane on the building that never sees the sky.
  face(
    { x: UP_X0, y: y0, z: GZ }, { x: UP_X1, y: y0, z: GZ },
    { x: UP_X1, y: y0, z: UP_Z1 }, { x: UP_X0, y: y0, z: UP_Z1 },
    0, 0, 1, 1, { phase: P_UPPER, order: 0.62, tint: 0.2 },
  )

  /* ------------------------------------------------------------- louvres */
  // A brise-soleil across the cantilevered face: thin vertical blades standing proud of the glass
  // behind them. Nothing else in the drawing says an architect drew this as quickly.
  const LOUVRE_N = 14
  for (let i = 0; i < LOUVRE_N; i++) {
    const t = (i + 0.5) / LOUVRE_N
    const x = UP_X0 + 0.3 + t * (UP_X1 - UP_X0 - 0.6)
    panel('x', x, UP_Z1 + 0.03, UP_Z1 + 0.22, y0 + 0.2, y1 - 0.2, {
      phase: P_DETAIL,
      order: 0.5 + (i / LOUVRE_N) * 0.45,
      front: 'all',
      solid: true,
      tint: 0.09,
    })
  }

  /* --------------------------------------------------------- the terrace */
  // Open at the far end, where the volume above stops. A blade rail: two runs and corner posts.
  const ry = SLAB + RAIL_H
  const at = (x: number, y: number, z: number): V => ({ x, y, z })
  // One top run, not two. Two horizontal runs plus posts closed into a rectangle and the whole
  // terrace read as a wire cage hovering off the side of the building.
  line(at(UP_X1, ry, GZ), at(GX, ry, GZ), 0, 0, { phase: P_BALCONY, order: 0 })
  line(at(GX, ry, GZ), at(GX, ry, -GZ), 0, 0, { phase: P_BALCONY, order: 0.22 })
  line(at(GX, ry, -GZ), at(UP_X1, ry, -GZ), 0, 0, { phase: P_BALCONY, order: 0.44 })
  // posts along the run rather than only at the corners, so it reads as a balustrade
  for (let i = 0; i <= 4; i++) {
    const z = GZ - (i / 4) * GZ * 2
    line(at(GX, SLAB, z), at(GX, ry, z), 0, 0, { phase: P_BALCONY, order: 0.55 + i * 0.05 })
  }
  for (const z of [GZ, -GZ]) {
    line(at(UP_X1, SLAB, z), at(UP_X1, ry, z), 0, 0, { phase: P_BALCONY, order: 0.8 })
  }

  /* ------------------------------------------------------------ the roof */
  // A thin plane with a real overhang, over the upper volume only.
  box(
    (UP_X0 + UP_X1) / 2,
    y1 + ROOF_T / 2 - LAP / 2,
    uz,
    UP_X1 - UP_X0 + EAVE * 2,
    ROOF_T + LAP,
    udz + EAVE * 2,
    { phase: P_ROOF, order: 0, front: 'far' },
  )

  // A rooflight over the stair. The roof is the largest single plane in an axonometric — leave it
  // blank and the whole drawing reads as a lid. Raised rather than flush, so it has a shaded side.
  const ry2 = y1 + ROOF_T
  box(-1.85, ry2 + 0.09, uz - 0.35, 1.5, 0.18, 3.6, {
    phase: P_ROOF, order: 0.4, front: 'all', tint: GLASS_TINT * 0.55,
  })

  /* --------------------------------------------------------- the openings */
  const G: SegOpts = { phase: P_DETAIL, order: 0, base: 0, solid: true, tint: GLASS_TINT }
  const zf = GZ + THICK / 2 + 0.012

  // One glazed wall rather than three holes in a wall, divided by slim mullions. A punched window
  // says office block; a glazed bay says somebody chose where it went.
  const GA = -3.5
  const GB = 0.3
  panel('z', zf, GA, GB, 0.12, 2.12, { ...G, order: 0 })
  for (let i = 1; i < 5; i++) {
    const x = GA + ((GB - GA) * i) / 5
    panel('z', zf + 0.016, x - 0.05, x + 0.05, 0.12, 2.12, { ...G, order: 0.05, tint: -0.12 })
  }
  // the way in, under the cantilever, and the only scarlet in the building
  panel('z', zf, 0.95, 1.85, 0.02, 2.12, { ...G, order: 0.26, accent: 1, tint: GLASS_TINT * 0.5 })
  panel('z', zf, 2.05, 2.35, 0.12, 2.12, { ...G, order: 0.3 })
  // long slots on the short ends
  panel('x', GX + THICK / 2 + 0.012, -2.3, 1.4, 1.1, 1.95, { ...G, order: 0.36 })
  panel('x', -GX - THICK / 2 - 0.012, -1.6, 1.2, 1.1, 1.95, { ...G, order: 0.42 })

  // Upstairs: the terrace end glazed full height, a long slot at the back, and the glass the
  // louvres stand in front of.
  panel('x', UP_X1 + 0.014, UP_Z0 + 0.55, UP_Z1 - 0.55, y0 + 0.3, y1 - 0.3, {
    phase: P_DETAIL, order: 0.46, front: 'far', solid: true, tint: GLASS_TINT,
  })
  // divided, or a pane this size reads as a hole punched through the volume
  for (let i = 1; i < 3; i++) {
    const z = UP_Z0 + 0.55 + ((UP_Z1 - UP_Z0 - 1.1) * i) / 3
    panel('x', UP_X1 + 0.03, z - 0.05, z + 0.05, y0 + 0.3, y1 - 0.3, {
      phase: P_DETAIL, order: 0.47, front: 'far', solid: true, tint: -0.12,
    })
  }
  panel('z', UP_Z0 - 0.014, UP_X0 + 0.6, UP_X1 - 0.6, y0 + 0.7, y0 + 1.7, {
    phase: P_DETAIL, order: 0.48, solid: true, tint: GLASS_TINT,
  })
  panel('z', UP_Z1 - 0.014, UP_X0 + 0.4, UP_X1 - 0.4, y0 + 0.26, y1 - 0.26, {
    phase: P_DETAIL, order: 0.5, front: 'all', solid: true, tint: GLASS_TINT * 0.9,
  })

  /* --------------------------------------------- steps, planter, the site */
  // Three treads up to the door, in the same language as the loop he is standing on.
  for (let i = 0; i < 3; i++) {
    const h = 0.12 * (i + 1)
    box(1.4, h / 2, GZ + 1.28 - i * 0.42, 2.1, h, 0.44, {
      phase: P_DETAIL, order: 0.2 + i * 0.04, base: 0,
    })
  }
  // A low planter along the glazed side — landscape without drawing a single leaf.
  box(-2.1, 0.24, GZ + 1.2, 3.6, 0.48, 0.95, { phase: P_DETAIL, order: 0.32, base: 0, tint: 0.07 })

  const sy = -0.09
  const sxa = -GX - SITE_PAD
  const sxb = GX + SITE_PAD
  const sza = -GZ - SITE_PAD
  const szb = GZ + SITE_PAD + 1.3
  const gp = (x: number, z: number): V => ({ x, y: sy, z })
  const SITE: SegOpts = { phase: P_UPPER, order: 0, base: 0, tint: SITE_TINT }
  face(gp(sxa, sza), gp(sxb, sza), gp(sxb, szb), gp(sxa, szb), 0, 0, 0, 0, SITE)
  const corner = [gp(sxa, sza), gp(sxb, sza), gp(sxb, szb), gp(sxa, szb)]
  for (let k = 0; k < 4; k++) seg(corner[k], corner[(k + 1) % 4], 0, 0, SITE)

  // And the shadow it casts, which is the thing that actually seats it. Nothing here is lit, so
  // this is not computed — it is the footprint, offset the way the tones already imply the light is
  // coming from, a shade darker than the apron. No outline: a shadow with an edge is a shape.
  const shy = -0.06
  const ox = -1.15
  const oz = 1.45
  const sh = (x: number, z: number): V => ({ x: x + ox, y: shy, z: z + oz })
  face(sh(UP_X0, -GZ), sh(GX, -GZ), sh(GX, UP_Z1), sh(UP_X0, UP_Z1), 0, 0, 0, 0, {
    phase: P_UPPER, order: 0, base: 0, tint: SITE_TINT + 0.075,
  })

  return {
    sNrm: new Float32Array(sNrm),
    sTint: new Float32Array(sTint),
    pos: new Float32Array(pos),
    anchor: new Float32Array(anchor),
    front: new Float32Array(front),
    frontA: new Float32Array(frontA),
    order: new Float32Array(order),
    phase: new Float32Array(phase),
    base: new Float32Array(base),
    accent: new Float32Array(accent),
    sPos: new Float32Array(sPos),
    sFront: new Float32Array(sFront),
    sPhase: new Float32Array(sPhase),
    sBase: new Float32Array(sBase),
  }
}

/** the kitchen run's index, for the moment the client asks to move it */
export const KITCHEN_WALL = KITCHEN

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const dir = (a: number, b: number) => (b > a ? 1 : b < a ? -1 : 0)
function hash(n: number): number {
  return (Math.sin(n * 127.1) * 43758.5453) % 1 < 0
    ? ((Math.sin(n * 127.1) * 43758.5453) % 1) + 1
    : (Math.sin(n * 127.1) * 43758.5453) % 1
}
