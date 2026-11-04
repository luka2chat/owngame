extends RefCounted
## Thumb controls share visuals, while each genre owns its interaction layout.
func icon(g, index: int, at: Vector2, size: float, tint: Color = Color.WHITE) -> void:
 var cell=g.touch_icons.get_size()/4
 g.draw_texture_rect_region(g.touch_icons,Rect2(at-Vector2.ONE*size/2,Vector2.ONE*size),Rect2(Vector2(index%4,index/4)*cell,cell),tint)

func circle(g, key: String, index: int, at: Vector2, radius: float, label: String, enabled: bool = true, badge: String = "") -> void:
 if not g.control_motion.has(key):g.control_motion[key]=0.0
 var press=float(g.control_motion[key])
 var pulse=float(g.button_pulses.get(key,0))/0.32
 var r=radius*(1-press*0.12)+sin((1-pulse)*PI)*pulse*2
 var active=enabled and g.phase=="play"
 var color=g.accent if active else Color("647a89")
 g.draw_circle(at+Vector2(0,4),r+2,Color(0.01,0.03,0.06,0.55))
 g.draw_circle(at,r,Color(0.035,0.09,0.14,0.88))
 g.draw_circle(at,r-5,Color(color,0.12+press*0.20))
 g.draw_arc(at,r-1,0,TAU,64,Color(color,0.65 if active else 0.25),2)
 g.draw_arc(at,r-6,PI*1.1,PI*1.65,20,Color(1,1,1,0.20),1)
 var remaining=clampf(g.cooldown_ratio(key),0,1)
 if float(g.control_cooldowns.get(key,0))>0 and remaining<=0:g.ready_pulses[key]=0.5
 g.control_cooldowns[key]=remaining
 var ready=float(g.ready_pulses.get(key,0))/0.5
 if ready>0:g.draw_arc(at,r+4+(1-ready)*9,0,TAU,48,Color(g.accent,ready*0.7),3)
 if remaining>0:
  g.draw_arc(at,r+3,-PI/2,-PI/2+TAU*(1-remaining),64,g.accent,3)
 elif pulse>0:
  g.draw_arc(at,r+3+(1-pulse)*12,0,TAU,48,Color(color,pulse*0.6),2)
 icon(g,index,at-Vector2(0,2),r*1.50,Color(1,1,1,1 if active else 0.38))
 if remaining>0:
  g.draw_circle(at+Vector2(0,13),12,Color("102030"))
  small(g,"%.1f"%g.cooldown_seconds(key),at+Vector2(0,17),11,g.accent)
 small(g,label,at+Vector2(0,r+17),11,Color("b8ccd6") if active else Color("738694"))
 if not badge.is_empty():
  g.panel(Rect2(at+Vector2(15,-radius-2),Vector2(33,20)),Color("233447"))
  small(g,badge,at+Vector2(31,-radius+12),11,Color("ffe1a3"))
 var context=label
 if g.cfg.mode=="tower":context+="/%d/%d"%[g.selected,g.build_cell]
 if g.cfg.mode=="cards":context+="/%d/%s"%[g.selected_card,str(g.hand)]
 g.buttons.append({"rect":Rect2(at-Vector2.ONE*(radius+5),Vector2.ONE*(radius+5)*2),"center":at,"radius":radius+5,"action":key,"enabled":active,"release":g.cfg.mode in ["tower","cards"],"context":context})

func small(g, label: String, at: Vector2, size: int, color: Color) -> void:
 var width=g.font.get_string_size(label,HORIZONTAL_ALIGNMENT_LEFT,-1,size).x
 g.text_at(label,at-Vector2(width/2,0),size,color)

func joystick(g) -> void:
 var origin=g.stick_origin if g.stick_id!=-1 else Vector2(78,639)
 # The rendered base and actual origin are identical, including near screen edges.
 var a=0.8 if g.stick_id!=-1 else 0.4
 g.draw_circle(origin,44,Color(0.04,0.10,0.16,a))
 g.draw_arc(origin,44,0,TAU,48,Color(g.accent,a*0.5),2)
 if g.cfg.get("horizontal_pad",false):
  g.draw_line(origin-Vector2(28,0),origin+Vector2(28,0),Color(g.accent,0.30),3)
 else:
  g.draw_arc(origin,24,0,TAU,32,Color(g.accent,0.12),1)
 var knob=origin+g.stick*28
 g.draw_circle(knob+Vector2(0,3),19,Color(0,0,0,0.3))
 g.draw_circle(knob,19,Color(g.accent,0.85 if g.stick_id!=-1 else 0.40))
 g.draw_arc(knob,14,PI*1.1,PI*1.7,16,Color(1,1,1,0.4),2)
 if g.stick_id==-1:small(g,"SLIDE TO MOVE",Vector2(78,704),10,Color("8da6bc"))

func wing(g, key: String, right: bool) -> void:
 var x=276.0 if right else 84.0
 if not g.control_motion.has(key):g.control_motion[key]=0.0
 var press=float(g.control_motion[key])
 var at=Vector2(x,638)
 var rect=Rect2(x-72,594,144,100)
 var points=PackedVector2Array([Vector2(12,685),Vector2(12,623),Vector2(139,594),Vector2(158,616),Vector2(158,685)])
 if right:
  for i in range(points.size()):points[i].x=360-points[i].x
 g.draw_colored_polygon(points,Color("112b3a").lerp(Color("244858"),press))
 g.draw_polyline(points,Color(g.accent,0.3+press*0.4),2,true)
 var pivot=at+Vector2(40 if right else -40,12)
 var tip=at+Vector2(-38 if right else 38,lerpf(12,-15,press))
 g.draw_line(pivot,tip,Color(g.accent,0.18),20,true)
 g.draw_line(pivot,tip,g.accent,9,true)
 g.draw_circle(pivot,7,Color("edfaff"))
 small(g,"HOLD",Vector2(x,681),11,Color("8da6bc"))
 g.buttons.append({"rect":rect,"action":key,"enabled":g.phase=="play"})

func pause_button(g) -> void:
 var at=Vector2(316,59)
 g.draw_circle(at,23,Color("16313d"))
 g.draw_arc(at,23,0,TAU,40,Color(g.accent,0.35),1)
 for x in [-4,4]:g.draw_line(at+Vector2(x,-7),at+Vector2(x,7),Color("e5f5f5"),3,true)
 g.buttons.append({"rect":Rect2(at-Vector2(24,24),Vector2(48,48)),"center":at,"radius":24.0,"action":"pause","enabled":g.phase=="play"})

func draw(g) -> void:
 # A transparent fade keeps the thumb area connected to the environment.
 for i in range(14):g.draw_rect(Rect2(0,580+i*10,360,10),Color(0.02,0.04,0.08,i*0.05))
 var mode=str(g.cfg.mode)
 var cs=g.controls()
 if mode=="pinball":
  wing(g,"primary",false);wing(g,"secondary",true)
  small(g,"HOLD BOTH SIDES TO KEEP FLIPPERS UP",Vector2(180,714),10,Color("8da6bc"))
  return
 if mode=="tower":
  if g.build_cell>=0:
   circle(g,"primary",8,Vector2(102,634),34,"FROST",g.money>=40,"40")
   circle(g,"secondary",9,Vector2(220,634),34,"FIRE",g.money>=40,"40")
   circle(g,"cancel",15,Vector2(315,638),24,"CANCEL")
  elif g.selected>=0:
   small(g,"TOWER LEVEL %d"%g.towers[g.selected].level,Vector2(87,636),13,g.accent)
   circle(g,"primary",10,Vector2(228,636),36,"UPGRADE",g.money>=g.upgrade_cost(),str(g.upgrade_cost()))
   circle(g,"secondary",15,Vector2(316,639),24,"CANCEL")
  else:
   small(g,"TAP A PAD" if g.towers.is_empty() else "DEFENSE READY" if g.enemies.is_empty() and g.pending==0 else "WAVE INCOMING",Vector2(117,635),15,g.accent)
   small(g,"Choose frost or fire" if g.towers.is_empty() else "Tap a tower to improve it",Vector2(117,657),11,Color("8da6bc"))
   circle(g,"wave",11,Vector2(293,638),37,"NEXT WAVE",not g.towers.is_empty() and g.pending==0 and g.enemies.is_empty())
  return
 if mode=="cards":
  var selected=g.selected_card>=0
  small(g,"CARD SELECTED" if selected else "ENEMY TURN" if g.resolving else "YOUR TURN",Vector2(88,633),13,g.accent)
  small(g,"%d MANA TO PLAY"%g.CARDS[g.hand[g.selected_card]].cost if selected else "Attacks resolving..." if g.resolving else "Tap a card to inspect",Vector2(88,655),11,Color("8da6bc"))
  circle(g,"primary",12 if selected else 13,Vector2(287,642),38,"PLAY" if selected else "END TURN",cs[0].size()<3 or cs[0][2])
  circle(g,"secondary",15 if selected else 14,Vector2(201,605),26,"CANCEL" if selected else "COOK",cs[1].size()<3 or cs[1][2],"" if selected else "3")
  return
 if g.cfg.get("stick",false) or g.cfg.get("horizontal_pad",false):joystick(g)
 elif g.elapsed<8:
  g.draw_arc(Vector2(80,639),22,PI*0.15,PI*0.85,24,Color(g.accent,0.4),2)
  g.draw_circle(Vector2(80+sin(g.clock*2)*20,639),7,Color(g.accent,0.5))
  small(g,"DRAG TO STEER",Vector2(80,686),10,Color("8da6bc"))
 var icons=[0,1]
 match mode:
  "side":icons=[0,2]
  "shooter":icons=[3,2]
  "climb":icons=[4,3]
  "hunt":icons=[6 if cs[0][0]=="CHOP" else 7 if cs[0][0]=="MINE" else 5,1]
 for i in range(mini(2,cs.size())):
  var c=cs[i]
  circle(g,c[1],icons[i],Vector2(290,645) if i==0 else Vector2(207,599),39 if i==0 else 29,str(c[0]),c.size()<3 or c[2])
