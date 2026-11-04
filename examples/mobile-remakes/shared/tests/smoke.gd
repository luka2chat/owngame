extends SceneTree
var game
var errors: Array = []
func _initialize() -> void:
 root.size=Vector2i(360,720)
 call_deferred("run")
func check(ok: bool, label: String) -> void:
 if not ok:errors.append(label);push_error(label)
func tap(at: Vector2) -> void:
 var event=InputEventScreenTouch.new();event.index=0;event.position=at;event.pressed=true
 root.push_input(event, true)
 event=InputEventScreenTouch.new();event.index=0;event.position=at;event.pressed=false
 root.push_input(event, true)
func run() -> void:
 game=load("res://main.tscn").instantiate();game.persist_enabled=false;root.add_child(game)
 await process_frame
 game.set_process(false)
 await process_frame
 check(game.phase=="title","title")
 tap(Vector2(180,469));await process_frame
 check(game.phase=="play","synthetic touch starts game")
 game._process(0.016);await process_frame
 tap(Vector2(315,43));await process_frame
 check(game.phase=="pause","synthetic touch pauses game")
 var elapsed=game.elapsed;game._process(0.5)
 check(game.elapsed==elapsed,"pause freezes simulation")
 tap(Vector2(180,397));await process_frame
 check(game.phase=="play","synthetic touch resumes game")
 if game.cfg.get("stick",true):
  var hold=InputEventScreenTouch.new();hold.index=7;hold.position=Vector2(70,642);hold.pressed=true;root.push_input(hold,true)
  var drag=InputEventScreenDrag.new();drag.index=7;drag.position=Vector2(110,642);root.push_input(drag,true)
  check(game.stick.x>0.8,"joystick drag")
  tap(Vector2(290,645))
  check(game.stick_id==7 and game.stick.x>0.8,"action finger does not release joystick")
  hold=InputEventScreenTouch.new();hold.index=7;hold.position=Vector2(110,642);hold.pressed=false;root.push_input(hold,true)
  check(game.stick_id==-1 and game.stick==Vector2.ZERO,"joystick releases independently")
  # Restore ability cooldowns before isolated rule fixtures.
  game.start_run()
 var mode=game.cfg.mode
 match mode:
  "side","platform":
   for i in range(40):game._process(1.0/60)
   check(game.grounded,"player lands on starting platform")
   game.mode_action("primary")
   check(game.velocity.y<0,"jump impulse")
   var x=game.player.x
   game.stick=Vector2.RIGHT
   for i in range(60):game._process(1.0/60)
   check(game.player.x>x+50,"horizontal movement")
   var before=game.score;game.gems=[game.player];game._process(0.016)
   check(game.score>before,"collectible reward")
   game.bullets=[{"p":Vector2(game.player.x,650),"v":Vector2.DOWN*100,"enemy":true}];game.fire_time=999;game.enemies.clear();game._process(0.016)
   check(game.bullets.is_empty(),"vertical offscreen projectiles are reclaimed")
   game.enemies.clear();game.player.x=game.goal_x+170;game.player.y=420;game._process(0.016)
   check(game.phase=="clear","exit transition")
  "shooter":
   for i in range(90):game._process(1.0/60)
   check(not game.shots.is_empty(),"automatic weapon")
   game.elapsed=25;game._process(0.016)
   check(game.boss_active and game.boss_hp>0,"guardian spawns")
   check(not game.hostile.is_empty(),"guardian fan pattern")
   game.mode_action("primary")
   check(game.invuln>0 and game.hostile.is_empty(),"shield clears bullets")
   game.boss_hp=0;game._process(0.016);check(game.phase=="clear","guardian victory")
  "pinball":
   game.mode_action("primary")
   check(game.launched and game.balls[0].v.y<0,"launcher")
   game.balls[0].p=game.bumpers[0]+Vector2(29,0);game.balls[0].v=Vector2(-100,0)
   game._process(0.016);check(game.hits>0 and game.score>0,"bumper awards score")
   game.hits=6;game._process(0.016);check(game.balls.size()==2,"multiball reward")
   game.hits=50+game.stage*10;game._process(0.016);check(game.phase=="clear","mission clear")
  "tower":
   game.field_press(game.sockets[0]);game.mode_action("primary");game.field_press(game.sockets[1]);game.mode_action("primary");check(game.towers.size()==2,"tower placement")
   game.field_press(game.sockets[0]);game.field_press(game.sockets[1]);check(game.towers.size()==1 and game.towers[0].level==2,"equal towers merge")
   var cash=game.money;game.money=0;game.field_press(game.sockets[2]);game.mode_action("primary");game.field_press(Vector2(5,350));check(game.towers.size()==1,"unaffordable tower rejected");game.money=cash
   game.mode_action("secondary");game._process(0.016);check(game.wave==1 and not game.enemies.is_empty(),"wave begins")
   game.enemies=[{"p":game.sockets[1]+Vector2(20,0),"segment":1,"hp":10.0,"max":10,"slow":0.0,"armored":false}];game.towers[0].cool=0;game._process(0.016)
   check(game.enemies.is_empty() or game.enemies[0].hp<10,"tower attacks in range")
   game.wave=5;game.pending=0;game.enemies.clear();game._process(0.016);check(game.phase=="clear","wave clear")
  "climb":
   var y=game.player.y
   for i in range(30):game._process(1.0/60)
   check(game.player.y<y and game.height_best>0,"automatic upward bounce")
   game.mode_action("primary");check(game.velocity.y==-620 and game.boost>0,"jet boost")
   game.height_best=game.goal;game._process(0.016);check(game.phase=="clear","height goal")
  "cores":
   check(game.supported(game.player),"safe starting island")
   game.mode_action("primary");game._process(0.016);check(game.altitude>0,"jump lifts off island")
   game.mode_action("secondary");check(game.dash_cool>0,"dash cooldown")
   game.dash_time=0;game.player=game.cores[0];game._process(0.016);check(game.collected==1,"core and checkpoint")
   var cp=game.checkpoint;game.player=Vector2(5,500);game.altitude=0;game.fall_time=0.2;game._process(0.016);check(game.player==cp,"fall restores checkpoint")
   game.collected=game.total;game._process(0.016);check(game.phase=="clear","all cores clear")
  "cards":
   var before=game.mana;game.play_card(0);check(game.allies.size()==1 and game.mana==before-1,"mana paid for unit")
   game.mana=0;before=game.hand.size();game.play_card(0);check(game.hand.size()==before,"unaffordable card rejected")
   game.mode_action("primary");
   for i in range(100):game._process(1.0/60)
   check(game.turn==2 and game.mana==game.max_mana,"enemy and refill turn")
   game.ingredients=3;game.health=12;game.mode_action("secondary");check(game.health==20 and game.ingredients==0,"recipe spends ingredients")
   game.enemy_health=0;game.cleanup();check(game.phase=="clear","rival defeated")
  "hunt":
   game.player=game.resources[2].p
   for i in range(3):game.attack_cool=0;game.mode_action("primary")
   check(game.wood==3,"harvest wood")
   game.ore=3;game.player=game.camp;game.mode_action("craft");check(game.gear==1 and game.wood==0,"forge spends resources")
   game.mode_action("secondary");check(game.stamina==75 and game.invuln>0,"dodge costs stamina")
   game.beasts[0].p=game.player+Vector2(40,0);var health=game.beasts[0].hp;game.attack_cool=0;game.mode_action("primary");check(game.beasts[0].hp<health,"weapon hit")
   game.beasts.clear();
   for i in range(5):game._process(0.016)
   check(game.phase=="clear","hunt return victory")
 check(game.phase=="clear","mode has complete loop")
 var stage=game.stage;game.action("next");check(game.stage==stage+1 and game.phase=="play","endless next stage")
 game.hp=1;game.invuln=0;game.hurt();check(game.phase=="over","defeat")
 game.action("retry");check(game.phase=="play" and game.stage==1 and game.hp==5,"retry resets run")
 for i in range(600):game._process(1.0/60)
 check(game.particles.size()<=160,"bounded particles")
 game.audio.toggle_mute();await create_timer(0.25).timeout
 game.queue_free();await process_frame
 if errors.is_empty():print("SMOKE PASS: "+mode)
 else:print("SMOKE FAIL: "+str(errors))
 quit(0 if errors.is_empty() else 1)
