extends Node2D

const W = 360.0
const H = 640.0
const START_BUTTON = Rect2(48, 457, 264, 68)
const SOUND_BUTTON = Rect2(246, 52, 110, 44)
const BEACON_CHARGE = 12
const Sound = preload("res://sound.gd")
var rng := RandomNumberGenerator.new()
var state := "title"
var hero := Vector2(180, 340)
var enemies: Array = []
var shots: Array = []
var gems: Array = []
var sparks: Array = []
var elapsed := 0.0
var spawn_clock := 0.0
var shot_clock := 0.0
var invincible := 0.0
var hp := 100.0
var level := 1
var xp := 0
var xp_needed := 5
var kills := 0
var damage := 18.0
var fire_rate := 0.65
var speed := 120.0
var magnet := 45.0
var extra := 0
var charge := 0
var flare := 0.0
var next_elite := 45.0
var walk_phase := 0.0
var facing := 1.0
var sound := Sound.new()
var touch_id := -1
var touch_origin := Vector2.ZERO
var touch_pos := Vector2.ZERO
var choices: Array = []
var art: Texture2D
var arena: Texture2D
var font: Font

func _ready() -> void:
 rng.randomize()
 font = ThemeDB.fallback_font
 add_child(sound)
 if ResourceLoader.exists("res://assets/sprites.png"):
  art = load("res://assets/sprites.png")
 if ResourceLoader.exists("res://assets/arena.png"):
  arena = load("res://assets/arena.png")
 queue_redraw()

func start_game() -> void:
 state = "play"
 hero = Vector2(180, 340)
 enemies.clear(); shots.clear(); gems.clear(); sparks.clear()
 elapsed = 0; spawn_clock = 0; shot_clock = 0; invincible = 0
 hp = 100; level = 1; xp = 0; xp_needed = 5; kills = 0
 damage = 18; fire_rate = 0.65; speed = 120; magnet = 54; extra = 0
 charge = 0; flare = 0; next_elite = 45
 walk_phase = 0; facing = 1
 touch_id = -1
 sound.play("collect")

func _input(event: InputEvent) -> void:
 if event is InputEventScreenTouch:
  if event.pressed:
   handle_press(event.position, event.index)
  elif event.index == touch_id:
   touch_id = -1
 elif event is InputEventScreenDrag and event.index == touch_id:
  touch_pos = event.position
 elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
  if event.pressed: handle_press(event.position, 999)
  elif touch_id == 999: touch_id = -1
 elif event is InputEventMouseMotion and touch_id == 999:
  touch_pos = event.position

func _notification(what: int) -> void:
 if what == NOTIFICATION_APPLICATION_FOCUS_OUT or what == NOTIFICATION_APPLICATION_PAUSED:
  touch_id = -1

func handle_press(pos: Vector2, id: int) -> void:
 if SOUND_BUTTON.has_point(pos):
  sound.toggle_mute()
  queue_redraw()
  return
 if state == "title" or state == "over" or state == "win":
  if START_BUTTON.has_point(pos): start_game()
 elif state == "upgrade":
  for i in range(3):
   if Rect2(28, 220 + i * 93, 304, 76).has_point(pos):
    apply_upgrade(choices[i]); state = "play"; sound.play("collect"); break
 elif state == "play" and touch_id == -1:
  touch_id = id; touch_origin = pos; touch_pos = pos

func _process(delta: float) -> void:
 if state != "play":
  return
 var dt = min(delta, 0.05)
 elapsed += dt
 flare = maxf(0.0, flare - dt)
 invincible = max(0.0, invincible - dt)
 var direction = Vector2.ZERO
 if touch_id != -1:
  direction = (touch_pos - touch_origin).limit_length(45.0) / 45.0
 direction += Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")
 if direction.length_squared() > 0.04:
  walk_phase += dt * 18.0
  if absf(direction.x) > 0.15: facing = signf(direction.x)
 else:
  walk_phase = 0
 hero += direction.limit_length(1.0) * speed * dt
 hero = hero.clamp(Vector2(18, 102), Vector2(342, 615))
 spawn_clock -= dt
 if elapsed >= next_elite:
  spawn_enemy(true)
  sound.play("elite")
  next_elite += 45.0
 if spawn_clock <= 0:
  spawn_enemy()
  spawn_clock = max(0.19, 1.0 - elapsed * 0.004)
 shot_clock -= dt
 if shot_clock <= 0 and not enemies.is_empty():
  fire(); shot_clock = fire_rate
 for e in enemies:
  var toward: Vector2 = (hero - e.pos).normalized()
  e.pos += toward * e.speed * dt
  if e.pos.distance_to(hero) < e.radius + 9 and invincible <= 0:
   hp -= e.hit; invincible = 0.65
   sound.play("hurt")
   emit_sparks(hero, Color("ff8b78"), 8)
 for s in shots:
  s.pos += s.vel * dt; s.life -= dt
  for e in enemies:
   if s.pos.distance_to(e.pos) < e.radius + 5:
    e.hp -= damage
    e.flash = 0.10
    emit_sparks(s.pos, Color("ffd695"), 4)
    s.life = 0
    break
 for e in enemies.duplicate():
  if e.hp <= 0:
   kills += 1
   sound.play("kill")
   emit_sparks(e.pos, Color("ad8ae6"), 8)
   gems.append({"pos":e.pos, "value":2 if e.boss else 1})
   enemies.erase(e)
 for s in shots.duplicate():
  if s.life <= 0: shots.erase(s)
 for g in gems.duplicate():
  var dist: float = g.pos.distance_to(hero)
  if dist < magnet: g.pos += (hero - g.pos).normalized() * 200 * dt
  if dist < 13:
   xp += g.value
   charge += g.value
   sound.play("collect")
   emit_sparks(hero, Color("6ce5d2"), 4)
   gems.erase(g)
 if charge >= BEACON_CHARGE:
  charge -= BEACON_CHARGE
  flare = 0.5
  sound.play("flare")
  for e in enemies:
   if e.pos.distance_to(hero) <= 112:
    e.hp -= damage * 2.5
 if xp >= xp_needed:
  xp -= xp_needed; level += 1; xp_needed = 4 + level * 2
  choose_upgrades(); state = "upgrade"; touch_id = -1
  sound.play("upgrade")
 if hp <= 0:
  state = "over"; touch_id = -1
  sound.play("loss")
 elif elapsed >= 180:
  state = "win"; touch_id = -1
  sound.play("win")
 for e in enemies:
  e.flash = maxf(0.0, e.get("flash", 0.0) - dt)
 for i in range(sparks.size() - 1, -1, -1):
  var spark: Dictionary = sparks[i]
  spark.pos += spark.vel * dt
  spark.life -= dt
  if spark.life <= 0.0:
   sparks.remove_at(i)
 queue_redraw()

func emit_sparks(pos: Vector2, color: Color, count: int) -> void:
 for i in range(count):
  if sparks.size() >= 160: return
  var velocity := Vector2.from_angle(rng.randf_range(0, TAU)) * rng.randf_range(25, 105)
  sparks.append({"pos":pos, "vel":velocity, "life":rng.randf_range(0.14, 0.34), "color":color})

func spawn_enemy(boss := false) -> void:
 var side = rng.randi_range(0, 3)
 var p = Vector2.ZERO
 match side:
  0: p = Vector2(rng.randf_range(0,W), 95)
  1: p = Vector2(rng.randf_range(0,W), H + 10)
  2: p = Vector2(-12, rng.randf_range(100,H))
  _: p = Vector2(W + 12, rng.randf_range(100,H))
 var crab = rng.randf() < 0.35
 var enemy_hp = 85.0 + elapsed * 0.35 if boss else (23.0 if crab else 14.0) + elapsed * 0.08
 var enemy_speed = 32.0 if boss else (32.0 if crab else 49.0) + elapsed * 0.13
 enemies.append({"pos":p, "hp":enemy_hp, "speed":enemy_speed, "radius":(17.0 if boss else 11.0), "hit":(19.0 if boss else 9.0), "boss":boss, "crab":crab})

func fire() -> void:
 sound.play("shot")
 var sorted = enemies.duplicate()
 sorted.sort_custom(func(a,b): return a.pos.distance_squared_to(hero) < b.pos.distance_squared_to(hero))
 for i in range(min(1 + extra, sorted.size())):
  var dir: Vector2 = (sorted[i].pos - hero).normalized()
  shots.append({"pos":hero, "vel":dir * 260.0, "life":1.8})

func choose_upgrades() -> void:
 var pool = ["POWER", "HASTE", "BOOTS", "MAGNET", "HEAL", "LANTERNS"]
 pool.shuffle(); choices = pool.slice(0, 3)

func apply_upgrade(kind: String) -> void:
 match kind:
  "POWER": damage += 8
  "HASTE": fire_rate = max(0.22, fire_rate * 0.83)
  "BOOTS": speed += 20
  "MAGNET": magnet += 28
  "HEAL": hp = min(100.0, hp + 35)
  "LANTERNS": extra = min(extra + 1, 4)

func label(t: String, pos: Vector2, size: int, color := Color.WHITE) -> void:
 draw_string(font, pos, t, HORIZONTAL_ALIGNMENT_LEFT, -1, size, color)

func sprite(cell: int, pos: Vector2, size: float, tint := Color.WHITE, flip := false) -> void:
 if art:
  var cell_size = Vector2(art.get_width() / 3.0, art.get_height() / 2.0)
  var source = Rect2(Vector2(cell % 3, int(cell / 3)) * cell_size, cell_size)
  var target := Rect2(pos - Vector2.ONE * size / 2, Vector2.ONE * size)
  if flip:
   target.size.x = -target.size.x
  draw_texture_rect_region(art, target, source, tint)
 else:
  draw_circle(pos, size * 0.22, [Color.TURQUOISE, Color.MEDIUM_PURPLE, Color.INDIAN_RED, Color.AQUA, Color.GOLD, Color.DARK_SLATE_BLUE][cell])

func _draw() -> void:
 draw_rect(Rect2(0,0,W,H), Color("101d2c"))
 if arena:
  draw_texture_rect(arena, Rect2(0, 0, W, H), false)
 if state != "title":
  for g in gems:
   sprite(3, g.pos + Vector2(0, sin(elapsed * 5.0 + g.pos.x) * 2), 24)
  for e in enemies:
   var bob := sin(elapsed * (10.0 if e.crab else 6.0) + e.pos.x) * 2.0
   var tint := Color(1.6, 1.5, 1.4) if e.get("flash", 0.0) > 0 else Color.WHITE
   sprite(5 if e.boss else (2 if e.crab else 1), e.pos + Vector2(0,bob), 56 if e.boss else 38, tint)
  for s in shots:
   draw_line(s.pos - s.vel.normalized() * 10, s.pos, Color("eaa85a"), 2)
   sprite(4, s.pos, 24)
  for spark in sparks:
   var color: Color = spark.color
   color.a = minf(1.0, spark.life * 5.0)
   draw_rect(Rect2(spark.pos.round(), Vector2(3, 3)), color)
  if flare > 0:
   var radius = lerpf(20.0, 112.0, 1.0 - flare / 0.5)
   draw_arc(hero, radius, 0, TAU, 48, Color(1.0, 0.82, 0.42, flare * 1.8), 4)
  var hero_tint := Color("ffb19a") if invincible > 0.50 else Color.WHITE
  sprite(0, hero + Vector2(0, -absf(sin(walk_phase)) * 3), 50, hero_tint, facing < 0)
  if touch_id != -1 and state == "play":
   draw_circle(touch_origin, 34, Color(0.5,0.85,0.85,0.18)); draw_circle(touch_origin + (touch_pos-touch_origin).limit_length(28), 13, Color(0.6,0.95,0.9,0.55))
  draw_rect(Rect2(0,0,360,90),Color("0b1522"))
  label("MIDNIGHT BEACON",Vector2(14,23),14,Color("f4dc9b"))
  label("%02d:%02d" % [int(elapsed)/60,int(elapsed)%60],Vector2(275,23),16)
  draw_rect(Rect2(14,34,210,9),Color("472d3a")); draw_rect(Rect2(14,34,210 * max(hp,0)/100,9),Color("ef7973"))
  draw_rect(Rect2(14,52,210,7),Color("253b4e")); draw_rect(Rect2(14,52,210.0*xp/xp_needed,7),Color("6ce5d2"))
  label("FLARE",Vector2(248,48),11,Color("f4dc9b"))
  draw_rect(Rect2(248,52,98,7),Color("473f37")); draw_rect(Rect2(248,52,98.0 * charge / BEACON_CHARGE,7),Color("eab95e"))
  label("LV %d   DEFEATED %d" % [level,kills],Vector2(14,78),13,Color("b1cbd0"))
  if state == "play" and elapsed >= next_elite - 3.0 and next_elite < 180:
   draw_rect(Rect2(59, 100, 242, 28), Color("332332"))
   label("SOMETHING IN THE FOG", Vector2(85, 119), 13, Color("f5b8a2"))
 if state == "title":
  sprite(0,Vector2(180,260),180)
  label("MIDNIGHT",Vector2(69,105),35,Color("f6dea1"))
  label("BEACON",Vector2(92,145),35,Color("6ce5d2"))
  label("Survive the sea fog for 3 minutes.",Vector2(47,383),15)
  label("Drag to move. Your lantern fires itself.",Vector2(38,410),14,Color("a9c4c9"))
  label("Collect crystals to charge a flare.",Vector2(67,433),14,Color("f4dc9b"))
  button(START_BUTTON,"LIGHT THE BEACON")
 elif state == "upgrade":
  draw_rect(Rect2(0,90,W,550),Color(0.02,0.06,0.1,0.88))
  label("CHOOSE A GIFT",Vector2(75,174),25,Color("f6dea1"))
  for i in range(3):
   var descriptions = {"POWER":"Lantern damage +8", "HASTE":"Fire faster", "BOOTS":"Move faster", "MAGNET":"Collect from farther away", "HEAL":"Restore 35 health", "LANTERNS":"Fire at one more enemy"}
   var box = Rect2(28,220+i*93,304,76)
   draw_rect(box,Color("263d49")); draw_rect(box,Color("83c9be"),false,2)
   label(choices[i],box.position+Vector2(16,27),18,Color("f6dea1")); label(descriptions[choices[i]],box.position+Vector2(16,53),14,Color("c5d9d4"))
 elif state == "over" or state == "win":
  draw_rect(Rect2(0,90,W,550),Color(0.02,0.06,0.1,0.90))
  label("DAWN BREAKS" if state == "win" else "THE LIGHT FADES",Vector2(47,230),27,Color("f6dea1"))
  label("Survived %02d:%02d" % [int(elapsed)/60,int(elapsed)%60],Vector2(103,290),18)
  label("%d creatures defeated   /   Level %d" % [kills,level],Vector2(42,326),15,Color("a9c4c9"))
  button(START_BUTTON,"KEEP THE LIGHT AGAIN")
 draw_rect(Rect2(253, 62, 93, 25), Color("263d49"))
 label("SOUND OFF" if sound.muted else "SOUND ON", Vector2(263, 79), 11, Color("b1cbd0"))

func button(rect: Rect2, text: String) -> void:
 draw_rect(rect,Color("deb968")); draw_rect(rect.grow(-4),Color("324b4a"))
 label(text,rect.position+Vector2(29,42),16,Color("fff0bf"))
