extends Node

const SAMPLE_RATE = 22050
const CUES = {
 "shot": [0.07, 580.0, 260.0, 0.12, 0.02],
 "collect": [0.10, 720.0, 1200.0, 0.17, 0.0],
 "kill": [0.12, 210.0, 78.0, 0.18, 0.15],
 "hurt": [0.22, 180.0, 54.0, 0.28, 0.22],
 "flare": [0.48, 94.0, 430.0, 0.35, 0.18],
 "upgrade": [0.40, 350.0, 750.0, 0.24, 0.0],
 "elite": [0.55, 110.0, 48.0, 0.28, 0.17],
 "win": [0.75, 330.0, 660.0, 0.23, 0.0],
 "loss": [0.60, 220.0, 63.0, 0.24, 0.04],
}

var streams := {}
var voices: Array[AudioStreamPlayer] = []
var voice_index := 0
var muted := false

func _ready() -> void:
 for cue in CUES:
  streams[cue] = build_cue(CUES[cue])
 for i in range(10):
  var player := AudioStreamPlayer.new()
  add_child(player)
  voices.append(player)

func play(cue: String) -> void:
 if muted or voices.is_empty():
  return
 var player := voices[voice_index]
 voice_index = (voice_index + 1) % voices.size()
 player.stream = streams[cue]
 player.play()

func toggle_mute() -> void:
 muted = not muted
 if muted:
  for player in voices:
   player.stop()

func build_cue(spec: Array) -> AudioStreamWAV:
 var samples := PackedByteArray()
 var count := int(spec[0] * SAMPLE_RATE)
 samples.resize(count * 2)
 var noise := RandomNumberGenerator.new()
 noise.seed = 417
 var phase := 0.0
 for i in range(count):
  var t := float(i) / count
  phase += TAU * lerpf(spec[1], spec[2], t) / SAMPLE_RATE
  var envelope := minf(1.0, t * 40.0) * pow(1.0 - t, 2.0)
  var tone := sin(phase) + 0.24 * sin(phase * 2.01) + 0.13 * sin(phase * 3.0)
  var value: float = envelope * (spec[3] * tone + spec[4] * noise.randf_range(-1.0, 1.0))
  samples.encode_s16(i * 2, int(clampf(value, -1.0, 1.0) * 32767))
 var stream := AudioStreamWAV.new()
 stream.format = AudioStreamWAV.FORMAT_16_BITS
 stream.mix_rate = SAMPLE_RATE
 stream.data = samples
 return stream
