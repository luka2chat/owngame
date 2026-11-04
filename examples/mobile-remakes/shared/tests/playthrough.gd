extends SceneTree
func _initialize() -> void:
 call_deferred("run")
func run() -> void:
 var g=load("res://main.tscn").instantiate();g.persist_enabled=false;root.add_child(g)
 await process_frame
 g.set_process(false);g.audio.toggle_mute();g.start_run()
 var target_platform=1
 for frame in range(18000):
  if g.phase!="play":break
  match g.cfg.mode:
   "side","platform":
    g.stick=Vector2.RIGHT
    if g.grounded:
     for p in g.platforms:
      if absf(g.player.y+19-p.position.y)<2 and g.player.x>=p.position.x and g.player.x<=p.end.x:
       if p.end.x-g.player.x<60:g.mode_action("primary")
     for e in g.enemies:
      if e.p.x>g.player.x and e.p.x-g.player.x<220 and g.cfg.mode=="side":g.stick=Vector2.ZERO;g.mode_action("secondary")
      elif e.p.x>g.player.x and e.p.x-g.player.x<65:g.mode_action("primary")
   "shooter":
    var target=Vector2(180+sin(g.elapsed*0.7)*90,480)
    if not g.boss_active:target.x=180+sin(g.elapsed)*85
    g.stick=(target-g.player)/40.0
    for b in g.hostile:
     if b.p.distance_to(g.player)<48:g.stick.x=1 if b.p.x<g.player.x else -1;g.mode_action("primary")
   "pinball":
    if not g.launched:g.mode_action("primary")
    for b in g.balls:
     if b.p.y>425:g.mode_action("primary");g.mode_action("secondary")
   "tower":
    g.choice=1
    for cell in [0,3,5,1,6,2,4,7]:
     var occupied=false
     for t in g.towers:
      if t.cell==cell:occupied=true
     if not occupied and g.money>=40:g.field_press(g.sockets[cell]);g.mode_action("secondary")
    if g.pending==0 and g.enemies.is_empty():g.mode_action("secondary")
   "climb":
    var old_velocity=g.velocity.y
    var at=g.platforms[target_platform].p+Vector2(g.platforms[target_platform].w/2,0)
    g.stick=Vector2(clampf((at.x-g.player.x)/20.0,-1,1),0)
    g._process(1.0/60)
    if old_velocity>0 and g.velocity.y<0:
     for i in range(g.platforms.size()):
      if absf(g.platforms[i].p.y-g.player.y-18)<3:target_platform=mini(g.platforms.size()-1,i+1);break
    continue
   "cores":
    if not g.cores.is_empty():
     var target=g.cores[0]
     g.stick=(target-g.player).normalized()
     if g.altitude<=0:g.mode_action("primary")
   "cards":
    var played=false
    for i in range(g.hand.size()):
     var c=g.CARDS[g.hand[i]]
     if c.cost<=g.mana and (c.kind!="unit" or g.allies.size()<4):g.play_card(i);played=true;break
    if g.ingredients>=3 and (g.health<24 or g.enemy_health<=5):g.mode_action("secondary")
    if not played:g.mode_action("primary")
   "hunt":
    if g.beasts.is_empty():g.stick=(g.camp-g.player).normalized()
    else:
     var b=g.beasts[0];var delta=b.p-g.player;var distance=delta.length()
     if b.state=="windup" or b.state=="charge":
      g.stick=delta.normalized().orthogonal()
      if b.timer<0.35:g.mode_action("secondary")
     elif distance>60:g.stick=delta.normalized()
     elif distance<45:g.stick=-delta.normalized()
     else:g.stick=Vector2.ZERO
     if distance<78:g.mode_action("primary")
  g._process(1.0/60)
 print("BOT RESULT ",g.cfg.id," phase=",g.phase," elapsed=",g.elapsed," hp=",g.hp," score=",g.score)
 var won=g.phase=="clear"
 g.queue_free();await process_frame;quit(0 if won else 1)
