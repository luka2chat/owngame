export const joystickRadius=48
export const joystickDeadzone=8

// CSS-pixel displacement from the initial press, independent of camera/player position.
export function joystickVector(dx:number,dy:number){
  const distance=Math.hypot(dx,dy)
  if(!Number.isFinite(distance)||distance===0)return{x:0,y:0,thumbX:0,thumbY:0}
  const travel=Math.min(distance,joystickRadius)
  const strength=Math.max(0,(travel-joystickDeadzone)/(joystickRadius-joystickDeadzone))
  return{x:dx/distance*strength,y:dy/distance*strength,thumbX:dx/distance*travel,thumbY:dy/distance*travel}
}
