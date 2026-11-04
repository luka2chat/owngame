extends SceneTree
var game
var output := "/tmp/midnight-equipment-evidence"
var failed := false
func _initialize() -> void:call_deferred("run")
func require(ok: bool, message: String) -> void:
 if not ok:failed=true;push_error(message)
func tap(at: Vector2) -> void:
 var press=InputEventScreenTouch.new();press.index=0;press.position=at;press.pressed=true
 Input.parse_input_event(press)
 await process_frame
 press=InputEventScreenTouch.new();press.index=0;press.position=at;press.pressed=false
 Input.parse_input_event(press)
 await process_frame
func capture(name: String) -> void:
 game.queue_redraw()
 await process_frame
 await RenderingServer.frame_post_draw
 get_root().get_texture().get_image().save_png(output+"/"+name+".png")
func run() -> void:
 DirAccess.make_dir_recursive_absolute(output)
 game=load("res://main.tscn").instantiate();game.persist_enabled=false;root.add_child(game)
 game.sound.toggle_mute()
 await capture("01-title")
 await tap(Vector2(180,350))
 require(game.state=="equipment","title equipment entry")
 await capture("02-equipment")
 await tap(Vector2(56,462))
 require(game.gear_ui.selected==1,"backpack tap opens detail")
 await capture("03-item-detail")
 var old=game.effective_damage()
 await tap(Vector2(100,553))
 require(game.gear.find_item(1).upgrade==1 and game.effective_damage()>old,"upgrade button applies")
 await capture("04-upgraded")
 await tap(Vector2(180,500))
 require(not game.gear.equipped(game.gear.find_item(1)),"unequip button")
 await tap(Vector2(180,500))
 require(game.gear.equipped(game.gear.find_item(1)),"reequip button")
 await tap(Vector2(307,50))
 await tap(Vector2(220,464))
 require(game.gear_ui.selected==3,"select boots")
 var before=game.gear.items.size()
 await tap(Vector2(266,553))
 require(game.gear.items.size()==before,"salvage needs second tap")
 await tap(Vector2(266,553))
 require(game.gear.items.size()==before-1,"salvage confirmation")
 await tap(Vector2(320,30))
 require(game.state=="title","back returns title")
 await tap(Vector2(180,490))
 require(game.state=="play" and game.gear.find_item(1).upgrade==1,"loadout retained on start")
 await tap(Vector2(310,612))
 require(game.state=="equipment" and game.touch_id==-1,"combat inventory input")
 var at=game.elapsed
 await create_timer(0.1).timeout
 require(game.elapsed==at,"combat freezes while viewing")
 # Fixture for long names, three affixes, legendary special, full bag and paging.
 var random=RandomNumberGenerator.new();random.seed=122
 while game.gear.items.size()<24:game.gear.items.append(game.gear.create_item(random.randi_range(0,5),3,12,random))
 game.gear_ui.selected=int(game.gear.items[-1].id)
 await capture("05-legendary-detail")
 await tap(Vector2(307,50))
 await tap(Vector2(308,598))
 require(game.gear_ui.page==1,"next page")
 await tap(Vector2(308,598))
 require(game.gear_ui.page==2,"last page")
 await capture("06-full-backpack")
 await tap(Vector2(320,30))
 require(game.state=="play" and game.touch_id==-1,"closing resumes without stuck drag")
 await capture("07-combat")
 print("EQUIPMENT INPUT AND RENDER ","FAIL" if failed else "PASS")
 game.queue_free();await process_frame;quit(1 if failed else 0)
