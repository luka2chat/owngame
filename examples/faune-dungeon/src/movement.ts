// Arrival is bounded by the physics step as well as the render interval.
// This prevents overshoot both on high-refresh displays and on slow frames.
export function arrivalSpeed(distance:number,renderMs:number,physicsHz:number){
  if(distance<.08)return 0
  const longestStep=Math.max(1/physicsHz,renderMs/1000)
  return Math.min(100,distance*18,distance/longestStep)
}
