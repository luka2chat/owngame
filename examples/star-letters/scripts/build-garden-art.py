"""The giant's winter garden with reusable spring layers. All original Blender art."""
from pathlib import Path
import runpy
kit=Path(__file__).with_name('story-art-kit.py')
exec(compile(kit.read_text(),str(kit),'exec'),globals())
SOURCE=ROOT/'art/models/garden-v1';SOURCE.mkdir(parents=True,exist_ok=True)
random.seed(614)
detail_geometry=runpy.run_path(str(Path(__file__).with_name('home-detail-geometry.py')))
detail_rng=random.Random(2614)

def detail_mesh(name,data,mat,smooth=False):
    return mesh(name,data[0],data[1],mat,smooth)

def ivy_leaves(name,centers,length=.12):
    vertices=[];faces=[]
    for center in centers:
        angle=detail_rng.uniform(0,math.tau)
        vs,fs=detail_geometry['folded_leaf'](center,(math.cos(angle),-.3,math.sin(angle)),length,
            length*.55,detail_rng.uniform(-1,1))
        offset=len(vertices);vertices.extend(vs);faces.extend(tuple(offset+v for v in f) for f in fs)
    return mesh(name,vertices,faces,'LeafLight')

def join_named(name,objects,pivot=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    if len(objects)>1:bpy.ops.object.join()
    obj=bpy.context.object;obj.name=name
    if pivot is not None:
        scene.cursor.location=pivot;bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    return obj

material('GardenGrass',(.48,.54,.54),'meadow')
material('Snow',(.86,.91,.96))
material('Ice',(.59,.75,.82),None,.35)
material('Skin',(.79,.52,.34))
snow_parts=[];canopy=[];flowers=[]
segments=72;rings=[(.01,0),(7.8,0),(8.6,-.12),(9.1,-.7),(8.7,-2.1),(6.3,-3.9),(.01,-4.7)]
vs=[];fs=[]
for r,z in rings:
    for i in range(segments):
        a=math.tau*i/segments;vs.append((r*math.cos(a),r*math.sin(a),z))
for j in range(len(rings)-1):
    for i in range(segments):
        k=(i+1)%segments;fs.append((j*segments+i,(j+1)*segments+i,(j+1)*segments+k,j*segments+k))
ground=mesh('Ground_Surface',vs,fs,'GardenGrass',True);ground.data.materials.append(M['Earth'])
for p in ground.data.polygons:p.material_index=0 if p.index//segments<2 else 1
for i in range(65):
    a=math.tau*i/65;x,y=8.65*math.cos(a),8.65*math.sin(a)
    rock('RimStone',(x,y,-.35),(.53,.55,.58))
    snow_parts.append(rock('SnowCap',(x,y,.04),(.49,.51,.12),'Snow'))
    if i%2==0:rock('CliffStone',(x*.95,y*.95,-1.7),(.65,.65,1))

# Front wall has a narrow, visibly open west wicket for the initial visit.
def wall(name,x,y,sx,sy):
    cube('Solid_'+name,(x,y,.56),(sx,sy,1.12),'Stone',.08)
    # Shallow masonry skins leave the existing collision volume and gate
    # openings intact. Staggered joints remain visible from walking height.
    along_x=sx>sy;length=max(sx,sy);thickness=min(sx,sy)
    for side in (-1,1):
        for row in range(4):
            start=-length/2-(.27 if row%2 else 0)
            while start<length/2:
                end=min(length/2,start+detail_rng.uniform(.42,.72))
                left=max(-length/2,start);width=end-left-.025
                if width>.07:
                    mid=(left+end)/2;out=side*(thickness/2+.018)
                    pos=(x+mid,y+out,.14+row*.26) if along_x else (x+out,y+mid,.14+row*.26)
                    size=(width,.085,.235) if along_x else (.085,width,.235)
                    cube('WallMasonry',pos,size,detail_rng.choice(['Stone','Stone','Stone','Plaster','Rock']),.035)
                start=end
    count=max(1,int(max(sx,sy)/.45))
    for i in range(count):
        xx=x+(i/(max(count-1,1))-.5)*max(0,sx-.35) if sx>sy else x
        yy=y+(i/(max(count-1,1))-.5)*max(0,sy-.35) if sy>sx else y
        rock('WallCap',(xx,yy,1.12),(.26,.25,.16),'Rock')
        snow_parts.append(rock('WallSnow',(xx,yy,1.25),(.25,.23,.065),'Snow'))
wall('FrontWest',-5.4,-2.5,1.2,.42)
wall('FrontMiddle',-2.275,-2.5,2.05,.42)
wall('FrontEast',3.625,-2.5,4.75,.42)
wall('WestWall',-6,1.0,.42,7.0)
wall('EastWall',6,1.0,.42,7.0)
wall('BackWall',0,5.8,9.7,.42)
for x in (-1.38,1.38,-4.95,-3.15):
    cube('GatePost',(x,-2.5,.85),(.37,.5,1.7),'Stone')
    sphere('PostFinial',(x,-2.5,1.78),(.24,.24,.24),'Stone')
    snow_parts.append(sphere('PostSnow',(x,-2.5,1.94),(.24,.24,.09),'Snow'))
for side in (-1,1):
    before=set(scene.objects);x=side*.63
    for j in range(6):cube('GateBoard',(x-.49+j*.196,-2.5,.92),(.18,.18,1.65),'LightWood',.035)
    for z in (.45,1.30):cube('GateBrace',(x,-2.62,z),(1.17,.10,.12),'Timber')
    sphere('GateHandle',(side*.18,-2.68,.95),(.06,.05,.06),'Brass')
    join_named('GateLeft' if side<0 else 'GateRight',[o for o in scene.objects if o.type=='MESH' and o not in before],(side*1.25,-2.5,.08))
# Open wicket leaf rests along the west side, leaving > 1 metre of clear passage.
cube('OpenWicket',(-4.93,-1.95,.65),(.12,1.0,1.30),'LightWood')

# Rounded cottage with the giant visible in an oversized window.
hx,hy=1.6,3.9
cube('Solid_House',(hx,hy,1.4),(4.6,3.4,2.8),'Plaster',.18)
cube('HouseFoundation',(hx,hy,.18),(4.8,3.6,.36),'Stone')
mesh('Gables',[(-.7,2.185,.17),(3.9,2.185,.17),(3.9,2.185,2.7),(1.6,2.185,4.35),(-.7,2.185,2.7),
    (-.7,5.6,2.7),(3.9,5.6,2.7),(1.6,5.6,4.35)],[(0,1,2,3,4),(7,6,5)],'Plaster')
for side in (-1,1):
    for col in range(5):
        xx=side*(col+.5)*.5
        for row in range(10):
            y=1.94+row*.39;z=4.35-abs(xx)*.61
            tile=cube('RoofTile',(hx+xx,y,z),(.59,.43,.13),random.choice(['Teal','TealLight','Teal']),.04)
            tile.rotation_euler.y=side*.55
            if random.random()<.24:snow_parts.append(sphere('RoofSnow',(hx+xx,y,z+.12),(.28,.23,.09),'Snow',10,6))
    beam('RoofFascia',(hx,1.78,4.45),(hx+side*2.65,1.78,2.82),.10,'Timber')
beam('RoofRidge',(hx,1.78,4.46),(hx,5.8,4.46),.12,'TealLight')
detail_mesh('DoorFrame',detail_geometry['arched_panel'](.10,2.04,.12,.55,1.57,.16),'Timber')
detail_mesh('Door',detail_geometry['arched_panel'](.10,1.99,.13,.48,1.57,.05),'Dark')
for i in range(7):
    left=-.38+i*.96/7+.006;right=-.38+(i+1)*.96/7-.006
    detail_mesh('DoorBoard',detail_geometry['arched_panel'](.10,1.95,.14,.48,1.57,.04,(left,right)),
        'LightWood' if i%3 else 'Timber')
for i in range(11):
    detail_mesh('DoorArchStone',detail_geometry['arch_stone'](.10,1.96,1.57,.57,.72,
        i*math.pi/11+.015,(i+1)*math.pi/11-.015,.20),'Stone' if i%3 else 'Plaster')
for side in (-1,1):
    for i in range(5):cube('DoorJamb',(.10+side*.645,2.06,.25+i*.265),(.15,.20,.245),'Stone',.025)
for z in (.55,1.35):
    cube('DoorHinge',(-.15,1.92,z),(.32,.04,.055),'Dark',.01)
    for x in (-.28,-.02):sphere('HingeRivet',(x,1.892,z),(.017,.012,.017),'Brass',8,4)
cube('DoorHandlePlate',(.41,1.91,1.04),(.08,.03,.18),'Brass',.02)
ring('DoorKnob',(.41,1.875,1.04),.06,.014,'Dark',(math.pi/2,0,0))
cube('Doorstep',(.1,1.96,.075),(1.5,.43,.15),'Stone',.05)
cube('WindowDark',(2.65,2.13,1.94),(1.63,.10,1.65),'Dark',.13)
for x in (1.79,3.51):cube('WindowFrame',(x,2.02,1.94),(.13,.16,1.78),'Timber')
for z in (1.08,2.80):cube('WindowFrame',(2.65,2.02,z),(1.85,.18,.14),'Timber')
cube('WindowSill',(2.65,1.93,1.09),(1.96,.55,.18),'LightWood')
for x in (1.58,3.73):
    cube('WindowShutter',(x,2.07,1.95),(.27,.12,1.64),'Teal',.035)
    for i in range(7):cube('ShutterSlat',(x,1.985,1.30+i*.20),(.27,.045,.065),'TealLight',.01)
for i in range(13):
    x=1.72+i*.155;z=2.85+.18*math.sin(i*math.pi/12)
    cube('WindowLintelStone',(x,2.10,z),(.145,.25,.20),'Stone',.035)
before=set(scene.objects)
sphere('GiantFace',(2.65,1.98,2.02),(.58,.27,.62),'Skin',16,12)
sphere('GiantHair',(2.65,2.01,2.45),(.64,.29,.29),'LightWood',16,8)
for i in range(5):sphere('GiantBeard',(2.31+i*.17,1.79,1.66),(.21,.13,.27),'Cream',12,8)
sphere('GiantNose',(2.65,1.66,2.00),(.15,.19,.15),'Skin',12,8)
for x in (2.43,2.87):
    sphere('GiantEyeWhite',(x,1.73,2.22),(.12,.06,.10),'Cream',12,8)
    sphere('GiantEye',(x,1.67,2.20),(.045,.025,.052),'Dark',10,6)
    beam('GiantBrow',(x-.12,1.73,2.36),(x+.12,1.73,2.36),.037,'Cream')
join_named('GiantPortrait',[o for o in scene.objects if o.type=='MESH' and o not in before],(2.65,2.0,1.7))
for x in (2.0,3.30):sphere('GiantHand',(x,1.86,1.20),(.24,.19,.13),'Skin',12,8)
cube('Chimney',(.5,4.9,3.9),(.6,.65,1.55),'Stone')
cube('ChimneyTop',(.5,4.9,4.72),(.8,.83,.18),'TealDark')

# A stone plinth, warm porch light and small domestic details give the giant's
# house the same hand-built vocabulary as home, with its own broad window.
for row in range(3):
    for i in range(10):
        x=-.67+i*.48
        if -.64<x<.84:continue
        cube('FoundationStone',(x,2.13,.11+row*.18),(.45,.20,.165),
            'Stone' if (row+i)%3 else 'Rock',.025)
    for side in (-1,1):
        for i in range(8):
            cube('FoundationStone',(hx+side*2.31,2.32+i*.44,.11+row*.18),(.18,.41,.165),
                'Stone' if (row+i)%3 else 'Rock',.025)
for x in (-.56,3.77):
    for z in (.78,1.25,1.72,2.19):cube('CornerStone',(x,2.19,z),(.25,.18,.22),'Stone',.04)
for x in (1.04,3.78):
    anchor('PorchLightLeft' if x<2 else 'PorchLightRight',(x,1.50,1.89))
    cube('LanternBracket',(x,2.09,2.18),(.08,.10,.28),'Dark',.02)
    curve('LanternHook',[(x,2.06,2.25),(x,1.77,2.28),(x,1.72,2.14)],.018,'Dark')
    ring('LanternHandle',(x,1.72,2.10),.055,.012,'Brass',(math.pi/2,0,0))
    cube('LanternGlow',(x,1.72,1.89),(.16,.16,.27),'Glass',.025)
    for dx in (-.10,.10):
        for dy in (-.10,.10):beam('LanternFrame',(x+dx,1.72+dy,1.71),(x+dx,1.72+dy,2.06),.012,'Brass')
    for z in (1.72,2.05):cube('LanternRim',(x,1.72,z),(.26,.26,.045),'Brass',.02)
    bpy.ops.mesh.primitive_cone_add(vertices=4,radius1=.20,radius2=.05,depth=.13,location=(x,1.72,2.13),rotation=(0,0,math.pi/4))
    finish(bpy.context.object,'LanternRoof','TealDark')
for x,y,scale in [(-.52,1.94,.8),(3.78,1.92,1.0)]:
    profile=[(0,0),(.12,0),(.17,.03),(.22,.29),(.24,.29),(.24,.34),(.19,.34),(.18,.28),(.10,.06),(0,.06)]
    detail_mesh('ClayPot',detail_geometry['turned_profile'](x,y,.04,[(r*scale,z*scale) for r,z in profile]),'Mailbox',True)
    cylinder('PotSoil',(x,y,.30*scale),.18*scale,.025,'Soil')
    centers=[]
    for i in range(9):
        angle=i*math.tau/9;tip=(x+.13*math.cos(angle),y+.13*math.sin(angle),.50*scale)
        beam('RosemaryStem',(x,y,.25*scale),tip,.01,'Leaf')
        centers.extend([tip,(tip[0],tip[1],tip[2]-.08)])
    ivy_leaves('RosemaryLeaves',centers,.07*scale)
# Evergreen ivy stays in winter; the flowering fruit tree remains seasonal.
for side in (-1,1):
    points=[(hx+side*x,1.74,4.34-x*.61) for x in (.45,.95,1.45,2.0,2.48)]
    points.extend([(hx+side*2.22,2.03,2.3),(hx+side*2.16,2.03,1.95)])
    curve('CottageIvy',points,.022,'Leaf')
    centers=[]
    for a,b in zip(points,points[1:]):
        for i in range(7):
            t=i/7
            centers.append(tuple(a[k]*(1-t)+b[k]*t+detail_rng.uniform(-.08,.08) for k in range(3)))
    ivy_leaves('CottageIvyLeaves',centers)
for z in (3.4,3.75,4.1,4.45):cube('ChimneyBand',(.5,4.9,z),(.66,.71,.075),'Rock',.02)

# A shelf full of unused spring: jars of seeds and wrapped bronze chimes.
cube('Solid_Cabinet',(-2.1,3.8,.75),(1.8,.75,1.5),'Timber')
for z in (.25,.78,1.33):cube('CabinetShelf',(-2.1,3.37,z),(1.75,.6,.10),'LightWood')
for i in range(5):
    x=-2.75+i*.32
    cylinder('SeedJar',(x,3.26,1.04),.11,.42,'Cream')
    cylinder('JarLid',(x,3.26,1.28),.13,.07,'Brass')
    sphere('JarLabel',(x,3.14,1.05),(.05,.01,.08),'Leaf')
    cylinder('StoredChime',(x,3.22,.5),.045,.35,'Brass')
for x in (-3.05,-1.15):beam('ShedPost',(x,3.8,0),(x,3.8,1.9),.065,'Timber')
cube('ShedRoof',(-2.1,3.8,1.95),(2.2,1.25,.16),'Teal')

# Exact same chair proportions as the neighbor's photo motif.
for name,x in [('Artisan',-2.8),('Gardener',-.8)]:
    cube('Solid_Chair_'+name,(x,.4,.40),(.55,.55,.13),'LightWood')
    for dx in (-.21,.21):
        for dy in (-.21,.21):beam('ChairLeg',(x+dx,.4+dy,0),(x+dx,.4+dy,.43),.035,'Timber')
    for z in (.65,.85):cube('ChairBack',(x,.67,z),(.58,.07,.13),'Timber')
    for dx in (-.24,.24):beam('ChairPost',(x+dx,.67,.25),(x+dx,.67,1.0),.04,'Timber')
    anchor('Seat_'+name,(x,.40,-.12))
cylinder('TeaTable',(-1.8,.2,.65),.43,.12,'LightWood')
cylinder('TableLeg',(-1.8,.2,.31),.08,.62,'Timber')
for x,y in [(-2.02,.20),(-1.59,.2),(-1.8,-.06)]:
    cylinder('TeaCup',(x,y,.76),.07,.12,'Cream',12)
    ring('CupHandle',(x+.075,y,.79),.04,.012,'Cream',(math.pi/2,0,0))

# Still pond, bare fruit tree and planted plot share positions in both seasons.
cylinder('Pond',(3.65,-.15,.025),1.35,.045,'Ice',40)
for i in range(26):
    a=math.tau*i/26;x=3.65+1.45*math.cos(a);y=-.15+1.45*math.sin(a)
    rock('PondStone',(x,y,.12),(.23,.27,.18),'Stone')
    if i%2==0:snow_parts.append(sphere('PondSnow',(x,y,.25),(.23,.24,.065),'Snow',10,6))
curve('Solid_Tree',[(-4.3,3.4,0),(-4.4,3.4,1.4),(-4.15,3.4,3.15)],.21,'Timber')
# Closed, folded leaves and individual five-petal flowers replace the solid
# coloured canopy balls. One seasonal mesh keeps the existing reveal binding.
tree_batches={key:([],[]) for key in ('Leaf','LeafLight','Pink','Cream')}
def tree_leaf(center,direction,length,width,roll,mat):
    verts,faces=detail_geometry['folded_leaf'](center,direction,length,width,roll)
    out_v,out_f=tree_batches[mat];offset=len(out_v)
    out_v.extend(verts);out_f.extend(tuple(offset+v for v in face) for face in faces)

for i in range(9):
    a=math.tau*i/9;end=(-4.3+1.2*math.cos(a),3.4+1.1*math.sin(a),2.7+(i%3)*.38)
    curve('BareBranch',[(-4.3,3.4,1.8),(-4.3+.5*math.cos(a),3.4+.5*math.sin(a),2.65),end],.065,'Timber')
    for j in range(2):
        tip=(end[0]+.45*math.cos(a+j-.5),end[1]+.45*math.sin(a+j-.5),end[2]+.4)
        beam('Twig',end,tip,.025,'Timber')
        for side in (-1,1):
            fork=Vector(end).lerp(Vector(tip),.55)
            twig_tip=fork+Vector((.22*math.cos(a+side*.9),.22*math.sin(a+side*.9),.27))
            beam('FineTwig',fork,twig_tip,.012,'Timber')
    rng=random.Random(1614+i)
    for j in range(75):
        theta=rng.uniform(0,math.tau);z=rng.uniform(-1,1);r=math.sqrt(1-z*z)
        normal=Vector((r*math.cos(theta),r*math.sin(theta),z))
        center=Vector(end)+Vector((normal.x*.72,normal.y*.66,normal.z*.60))
        tree_leaf(center,normal+Vector((0,0,.35)),rng.uniform(.12,.20),.065,rng.uniform(-1.4,1.4),'LeafLight' if j%3 else 'Leaf')
    for j in range(48):
        theta=rng.uniform(0,math.tau);z=rng.uniform(-.9,1);r=math.sqrt(1-z*z)
        normal=Vector((r*math.cos(theta),r*math.sin(theta),z))
        center=Vector(end)+Vector((normal.x*.83,normal.y*.76,normal.z*.69))
        across=normal.cross(Vector((0,0,1))).normalized();up=normal.cross(across)
        phase=rng.uniform(0,math.tau)
        for petal in range(5):
            angle=phase+petal*math.tau/5
            direction=across*math.cos(angle)+up*math.sin(angle)
            # Lift petal tips into a shallow cup; fully closed geometry is
            # readable from below as the player walks beneath the branches.
            axis=(direction+normal*.25).normalized()
            reference=Vector((0,0,1)) if abs(axis.z)<.95 else Vector((0,1,0))
            base_across=reference.cross(axis).normalized();base_normal=axis.cross(base_across)
            width_axis=normal.cross(axis).normalized()
            roll=math.atan2(width_axis.dot(base_normal),width_axis.dot(base_across))
            tree_leaf(center+direction*.065,axis,.075,.052,roll,'Pink' if j%3 else 'Cream')
for mat,(verts,faces) in tree_batches.items():
    canopy.append(mesh('SpringCanopy' if mat=='Leaf' else 'TreeBloom_'+mat,verts,faces,mat))
cube('Solid_PlantBed',(1,-.65,.12),(1.05,1.1,.24),'LightWood')
cube('Soil',(1,-.65,.25),(.91,.95,.04),'Soil')
plant_parts=[]
for i in range(5):
    a=math.tau*i/5;x=1+.26*math.cos(a);y=-.65+.26*math.sin(a)
    plant_parts.append(beam('PlantedStem',(x,y,.26),(x,y,.66),.018,'Leaf'))
    for j in range(5):
        b=math.tau*j/5;plant_parts.append(sphere('PlantedPetal',(x+.08*math.cos(b),y+.08*math.sin(b),.68),(.08,.04,.025),'Cream',8,4))
join_named('PlantedFlowers',plant_parts,(1,-.65,.25))
# A hook waits by the west tree; the chime appears only when hung.
curve('ChimeHook',[(-4.4,.3,0),(-4.4,.3,2.0),(-4.0,.3,2.1)],.05,'Timber')
chime_parts=[]
for j in range(4):
    x=-4.2+j*.13
    chime_parts.append(beam('ChimeString',(x,.3,2.0),(x,.3,1.75),.008,'Timber'))
    chime_parts.append(cylinder('ChimeTube',(x,.3,1.50-j*.04),.03,.5+j*.08,'Brass'))
join_named('HangingChime',chime_parts,(-4,.3,2))

# Orange mailbox outside the main gate and a return beacon at the landing.
cylinder('MailPost',(2.2,-3.25,.60),.10,1.2,'Timber')
cube('MailBody',(2.2,-3.25,1.3),(.72,.55,.48),'Mailbox',.10)
sphere('MailRoof',(2.2,-3.25,1.52),(.36,.275,.24),'Mailbox')
cube('Envelope',(2.2,-3.56,1.32),(.4,.035,.25),'Cream')
sphere('Seal',(2.2,-3.59,1.31),(.045,.02,.045),'Mailbox')
snow_parts.append(sphere('MailSnow',(2.2,-3.25,1.69),(.34,.26,.07),'Snow'))
cylinder('BeaconPlinth',(-1.7,-4.8,.14),.65,.28,'Stone')
for i in range(3):
    a=math.tau*i/3
    curve('BeaconRib',[(-1.7+.36*math.cos(a),-4.8+.36*math.sin(a),.25),(-1.7+.43*math.cos(a),-4.8+.43*math.sin(a),.9),(-1.7,-4.8,1.7)],.05,'Brass')
sphere('BeaconCrystal',(-1.7,-4.8,.95),(.23,.23,.43),'Glass')

# Visible paths direct the first visit through the small west wicket.
for i in range(13):rock('WicketPath',(-4.05,-4.7+i*.49,.025),(.43,.30,.06),'Stone')
for i in range(10):rock('GatePath',(0,-5.7+i*.55,.025),(.5,.30,.06),'Stone')
for i in range(10):rock('HousePath',(.1,.15+i*.21,.025),(.48,.18,.055),'Stone')
for i in range(60):
    x=random.uniform(-7.7,7.7);y=random.uniform(-6.8,6.0)
    if x*x+y*y>7.7**2 or (-.9<x<4.2 and 1.7<y<5.8):continue
    snow_parts.append(sphere('SnowPatch',(x,y,.018),(random.uniform(.25,.7),random.uniform(.25,.55),.035),'Snow',10,6))
for i in range(160):
    x=random.uniform(-7.8,7.8);y=random.uniform(-6.6,5.5)
    if x*x+y*y>7.8**2 or (-3.2<x<4.2 and 1.6<y<5.8) or (x-3.65)**2+(y+.15)**2<2.1:continue
    flowers.append(beam('MeadowStem',(x,y,0),(x,y,.23),.012,'Leaf'))
    for j in range(4):
        a=math.tau*j/4;flowers.append(sphere('MeadowPetal',(x+.055*math.cos(a),y+.055*math.sin(a),.25),(.06,.04,.025),'Cream' if i%3 else 'Pink',8,4))
terrain=runpy.run_path(str(ROOT/'scripts/home-terrain-detail.py'))
terrain_report=terrain['refine_terrain'](scene,mesh,material,curve,world='garden',winter_parts=snow_parts,spring_parts=canopy)
masonry=runpy.run_path(str(ROOT/'scripts/garden-masonry-detail.py'))
masonry_report=masonry['refine_masonry'](scene,mesh,M,snow_parts)
tree=runpy.run_path(str(ROOT/'scripts/garden-tree-detail.py'))
tree_report=tree['refine_tree'](scene,mesh,material,canopy)
join_named('WinterSnow',snow_parts,(0,0,0));join_named('SpringCanopy',canopy,(0,0,0));join_named('SpringFlowers',flowers,(0,0,0))

for name,pos in {'PlayerSpawn':(0,-5.8,.08),'Interact_Beacon':(-.6,-4.8,.05),'Interact_GardenMail':(2.2,-4.1,.05),
 'Interact_GardenGate':(0,-3.4,.05),'Interact_Giant':(1.85,1.10,.05),'Interact_Cabinet':(-2.1,2.55,.05),
 'Interact_EmptyChairs':(-2.85,-.55,.05),'Interact_PlantSeeds':(1,-1.65,.05),'Interact_HangChime':(-4,-.65,.05),
 'Interact_TeaTable':(-1.8,-.7,.05)}.items():anchor(name,pos)

keep={'Ground_Surface','GateLeft','GateRight','GiantPortrait','Pond','WinterSnow','SpringCanopy','SpringFlowers','PlantedFlowers','HangingChime'}
for obj in scene.objects:
    if obj.type!='MESH':continue
    if obj.data.uv_layers.get('BarkGrain') is not None:continue
    uv=obj.data.uv_layers.get('UVMap')
    if uv is None:uv=obj.data.uv_layers.new(name='UVMap')
    for p in obj.data.polygons:
        normal=obj.matrix_world.to_3x3()@p.normal;axis=max(range(3),key=lambda j:abs(normal[j]));coords=[j for j in range(3) if j!=axis]
        for index in p.loop_indices:
            co=obj.matrix_world@obj.data.vertices[obj.data.loops[index].vertex_index].co
            uv.data[index].uv=(co[coords[0]]*.5,co[coords[1]]*.5)
for mat in M.values():
    objects=[o for o in scene.objects if o.type=='MESH' and o.name not in keep and not o.name.startswith('Solid_') and len(o.data.materials)==1 and o.data.materials[0]==mat]
    if len(objects)>1:join_named('DetailBatch_'+mat.name,objects)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.fbx(filepath=str(EXPORT/'GardenArt-v1.fbx'),use_selection=True,object_types={'MESH','EMPTY'},axis_forward='-Z',axis_up='Y',bake_anim=False,add_leaf_bones=False,colors_type='LINEAR')
for image in maps.values():image.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'GardenArt-v1.blend'))
report={'meshObjects':sum(o.type=='MESH' for o in scene.objects),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in scene.objects if o.type=='MESH'),
 'terrain':terrain_report,'masonry':masonry_report,'tree':tree_report,
 'unityMaterials':[{'name':m.name,'color':list(m.diffuse_color),'texture':next((n.image.name+'.png' for n in m.node_tree.nodes if n.type=='TEX_IMAGE'),None)} for m in M.values()],
 'license':'Original Blender geometry and procedural textures; free tools only.'}
(SOURCE/'garden-art-v1.report.json').write_text(json.dumps(report,indent=2));(EXPORT/'GardenArt-v1.json').write_text(json.dumps(report,indent=2))
print('GARDEN_ART_OK',report['meshObjects'],report['triangles'])
