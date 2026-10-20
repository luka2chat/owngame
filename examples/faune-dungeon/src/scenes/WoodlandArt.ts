import Phaser from 'phaser'
import type {Level} from '../levels'

// Authored collision maps remain authoritative. This layer only paints them.
export class WoodlandArt {
    private actors = new Map<any,{image:Phaser.GameObjects.Image,shadow:Phaser.GameObjects.Ellipse}>()
    constructor(private scene:Phaser.Scene, map:Phaser.Tilemaps.Tilemap, ground:Phaser.Tilemaps.TilemapLayer, walls:Phaser.Tilemaps.TilemapLayer,level:Level) {
        for(const key of ['painted-hero','painted-objects','painted-decor']){
            const texture=scene.textures.get(key),source=texture.getSourceImage() as HTMLImageElement
            const w=Math.floor(source.width/2),h=Math.floor(source.height/2)
            for(let i=0;i<4;i++)if(!texture.has(String(i)))texture.add(String(i),0,(i%2)*w,Math.floor(i/2)*h,w,h)
        }
        ground.setVisible(false);walls.setVisible(false)
        const key='painted-floor-'+scene.sys.settings.key
        if(scene.textures.exists(key))scene.textures.remove(key)
        const texture=scene.textures.createCanvas(key,map.widthInPixels*2,map.heightInPixels*2)!
        const c=texture.context;c.scale(2,2)
        const floor=scene.textures.get('painted-stone').getSourceImage() as HTMLImageElement
        const pattern=c.createPattern(floor,'repeat')!;pattern.setTransform(new DOMMatrix().scale(.085))
        c.fillStyle=pattern
        ground.forEachTile(tile=>{if(tile.index>=0)c.fillRect(tile.pixelX,tile.pixelY,16,16)})
        // Wall footprints match the unchanged collision tiles exactly.
        walls.forEachTile(tile=>{if(tile.index<0)return;c.fillStyle=pattern;c.fillRect(tile.pixelX,tile.pixelY,16,16);c.fillStyle='#17352299';c.fillRect(tile.pixelX,tile.pixelY,16,16)})
        texture.refresh();scene.add.image(0,0,key).setOrigin(0).setDisplaySize(map.widthInPixels,map.heightInPixels).setTint(level.tint).setDepth(-2)
        walls.forEachTile(tile=>{
            if(tile.index<0)return
            const below=walls.getTileAt(tile.x,tile.y+1)
            if(!below || below.index<0){
                if(tile.x%2===0)scene.add.image(tile.pixelX+16,tile.pixelY+3,'painted-decor','0').setDisplaySize(38,34).setDepth(1000+tile.pixelY+16)
                if(tile.x%7===3){
                    scene.add.image(tile.pixelX+8,tile.pixelY-2,'painted-decor','2').setDisplaySize(28,44).setDepth(1000+tile.pixelY+17)
                    scene.add.image(tile.pixelX+8,tile.pixelY+6,'lantern-glow').setDisplaySize(90,90).setBlendMode(Phaser.BlendModes.ADD).setAlpha(.7).setDepth(2000)
                }
            } else if((tile.x*3+tile.y)%7===0){
                scene.add.image(tile.pixelX+7,tile.pixelY+6,'painted-decor','1').setDisplaySize(28,28).setDepth(1000+tile.pixelY+16)
            }
        })
        scene.add.image(level.exit.x,level.exit.y+7,'painted-decor','3').setDisplaySize(58,58).setDepth(-1)
    }
    sync(hero:any,enemies:any[],chests:any[],time:number){
        const active=new Set([hero,...enemies,...chests])
        for(const [actor,v] of this.actors)if(!active.has(actor)){v.image.destroy();v.shadow.destroy();this.actors.delete(actor)}
        for(const actor of active){
            const isHero=actor===hero,isChest=chests.includes(actor)
            const key=isHero?'painted-hero':'painted-objects'
            let v=this.actors.get(actor)
            if(!v){v={image:this.scene.add.image(actor.x,actor.y,key,'0'),shadow:this.scene.add.ellipse(actor.x,actor.y+10,isChest?23:17,7,0x17281b,.3)};this.actors.set(actor,v)}
            actor.setVisible(false)
            const anim=actor.anims?.currentAnim?.key||'',moving=Math.hypot(actor.body?.velocity?.x||0,actor.body?.velocity?.y||0)>5
            let frame=0
            if(isHero)frame=anim.includes('up')?1:anim.includes('side')?(actor.scaleX<0?3:2):0
            else frame=isChest?(actor.opened?3:2):(actor.body?.velocity?.y<0?1:0)
            const bob=moving?Math.sin(time*.018)*.8:Math.sin(time*.002)*.2
            const size=isHero?44:isChest?38:actor.kind==='warden'?72:actor.kind==='guardian'?42:34
            v.image.setFrame(String(frame)).setPosition(actor.x,actor.y-3-bob).setDisplaySize(size,size).setDepth(1000+actor.y+12)
            v.image.setAngle(moving?Math.sin(time*.018)*2:0)
            if(actor.tintTopLeft===0xff0000)v.image.setTint(0xffaa88)
            else if(actor.kind==='warden')v.image.setTint(actor.warning?0xffedaa:actor.enraged?0xf1b49b:0xc9ddaa)
            else if(actor.kind==='guardian')v.image.setTint(0xeac68a)
            else if(actor.kind==='hunter')v.image.setTint(0xaad4d0)
            else v.image.clearTint()
            v.shadow.setPosition(actor.x,actor.y+10).setDepth(2)
        }
    }
}
