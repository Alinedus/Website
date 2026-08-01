import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import PointPool from './PointPool'
import LineLayer from './LineLayer'
import RedDot from './RedDot'
import CameraDirector from './CameraDirector'
import { buildFilm } from './context'
import { LOOKS, buildIntents } from './direction'
import { RUNTIME_S, MOVEMENTS, MOVEMENT_WINDOWS, movementWeight, stateWeight } from './timeline'
import { PAPER, GRID, RED } from './tokens'
import { useScrollTarget, useReducedMotion, damp, range } from './useScrollProgress'
import PointerFX from './PointerFX'
import { createPointerState, usePointerListeners } from './pointer'

/**
 * THE FILM.
 *
 * One pinned stage. One canvas. One scroll progress. Seven movements that are
 * windows on a single continuous interpolation, not sections — which is what
 * makes "no hard scene changes" a property of the architecture rather than a
 * thing to be careful about.
 *
 * The technical review's budget is held here: one persistent Points buffer,
 * a handful of line layers, one billboarded dot. No render targets, no
 * post-processing library, no assets.
 */

/**
 * Pixels of scroll per second of film. Calibrated on movement 1, where ~4,500px
 * read as an unhurried 15-20 seconds.
 */
const PX_PER_SECOND = 265

/** Blends the whole film's art direction into one look object per frame. */
function Director({ progress, scrollTarget, look, reduced, intents }) {
  const { gl } = useThree()
  const smoothed = useRef(reduced ? 1 : 0)
  const acc = useRef({ ink: new THREE.Color(), haze: new THREE.Color() })
  const clear = useRef(new THREE.Color(PAPER))

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30)

    // Damping the SCROLL — not the camera — is what makes this feel filmed.
    // The wheel is a stuttery input device; the lens must never inherit that.
    smoothed.current = reduced
      ? 1
      : damp(smoothed.current, scrollTarget.current, 5.2, dt)
    const P = smoothed.current
    progress.current = P

    // ── Blend every live movement's look ──────────────────────────────────
    const a = acc.current
    a.ink.setRGB(0, 0, 0)
    a.haze.setRGB(0, 0, 0)
    let w = 0
    let motionAmp = 0
    let sizeScale = 0
    let maxPx = 0
    let soft = 0
    let redRadius = 0
    let fogNear = 0
    let fogFar = 0
    let bestW = -1
    let motion = 0

    for (const m of MOVEMENTS) {
      const k = movementWeight(m.key, P)
      if (k <= 0) continue
      const L = LOOKS[m.key]
      a.ink.r += L.ink.r * k
      a.ink.g += L.ink.g * k
      a.ink.b += L.ink.b * k
      a.haze.r += L.haze.r * k
      a.haze.g += L.haze.g * k
      a.haze.b += L.haze.b * k
      motionAmp += L.motionAmp * k
      sizeScale += L.sizeScale * k
      maxPx += L.maxPx * k
      soft += L.soft * k
      redRadius += L.redRadius * k
      fogNear += L.fogNear * k
      fogFar += L.fogFar * k
      w += k
      // Motion mode is an enum and cannot be averaged — the loudest movement
      // owns the character outright, which is also what the allocation intends.
      if (k > bestW) {
        bestW = k
        motion = L.motion
      }
    }

    if (w > 0.0001) {
      const L = look.current
      L.motion = motion
      L.motionAmp = motionAmp / w
      L.sizeScale = sizeScale / w
      L.maxPx = maxPx / w
      L.soft = soft / w
      L.redRadius = redRadius / w
      L.fogNear = fogNear / w
      L.fogFar = fogFar / w
      L.ink.setRGB(a.ink.r / w, a.ink.g / w, a.ink.b / w)
      L.haze.setRGB(a.haze.r / w, a.haze.g / w, a.haze.b / w)
      L.reveal = 1

      // Movement 1 alone reveals the field in the dot's wake.
      const [, n1End] = MOVEMENT_WINDOWS.nothing
      if (P < n1End) {
        L.reveal = range(P, 0.03, n1End * 0.92)
      }

      // The dot shrinks as the camera pushes into the core, or it becomes a
      // wall of red at two units.
      const [pi] = MOVEMENT_WINDOWS.intelligence
      L.dotScale = P > pi ? 1 - range(P, pi, MOVEMENT_WINDOWS.intelligence[1]) * 0.55 : 1
      L.dotAura = 0.17 + (L.soft > 0.5 ? 0.16 : 0)

      // The ground the film sits on IS the haze colour, so day→night is one
      // value moving and never a cross-fade between two backgrounds.
      if (!clear.current.equals(L.haze)) {
        clear.current.copy(L.haze)
        gl.setClearColor(clear.current, 1)
      }
    }
    void intents
  })

  return null
}

export default function Film() {
  const reduced = useReducedMotion()
  const [film, setFilm] = useState(null)
  const [failed, setFailed] = useState(false)
  const [visible, setVisible] = useState(true)

  const stageRef = useRef(null)
  const taglineRef = useRef(null)
  const ctaRef = useRef(null)
  const ctaLabelRef = useRef(null)
  const inkRef = useRef(null)

  const progress = useRef(reduced ? 1 : 0)
  const redPos = useRef(new THREE.Vector3(0, 0, 4))
  const look = useRef({
    motion: 0,
    motionAmp: 1,
    reveal: 0,
    sizeScale: 1,
    maxPx: 40,
    soft: 0,
    redRadius: 6,
    fogNear: 46,
    fogFar: 175,
    dotScale: 1,
    dotAura: 0.17,
    ink: new THREE.Color('#0d0d0d'),
    haze: new THREE.Color(PAPER),
  })

  const scrollTarget = useScrollTarget(!reduced)

  // One pointer state for the whole site. Events only store coordinates; every
  // derived value is computed once per frame inside the render loop.
  const pointer = useRef(createPointerState())
  usePointerListeners(pointer.current, !reduced)

  useEffect(() => {
    let alive = true
    buildFilm()
      .then((f) => alive && setFilm(f))
      .catch((e) => {
        console.error('film build failed', e)
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const el = stageRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), {
      rootMargin: '10%',
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const intents = useMemo(
    () => (film ? buildIntents(film.framing) : null),
    [film]
  )

  // Layer weights are refs so the line layers can read them in useFrame
  // without re-rendering React on every scroll event.
  const weights = useRef({})
  useEffect(() => {
    for (const m of MOVEMENTS) weights.current[m.key] = { current: 0 }
  }, [])

  const height = reduced
    ? '100svh'
    : `calc(100svh + ${Math.round(RUNTIME_S * PX_PER_SECOND)}px)`

  return (
    <section
      id="hero"
      className="hero"
      style={{ height }}
      aria-label="ALINED — Design Intelligence Layer"
    >
      <div className="hero__stage" ref={stageRef}>
        {film && intents && (
          <Canvas
            frameloop={visible ? 'always' : 'never'}
            dpr={[1, 2]}
            gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
            camera={{ fov: 35, near: 0.1, far: 3000, position: [0, 0, 26] }}
            onCreated={({ gl }) => gl.setClearColor(PAPER, 1)}
          >
            <Director
              progress={progress}
              scrollTarget={scrollTarget}
              look={look}
              reduced={reduced}
              intents={intents}
            />
            <CameraDirector
              progress={progress}
              intents={intents}
              framing={film.framing}
              look={look}
              pointer={pointer.current}
              parallax={reduced ? 0 : 1}
            />
            <PointerFX
              pointer={pointer}
              look={look}
              canvasRef={inkRef}
              ctaRef={ctaRef}
              labelRef={ctaLabelRef}
              enabled={!reduced}
            />

            <FilmLayers film={film} progress={progress} look={look} />
            <Lockup
              film={film}
              progress={progress}
              taglineRef={taglineRef}
              ctaRef={ctaRef}
            />

            <PointPool
              states={film.states}
              count={film.count}
              order={film.order}
              look={look}
              progress={progress}
              redPos={redPos}
              pointer={pointer.current}
            />
            <RedDot
              progress={progress}
              wordmark={film.wordmark}
              framing={film.framing}
              redPos={redPos}
              look={look}
              pointer={pointer.current}
            />
          </Canvas>
        )}

        <p className="hero__tagline" ref={taglineRef} style={{ opacity: 0 }}>
          DESIGN INTELLIGENCE LAYER
        </p>

        {/* The invitation is DRAWN, never faded: its ring strokes itself on
            like every other line in the film, and the label arrives by
            letterspacing settling rather than by opacity. */}
        <div className="film__cta" ref={ctaRef}>
          <a
            className="film__cta-link"
            href="mailto:hello@alined.app?subject=ALINED%20access"
          >
            <svg className="film__cta-ring" viewBox="0 0 240 56" aria-hidden="true">
              <rect x="1" y="1" width="238" height="54" rx="27" pathLength="100" />
            </svg>
            <span className="film__cta-label" ref={ctaLabelRef}>
              Request access
            </span>
          </a>
        </div>

        <canvas className="film__ink" ref={inkRef} aria-hidden="true" />

        <div className="hero__vignette" aria-hidden="true" />
        <div className="hero__grain" aria-hidden="true" />

        {!reduced && !failed && <div className="hero__cue" aria-hidden="true" />}

        <h1 className="sr-only">
          ALINED — a design intelligence layer for architects. Sketch, and your
          lines become intelligent spatial models.
        </h1>
      </div>
    </section>
  )
}

/**
 * The lockup's furniture: the drafting grid the logotype is set on, the red
 * tittle of the "i", and the two pieces of DOM type.
 *
 * All of it belongs to the two states where the word is legible — the title
 * card at the end of movement 1, and the finale — so it is keyed to those and
 * absent everywhere else.
 *
 * The tittle is a real mark rather than a recoloured bead: at the sampling
 * lattice's pitch its footprint is two or three beads, and tinting them reads
 * as a short red dash instead of the single round dot the artwork draws.
 */
function Lockup({ film, progress, taglineRef, ctaRef }) {
  const { size, camera } = useThree()
  const gridMat = useRef()
  const tittleMat = useRef()
  const tittleMesh = useRef()
  const anchor = useRef(new THREE.Vector3())
  const { wordmark } = film

  const gridPositions = useMemo(() => {
    const w = wordmark.width * 1.1
    const h = wordmark.height * 1.72
    const pitch = wordmark.dotRadius * 2.9
    const z = -1.1
    const out = []
    const nx = Math.ceil(w / 2 / pitch)
    const ny = Math.ceil(h / 2 / pitch)
    for (let i = -nx; i <= nx; i++) out.push(i * pitch, -h / 2, z, i * pitch, h / 2, z)
    for (let j = -ny; j <= ny; j++) out.push(-w / 2, j * pitch, z, w / 2, j * pitch, z)
    return new Float32Array(out)
  }, [wordmark])

  useFrame(() => {
    const P = progress.current
    // Legible at the title card and again at the finale, nowhere between.
    const w = Math.max(stateWeight('wordmark', P), stateWeight('mark', P))
    const finale = stateWeight('mark', P)

    if (gridMat.current) gridMat.current.opacity = w * 0.32
    if (tittleMat.current) tittleMat.current.opacity = w
    if (tittleMesh.current) tittleMesh.current.scale.setScalar(wordmark.dotRadius * w)

    // The tagline is DOM — letterspaced 11px type has to be crisp and
    // selectable — but it is positioned by projecting the wordmark's own
    // anchor, so it is welded to the geometry rather than guessed at in CSS.
    const el = taglineRef.current
    if (el) {
      anchor.current.set(0, wordmark.bottomY - wordmark.dotRadius * 4.6, 0)
      anchor.current.project(camera)
      const x = (anchor.current.x * 0.5 + 0.5) * size.width
      const y = (-anchor.current.y * 0.5 + 0.5) * size.height
      el.style.transform = `translate(-50%, 0) translate3d(${x - size.width / 2}px, ${
        y - size.height / 2
      }px, 0)`
      el.style.opacity = w
      el.style.letterSpacing = `${0.62 - (1 - w) * 0.22}em`
    }

    // The invitation arrives last, and only once. It is also the only large red
    // object in ninety seconds, by which time red has been taught to mean
    // "understood".
    const cta = ctaRef.current
    if (cta) {
      const k = Math.max(0, (finale - 0.45) / 0.55)
      cta.style.setProperty('--draw', k.toFixed(3))
      cta.style.pointerEvents = k > 0.6 ? 'auto' : 'none'
    }
  })

  return (
    <>
      <lineSegments frustumCulled={false} renderOrder={0}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[gridPositions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial ref={gridMat} color={GRID} transparent opacity={0} depthWrite={false} />
      </lineSegments>
      <mesh ref={tittleMesh} position={wordmark.tittle} renderOrder={3}>
        <sphereGeometry args={[1, 24, 18]} />
        <meshBasicMaterial ref={tittleMat} color={RED} toneMapped={false} transparent opacity={0} />
      </mesh>
    </>
  )
}

/**
 * The drawn layers, one per movement that has them. Each fades with its own
 * movement's weight, so across a hand-off two topologies are briefly co-present
 * — which, over a point pool that is genuinely continuous underneath, reads as
 * one thing becoming another rather than as a cross-fade.
 */
function FilmLayers({ film, progress, look }) {
  const focusDist = useRef({ current: 30 })
  // Keyed to STATES, not movements: a line layer draws the shape the points
  // are currently making, and must die with it.
  const w = useRef({
    architecture: { current: 0 },
    blueprint: { current: 0 },
    city: { current: 0 },
    network: { current: 0 },
  })
  const reveal = useRef({ current: 0 })

  useFrame(() => {
    const P = progress.current
    w.current.architecture.current = stateWeight('architecture', P)
    w.current.blueprint.current = stateWeight('blueprint', P)
    w.current.city.current = stateWeight('city', P)
    w.current.network.current = stateWeight('network', P)
    focusDist.current.current = look.current.focusDist || 30
    reveal.current.current = P < MOVEMENT_WINDOWS.nothing[1]
      ? range(P, 0.18, MOVEMENT_WINDOWS.nothing[1] * 0.95)
      : 1
  })

  const haze = look.current.haze.getStyle()

  return (
    <>
      <LineLayer
        positions={film.architecture.linePositions}
        order={film.architecture.lineOrder}
        color="#0d0d0d"
        haze={haze}
        opacity={0.62}
        weight={w.current.architecture}
        reveal={reveal.current}
        focusDist={focusDist.current}
      />
      {film.lines?.blueprint && (
        <LineLayer
          positions={film.lines.blueprint}
          color="#0d0d0d"
          haze={haze}
          opacity={0.7}
          weight={w.current.blueprint}
          focusDist={focusDist.current}
        />
      )}
      {film.lines?.city && (
        <LineLayer
          positions={film.lines.city}
          color="#0d0d0d"
          haze={haze}
          opacity={0.28}
          weight={w.current.city}
          focusDist={focusDist.current}
          fog={[0.9, 2.8]}
        />
      )}
      {film.lines?.network && (
        <LineLayer
          positions={film.lines.network}
          color="#f4efe4"
          haze="#0b0a09"
          opacity={0.34}
          weight={w.current.network}
          focusDist={focusDist.current}
          fog={[1.5, 5.0]}
        />
      )}
    </>
  )
}
