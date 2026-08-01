import { useMemo, useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { PAPER, INK, RED } from './tokens'
import { wakeOrder } from './dotPath'

/**
 * Every bead in the film is one vertex of this single Points object.
 *
 * One draw call for ~5,000 beads. The alternative — instanced spheres — costs
 * more geometry for a silhouette that is, by definition, a flat circle. The
 * beads never need to be lit or shaded: in the artwork they are solid ink.
 *
 * Position is not animated on the CPU. Each bead carries three positions as
 * attributes (scattered / architectural / lettered) and the vertex shader
 * blends between them from five phase uniforms. Nothing is uploaded per frame
 * except those uniforms, so scroll cost is independent of bead count.
 */

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uWake;        // how far the dot has travelled, 0..1
  uniform float uArch;        // scatter → architecture
  uniform float uAlign;       // architecture → wordmark
  uniform vec3  uRedPos;      // the intelligence dot, in world space
  uniform float uRedRadius;
  uniform float uProjScale;   // drawingBufferHeight / (2 tan(fov/2))
  uniform float uBeadSize;    // world diameter of a resolved wordmark bead
  uniform float uAnchorSize;  // world diameter of an unresolved anchor
  uniform float uFogNear;
  uniform float uFogFar;

  attribute vec3  aScatter;
  attribute vec3  aArch;
  attribute vec3  aWord;
  attribute vec4  aFlags;     // x hasArch · y hasWord · z seed · w unused
  attribute float aOrder;     // 0..1 bloom order, outward from the origin

  varying float vAlpha;
  varying float vTint;        // 0 ink → 1 red
  varying float vFog;

  void main() {
    float seed    = aFlags.z;
    float hasArch = aFlags.x;
    float hasWord = aFlags.y;

    float toArch = uArch  * hasArch;
    float toWord = uAlign * hasWord;

    vec3 pos = mix(aScatter, aArch, toArch);
    pos      = mix(pos,      aWord, toWord);

    // Unresolved beads breathe; resolved ones are dead still. The stillness is
    // the point — it is what "aligned" feels like against the drift it left.
    float locked = max(toArch * 0.72, toWord);
    float amp    = (1.0 - locked) * 1.15;
    pos += vec3(
      sin(uTime * 0.41 + seed * 17.0),
      cos(uTime * 0.33 + seed * 11.0),
      sin(uTime * 0.27 + seed *  7.0)
    ) * amp;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    // ── Reveal ────────────────────────────────────────────────────────────
    // A bead wakes as the dot reaches it, with a little anticipation ahead of
    // the pass. Nothing exists before the dot has been there.
    //
    // The lead is a MULTIPLIER on uWake, not an offset. An offset
    // (uWake - aOrder + lead) leaves every bead whose wake order approaches
    // 1.0 permanently below full opacity — and those are precisely the beads
    // nearest the end of the dot's route, which is where the wordmark forms.
    // It read as a scatter of grey beads stuck inside the finished logotype.
    float appear  = clamp((uWake * 1.15 - aOrder) * 7.0, 0.0, 1.0);
    // Beads with nowhere to go in the wordmark stand down as it resolves.
    float dismiss = (1.0 - hasWord) * uAlign;
    // A bead drifting past the lens must not become a black hole. Fading the
    // near field is what keeps a fly-through legible instead of speckled.
    float nearFade = smoothstep(1.5, 11.0, -mv.z);
    vAlpha = appear * (1.0 - dismiss) * nearFade;

    // ── The dot's influence ───────────────────────────────────────────────
    // Proximity to the intelligence dot wakes a bead: it swells slightly and
    // takes the dot's colour. This is why the red mark reads as alive rather
    // than as a moving sphere — the world responds to where it is.
    //
    // The falloff is deliberately tight and squared. A wide, linear one tints
    // beads scattered through depth, which on screen is not a glow around the
    // dot but a rash of unrelated pink specks — the influence has to resolve
    // into a legible cluster or it reads as noise.
    float infl = 1.0 - smoothstep(0.0, uRedRadius, distance(pos, uRedPos));
    infl = infl * infl;
    infl *= (1.0 - toWord); // once lettered, only the tittle stays red

    vTint = infl * 0.92;

    // Unresolved beads are anchor marks, not confetti: small, even, quiet, so
    // the drawn lines carry the read and the field stays a drafting space.
    // Only the resolved lockup earns full bead weight.
    float size = uAnchorSize * (0.72 + seed * 0.56);
    size *= 1.0 + infl * 1.15;
    size = mix(size, uBeadSize, toWord); // the lockup's beads are uniform

    gl_PointSize = clamp(
      size * uProjScale / max(-mv.z, 0.001),
      1.0,
      mix(20.0, 64.0, toWord)
    );

    // Depth haze belongs to the corridor, not to the resolved lockup. The
    // camera's final distance is computed from the viewport aspect, so on a
    // portrait screen it ends up far enough away that the finished wordmark
    // would fog out to near-paper — the logo, washed out, on phones only.
    // A lettered bead is present and in focus by definition.
    vFog = smoothstep(uFogNear, uFogFar, -mv.z) * (1.0 - toWord);
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uInk;
  uniform vec3 uRed;
  uniform vec3 uPaper;

  varying float vAlpha;
  varying float vTint;
  varying float vFog;

  void main() {
    // A hard-edged disc, antialiased by exactly one pixel. The artwork's beads
    // have no gradient and no glow; softening them would read as "particle
    // system" instead of "ink".
    vec2  uv = gl_PointCoord - 0.5;
    float d  = length(uv);
    float aa = fwidth(d);
    float mask = 1.0 - smoothstep(0.5 - aa, 0.5, d);
    if (mask < 0.004) discard;

    vec3 col = mix(uInk, uRed, vTint);
    col = mix(col, uPaper, vFog * 0.92); // depth reads as paper, not as haze

    gl_FragColor = vec4(col, mask * vAlpha * (1.0 - vFog * 0.55));
  }
`

export default function ParticleField({ wordmark, architecture, phases, redPos }) {
  const matRef = useRef()
  const geoRef = useRef()
  const { size, viewport, camera, gl } = useThree()

  const attrs = useMemo(() => {
    const { anchors, anchorCount } = architecture
    const { points: word, count: wordCount, tittleIndices } = wordmark

    // Ambient beads that belong to no structure. Kept sparse and pushed wide
    // of the flight path: their job is to say the space continues past the
    // drawing, not to fill the frame.
    const DUST = 620
    const N = anchorCount + DUST

    const aScatter = new Float32Array(N * 3)
    const aArch = new Float32Array(N * 3)
    const aWord = new Float32Array(N * 3)
    const aFlags = new Float32Array(N * 4)
    const aOrder = new Float32Array(N)

    // Deterministic jitter so the composition is identical across reloads.
    let s = 1337
    const rand = () => {
      s = (s * 16807) % 2147483647
      return s / 2147483647
    }

    // ── Scattered home + architectural target ───────────────────────────────
    for (let i = 0; i < N; i++) {
      const isArch = i < anchorCount

      if (isArch) {
        aArch[i * 3] = anchors[i * 3]
        aArch[i * 3 + 1] = anchors[i * 3 + 1]
        aArch[i * 3 + 2] = anchors[i * 3 + 2]
      }

      // Beads begin dispersed around where they will eventually be needed, so
      // the gathering reads as focusing rather than as teleportation.
      if (isArch) {
        const spread = 22
        aScatter[i * 3] = anchors[i * 3] + (rand() - 0.5) * spread
        aScatter[i * 3 + 1] = anchors[i * 3 + 1] + (rand() - 0.5) * spread * 0.6
        aScatter[i * 3 + 2] = anchors[i * 3 + 2] + (rand() - 0.5) * spread
      } else {
        // Dust sits in a shell around the corridor rather than inside it, so
        // it never drifts through the lens.
        const a = rand() * Math.PI * 2
        const r = 46 + rand() * 46
        aScatter[i * 3] = Math.cos(a) * r
        aScatter[i * 3 + 1] = Math.sin(a) * r * 0.55 + 4
        aScatter[i * 3 + 2] = 4 - rand() * 140
      }

      aFlags[i * 4] = isArch ? 1 : 0
      aFlags[i * 4 + 1] = 0
      aFlags[i * 4 + 2] = rand()
      aFlags[i * 4 + 3] = 0
    }

    // ── Which beads become letters ──────────────────────────────────────────
    // Not an arbitrary subset. Each letterform bead claims the architectural
    // anchor nearest to an exploded copy of its own position — the wordmark,
    // scaled up and pushed back through the corridor. The convergence then
    // reads as depth collapsing: the beads were always in roughly the right
    // place on screen and only ever needed to agree on one plane. That is
    // precisely what the name means.
    const tittleSet = new Set(tittleIndices)
    const taken = new Uint8Array(anchorCount)
    const SPREAD_XY = 2.15

    for (let j = 0; j < wordCount; j++) {
      if (tittleSet.has(j)) continue // drawn as its own red mark, not a bead
      const wx = word[j * 3]
      const wy = word[j * 3 + 1]
      const px = wx * SPREAD_XY
      const py = wy * SPREAD_XY + 3
      const pz = -14 - rand() * 82

      let best = -1
      let bestD = Infinity
      for (let i = 0; i < anchorCount; i++) {
        if (taken[i]) continue
        const dx = anchors[i * 3] - px
        const dy = anchors[i * 3 + 1] - py
        const dz = (anchors[i * 3 + 2] - pz) * 0.28 // favour screen agreement
        const d = dx * dx + dy * dy + dz * dz
        if (d < bestD) {
          bestD = d
          best = i
        }
      }
      if (best < 0) break

      taken[best] = 1
      aWord[best * 3] = wx
      aWord[best * 3 + 1] = wy
      aWord[best * 3 + 2] = word[j * 3 + 2]
      aFlags[best * 4 + 1] = 1
    }

    // ── Reveal order: the dot's own wake ────────────────────────────────────
    // Each bead wakes at the moment the dot passes closest to it, so the field
    // is genuinely discovered by the character rather than cross-fading in.
    aOrder.set(wakeOrder(aScatter, N))

    return { N, aScatter, aArch, aWord, aFlags, aOrder }
  }, [wordmark, architecture])

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uWake: { value: 0 },
      uArch: { value: 0 },
      uAlign: { value: 0 },
      uRedPos: { value: new THREE.Vector3() },
      uRedRadius: { value: 6 },
      uProjScale: { value: 1000 },
      uBeadSize: { value: wordmark.dotRadius * 2 },
      uAnchorSize: { value: wordmark.dotRadius * 0.2 },
      uFogNear: { value: 46 },
      uFogFar: { value: 175 },
      // Hex in, not raw floats: three's ColorManagement converts sRGB → the
      // linear working space, and the renderer converts back on output. Handing
      // it sRGB values as if they were already linear is what turns #0d0d0d ink
      // into mid-grey and a saturated red into pink.
      uInk: { value: new THREE.Color(INK) },
      uRed: { value: new THREE.Color(RED) },
      uPaper: { value: new THREE.Color(PAPER) },
    }),
    [wordmark]
  )

  // gl_PointSize is in device pixels, so the world→pixel factor has to be
  // derived from the drawing buffer, not from CSS pixels. Getting this wrong
  // is why particle heroes look correct on a laptop and wrong on a phone.
  useEffect(() => {
    const h = gl.domElement.height
    const fov = (camera.fov * Math.PI) / 180
    uniforms.uProjScale.value = h / (2 * Math.tan(fov / 2))
  }, [size, viewport.dpr, camera.fov, gl, uniforms])

  // Three never releases GPU memory on its own.
  useEffect(
    () => () => {
      geoRef.current?.dispose()
      matRef.current?.dispose()
    },
    []
  )

  useFrame((state) => {
    const u = uniforms
    u.uTime.value = state.clock.elapsedTime
    u.uWake.value = phases.current.wake
    u.uArch.value = phases.current.arch
    u.uAlign.value = phases.current.align
    u.uRedPos.value.copy(redPos.current)
    // The dot's reach contracts as the word resolves — by the end it commands
    // only itself.
    u.uRedRadius.value = 6 * (1 - phases.current.align * 0.82) + 1.2
  })

  return (
    <points frustumCulled={false}>
      <bufferGeometry ref={geoRef}>
        <bufferAttribute attach="attributes-position" args={[attrs.aScatter, 3]} />
        <bufferAttribute attach="attributes-aScatter" args={[attrs.aScatter, 3]} />
        <bufferAttribute attach="attributes-aArch" args={[attrs.aArch, 3]} />
        <bufferAttribute attach="attributes-aWord" args={[attrs.aWord, 3]} />
        <bufferAttribute attach="attributes-aFlags" args={[attrs.aFlags, 4]} />
        <bufferAttribute attach="attributes-aOrder" args={[attrs.aOrder, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
      />
    </points>
  )
}
