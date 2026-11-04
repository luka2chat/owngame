extends RefCounted
## The chest reveal is a paused reward, before the independent gift choice.
func draw(g) -> void:
 var found=g.pending_reward
 if found.is_empty():return
 var item=found.item
 var color=g.gear.COLORS[int(item.quality)]
 var t=g.reward_age
 var at=Vector2(180,263)
 g.draw_rect(Rect2(0,90,360,550),Color(0.015,0.035,0.06,0.94))
 g.gear_ui.center(g,"GUARDIAN CACHE",150,24,Color("f5dfad"))
 g.gear_ui.center(g,"EQUIPMENT + UPGRADE DUST",173,11,Color("a9c4c9"))
 for i in range(12):
  var angle=i*TAU/12+t*0.15
  var radius=74+sin(t*3+i)*8
  g.draw_line(at+Vector2.from_angle(angle)*47,at+Vector2.from_angle(angle)*radius,Color(color,0.22),3)
 g.draw_circle(at,64,Color(color,0.10))
 g.draw_arc(at,66,-t*0.4,TAU-t*0.4,64,Color(color,0.65),2)
 var scale=1.0+sin(minf(t/0.5,1)*PI)*0.25
 g.gear_ui.icon(g,int(item.slot),at,100*scale)
 g.gear_ui.center(g,g.gear.QUALITIES[int(item.quality)],348,14,color)
 g.gear_ui.center(g,g.gear.NAMES[int(item.slot)],380,28,color)
 g.gear_ui.center(g,"%s  /  LEVEL %d"%[g.gear.SLOTS[int(item.slot)],int(item.level)],402,12,Color("b7ccd0"))
 var current=g.gear.find_item(int(g.gear.worn.get(str(int(item.slot)),-1)))
 var diff=g.gear.score(item)-g.gear.score(current)
 g.gear_ui.center(g,"RECYCLED: BACKPACK FULL" if found.recycled else "%+d GEAR SCORE vs equipped"%diff,431,14,color if diff>=0 else Color("ed9384"))
 var key=g.gear.MAIN[int(item.slot)]
 g.gear_ui.center(g,"%s  %s"%[g.gear.LABELS[key],g.gear.value_text(key,g.gear.stats(item)[key])],454,13,Color("e6f1df"))
 g.gear_ui.center(g,"+%d UPGRADE DUST"%int(found.dust),478,13,Color("f5dfad"))
 if found.get("spare_recycled",false):g.gear_ui.center(g,"Weakest spare recycled into dust",493,10,Color("a9c4c9"))
 if not found.recycled:
  g.gear_ui.action(g,Rect2(32,500,296,48),"EQUIP & CHOOSE GIFT","reward_equip",t>=0.45)
 g.gear_ui.action(g,Rect2(32,562,296,44),"CHOOSE GIFT" if found.recycled else "KEEP IN BAG & CHOOSE GIFT","reward_keep",t>=0.45)

func press(g, at: Vector2) -> void:
 if g.reward_age<0.45:return
 if Rect2(32,500,296,48).has_point(at) and not g.pending_reward.get("recycled",true):g.accept_reward(true)
 elif Rect2(32,562,296,44).has_point(at):g.accept_reward(false)
