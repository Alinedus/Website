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

export default function CameraDirector({ progress, intents, framing, look, pointer, parallax = 1 }) {
  const { camera, size } = useThree()

  const pos = useRef(new THREE.Vector3(0, 0, 26))
  const lookAt = useRef(new THREE.Vector3(0, 0, 0))
  const fov = useRef(35)
  const roll = useRef(0)

  const acc = useRef({ dir: V(), look: V(), radius: 0, fov: 0, roll: 0, w: 0 })
  const tmp = useRef({ pos: V(), look: V() })
  const basis = useRef({ dir: V(), right: V(), up: V(), worldUp: new THREE.Vector3(0, 1, 0) })

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30)
    const P = progress.current

    // ── Blend every live intent, ON AN ARC ────────────────────────────────
    //
    // A camera position cannot be averaged. Two intents looking at the same
    // subject from different angles sit on a sphere around it, and the average
    // of two points on a sphere is INSIDE it: the blend cuts the chord and the
    // camera dives at the subject through a pose nobody authored. Measured:
    // 3% closer at a 30-degree hand-off, 13% at sixty, 29% at ninety. Every
    // hand-off in the film has one of these buried in it, and the crane into
    // the city is close to ninety degrees.
    //
    // So the DIRECTION from the look-target and the RADIUS along it are
    // blended separately and recombined. The camera then swings around its
    // subject on an arc at a controlled distance, which is what a crane or a
    // dolly physically does and what the shot was authored to be.
    const a = acc.current
    a.dir.set(0, 0, 0)
    a.look.set(0, 0, 0)
    a.radius = 0
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
      const off = tmp.current.pos.copy(out.pos).sub(out.look)
      const r = off.length()
      if (r > 1e-5) a.dir.addScaledVector(off.divideScalar(r), w)
      a.radius += r * w
      a.look.addScaledVector(out.look, w)
      a.fov += (out.fov ?? 35) * w
      a.roll += (out.roll ?? 0) * w
      a.w += w
    }

    if (a.w > 0.0001) {
      tmp.current.look.copy(a.look).divideScalar(a.w)
      // Two intents facing exactly opposite would cancel; no hand-off in this
      // film does, but a normalize on a zero vector is NaN and NaN in a camera
      // matrix ends the frame, so it is guarded rather than assumed.
      const dl = a.dir.length()
      if (dl > 1e-4) {
        tmp.current.pos
          .copy(a.dir)
          .divideScalar(dl)
          .multiplyScalar(a.radius / a.w)
          .add(tmp.current.look)
      } else {
        tmp.current.pos.copy(pos.current)
      }
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

    // ── Parallax ──────────────────────────────────────────────────────────
    // The viewpoint leans with the hand while the SUBJECT stays framed — the
    // camera is offset and then re-aimed at the same point, which is true parallax
    // (near things shift against far ones) rather than a slide of the whole
    // image. Scaled by the working distance so the lean is the same on screen
    // in every movement, and gated on presence so an abandoned pointer does not
    // hold the camera off-axis.
    const fd = pos.current.distanceTo(lookAt.current)
    if (pointer && parallax > 0 && pointer.present > 0.001) {
      const b = basis.current
      b.dir.copy(lookAt.current).sub(pos.current).normalize()
      b.right.crossVectors(b.dir, b.worldUp).normalize()
      b.up.crossVectors(b.right, b.dir).normalize()
      const amt = fd * 0.028 * parallax * pointer.present
      camera.position.addScaledVector(b.right, pointer.sx * amt)
      camera.position.addScaledVector(b.up, pointer.sy * amt)
      camera.lookAt(lookAt.current)
    }

    // Publish the working distance AND the world height of the frame at that
    // distance. Everything spatial in the film is expressed as a ratio of one
    // of these rather than in metres — the camera's distance to its subject
    // moves by a factor of two hundred across the movements (3.2 units at the
    // core, ~900 over the city) and its focal length by a factor of seventeen,
    // so any absolute radius is right in one shot and absurd in another.
    // Measured on the shipped build, the dot's influence radius covered 3% of
    // the frame over the city and 789% of it in the push-in.
    if (look) {
      look.current.focusDist = fd
      look.current.focusHalfH = fd * Math.tan((camera.fov * Math.PI) / 360)
    }
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
