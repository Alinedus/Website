import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { RED } from './tokens'
import { makeDotPath } from './dotPath'
import { range, easeOutExpo, damp } from './useScrollProgress'

/**
 * The intelligence dot.
 *
 * In the identity this mark belongs to no letter — it floats free above the
 * `d`, and in the app icon it is the only thing besides the `d` at all. So in
 * this film it is not an effect, it is the character: it wakes first, alone on
 * an empty page; it goes ahead of the camera through the whole corridor and
 * the field wakes wherever it passes; and its last act is to arrive at the one
 * position that completes the logotype.
 *
 * Two things make a sphere read as alive rather than as a moving object:
 *
 *  1. It is never quite where it is told to be. The dot chases its target
 *     through a spring, so it lags into acceleration and overshoots on
 *     arrival. That small, constant disagreement between intent and position
 *     is what the eye reads as a creature rather than as a keyframe.
 *  2. It breathes — a slow pulse, plus a faster flutter that shows only while
 *     it is searching, and which stills completely once it settles.
 *
 * It deliberately has no motion trail. One was built and cut: at the speed the
 * camera travels a trail lands as disconnected blobs rather than a streak, and
 * the field waking in the dot's wake already says "it was here" — with meaning
 * attached, which a smear of copies does not have.
 */

/** Soft aura. On paper an additive glow just washes out; this is a plain
 *  low-alpha falloff, which is what a wet ink dot does to its own edge. */
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

export default function RedDot({ wordmark, phases, redPos }) {
  const group = useRef()
  const core = useRef()
  const aura = useRef()

  const path = useMemo(() => makeDotPath(), [])
  const home = useMemo(
    () => new THREE.Vector3(...wordmark.intelligenceDot),
    [wordmark]
  )

  const auraUniforms = useMemo(
    () => ({
      uRed: { value: new THREE.Color(RED) },
      uStrength: { value: 0.17 },
    }),
    []
  )

  const state = useRef({
    pos: new THREE.Vector3(0, 0, 4),
    vel: new THREE.Vector3(),
    target: new THREE.Vector3(0, 0, 4),
    seeded: false,
  })

  useFrame(({ clock, camera }, delta) => {
    const dt = Math.min(delta, 1 / 30) // a backgrounded tab must not teleport it
    const p = phases.current
    const t = clock.elapsedTime
    const s = state.current

    // ── Where it wants to be ───────────────────────────────────────────────
    path.getPointAt(Math.min(0.999, p.wake), s.target)

    // Searching: while it is alone and unsure it drifts and hunts. The
    // amplitude dies the moment the field starts answering it.
    const hunt = (1 - range(p.progress, 0.02, 0.3)) * 1.5
    s.target.x += Math.sin(t * 1.7) * 0.5 * hunt + Math.sin(t * 0.61) * 0.9 * hunt
    s.target.y += Math.cos(t * 1.31) * 0.45 * hunt + Math.cos(t * 0.47) * 0.8 * hunt

    // ── Coming home ────────────────────────────────────────────────────────
    const homing = easeOutExpo(range(p.progress, 0.6, 0.94))
    s.target.lerp(home, homing)

    // ── Spring ─────────────────────────────────────────────────────────────
    // Stiffens as it commits, so the journey has weight and the arrival is
    // exact. Under-damped early: it overshoots and recovers, which is the
    // single most alive thing in the scene.
    if (!s.seeded) {
      s.pos.copy(s.target)
      s.vel.set(0, 0, 0)
      s.seeded = true
    }
    const stiff = 26 + homing * 150
    const damping = 7.4 + homing * 20
    s.vel.x += ((s.target.x - s.pos.x) * stiff - s.vel.x * damping) * dt
    s.vel.y += ((s.target.y - s.pos.y) * stiff - s.vel.y * damping) * dt
    s.vel.z += ((s.target.z - s.pos.z) * stiff - s.vel.z * damping) * dt
    s.pos.addScaledVector(s.vel, dt)

    group.current.position.copy(s.pos)
    redPos.current.copy(s.pos)

    // ── Breath ─────────────────────────────────────────────────────────────
    const lock = range(p.progress, 0.86, 1)
    const radius = THREE.MathUtils.lerp(
      wordmark.dotRadius * 1.4,
      wordmark.dotRadius * 1.16, // the mark's size in the artwork
      lock
    )
    const breath = 1 + Math.sin(t * 2.15) * 0.055 * (1 - lock)
    const flutter = 1 + Math.sin(t * 9.3) * 0.02 * hunt
    const scale = radius * breath * flutter
    core.current.scale.setScalar(scale)

    aura.current.scale.setScalar(scale * 7.5)
    aura.current.quaternion.copy(camera.quaternion) // billboard
    auraUniforms.uStrength.value = damp(
      auraUniforms.uStrength.value,
      0.17 * (1 - lock * 0.8),
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
        <meshBasicMaterial color={RED} toneMapped={false} />
      </mesh>
    </group>
  )
}
