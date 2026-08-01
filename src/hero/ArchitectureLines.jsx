import { useMemo, useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { PAPER, INK } from './tokens'

/**
 * The lines between anchors.
 *
 * These exist only in the middle of the film. They draw in ahead of the camera
 * as it moves through the corridor, hold while we fly, and then release — not
 * fading out as decoration, but handing their endpoints back to the beads that
 * were holding them up. The product's rule is that structure is derived from
 * anchors and never stored; the lines obey it literally.
 */

const vertexShader = /* glsl */ `
  uniform float uDraw;     // corridor sweep, 0..1
  uniform float uFade;     // release, 0..1
  uniform float uFogNear;
  uniform float uFogFar;

  attribute float aOrder;

  varying float vAlpha;
  varying float vFog;

  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;

    // Each segment has a place in the sweep; a soft leading edge keeps the
    // reveal from reading as a wipe.
    float lead = clamp((uDraw * 1.35 - aOrder) * 5.0, 0.0, 1.0);
    vFog = smoothstep(uFogNear, uFogFar, -mv.z);
    vAlpha = lead * (1.0 - uFade) * (1.0 - vFog);
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3  uInk;
  uniform vec3  uPaper;
  uniform float uOpacity;

  varying float vAlpha;
  varying float vFog;

  void main() {
    if (vAlpha < 0.004) discard;
    vec3 col = mix(uInk, uPaper, vFog * 0.9);
    gl_FragColor = vec4(col, vAlpha * uOpacity);
  }
`

export default function ArchitectureLines({ architecture, phases }) {
  const matRef = useRef()
  const geoRef = useRef()

  const uniforms = useMemo(
    () => ({
      uDraw: { value: 0 },
      uFade: { value: 0 },
      // The lines carry the read through the middle of the film; the beads are
      // the anchors sitting on them. Getting this hierarchy backwards turns an
      // architectural space into a snowstorm.
      uOpacity: { value: 0.62 },
      uFogNear: { value: 46 },
      uFogFar: { value: 175 },
      uInk: { value: new THREE.Color(INK) },
      uPaper: { value: new THREE.Color(PAPER) },
    }),
    []
  )

  useEffect(
    () => () => {
      geoRef.current?.dispose()
      matRef.current?.dispose()
    },
    []
  )

  useFrame(() => {
    uniforms.uDraw.value = phases.current.connect
    uniforms.uFade.value = phases.current.align
  })

  return (
    <lineSegments frustumCulled={false}>
      <bufferGeometry ref={geoRef}>
        <bufferAttribute
          attach="attributes-position"
          args={[architecture.linePositions, 3]}
        />
        <bufferAttribute
          attach="attributes-aOrder"
          args={[architecture.lineOrder, 1]}
        />
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
