const pitches=[523.251,659.255,783.991,1046.502];
export class ChimeAudio{
 private context:AudioContext|null=null;private tones=new Set<OscillatorNode>();count=0;error=false;
 unlock(muted:boolean){if(muted)return;try{this.context??=new AudioContext();void this.context.resume().catch(()=>this.error=true);}catch{this.error=true;}}
 tone(i:number,muted:boolean){const c=this.context;if(muted||!c||c.state!=='running')return;const t=c.currentTime;
  for(const[ratio,gain,decay]of[[1,.10,.48],[2.76,.025,.21]]){const o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.value=pitches[i]*ratio;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(gain,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+decay);o.connect(g);g.connect(c.destination);this.tones.add(o);o.onended=()=>{this.tones.delete(o);o.disconnect();g.disconnect();};o.start(t);o.stop(t+decay+.02);}this.count++;
 }
 silence(){for(const o of this.tones){try{o.stop();}catch{}}this.tones.clear();}
 snapshot(){return{state:this.context?.state||'uncreated',count:this.count,active:this.tones.size,error:this.error};}
}
