import { useMemo, useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * A drawn line layer.
 *
 * Several movements need lines between their anchors — the corridor's
 * architecture, the blueprint's rules and dimension chains, the city's lot
 * boundaries, the network's edges. They are different topologies, so they
 * cannot morph into one another the way the point pool does; instead each owns
 * a layer and the director cross-fades them across a hand-off, which is
 * indistinguishable from a morph when the points underneath are continuous.
 *
 * Drawn as GL_LINES, one vertex per endpoint — not as width-expanded quads.
 * The technical review measured the quad path at 20-40x overdraw for the
 * network's edge count with depth-write off (so no early-z), which is 70-140M
 * fragment invocations a frame and will not hold on a tablet.
 *
 * `reveal` sweeps the layer in along a per-segment order rather than fading the
 * whole thing, so a drawing arrives by being DRAWN.
 */

const vertexShader = /* glsl */ `
  uniform float uReveal;
  uniform float uWeight;
  uniform float uFogNear;   // ratio of the focus distance
  uniform float uFogFar;
  uniform float uFocusDist;

  attribute float aOrder;

  varying float vAlpha;
  varying float vFog;

  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;

    // A soft leading edge; a hard one reads as a wipe.
    float lead = clamp((uReveal * 1.25 - aOrder) * 6.0, 0.0, 1.0);
    vFog = smoothstep(uFogNear, uFogFar, (-mv.z) / max(uFocusDist, 0.001));
    vAlpha = lead * uWeight * (1.0 - vFog);
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3  uColor;
  uniform vec3  uHaze;
  uniform float uOpacity;

  varying float vAlpha;
  varying float vFog;

  void main() {
    if (vAlpha < 0.004) discard;
    vec3 col = mix(uColor, uHaze, vFog * 0.9);
    gl_FragColor = vec4(col, vAlpha * uOpacity);
  }
`

export default function LineLayer({
  positions,
  order,
  color,
  haze,
  opacity = 0.6,
  weight, // ref → 0..1 how lit this layer is
  focusDist, // ref → camera working distance, for relative fog
  reveal, // ref → 0..1 draw sweep
  fog = [1.6, 6.0],
}) {
  const geoRef = useRef()
  const matRef = useRef()

  const uniforms = useMemo(
    () => ({
      uReveal: { value: 1 },
      uWeight: { value: 0 },
      uOpacity: { value: opacity },
      uFogNear: { value: fog[0] },
      uFogFar: { value: fog[1] },
      uFocusDist: { value: 30 },
      uColor: { value: new THREE.Color(color) },
      uHaze: { value: new THREE.Color(haze) },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  // Every segment gets a draw order. Without one supplied, order by depth so
  // the layer assembles away from the viewer rather than at random.
  const orderAttr = useMemo(() => {
    if (order) return order
    const n = positions.length / 3
    const out = new Float32Array(n)
    let zMin = Infinity
    let zMax = -Infinity
    for (let i = 0; i < n; i++) {
      const z = positions[i * 3 + 2]
      if (z < zMin) zMin = z
      if (z > zMax) zMax = z
    }
    const span = zMax - zMin || 1
    for (let i = 0; i < n; i++) {
      out[i] = 1 - (positions[i * 3 + 2] - zMin) / span
    }
    return out
  }, [positions, order])

  useEffect(
    () => () => {
      geoRef.current?.dispose()
      matRef.current?.dispose()
    },
    []
  )

  useFrame(() => {
    uniforms.uWeight.value = weight.current
    if (focusDist) uniforms.uFocusDist.value = focusDist.current
    uniforms.uReveal.value = reveal ? reveal.current : 1
    if (haze && uniforms.uHaze.value) uniforms.uHaze.value.set(haze)
  })

  return (
    <lineSegments frustumCulled={false}>
      <bufferGeometry ref={geoRef}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aOrder" args={[orderAttr, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
      />
    </lineSegments>
  )
}
