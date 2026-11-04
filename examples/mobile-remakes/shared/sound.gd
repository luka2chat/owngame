extends Node
## Original layered synthesis. No external samples; effects are generated once.
const SAMPLE_RATE=22050
# duration, fundamental start/end, tone, noise, harmonic material
const CUES={
 "shot":[0.075,420.0,180.0,0.13,0.025,0.3],
 "collect":[0.22,660.0,880.0,0.17,0.0,0.15],
 "hit":[0.11,130.0,65.0,0.20,0.12,0.4],
 "kill":[0.27,120.0,42.0,0.24,0.16,0.5],
 "hurt":[0.28,150.0,48.0,0.22,0.12,0.35],
 "flare":[0.52,70.0,240.0,0.24,0.11,0.5],
 "upgrade":[0.55,262.0,524.0,0.20,0.0,0.2],
 "elite":[0.65,130.0,65.0,0.22,0.04,0.7],
 "win":[0.90,330.0,660.0,0.20,0.0,0.2],
 "loss":[0.65,220.0,83.0,0.18,0.02,0.4],
 "jump":[0.18,160.0,380.0,0.14,0.01,0.25],
 "land":[0.10,85.0,40.0,0.16,0.08,0.3],
 "dash":[0.23,230.0,65.0,0.07,0.16,0.2],
 "bounce":[0.22,280.0,560.0,0.16,0.0,0.3],
 "bumper":[0.28,440.0,415.0,0.18,0.015,1.4],
 "flipper":[0.08,110.0,80.0,0.10,0.10,0.6],
 "wood":[0.14,180.0,100.0,0.14,0.09,0.13],
 "stone":[0.25,720.0,690.0,0.10,0.07,1.7],
 "build":[0.27,140.0,300.0,0.19,0.07,0.5],
 "merge":[0.65,330.0,660.0,0.20,0.02,0.4],
 "select":[0.06,320.0,340.0,0.10,0.01,0.15],
 "card":[0.20,200.0,350.0,0.09,0.12,0.2],
 "turn":[0.34,262.0,392.0,0.14,0.0,0.2],
 "block":[0.26,170.0,120.0,0.15,0.08,1.5],
 "heal":[0.46,392.0,660.0,0.15,0.0,0.2],
 "deny":[0.12,160.0,140.0,0.09,0.0,0.3]
}
var streams:={}
var voices:Array[AudioStreamPlayer]=[]
var muted:=false
var theme_pitch:=1.0
var profile:=""
var cue_time:={}
var variation:=0

func _ready() -> void:
 for cue in CUES:streams[cue]=build_cue(CUES[cue],str(cue))
 for i in range(6):
  var voice=AudioStreamPlayer.new();voice.volume_db=-10
  add_child(voice);voices.append(voice)

func play(cue: String) -> void:
 if muted or voices.is_empty() or not streams.has(cue):return
 var now=Time.get_ticks_msec()
 var throttle=110 if cue in ["shot","hit"] else 65
 if now-int(cue_time.get(cue,-1000))<throttle:return
 cue_time[cue]=now
 var voice:AudioStreamPlayer=null
 for candidate in voices:
  if not candidate.playing:voice=candidate;break
 # Quiet repeated shots cannot interrupt a victory, damage or upgrade cue.
 if voice==null:
  if cue in ["shot","hit","flipper"]:return
  for candidate in voices:
   if str(candidate.get_meta("cue","")) in ["shot","hit","collect","flipper"]:voice=candidate;break
 if voice==null:voice=voices[0]
 variation=(variation+1)%5
 voice.pitch_scale=1.0 if cue in ["win","upgrade","merge","turn"] else 0.97+variation*0.015
 voice.volume_db=-14 if cue=="shot" else -10
 voice.set_meta("cue",cue);voice.stream=streams[cue];voice.play()

func toggle_mute() -> void:
 muted=not muted
 if muted:
  for voice in voices:voice.stop()

func build_cue(spec: Array, cue: String = "") -> AudioStreamWAV:
 var samples=PackedByteArray()
 var count=int(spec[0]*SAMPLE_RATE);samples.resize(count*2)
 var noise=RandomNumberGenerator.new();noise.seed=417+profile.hash()
 var phase=0.0
 var smooth_noise=0.0
 var chord=cue in ["collect","upgrade","merge","win","heal","turn"]
 var notes=[1.0,1.25,1.5,2.0] if cue!="turn" else [1.0,1.5]
 for i in range(count):
  var t=float(i)/count
  var sec=float(i)/SAMPLE_RATE
  var frequency=lerpf(spec[1],spec[2],t)
  if chord:frequency=spec[1]*notes[mini(notes.size()-1,int(t*notes.size()))]
  phase+=TAU*frequency*theme_pitch/SAMPLE_RATE
  var envelope=minf(1.0,sec/0.006)*pow(1-t,1.6 if chord else 2.6)
  var material=float(spec[5])
  var tone=sin(phase)+0.24*sin(phase*(2.0+material*0.2))*exp(-t*4)+0.10*sin(phase*3)*exp(-t*9)
  if chord:tone+=sin(phase*0.5)*0.18
  smooth_noise=lerpf(smooth_noise,noise.randf_range(-1,1),0.24)
  var transient=exp(-sec*65)*noise.randf_range(-1,1)*float(spec[4])*0.5
  var value=envelope*(float(spec[3])*tone+float(spec[4])*smooth_noise)+transient
  samples.encode_s16(i*2,int(clampf(value,-0.65,0.65)*32767))
 var stream=AudioStreamWAV.new();stream.format=AudioStreamWAV.FORMAT_16_BITS;stream.mix_rate=SAMPLE_RATE;stream.data=samples
 return stream
