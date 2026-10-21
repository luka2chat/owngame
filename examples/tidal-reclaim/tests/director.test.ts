import { expect, it, vi } from 'vitest'
import { Vector3 } from 'three'
import { Game } from '../src/game/game'
import { newMission } from '../src/game/tidal-mission'

// Exercise the actual director without constructing a WebGL renderer or audio device.
function director() {
 const game = Object.create(Game.prototype) as Game
 Object.assign(game,{
  mode:'playing', mission:newMission(), missionLoad:false, missionSession:1,
  player:{position:new Vector3(23,0,-10),alive:true}, bots:[],hornets:[],
  wavePhase:'none',spawnT:0,pending:[],spawnQueue:[],reinforcementT:18,
  input:{consume:vi.fn().mockReturnValueOnce(true).mockReturnValue(false)},
  stageGate:{isReady:()=>false,ensure:vi.fn().mockResolvedValue(undefined)},
  arena:{missionState:vi.fn()}, events:{loading:vi.fn(),message:vi.fn(),wave:vi.fn()},
  fx:{spawnPortal:vi.fn()}, materialize:vi.fn().mockReturnValue(true),
  beginWave:vi.fn(),waveCleared:vi.fn(),endMatch:vi.fn(),
 })
 return game
}
it('finishes a previously announced arrival while travelling between stations',()=>{
 const g=director();g['pending']=[{kind:'scrapper',pos:new Vector3(),yaw:0,t:.05}]
 g.player.position.set(0,0,-30)
 g['stepDirector'](.1)
 expect(g['materialize']).toHaveBeenCalledOnce();expect(g['pending']).toHaveLength(0)
 expect(g.mission.active).toBeNull()
})
it('one interaction activates after a cold stage finishes loading',async()=>{
 const g=director();g['stepDirector'](.1)
 expect(g.mission.active).toBeNull()
 await vi.waitFor(()=>expect(g.mission.active).toBe(1))
 expect(g['beginWave']).toHaveBeenCalledWith(1)
})
it('does not activate a stale load after restarting or leaving the console',async()=>{
 for(const restart of [true,false]){
  const g=director();g['stepDirector'](.1)
  if(restart)g['missionSession']++;else g.player.position.set(0,0,-30)
  await new Promise(resolve=>setTimeout(resolve,0))
  expect(g.mission.active).toBeNull();expect(g['beginWave']).not.toHaveBeenCalled()
 }
})
it('clears the loading state and offers retry when a required stage fails',async()=>{
 const g=director();g['stageGate'].ensure=vi.fn().mockRejectedValue(new Error('offline'))
 g['stepDirector'](.1)
 await vi.waitFor(()=>expect(g['missionLoad']).toBe(false))
 expect(g.mission.active).toBeNull();expect(g['events'].message).toHaveBeenCalled()
})

it('unlocks support weapons without interrupting the player weapon or reload',async()=>{
 const { Arsenal } = await import('../src/game/weapons')
 const a=Object.create(Arsenal.prototype) as InstanceType<typeof Arsenal>
 Object.assign(a,{current:'rifle',reloading:1,slots:{rocket:{owned:false,mag:0,reserve:0}},select:vi.fn()})
 a.give('rocket',false)
 expect(a.slots.rocket).toMatchObject({owned:true,mag:3,reserve:6})
 expect(a.current).toBe('rifle');expect(a.reloading).toBe(1);expect(a.select).not.toHaveBeenCalled()
})

it('retains unlocked grenades when a player completes stations out of order',()=>{
 const g=director();Object.assign(g,{gameMode:'onslaught',wave:0,stageGate:{isReady:()=>true}})
 expect(g.grenadesUnlocked).toBe(false)
 g.mission.progress[2]=35
 expect(g.grenadesUnlocked).toBe(true)
 g.mission=newMission()
 expect(g.grenadesUnlocked).toBe(false)
})
