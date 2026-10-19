import Phaser from 'phaser'
import Preloader from './scenes/Preloader'
import Game from './scenes/Game'
import './owngame'
const viewport = document.getElementById('viewport')!
const game = new Phaser.Game({
 type:Phaser.AUTO, parent:'game', backgroundColor:'#23392c', pixelArt:false,
 width:Math.round(viewport.clientWidth), height:Math.round(viewport.clientHeight),
 physics:{default:'arcade',arcade:{gravity:{x:0,y:0},debug:false}},
 scene:[Preloader,Game], scale:{mode:Phaser.Scale.NONE,zoom:1},
 input:{activePointers:4}, audio:{noAudio:true}
})
game.events.once(Phaser.Core.Events.READY,()=>new ResizeObserver(()=>game.scale.resize(Math.round(viewport.clientWidth),Math.round(viewport.clientHeight))).observe(viewport))
