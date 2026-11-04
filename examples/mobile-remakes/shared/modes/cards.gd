extends "res://shared/base.gd"
const CARDS = [
 {"name":"PAN GUARD","cost":1,"kind":"unit","attack":2,"health":4,"text":"Guard 2 / 4"},
 {"name":"CHILI KNIGHT","cost":2,"kind":"unit","attack":4,"health":3,"text":"Strike 4 / 3"},
 {"name":"SEARING CUT","cost":1,"kind":"spell","attack":5,"text":"Deal 5 damage"},
 {"name":"IRON LID","cost":1,"kind":"block","attack":6,"text":"Gain 6 armor"},
 {"name":"BROTH","cost":2,"kind":"heal","attack":7,"text":"Heal 7 health"},
 {"name":"EMBER FEAST","cost":3,"kind":"area","attack":4,"text":"Burn all enemies"}
]
var hand: Array = []
var allies: Array = []
var foes: Array = []
var mana := 3
var max_mana := 3
var health := 30
var enemy_health := 30
var armor := 0
var turn := 1
var ingredients := 0
var intent := 4
var selected_card := -1
var target_foe := 0
var resolving := false
var turn_clock := 0.0
var turn_queue: Array = []
var flight := 0.0
var flight_from := Vector2.ZERO
var flight_to := Vector2.ZERO
var flight_art := 0

func tick(dt: float) -> void:
 flight=maxf(0,flight-dt)
 if not resolving:return
 turn_clock-=dt
 if turn_clock>0:return
 turn_clock=0.38
 if not turn_queue.is_empty():
  var a=turn_queue.pop_front()
  if a not in allies:return
  if not foes.is_empty():
   foes[0].health-=a.attack;a.health-=foes[0].attack
   feedback(Vector2(65,226),"-%d"%a.attack,Color("ff9a91"),0.06)
  else:enemy_health-=a.attack;feedback(Vector2(65,140),"-%d"%a.attack,Color("ff9a91"),0.06)
  flight=0.3;flight_art=0;flight_from=Vector2(48,309);flight_to=Vector2(65,226)
  audio.play("hit");cleanup();return
 resolve_enemy()

func field_press(at: Vector2) -> void:
 if resolving:return
 if selected_card>=0 and CARDS[hand[selected_card]].kind=="spell" and at.y<275:
  for i in range(foes.size()):
   if at.distance_to(Vector2(65+i*100,226))<40:target_foe=i;audio.play("select");return
 selected_card=-1

func resolve_enemy() -> void:
 var damage=intent
 for e in foes:damage+=e.attack
 if not allies.is_empty():
  allies[0].health-=damage;feedback(Vector2(48,309),"-%d"%damage,Color("ff9a91"),0.1)
 else:
  health-=maxi(0,damage-armor);feedback(Vector2(180,310),"BLOCK" if armor>=damage else "-%d"%maxi(0,damage-armor),accent,0.1)
 audio.play("block" if armor>=damage else "hurt")
 armor=0;turn+=1;max_mana=mini(8,3+int(turn/2));mana=max_mana
 if foes.size()<3:foes.append({"attack":2+int(stage/3),"health":4+stage+int(turn/3)})
 intent=3+(turn%3)*2+int(stage/3)
 while hand.size()<4:hand.append(rng.randi_range(0,CARDS.size()-1))
 resolving=false;cleanup();audio.play("turn");toast("YOUR TURN / MANA REFILLED")

func reset_game() -> void:
 hand.clear();allies.clear();foes.clear();mana=3;max_mana=3;health=30;enemy_health=25+stage*7;armor=0;turn=1;ingredients=0;intent=4
 selected_card=-1;target_foe=0;resolving=false;turn_queue.clear();turn_clock=0;flight=0
 hand=[0,1,2,3]
 foes.append({"attack":2+mini(stage,10),"health":5+stage})

func stats() -> String:
 return "HP %d   ARMOR %d   MANA %d/%d" % [health,armor,mana,max_mana]

func controls() -> Array:
 if resolving:return [["RESOLVING","primary",false],["COOK (3)","secondary",false]]
 if selected_card>=0:
  return [["PLAY / %d"%CARDS[hand[selected_card]].cost,"primary",mana>=CARDS[hand[selected_card]].cost],["CANCEL","secondary"]]
 return [["END TURN","primary"],["COOK (3)","secondary",ingredients>=3]]

func mode_action(name: String) -> void:
 if phase!="play" or resolving:return
 if name.begins_with("card:"):
  var index=int(name.split(":")[1])
  if phase!="play" or resolving or index<0 or index>=hand.size():return
  selected_card=-1 if selected_card==index else index;target_foe=0;audio.play("select")
  if selected_card>=0 and mana<CARDS[hand[selected_card]].cost:toast("NOT ENOUGH MANA / SELECT ANOTHER CARD")
  return
 if selected_card>=0:
  if name=="primary":play_card(selected_card)
  elif name=="secondary":selected_card=-1;audio.play("select")
  return
 if name=="secondary" and ingredients>=3:
  ingredients-=3;health=mini(30,health+8);enemy_health-=5
  feedback(Vector2(180,310),"FEAST +8",accent);audio.play("heal");cleanup();return
 if name!="primary":return
 resolving=true;turn_queue=allies.duplicate();turn_clock=0.22
 audio.play("turn");toast("YOUR UNITS ATTACK / ENEMY RESPONDS")

func play_card(index: int) -> void:
 if phase!="play" or resolving or index<0 or index>=hand.size():return
 var c=CARDS[hand[index]]
 if mana<c.cost:toast("NOT ENOUGH MANA");return
 if c.kind=="unit" and allies.size()>=4:toast("YOUR BOARD IS FULL");return
 flight_from=Vector2(93+(index%2)*174,407+int(index/2)*103)
 flight_to=Vector2(48+allies.size()*87,309) if c.kind=="unit" else Vector2(65+target_foe*100,226)
 flight=0.35;flight_art=1 if hand[index]==1 else (0 if c.kind=="unit" else 2)
 mana-=c.cost;hand.remove_at(index);selected_card=-1
 match c.kind:
  "unit":allies.append({"attack":c.attack+int(power/3),"health":c.health+int(power/2),"art":flight_art})
  "spell":
   if foes.is_empty():enemy_health-=c.attack+power
   else:
    target_foe=clampi(target_foe,0,foes.size()-1);foes[target_foe].health-=c.attack+power;feedback(Vector2(65+target_foe*100,226),"-%d"%(c.attack+power),Color("ff9a91"),0.08)
  "block":armor+=c.attack+power
  "heal":health=mini(30,health+c.attack)
  "area":
   for e in foes:e.health-=c.attack+int(power/2)
   enemy_health-=2
 ingredients+=1;score+=15;audio.play("card" if c.kind=="unit" else ("heal" if c.kind=="heal" else "block" if c.kind=="block" else "flare"));cleanup()

func cleanup() -> void:
 for i in range(foes.size()-1,-1,-1):
  if foes[i].health<=0:foes.remove_at(i);ingredients+=1;score+=100;audio.play("kill")
 for i in range(allies.size()-1,-1,-1):
  if allies[i].health<=0:allies.remove_at(i)
 hp=clampi(int(ceil(health/6.0)),0,5)
 if health<=0:finish(false)
 elif enemy_health<=0:score+=500;finish(true)

func world_draw() -> void:
 sprite(1,Vector2(65,140),Vector2(72,72))
 text_at("RIVAL HP %d"%maxi(0,enemy_health),Vector2(122,128),19,Color("ff9a91"))
 text_at("Intent: ATTACK %d"%intent,Vector2(122,151),14)
 text_at("TURN %d / INGREDIENTS %d"%[turn,ingredients],Vector2(27,185),13,accent)
 draw_line(Vector2(20,270),Vector2(340,270),accent.darkened(0.5),2)
 for i in range(foes.size()):
  var at=Vector2(65+i*100,226);sprite(1,at,Vector2(49,49));text_at("%d / %d"%[foes[i].attack,foes[i].health],at+Vector2(-19,33),13,Color("ff9a91"))
 for i in range(allies.size()):
  var at=Vector2(48+i*87,309);sprite(int(allies[i].get("art",0)),at,Vector2(48,48));text_at("%d / %d"%[allies[i].attack,allies[i].health],at+Vector2(-18,32),13,accent)
 for i in range(hand.size()):
  var c=CARDS[hand[i]];var rect=Rect2(14+(i%2)*174,360+int(i/2)*103,158,94)
  if selected_card==i:
   rect.position.y-=5
   panel(rect.grow(3),accent)
  panel(rect,Color("304334") if mana>=c.cost else Color("28303a"))
  sprite(1 if hand[i]==1 else 0 if c.kind=="unit" else 2,rect.position+Vector2(28,37),Vector2(43,43))
  text_at("%d MANA"%c.cost,rect.position+Vector2(60,28),13,accent)
  text_at(c.name,rect.position+Vector2(9,63),12)
  text_at(c.text,rect.position+Vector2(9,82),12,Color("abc3c5"))
  if phase=="play" and not resolving:buttons.append({"rect":rect,"action":"card:%d"%i})

 if selected_card>=0 and CARDS[hand[selected_card]].kind=="spell" and not foes.is_empty():
  draw_arc(Vector2(65+clampi(target_foe,0,foes.size()-1)*100,226),33,0,TAU,32,Color("ffd981"),3)
  centered("TAP A FOE TO AIM / PLAY TO CAST",287,11,Color("ffd981"))
 if flight>0:
  var t=1-flight/0.35
  var at=flight_from.lerp(flight_to,1-pow(1-t,3))
  sprite(flight_art,at,Vector2(52,52),false,Color(1,1,1,minf(1,flight*9)))

func interaction_state() -> Dictionary:
 var state=super.interaction_state()
 state.merge({"mana":mana,"selected":selected_card,"allies":allies.size(),"turn":turn,"resolving":resolving})
 return state
