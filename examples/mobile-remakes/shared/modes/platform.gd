extends "res://shared/base.gd"
var player := Vector2(60,440)
var velocity := Vector2.ZERO
var camera_x := 0.0
var platforms: Array = []
var enemies: Array = []
var gems: Array = []
var bullets: Array = []
var fire_time := 0.0
var special_time := 0.0
var grounded := false
var goal_x := 1900.0
var kills := 0
var rescue := 0
var coyote := 0.0
var jump_buffer := 0.0
var dash := 0.0
var facing := 1.0
var safe_position := Vector2(60,440)
var jump_cut := false

func cooldown_seconds(key: String) -> float:
 return special_time if key=="secondary" else 0.0

func cooldown_ratio(key: String) -> float:
 return cooldown_seconds(key)/3.0

func do_jump() -> void:
 velocity.y=-470;grounded=false;coyote=0;jump_buffer=0;jump_cut=false
 spring(1);audio.play("jump");feedback(player-Vector2(camera_x,-20),"",accent)

func action_release(name: String) -> void:
 if name=="primary" and velocity.y<0:jump_cut=true

func reset_game() -> void:
 player=Vector2(60,440); velocity=Vector2.ZERO; camera_x=0
 platforms.clear(); enemies.clear(); gems.clear(); bullets.clear()
 fire_time=0; special_time=0; kills=0; rescue=0
 grounded=false;coyote=0;jump_buffer=0;dash=0;facing=1;safe_position=player;jump_cut=false
 goal_x=1600+min(stage,20)*170
 platforms.append(Rect2(-50,480,350,45))
 for i in range(1,int(goal_x/160)+1):
  var x = i*160.0+130
  var y = 470.0 - (i%3)*32
  platforms.append(Rect2(x,y,130,25))
  gems.append(Vector2(x+65,y-50))
  if i%2==0: enemies.append({"p":Vector2(x+70,y-18),"home":x+65,"hp":2+mini(stage,10),"t":0.0,"boss":false})
 platforms.append(Rect2(goal_x-50,455,310,80))
 if cfg.mode=="side": enemies.append({"p":Vector2(goal_x+95,420),"home":goal_x+95,"hp":10+stage*4,"t":0.0,"boss":true})

func stats() -> String:
 return "DIST %dm   GEMS %d   KO %d" % [int(player.x/10),rescue,kills]

func controls() -> Array:
 return [["JUMP","primary"],["BLAST" if cfg.mode=="side" else "DASH","secondary",special_time<=0]]

func mode_action(name: String) -> void:
 if phase!="play": return
 if name=="primary":
  jump_buffer=0.15
  if grounded or coyote>0:do_jump()
 if name=="secondary" and special_time<=0:
  special_time=3
  if cfg.mode=="side":
   for e in enemies:
    if absf(e.p.x-player.x)<260: e.hp-=6+power
   burst(player-Vector2(camera_x,0),accent,30);feedback(player-Vector2(camera_x,0),"BLAST",accent,0.12); audio.play("flare")
  else:
   dash=0.22;velocity.x=facing*520; invuln=0.35; audio.play("dash")

func tick(dt: float) -> void:
 special_time=maxf(0,special_time-dt)
 fire_time-=dt
 jump_buffer=maxf(0,jump_buffer-dt)
 coyote=0.12 if grounded else maxf(0,coyote-dt)
 dash=maxf(0,dash-dt)
 if jump_buffer>0 and (grounded or coyote>0):do_jump()
 var was_grounded=grounded
 var old=player
 var move=move_vector().x
 if absf(move)>0.1:facing=signf(move)
 velocity.x=facing*520 if dash>0 else move_toward(velocity.x,move*200,dt*(1600 if grounded else 900))
 if jump_cut and velocity.y< -210:velocity.y=-210;jump_cut=false
 velocity.y=minf(velocity.y+1100*dt,650)
 if dash>0:trail(player-Vector2(camera_x,0),accent)
 player+=velocity*dt
 player.x=maxf(20,player.x)
 grounded=false
 for p in platforms:
  if velocity.y>=0 and old.y+19<=p.position.y+4 and player.y+19>=p.position.y and player.x+12>p.position.x and player.x-12<p.end.x:
   player.y=p.position.y-19; velocity.y=0; grounded=true
 if grounded:
  safe_position=player
  if not was_grounded:spring(-1);audio.play("land");feedback(player-Vector2(camera_x,-18),"",accent)
  if jump_buffer>0:do_jump()
 camera_x=lerpf(camera_x,maxf(0,player.x-110+facing*18),1-exp(-dt*10))
 if player.y>580:
  hurt(); player=safe_position-Vector2(0,35); velocity=Vector2.ZERO;dash=0
 for i in range(gems.size()-1,-1,-1):
  if player.distance_to(gems[i])<34:
   feedback(gems[i]-Vector2(camera_x,0),"+100",accent);gems.remove_at(i); rescue+=1; score+=100; audio.play("collect")
 if cfg.mode=="side" and fire_time<=0:
  fire_time=0.24
  var aim=Vector2.RIGHT
  var nearest=330.0
  for e in enemies:
   var distance=player.distance_to(e.p)
   if distance<nearest and e.p.x>player.x-40:nearest=distance;aim=(e.p-player).normalized()
  bullets.append({"p":player+Vector2(15,0),"v":aim*440,"enemy":false})
 for e in enemies:
  e.t+=dt
  e.p.x=e.home+sin(e.t*1.7)*22
  if absf(e.p.x-player.x)<260 and cfg.mode=="side" and int(e.t*1.1)!=int((e.t-dt)*1.1):
   bullets.append({"p":e.p,"v":(player-e.p).normalized()*170,"enemy":true})
  if player.distance_to(e.p)<31:
   if old.y<e.p.y-19 and velocity.y>0:
    e.hp=0; velocity.y=-350; score+=100
   else: hurt()
 for i in range(bullets.size()-1,-1,-1):
  var b=bullets[i]; b.p+=b.v*dt
  var remove=absf(b.p.x-player.x)>500 or b.p.y<80 or b.p.y>600
  if b.enemy:
   if b.p.distance_to(player)<18: hurt(); remove=true
  else:
   for e in enemies:
    if e.p.distance_to(b.p)<(34 if e.boss else 23): e.hp-=1+power*0.3;feedback(e.p-Vector2(camera_x,0),"",Color("ffb966"));audio.play("hit");remove=true; break
  if remove: bullets.remove_at(i)
 for i in range(enemies.size()-1,-1,-1):
  if enemies[i].hp<=0:
   burst(enemies[i].p-Vector2(camera_x,0),Color("ffb966")); score+=200; kills+=1; enemies.remove_at(i); audio.play("kill")
 var boss_alive=false
 for e in enemies:
  if e.boss: boss_alive=true
 if player.x>goal_x+160 and not boss_alive: finish(true)
 elif player.x>goal_x+160: player.x=goal_x+160; toast("DEFEAT THE GATE GUARD")

func world_draw() -> void:
 for i in range(4):
  sprite(3,Vector2(i*130-fmod(camera_x*0.25,130),230),Vector2(170,180),false,Color(0.5,0.65,0.8,0.45))
 for p in platforms:
  var rect=Rect2(p.position-Vector2(camera_x,0),p.size)
  draw_rect(rect,Color("263f4d"));draw_rect(Rect2(rect.position,Vector2(rect.size.x,5)),accent)
 for g in gems: sprite(2,g-Vector2(camera_x,0),Vector2(30,30))
 for e in enemies:
  sprite(1,e.p-Vector2(camera_x,0),Vector2(78,78) if e.boss else Vector2(48,48))
  if e.boss: text_at("GUARD",e.p-Vector2(camera_x+25,50),12,Color("ff7978"))
 for b in bullets: draw_circle(b.p-Vector2(camera_x,0),4,Color("ff7978") if b.enemy else accent)
 actor(0,player-Vector2(camera_x,0),Vector2(52,52),velocity,facing<0)
 draw_line(Vector2(goal_x+160-camera_x,310),Vector2(goal_x+160-camera_x,455),accent,4)
 text_at("EXIT",Vector2(goal_x+123-camera_x,302),16,accent)

func interaction_state() -> Dictionary:
 var state=super.interaction_state()
 state.merge({"x":snappedf(player.x,0.1),"y":snappedf(player.y,0.1),"vy":snappedf(velocity.y,0.1),"dash":dash})
 return state
