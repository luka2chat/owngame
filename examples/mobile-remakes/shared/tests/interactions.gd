extends SceneTree
var g
var failures:Array=[]
func _initialize() -> void:
 root.size=Vector2i(360,720);call_deferred("run")
func check(ok: bool, label: String) -> void:
 if not ok:failures.append(label);push_error(label)
func touch(id: int, at: Vector2, down: bool) -> void:
 var e=InputEventScreenTouch.new();e.index=id;e.position=at;e.pressed=down;root.push_input(e,true)
func drag(id: int, at: Vector2) -> void:
 var e=InputEventScreenDrag.new();e.index=id;e.position=at;root.push_input(e,true)
func tap(at: Vector2) -> void:
 touch(0,at,true);touch(0,at,false)
func control(key: String) -> Vector2:
 for b in g.buttons:
  if b.action==key:return b.rect.get_center()
 check(false,"missing control: "+key)
 return Vector2(-100,-100)
func check_layout() -> void:
 var circles=[]
 for b in g.buttons:
  if not b.has("radius"):continue
  check(b.radius>=24,"48px minimum touch diameter: "+b.action)
  check(b.rect.position.x>=0 and b.rect.end.x<=360 and b.rect.end.y<=710,"controls inside safe area")
  for other in circles:check(b.center.distance_to(other.center)>b.radius+other.radius,"no overlapping circular touch targets")
  circles.append(b)
func frames(count: int) -> void:
 for i in range(count):g._process(1.0/60)
func run() -> void:
 g=load("res://main.tscn").instantiate();g.persist_enabled=false;root.add_child(g)
 await process_frame;await process_frame;g.set_process(false);g.start_run();await process_frame;await process_frame
 check_layout()
 match g.cfg.mode:
  "side","platform":
   frames(45)
   touch(7,Vector2(70,642),true);drag(7,Vector2(110,642));touch(8,control("primary"),true)
   check(g.move_vector().x>0.9 and g.velocity.y<0,"direction and jump are independent fingers")
   touch(8,control("primary"),false);frames(1)
   check(g.velocity.y>=-210 and g.move_vector().x>0.9,"short jump cuts ascent without releasing movement")
   touch(7,Vector2(110,642),false)
   g.start_run();frames(45);g.grounded=false;g.coyote=0.08;g.mode_action("primary")
   check(g.velocity.y<0 and g.coyote==0,"coyote jump consumes grace once")
   g.start_run();g.player=Vector2(100,450);g.velocity=Vector2(0,100);g.grounded=false;g.coyote=0
   g.mode_action("primary");frames(8)
   check(g.velocity.y<0,"prelanding jump buffer triggers on contact")
   if g.cfg.mode=="platform":
    g.start_run();g.mode_action("secondary");var x=g.player.x;frames(10)
    check(g.player.x>x+70,"dash maintains travel through acceleration")
  "shooter","climb":
   var before=g.player
   touch(3,Vector2(55,400),true)
   check(g.player==before,"touchdown never teleports")
   drag(3,Vector2(125,400));frames(10)
   check(g.player.x>before.x+30,"relative drag steers")
   drag(3,control("primary"));frames(1)
   check(not g.held("primary"),"steering across a skill never activates it")
   var x=g.player.x
   touch(4,Vector2(270,400),true);drag(4,Vector2(50,400));frames(1)
   check(g.player.x>=x-1,"second pointer cannot steal steering")
   touch(4,Vector2(50,400),false)
   g.action("pause");g.action("resume");frames(2)
   check(not g.drag_active if g.cfg.mode=="shooter" else not g.steering,"pause clears field capture")
  "pinball":
   touch(1,Vector2(60,350),true);touch(2,Vector2(290,350),true);frames(8)
   check(g.held("primary") and g.held("secondary") and g.left_angle<470 and g.right_angle<470,"table halves support simultaneous held flippers")
   touch(1,Vector2(60,350),false);frames(15)
   check(not g.held("primary") and g.held("secondary") and g.left_angle>510,"release only its own flipper")
  "tower":
   var cash=g.money
   tap(g.sockets[0]);await process_frame;await process_frame
   check(g.towers.is_empty() and g.money==cash and g.build_cell==0,"pad previews without spending")
   check_layout()
   touch(19,control("primary"),true)
   check(g.money==cash and g.towers.is_empty(),"purchase waits for lift")
   drag(19,Vector2(180,710));touch(19,Vector2(180,710),false)
   check(g.money==cash and g.towers.is_empty(),"slide away cancels purchase")
   tap(control("cancel"));await process_frame;await process_frame
   check(g.build_cell==-1 and g.money==cash,"explicit cancel has no cost")
   tap(g.sockets[0]);await process_frame;await process_frame
   tap(control("secondary"));await process_frame;await process_frame
   check(g.towers.size()==1 and g.towers[0].kind==1 and g.money==cash-40,"explicit fire build spends once")
   tap(g.sockets[0]);await process_frame;await process_frame
   var cost=g.upgrade_cost();tap(control("primary"));await process_frame;await process_frame
   check(g.towers[0].level==2 and g.money==cash-40-cost,"selected tower upgrade")
   tap(control("secondary"));await process_frame;await process_frame
   tap(g.sockets[1]);await process_frame;await process_frame
   tap(Vector2(5,350));await process_frame;await process_frame
   check(g.build_cell==-1 and g.towers.size()==1,"outside touch cancels build")
  "cards":
   var mana=g.mana
   tap(Vector2(90,400));await process_frame;await process_frame
   check(g.selected_card==0 and g.mana==mana and g.allies.is_empty(),"card selection has no cost")
   touch(19,control("primary"),true);drag(19,Vector2(180,710));touch(19,Vector2(180,710),false)
   check(g.mana==mana and g.allies.is_empty(),"slide away cancels card play")
   tap(control("secondary"));await process_frame;await process_frame
   check(g.selected_card==-1 and g.mana==mana,"cancel card safely")
   tap(Vector2(90,400));await process_frame;await process_frame;tap(control("primary"));await process_frame;await process_frame
   check(g.allies.size()==1 and g.mana==mana-1,"explicit play consumes selected card once")
   tap(control("primary"));await process_frame;await process_frame
   check(g.resolving and g.turn==1,"end turn is animated")
   tap(control("primary"));tap(Vector2(90,400));frames(90)
   check(g.turn==2 and not g.resolving,"rapid taps cannot double advance a resolving turn")
  "cores":
   g.player=Vector2(180,-35);g.stick=Vector2.UP;frames(2)
   check(g.altitude>0,"edge hop launches automatically")
   g.action("pause");check(g.stick==Vector2.ZERO,"pause drops movement")
  "hunt":
   g.player=g.resources[2].p;await process_frame;await process_frame
   touch(5,control("primary"),true);frames(60);touch(5,control("primary"),false)
   check(g.wood==3,"holding context action harvests a complete resource")
   g.player=g.camp+Vector2(200,0);g.ore=3;g.mode_action("craft")
   check(g.gear==0,"forge cannot be invoked away from camp")
   g.beasts=[{"p":g.player+Vector2(40,0),"home":g.player,"hp":1,"max":1,"state":"rest","timer":10.0,"aim":g.player,"boss":false}]
   g.attack_cool=0;g.mode_action("primary");frames(5)
   check(g.beasts.is_empty() and g.target_kind!="beast","dead last target cannot remain selected")
 g.start_run();await process_frame;await process_frame
 if g.cfg.get("stick",false) or g.cfg.get("horizontal_pad",false):
  touch(41,Vector2(80,640),true);drag(41,Vector2(150,640));drag(41,Vector2(90,640))
  check(g.stick.x<0,"floating stick reverses without returning to initial touch")
  touch(42,control("primary"),true)
  check(g.stick_id==41,"skill does not steal movement finger")
  touch(42,control("primary"),false);touch(41,Vector2(120,640),false)
  check(g.stick==Vector2.ZERO,"movement releases outside original base")
 check(g.cooldown_ratio("pause")==0,"HUD buttons never inherit ability cooldowns")
 g.action("pause");await process_frame;await process_frame
 var phase=g.phase;tap(Vector2(10,650));check(g.phase==phase and g.stick==Vector2.ZERO,"modal blocks gameplay touches")
 check(g.effects.size()<=48 and g.particles.size()<=160,"effects remain bounded")
 for cue in g.audio.streams:
  var data=g.audio.streams[cue].data
  check(data.size()>0,"audio has PCM: "+cue)
  var peak=0
  for i in range(0,data.size(),2):peak=maxi(peak,absi(data.decode_s16(i)))
  check(peak<30000 and peak>100,"audio headroom: "+cue)
 g.audio.toggle_mute();await create_timer(0.25).timeout;g.queue_free();await process_frame;await process_frame
 print("INTERACTION ","PASS" if failures.is_empty() else "FAIL",": ",failures)
 quit(0 if failures.is_empty() else 1)
