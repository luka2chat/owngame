extends SceneTree
## Render the actual runtime samples for listening, without a running game.
func _initialize() -> void:
 call_deferred("run")
func run() -> void:
 var sound=load("res://shared/sound.gd").new();root.add_child(sound)
 var pcm=PackedByteArray()
 var silence=PackedByteArray();silence.resize(6600)
 for cue in ["jump","land","dash","shot","hit","kill","hurt","collect","bounce","bumper","flipper","wood","stone","build","merge","select","card","turn","block","heal","flare","elite","win","loss"]:
  print("AUDIO_CUE ",cue," offset=",float(pcm.size())/44100)
  pcm.append_array(sound.streams[cue].data);pcm.append_array(silence)
 var stream=AudioStreamWAV.new();stream.format=AudioStreamWAV.FORMAT_16_BITS;stream.mix_rate=22050;stream.data=pcm
 var args=OS.get_cmdline_user_args()
 if args.is_empty():push_error("Pass a destination WAV after --");quit(1);return
 var result=stream.save_to_wav(args[0]);sound.queue_free();await process_frame;quit(0 if result==OK else 1)
