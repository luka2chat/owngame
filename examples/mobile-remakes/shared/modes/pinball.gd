extends "res://shared/base.gd"
var balls: Array = []
var bumpers := [Vector2(115,210),Vector2(245,210),Vector2(180,300),Vector2(85,365),Vector2(275,365)]
var hits := 0
var combo := 0
var combo_time := 0.0
var left_time := 0.0
var right_time := 0.0
var nova := false
var launched := false
var left_angle := 520.0
var right_angle := 520.0
var bumper_pulse := [0.0,0.0,0.0,0.0,0.0]
var save_time := 0.0

func field_begin(at: Vector2, pointer: int) -> void:
 if at.y<100:return
 var key="primary" if at.x<180 else "secondary"
 touches[pointer]=key;action(key)

func field_motion(_at: Vector2, _relative: Vector2, _pointer: int) -> void:
 pass # A flipper belongs to its initial finger until release.


func reset_game() -> void:
 left_angle=520;right_angle=520;bumper_pulse.fill(0.0);save_time=0
 balls.clear();hits=0;combo=0;combo_time=0;left_time=0;right_time=0;nova=false;launched=false
 balls.append({"p":Vector2(320,390),"v":Vector2.ZERO})

func controls() -> Array:
 return [["LEFT FLIPPER","primary"],["RIGHT FLIPPER","secondary"]]

func stats() -> String:
 return "TARGET %d / %d    CHAIN x%d" % [hits,50+stage*10,maxi(1,combo)]

func mode_action(name: String) -> void:
 if phase!="play":return
 if not launched:
  launched=true;save_time=4;balls[0].v=Vector2(-120,-520);audio.play("dash")
 if name=="primary":left_time=0.18
 else:right_time=0.18
 audio.play("flipper")

func collide_line(ball: Dictionary, a: Vector2, b: Vector2, kick: bool) -> void:
 var nearest=Geometry2D.get_closest_point_to_segment(ball.p,a,b)
 var offset=ball.p-nearest
 if offset.length()<13:
  var normal=offset.normalized()
  if normal==Vector2.ZERO:normal=Vector2.UP
  ball.p=nearest+normal*13
  if ball.v.dot(normal)<0:ball.v=ball.v.bounce(normal)*0.87
  if kick and ball.v.y>-500:
   ball.v=Vector2((180-ball.p.x)*2.1,-490)
   audio.play("flipper")

func tick(dt: float) -> void:
 for i in range(bumper_pulse.size()):bumper_pulse[i]=maxf(0,bumper_pulse[i]-dt)
 save_time=maxf(0,save_time-dt)
 if not launched:return
 left_time=maxf(0,left_time-dt);right_time=maxf(0,right_time-dt)
 var left=left_time>0 or "primary" in touches.values()
 var right=right_time>0 or "secondary" in touches.values()
 left_angle=move_toward(left_angle,462 if left else 520,dt*1100)
 right_angle=move_toward(right_angle,462 if right else 520,dt*1100)
 combo_time=maxf(0,combo_time-dt)
 if combo_time<=0:combo=0
 for ball in balls:
  trail(ball.p,accent)
  # Substeps keep fast balls from tunnelling through flippers and bumpers.
  for step in range(4):
   ball.v.y+=260*dt/4;ball.v=ball.v.limit_length(600);ball.p+=ball.v*dt/4
   if ball.p.x<25:ball.p.x=25;ball.v.x=absf(ball.v.x)*0.96
   if ball.p.x>335:ball.p.x=335;ball.v.x=-absf(ball.v.x)*0.96
   if ball.p.y<110:ball.p.y=110;ball.v.y=absf(ball.v.y)
   for bumper_index in range(bumpers.size()):
    var at=bumpers[bumper_index]
    var offset=ball.p-at
    if offset.length()<31:
     ball.p=at+offset.normalized()*32
     ball.v=offset.normalized()*maxf(320,ball.v.length()*1.05)
     hits+=1;combo=mini(8,combo+1);combo_time=2.5;score+=50*combo
     bumper_pulse[bumper_index]=0.22;burst(at,accent,8);feedback(at,"x%d"%combo,accent,0.04);audio.play("bumper")
   collide_line(ball,Vector2(25,420),Vector2(85,490),false)
   collide_line(ball,Vector2(335,420),Vector2(275,490),false)
   collide_line(ball,Vector2(85,490),Vector2(164,left_angle),left)
   collide_line(ball,Vector2(275,490),Vector2(196,right_angle),right)
 for i in range(balls.size()-1,-1,-1):
  if balls[i].p.y>565:
   if save_time>0:balls[i].p=Vector2(180,490);balls[i].v=Vector2(70,-500);save_time=0;toast("BALL SAVED");audio.play("bounce")
   else:balls.remove_at(i)
 if balls.is_empty():
  hp-=1;combo=0
  if hp<=0:finish(false)
  else:launched=false;balls.append({"p":Vector2(320,390),"v":Vector2.ZERO});audio.play("hurt")
 if hits>=6 and not nova:
  nova=true;balls.append({"p":Vector2(180,150),"v":Vector2(-160,220)});toast("MULTIBALL!");audio.play("flare")
 if hits>=50+stage*10:finish(true)

func world_draw() -> void:
 draw_arc(Vector2(180,275),163,PI,TAU,40,accent.darkened(0.3),5)
 draw_line(Vector2(20,275),Vector2(20,420),accent,4);draw_line(Vector2(340,275),Vector2(340,420),accent,4)
 for i in range(bumpers.size()):
  var size=65+bumper_pulse[i]*55
  sprite(1,bumpers[i],Vector2(size,size))
 sprite(2,Vector2(180,145),Vector2(46,46))
 var left=left_time>0 or "primary" in touches.values()
 var right=right_time>0 or "secondary" in touches.values()
 draw_line(Vector2(25,420),Vector2(85,490),accent.darkened(0.4),8)
 draw_line(Vector2(335,420),Vector2(275,490),accent.darkened(0.4),8)
 draw_line(Vector2(85,490),Vector2(164,left_angle),Color("ffd981"),12)
 draw_line(Vector2(275,490),Vector2(196,right_angle),Color("ffd981"),12)
 for ball in balls:
  draw_circle(ball.p,8,Color.WHITE);draw_circle(ball.p-Vector2(2,2),3,accent)
 if not launched:centered("TOUCH EITHER HALF TO LAUNCH",555,13,accent)
 elif save_time>0:centered("BALL SAVE %ds"%int(ceil(save_time)),555,12,accent)

func interaction_state() -> Dictionary:
 var state=super.interaction_state()
 state.merge({"launched":launched,"hits":hits,"left":held("primary"),"right":held("secondary")})
 return state
