import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { MOVEMENTS, MOVEMENT_WINDOWS, movementWeight } from './timeline'

/**
 * One camera, for ninety seconds, with no cuts.
 *
 * Each movement publishes a CAMERA INTENT as a pure function of the film's
 * progress — a position, a look-at, a focal length and a roll. The director
 * blends the intents of whichever movements are live, so a hand-off is a lens
 * and a body moving continuously between two intentions rather than a cut.
 *
 * ── Why the focal length is the main instrument ───────────────────────────
 *
 * Several movements want an orthographic reading: a plan, an elevation, a
 * flat graph. Switching the camera's projection mid-film is a hard cut in the
 * one place the film cannot afford one. Instead there is a single perspective
 * camera whose field of view animates — a long lens pulled far back is
 * optically almost orthographic, and getting there is a dolly-zoom, which is
 * itself one of the most cinematic moves available. So "becomes a drawing"
 * and "becomes a space again" are expressed by the lens, continuously, in a
 * way a projection swap never could be.
 */

const V = () => new THREE.Vector3()

export default function CameraDirector({ progress, intents, framing, look }) {
  const { camera, size } = useThree()

  const pos = useRef(new THREE.Vector3(0, 0, 26))
  const lookAt = useRef(new THREE.Vector3(0, 0, 0))
  const fov = useRef(35)
  const roll = useRef(0)

  const acc = useRef({ pos: V(), look: V(), fov: 0, roll: 0, w: 0 })
  const tmp = useRef({ pos: V(), look: V() })

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30)
    const P = progress.current

    // ── Blend every live intent ───────────────────────────────────────────
    const a = acc.current
    a.pos.set(0, 0, 0)
    a.look.set(0, 0, 0)
    a.fov = 0
    a.roll = 0
    a.w = 0

    for (const m of MOVEMENTS) {
      const intent = intents[m.key]
      if (!intent) continue
      // Weight by state OWNERSHIP, so at rest exactly one intent drives the
      // camera and across a morph the two involved cross-fade. Weighting by the
      // authoring window instead blends a movement's camera through its
      // neighbour's held frames — the ascent and the orbit were averaging into
      // a pose neither of them wanted.
      const w = movementWeight(m.key, P)
      if (w <= 0.0001) continue

      const [s, e] = MOVEMENT_WINDOWS[m.key]
      const local = Math.min(1, Math.max(0, (P - s) / (e - s || 1)))
      const out = intent(local, { P, aspect: size.width / Math.max(1, size.height), framing })
      a.pos.addScaledVector(out.pos, w)
      a.look.addScaledVector(out.look, w)
      a.fov += (out.fov ?? 35) * w
      a.roll += (out.roll ?? 0) * w
      a.w += w
    }

    if (a.w > 0.0001) {
      tmp.current.pos.copy(a.pos).divideScalar(a.w)
      tmp.current.look.copy(a.look).divideScalar(a.w)
      const targetFov = a.fov / a.w
      const targetRoll = a.roll / a.w

      // The rig lags its own intent slightly. This is the difference between
      // a camera that is being operated and one that is being keyframed.
      const k = 1 - Math.exp(-9 * dt)
      pos.current.lerp(tmp.current.pos, k)
      lookAt.current.lerp(tmp.current.look, k)
      fov.current += (targetFov - fov.current) * k
      roll.current += (targetRoll - roll.current) * k
    }

    camera.position.copy(pos.current)
    camera.lookAt(lookAt.current)

    // Publish the working distance. Fog, everywhere in the film, is expressed
    // as a ratio of this rather than in metres — the camera's distance to its
    // subject moves by more than an order of magnitude across the movements,
    // and any absolute near/far either does nothing or erases the subject.
    if (look) look.current.focusDist = pos.current.distanceTo(lookAt.current)
    if (roll.current !== 0) camera.rotateZ(roll.current)
    if (Math.abs(camera.fov - fov.current) > 0.001) {
      camera.fov = fov.current
      camera.updateProjectionMatrix()
    }
  })

  return null
}

/**
 * Distance at which an object of half-width `halfW` and half-height `halfH`
 * sits in frame at focal length `fovDeg`, with air around it.
 *
 * Framing is computed rather than authored because a hand-placed camera is
 * exactly how a hero ends up cropped on a phone.
 */
export function fitDistance(halfW, halfH, fovDeg, aspect, min = 20) {
  const f = (fovDeg * Math.PI) / 180
  const byWidth = halfW / (Math.tan(f / 2) * Math.max(0.2, aspect))
  const byHeight = halfH / Math.tan(f / 2)
  return Math.max(byWidth, byHeight, min)
}
