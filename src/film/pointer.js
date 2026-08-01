import { useEffect, useRef } from 'react'
import * as THREE from 'three'

/**
 * The hand.
 *
 * One shared pointer state for the entire site. Events do nothing but STORE
 * coordinates; every derived value — damping, velocity, world position, what
 * the beads feel, where the camera leans — is computed once per frame inside
 * the render loop. A pointermove handler that does real work fires 200+ times a
 * second and is the single most reliable way to make an otherwise smooth WebGL
 * page stutter.
 *
 * ── Touch is not an afterthought here ─────────────────────────────────────
 *
 * ALINED is a tablet product. Hover does not exist on the device its customers
 * actually hold, so nothing in this file is hover-gated: a finger is a pointer
 * with a press, and every effect built on this state has a touch reading. What
 * differs is only PRESENCE — a mouse is continuously present and a finger is
 * present only while it is down, so the cursor's own mark fades when the hand
 * leaves rather than freezing mid-page.
 */

export function createPointerState() {
  return {
    // Normalised device coordinates, -1..1. `t` is the raw target, `s` the
    // damped follower — everything visual reads `s`, so nothing inherits the
    // jitter of the input device.
    tx: 0,
    ty: 0,
    sx: 0,
    sy: 0,
    vx: 0,
    vy: 0,
    speed: 0,
    down: 0, // damped 0..1, so a press has a rise and a release has a fall
    downRaw: 0,
    present: 0, // damped 0..1 — has the hand been here recently
    presentRaw: 0,
    isTouch: false,
    /** World position on the camera's focal plane. */
    world: new THREE.Vector3(),
    /** Set true once the user has moved at all; nothing is drawn before. */
    engaged: false,
  }
}

/**
 * Install the listeners. Passive and store-only: no layout reads, no maths,
 * no allocation.
 */
export function usePointerListeners(state, enabled = true) {
  const ref = useRef(state)
  ref.current = state

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return

    const set = (x, y) => {
      const p = ref.current
      p.tx = (x / window.innerWidth) * 2 - 1
      p.ty = -((y / window.innerHeight) * 2 - 1)
      p.presentRaw = 1
      p.engaged = true
    }

    const onMove = (e) => {
      const p = ref.current
      p.isTouch = e.pointerType === 'touch'
      set(e.clientX, e.clientY)
    }
    const onDown = (e) => {
      const p = ref.current
      p.isTouch = e.pointerType === 'touch'
      p.downRaw = 1
      set(e.clientX, e.clientY)
    }
    const onUp = () => {
      ref.current.downRaw = 0
      // A finger that lifts has left; a mouse that releases has not.
      if (ref.current.isTouch) ref.current.presentRaw = 0
    }
    const onLeave = () => {
      ref.current.presentRaw = 0
      ref.current.downRaw = 0
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onDown, { passive: true })
    window.addEventListener('pointerup', onUp, { passive: true })
    window.addEventListener('pointercancel', onLeave, { passive: true })
    document.addEventListener('pointerleave', onLeave, { passive: true })

    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onLeave)
      document.removeEventListener('pointerleave', onLeave)
    }
  }, [enabled])
}

const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt))

const tmp = new THREE.Vector3()

/**
 * Advance the pointer one frame and project it into the world.
 *
 * The world position lands on the camera's FOCAL PLANE — the depth the film is
 * actually looking at — so "the cursor is near that bead" means the same thing
 * whether the camera is 26 units from a corridor or 570 from a drafting sheet.
 * Placing it at a fixed depth instead makes the reaction radius meaningless in
 * five of the seven movements.
 */
export function stepPointer(p, camera, focusDist, dt) {
  // Different time constants on purpose: position follows closely enough to
  // feel attached, presence and press decay slowly enough to have weight.
  const px = p.sx
  const py = p.sy
  p.sx = damp(p.sx, p.tx, 14, dt)
  p.sy = damp(p.sy, p.ty, 14, dt)
  p.vx = dt > 0 ? (p.sx - px) / dt : 0
  p.vy = dt > 0 ? (p.sy - py) / dt : 0
  p.speed = Math.min(1, Math.hypot(p.vx, p.vy) * 0.35)

  p.down = damp(p.down, p.downRaw, p.downRaw > p.down ? 22 : 9, dt)
  p.present = damp(p.present, p.presentRaw, p.presentRaw > p.present ? 10 : 2.2, dt)

  // A pointer with no hand behind it must not sit in the middle of the page
  // pulling on things, so presence gates every downstream effect.
  tmp.set(p.sx, p.sy, 0.5).unproject(camera).sub(camera.position).normalize()
  p.world.copy(camera.position).addScaledVector(tmp, focusDist)

  return p
}
