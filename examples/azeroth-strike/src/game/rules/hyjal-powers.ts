/** Temporary player boons. Different kinds combine; a repeat refreshes, never stacks potency. */
export const POWERS = {
  ammo: { seconds: 18, color: 0x70dfff, symbol: '∞' },
  fury: { seconds: 15, color: 0xff9d49, symbol: '×3' },
  ward: { seconds: 18, color: 0xc19cff, symbol: '◇' },
  sprint: { seconds: 20, color: 0x89ed90, symbol: '»' },
} as const
export type PowerKind = keyof typeof POWERS
export const POWER_KINDS = Object.keys(POWERS) as PowerKind[]
export class BattlePowers {
  readonly left: Record<PowerKind, number> = { ammo:0, fury:0, ward:0, sprint:0 }
  grant(kind:PowerKind): void { this.left[kind] = POWERS[kind].seconds }
  update(dt:number): void {
    if (!Number.isFinite(dt) || dt<=0) return
    for (const kind of POWER_KINDS) this.left[kind]=Math.max(0,this.left[kind]-dt)
  }
  clear(): void { for (const kind of POWER_KINDS) this.left[kind]=0 }
  get damage():number { return this.left.fury>0?3:1 }
  get incoming():number { return this.left.ward>0?.35:1 }
  get speed():number { return this.left.sprint>0?1.65:1 }
  get infiniteAmmo():boolean { return this.left.ammo>0 }
}
export type PowerDrop = { id:number; kind:PowerKind; slot:number; expires:number }
/** One drop at a time, rotating both power and site; unclaimed drops expire instead of piling up. */
export class PowerSchedule {
  time=0
  next=10
  private serial=0
  readonly drops:PowerDrop[]=[]
  constructor(readonly interval:number, readonly slots:number) {}
  update(dt:number):PowerDrop[] {
    if(!Number.isFinite(dt)||dt<=0)return []
    this.time+=dt
    for(let i=this.drops.length-1;i>=0;i--)if(this.drops[i].expires<=this.time)this.drops.splice(i,1)
    const born:PowerDrop[]=[]
    while(this.next<=this.time) {
      const id=this.serial++, slot=id%this.slots
      const d={id,kind:POWER_KINDS[id%POWER_KINDS.length],slot,expires:this.next+30}
      this.next+=this.interval
      // A large time step must not resurrect a drop whose lifetime has already passed.
      if(d.expires<=this.time)continue
      const old=this.drops.findIndex(x=>x.slot===slot)
      if(old>=0)this.drops.splice(old,1)
      this.drops.push(d);born.push(d)
    }
    return born
  }
  take(id:number,alive:boolean):PowerKind|null {
    const index=this.drops.findIndex(d=>d.id===id)
    if(!alive||index<0)return null
    return this.drops.splice(index,1)[0].kind
  }
  clear():void { this.drops.length=0 }
}
