extends SceneTree
var g
var failures:Array=[]
func _initialize() -> void:
 root.size=Vector2i(360,640);call_deferred("run")
func check(ok: bool, label: String) -> void:
 if not ok:failures.append(label);push_error(label)
func touch(at: Vector2, down: bool, id: int = 7) -> void:
 var event=InputEventScreenTouch.new();event.position=at;event.pressed=down;event.index=id
 root.push_input(event,true)
func drag(at: Vector2, id: int = 7) -> void:
 var event=InputEventScreenDrag.new();event.position=at;event.index=id;root.push_input(event,true)
func tap(at: Vector2) -> void:
 touch(at,true);touch(at,false)
func quiet_run() -> void:
 g.start_game();g.spawn_clock=999;g.shot_clock=999;g.xp_needed=9999
func run() -> void:
 g=load("res://main.tscn").instantiate();g.persist_enabled=false;root.add_child(g)
 await process_frame;g.set_process(false);g.sound.toggle_mute();quiet_run()
 touch(Vector2(80,420),true);drag(Vector2(88,420))
 var before=g.hero
 g._process(1.0/60)
 check(g.hero.x-before.x>=0.75,"8px drag responds on next simulation frame")
 drag(Vector2(260,420));drag(Vector2(230,420))
 check(g.movement_input().x<0,"floating stick reverses without returning to original touch")
 touch(Vector2(180,420),false,8)
 check(g.touch_id==7,"unrelated finger release preserves movement")
 touch(Vector2(230,420),false)
 before=g.hero;g._process(1.0/60)
 check(g.hero==before,"finger release stops immediately")
 # Drops beyond all four world edges must become reachable, including low/high frame rates.
 var origins=[Vector2(-45,-60),Vector2(405,-60),Vector2(-45,700),Vector2(405,700)]
 for dt in [1.0/120,1.0/30]:
  for at in origins:
   quiet_run();g.hero=at.clamp(Vector2(18,102),Vector2(342,590))
   g.drop_crystal(at,2)
   check(g.DROP_AREA.grow(0.1).has_point(g.gems[0].pos),"new crystal placed in reachable area")
   # Also recover old out-of-bounds drops already present in a running scene.
   g.gems[0].pos=at;g.loot=[{"kind":3,"pos":at}];g.hp=40
   for i in range(int(1.0/dt)):g._process(dt)
   check(g.gems.is_empty() and g.xp==2 and g.loot.is_empty() and g.hp>40,"edge crystal and potion collected at "+str(at))
 quiet_run();g.speed=250;g.hero=Vector2(90,340);g.drop_crystal(Vector2(40,340),1)
 touch(Vector2(80,420),true);drag(Vector2(110,420))
 for i in range(35):g._process(1.0/60)
 check(g.gems.is_empty(),"attracted crystal catches fastest keeper")
 touch(Vector2(110,420),false)
 quiet_run();var count=g.gear.items.size();g.loot=[{"kind":4,"pos":g.hero}];g._process(0.01)
 check(g.state=="reward" and g.gear.items.size()==count+1,"chest opens dedicated equipment reveal")
 var item=g.pending_reward.item.duplicate(true)
 var elapsed=g.elapsed;var hp=g.hp;tap(Vector2(180,524))
 check(g.state=="reward","reveal ignores accidental immediate tap")
 for i in range(12):g._process(0.05)
 check(g.elapsed==elapsed and g.hp==hp,"reward animation freezes combat")
 var args=OS.get_cmdline_user_args()
 if args.size()>0 and DisplayServer.get_name()!="headless":
  g.queue_redraw();await process_frame;await RenderingServer.frame_post_draw
  root.get_texture().get_image().save_png(args[0])
 tap(Vector2(180,524))
 check(g.state=="upgrade" and g.gear.equipped(item),"touch equip applies revealed item before gift choice")
 tap(Vector2(90,245))
 check(g.state=="play" and g.stage==2 and g.gear.items.size()==count+1,"gift continues stage without duplicating loot")
 check(g.saved_run.equipment==g.gear.snapshot(),"equipped reward persists in next-stage checkpoint")
 for quality in range(4):
  var data=g.sound.streams["loot%d"%quality].data
  var peak=0
  for i in range(0,data.size(),2):peak=maxi(peak,absi(data.decode_s16(i)))
  check(peak>100 and peak<29000,"reward sound headroom")
 g.queue_free();await process_frame
 print("FEEL PICKUP ","PASS" if failures.is_empty() else "FAIL",": ",failures)
 quit(0 if failures.is_empty() else 1)
