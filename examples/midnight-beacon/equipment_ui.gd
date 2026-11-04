extends RefCounted
var selected := -1
var page := 0
var confirm_salvage := false
var notice := "Guardian > chest > equipment + dust."
var targets: Array = []
var art: Texture2D
const INK = Color("101f2e")
const TEAL = Color("79c9be")
const GOLD = Color("edce94")

func panel(g, rect: Rect2, color := INK, edge := Color("365764")) -> void:
 g.draw_rect(rect,color)
 g.draw_rect(rect,edge,false,2)
 g.draw_rect(Rect2(rect.position+Vector2(4,4),Vector2(rect.size.x-8,2)),Color(edge,0.35))

func center(g, text: String, y: float, size := 16, color := Color.WHITE, x := 180.0) -> void:
 var width = g.font.get_string_size(text,HORIZONTAL_ALIGNMENT_LEFT,-1,size).x
 g.label(text,Vector2(x-width/2,y),size,color)

func action(g, rect: Rect2, text: String, key: String, enabled := true) -> void:
 panel(g,rect,Color("24413f") if enabled else Color("1b2b36"), TEAL if enabled else Color("40515b"))
 center(g,text,rect.position.y+rect.size.y/2+5,14,Color("eff7e4") if enabled else Color("71868b"),rect.get_center().x)
 if enabled: targets.append({"rect":rect,"key":key})

func icon(g, slot: int, at: Vector2, size: float, faded := false) -> void:
 if art == null: art = load("res://assets/equipment.png")
 var cell = art.get_size()/Vector2(3,2)
 g.draw_texture_rect_region(art,Rect2(at-Vector2.ONE*size/2,Vector2.ONE*size),Rect2(Vector2(slot%3,floori(float(slot)/3.0))*cell,cell),Color(1,1,1,0.25 if faded else 1.0))

func tile(g, rect: Rect2, item: Dictionary, slot := -1) -> void:
 var present = not item.is_empty()
 var color = g.gear.COLORS[int(item.quality)] if present else Color("3c5966")
 panel(g,rect,Color("172c39"),color)
 icon(g,int(item.slot) if present else slot,rect.get_center(),rect.size.x-6,not present)
 if present:
  g.label("+%d"%int(item.upgrade),rect.position+Vector2(4,13),10,GOLD)
  if g.gear.equipped(item):
   g.draw_rect(Rect2(rect.end-Vector2(18,16),Vector2(18,16)),Color("235d50"))
   g.label("E",rect.end-Vector2(13,4),11,Color.WHITE)
  targets.append({"rect":rect,"key":"item","id":int(item.id)})

func draw(g) -> void:
 targets.clear()
 g.draw_rect(Rect2(0,0,360,640),Color(0.025,0.06,0.10,1.0))
 g.label("KEEPER'S GEAR",Vector2(18,35),21,GOLD)
 g.label("THIS VOYAGE  /  SIX SLOTS",Vector2(18,57),11,TEAL)
 action(g,Rect2(292,8,54,44),"BACK","close")
 center(g,"GUARDIAN CHESTS GUARANTEE NEW EQUIPMENT",79,10,GOLD)
 var slots = [Vector2(22,94),Vector2(22,174),Vector2(22,254),Vector2(278,94),Vector2(278,174),Vector2(278,254)]
 g.draw_circle(Vector2(180,197),72,Color("172f3a"))
 g.draw_arc(Vector2(180,197),76,0,TAU,48,Color("365764"),2)
 g.sprite(0,Vector2(180,191),150)
 for i in range(6):
  var item = g.gear.find_item(int(g.gear.worn.get(str(i),-1)))
  tile(g,Rect2(slots[i],Vector2(60,60)),item,i)
  center(g,g.gear.SLOTS[i],slots[i].y+74,10,TEAL,slots[i].x+30)
 var score = 0
 for id in g.gear.worn.values(): score += g.gear.score(g.gear.find_item(int(id)))
 center(g,"GEAR SCORE",280,10,TEAL)
 center(g,str(score),308,26,GOLD)
 panel(g,Rect2(16,337,328,55))
 center(g,"DMG %.1f    HP %.0f    ARMOR %.1f"%[g.effective_damage(),g.health_limit(),g.effective_armor()],360,13,Color("e1ecdf"))
 center(g,"CRIT %.0f%%    SPEED %.0f    DUST %d"%[g.crit_chance()*100,g.move_speed(),g.gear.dust],381,12,TEAL)
 g.label("BACKPACK  %d / 24"%g.gear.items.size(),Vector2(18,417),13,GOLD)
 var max_page = maxi(0,(g.gear.items.size()-1)/8)
 page = clampi(page,0,max_page)
 for n in range(8):
  var index = page*8+n
  var rect = Rect2(20+(n%4)*82,432+(n/4)*72,72,64)
  if index<g.gear.items.size(): tile(g,rect,g.gear.items[index])
  else: panel(g,rect,Color("12232f"),Color("263e49"))
 action(g,Rect2(20,578,60,44),"<","prev",page>0)
 action(g,Rect2(280,578,60,44),">","next",page<max_page)
 center(g,"%d / %d  -  %d dust"%[page+1,max_page+1,g.gear.dust],596,12,GOLD)
 center(g,notice,615,10,TEAL)
 if selected!=-1: draw_detail(g)

func draw_detail(g) -> void:
 var item = g.gear.find_item(selected)
 if item.is_empty(): selected=-1;return
 targets.clear()
 var quality = int(item.quality)
 var color = g.gear.COLORS[quality]
 g.draw_rect(Rect2(0,0,360,640),Color(0.01,0.03,0.05,0.88))
 panel(g,Rect2(18,20,324,604),Color("122632"),color)
 action(g,Rect2(282,28,50,44),"X","detail_back")
 tile(g,Rect2(139,40,82,82),item)
 center(g,"%s +%d"%[g.gear.NAMES[int(item.slot)],int(item.upgrade)],153,25,color)
 center(g,"%s  /  %s  /  LV %d"%[g.gear.QUALITIES[quality],g.gear.SLOTS[int(item.slot)],int(item.level)],175,11,TEAL)
 center(g,"EQUIPMENT SCORE",198,10,TEAL)
 center(g,str(g.gear.score(item)),228,29,GOLD)
 var current = g.gear.find_item(int(g.gear.worn.get(str(int(item.slot)),-1)))
 var diff = g.gear.score(item)-g.gear.score(current)
 center(g,"EQUIPPED" if g.gear.equipped(item) else "%+d score vs equipped"%diff,247,12,TEAL if diff>=0 else Color("ed9384"))
 panel(g,Rect2(32,260,296,63))
 g.label("BASE ATTRIBUTE",Vector2(45,279),11,GOLD)
 var main = g.gear.MAIN[int(item.slot)]
 stat_row(g,main,g.gear.stats(item)[main],305,color)
 panel(g,Rect2(32,333,296,116))
 g.label("BONUS ATTRIBUTES",Vector2(45,353),11,GOLD)
 var line = 376
 for key in item.affixes:
  stat_row(g,key,g.gear.stats(item)[key],line,TEAL);line+=22
 if item.affixes.is_empty(): g.label("No bonus on common equipment",Vector2(45,383),12,Color("829ba6"))
 if quality==3: center(g,"SOUL LIGHT  -  Recover 1 HP on kill",468,12,GOLD)
 else: center(g,"Enhancement improves every attribute",468,11,Color("829ba6"))
 action(g,Rect2(32,481,296,44),"UNEQUIP" if g.gear.equipped(item) else "EQUIP  -  "+g.gear.SLOTS[int(item.slot)],"equip")
 var cost = g.gear.cost(item)
 action(g,Rect2(32,533,174,44),"MAX +5" if int(item.upgrade)>=5 else "UPGRADE  %d dust"%cost,"upgrade",int(item.upgrade)<5 and g.gear.dust>=cost)
 action(g,Rect2(214,533,114,44),"CONFIRM?" if confirm_salvage else "SALVAGE +%d"%g.gear.salvage_value(item),"salvage",not g.gear.equipped(item))
 center(g,"Dust %d   /   +15%% stats per upgrade"%g.gear.dust,600,12,TEAL)

func stat_row(g, key: String, value: float, y: float, color: Color) -> void:
 g.label(g.gear.LABELS[key],Vector2(45,y),13,Color("d4e5df"))
 var t = g.gear.value_text(key,value)
 var width = g.font.get_string_size(t,HORIZONTAL_ALIGNMENT_LEFT,-1,14).x
 g.label(t,Vector2(315-width,y),14,color)

func press(g, at: Vector2) -> void:
 for target in targets:
  if not target.rect.has_point(at): continue
  match target.key:
   "close": g.close_equipment()
   "detail_back": selected=-1;confirm_salvage=false
   "item": selected=target.id;confirm_salvage=false
   "prev": page-=1
   "next": page+=1
   "equip":
    g.gear.equip(selected);g.gear_changed();g.sound.play("equip");confirm_salvage=false
   "upgrade":
    if g.gear.improve(selected):g.gear_changed();g.sound.play("upgrade")
    confirm_salvage=false
   "salvage":
    if confirm_salvage:
     if g.gear.salvage(selected):g.gear_changed();selected=-1
     confirm_salvage=false
    else:confirm_salvage=true
  g.queue_redraw()
  return
