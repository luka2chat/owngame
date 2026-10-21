import { describe, expect, it } from 'vitest'
import { activateStation, CHARGE_SECONDS, EXTRACTION, MISSION_LIMIT, newMission, STATIONS, stepMission, type Mission } from '../src/game/tidal-mission'
const at = (i:number) => ({...STATIONS[i],alive:true})
function charge(s:Mission,i:number){s=activateStation(s,i,at(i).x,at(i).z);for(let n=0;n<CHARGE_SECONDS;n++)s=stepMission(s,1,at(i),[]);return s}
describe('tidal mission',()=>{
 it('requires proximity and explicit activation, blocks remote and duplicate work',()=>{
  const s=newMission();expect(activateStation(s,0,0,0)).toBe(s);expect(stepMission(s,1,at(0),[]).progress[0]).toBe(0)
  const active=activateStation(s,0,at(0).x,at(0).z);expect(activateStation(active,1,at(1).x,at(1).z)).toBe(active)
 })
 it('pauses charging outside the zone or while contested without losing completed work',()=>{
  let s=activateStation(newMission(),0,at(0).x,at(0).z);s=stepMission(s,1,at(0),[])
  expect(stepMission(s,1,at(1),[])).toMatchObject({blocked:'away',progress:[1,0,0]})
  expect(stepMission(s,1,at(0),[at(0)])).toMatchObject({blocked:'enemy',progress:[1,0,0]})
  expect(stepMission(s,1,at(0),[]).progress[0]).toBe(2)
 })
 it('supports any station order, unlocks extraction only after all three, and requires uninterrupted boarding',()=>{
  let s=newMission();s=charge(s,2);s=charge(s,0);expect(s.phase).toBe('repair');s=charge(s,1);expect(s.phase).toBe('extract')
  const p={...EXTRACTION,alive:true};for(let i=0;i<7;i++)s=stepMission(s,1,p,[])
  expect(s.phase).toBe('extract');s=stepMission(s,1,p,[EXTRACTION]);expect(s.extraction).toBe(0)
  for(let i=0;i<8;i++)s=stepMission(s,1,p,[]);expect(s.phase).toBe('won');expect(stepMission(s,1,{...p,alive:false},[])).toBe(s)
 })
 it('fails on death, tide deadline or missed extraction and restarts independently',()=>{
  expect(stepMission(newMission(),1,{...at(0),alive:false},[]).phase).toBe('lost')
  expect(stepMission({...newMission(),elapsed:MISSION_LIMIT-1},1,at(0),[]).phase).toBe('lost')
  expect(stepMission({...newMission(),phase:'extract',extractElapsed:99},1,at(0),[]).phase).toBe('lost')
  expect(newMission()).toMatchObject({elapsed:0,progress:[0,0,0],active:null})
 })
 it('does not mutate the previous state or advance on invalid timing',()=>{
  const s=activateStation(newMission(),0,at(0).x,at(0).z);stepMission(s,1,at(0),[]);expect(s.progress[0]).toBe(0)
  expect(stepMission(s,NaN,at(0),[])).toBe(s);expect(stepMission(s,-1,at(0),[])).toBe(s)
 })
})
