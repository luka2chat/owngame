extends SceneTree

func _initialize() -> void:
 call_deferred("run")

func run() -> void:
 var game = load("res://main.tscn").instantiate()
 game.persist_enabled = false
 root.add_child(game)
 assert(game.art != null and game.arena != null, "both pixel art assets should be imported")
 var tap := InputEventScreenTouch.new()
 tap.position = Vector2(180, 490)
 tap.pressed = true
 game._input(tap)
 assert(game.state == "play" and game.hp == 100)
 assert(game.sound.voices[0].playing, "start tap should play a sound")
 tap.position = Vector2(160, 400)
 tap.index = 7
 game._input(tap)
 var drag := InputEventScreenDrag.new()
 drag.index = 7
 drag.position = Vector2(205, 400)
 game._input(drag)
 var old_x = game.hero.x
 game._process(0.05)
 assert(game.hero.x > old_x, "drag should move hero")
 tap.pressed = false
 game._input(tap)
 assert(game.touch_id == -1, "release should reset drag")
 game.enemies.clear()
 game.enemies.append({"pos":game.hero + Vector2(20, 0), "hp":1.0, "speed":0.0, "radius":11.0, "hit":9.0, "boss":false, "crab":false})
 game.shot_clock = 0
 for i in range(10): game._process(0.05)
 assert(game.kills >= 1, "automatic shots should kill an enemy")
 game.gems.clear()
 game.xp = game.xp_needed - 1
 game.charge = game.BEACON_CHARGE - 1
 game.gems.append({"pos":game.hero, "value":1})
 game._process(0.01)
 assert(game.state == "upgrade" and game.level == 2 and game.choices.size() == 3)
 assert(game.flare > 0.0 and game.charge == 0 and not game.sparks.is_empty())
 var damage_before = game.damage
 game.apply_upgrade("POWER")
 assert(game.damage > damage_before)
 game.start_game()
 assert(game.level == 1 and game.kills == 0 and game.enemies.is_empty())
 game.hp = 0
 game._process(0.01)
 assert(game.state == "over")
 game.start_game()
 game.elapsed = 179.99
 game._process(0.05)
 assert(game.state == "play", "survival must continue past the old 180-second ending")
 game.enemies.clear()
 game.hostile.clear()
 game.loot.clear()
 game.stage_time = 44.99
 game.boss_spawned = false
 game._process(0.05)
 assert(game.boss_spawned)
 var bosses = game.enemies.filter(func(e): return e.boss)
 assert(bosses.size() == 1)
 bosses[0].hp = 0
 game._process(0.01)
 var chests = game.loot.filter(func(item): return item.kind == 4)
 assert(chests.size() == 1)
 game.hero = chests[0].pos
 game._process(0.01)
 assert(game.state == "reward" and game.stage_reward)
 for i in range(12):game._process(0.05)
 game.handle_press(Vector2(180,580),1)
 assert(game.state=="upgrade")
 game.handle_press(Vector2(90, 245), 1)
 assert(game.stage == 2 and game.state == "play" and not game.boss_spawned)
 assert(game.ranks.size() == 1)
 assert(game.valid_checkpoint(game.saved_run))
 var saved_power = game.damage
 game.state = "title"
 game.handle_press(Vector2(180, 490), 1)
 assert(game.stage == 2 and game.damage == saved_power and game.stage_time == 0)
 assert(not game.valid_checkpoint({"stage":2,"ranks":{}}))
 var corrupt = game.saved_run.duplicate(true)
 corrupt["damage"] = "bad"
 assert(not game.valid_checkpoint(corrupt))
 for gift in game.GIFTS:
  game.apply_upgrade(gift)
 assert(game.regen > 0 and game.armor > 0 and game.max_hp > 100)
 for i in range(20): game.apply_upgrade("LANTERNS")
 assert(game.damage > 18 and game.extra == 5)
 game.stage = 99
 game.advance_stage()
 assert(game.stage == 100)
 game.spawn_enemy(true)
 assert(game.enemies[0].hp > 1000 and game.enemies[0].speed < 100)
 var guardian = game.enemies[0]
 guardian.cooldown = 0
 game.update_enemy(guardian, Vector2.RIGHT, 0.01)
 assert(game.hostile.size() == 5, "guardian should emit a fan of projectiles")
 guardian.boss = false
 guardian.kind = 3
 guardian.cooldown = 0
 game.update_enemy(guardian, Vector2.RIGHT, 0.01)
 assert(guardian.windup > 0, "eel must telegraph its dash")
 var origin = guardian.pos
 game.update_enemy(guardian, Vector2.RIGHT, 0.7)
 game.update_enemy(guardian, Vector2.RIGHT, 0.1)
 assert(guardian.pos.x > origin.x, "eel should charge after its telegraph")
 for i in range(100): game.spawn_enemy()
 assert(game.enemies.size() <= game.MAX_ENEMIES)
 for i in range(150): game.drop_crystal(Vector2.ZERO, 1)
 assert(game.gems.size() == 80)
 print("SMOKE PASS: touch, drag, audio playback, combat, XP, flare, upgrade, restart, loss, endless stages, boss rewards, relic stacking and population limits")
 game.sound.toggle_mute()
 await create_timer(0.25).timeout
 game.queue_free()
 await process_frame
 quit()
