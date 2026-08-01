import { useMemo, useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import ParticleField from './ParticleField'
import ArchitectureLines from './ArchitectureLines'
import RedDot from './RedDot'
import { BEATS, GRID, RED } from './tokens'
import { damp, range, easeInOut, easeOutExpo } from './useScrollProgress'

/**
 * The drafting grid the logotype is set on in the artwork.
 *
 * It arrives last and it arrives quietly. Its job is to say "this is a
 * measured drawing" at the exact moment the beads stop being a swarm — the
 * final piece of evidence that what we watched assemble was a document, not a
 * decoration.
 */
function LockupGrid({ wordmark, phases }) {
  const matRef = useRef()
  const geoRef = useRef()

  const positions = useMemo(() => {
    const w = wordmark.width * 1.1
    const h = wordmark.height * 1.72
    const pitch = wordmark.dotRadius * 2.9
    const z = -1.1
    const out = []
    const nx = Math.ceil(w / 2 / pitch)
    const ny = Math.ceil(h / 2 / pitch)
    for (let i = -nx; i <= nx; i++) {
      const x = i * pitch
      out.push(x, -h / 2, z, x, h / 2, z)
    }
    for (let j = -ny; j <= ny; j++) {
      const y = j * pitch
      out.push(-w / 2, y, z, w / 2, y, z)
    }
    return new Float32Array(out)
  }, [wordmark])

  useEffect(
    () => () => {
      geoRef.current?.dispose()
      matRef.current?.dispose()
    },
    []
  )

  useFrame(() => {
    if (matRef.current) matRef.current.opacity = phases.current.lock * 0.32
  })

  return (
    <lineSegments frustumCulled={false} renderOrder={0}>
      <bufferGeometry ref={geoRef}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial
        ref={matRef}
        color={GRID}
        transparent
        opacity={0}
        depthWrite={false}
      />
    </lineSegments>
  )
}

/**
 * The red tittle on the `i`.
 *
 * A real mark rather than a recoloured bead: the sampling lattice puts two or
 * three beads inside the tittle's footprint, and tinting them reads as a short
 * red dash instead of the single round dot the artwork draws. Those beads are
 * excluded from the wordmark, so nothing sits underneath this.
 */
function TittleMark({ wordmark, phases }) {
  const matRef = useRef()
  const meshRef = useRef()

  useFrame(() => {
    const a = phases.current.align
    if (matRef.current) matRef.current.opacity = a
    // It arrives with the letter it belongs to, rather than waiting there.
    if (meshRef.current) meshRef.current.scale.setScalar(wordmark.dotRadius * a)
  })

  return (
    <mesh ref={meshRef} position={wordmark.tittle} renderOrder={3}>
      <sphereGeometry args={[1, 24, 18]} />
      <meshBasicMaterial
        ref={matRef}
        color={RED}
        toneMapped={false}
        transparent
        opacity={0}
      />
    </mesh>
  )
}

/**
 * One camera, one move, no cuts.
 *
 * It travels a spline through the corridor for the body of the film, then
 * abandons the spline and resolves to a computed head-on framing of the
 * lockup. The framing is computed rather than authored so the word fits its
 * frame on any aspect ratio — a hand-placed final camera is exactly how a
 * hero like this ends up cropped on a phone.
 */
function CameraRig({ wordmark, phases, scrollTarget, taglineRef, reduced }) {
  const { camera, size } = useThree()

  const path = useMemo(
    () =>
      new THREE.CatmullRomCurve3(
        [
          [0, 0, 26],
          [4, 2, 12],
          [-9, 6, -12],
          [-22, 3, -40],
          [4, -5, -66],
          [22, 5, -84],
          [16, 3, -30],
          [5, 1, 16],
        ].map(([x, y, z]) => new THREE.Vector3(x, y, z)),
        false,
        'catmullrom',
        0.3
      ),
    []
  )

  const lookPath = useMemo(
    () =>
      new THREE.CatmullRomCurve3(
        [
          [0, 0, 2],
          [0, 1, -8],
          [-6, 3, -30],
          [-8, 0, -58],
          [6, -1, -84],
          [10, 3, -62],
          [2, 2, -14],
          [0, 0, 1],
        ].map(([x, y, z]) => new THREE.Vector3(x, y, z)),
        false,
        'catmullrom',
        0.3
      ),
    []
  )

  /** Distance at which the finished lockup sits in frame with air around it. */
  const finalDistance = useMemo(() => {
    const fov = (camera.fov * Math.PI) / 180
    const aspect = size.width / Math.max(1, size.height)
    // A landscape frame has width to give away, and the air is the point. A
    // portrait one has none — holding the same margin there leaves a small
    // logo marooned in a tall empty column.
    const portrait = aspect < 1
    const halfW = (wordmark.width / 2) * (portrait ? 1.12 : 1.62)
    const halfH = (wordmark.height / 2) * (portrait ? 3.4 : 5.2) // dot + tagline
    const byWidth = halfW / (Math.tan(fov / 2) * aspect)
    const byHeight = halfH / Math.tan(fov / 2)
    return Math.max(byWidth, byHeight, 26)
  }, [camera.fov, size, wordmark])

  const smoothed = useRef(reduced ? 1 : 0)
  const pos = useRef(new THREE.Vector3(0, 0, 15))
  const look = useRef(new THREE.Vector3(0, 0, 5))
  const tmpPos = useRef(new THREE.Vector3())
  const tmpLook = useRef(new THREE.Vector3())
  const anchor = useRef(new THREE.Vector3())

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30)

    // Damping the scroll — not the camera — is what makes this feel filmed.
    // The wheel is a stuttery input device; the lens should never inherit that.
    smoothed.current = reduced
      ? 1
      : damp(smoothed.current, scrollTarget.current, 5.2, dt)
    const p = smoothed.current

    // ── The beat sheet ────────────────────────────────────────────────────
    const ph = phases.current
    ph.progress = p
    ph.wake = easeInOut(range(p, BEATS.AWAKEN[0], BEATS.AWAKEN[1]))
    ph.connect = range(p, BEATS.CONNECT[0], BEATS.CONNECT[1])
    ph.arch = easeInOut(ph.connect)
    ph.align = easeInOut(range(p, BEATS.ALIGN[0], BEATS.ALIGN[1]))
    ph.lock = range(p, BEATS.LOCK[0], BEATS.LOCK[1])

    // ── Camera ────────────────────────────────────────────────────────────
    const travel = easeInOut(range(p, 0.02, 0.64))
    path.getPointAt(Math.min(0.999, travel), tmpPos.current)
    lookPath.getPointAt(Math.min(0.999, travel), tmpLook.current)

    // Hand off from the spline to the resolved framing. easeOutExpo commits
    // fast then settles for a long time, so the last seconds decelerate into
    // stillness instead of arriving and stopping.
    const resolve = easeOutExpo(range(p, 0.62, 0.97))
    tmpPos.current.lerp({ x: 0, y: 0, z: finalDistance }, resolve)
    tmpLook.current.lerp({ x: 0, y: 0, z: 0 }, resolve)

    // A breath of handheld drift, dying to nothing as we settle. Without it
    // the final frame is inert; with too much it looks like a shaky gimbal.
    const life = (1 - resolve) * 0.5
    tmpPos.current.x += Math.sin(p * 9.1) * life
    tmpPos.current.y += Math.cos(p * 7.3) * life * 0.7

    pos.current.lerp(tmpPos.current, 1 - Math.exp(-9 * dt))
    look.current.lerp(tmpLook.current, 1 - Math.exp(-9 * dt))
    camera.position.copy(pos.current)
    camera.lookAt(look.current)

    // ── Tagline, pinned to the 3D lockup ──────────────────────────────────
    // DOM, because letterspaced 11px type has to be crisp and selectable —
    // but positioned by projecting the wordmark's own anchor, so it is welded
    // to the geometry rather than guessed at with CSS.
    const el = taglineRef.current
    if (el) {
      anchor.current.set(0, wordmark.bottomY - wordmark.dotRadius * 4.6, 0)
      anchor.current.project(camera)
      const x = (anchor.current.x * 0.5 + 0.5) * size.width
      const y = (-anchor.current.y * 0.5 + 0.5) * size.height
      const reveal = range(p, 0.9, 1)
      el.style.transform = `translate(-50%, 0) translate3d(${x - size.width / 2}px, ${
        y - size.height / 2
      }px, 0)`
      el.style.opacity = reveal
      el.style.letterSpacing = `${0.62 - (1 - reveal) * 0.22}em`
    }
  })

  return null
}

export default function Scene({ wordmark, architecture, scrollTarget, taglineRef, reduced }) {
  const phases = useRef({
    progress: reduced ? 1 : 0,
    wake: reduced ? 1 : 0,
    connect: reduced ? 1 : 0,
    arch: reduced ? 1 : 0,
    align: reduced ? 1 : 0,
    lock: reduced ? 1 : 0,
  })
  const redPos = useRef(new THREE.Vector3(0, 0, 7))

  return (
    <>
      <CameraRig
        wordmark={wordmark}
        phases={phases}
        scrollTarget={scrollTarget}
        taglineRef={taglineRef}
        reduced={reduced}
      />
      <LockupGrid wordmark={wordmark} phases={phases} />
      <TittleMark wordmark={wordmark} phases={phases} />
      <ArchitectureLines architecture={architecture} phases={phases} />
      <ParticleField
        wordmark={wordmark}
        architecture={architecture}
        phases={phases}
        redPos={redPos}
      />
      <RedDot wordmark={wordmark} phases={phases} redPos={redPos} />
    </>
  )
}
