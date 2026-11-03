extends SceneTree

func _initialize() -> void:
 call_deferred("run")

func run() -> void:
 var game = load("res://main.tscn").instantiate()
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
 assert(game.state == "win")
 print("SMOKE PASS: touch, drag, audio playback, combat, XP, flare, upgrade, restart, loss and win")
 game.sound.toggle_mute()
 await create_timer(0.25).timeout
 game.queue_free()
 await process_frame
 quit()
