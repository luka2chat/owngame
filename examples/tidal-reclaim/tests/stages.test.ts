import { expect, it, vi } from 'vitest'
import { Group, Mesh, BoxGeometry } from 'three'
import { StageLoader } from '../src/game/stages'
import type { Assets } from '../src/engine/assets'
import type { Audio } from '../src/engine/audio'
it('rejects a failed required stage, never announces readiness, and succeeds on retry',async()=>{
 const scene=new Group();scene.add(new Mesh(new BoxGeometry(1,2,1)))
 const gltf=vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({scene,animations:[]})
 const loader=new StageLoader({gltf} as unknown as Assets,{loadSamples:async()=>{}} as unknown as Audio,1)
 const ready=vi.fn();loader.onStageReady=ready
 await expect(loader.ensure(2)).rejects.toThrow('offline');expect(loader.isReady(2)).toBe(false);expect(ready).not.toHaveBeenCalled()
 await loader.ensure(2);expect(loader.isReady(2)).toBe(true);expect(ready).toHaveBeenCalledOnce()
 expect(gltf.mock.calls.every(([url])=>!String(url).match(/v4chars\/(operator|breacher|sentinel|exo|warden|player)/))).toBe(true)
 const n=gltf.mock.calls.length;await loader.ensure(2);expect(gltf.mock.calls.length).toBe(n)
})
