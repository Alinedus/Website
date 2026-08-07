import * as THREE from 'three'

/**
 * The finished double-storey house at EXECUTION.
 *
 * This is the only lit, materialised object on the entire site. Everything before it — the ring,
 * the plan, the model, even Act I's "render" — is line art or flat grey. That restraint is what
 * makes this land: the site's one real render is the one that actually got built.
 *
 * Consequently it is also the only thing in the scene that needs lights, which is why they live
 * here rather than in the stage.
 */

const CLOUD = '#EFEFEF'
const CHARCOAL = '#1A1A1A'
const SCARLET = '#FF391F'

export interface HouseView {
  group: THREE.Group
  /** 0 absent, 1 fully present — rises into place and materialises */
  update(t: number): void
}

export function createHouse(): HouseView {
  const group = new THREE.Group()
  group.visible = false

  const wall = new THREE.MeshStandardMaterial({ color: CLOUD, roughness: 0.82, metalness: 0 })
  const trim = new THREE.MeshStandardMaterial({ color: '#CFCAC7', roughness: 0.7 })
  const glass = new THREE.MeshStandardMaterial({ color: CHARCOAL, roughness: 0.35, metalness: 0.1 })
  const door = new THREE.MeshStandardMaterial({ color: SCARLET, roughness: 0.6 })

  const box = (
    w: number, h: number, d: number,
    x: number, y: number, z: number,
    mat: THREE.Material,
  ) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    m.position.set(x, y, z)
    group.add(m)
    return m
  }

  // ground floor, upper floor set back, and a thin roof slab — modern, flat, no pitch. A gable
  // would read as "house icon"; this reads as something an architect drew.
  box(10, 4.2, 7, 0, 2.1, 0, wall)
  box(8.4, 3.6, 6.2, -0.5, 6.0, 0, wall)
  box(9, 0.28, 6.8, -0.5, 7.94, 0, trim)
  box(10.4, 0.3, 7.4, 0, 0.15, 0, trim)

  // openings on the two faces the camera can see
  box(0.16, 2.4, 4.2, 5.02, 2.3, 0.6, glass)
  box(3.6, 2.2, 0.16, -2.2, 2.4, 3.52, glass)
  box(0.16, 1.9, 3.4, 3.72, 6.1, 0.4, glass)
  box(3.0, 1.8, 0.16, -1.6, 6.2, 3.12, glass)

  // the one scarlet detail
  box(1.1, 2.3, 0.18, 1.9, 1.15, 3.53, door)

  const key = new THREE.DirectionalLight(0xffffff, 2.1)
  key.position.set(4, 8, 6)
  const fill = new THREE.DirectionalLight(0xffffff, 0.55)
  fill.position.set(-6, 3, -4)
  group.add(key, fill, new THREE.AmbientLight(0xffffff, 0.85))

  function update(t: number) {
    group.visible = t > 0.004
    if (!group.visible) return
    const e = t * t * (3 - 2 * t)
    group.scale.setScalar(0.55 + 0.45 * e)
    group.position.y = -7 * (1 - e)
    for (const c of group.children) {
      const m = (c as THREE.Mesh).material as THREE.Material | undefined
      if (m && 'opacity' in m) {
        m.transparent = e < 0.995
        ;(m as THREE.MeshStandardMaterial).opacity = e
      }
    }
  }

  return { group, update }
}
