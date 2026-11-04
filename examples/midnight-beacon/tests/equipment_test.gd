extends SceneTree
var checks := 0
var failures := 0
func check(value: bool, message: String) -> void:
 checks += 1
 if not value:
  push_error(message)
  failures += 1

func _initialize() -> void:
 call_deferred("run")

func run() -> void:
 var model = load("res://equipment.gd").new()
 model.reset()
 check(model.items.size()==4 and model.worn.size()==2,"starter gear")
 check(model.valid(model.snapshot()),"starter valid")
 var random=RandomNumberGenerator.new();random.seed=45
 for slot in range(6):
  for quality in range(4):
   var item=model.create_item(slot,quality,9,random)
   check(model.stats(item).has(model.MAIN[slot]),"slot base stat")
   check(item.affixes.size()==quality,"rarity affix count")
   check(model.score(item)>0,"meaningful score")
 var old=model.snapshot()
 for i in range(200):model.reward(i+1,random)
 check(model.items.size()==24,"backpack bounded")
 for id in old.worn.values():check(not model.find_item(id).is_empty(),"equipped not auto-salvaged")
 check(model.valid(model.snapshot()),"reward save valid")
 check(model.restore(old),"restore")
 var item=model.items[0]
 check(not model.salvage(item.id),"worn protected")
 var score=model.score(item)
 var dust=model.dust
 check(model.improve(item.id),"upgrade")
 check(model.score(item)>score and model.dust<dust,"upgrade cost and gain")
 model.dust=0
 check(not model.improve(item.id),"no free upgrades")
 model.dust=1000
 for i in range(8):model.improve(item.id)
 check(item.upgrade==5,"upgrade cap")
 model.equip(item.id)
 check(model.salvage(item.id) and model.find_item(item.id).is_empty(),"salvage unworn")
 for change in ["duplicate","nan","wrong_slot","missing_id","fraction","overflow"]:
  var bad=old.duplicate(true)
  match change:
   "duplicate":bad.items.append(bad.items[0])
   "nan":bad.items[0].affixes={"health":NAN}
   "wrong_slot":bad.worn["5"]=bad.items[0].id
   "missing_id":bad.worn["0"]=999
   "fraction":bad.items[0].upgrade=0.5
   "overflow":bad.dust=1e40
  check(not model.restore(bad),"reject "+change)
 var game=load("res://main.tscn").instantiate();game.persist_enabled=false
 root.add_child(game);game.set_process(false)
 game.start_game()
 var base=game.damage
 var effective=game.effective_damage()
 for i in range(10):game.gear.equip(1);game.gear_changed()
 check(game.damage==base and is_equal_approx(game.effective_damage(),effective),"no stat stacking")
 game.open_equipment()
 var elapsed=game.elapsed
 game._process(0.05)
 check(game.state=="equipment" and game.elapsed==elapsed and game.touch_id==-1,"inventory pauses combat")
 game.close_equipment()
 check(game.state=="play" and game.touch_id==-1,"clean return")
 var before=game.gear.items.size()
 game.loot=[{"kind":4,"pos":game.hero}]
 game.update_relics(0.01)
 check(game.gear.items.size()==before+1 and game.stage_reward,"actual chest grants item")
 for i in range(12):game._process(0.05)
 game.handle_press(Vector2(180,580),1)
 game.handle_press(Vector2(90,245),1)
 check(game.stage==2 and game.valid_checkpoint(game.saved_run),"stage checkpoint includes gear")
 game.gear.improve(1);game.gear_changed()
 var saved=game.saved_run.duplicate(true)
 var serialized=JSON.parse_string(JSON.stringify(saved))
 check(game.valid_checkpoint(serialized),"JSON roundtrip")
 game.state="title";game.handle_press(Vector2(180,490),1)
 check(game.gear.snapshot()==saved.equipment,"resume exact inventory")
 check(game.damage==saved.damage,"base stats remain separate")
 var legacy=saved.duplicate(true);legacy.erase("equipment")
 check(game.valid_checkpoint(legacy),"legacy checkpoint accepted")
 game.saved_run=legacy;game.state="title";game.handle_press(Vector2(180,490),1)
 check(game.stage==2 and game.gear.items.size()==4,"legacy migration starter gear")
 # Increasing health capacity and then unequipping must never heal or exceed cap.
 var hat=game.gear.create_item(1,3,50,random);game.gear.items.append(hat)
 game.hp=20;game.gear.equip(hat.id);game.gear_changed()
 check(game.hp==20 and game.health_limit()>game.max_hp,"health gear does not heal")
 game.hp=game.health_limit();game.gear.equip(hat.id);game.gear_changed()
 check(game.hp<=game.health_limit(),"unequip clamps health")
 var lantern=game.gear.create_item(0,3,1,random);game.gear.items.append(lantern);game.gear.equip(lantern.id);game.gear_changed()
 game.state="play";game.hp=20;game.enemies.clear();game.hostile.clear();game.loot.clear();game.gems.clear();game.spawn_clock=99
 game.enemies.append({"pos":Vector2(30,150),"hp":0.0,"speed":0.0,"radius":11.0,"hit":1.0,"boss":false,"crab":false})
 game._process(0.01)
 check(game.hp>=21,"legendary kill heal is real")
 game.regen=5
 game.hp=0;game._process(0.01)
 check(game.state=="over" and game.saved_run.is_empty(),"death clears voyage")
 game.start_game()
 check(game.gear.items.size()==4 and game.gear.dust==12,"new voyage resets gear")
 print("EQUIPMENT PASS: " if failures==0 else "EQUIPMENT FAIL: ",checks," checks, ",failures," failures")
 if not game.sound.muted:game.sound.toggle_mute()
 await create_timer(0.15).timeout
 game.queue_free();await process_frame;quit(1 if failures else 0)
