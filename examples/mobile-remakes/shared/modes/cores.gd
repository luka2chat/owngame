extends "res://shared/base.gd"
var player := Vector2(180,0)
var velocity := Vector2.ZERO
var altitude := 0.0
var jump_velocity := 0.0
var dash_time := 0.0
var dash_cool := 0.0
var facing := Vector2.UP
var camera_y := -450.0
var islands: Array = []
var cores: Array = []
var drones: Array = []
var checkpoint := Vector2(180,0)
var collected := 0
var total := 0
var remaining := 150.0
var combo := 0
var combo_time := 0.0
var fall_time := 0.0
var jump_buffer := 0.0
var auto_hop_cool := 0.0

func cooldown_seconds(key: String) -> float:
 return dash_cool if key=="secondary" else 0.0

func cooldown_ratio(key: String) -> float:
 return cooldown_seconds(key)/1.7

func hop() -> void:
 jump_velocity=310;altitude=0.1;auto_hop_cool=0.25;jump_buffer=0
 spring(1);audio.play("jump");feedback(player-Vector2(0,camera_y),"",accent)

func reset_game() -> void:
 player=Vector2(180,0);velocity=Vector2.ZERO;altitude=0;jump_velocity=0;dash_time=0;dash_cool=0;camera_y=-450;facing=Vector2.UP
 islands.clear();cores.clear();drones.clear();checkpoint=player;collected=0;combo=0;combo_time=0;fall_time=0;remaining=150
 jump_buffer=0;auto_hop_cool=0
 total=mini(18,9+stage)
 islands.append(player)
 for i in range(1,total+1):
  var at=Vector2(180+sin(i*0.9)*85,-i*110)
  islands.append(at);cores.append(at)
  if i%3==0:drones.append({"home":at,"p":at,"phase":i*0.7})

func stats() -> String:
 return "CORES %d/%d   %ds   COMBO x%d" % [collected,total,maxi(0,int(remaining)),maxi(1,combo)]

func controls() -> Array:
 return [["JUMP","primary",altitude<=0],["DASH","secondary",dash_cool<=0]]

func mode_action(name: String) -> void:
 if phase!="play":return
 if name=="primary":
  jump_buffer=0.16
  if altitude<=0 and supported(player):hop()
 if name=="secondary" and dash_cool<=0:
  dash_cool=1.7;dash_time=0.18;invuln=0.22;audio.play("dash")

func supported(at: Vector2) -> bool:
 for island in islands:
  if island.distance_to(at)<49:return true
 return false

func tick(dt: float) -> void:
 remaining-=dt;dash_cool=maxf(0,dash_cool-dt);dash_time=maxf(0,dash_time-dt);combo_time=maxf(0,combo_time-dt)
 if combo_time<=0:combo=0
 jump_buffer=maxf(0,jump_buffer-dt);auto_hop_cool=maxf(0,auto_hop_cool-dt)
 var direction=move_vector()
 if altitude<=0 and supported(player) and auto_hop_cool<=0:
  if jump_buffer>0 or (direction.length()>0.3 and not supported(player+direction.normalized()*17)):hop()
 if direction.length()>0.2:facing=direction.normalized()
 velocity=direction*145 if dash_time<=0 else facing*400
 player+=velocity*dt;player.x=clampf(player.x,15,345)
 if dash_time>0:trail(player-Vector2(0,camera_y+altitude),accent)
 if altitude>0:
  jump_velocity-=900*dt;altitude=maxf(0,altitude+jump_velocity*dt)
  if altitude<=0 and supported(player):spring(-1);audio.play("land")
 if altitude<=0 and not supported(player):
  fall_time+=dt
  if fall_time>0.16:
   hurt();player=checkpoint;velocity=Vector2.ZERO;fall_time=0;dash_time=0;combo=0;toast("JUMP ACROSS THE GAPS")
 else:fall_time=0
 camera_y=lerpf(camera_y,player.y-430,1-exp(-dt*8))
 for i in range(cores.size()-1,-1,-1):
  if player.distance_to(cores[i])<29:
   checkpoint=cores[i];cores.remove_at(i);collected+=1;combo=mini(5,combo+1);combo_time=4
   score+=100*combo;remaining+=2;audio.play("collect");burst(player-Vector2(0,camera_y),accent)
 for drone in drones:
  drone.p=drone.home+Vector2(cos(elapsed*1.4+drone.phase)*60,sin(elapsed*1.4+drone.phase)*28)
  if drone.p.distance_to(player)<22 and altitude<23:hurt()
 if collected>=total:score+=int(remaining)*10;finish(true)
 elif remaining<=0:finish(false)

func world_draw() -> void:
 for i in range(islands.size()):
  var at=islands[i]-Vector2(0,camera_y)
  if at.y<-20 or at.y>650:continue
  sprite(3,at+Vector2(0,20),Vector2(117,104))
  draw_arc(at,49,0,TAU,32,accent.darkened(0.4),1)
 for c in cores:
  var at=c-Vector2(0,camera_y)
  if at.y>90 and at.y<570:sprite(2,at-Vector2(0,8+sin(clock*3)*3),Vector2(35,35))
 for drone in drones:
  var at=drone.p-Vector2(0,camera_y)
  if at.y>90 and at.y<560:sprite(1,at,Vector2(39,39))
 var at=player-Vector2(0,camera_y)
 draw_circle(at,12,Color(0,0,0,0.4))
 if altitude>0:
  draw_arc(at,16,0,TAU,24,accent,1)
  var landing=at+velocity*maxf(0,(jump_velocity+sqrt(jump_velocity*jump_velocity+1800*altitude))/900)
  draw_arc(landing,12,0,TAU,24,Color(accent,0.55),2)
 actor(0,at-Vector2(0,altitude+18),Vector2(49,49),Vector2(velocity.x,-jump_velocity),velocity.x<0)
 if not cores.is_empty():
  text_at("NEXT CORE",Vector2(138,110),12,accent)
  draw_line(Vector2(180,124),Vector2(174,132),accent,2);draw_line(Vector2(180,124),Vector2(186,132),accent,2)

func interaction_state() -> Dictionary:
 var state=super.interaction_state()
 state.merge({"x":player.x,"y":player.y,"altitude":altitude,"dash":dash_cool})
 return state
