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
const STAGE_SECONDS = 45.0
const MAX_ENEMIES = 64
const GIFTS = {
 "POWER":"Lantern damage +25%",
 "HASTE":"Shoot more quickly",
 "BOOTS":"Move speed +15",
 "MAGNET":"Pickup range +24",
 "HEART":"Max health +25; recover 25",
 "LANTERNS":"Aim at one more enemy",
 "ARMOR":"Reduce each hit by 2",
 "REGEN":"Recover health every second",
 "STORM":"Periodic lightning strikes",
 "HALO":"Burn nearby enemies",
 "FLARE":"Stronger, wider crystal burst",
 "FORTUNE":"More crystals and healing drops"
}
const LOCATIONS = ["SALT QUAY", "GHOST REEF", "CORAL VAULT", "ABYSS GATE"]
var stage := 1
var stage_time := 0.0
var boss_spawned := false
var stage_reward := false
var ranks := {}
var max_hp := 100.0
var armor := 0.0
var regen := 0.0
var storm_clock := 0.0
var halo_clock := 0.0
var hostile: Array = []
var loot: Array = []
var bolts: Array = []
var loot_art: Texture2D
var best_stage := 1
var persist_enabled := true
var saved_run := {}
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
 if persist_enabled and FileAccess.file_exists("user://beacon-best.txt"):
  best_stage = maxi(1, FileAccess.get_file_as_string("user://beacon-best.txt").to_int())
 if persist_enabled and FileAccess.file_exists("user://beacon-run.json"):
  var parsed = JSON.parse_string(FileAccess.get_file_as_string("user://beacon-run.json"))
  if valid_checkpoint(parsed): saved_run = parsed
 add_child(sound)
 if ResourceLoader.exists("res://assets/sprites.png"):
  art = load("res://assets/sprites.png")
 if ResourceLoader.exists("res://assets/arena.png"):
  arena = load("res://assets/arena.png")
 if ResourceLoader.exists("res://assets/relics.png"):
  loot_art = load("res://assets/relics.png")
 queue_redraw()

func start_game() -> void:
 state = "play"
 hero = Vector2(180, 340)
 enemies.clear(); shots.clear(); gems.clear(); sparks.clear()
 elapsed = 0; spawn_clock = 0; shot_clock = 0; invincible = 0
 hp = 100; level = 1; xp = 0; xp_needed = 5; kills = 0
 damage = 18; fire_rate = 0.65; speed = 120; magnet = 54; extra = 0
 charge = 0; flare = 0
 stage = 1; stage_time = 0; boss_spawned = false; stage_reward = false
 max_hp = 100; armor = 0; regen = 0; ranks.clear()
 hostile.clear(); loot.clear(); bolts.clear()
 storm_clock = 1; halo_clock = 0
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
 if state == "title" and Rect2(90, 536, 180, 44).has_point(pos) and not saved_run.is_empty():
  saved_run.clear()
  write_checkpoint({})
  start_game()
  return
 if state == "title" or state == "over":
  if START_BUTTON.has_point(pos):
   var resume = saved_run.duplicate(true) if state == "title" else {}
   start_game()
   if not resume.is_empty():
    stage = int(resume.stage)
    for key in checkpoint_keys(): set(key, resume[key])
    ranks = resume.ranks.duplicate()
 elif state == "upgrade":
  for i in range(3):
   if Rect2(28, 220 + i * 93, 304, 76).has_point(pos):
    apply_upgrade(choices[i])
    if stage_reward: advance_stage()
    state = "play"
    sound.play("collect")
    queue_redraw()
    break
 elif state == "play" and touch_id == -1:
  touch_id = id; touch_origin = pos; touch_pos = pos

func _process(delta: float) -> void:
 if state != "play":
  return
 var dt = min(delta, 0.05)
 elapsed += dt
 stage_time += dt
 hp = minf(max_hp, hp + regen * dt)
 update_relics(dt)
 if hp <= 0:
  state = "over"
  saved_run.clear()
  write_checkpoint({})
  touch_id = -1
  sound.play("loss")
  queue_redraw()
  return
 if state != "play":
  queue_redraw()
  return
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
 hero = hero.clamp(Vector2(18, 102), Vector2(342, 590))
 spawn_clock -= dt
 if stage_time >= STAGE_SECONDS and not boss_spawned:
  spawn_enemy(true)
  boss_spawned = true
  sound.play("elite")
 if spawn_clock <= 0:
  spawn_enemy()
  spawn_clock = maxf(0.16, 1.15 / (1.0 + stage * 0.15))
 shot_clock -= dt
 if shot_clock <= 0 and not enemies.is_empty():
  fire(); shot_clock = fire_rate
 for e in enemies:
  var toward: Vector2 = (hero - e.pos).normalized()
  update_enemy(e, toward, dt)
  if e.boss:
   e.pos = e.pos.clamp(Vector2(28, 140), Vector2(332, 590))
  if e.pos.distance_to(hero) < e.radius + 9 and invincible <= 0:
   hp -= maxf(1.0, e.hit - armor); invincible = 0.65
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
   drop_crystal(e.pos, (4 + stage) if e.boss else 1 + int(stage / 3) + int(ranks.get("FORTUNE", 0)))
   if e.boss:
    loot.append({"pos":e.pos, "kind":4})
   elif loot.size() < 12 and rng.randf() < 0.05 + minf(0.12, ranks.get("FORTUNE", 0) * 0.015):
    loot.append({"pos":e.pos, "kind":3 if rng.randf() < 0.7 else 5})
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
   if e.pos.distance_to(hero) <= flare_radius():
    e.hp -= damage * (2.5 + ranks.get("FLARE", 0) * 0.6)
 if xp >= xp_needed and state == "play":
  xp -= xp_needed; level += 1; xp_needed = 4 + level * 2
  choose_upgrades(); state = "upgrade"; touch_id = -1
  sound.play("upgrade")
 if hp <= 0:
  state = "over"; touch_id = -1
  saved_run.clear()
  write_checkpoint({})
  sound.play("loss")
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
 if not boss and enemies.size() >= MAX_ENEMIES:
  return
 var side = rng.randi_range(0, 3)
 var p = Vector2.ZERO
 match side:
  0: p = Vector2(rng.randf_range(0,W), 95)
  1: p = Vector2(rng.randf_range(0,W), H + 10)
  2: p = Vector2(-12, rng.randf_range(100,H))
  _: p = Vector2(W + 12, rng.randf_range(100,H))
 var kind = rng.randi_range(0, mini(3, int((stage + 1) / 2)))
 var crab = kind == 1
 var strength = pow(float(stage), 1.22)
 var enemy_hp = (90.0 + 42.0 * strength) if boss else (20.0 if crab else 12.0) * (1.0 + strength * 0.32)
 if stage % 4 == 3: enemy_hp *= 1.35
 var enemy_speed = (28.0 if boss else (30.0 if crab else 43.0)) + minf(48.0, stage * 2.0)
 if stage % 4 == 0: enemy_speed *= 1.15
 enemies.append({"pos":p, "hp":enemy_hp, "max_hp":enemy_hp,
  "speed":enemy_speed, "radius":(22.0 if boss else 12.0),
  "hit":(18.0 if boss else 8.0) + stage * 1.5, "boss":boss, "crab":crab,
  "kind":kind, "cooldown":rng.randf_range(1.5, 3.0), "windup":0.0,
  "dash":Vector2.ZERO, "flash":0.0})

func fire() -> void:
 sound.play("shot")
 var sorted = enemies.duplicate()
 sorted.sort_custom(func(a,b): return a.pos.distance_squared_to(hero) < b.pos.distance_squared_to(hero))
 for i in range(min(1 + extra, sorted.size())):
  var dir: Vector2 = (sorted[i].pos - hero).normalized()
  shots.append({"pos":hero, "vel":dir * 260.0, "life":1.8})

func choose_upgrades() -> void:
 var pool = GIFTS.keys()
 pool.shuffle()
 choices = pool.slice(0, 3)

func apply_upgrade(kind: String) -> void:
 ranks[kind] = int(ranks.get(kind, 0)) + 1
 match kind:
  "POWER": damage *= 1.25
  "HASTE":
   if fire_rate > 0.23: fire_rate = maxf(0.22, fire_rate * 0.85)
   else: damage *= 1.12
  "BOOTS":
   if speed < 190: speed = minf(190, speed + 15)
   else: armor += 2
  "MAGNET":
   if magnet < 180: magnet = minf(180, magnet + 24)
   else: damage *= 1.12
  "HEART":
   max_hp += 25
   hp = minf(max_hp, hp + 25)
  "LANTERNS":
   if extra < 5: extra += 1
   else: damage *= 1.2
  "ARMOR": armor += 2
  "REGEN": regen += 0.5

func gift_description(kind: String) -> String:
 if kind == "HASTE" and fire_rate <= 0.23: return "Lantern damage +12%"
 if kind == "BOOTS" and speed >= 190: return "Armor +2"
 if kind == "MAGNET" and magnet >= 180: return "Lantern damage +12%"
 if kind == "LANTERNS" and extra >= 5: return "Lantern damage +20%"
 return GIFTS[kind]

func flare_radius() -> float:
 return minf(220.0, 112.0 + ranks.get("FLARE", 0) * 12)

func drop_crystal(pos: Vector2, value: int) -> void:
 if gems.size() >= 80:
  gems[0].value += value
 else:
  gems.append({"pos":pos, "value":value})

func advance_stage() -> void:
 stage += 1
 stage_time = 0
 boss_spawned = false
 stage_reward = false
 enemies.clear()
 shots.clear()
 hostile.clear()
 loot.clear()
 for gem in gems: xp += gem.value
 gems.clear()
 hp = minf(max_hp, hp + max_hp * 0.2)
 invincible = 2.0
 spawn_clock = 1.0
 if stage > best_stage:
  best_stage = stage
  if persist_enabled:
   var file = FileAccess.open("user://beacon-best.txt", FileAccess.WRITE)
   if file: file.store_string(str(best_stage))
 saved_run = {"stage":stage, "ranks":ranks.duplicate()}
 for key in checkpoint_keys(): saved_run[key] = get(key)
 write_checkpoint(saved_run)

func checkpoint_keys() -> Array:
 return ["hp", "max_hp", "level", "xp", "xp_needed", "damage", "fire_rate", "speed", "magnet", "extra", "armor", "regen", "elapsed", "kills"]

func valid_checkpoint(data: Variant) -> bool:
 if not data is Dictionary or not data.get("ranks") is Dictionary:
  return false
 if not data.get("stage") is float and not data.get("stage") is int: return false
 if data.stage < 1 or data.stage > 1000000: return false
 for key in checkpoint_keys():
  var value = data.get(key)
  if not value is float and not value is int: return false
  if not is_finite(float(value)) or value < 0 or value > 1e30: return false
 if data.max_hp < 1 or data.hp < 1 or data.xp_needed < 1 or data.fire_rate < 0.1: return false
 for key in data.ranks:
  if not GIFTS.has(key): return false
  var value = data.ranks[key]
  if not value is float and not value is int: return false
  if not is_finite(float(value)) or value < 0 or value > 1000000: return false
 return true

func write_checkpoint(data: Dictionary) -> void:
 if not persist_enabled: return
 var file = FileAccess.open("user://beacon-run.tmp", FileAccess.WRITE)
 if file:
  file.store_string(JSON.stringify(data))
  file.close()
  DirAccess.rename_absolute(ProjectSettings.globalize_path("user://beacon-run.tmp"), ProjectSettings.globalize_path("user://beacon-run.json"))

func update_enemy(e: Dictionary, toward: Vector2, dt: float) -> void:
 var kind: int = e.get("kind", 0)
 if kind == 2 or e.boss:
  var distance: float = e.pos.distance_to(hero)
  if distance > 160: e.pos += toward * e.speed * dt
  elif distance < 110: e.pos -= toward * e.speed * dt * 0.45
  e.cooldown = e.get("cooldown", 2.0) - dt
  if e.cooldown <= 0 and hostile.size() < 72:
   var count = 5 if e.boss else 1
   for i in range(count):
    var angle = (float(i) - (count - 1) / 2.0) * 0.22
    hostile.append({"pos":e.pos, "vel":toward.rotated(angle) * (70 + minf(65, stage * 3)), "life":6.0})
   e.cooldown = maxf(1.4, 3.5 - stage * 0.05)
 elif kind == 3:
  e.cooldown -= dt
  if e.cooldown <= 0:
   e.cooldown = 3.5
   e.windup = 0.65
   e.dash = toward
  if e.windup > 0:
   e.windup -= dt
  elif e.cooldown > 2.2:
   e.pos += e.dash * e.speed * 2.8 * dt
  else: e.pos += toward * e.speed * dt
 else:
  e.pos += toward * e.speed * dt

func update_relics(dt: float) -> void:
 for bolt in bolts: bolt.life -= dt
 bolts = bolts.filter(func(b): return b.life > 0)
 for bullet in hostile:
  bullet.pos += bullet.vel * dt
  bullet.life -= dt
  if bullet.pos.distance_to(hero) < 12 and invincible <= 0:
   hp -= maxf(1.0, 7.0 + stage * 1.5 - armor)
   invincible = 0.65
   bullet.life = 0
   sound.play("hurt")
 hostile = hostile.filter(func(b): return b.life > 0)
 for item in loot.duplicate():
  if hp <= 0: break
  if item.pos.distance_to(hero) < 24:
   loot.erase(item)
   sound.play("upgrade")
   if item.kind == 4:
    stage_reward = true
    choose_upgrades()
    state = "upgrade"
    touch_id = -1
   elif item.kind == 3: hp = minf(max_hp, hp + max_hp * 0.25)
   else: invincible = 5.0
 storm_clock -= dt
 if storm_clock <= 0:
  storm_clock = 2.2
  var count = mini(int(ranks.get("STORM", 0)), 6)
  for i in range(mini(count, enemies.size())):
   var enemy: Dictionary = enemies[i]
   enemy.hp -= damage * (1.0 + ranks.get("STORM", 0) * 0.35)
   bolts.append({"from":hero, "to":enemy.pos, "life":0.18})
  if count > 0 and not enemies.is_empty(): sound.play("flare")
 halo_clock -= dt
 if halo_clock <= 0:
  halo_clock = 0.5
  for enemy in enemies:
   if enemy.pos.distance_to(hero) < 60 and ranks.get("HALO", 0) > 0:
    enemy.hp -= damage * 0.3 * ranks.HALO
    enemy.flash = 0.1

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
  var palettes = [Color.WHITE, Color("c4b9e5"), Color("d9c1a1"), Color("a0c9ce")]
  draw_texture_rect(arena, Rect2(0, 0, W, H), false, palettes[(stage - 1) % 4])
 if state != "title":
  for g in gems:
   sprite(3, g.pos + Vector2(0, sin(elapsed * 5.0 + g.pos.x) * 2), 24)
  for e in enemies:
   var bob := sin(elapsed * (10.0 if e.crab else 6.0) + e.pos.x) * 2.0
   var tint := Color(1.6, 1.5, 1.4) if e.get("flash", 0.0) > 0 else Color.WHITE
   if e.boss or e.get("kind", 0) >= 2:
    relic_sprite(2 if e.boss else e.kind - 2, e.pos + Vector2(0, bob), 88 if e.boss else 52)
   else:
    sprite(2 if e.crab else 1, e.pos + Vector2(0, bob), 48, tint)
   if e.get("windup", 0.0) > 0:
    draw_line(e.pos, e.pos + e.dash * 100, Color("ffbf69"), 3)
   if e.boss:
    draw_rect(Rect2(e.pos + Vector2(-30,-37), Vector2(60,4)), Color("442b42"))
    draw_rect(Rect2(e.pos + Vector2(-30,-37), Vector2(60 * maxf(0, e.hp) / e.max_hp,4)), Color("ed8b79"))
  for item in loot:
   draw_arc(item.pos, 20 + sin(elapsed * 5) * 2, 0, TAU, 24, Color("f6dea1"), 1)
   relic_sprite(item.kind, item.pos, 48)
  for bullet in hostile:
   draw_circle(bullet.pos, 5, Color("ee668b"))
   draw_circle(bullet.pos, 2, Color("ffe7a9"))
  for bolt in bolts:
   draw_line(bolt.from, (bolt.from + bolt.to) / 2 + Vector2(9,-8), Color("9ef5ff"), 3)
   draw_line((bolt.from + bolt.to) / 2 + Vector2(9,-8), bolt.to, Color("9ef5ff"), 3)
  if ranks.get("HALO", 0) > 0:
   draw_arc(hero, 60, elapsed, elapsed + TAU * 0.85, 40, Color(0.5, 0.95, 0.8, 0.5), 2)
  if invincible > 0:
   draw_arc(hero, 23, 0, TAU, 32, Color("a0e9ed"), 2)
  for s in shots:
   draw_line(s.pos - s.vel.normalized() * 10, s.pos, Color("eaa85a"), 2)
   sprite(4, s.pos, 24)
  for spark in sparks:
   var color: Color = spark.color
   color.a = minf(1.0, spark.life * 5.0)
   draw_rect(Rect2(spark.pos.round(), Vector2(3, 3)), color)
  if flare > 0:
   var radius = lerpf(20.0, flare_radius(), 1.0 - flare / 0.5)
   draw_arc(hero, radius, 0, TAU, 48, Color(1.0, 0.82, 0.42, flare * 1.8), 4)
  var hero_tint := Color("ffb19a") if invincible > 0.50 else Color.WHITE
  sprite(0, hero + Vector2(0, -absf(sin(walk_phase)) * 3), 70, hero_tint, facing < 0)
  if touch_id != -1 and state == "play":
   draw_circle(touch_origin, 34, Color(0.5,0.85,0.85,0.18)); draw_circle(touch_origin + (touch_pos-touch_origin).limit_length(28), 13, Color(0.6,0.95,0.9,0.55))
  draw_rect(Rect2(0,0,360,90),Color("0b1522"))
  label("STAGE %d  %s" % [stage, LOCATIONS[(stage - 1) % 4]],Vector2(14,23),12,Color("f4dc9b"))
  label("%02d:%02d" % [int(elapsed)/60,int(elapsed)%60],Vector2(275,23),16)
  draw_rect(Rect2(14,34,210,9),Color("472d3a")); draw_rect(Rect2(14,34,210 * max(hp,0)/max_hp,9),Color("ef7973"))
  draw_rect(Rect2(14,52,210,7),Color("253b4e")); draw_rect(Rect2(14,52,210.0 * clampf(float(xp) / xp_needed, 0, 1),7),Color("6ce5d2"))
  label("FLARE",Vector2(248,48),11,Color("f4dc9b"))
  draw_rect(Rect2(248,52,98,7),Color("473f37")); draw_rect(Rect2(248,52,98.0 * clampf(float(charge) / BEACON_CHARGE, 0, 1),7),Color("eab95e"))
  label("LV %d   DEFEATED %d" % [level,kills],Vector2(14,78),13,Color("b1cbd0"))
  if state == "play":
   var objective = "GUARDIAN IN %ds" % maxi(0, ceili(STAGE_SECONDS - stage_time))
   if boss_spawned:
    objective = "DEFEAT THE GUARDIAN"
    if not loot.filter(func(item): return item.kind == 4).is_empty(): objective = "COLLECT THE RELIC CHEST"
   draw_rect(Rect2(55, 96, 250, 25), Color(0.03,0.08,0.12,0.85))
   label(objective, Vector2(74, 113), 12, Color("f6dea1"))
   draw_rect(Rect2(0, 602, 360, 38), Color(0.03,0.08,0.12,0.9))
   label("STORM %d   HALO %d   REGEN %.1f/s" % [ranks.get("STORM",0), ranks.get("HALO",0),regen], Vector2(20,616),11,Color("85dece"))
   label("POWER %d  ARMOR %d  RELICS %d" % [int(damage), int(armor), ranks.size()], Vector2(20,632),11,Color("d3e8e2"))
 if state == "title":
  sprite(0,Vector2(180,260),180)
  label("MIDNIGHT",Vector2(69,105),35,Color("f6dea1"))
  label("BEACON",Vector2(92,145),35,Color("6ce5d2"))
  label("Endless nights. Ever stronger relics.",Vector2(47,383),15)
  label("Drag to move. Your lantern fires itself.",Vector2(38,410),14,Color("a9c4c9"))
  label("Collect crystals to charge a flare.",Vector2(67,433),14,Color("f4dc9b"))
  button(START_BUTTON,"CONTINUE STAGE %d" % int(saved_run.stage) if not saved_run.is_empty() else "LIGHT THE BEACON")
  if not saved_run.is_empty():
   button(Rect2(90,536,180,44), "NEW VOYAGE")
  label("BEST STAGE %d" % best_stage, Vector2(125, 606), 14, Color("a9c4c9"))
 elif state == "upgrade":
  draw_rect(Rect2(0,90,W,550),Color(0.02,0.06,0.1,0.88))
  label("STAGE CLEAR" if stage_reward else "CHOOSE A GIFT",Vector2(75,174),25,Color("f6dea1"))
  if stage_reward: label("Choose a relic. Next stage restores 20% HP.", Vector2(31,200),13,Color("a9c4c9"))
  for i in range(3):

   var box = Rect2(28,220+i*93,304,76)
   draw_rect(box,Color("263d49")); draw_rect(box,Color("83c9be"),false,2)
   var icon = 3 if choices[i] in ["HEART","REGEN"] else (5 if choices[i] in ["ARMOR","HALO"] else 4)
   relic_sprite(icon, box.position + Vector2(30,38), 48)
   label("%s +%d" % [choices[i], ranks.get(choices[i], 0) + 1],box.position+Vector2(58,27),18,Color("f6dea1")); label(gift_description(choices[i]),box.position+Vector2(58,53),12,Color("c5d9d4"))
 elif state == "over":
  draw_rect(Rect2(0,90,W,550),Color(0.02,0.06,0.1,0.90))
  label("THE LIGHT FADES",Vector2(47,230),27,Color("f6dea1"))
  label("Stage %d / Best %d" % [stage, maxi(stage,best_stage)],Vector2(103,290),18)
  label("%d creatures defeated   /   Level %d" % [kills,level],Vector2(42,326),15,Color("a9c4c9"))
  button(START_BUTTON,"KEEP THE LIGHT AGAIN")
 draw_rect(Rect2(253, 62, 93, 25), Color("263d49"))
 label("SOUND OFF" if sound.muted else "SOUND ON", Vector2(263, 79), 11, Color("b1cbd0"))

func button(rect: Rect2, text: String) -> void:
 draw_rect(rect,Color("deb968")); draw_rect(rect.grow(-4),Color("324b4a"))
 label(text,rect.position+Vector2(29,(rect.size.y + 16) / 2),16,Color("fff0bf"))

func relic_sprite(cell: int, pos: Vector2, size: float) -> void:
 if loot_art:
  var dimensions = Vector2(loot_art.get_width() / 3.0, loot_art.get_height() / 2.0)
  draw_texture_rect_region(loot_art, Rect2(pos - Vector2.ONE * size / 2, Vector2.ONE * size),
   Rect2(Vector2(cell % 3, int(cell / 3)) * dimensions, dimensions))
