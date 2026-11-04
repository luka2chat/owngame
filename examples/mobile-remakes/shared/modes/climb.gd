extends "res://shared/base.gd"
var player := Vector2(180,480)
var velocity := Vector2.ZERO
var camera_y := 0.0
var platforms: Array = []
var stars: Array = []
var height_best := 0.0
var boost := 0.0
var shield := false
var goal := 1600.0
var drag_pointer := -99
var steering := false
var target_x := 180.0

func cooldown_seconds(key: String) -> float:
 return boost if key=="primary" else 0.0

func cooldown_ratio(key: String) -> float:
 return cooldown_seconds(key)/6.0

func field_begin(_at: Vector2, pointer: int) -> void:
 if not steering:steering=true;drag_pointer=pointer;target_x=player.x

func field_motion(_at: Vector2, relative: Vector2, pointer: int) -> void:
 if steering and pointer==drag_pointer:target_x=clampf(target_x+relative.x*1.25,5,355)

func field_end(_at: Vector2, pointer: int) -> void:
 if pointer==drag_pointer:steering=false

func clear_input() -> void:
 super.clear_input();steering=false

func reset_game() -> void:
 player=Vector2(180,480);velocity=Vector2(0,-460);camera_y=0;height_best=0;boost=0;shield=false
 steering=false;target_x=180
 platforms.clear();stars.clear();goal=1500+min(stage,20)*150
 platforms.append({"p":Vector2(110,520),"w":140.0,"kind":0,"home":110.0,"used":false})
 var x=140.0
 for i in range(1,int(goal/70)+7):
  x=clampf(x+rng.randf_range(-92,92),20,245)
  platforms.append({"p":Vector2(x,520-i*70),"w":90.0,"kind":i%7,"home":x,"used":false})
  stars.append(Vector2(x+45,485-i*70))

func controls() -> Array:
 return [["BOOST","primary",boost<=0],["SHIELD","secondary",not shield and score>=150]]

func stats() -> String:
 return "HEIGHT %dm / %dm" % [int(height_best/10),int(goal/10)]

func mode_action(name: String) -> void:
 if phase!="play":return
 if name=="primary" and boost<=0:velocity.y=-620;boost=6;spring(1);feedback(player-Vector2(0,camera_y),"BOOST",accent);audio.play("dash")
 if name=="secondary" and not shield and score>=150:score-=150;shield=true;audio.play("upgrade")

func tick(dt: float) -> void:
 boost=maxf(0,boost-dt)
 var old=player
 velocity.x=clampf((target_x-player.x)*14,-330,330) if steering else move_vector().x*215;velocity.y+=950*dt;player+=velocity*dt
 player.x=wrapf(player.x,-15,375)
 for p in platforms:
  if p.kind==2:p.p.x=p.home+sin(elapsed*1.5)*35
  if not p.used and velocity.y>0 and old.y+18<=p.p.y+3 and player.y+18>=p.p.y and player.x+13>p.p.x and player.x-13<p.p.x+p.w:
   player.y=p.p.y-18;velocity.y=-560 if p.kind==4 else -430
   if p.kind==3:p.used=true
   spring(-1);feedback(player-Vector2(0,camera_y-18),"SPRING" if p.kind==4 else "",accent);audio.play("bounce")
 height_best=maxf(height_best,480-player.y)
 camera_y=minf(camera_y,player.y-300)
 for i in range(stars.size()-1,-1,-1):
  if player.distance_to(stars[i])<29:stars.remove_at(i);score+=50;audio.play("collect")
 if player.y-camera_y>570:
  if shield:shield=false;player.y=camera_y+420;velocity.y=-600;toast("SHIELD SAVED YOU")
  else:hurt(5)
 if height_best>=goal:score+=500;finish(true)

func world_draw() -> void:
 for p in platforms:
  var at=p.p-Vector2(0,camera_y)
  if at.y<90 or at.y>580 or p.used:continue
  var color=accent
  if p.kind==3:color=Color("edab79")
  elif p.kind==4:color=Color("eaec8a")
  draw_rect(Rect2(at,Vector2(p.w,12)),color)
  draw_rect(Rect2(at+Vector2(3,12),Vector2(p.w-6,8)),color.darkened(0.55))
  if p.kind==4:text_at("^^",at+Vector2(p.w/2-8,-5),14,color)
 for star in stars:
  var at=star-Vector2(0,camera_y)
  if at.y>100 and at.y<565:sprite(2,at,Vector2(26,26))
 actor(0,player-Vector2(0,camera_y),Vector2(50,50),velocity,velocity.x<0)
 if shield:draw_arc(player-Vector2(0,camera_y),29,0,TAU,32,accent,2)

func interaction_state() -> Dictionary:
 var state=super.interaction_state()
 state.merge({"x":snappedf(player.x,0.1),"height":height_best,"boost":boost})
 return state
