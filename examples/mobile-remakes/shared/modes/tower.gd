extends "res://shared/base.gd"
var route := PackedVector2Array([Vector2(25,125),Vector2(320,125),Vector2(320,255),Vector2(40,255),Vector2(40,395),Vector2(320,395),Vector2(320,515)])
var sockets := [Vector2(80,187),Vector2(170,187),Vector2(260,187),Vector2(105,326),Vector2(195,326),Vector2(275,326),Vector2(110,460),Vector2(210,460)]
var towers: Array = []
var enemies: Array = []
var beams: Array = []
var money := 120
var wave := 0
var pending := 0
var spawn_timer := 0.0
var choice := 0
var selected := -1
var build_cell := -1

func reset_game() -> void:
 towers.clear();enemies.clear();beams.clear();money=120+min(stage,12)*10;wave=0;pending=0;spawn_timer=0;choice=0;selected=-1;build_cell=-1

func stats() -> String:
 return "GOLD %d   WAVE %d / 5" % [money,wave]

func controls() -> Array:
 if build_cell>=0:return [["FROST 40","primary",money>=40],["FIRE 40","secondary",money>=40]]
 if selected>=0:
  return [["UP %d"%upgrade_cost(),"primary",money>=upgrade_cost()],["CANCEL","secondary"]]
 return [["BUILD","primary"],["NEXT WAVE","secondary",pending==0 and enemies.is_empty()]]

func upgrade_cost() -> int:
 return 35*towers[selected].level if selected>=0 else 0

func mode_action(name: String) -> void:
 if phase!="play":return
 if name=="wave":start_wave();return
 if build_cell>=0 and name in ["primary","secondary"]:
  if money<40:toast("NEED 40 GOLD");audio.play("deny");return
  choice=0 if name=="primary" else 1
  money-=40;towers.append({"cell":build_cell,"kind":choice,"level":1,"cool":0.0})
  feedback(sockets[build_cell],"BUILT",accent);burst(sockets[build_cell],accent,14)
  build_cell=-1;audio.play("build");return
 if selected>=0:
  if name=="secondary":selected=-1;audio.play("select")
  elif name=="primary" and money>=upgrade_cost():
   money-=upgrade_cost();towers[selected].level+=1
   feedback(sockets[towers[selected].cell],"LEVEL UP",accent);audio.play("merge")
  return
 if name=="primary":toast("SELECT AN EMPTY PAD TO PREVIEW")
 elif name=="secondary":start_wave()

func start_wave() -> void:
 if pending>0 or not enemies.is_empty():return
 if towers.is_empty():toast("BUILD A TOWER FIRST");audio.play("deny");return
 selected=-1;build_cell=-1;wave+=1;pending=5+wave+mini(stage,10);spawn_timer=0
 audio.play("elite");toast("WAVE %d / INCOMING"%wave)

func field_press(at: Vector2) -> void:
 var cell=-1
 for i in range(sockets.size()):
  if at.distance_to(sockets[i])<35:cell=i;break
 if cell<0:selected=-1;build_cell=-1;return
 var found=-1
 for i in range(towers.size()):
  if towers[i].cell==cell:found=i;break
 if found<0:
  build_cell=cell;selected=-1;audio.play("select")
  toast("FROST SLOWS / FIRE SPLASHES")
 elif selected>=0 and selected!=found:
  var a=towers[selected];var b=towers[found]
  if a.kind==b.kind and a.level==b.level:
   b.level+=1;feedback(sockets[b.cell],"MERGED",accent,0.08)
   towers.remove_at(selected);selected=-1;audio.play("merge");toast("MERGED! RANGE + DAMAGE UP")
  else:selected=found;toast("SELECTED / UPGRADE OR MATCH TO MERGE")
 else:
  selected=found;build_cell=-1;audio.play("select")
  toast("UPGRADE OR TAP A GLOWING MATCH")

func tick(dt: float) -> void:
 spawn_timer-=dt
 if pending>0 and spawn_timer<=0:
  pending-=1;spawn_timer=0.75
  var maximum=10+stage*3+wave*3
  enemies.append({"p":route[0],"segment":1,"hp":float(maximum),"max":maximum,"slow":0.0,"armored":pending%4==0})
 for e in enemies:
  e.slow=maxf(0,e.slow-dt)
  var speed=(34+mini(stage,20)*2)*(0.5 if e.slow>0 else 1.0)
  var target=route[e.segment]
  e.p=e.p.move_toward(target,speed*dt)
  if e.p.distance_to(target)<1:
   e.segment+=1
   if e.segment>=route.size():e.hp=-999;hp-=1;audio.play("hurt")
 for t in towers:
  t.cool-=dt
  if t.cool>0:continue
  var at=sockets[t.cell]
  for e in enemies:
   if e.hp>0 and at.distance_to(e.p)<105+t.level*15:
    var damage=(3.0 if t.kind==0 else 6.0)*pow(1.9,t.level-1)*(1+power*0.1)
    if e.armored and t.kind==0:damage*=0.7
    e.hp-=damage
    if t.kind==0:e.slow=1.3
    if t.kind==1:
     for other in enemies:
      if other!=e and other.p.distance_to(e.p)<35:other.hp-=damage*0.5
    beams.append({"a":at,"b":e.p,"t":0.15,"kind":t.kind});t.cool=0.65 if t.kind==0 else 1.05;audio.play("stone" if t.kind==0 else "hit");feedback(e.p,"",accent if t.kind==0 else Color("ffa05c"));break
 for i in range(enemies.size()-1,-1,-1):
  if enemies[i].hp<=0:
   if enemies[i].hp>-999:money+=12;score+=100;burst(enemies[i].p,accent,5)
   enemies.remove_at(i)
 for i in range(beams.size()-1,-1,-1):
  beams[i].t-=dt
  if beams[i].t<=0:beams.remove_at(i)
 if hp<=0:finish(false)
 elif wave>=5 and pending==0 and enemies.is_empty():score+=500;finish(true)

func world_draw() -> void:
 draw_polyline(route,Color("304c57"),28)
 draw_polyline(route,Color("55717a"),2)
 if build_cell>=0:
  draw_circle(sockets[build_cell],120,Color(accent,0.08))
  draw_arc(sockets[build_cell],120,0,TAU,48,Color(accent,0.4),1)
  draw_arc(sockets[build_cell],32,0,TAU,32,Color("ffd981"),3)
 if selected>=0:
  var chosen=towers[selected]
  draw_circle(sockets[chosen.cell],105+chosen.level*15,Color(accent,0.07))
  draw_arc(sockets[chosen.cell],105+chosen.level*15,0,TAU,48,Color(accent,0.4),1)
 for at in sockets:
  draw_circle(at,27,accent.darkened(0.78));draw_arc(at,27,0,TAU,24,accent.darkened(0.4),2)
 for i in range(towers.size()):
  var t=towers[i];var at=sockets[t.cell]
  var recoil=maxf(0,t.cool-(0.5 if t.kind==0 else 0.9))*35
  sprite(t.kind*2,at-Vector2(0,recoil),Vector2(56+recoil,56-recoil))
  if selected>=0 and selected!=i and towers[selected].kind==t.kind and towers[selected].level==t.level:
   draw_arc(at,32+sin(clock*5)*2,0,TAU,32,Color("ffd981"),2)
  text_at("Lv%d"%t.level,at+Vector2(-13,37),12,accent)
  if selected==i:draw_arc(at,32,0,TAU,32,Color("ffd981"),3)
 for e in enemies:
  sprite(1,e.p,Vector2(40,40),false,Color("bdb4f0") if e.armored else Color.WHITE)
  draw_rect(Rect2(e.p-Vector2(15,24),Vector2(30*maxf(0,e.hp/e.max),3)),Color("ff9694"))
 for b in beams:draw_line(b.a,b.b,accent if b.kind==0 else Color("ffa05c"),3)
 sprite(3,Vector2(320,535),Vector2(60,60))
 if pending==0 and enemies.is_empty() and not towers.is_empty():button("START WAVE %d"%(wave+1),Rect2(18,529,238,42),"wave",phase=="play")
 elif wave==0:centered("TAP AN EMPTY PAD TO PLAN YOUR DEFENSE",560,12,accent)

func interaction_state() -> Dictionary:
 var state=super.interaction_state()
 state.merge({"gold":money,"towers":towers.size(),"build_cell":build_cell,"wave":wave,"selected":selected})
 return state
