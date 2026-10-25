import type { NavGraph, Point } from '../world/nav'
export const flatDistance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z)
export const routeLength=(route:Point[])=>route.slice(1).reduce((sum,p,i)=>sum+flatDistance(route[i],p),0)
/** Choose separate, connected ground sites around the camp, not offsets at the same gate. */
export function campSites(nav:NavGraph,core:Point,count:number,min:number,max:number,heading:number):Point[] {
  const candidates=nav.nodesNear(core.x,core.z,max+5).filter(n=>!nav.tight[n]&&flatDistance(nav.point(n),core)>=min&&flatDistance(nav.point(n),core)<=max&&Math.abs(nav.y[n]-core.y)<12)
  const sites:Point[]=[]
  for(let slot=0;slot<count;slot++) {
    const angle=heading+slot*Math.PI*2/count
    const target={x:core.x+Math.sin(angle)*(min+max)/2,y:core.y,z:core.z+Math.cos(angle)*(min+max)/2}
    const ranked=[...candidates].sort((a,b)=>flatDistance(nav.point(a),target)-flatDistance(nav.point(b),target))
    let chosen:Point|undefined
    for(const n of ranked) {
      const point=nav.point(n)
      if(sites.some(p=>flatDistance(p,point)<min*.85))continue
      const route=nav.findPath(point,core)
      if(!route||routeLength([point,...route])>max*2.5)continue
      chosen=point;break
    }
    if(!chosen)throw new Error(`Camp has no distinct reachable site ${slot+1}/${count} at ${min}-${max}`)
    sites.push(chosen)
  }
  return sites
}
