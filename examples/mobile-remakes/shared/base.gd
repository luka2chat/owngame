extends Node2D
## Mobile shell shared by independently editable Godot games.
var cfg: Dictionary
var phase := "title"
var stage := 1
var score := 0
var best := 0
var unlocked := 1
var hp := 5
var power := 1
var elapsed := 0.0
var clock := 0.0
var invuln := 0.0
var notice := ""
var notice_time := 0.0
var buttons: Array = []
var particles: Array = []
var stick := Vector2.ZERO
var stick_id := -1
var stick_origin := Vector2(70, 636)
var touches := {}
var persist_enabled := true
var rng := RandomNumberGenerator.new()
var accent := Color("62e6cf")
var font: Font = ThemeDB.fallback_font
var audio: Node
var atlas: Texture2D
var backdrop: Texture2D
var atlas_row := 0
var shake := 0.0
var effects: Array = []
var actor_spring := 0.0
var button_pulses := {}
var screen_offset := Vector2.ZERO
var field_pointers := {}
var impact_pause := 0.0
var damage_flash := 0.0
var touch_icons: Texture2D
var touch_hud = preload("res://shared/touch_hud.gd").new()
var control_motion := {}
var control_cooldowns := {}
var ready_pulses := {}
var pending_controls := {}

func held(key: String) -> bool:
 return key in touches.values() or (key=="primary" and Input.is_physical_key_pressed(KEY_SPACE))

func feedback(at: Vector2, label: String = "", color: Color = Color.WHITE, strength: float = 0.0) -> void:
 if effects.size()>=48:effects.pop_front()
 effects.append({"p":at,"label":label,"color":color,"life":0.65,"total":0.65})
 shake=maxf(shake,strength)

func spring(amount: float = 1.0) -> void:
 actor_spring=amount

func actor(index: int, at: Vector2, size: Vector2, motion: Vector2 = Vector2.ZERO, flip: bool = false) -> void:
 var stretch=clampf(-motion.y/1800.0,-0.10,0.13)+actor_spring*0.17
 var bob=sin(clock*17)*minf(absf(motion.x)/150.0,1.0)*1.5
 var tint=Color(1,0.50,0.45) if damage_flash>0 else Color(1,1,1,0.75 if invuln>0 and int(clock*12)%2==0 else 1.0)
 sprite(index,at+Vector2(0,bob),size*Vector2(1-stretch,1+stretch),flip,tint)

func trail(at: Vector2, color: Color) -> void:
 if particles.size()<160:particles.append({"p":at,"v":Vector2.ZERO,"t":0.16,"c":Color(color,0.45)})

func field_begin(at: Vector2, _pointer: int) -> void:
 field_press(at)

func field_motion(_at: Vector2, _relative: Vector2, _pointer: int) -> void:
 pass

func field_end(_at: Vector2, _pointer: int) -> void:
 pass

func action_release(_name: String) -> void:
 pass

func cooldown_ratio(_key: String) -> float:
 return 0.0

func control_hint() -> String:
 return str(cfg.get("control_hint",""))

func _ready() -> void:
 cfg = JSON.parse_string(FileAccess.get_file_as_string("res://config.json"))
 accent = Color(cfg.get("accent", "62e6cf"))
 atlas = load("res://shared/assets/" + cfg.get("atlas", "arcade") + ".png")
 backdrop = load("res://shared/assets/backdrops.png")
 atlas_row = int(cfg.get("row", 0))
 touch_icons = load("res://shared/assets/touch-icons.png")
 if ResourceLoader.exists("res://shared/assets/ui.ttf"):
  font = load("res://shared/assets/ui.ttf")
 audio = preload("res://shared/sound.gd").new()
 audio.profile = str(cfg.mode)
 audio.theme_pitch = 0.82 + float(int(cfg.get("seed",42)) % 9) * 0.055
 add_child(audio)
 rng.seed = int(cfg.get("seed", 41))
 if persist_enabled and FileAccess.file_exists("user://progress.json"):
  var data = JSON.parse_string(FileAccess.get_file_as_string("user://progress.json"))
  if data is Dictionary:
   best = clampi(int(data.get("best", 0)), 0, 1000000000)
   unlocked = clampi(int(data.get("stage", 1)), 1, 100000)
 reset_game()
 queue_redraw()
 print("MOBILE_READY ", cfg.id)

func reset_game() -> void:
 pass

func start_run() -> void:
 stage = 1
 power = 1
 score = 0
 hp = 5
 elapsed = 0
 invuln = 0
 particles.clear()
 effects.clear()
 actor_spring=0
 impact_pause=0
 damage_flash=0
 clear_input()
 reset_game()
 phase = "play"
 queue_redraw()
 audio.play("upgrade")

func next_stage() -> void:
 stage += 1
 power += 1
 hp = mini(hp + 1, 5)
 elapsed = 0
 clear_input()
 reset_game()
 phase = "play"
 toast("STAGE %d  /  POWER +1" % stage)

func save_progress() -> void:
 best = maxi(best, score)
 unlocked = maxi(unlocked, stage)
 if not persist_enabled: return
 var file = FileAccess.open("user://progress.tmp", FileAccess.WRITE)
 if file:
  file.store_string(JSON.stringify({"version": 1, "best": best, "stage": unlocked}))
  file.close()
  DirAccess.rename_absolute(ProjectSettings.globalize_path("user://progress.tmp"), ProjectSettings.globalize_path("user://progress.json"))

func finish(won: bool) -> void:
 if phase != "play": return
 phase = "clear" if won else "over"
 clear_input()
 save_progress()
 audio.play("win" if won else "loss")

func hurt(amount: int = 1) -> void:
 if invuln > 0 or phase != "play": return
 hp -= amount
 damage_flash=0.18
 invuln = 1.3
 shake = 0.2
 audio.play("hurt")
 feedback(Vector2(180,350),"-%d"%amount,Color("ff7978"),0.18)
 if hp <= 0: finish(false)

func toast(message: String) -> void:
 notice = message
 notice_time = 2.3

func burst(at: Vector2, color: Color, count: int = 12) -> void:
 for i in range(count):
  if particles.size() >= 160: break
  particles.append({"p": at, "v": Vector2.from_angle(rng.randf() * TAU) * rng.randf_range(20, 100), "t": 0.5, "c": color})

func _process(dt: float) -> void:
 dt = minf(dt, 0.05)
 clock += dt
 notice_time = maxf(0, notice_time - dt)
 damage_flash=maxf(0,damage_flash-dt)
 shake = maxf(0, shake - dt)
 screen_offset=Vector2(sin(clock*101),cos(clock*127))*minf(4,shake*22)
 actor_spring=move_toward(actor_spring,0,dt*7)
 for key in button_pulses:button_pulses[key]=maxf(0,button_pulses[key]-dt)
 for key in ready_pulses:ready_pulses[key]=maxf(0,ready_pulses[key]-dt)
 for key in control_motion:
  var target=1.0 if held(key) else 0.0
  control_motion[key]=lerpf(control_motion[key],target,1-exp(-dt*22))
 for i in range(effects.size()-1,-1,-1):
  effects[i].life-=dt
  if effects[i].life<=0:effects.remove_at(i)
 if phase == "play":
  elapsed += dt
  invuln = maxf(0, invuln - dt)
  if impact_pause<=0:tick(dt)
  impact_pause=maxf(0,impact_pause-dt)
 for i in range(particles.size() - 1, -1, -1):
  particles[i].p += particles[i].v * dt
  particles[i].t -= dt
  if particles[i].t <= 0: particles.remove_at(i)
 queue_redraw()

func tick(_dt: float) -> void:
 pass

func controls() -> Array:
 return []

func stats() -> String:
 return ""

func world_draw() -> void:
 pass

func mode_action(_name: String) -> void:
 pass

func field_press(_at: Vector2) -> void:
 pass

func clear_input() -> void:
 stick = Vector2.ZERO
 stick_id = -1
 touches.clear()
 field_pointers.clear()
 pending_controls.clear()

func move_vector() -> Vector2:
 var keys = Vector2(float(Input.is_physical_key_pressed(KEY_D)) - float(Input.is_physical_key_pressed(KEY_A)), float(Input.is_physical_key_pressed(KEY_S)) - float(Input.is_physical_key_pressed(KEY_W)))
 var pad=Vector2(float(held("right"))-float(held("left")),0)
 return (stick + keys + pad).limit_length()

func interaction_state() -> Dictionary:
 return {"phase":phase,"stage":stage,"hp":hp,"score":score}

func input_receipt(label: String) -> void:
 print("MOBILE_INPUT ",cfg.id," ",label," ",JSON.stringify(interaction_state()))

func action(name: String) -> void:
 var previous_phase=phase
 button_pulses[name]=0.32
 match name:
  "start", "retry": start_run()
  "next": next_stage()
  "pause":
   phase = "pause"
   clear_input()
  "resume":
   phase = "play"
   clear_input()
  "home":
   save_progress()
   phase = "title"
   clear_input()
  "sound": audio.toggle_mute()
  "left", "right": pass
  _: mode_action(name)
 if phase=="play" and name not in ["left","right"]:input_receipt(name)
 if previous_phase!=phase: print("MOBILE_STATE ",cfg.id," ",phase)
 queue_redraw()

func _notification(what: int) -> void:
 if what == NOTIFICATION_APPLICATION_FOCUS_OUT and phase == "play":
  phase = "pause"
  clear_input()

func _input(event: InputEvent) -> void:
 if event is InputEventKey:
  if not event.pressed:
   if event.physical_keycode==KEY_SPACE:action_release("primary")
   return
  if event.echo:return
  if event.physical_keycode==KEY_ESCAPE:
   if phase in ["pause","play"]:action("resume" if phase=="pause" else "pause")
  elif event.physical_keycode==KEY_SPACE:
   if phase=="title":action("start")
   elif phase=="play":action("primary")
  elif event.physical_keycode==KEY_E and phase=="play":action("secondary")
 var at:=Vector2.ZERO
 var pressed:=false
 var pointer:=-2
 var is_tap:=false
 var is_drag:=false
 if event is InputEventScreenTouch:
  at=event.position;pressed=event.pressed;pointer=event.index;is_tap=true
 elif event is InputEventMouseButton and event.button_index==MOUSE_BUTTON_LEFT:
  at=event.position;pressed=event.pressed;is_tap=true
 elif event is InputEventScreenDrag:
  at=event.position;pointer=event.index;is_drag=true
 elif event is InputEventMouseMotion:
  at=event.position;is_drag=true
 if is_drag and pending_controls.has(pointer):
  var pending=pending_controls[pointer]
  if not control_contains(pending,at):
   pending_controls.erase(pointer)
   touches.erase(pointer)
 if is_drag and phase=="play":
  if pointer==stick_id:
   var displacement=at-stick_origin
   if cfg.get("horizontal_pad",false):displacement.y=0
   # Floating base follows the thumb beyond its travel; no edge deadlock.
   if displacement.length()>48:stick_origin+=displacement-displacement.limit_length(48)
   stick=(displacement/36.0).limit_length()
   if displacement.length()<4:stick=Vector2.ZERO
  if field_pointers.has(pointer):
   var delta:Vector2=at-field_pointers[pointer]
   field_pointers[pointer]=at
   field_motion(at,delta,pointer)
 if not is_tap:return
 if not pressed:
  var released=str(touches.get(pointer,""))
  touches.erase(pointer)
  if pending_controls.has(pointer):
   var pending=pending_controls[pointer]
   pending_controls.erase(pointer)
   for b in buttons:
    if b.action==pending.action and b.get("context","")==pending.get("context","") and b.get("enabled",true) and control_contains(b,at):
     action(b.action)
     break
  if not held(released):action_release(released)
  if pointer==stick_id:stick=Vector2.ZERO;stick_id=-1;input_receipt("move_release")
  if field_pointers.has(pointer):field_pointers.erase(pointer);field_end(at,pointer);input_receipt("field_release")
  return
 # Modal UI must not allow touches through to gameplay.
 for b in buttons:
  if control_contains(b,at):
   if not b.get("enabled",true):return
   touches[pointer]=b.action
   if b.get("release",false):pending_controls[pointer]=b.duplicate()
   else:action(b.action)
   return
 if phase!="play":return
 if (cfg.get("stick",true) or cfg.get("horizontal_pad",false)) and at.y>570 and at.x<170 and stick_id==-1:
  stick_id=pointer;stick_origin=at;stick=Vector2.ZERO
 else:
  field_pointers[pointer]=at
  field_begin(at,pointer)
 queue_redraw()

func control_contains(control: Dictionary, at: Vector2) -> bool:
 return control.rect.has_point(at) and (not control.has("radius") or at.distance_to(control.center)<=control.radius)

func text_at(label: String, at: Vector2, size: int = 16, color: Color = Color.WHITE) -> void:
 draw_string(font, at, label, HORIZONTAL_ALIGNMENT_LEFT, -1, size, color)

func centered(label: String, y: float, size: int = 20, color: Color = Color.WHITE) -> void:
 var fitted=mini(size,int(332/maxf(1,font.get_string_size(label,HORIZONTAL_ALIGNMENT_LEFT,-1,size).x)*size))
 text_at(label, Vector2((360 - font.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, fitted).x) / 2, y), fitted, color)

func panel(rect: Rect2, color: Color = Color("142735")) -> void:
 draw_style_box(box(color), rect)

func box(color: Color) -> StyleBoxFlat:
 var s = StyleBoxFlat.new()
 s.bg_color = color
 s.border_color = color.lightened(0.18)
 s.set_border_width_all(2)
 s.set_corner_radius_all(10)
 return s

func button(label: String, rect: Rect2, key: String, active: bool = true) -> void:
 var pressed=held(key) or float(button_pulses.get(key,0))>0
 var face=rect.grow(-2) if pressed else rect
 panel(face, accent.darkened(0.40 if pressed else 0.68) if active else Color("202b38"))
 var remaining=clampf(cooldown_ratio(key),0,1)
 if remaining>0:
  draw_rect(Rect2(face.position+Vector2(3,face.size.y-7),Vector2((face.size.x-6)*(1-remaining),4)),accent)
  text_at("%.1fs"%cooldown_seconds(key),face.position+Vector2(8,face.size.y-14),11,accent)
 var width = font.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, 16).x
 text_at(label, rect.position + Vector2((rect.size.x - width) / 2, rect.size.y / 2 + 6), 16, Color.WHITE if active else Color("84949e"))
 buttons.append({"rect":rect,"action":key,"enabled":active})

func cooldown_seconds(_key: String) -> float:
 return 0.0

func sprite(index: int, at: Vector2, size: Vector2 = Vector2(48,48), flip: bool = false, tint: Color = Color.WHITE) -> void:
 if not atlas: return
 var cell = atlas.get_size() / 4
 var source = Rect2(Vector2(index % 4, atlas_row + int(index / 4)) * cell, cell)
 var rect = Rect2(at - size / 2, size)
 if flip: rect.position.x += size.x; rect.size.x = -size.x
 draw_texture_rect_region(atlas, rect, source, tint)

func _draw() -> void:
 buttons.clear()
 draw_rect(Rect2(0,0,360,720), Color("091420"))
 if backdrop:
  var cell=backdrop.get_size()/3
  var index=int(cfg.get("backdrop",0))
  draw_texture_rect_region(backdrop,Rect2(0,84,360,636),Rect2(Vector2(index%3,int(index/3))*cell,cell))
  draw_rect(Rect2(0,84,360,636),Color(0.02,0.04,0.08,0.20))
 draw_set_transform(screen_offset)
 world_draw()
 for p in particles:
  draw_rect(Rect2(p.p,Vector2(3,3)), Color(p.c,clampf(p.t*2,0,1)))
 for effect in effects:
  var progress=1-effect.life/effect.total
  var color=Color(effect.color,1-progress)
  draw_arc(effect.p,8+progress*35,0,TAU,24,color,2)
  text_at(effect.label,effect.p+Vector2(-15,-20-progress*32),16,color)
 draw_set_transform(Vector2.ZERO)
 draw_rect(Rect2(0,0,360,84),Color("091420"))
 panel(Rect2(8,8,344,76),Color("101e2e"))
 text_at(cfg.get("short", "ARCADE"), Vector2(18,31),18,accent)
 text_at("STAGE %02d   %06d" % [stage,score],Vector2(18,56),16)
 text_at(stats(),Vector2(18,75),12,Color("a5b9c9"))
 for i in range(5):
  draw_rect(Rect2(222+i*10,48,7,9),Color("ff7978") if i<hp else Color("394655"))
 # Keep the action below the mobile container's top-right capsule.
 touch_hud.pause_button(self)
 touch_hud.draw(self)
 if notice_time>0 and phase=="play":
  panel(Rect2(15,86,330,27),Color("253644"))
  centered(notice,104,12,accent)
 if phase != "play": draw_overlay()

func centered_hint(label: String, at: Vector2) -> void:
 var w = font.get_string_size(label,HORIZONTAL_ALIGNMENT_LEFT,-1,12).x
 text_at(label,at-Vector2(w/2,0),12,Color("8da6bc"))

func draw_overlay() -> void:
 buttons.clear()
 draw_rect(Rect2(0,0,360,720),Color(0.02,0.04,0.08,0.87))
 panel(Rect2(18,113,324,476),Color("122536"))
 sprite(0,Vector2(180,177),Vector2(94,94))
 var heading = cfg.get("short","ARCADE")
 if phase=="clear": heading="STAGE CLEAR"
 elif phase=="over": heading="TRY AGAIN"
 elif phase=="pause": heading="PAUSED"
 centered(heading,252,25,accent)
 centered(cfg.get("subtitle","MOBILE ARCADE"),278,14,Color("a5b9c9"))
 if phase == "title":
  var lines = cfg.get("help",[])
  for i in range(lines.size()): centered(lines[i],318+i*25,14)
  centered("BEST %d  /  STAGE %d" % [best,unlocked],414,14,accent)
  button("START",Rect2(48,443,264,56),"start")
 elif phase == "pause":
  centered("Take a breath. Your run is safe.",328,14)
  button("RESUME",Rect2(48,370,264,56),"resume")
  button("TITLE",Rect2(48,438,264,50),"home")
 else:
  centered("SCORE %d" % score,325,24)
  centered("Power grows with every stage.",357,14)
  button("NEXT / POWER +1" if phase=="clear" else "RETRY",Rect2(39,397,282,59),"next" if phase=="clear" else "retry")
  button("TITLE",Rect2(48,468,264,44),"home")
 button("SOUND OFF" if audio.muted else "SOUND ON",Rect2(91,527,178,42),"sound")
