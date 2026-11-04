extends "res://shared/base.gd"
var player := Vector2(180,485)
var enemies: Array = []
var shots: Array = []
var hostile: Array = []
var gems: Array = []
var cooldown := 0.0
var spawn_time := 0.0
var bomb_time := 0.0
var boss_hp := 0.0
var boss_max := 1.0
var boss_active := false
var boss_clock := 0.0
var gems_count := 0
var drag_pointer := -99
var drag_target := Vector2(180,480)
var drag_active := false
var shield_cool := 0.0

func cooldown_seconds(key: String) -> float:
 return shield_cool if key=="primary" else bomb_time if key=="secondary" else 0.0

func cooldown_ratio(key: String) -> float:
 return cooldown_seconds(key)/(5.0 if key=="primary" else 8.0)

func field_begin(_at: Vector2, pointer: int) -> void:
 if not drag_active:drag_pointer=pointer;drag_target=player;drag_active=true

func field_motion(_at: Vector2, relative: Vector2, pointer: int) -> void:
 if drag_active and pointer==drag_pointer:drag_target=(drag_target+relative*1.15).clamp(Vector2(22,280),Vector2(338,548))

func field_end(_at: Vector2, pointer: int) -> void:
 if pointer==drag_pointer:drag_active=false

func clear_input() -> void:
 super.clear_input();drag_active=false

func reset_game() -> void:
 player=Vector2(180,480); enemies.clear();shots.clear();hostile.clear();gems.clear()
 drag_target=player;drag_active=false;shield_cool=0
 cooldown=0;spawn_time=0.8;bomb_time=0;boss_active=false;boss_clock=0;gems_count=0

func stats() -> String:
 return "RUNE %d   BOSS IN %ds" % [gems_count,maxi(0,25-int(elapsed))] if not boss_active else "GUARDIAN  %d / %d" % [maxi(0,int(boss_hp)),int(boss_max)]

func controls() -> Array:
 return [["SHIELD","primary",shield_cool<=0],["BURST","secondary",bomb_time<=0]]

func field_press(at: Vector2) -> void:
 pass # Touch-down anchors relative movement; it must never teleport the ship.

func mode_action(name: String) -> void:
 if phase!="play":return
 if name=="primary":
  if shield_cool>0:return
  shield_cool=5;invuln=1.6;audio.play("block")
 elif name=="secondary":
  if bomb_time>0:return
  bomb_time=8;invuln=maxf(invuln,0.4)
 else:return
 hostile.clear()
 if name=="secondary":
  boss_hp-=8+power*2
  for e in enemies: e.hp-=4+power
 audio.play("flare" if name=="secondary" else "block");burst(player,accent,25);feedback(player,"BURST" if name=="secondary" else "SHIELD",accent,0.08)

func tick(dt: float) -> void:
 if drag_active:player=player.move_toward(drag_target,850*dt)
 shield_cool=maxf(0,shield_cool-dt)
 trail(player+Vector2(0,17),accent)
 player=(player+move_vector()*230*dt).clamp(Vector2(22,280),Vector2(338,548))
 cooldown-=dt;spawn_time-=dt;bomb_time=maxf(0,bomb_time-dt)
 if cooldown<=0:
  cooldown=maxf(0.11,0.24-power*0.008)
  for k in range(-mini(2,int(power/3)),mini(2,int(power/3))+1): shots.append({"p":player,"v":Vector2(k*65,-460)})
  audio.play("shot")
 if not boss_active and elapsed>=25:
  boss_active=true;boss_max=50+stage*16;boss_hp=boss_max;audio.play("elite");toast("GUARDIAN APPROACHING")
 if not boss_active and spawn_time<=0:
  spawn_time=maxf(0.35,1.15-stage*0.04)
  enemies.append({"p":Vector2(rng.randf_range(35,325),105),"hp":2+int(stage/3),"t":rng.randf()*2})
 var boss=Vector2(180+sin(elapsed*0.7)*90,165)
 if boss_active:
  boss_clock-=dt
  if boss_clock<=0:
   boss_clock=maxf(0.38,0.95-stage*0.03)
   var aim=(player-boss).angle()
   for k in range(-3,4):hostile.append({"p":boss,"v":Vector2.from_angle(aim+k*0.2)*minf(240,110+stage*6)})
 for e in enemies:
  e.p.y+=dt*45;e.p.x+=sin(e.t*2)*dt*26;e.t+=dt
  if int(e.t*0.7)!=int((e.t-dt)*0.7):hostile.append({"p":e.p,"v":(player-e.p).normalized()*145})
  if e.p.distance_to(player)<27: hurt();e.hp=0
 for i in range(shots.size()-1,-1,-1):
  var b=shots[i];b.p+=b.v*dt;var remove=b.p.y<95
  if boss_active and b.p.distance_to(boss)<39:boss_hp-=1+power*0.2;feedback(b.p,"",accent);audio.play("hit");remove=true
  for e in enemies:
   if e.p.distance_to(b.p)<22:e.hp-=1+power*0.2;feedback(b.p,"",accent);audio.play("hit");remove=true;break
  if remove:shots.remove_at(i)
 for i in range(hostile.size()-1,-1,-1):
  var b=hostile[i];b.p+=b.v*dt
  if b.p.distance_to(player)<10:hurt();hostile.remove_at(i)
  elif b.p.y>565 or b.p.x<0 or b.p.x>360:hostile.remove_at(i)
 for i in range(enemies.size()-1,-1,-1):
  if enemies[i].hp<=0:
   score+=100;gems.append(enemies[i].p);burst(enemies[i].p,accent);audio.play("kill");enemies.remove_at(i)
  elif enemies[i].p.y>560:enemies.remove_at(i)
 for i in range(gems.size()-1,-1,-1):
  gems[i].y+=dt*75
  if gems[i].distance_to(player)<110:gems[i]=gems[i].move_toward(player,dt*210)
  if gems[i].distance_to(player)<26:
   score+=80;gems_count+=1;gems.remove_at(i);audio.play("collect");feedback(player,"+RUNE",accent)
   if gems_count%3==0:power+=1;toast("RUNE LEVEL UP / FIREPOWER +1");audio.play("upgrade")
  elif gems[i].y>565:gems.remove_at(i)
 if boss_active and boss_hp<=0:score+=1000;finish(true)

func world_draw() -> void:
 for i in range(16):
  draw_rect(Rect2((i*73)%360,100+fmod(i*41+elapsed*35,460),2,7),accent.darkened(0.4))
 for e in enemies:sprite(1,e.p,Vector2(48,48))
 for g in gems:sprite(3,g,Vector2(28,28))
 for b in shots:draw_line(b.p,b.p+Vector2(0,12),accent,3)
 for b in hostile:draw_circle(b.p,5,Color("ff8e9c"));draw_circle(b.p,2,Color.WHITE)
 if boss_active:
  sprite(2,Vector2(180+sin(elapsed*0.7)*90,165),Vector2(105,105))
  draw_rect(Rect2(30,94,300,5),Color("422335"))
  draw_rect(Rect2(30,94,300*maxf(0,boss_hp/boss_max),5),Color("ff758d"))
 actor(0,player,Vector2(58,58),Vector2(sin(clock*3)*25,-80))
 draw_circle(player,3,Color.WHITE)
 if invuln>0:draw_arc(player,32,0,TAU,32,accent,2)

func interaction_state() -> Dictionary:
 var state=super.interaction_state()
 state.merge({"x":snappedf(player.x,0.1),"y":snappedf(player.y,0.1),"shield_cool":shield_cool,"burst_cool":bomb_time})
 return state
