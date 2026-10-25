import * as THREE from 'three'
import type { ModelEntry } from '../world/mapdata'

/** Flag and banner models (built into public/assets/props by tools/build-assets.mjs). */
export class Props {
  private constructor(private readonly templates: Map<string, THREE.Group>) {}

  static async load(base = './assets/props/props'): Promise<Props> {
    const [json, buf] = await Promise.all([
      fetch(base + '.json').then(r => { if(!r.ok) throw new Error(`Model pack: ${r.status} ${base}`); return r.json() as Promise<Record<string, ModelEntry>> }),
      fetch(base + '.bin').then(r => { if(!r.ok) throw new Error(`Model pack: ${r.status} ${base}`); return r.arrayBuffer() }),
    ])
    const loader = new THREE.TextureLoader()
    const ready: Promise<void>[] = []
    const textures = new Map<string, THREE.Texture>()
    const tex = (key: string) => {
      let t = textures.get(key)
      if (!t) {
        let done!: () => void, fail!: (e: unknown) => void
        ready.push(new Promise<void>((resolve,reject)=>{done=resolve;fail=reject}))
        t = loader.load('./assets/tex/' + key,done,undefined,fail)
        t.colorSpace = THREE.SRGBColorSpace
        t.wrapS = t.wrapT = THREE.RepeatWrapping
        textures.set(key, t)
      }
      return t
    }
    const templates = new Map<string, THREE.Group>()
    for (const [id, model] of Object.entries(json)) {
      const verts = new Float32Array(buf, model.vertices, model.vertexCount * 8)
      const index = model.wideIndex ? new Uint32Array(buf, model.indices, model.indexCount) : new Uint16Array(buf, model.indices, model.indexCount)
      const ib = new THREE.InterleavedBuffer(verts, 8)
      const group = new THREE.Group()
      for (const g of model.groups) {
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 3, 0))
        geo.setAttribute('normal', new THREE.InterleavedBufferAttribute(ib, 3, 3))
        geo.setAttribute('uv', new THREE.InterleavedBufferAttribute(ib, 2, 6))
        geo.setIndex(new THREE.BufferAttribute(index.subarray(g.start, g.start + g.count), 1))
        const mat = new THREE.MeshLambertMaterial({ map: g.tex ? tex(g.tex) : null, side: THREE.DoubleSide })
        if (g.blend === 1) mat.alphaTest = 0.5
        else if (g.blend === 3 || g.blend === 4) {
          // M2 additive glows (rune halos).
          mat.transparent = true
          mat.blending = THREE.AdditiveBlending
          mat.depthWrite = false
        } else if (g.blend >= 2) {
          mat.alphaTest = 0.3
          mat.transparent = true
        }
        const mesh = new THREE.Mesh(geo, mat)
        mesh.castShadow = true
        group.add(mesh)
      }
      templates.set(id, group)
    }
    await Promise.all(ready)
    return new Props(templates)
  }

  create(id: string): THREE.Group {
    return this.templates.get(id)!.clone()
  }
}
