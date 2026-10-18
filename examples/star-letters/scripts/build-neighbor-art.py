"""Two friends' planet, original free Blender geometry. Keeps moving parts separate."""
from pathlib import Path
import runpy
kit=Path(__file__).with_name('story-art-kit.py')
exec(compile(kit.read_text(),str(kit),'exec'),globals())
DETAIL=runpy.run_path(str(ROOT/'scripts/home-detail-geometry.py'))
SOURCE=ROOT/'art/models/neighbor-v1';SOURCE.mkdir(parents=True,exist_ok=True)
random.seed(613)

def detail(name,data,mat,smooth=False):return mesh(name,data[0],data[1],mat,smooth)

def herb(x,y,z,size=.28,seed=1):
    rng=random.Random(seed)
    for i in range(10):
        a=i*math.tau/10
        detail('HerbLeaf',DETAIL['folded_leaf']((x+math.cos(a)*size*.28,y+math.sin(a)*size*.28,z+size*.25),
            (math.cos(a),math.sin(a),rng.uniform(.4,1.6)),size*.55,size*.20,rng.uniform(-.3,.3)),
            'LeafLight' if i%3 else 'Leaf')

def pot(x,y,z,radius=.2,height=.36):
    detail('ClayPot',DETAIL['turned_profile'](x,y,z,[(0,0),(radius*.65,0),(radius,height*.86),
        (radius*1.08,height*.86),(radius*1.08,height),(radius*.84,height),(radius*.80,height*.78),
        (radius*.57,height*.15),(0,height*.15)]),'Mailbox',True)
    cylinder('PotSoil',(x,y,z+height*.80),radius*.81,.025,'Soil')
    herb(x,y,z+height*.85,radius*1.4,round((x+y)*100))

def join_named(name,objects,pivot=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    if len(objects)>1:bpy.ops.object.join()
    obj=bpy.context.object;obj.name=name
    if pivot is not None:
        scene.cursor.location=pivot;bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    return obj

def collect_since(before,name,pivot=None):
    return join_named(name,[o for o in scene.objects if o.type=='MESH' and o not in before],pivot)

# One continuous walkable top; every interaction has a reachable approach.
segments=72;rings=[(.01,0),(7.8,0),(8.6,-.12),(9,-.6),(8.6,-2),(6.2,-3.8),(.01,-4.6)]
vs=[];fs=[]
for r,z in rings:
    for i in range(segments):
        a=math.tau*i/segments;vs.append((r*math.cos(a),r*math.sin(a),z))
for j in range(len(rings)-1):
    for i in range(segments):
        k=(i+1)%segments;fs.append((j*segments+i,(j+1)*segments+i,(j+1)*segments+k,j*segments+k))
ground=mesh('Ground_Surface',vs,fs,'Meadow',True);ground.data.materials.append(M['Earth'])
for p in ground.data.polygons:p.material_index=0 if p.index//segments<2 else 1
for i in range(60):
    a=math.tau*i/60;r=8.6
    rock('RimStone',(r*math.cos(a),r*math.sin(a),-.35),(.50,.55,.55))
    a+=.04
    rock('CliffStone',(8.2*math.cos(a),8.2*math.sin(a),-1.7),(.65,.7,.9))
for i in range(68):
    a=math.tau*i/68;rock('PathStone',(5.7*math.cos(a),4.8*math.sin(a),.025),(.4,.37,.06),'Stone')
for x in (-3.8,3.5):
    for j in range(7):rock('Doorstep',(x,-1.2+j*.4,.03),(.52,.27,.06),'Stone')

def cottage(name,x,y,width=3.0,depth=2.7):
    cube('Solid_'+name,(x,y,1.15),(width,depth,2.3),'Plaster',.16)
    cube('Foundation',(x,y,.14),(width+.18,depth+.18,.28),'Stone')
    front=y-depth/2
    # One facade skin removes the seam between the box wall and gable.
    mesh('Facade',[(x-width/2,front-.018,.15),(x+width/2,front-.018,.15),(x+width/2,front-.018,2.3),
        (x,front-.018,3.35),(x-width/2,front-.018,2.3)],[(0,1,2,3,4)],'Plaster')
    mesh('BackGable',[(x-width/2,y+depth/2,2.2),(x+width/2,y+depth/2,2.2),(x,y+depth/2,3.35)],[(2,1,0)],'Plaster')
    for row in range(2):
        for yy in (front-.055,y+depth/2+.055):
            for i in range(8):
                left=max(x-width/2-.07,x-width/2-.07+(i-.5*(row%2))*(width+.14)/7)
                right=min(x+width/2+.07,x-width/2-.07+(i+1-.5*(row%2))*(width+.14)/7)
                if right>left:cube('FoundationStone',((left+right)/2,yy,.09+row*.16),(right-left-.018,.13,.145),'Stone',.025)
    for side in (-1,1):
        for row in range(6):
            cube('CornerQuoin',(x+side*(width/2-.07),front-.05,.43+row*.27),(.27 if row%2 else .38,.12,.22),'Stone',.025)
    for side in (-1,1):
        for col in range(4):
            xx=side*(col+.5)*(width+.55)/8
            z=3.37-abs(xx)*.61
            for row in range(9):
                tile=cube('RoofTile',(x+xx,y-depth/2-.18+row*(depth+.45)/9,z),((width+.55)/8+.10,(depth+.45)/9+.06,.12),random.choice(['Teal','Teal','TealLight']),.035)
                tile.rotation_euler.y=side*math.radians(31)
        beam('RoofFascia',(x,front-.25,3.47),(x+side*(width/2+.3),front-.25,2.32),.08,'Timber')
    beam('Ridge',(x,y-depth/2-.3,3.47),(x,y+depth/2+.3,3.47),.09,'TealLight')
    for i in range(7):
        left=x-.39+i*.78/7;right=left+.78/7-.009
        detail('DoorPlank',DETAIL['arched_panel'](x,front-.14,.12,.39,1.43,.055,(left,right)),
            'LightWood' if name=='Workshop' else 'Teal')
    for side in (-1,1):
        for j in range(5):cube('DoorJamb',(x+side*.465,front-.12,.27+j*.245),(.14,.17,.228),'Stone',.02)
    for i in range(11):
        detail('DoorArch',DETAIL['arch_stone'](x,front-.22,1.43,.40,.54,i*math.pi/11+.012,(i+1)*math.pi/11-.012,.18),'Stone')
    for z in (.45,1.16):
        cube('DoorHinge',(x-.22,front-.21,z),(.34,.025,.055),'Dark',.015)
        for dx in (-.12,.12):sphere('HingeRivet',(x-.22+dx,front-.229,z),(.018,.012,.018),'Brass',8,4)
    ring('DoorRing',(x+.23,front-.24,.93),.067,.012,'Brass',(math.pi/2,0,0))
    for side in (-1,1):
        wx=x+side*width*.34
        detail('WindowTrim',DETAIL['arched_panel'](wx,front-.08,1.02,.32,1.55,.13),'Timber')
        detail('WindowGlass',DETAIL['arched_panel'](wx,front-.15,1.09,.255,1.55,.025),'Glass')
        cube('WindowCross',(wx,front-.18,1.42),(.04,.03,.6),'LightWood',.01)
        cube('WindowCrossbar',(wx,front-.18,1.43),(.52,.03,.035),'LightWood',.01)
        for shutter in (-1,1):
            for slat in range(5):cube('ShutterSlat',(wx+shutter*.405,front-.08,1.16+slat*.13),(.14,.08,.115),'TealDark',.012)
        cube('FlowerBox',(wx,front-.22,.97),(.67,.32,.20),'LightWood')
        for j in range(4):herb(wx-.24+j*.15,front-.24,1.09,.16,100+j)
    cube('Chimney',(x-.7,y+.5,3.12),(.43,.46,1.1),'Stone')
    cube('ChimneyCap',(x-.7,y+.5,3.71),(.61,.63,.15),'TealDark')
    for row in range(5):
        for col in range(2):cube('ChimneyBrick',(x-.7+(col-.5)*.22,y+.258,2.78+row*.18),(.20,.06,.15),'Stone',.015)
    # Small ivy patches follow the eaves rather than obscuring the windows.
    rng=random.Random(630 if name=='Workshop' else 631)
    for side in (-1,1):
        points=[(x+side*(width/2+.08),front-.16,2.31),(x+side*(width/2-.05),front-.18,1.96),(x+side*(width/2+.03),front-.17,1.6)]
        curve('IvyStem',points,.018,'Leaf')
        for j in range(22):
            z=rng.uniform(1.6,2.39);xx=x+side*(width/2)+rng.uniform(-.13,.13)
            detail('IvyLeaf',DETAIL['folded_leaf']((xx,front-.2,z),(rng.uniform(-1,1),-.5,rng.uniform(-.5,.5)),.095,.06,rng.uniform(-.5,.5)),
                'LeafLight' if j%3 else 'Leaf')
    if name=='GardenHouse':pot(x+width/2-.2,front-.48,0,.22,.38)

cottage('Workshop',-3.8,3.3)
cottage('GardenHouse',3.2,3.5,2.8,2.7)

# Windmill on the workshop; a separate pivot drives the visible reward animation.
before=set(scene.objects);pivot=(-3.8,1.78,4.15)
for i in range(4):
    a=math.tau*i/4+.25
    end=(-3.8+1.42*math.cos(a),1.78,4.15+1.42*math.sin(a))
    beam('SailSpoke',pivot,end,.045,'Timber')
    vs=[(-3.8+.32*math.cos(a),1.8,4.15+.32*math.sin(a)),end,
        (-3.8+1.42*math.cos(a+.48),1.8,4.15+1.42*math.sin(a+.48)),
        (-3.8+.6*math.cos(a+.48),1.8,4.15+.6*math.sin(a+.48))]
    mesh('CanvasSail',vs,[(0,1,2,3),(3,2,1,0)],'Cream')
    beam('SailOuterRib',end,vs[2],.032,'Timber')
hub=cylinder('WindmillHub',pivot,.19,.16,'Brass');hub.rotation_euler.x=math.pi/2
collect_since(before,'Windmill',pivot)
beam('MillSupport',(-3.8,2.2,3.2),(-3.8,2.2,4.2),.11,'Timber')

# Workbench and hanging chimes.
cube('Workbench',(-5.05,.95,.8),(1.25,.6,.12),'LightWood')
for x in (-5.55,-4.55):beam('BenchLeg',(x,.95,.02),(x,.95,.8),.06,'Timber')
for j in range(4):
    x=-4.8+j*.28
    beam('ChimeString',(x,1.77,2.27),(x,1.77,1.9),.01,'Timber')
    cylinder('ChimeTube',(x,1.77,1.7-j*.04),.035,.4+j*.08,'Brass')

# Open workshop porch: shaded working area with a clear central approach.
for x in (-5.47,-2.13):
    cube('Solid_PorchPost', (x,.55,1.07),(.13,.13,2.14),'Timber',.025)
    cube('PorchPostFoot',(x,.55,.10),(.23,.23,.20),'Stone',.035)
beam('PorchLintel',(-5.6,.55,2.16),(-2,.55,2.16),.075,'Timber')
for i in range(12):
    x=-5.55+(i+.5)*3.5/12
    panel=cube('PorchRoof',(x,1.23,2.4),(.31,1.64,.10),'Teal' if i%3 else 'TealLight',.025)
    panel.rotation_euler.x=math.radians(14)
for x in (-5.5,-3.8,-2.1):beam('PorchRafter',(x,.43,2.13),(x,2.01,2.53),.045,'Timber')
for x in (-5.47,-2.13):
    beam('PorchBrace',(x,.55,1.7),(x+(.40 if x<-3.8 else -.4),.55,2.14),.04,'LightWood')
for j in range(5):cube('BenchTopPlank',(-5.05,.71+j*.12,.875),(1.28,.112,.045),'LightWood',.015)
cube('WorkbenchShelf',(-5.05,.95,.29),(1.1,.54,.06),'Timber',.015)
for j in range(4):
    beam('SpareTube',(-5.5+j*.23,.76,.35),(-5.5+j*.23,1.1,.35),.025,'Brass')
# Hammer, vise and an open tray make the workbench legible at walking distance.
beam('HammerHandle',(-5.35,.72,.92),(-5.02,.87,.92),.022,'Timber')
cube('HammerHead',(-5.35,.72,.94),(.07,.17,.08),'Dark',.018)
cube('ViseBase',(-4.63,.79,.92),(.17,.16,.08),'Dark',.015)
for x in (-4.7,-4.57):cube('ViseJaw',(x,.79,1.0),(.045,.16,.12),'Dark',.01)
beam('ViseScrew',(-4.77,.79,.98),(-4.49,.79,.98),.018,'Brass')
beam('ViseHandle',(-4.48,.71,.98),(-4.48,.87,.98),.015,'Brass')
for z,r in [(.94,.1),(1.04,.08)]:cylinder('PartsJar',(-5.05,1.07,z),r,.13,'TealLight',12)
for j in range(3):
    x=-5.26+j*.22
    beam('PorchChimeString',(x,.64,2.1),(x,.64,1.83),.008,'Timber')
    cylinder('PorchChime',(x,.64,1.65-j*.035),.034,.38+j*.07,'Brass',12)
pot(-2.35,1.60,0,.18,.32)

def lantern(name,x,y,z):
    cube('LampBack',(x,y+.06,z+.13),(.14,.07,.32),'Dark',.025)
    beam('LampArm',(x,y,z+.25),(x,y-.20,z+.25),.025,'Dark')
    cylinder('LampBase',(x,y-.2,z-.19),.14,.055,'Dark',12)
    cylinder('LampGlass',(x,y-.2,z),.105,.32,'Glass',12)
    for side in (-1,1):beam('LampFrame',(x+side*.11,y-.2,z-.17),(x+side*.11,y-.2,z+.17),.014,'Dark')
    bpy.ops.mesh.primitive_cone_add(vertices=12,radius1=.19,radius2=.045,depth=.14,location=(x,y-.2,z+.23))
    finish(bpy.context.object,'LampCap','Dark')
    anchor(name,(x,y-.3,z))
lantern('WorkshopLamp',-2.62,1.70,1.67)
lantern('GardenHouseLamp',2.57,1.94,1.9)

# Freestanding wind vane and a west-side streaming ribbon as the clue.
cylinder('VanePost',(-5.6,-.4,.75),.09,1.5,'Timber')
before=set(scene.objects)
beam('VaneArrow',(-5.6,-1.04,1.62),(-5.6,.24,1.62),.035,'Brass')
mesh('VaneHead',[(-5.6,.40,1.62),(-5.79,.02,1.62),(-5.41,.02,1.62)],[(0,1,2),(2,1,0)],'Brass')
cube('VaneTail',(-5.6,-.87,1.62),(.34,.26,.06),'Mailbox')
collect_since(before,'Vane',(-5.6,-.4,1.62))
ring('CompassBase',(-5.6,-.4,.13),.55,.05,'Stone')
beam('RibbonPole',(-7,-1.4,0),(-7,-1.4,2.05),.06,'Timber')
mesh('WestWindRibbon',[(-7,-1.4,1.95),(-6.5,-1.48,1.91),(-6.0,-1.35,2.0),(-5.7,-1.40,1.92),
    (-7,-1.4,1.75),(-6.5,-1.48,1.71),(-6.0,-1.35,1.8),(-5.7,-1.40,1.72)],
    [(0,1,5,4),(1,2,6,5),(2,3,7,6),(4,5,1,0),(5,6,2,1),(6,7,3,2)],'Mailbox')

# Greenhouse uses open timber framing so the plants remain visible and costs stay low.
gx,gy=5.6,3.4
cube('Solid_GreenhouseFloor',(gx,gy,.10),(2.1,2.8,.20),'Stone')
for x in (gx-1,gx+1):
    for y in (gy-1.3,gy,gy+1.3):
        beam('GreenhousePost',(x,y,.2),(x,y,2.1),.055,'LightWood')
        beam('GreenhouseRafter',(x,y,2.1),(gx,y,2.75),.055,'LightWood')
    beam('GreenhouseLintel',(x,gy-1.3,2.1),(x,gy+1.3,2.1),.055,'LightWood')
beam('GreenhouseRidge',(gx,gy-1.4,2.75),(gx,gy+1.4,2.75),.06,'LightWood')
glass=material('GreenhouseGlass',(.57,.76,.69),None,.16)
glass.diffuse_color=(.57,.76,.69,.22)
glass.node_tree.nodes['Principled BSDF'].inputs['Alpha'].default_value=.22
for side in (-1,1):
    for j in range(2):
        ya=gy-1.27+j*1.30;yb=ya+1.24
        mesh('GreenhousePane',[(gx+side*.95,ya,2.12),(gx+side*.95,yb,2.12),(gx+side*.04,yb,2.70),(gx+side*.04,ya,2.70)],
            [(0,1,2,3),(3,2,1,0)],'GreenhouseGlass')
    beam('GreenhouseSideRail',(gx+side,gy-1.3,1.2),(gx+side,gy+1.3,1.2),.04,'LightWood')
for j in range(3):cube('SeedShelf',(gx-.87,gy-.85+j*.82,.58),(.35,.68,.07),'LightWood',.02)
for x in (gx-.5,gx+.5):
    for y in (gy-.8,gy,gy+.8):
        pot(x,y,.20,.18,.32)

# Central stream and a low wooden bridge. Decorative water does not trap walking.
material('Water',(.22,.52,.61),None,.28)
cube('Stream',(0,-.6,.02),(.65,7.6,.035),'Water',.01)
for side in (-1,1):
    for j in range(14):rock('StreamBank',(side*.52,-4+j*.5,.05),(.25,.31,.15),'Stone')
for i in range(11):cube('BridgePlank',(-1+i*.2,0,.13),(.19,1.05,.16),'LightWood',.02)
for y in (-.56,.56):
    beam('BridgeRail',(-1.1,y,.75),(1.1,y,.75),.045,'Timber')
    for x in (-1.1,1.1):beam('BridgePost',(x,y,.1),(x,y,.82),.055,'Timber')

# Reservoir / water gate / routing valve. Moving handles stay separate for interaction.
cylinder('Reservoir',(5,-2.2,.35),.74,.7,'Stone',24)
cylinder('ReservoirWater',(5,-2.2,.71),.61,.035,'Water',24)
for row in range(2):
    for i in range(18):
        a=(i+row*.5)*math.tau/18
        block=cube('ReservoirStone',(5+math.cos(a)*.72,-2.2+math.sin(a)*.72,.17+row*.33),(.13,.24,.30),'Stone',.025)
        block.rotation_euler.z=a
ring('ReservoirRim',(5,-2.2,.69),.71,.055,'Stone')
for x in (4.45,4.95):beam('SluicePost',(x,-2.8,.1),(x,-2.8,1.4),.07,'Timber')
cube('SluiceGate',(4.7,-2.8,.58),(.44,.13,.84),'LightWood')
before=set(scene.objects)
beam('GateLever',(4.7,-2.8,1.2),(4.7,-3.3,1.2),.065,'LightWood')
collect_since(before,'SluiceHandle',(4.7,-2.8,1.2))
cube('SupplyTrough',(3.5,-2.2,.10),(2.4,.43,.18),'Stone')
cylinder('ValveBase',(2.3,-1.9,.22),.40,.44,'Stone')
before=set(scene.objects)
beam('ValveLever',(2.3,-1.9,.47),(2.3,-1.4,.47),.055,'Brass')
sphere('ValveKnob',(2.3,-1.4,.47),(.10,.10,.10),'Mailbox')
collect_since(before,'DiverterHandle',(2.3,-1.9,.47))
cube('FieldTrough',(3.25,-.95,.06),(.32,2.8,.11),'Stone')
cube('BypassTrough',(1.2,-2.25,.06),(2.5,.35,.11),'Stone')
cube('IrrigationWater',(3.25,-.95,.13),(.22,2.8,.04),'Water',.01)
cube('BypassWater',(1.2,-2.25,.13),(2.5,.22,.04),'Water',.01)
for side in (-1,1):
    for j in range(7):cube('FieldChannelEdge',(3.25+side*.19,-2.18+j*.4,.14),(.085,.37,.16),'Stone',.015)
    for j in range(6):cube('SupplyChannelEdge',(2.51+j*.39,-2.2+side*.255,.17),(.37,.09,.18),'Stone',.015)
cube('Solid_Bed',(4.55,.1,.19),(1.65,1.60,.38),'LightWood')
cube('BedSoil',(4.55,.1,.40),(1.48,1.43,.04),'Soil')
before=set(scene.objects)
for x in (4.1,4.55,5):
    for y in (-.35,.1,.55):
        beam('SeedlingStem',(x,y,.41),(x,y,.74),.018,'Leaf')
        for s in (-1,1):sphere('SeedlingLeaf',(x+s*.09,y,.63),(.13,.055,.06),'LeafLight',8,6)
        sphere('SeedlingBud',(x,y,.77),(.075,.075,.07),'Cream',8,6)
collect_since(before,'Seedlings')

# Two chairs and a round table echo the garden. Unity adds the rendered photo
# inside this editable frame (StoryPhotoSetup.Apply), sharing it with inspection UI.
for x in (-.85,.85):
    cube('Solid_Chair',(x,2.45,.40),(.55,.55,.13),'LightWood')
    for dx in (-.21,.21):
        for dy in (-.21,.21):beam('ChairLeg',(x+dx,2.45+dy,0),(x+dx,2.45+dy,.43),.035,'Timber')
    for z in (.65,.85):cube('ChairBack',(x,2.72,z),(.58,.07,.13),'Timber')
    for dx in (-.24,.24):beam('ChairPost',(x+dx,2.72,.25),(x+dx,2.72,1.0),.04,'Timber')
cylinder('TeaTable',(0,2.75,.64),.35,.12,'LightWood')
cylinder('TableLeg',(0,2.75,.30),.07,.6,'Timber')
beam('PhotoPost',(0,3.5,0),(0,3.5,1.7),.065,'Timber')
cube('PhotoFrame',(0,3.5,1.73),(1.55,.16,1.08),'LightWood',.06)
cube('PhotoPaper',(0,3.4,1.73),(1.35,.025,.88),'Cream',.02)

# Neighbor's departure lantern.
cylinder('BeaconPlinth',(-2.4,-4.3,.15),.70,.3,'Stone')
for i in range(3):
    a=math.tau*i/3
    curve('BeaconRib',[(-2.4+.4*math.cos(a),-4.3+.4*math.sin(a),.25),
        (-2.4+.48*math.cos(a),-4.3+.48*math.sin(a),1.0),(-2.4,-4.3,1.8)],.05,'Brass')
sphere('BeaconCrystal',(-2.4,-4.3,.95),(.23,.23,.44),'Glass')

for name,pos in {
 'PlayerSpawn':(0,-5.8,.08),'Interact_Artisan':(-3.8,.2,.05),'Interact_Vane':(-5.6,-1.4,.05),
 'Interact_Gardener':(3.2,.3,.05),'Interact_Diverter':(1.4,-1.9,.05),'Interact_Sluice':(4.6,-3.6,.05),
 'Interact_Photo':(0,2.15,.05),'Interact_Beacon':(-1.2,-4.3,.05),
 'NPC_Artisan':(-3.8,1.1,.05),'NPC_Gardener':(3.2,1.2,.05)}.items():anchor(name,pos)

# Small flowers and foliage around the outer rim leave the paths clear.
for i in range(200):
    a=random.random()*math.tau;r=random.uniform(6.9,8.3)
    x,y=r*math.cos(a),r*math.sin(a)
    beam('WildflowerStem',(x,y,0),(x,y,.2),.012,'Leaf')
    for j in range(4):
        b=math.tau*j/4
        sphere('Wildflower',(x+.055*math.cos(b),y+.055*math.sin(b),.23),(.065,.04,.025),['Cream','Pink','Lavender'][i%3],8,4)

terrain=runpy.run_path(str(ROOT/'scripts/home-terrain-detail.py'))
terrain_report=terrain['refine_terrain'](scene,mesh,material,curve,world='neighbor')

keep={'Ground_Surface','Windmill','Vane','SluiceHandle','DiverterHandle','IrrigationWater','BypassWater','Seedlings','BeaconCrystal'}
for obj in scene.objects:
    if obj.type!='MESH':continue
    uv=obj.data.uv_layers.get('UVMap')
    if uv is None:uv=obj.data.uv_layers.new(name='UVMap')
    for poly in obj.data.polygons:
        normal=obj.matrix_world.to_3x3()@poly.normal;axis=max(range(3),key=lambda i:abs(normal[i]));coords=[i for i in range(3) if i!=axis]
        for index in poly.loop_indices:
            co=obj.matrix_world@obj.data.vertices[obj.data.loops[index].vertex_index].co
            uv.data[index].uv=(co[coords[0]]*.5,co[coords[1]]*.5)
for mat in M.values():
    objects=[o for o in scene.objects if o.type=='MESH' and o.name not in keep and not o.name.startswith('Solid_')
             and len(o.data.materials)==1 and o.data.materials[0]==mat]
    if len(objects)>1:join_named('DetailBatch_'+mat.name,objects)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.fbx(filepath=str(EXPORT/'NeighborArt-v1.fbx'),use_selection=True,
    object_types={'MESH','EMPTY'},axis_forward='-Z',axis_up='Y',bake_anim=False,add_leaf_bones=False)
for image in maps.values():image.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'NeighborArt-v1.blend'))
report={'meshObjects':sum(o.type=='MESH' for o in scene.objects),
    'terrain':terrain_report,
    'detailRevision':2,
    'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in scene.objects if o.type=='MESH'),
    'unityMaterials':[{'name':m.name,'color':list(m.diffuse_color),'texture':next((n.image.name+'.png' for n in m.node_tree.nodes if n.type=='TEX_IMAGE'),None)} for m in M.values()],
    'license':'Original geometry and procedural pixels, made with free Blender; no downloaded model.'}
(SOURCE/'neighbor-art-v1.report.json').write_text(json.dumps(report,indent=2))
(EXPORT/'NeighborArt-v1.json').write_text(json.dumps(report,indent=2))
print('NEIGHBOR_ART_OK',report['meshObjects'],report['triangles'])
