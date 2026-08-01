import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { RED } from './tokens'
import { makeDotPath } from './dotPath'
import { MOVEMENT_WINDOWS } from './timeline'
import { damp } from './useScrollProgress'

/**
 * The intelligence dot — the only thing on screen for the whole ninety seconds.
 *
 * In the identity this mark belongs to no letter: it floats free above the "d",
 * and in the app icon it is the only thing besides the "d" at all. So it is the
 * film's protagonist and it is never recruited into anything. It wakes alone on
 * an empty page, it goes ahead of the camera through the corridor, it stands on
 * the drawing while the drawing is measured, it rides a wall up, it remains the
 * one identifiable point when the city swallows the building, it is the source
 * the network floods from, it is the core the camera pushes into — and its last
 * act is to arrive back above the "d".
 *
 * What makes a sphere read as alive rather than as a moving object is that it
 * is never quite where it is told to be. It chases its target through a spring,
 * so it lags into acceleration and overshoots on arrival; that small constant
 * disagreement between intent and position is the whole trick.
 */

/**
 * The dot's material — the only one in the film.
 *
 * Glass and chrome were considered and refused: a specular shell would make a
 * paper-and-graphite world look like every other AI product, and would undo the
 * discipline the other six movements hold. But a mark CAN have a material
 * without breaking the world, and the right one is wet ink — a bead of pigment
 * that has not dried, with a tight highlight and a dark wet rim where it meets
 * the page. It gains physicality without gaining a single reflection the paper
 * could not produce.
 *
 * The highlight tracks the pointer, so the one object the film treats as alive
 * is also the one that knows where the hand is.
 */
const coreVert = /* glsl */ `
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`

const coreFrag = /* glsl */ `
  uniform vec3  uRed;
  uniform vec2  uLight;   // where the hand is, -1..1
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    vec3 N = normalize(vN);
    vec3 L = normalize(vec3(uLight.x * 0.6 - 0.35, uLight.y * 0.6 + 0.55, 0.85));

    // A wet bead is darker where it curves away and carries one tight
    // highlight — not a broad plastic sheen.
    float wet  = pow(1.0 - max(dot(N, vView), 0.0), 2.4);
    float spec = pow(max(dot(reflect(-L, N), vView), 0.0), 42.0);

    // Gentle: at the lockup's radius a strong rim reads as a donut, not a bead.
    vec3 col = uRed * (1.0 - wet * 0.20);
    col += vec3(1.0) * spec * 0.42;
    gl_FragColor = vec4(col, 1.0);
  }
`

const auraVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const auraFrag = /* glsl */ `
  uniform vec3  uRed;
  uniform float uStrength;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float a = pow(1.0 - clamp(d, 0.0, 1.0), 2.6) * uStrength;
    if (a < 0.003) discard;
    gl_FragColor = vec4(uRed, a);
  }
`

/**
 * The largest slice of the frame the mark may ever occupy, as a fraction of
 * the frame's world half-height.
 *
 * This is the one law that keeps it a MARK. Its world radius is fixed to the
 * logotype's own dot, which is correct in the two shots where it sits among
 * the letters and wrong everywhere else, because the frame's world height
 * moves across the film by a factor of a hundred and sixty. MEASURED on the
 * shipped build: at the finale the dot covered 4.5% of the frame's half
 * height; at frame ZERO — the first thing anyone sees — it covered 17%, four
 * times larger, and read not as a mark on a page but as a red ball. At the
 * bottom of the push-in it covered the screen.
 *
 * The cap only ever SHRINKS, and only when the frame is small, so the finale
 * and the title card — where the world radius must match the letterforms
 * exactly — are untouched at every viewport, on a phone as on a desktop.
 */
const DOT_MAX_FRAME_FRAC = 0.055

const V = (x, y, z) => new THREE.Vector3(x, y, z)
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const range = (v, a, b) => Math.min(1, Math.max(0, (v - a) / (b - a || 1)))

/**
 * Where the dot wants to be, as a function of film progress.
 *
 * Written as one function rather than per-movement objects because the dot is
 * the film's continuity: its position must be defined at every P with no seams,
 * including inside the overlaps where two movements are both live.
 */
function buildDotScore({ wordmark, framing }) {
  const path = makeDotPath()
  const home = V(...wordmark.intelligenceDot)
  const tmp = V(0, 0, 0)
  const W = MOVEMENT_WINDOWS
  const local = (P, key) => {
    const [a, b] = W[key]
    return range(P, a, b)
  }

  return (P, out) => {
    if (P < W.blueprint[0]) {
      // Movement 1 — the corridor. The field's whole reveal order is derived
      // from this route, so it must stay exactly what it was.
      const wake = ease(range(P, 0.03, W.nothing[1] * 0.92))
      path.getPointAt(Math.min(0.999, wake), tmp)
      const homing = 1 - Math.pow(1 - range(P, W.nothing[1] * 0.7, W.nothing[1]), 4)
      return out.copy(tmp).lerp(home, homing)
    }

    if (P < W.building[0]) {
      // 2 — standing on the drawing, indexing between dimension junctions in
      // right angles like a drafting machine. It never takes a diagonal here.
      const t = local(P, 'blueprint')
      const stops = [
        home,
        V(-wordmark.width * 0.30, wordmark.height * 0.62, 0),
        V(wordmark.width * 0.12, wordmark.height * 0.62, 0),
        V(wordmark.width * 0.12, -wordmark.height * 0.30, 0),
        home,
      ]
      const seg = Math.min(stops.length - 2, Math.floor(t * (stops.length - 1)))
      const f = t * (stops.length - 1) - seg
      const a = stops[seg]
      const b = stops[seg + 1]
      // L-path: all of X first, then all of Y. A field of right angles cannot
      // be mistaken for anything organic.
      const fx = Math.min(1, f * 2)
      const fy = Math.max(0, f * 2 - 1)
      return out.set(
        a.x + (b.x - a.x) * ease(fx),
        a.y + (b.y - a.y) * ease(fy),
        0
      )
    }

    if (P < W.city[0]) {
      // 3 — it rides a wall up. Its height is the hinge's own progress, so the
      // dot is evidence of the rotation rather than a passenger of it.
      const t = local(P, 'building')
      const k = ease(t)
      return out.set(
        home.x * (1 - k * 0.4),
        home.y + k * 9.5,
        k * 2.2
      )
    }

    if (P < W.network[0]) {
      // 4 — it does not move. The city grows around it, and it is the one
      // thing that proves the building you drew is still in there.
      const t = local(P, 'city')
      return out.set(0, 2.4 + ease(t) * 1.2, 0)
    }

    if (P < W.intelligence[0]) {
      // 5 — the source. The flood starts where it stands.
      const t = local(P, 'network')
      const a = -Math.PI * 0.2 + t * 0.5
      const r = framing.cityHalf * 0.06
      return out.set(Math.cos(a) * r, 1.5 + Math.sin(t * 3) * 0.6, Math.sin(a) * r)
    }

    if (P < W.resolution[0]) {
      // 6 — the core the camera is pushing into. It holds the centre.
      return out.set(0, 0, 0)
    }

    // 7 — home, exactly where movement 1 left it.
    const t = local(P, 'resolution')
    return out.copy(V(0, 0, 0)).lerp(home, ease(Math.min(1, t / 0.72)))
  }
}

export default function RedDot({ progress, wordmark, framing, redPos, look, pointer }) {
  const group = useRef()
  const core = useRef()
  const aura = useRef()

  const score = useMemo(
    () => buildDotScore({ wordmark, framing }),
    [wordmark, framing]
  )

  const auraUniforms = useMemo(
    () => ({
      uRed: { value: new THREE.Color(RED) },
      uStrength: { value: 0.17 },
    }),
    []
  )

  const coreUniforms = useMemo(
    () => ({
      uRed: { value: new THREE.Color(RED) },
      uLight: { value: new THREE.Vector2(0, 0) },
    }),
    []
  )

  const st = useRef({
    pos: V(0, 0, 4),
    vel: V(0, 0, 0),
    target: V(0, 0, 4),
    seeded: false,
  })

  useFrame(({ clock, camera }, delta) => {
    const dt = Math.min(delta, 1 / 30) // a backgrounded tab must not teleport it
    const P = progress.current
    const t = clock.elapsedTime
    const s = st.current

    score(P, s.target)

    // While it is alone and unsure it hunts. The amplitude dies the moment the
    // field starts answering it, and never returns.
    //
    // It is ZERO at P = 0. The first frame of the site is a prepared sheet with
    // its setting-out lines crossing at the lower-left third, and the mark
    // belongs exactly on that crossing — that intersection IS the composition.
    // Starting the hunt at full amplitude threw it up to a world unit and a
    // half off its own mark, so the one frame everybody sees had the pen
    // hovering somewhere near where it should be. It commits first, then it
    // starts looking.
    const hunt = Math.min(range(P, 0, 0.014), 1 - range(P, 0.014, 0.055)) * 1.5
    if (hunt > 0.001) {
      s.target.x += Math.sin(t * 1.7) * 0.5 * hunt + Math.sin(t * 0.61) * 0.9 * hunt
      s.target.y += Math.cos(t * 1.31) * 0.45 * hunt + Math.cos(t * 0.47) * 0.8 * hunt
    }

    if (!s.seeded) {
      s.pos.copy(s.target)
      s.seeded = true
    }

    // Stiffens as the film lands. The dot crosses the whole word to reach its
    // place above the `d`, and a spring soft enough to feel alive on the way
    // is not stiff enough to have finished when the frame is held — the mark
    // has to be EXACTLY on the logotype at rest, or the lockup is wrong.
    //
    // In free flight it is now genuinely UNDER-damped. At the shipped damping
    // the ratio was 0.81, which overshoots by under two percent — arithmetic
    // nobody can see, and the only authored spring in seventy seconds. A
    // character that never overshoots is not alive, it is interpolated. At
    // 0.55 it arrives, passes its mark, and comes back: about a tenth of the
    // travel, which is what reads as something with its own momentum deciding
    // where to stop. The landing ramp is untouched and still drives the ratio
    // past 1, so the finished lockup is exact — bounce on the way, no bounce
    // at rest.
    const landing = range(P, 0.9, 0.99)
    const stiff = 34 + landing * 260
    const damping = 6.4 + landing * 30
    s.vel.x += ((s.target.x - s.pos.x) * stiff - s.vel.x * damping) * dt
    s.vel.y += ((s.target.y - s.pos.y) * stiff - s.vel.y * damping) * dt
    s.vel.z += ((s.target.z - s.pos.z) * stiff - s.vel.z * damping) * dt
    s.pos.addScaledVector(s.vel, dt)

    group.current.position.copy(s.pos)
    redPos.current.copy(s.pos)

    // It is a MARK, not a light and not an object: its world radius is the
    // identity's own dot, and it only breathes — capped so that it can never
    // grow into the frame. See DOT_MAX_FRAME_FRAC.
    const r = wordmark.dotRadius
    const breath = 1 + Math.sin(t * 2.15) * 0.05
    const worldScale = r * (wordmark.dotScale ?? 1.3)
    const cap = (look.current.focusHalfH || 1e4) * DOT_MAX_FRAME_FRAC
    const scale = Math.min(worldScale, cap) * breath * (look.current.dotScale ?? 1)
    core.current.scale.setScalar(scale)

    if (pointer) {
      coreUniforms.uLight.value.set(pointer.sx, pointer.sy)
    }

    aura.current.scale.setScalar(scale * 7.5)
    aura.current.quaternion.copy(camera.quaternion) // billboard
    auraUniforms.uStrength.value = damp(
      auraUniforms.uStrength.value,
      look.current.dotAura ?? 0.17,
      6,
      dt
    )
  })

  return (
    <group ref={group}>
      <mesh ref={aura} renderOrder={2}>
        <planeGeometry args={[1, 1]} />
        <shaderMaterial
          uniforms={auraUniforms}
          vertexShader={auraVert}
          fragmentShader={auraFrag}
          transparent
          depthWrite={false}
        />
      </mesh>
      {/* Hero object — it earns real segments; every other bead is a Point. */}
      <mesh ref={core} renderOrder={3}>
        <sphereGeometry args={[1, 32, 24]} />
        <shaderMaterial
          uniforms={coreUniforms}
          vertexShader={coreVert}
          fragmentShader={coreFrag}
        />
      </mesh>
    </group>
  )
}
