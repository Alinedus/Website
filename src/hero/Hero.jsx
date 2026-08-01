import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import Scene from './Scene'
import { buildWordmark } from './wordmark'
import { buildArchitecture } from './architecture'
import { PAPER } from './tokens'
import { useScrollTarget, useReducedMotion } from './useScrollProgress'

/**
 * SCENE ONE — "From Nothing".
 *
 * ~15–20 seconds of unhurried scrolling, in one continuous camera move:
 *
 *   nothing      the paper, and one red dot waking on it, alone
 *   thought      the field blooms outward from wherever the dot has been
 *   geometry     anchors find each other; lines draw ahead of the camera
 *   alignment    depth collapses — every bead agrees on a single plane
 *   ALINED       the word was what they spelled, and the dot takes its place
 *
 * The whole beat sheet is in tokens.js; the choreography is in Scene.jsx.
 */

// ~4,500px of travel: a deliberate, unhurried scroll crosses it in about
// 15–20s. Long enough for the film to breathe, short enough that nobody feels
// trapped in it.
const SCROLL_VH = 600

export default function Hero() {
  const reduced = useReducedMotion()
  const [wordmark, setWordmark] = useState(null)
  const [failed, setFailed] = useState(false)
  const taglineRef = useRef(null)
  const stageRef = useRef(null)
  const [visible, setVisible] = useState(true)

  const scrollTarget = useScrollTarget(!reduced)
  const architecture = useMemo(() => buildArchitecture(), [])

  useEffect(() => {
    let alive = true
    buildWordmark()
      .then((w) => alive && setWordmark(w))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [])

  // Don't burn a GPU on a scene nobody is looking at. Scene One currently
  // fills the page, but the next scenes will scroll past it.
  useEffect(() => {
    const el = stageRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: '10%' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <section
      id="hero"
      className="hero"
      style={{ height: reduced ? '100svh' : `${SCROLL_VH}vh` }}
      aria-label="ALINED — Design Intelligence Layer"
    >
      <div className="hero__stage" ref={stageRef}>
        {wordmark && (
          <Canvas
            frameloop={visible ? 'always' : 'never'}
            dpr={[1, 2]}
            gl={{
              antialias: true,
              alpha: false,
              powerPreference: 'high-performance',
            }}
            camera={{ fov: 35, near: 0.1, far: 420, position: [0, 0, 15] }}
            onCreated={({ gl }) => gl.setClearColor(PAPER, 1)}
          >
            <Scene
              wordmark={wordmark}
              architecture={architecture}
              scrollTarget={scrollTarget}
              taglineRef={taglineRef}
              reduced={reduced}
            />
          </Canvas>
        )}

        {/* The lockup's descender line. Positioned every frame by projecting
            the wordmark's own anchor — see CameraRig. */}
        <p className="hero__tagline" ref={taglineRef} style={{ opacity: 0 }}>
          DESIGN INTELLIGENCE LAYER
        </p>

        <div className="hero__vignette" aria-hidden="true" />
        <div className="hero__grain" aria-hidden="true" />

        {!reduced && !failed && <div className="hero__cue" aria-hidden="true" />}

        {/* The scene is the content. This is what it says, for anyone who
            cannot see it — a screen reader, a crawler, or a browser with no
            WebGL at all. It is also the only copy in Scene One, which is the
            point. */}
        <h1 className="sr-only">
          ALINED — a design intelligence layer for architects. Sketch, and your
          lines become intelligent spatial models.
        </h1>
      </div>
    </section>
  )
}
