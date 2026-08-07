import * as THREE from 'three'
import { BONES, HEAD_R, JOINTS, type JointName, type Joints } from './figure'

/**
 * Draws the rig inside the 3D scene, in the logo's own construction: bones are thin quads and
 * joints are discs, so every stroke ends in a round cap made of an actual dot. That is the same
 * dot-and-fillet grammar the wordmark is built from.
 *
 * Quads rather than lines because WebGL ignores LineBasicMaterial.linewidth almost everywhere — a
 * one-pixel figure would vanish against the circuit at this camera distance.
 *
 * Bones and joints are each a single InstancedMesh. As twenty-five separate meshes he cost about
 * 17fps on a 4x-throttled scroll, entirely in draw calls; this is three.
 *
 * The whole group is billboarded to the fixed camera basis. He is a side view, so travelling left
 * or right is a horizontal flip rather than a rotation.
 */

const BONE_W = 0.115
const JOINT_R = 0.085
const DRAWN_JOINTS = JOINTS.filter((j) => j !== 'head') as JointName[]

export interface FigurePose {
  /** world units per rig cell */
  scale: number
  /** 0..1 — how much of the body has drawn itself in, spine first */
  bodyDraw: number
  /** +1 facing screen-right, -1 facing screen-left */
  facing: number
  /** head scale multiplier — the impact when it lands on the ring */
  headPop?: number
}

export interface FigureView {
  group: THREE.Group
  update(j: Joints, pose: FigurePose): void
  /** opacity lets the client arrive and leave rather than blinking in and out */
  setInk(c: THREE.Color, opacity?: number): void
  visible(v: boolean): void
}

export function createFigureView(
  right: THREE.Vector3,
  up: THREE.Vector3,
  toCamera: THREE.Vector3,
  /** the client gets a grey head — scarlet belongs to one person on this site */
  headColor = 0xff391f,
): FigureView {
  const group = new THREE.Group()
  group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, toCamera))

  // an inner node carries the flip, so the billboard quaternion is never touched
  const flip = new THREE.Group()
  group.add(flip)

  const ink = new THREE.MeshBasicMaterial({ color: 0xefefef, transparent: true })
  const scarlet = new THREE.MeshBasicMaterial({ color: headColor, transparent: true })

  const bones = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), ink, BONES.length)
  const dots = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 16), ink, DRAWN_JOINTS.length)
  bones.frustumCulled = false
  dots.frustumCulled = false
  flip.add(bones, dots)

  const head = new THREE.Mesh(new THREE.CircleGeometry(1, 20), scarlet)
  flip.add(head)

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const pos = new THREE.Vector3()
  const scl = new THREE.Vector3()
  const zAxis = new THREE.Vector3(0, 0, 1)
  const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0)

  function update(j: Joints, pose: FigurePose) {
    const s = pose.scale
    flip.scale.set(pose.facing, 1, 1)

    const shown = Math.round(pose.bodyDraw * BONES.length)

    for (let i = 0; i < BONES.length; i++) {
      if (i >= shown) {
        bones.setMatrixAt(i, HIDDEN)
        continue
      }
      const a = j[BONES[i][0]]
      const b = j[BONES[i][1]]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len = Math.hypot(dx, dy)
      pos.set(((a.x + b.x) / 2) * s, ((a.y + b.y) / 2) * s, 0)
      q.setFromAxisAngle(zAxis, Math.atan2(dy, dx))
      scl.set(Math.max(len * s, 1e-4), BONE_W * s, 1)
      bones.setMatrixAt(i, m.compose(pos, q, scl))
    }
    bones.instanceMatrix.needsUpdate = true

    for (let i = 0; i < DRAWN_JOINTS.length; i++) {
      const name = DRAWN_JOINTS[i]
      // a joint appears with the first bone that uses it, so the body assembles cleanly
      const seen =
        shown > 0 && BONES.slice(0, shown).some((b) => b[0] === name || b[1] === name)
      if (!seen) {
        dots.setMatrixAt(i, HIDDEN)
        continue
      }
      pos.set(j[name].x * s, j[name].y * s, 0.002)
      scl.setScalar(JOINT_R * s)
      dots.setMatrixAt(i, m.compose(pos, IDENTITY, scl))
    }
    dots.instanceMatrix.needsUpdate = true

    head.position.set(j.head.x * s, j.head.y * s, 0.004)
    head.scale.setScalar(HEAD_R * s * (pose.headPop ?? 1))
  }

  return {
    group,
    update,
    setInk: (c, opacity = 1) => {
      ink.color.copy(c)
      ink.opacity = opacity
      scarlet.opacity = opacity
    },
    visible: (v) => {
      group.visible = v
    },
  }
}

const IDENTITY = new THREE.Quaternion()
