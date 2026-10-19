import Phaser from 'phaser'

export default class Preloader extends Phaser.Scene
{
	constructor()
	{
		super('preloader')
	}

	preload()
	{
		for(const name of ['hero','objects','stone','decor']) this.load.image('painted-'+name,'art/faune-'+name+'.png')
		this.load.image('tiles', 'tiles/dungeon_tiles_extruded.png')
		this.load.tilemapTiledJSON('dungeon', 'tiles/dungeon-01.json')

		this.load.atlas('faune', 'character/fauna.png', 'character/fauna.json')
		this.load.atlas('lizard', 'enemies/lizard.png', 'enemies/lizard.json')
		this.load.atlas('treasure', 'items/treasure.png', 'items/treasure.json')

		this.load.image('ui-heart-empty', 'ui/ui_heart_empty.png')
		this.load.image('ui-heart-full', 'ui/ui_heart_full.png')

		this.load.image('knife', 'weapons/weapon_knife.png')
	}

	create()
	{
        // Pre-filter the large generated atlases once. Bilinear GPU minification
        // alone aliases fine painted detail at a 30px world-space sprite size.
        for(const name of ['hero','objects','decor']){
            const key='painted-'+name,source=this.textures.get(key).getSourceImage() as HTMLImageElement
            const canvas=document.createElement('canvas');canvas.width=canvas.height=512
            const c=canvas.getContext('2d')!;c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high'
            for(let i=0;i<4;i++)c.drawImage(source,(i%2)*Math.floor(source.width/2),Math.floor(i/2)*Math.floor(source.height/2),Math.floor(source.width/2),Math.floor(source.height/2),(i%2)*256,Math.floor(i/2)*256,256,256)
            this.textures.remove(key);this.textures.addCanvas(key,canvas)
        }
		this.scene.start('game')
	}
}