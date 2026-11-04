extends "res://shared/base.gd"
var player := Vector2(450,650)
var camera := Vector2.ZERO
var resources: Array = []
var beasts: Array = []
var wood := 0
var ore := 0
var trophies := 0
var gear := 0
var stamina := 100.0
var attack_cool := 0.0
var roll := 0.0
var facing := Vector2.UP
var camp := Vector2(450,650)
var attack_flash := 0.0
var kills := 0
var target_kind := ""
var target_index := -1

func cooldown_seconds(key: String) -> float:
 return attack_cool if key=="primary" else roll if key=="secondary" else 0.0

func cooldown_ratio(key: String) -> float:
 return cooldown_seconds(key)/(0.34 if key=="primary" else 0.3)

func acquire_target() -> void:
 target_index=-1;target_kind=""
 var nearest=85.0
 for i in range(beasts.size()):
  var d=player.distance_to(beasts[i].p)
  if d<nearest:nearest=d;target_index=i;target_kind="beast"
 if target_index>=0:return
 nearest=70
 for i in range(resources.size()):
  var d=player.distance_to(resources[i].p)
  if resources[i].hp>0 and d<nearest:nearest=d;target_index=i;target_kind="resource"


func reset_game() -> void:
 player=camp;camera=player-Vector2(180,400);resources.clear();beasts.clear();wood=0;ore=0;trophies=0;gear=0;stamina=100;attack_cool=0;roll=0;kills=0
 for i in range(16):
  resources.append({"p":Vector2(110+(i%4)*185,140+int(i/4)*150),"kind":i%2,"hp":3,"timer":0.0})
 for i in range(4):
  var at=Vector2(150+(i%2)*570,180+int(i/2)*310)
  beasts.append({"p":at,"home":at,"hp":24+stage*6,"max":24+stage*6,"state":"idle","timer":1.0,"aim":Vector2.ZERO,"boss":i==3})

func stats() -> String:
 return "WOOD %d   ORE %d   GEAR %d   STA %d" % [wood,ore,gear,int(stamina)]

func controls() -> Array:
 var label="ATTACK"
 if target_kind=="resource" and target_index>=0:label="CHOP" if resources[target_index].kind==0 else "MINE"
 return [[label,"primary"],["ROLL","secondary",stamina>=25 and roll<=0]]

func mode_action(name: String) -> void:
 if phase!="play":return
 if name in ["craft","heal"] and player.distance_to(camp)>=80:return
 if name=="craft":
  var cost=3+gear*2
  if wood>=cost and ore>=cost and gear<3:
   wood-=cost;ore-=cost;gear+=1;audio.play("merge");feedback(Vector2(180,400),"GEAR +1",accent);toast("GEAR UP: MORE DAMAGE")
  else:toast("NEED %d WOOD + %d ORE"%[cost,cost])
 elif name=="heal":
  if trophies>0 and hp<5:trophies-=1;hp=mini(5,hp+2);audio.play("upgrade")
 elif name=="secondary" and stamina>=25 and roll<=0:
  stamina-=25;roll=0.3;invuln=0.3;spring(0.8);audio.play("dash")
 elif name=="primary" and attack_cool<=0:
  attack_cool=0.34;attack_flash=0.2;acquire_target()
  if target_index<0:audio.play("dash");return
  if target_kind=="beast":
   var b=beasts[target_index];facing=(b.p-player).normalized()
   b.hp-=4+gear*5+power
   burst(b.p-camera,accent,6);feedback(b.p-camera,"-%d"%(4+gear*5+power),Color("ffeab1"),0.07)
   impact_pause=0.025;audio.play("hit")
  else:
   var resource=resources[target_index];facing=(resource.p-player).normalized()
   resource.hp-=1+int(gear/2);audio.play("wood" if resource.kind==0 else "stone")
   feedback(resource.p-camera,"",accent);burst(resource.p-camera,Color("c89e65") if resource.kind==0 else Color("acd4ed"),5)
   if resource.hp<=0:
    if resource.kind==0:wood+=3
    else:ore+=3
    feedback(resource.p-camera,"+3 WOOD" if resource.kind==0 else "+3 ORE",accent)
    resource.timer=25;score+=50;audio.play("collect")

func tick(dt: float) -> void:
 attack_cool=maxf(0,attack_cool-dt);attack_flash=maxf(0,attack_flash-dt);roll=maxf(0,roll-dt);stamina=minf(100,stamina+24*dt)
 acquire_target()
 if held("primary") and attack_cool<=0 and roll<=0:mode_action("primary")
 if roll>0:trail(Vector2(180,400),accent)
 var move=move_vector()
 if move.length()>0.2:facing=move.normalized()
 player+=(facing*380 if roll>0 else move*135)*dt
 player=player.clamp(Vector2(35,35),Vector2(865,820));camera=player-Vector2(180,400)
 for r in resources:
  if r.hp<=0:
   r.timer-=dt
   if r.timer<=0:r.hp=3
 for b in beasts:
  b.timer-=dt
  var distance=player.distance_to(b.p)
  match b.state:
   "idle":
    if distance<230 and b.timer<=0:b.state="windup";b.timer=1.0;b.aim=player
    elif distance>60 and distance<230:b.p=b.p.move_toward(player,dt*35)
   "windup":
    if b.timer<=0:b.state="charge";b.timer=0.55
   "charge":
    b.p=b.p.move_toward(b.aim,dt*310)
    if distance<35:hurt(2 if b.boss else 1)
    if b.timer<=0:b.state="rest";b.timer=1.7
   "rest":
    if b.timer<=0:b.state="idle";b.timer=0.6
 for i in range(beasts.size()-1,-1,-1):
  if beasts[i].hp<=0:
   trophies+=1;kills+=1;score+=400;burst(beasts[i].p-camera,accent,20);beasts.remove_at(i);audio.play("win")
 acquire_target()
 if beasts.is_empty() and player.distance_to(camp)<65:finish(true)

func world_draw() -> void:
 var at=camp-camera
 draw_circle(at,48,accent.darkened(0.8));draw_arc(at,48,0,TAU,32,accent,2)
 text_at("CAMP",at+Vector2(-22,6),15,accent)
 for r in resources:
  var p=r.p-camera
  if p.x<-60 or p.x>420 or p.y<60 or p.y>610:continue
  if r.hp>0:sprite(2+r.kind,p,Vector2(75,75))
  else:draw_circle(p,8,Color("4b5340"))
 for b in beasts:
  var p=b.p-camera
  if b.state=="windup":
   draw_line(p,b.aim-camera,Color(1,0.3,0.2,0.5),28)
   draw_arc(b.aim-camera,35,0,TAU,32,Color("ff9676"),2)
  sprite(1,p,Vector2(90,90) if b.boss else Vector2(63,63),player.x<b.p.x)
  draw_rect(Rect2(p-Vector2(28,42),Vector2(56*maxf(0,float(b.hp)/b.max),4)),Color("ff7978"))
 actor(0,Vector2(180,400),Vector2(55,55),move_vector()*150,facing.x<0)
 if target_index>=0:
  var target=beasts[target_index] if target_kind=="beast" else resources[target_index]
  var p=target.p-camera
  draw_arc(p,34,clock*2,clock*2+TAU*0.8,24,accent,2)
  if target_kind=="resource":
   for i in range(3):draw_circle(p+Vector2(-8+i*8,-42),2,accent if i<target.hp else Color("394655"))
 if attack_flash>0:
  var sweep=facing.angle()-1.2+(1-attack_flash/0.2)*2.4
  draw_arc(Vector2(180,400),67,sweep-0.6,sweep+0.2,16,Color("ffeab1"),4)
 draw_rect(Rect2(150,439,60,3),Color("273c48"))
 draw_rect(Rect2(150,439,60*stamina/100,3),accent)
 if player.distance_to(camp)<80:
  button("FORGE %d+%d"%[3+gear*2,3+gear*2],Rect2(18,104,159,45),"craft",phase=="play" and gear<3 and wood>=3+gear*2 and ore>=3+gear*2)
  button("COOK / %d"%trophies,Rect2(188,104,154,45),"heal",phase=="play" and trophies>0)
 centered("HUNT %d/4  /  RETURN TO CAMP"%kills,564,13,accent)

func interaction_state() -> Dictionary:
 var state=super.interaction_state()
 state.merge({"wood":wood,"ore":ore,"gear":gear,"stamina":stamina,"target":target_kind,"x":player.x,"y":player.y})
 return state
