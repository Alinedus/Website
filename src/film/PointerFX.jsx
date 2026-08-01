import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { stepPointer } from './pointer'
import { RED } from './tokens'

/**
 * Everything the hand does, in one frame loop.
 *
 * Three jobs that all read the same pointer state and would otherwise each
 * want their own requestAnimationFrame: the instrument mark and its graphite
 * trace, the magnetic pull on the invitation, and advancing the shared pointer
 * itself so the point pool and the camera can read it. One loop, one layout
 * read, no per-event work.
 *
 * ── Why the cursor is a drafting instrument ───────────────────────────────
 *
 * A custom cursor that is a blob, a ring or a lagging dot is decoration, and on
 * a film about drawing it competes with the film. This one is the app's own
 * anchor glyph — the mark ALINED puts at every snappable point — and it leaves
 * graphite on the paper as it travels. So the pointer is not "styled": it is
 * the same instrument the product is about, and moving it is drawing.
 *
 * On touch there is no persistent cursor to draw, and the trace appears only
 * under a finger that is actually down. Nothing here is hover-gated.
 */

const TRAIL = 34

export default function PointerFX({
  pointer,
  look,
  canvasRef,
  ctaRef,
  labelRef,
  enabled = true,
}) {
  const { camera, size } = useThree()

  const trail = useMemo(
    () => ({ x: new Float32Array(TRAIL), y: new Float32Array(TRAIL), n: 0 }),
    []
  )
  const cta = useRef({ rect: null, x: 0, y: 0, vx: 0, vy: 0, over: 0, stale: 0 })

  // The button's box is read on resize, never per frame. A getBoundingClientRect
  // inside the loop forces a layout flush and is exactly how a 60fps page
  // becomes a 40fps one.
  useEffect(() => {
    const measure = () => {
      cta.current.rect = ctaRef.current?.getBoundingClientRect() ?? null
    }
    measure()
    window.addEventListener('resize', measure)
    const id = setInterval(measure, 1000) // the CTA moves with the film's lockup
    return () => {
      window.removeEventListener('resize', measure)
      clearInterval(id)
    }
  }, [ctaRef])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30)
    const p = pointer.current

    stepPointer(p, camera, look.current.focusDist || 30, dt)
    if (!enabled) return

    const cvs = canvasRef.current
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    if (cvs) {
      const w = Math.round(size.width * dpr)
      const h = Math.round(size.height * dpr)
      if (cvs.width !== w || cvs.height !== h) {
        cvs.width = w
        cvs.height = h
      }
    }

    // Screen position in CSS px.
    const cx = (p.sx * 0.5 + 0.5) * size.width
    const cy = (-p.sy * 0.5 + 0.5) * size.height

    // ── The magnetic invitation ───────────────────────────────────────────
    // The button leaves its position to meet the hand. It is a spring, not a
    // lerp: it overshoots slightly on approach and settles, so it reads as an
    // object with mass being attracted rather than a value being animated. The
    // pull is capped well inside the button's own radius, so the cursor always
    // lands on it — a magnet you can outrun is a bug, not a flourish.
    const c = cta.current
    const r = c.rect
    let over = 0
    if (r && r.width > 0) {
      const bx = r.left + r.width / 2
      const by = r.top + r.height / 2
      const dx = cx - bx
      const dy = cy - by
      const reach = Math.max(r.width, r.height) * 1.5
      const d = Math.hypot(dx, dy)
      const pull = Math.max(0, 1 - d / reach) * p.present
      over = d < Math.max(r.width, r.height) * 0.62 ? pull : 0

      const tx = dx * pull * 0.34
      const ty = dy * pull * 0.34
      const stiff = 190
      const damp = 19
      c.vx += ((tx - c.x) * stiff - c.vx * damp) * dt
      c.vy += ((ty - c.y) * stiff - c.vy * damp) * dt
      c.x += c.vx * dt
      c.y += c.vy * dt
    } else {
      c.x += (0 - c.x) * 0.1
      c.y += (0 - c.y) * 0.1
    }
    c.over += (over - c.over) * (1 - Math.exp(-9 * dt))

    if (ctaRef.current) {
      const press = 1 - p.down * c.over * 0.045
      ctaRef.current.style.setProperty('--mx', `${c.x.toFixed(2)}px`)
      ctaRef.current.style.setProperty('--my', `${c.y.toFixed(2)}px`)
      ctaRef.current.style.setProperty('--press', press.toFixed(4))
      ctaRef.current.style.setProperty('--over', c.over.toFixed(3))
    }
    if (labelRef.current) {
      // The label lags the shell — parallax inside the button gives it depth
      // and makes the pull read as a solid moving, not a sticker sliding.
      labelRef.current.style.transform = `translate3d(${(-c.x * 0.22).toFixed(2)}px, ${(
        -c.y * 0.22
      ).toFixed(2)}px, 0)`
    }

    // ── The instrument and its trace ──────────────────────────────────────
    if (!cvs || !p.engaged) return
    const ctx = cvs.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.width, size.height)

    // Graphite is only laid down while the hand is actually on the paper: a
    // mouse is always on it, a finger only while pressed.
    const inking = p.isTouch ? p.down : p.present
    if (inking > 0.01) {
      trail.x.copyWithin(1, 0)
      trail.y.copyWithin(1, 0)
      trail.x[0] = cx
      trail.y[0] = cy
      trail.n = Math.min(TRAIL, trail.n + 1)
    } else {
      trail.n = Math.max(0, trail.n - 2)
    }

    const ink = look.current.ink
    const inkCss = `${Math.round(ink.r * 255)},${Math.round(ink.g * 255)},${Math.round(
      ink.b * 255
    )}`

    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (let i = 1; i < trail.n; i++) {
      const f = 1 - i / TRAIL
      ctx.strokeStyle = `rgba(${inkCss},${(f * f * 0.20 * inking).toFixed(3)})`
      ctx.lineWidth = 0.6 + f * 2.1
      ctx.beginPath()
      ctx.moveTo(trail.x[i - 1], trail.y[i - 1])
      ctx.lineTo(trail.x[i], trail.y[i])
      ctx.stroke()
    }

    // The anchor glyph itself — the mark the product puts at every snappable
    // point. It contracts under pressure and opens into a target over the
    // invitation, so the cursor reports what it is about to do.
    const a = p.present
    if (a > 0.01 && !p.isTouch) {
      const press = p.down
      // The arms are defined RELATIVE to the ring, never independently. Sized
      // apart they cross over as the ring opens on an interactive target — the
      // arms end up shorter than the ring's radius, so each one is drawn from
      // outside to inside and disappears at exactly the moment it should be
      // most legible.
      const ring = 3.2 - press * 0.9 + c.over * 6.4
      const arm = ring + 5.5 - press * 1.8
      const acc = c.over > 0.02

      ctx.strokeStyle = acc
        ? `rgba(245,52,27,${(a * 0.9).toFixed(3)})`
        : `rgba(${inkCss},${(a * 0.55).toFixed(3)})`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(cx - arm, cy)
      ctx.lineTo(cx - ring - 1, cy)
      ctx.moveTo(cx + ring + 1, cy)
      ctx.lineTo(cx + arm, cy)
      ctx.moveTo(cx, cy - arm)
      ctx.lineTo(cx, cy - ring - 1)
      ctx.moveTo(cx, cy + ring + 1)
      ctx.lineTo(cx, cy + arm)
      ctx.stroke()

      ctx.beginPath()
      ctx.arc(cx, cy, ring, 0, Math.PI * 2)
      ctx.stroke()

      // Speed leaves a directional smear — motion you can see in a still.
      if (p.speed > 0.02) {
        ctx.strokeStyle = `rgba(${inkCss},${(a * p.speed * 0.3).toFixed(3)})`
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(cx - p.vx * 26, cy + p.vy * 26)
        ctx.stroke()
      }
    }
    void RED
  })

  return null
}
