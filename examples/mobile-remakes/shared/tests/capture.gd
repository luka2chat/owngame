extends SceneTree
func _initialize() -> void:
 root.size=Vector2i(360,720)
 call_deferred("run")
func run() -> void:
 var game=load("res://main.tscn").instantiate();game.persist_enabled=false;root.add_child(game)
 await process_frame
 game.set_process(false);game.start_run()
 match game.cfg.mode:
  "tower":
   game.field_press(game.sockets[0]);game.mode_action("primary");game.field_press(game.sockets[1]);game.mode_action("secondary");game.field_press(game.sockets[2]);game.mode_action("primary");game.mode_action("wave")
  "cards":game.play_card(0);game.mode_action("primary")
  "pinball":game.mode_action("primary")
  "side","platform":game.stick=Vector2.RIGHT
  "hunt":game.stick=Vector2(-0.5,-0.8)
 for i in range(180):game._process(1.0/60)
 game.clear_input();game.queue_redraw()
 await process_frame
 await RenderingServer.frame_post_draw
 var path=OS.get_cmdline_user_args()[0]
 root.get_texture().get_image().save_png(path)
 game.audio.toggle_mute();await create_timer(0.25).timeout
 game.queue_free();await process_frame;quit()
