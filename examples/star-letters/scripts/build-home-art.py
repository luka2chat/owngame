"""Free, deterministic Blender art pass. No downloaded model or paid service.

Keeps the proven layout/anchors. Produces a separate FBX and editable .blend.
Small procedural albedo maps are original pixels generated here; Blender nodes
are not relied on at runtime. Dense decorative geometry is joined by material.
"""
import bpy
import json
import math
import random
import runpy
import sys
from pathlib import Path
from mathutils import Vector, noise

ROOT = Path(__file__).resolve().parents[1]
DETAIL = runpy.run_path(str(ROOT / 'scripts/home-detail-geometry.py'))
SOURCE = ROOT / 'art/models/home-v2'
ASSETS = ROOT / 'unity/LittleOrbit/Assets'
EXPORT = ASSETS / 'Models/Story'
TEXTURES = ASSETS / 'Textures/Story'
for directory in (SOURCE, EXPORT, TEXTURES):
    directory.mkdir(parents=True, exist_ok=True)
random.seed(612)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1
M = {}

def texture(name, style):
    size = 256
    image = bpy.data.images.new(name, width=size, height=size)
    pixels = []
    for y in range(size):
        for x in range(size):
            u, v = x / size, y / size
            # Periodic coordinates keep tiled maps seamless.
            p = Vector((math.cos(u*math.tau)*2, math.sin(u*math.tau)*2,
                        math.cos(v*math.tau)*2))
            n = noise.noise_vector(p)[0]
            grain = random.uniform(-.025, .025)
            if style == 'wood':
                # Fine, low-contrast fibres along the front-facing timber grain.
                value = .91 + .026*math.sin(u*math.tau*32 + n*1.3) + n*.035 + grain*.3
            elif style == 'meadow':
                value = .83 + n*.13 + grain
            else:
                value = .9 + n*.07 + grain
            pixels.extend((value, value, value, 1))
    image.pixels.foreach_set(pixels)
    image.filepath_raw = str(TEXTURES / (name+'.png'))
    image.file_format = 'PNG'
    image.save()
    return image

maps = {k:texture('V2_'+k, k) for k in ('wood','plaster','meadow')}

def material(key, rgb, style=None, roughness=.8, metal=0):
    mat = bpy.data.materials.new('V2_'+key)
    mat.diffuse_color = (*rgb,1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*rgb,1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metal
    if style:
        tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
        tex.image = maps[style]
        tint = mat.node_tree.nodes.new('ShaderNodeMixRGB')
        tint.blend_type = 'MULTIPLY'
        tint.inputs[0].default_value = 1
        tint.inputs[2].default_value = (*rgb,1)
        mat.node_tree.links.new(tex.outputs['Color'], tint.inputs[1])
        mat.node_tree.links.new(tint.outputs[0], bsdf.inputs['Base Color'])
    M[key] = mat
    return mat

for key, rgb, style in [
    ('Meadow',(.39,.51,.23),'meadow'),('Earth',(.30,.24,.17),'plaster'),
    ('Rock',(.47,.44,.36),'plaster'),('Stone',(.73,.66,.50),'plaster'),
    ('Plaster',(.91,.82,.63),'plaster'),('Timber',(.37,.20,.09),'wood'),
    ('LightWood',(.63,.39,.18),'wood'),('Soil',(.23,.16,.09),'plaster'),
    ('Teal',(.15,.37,.34),'plaster'),('TealLight',(.23,.46,.39),'plaster'),
    ('TealDark',(.09,.24,.23),'plaster'),('Mailbox',(.86,.29,.10),'plaster'),
    ('Cream',(.99,.93,.73),None),('Leaf',(.27,.43,.13),None),
    ('LeafLight',(.49,.59,.19),None),('Grass',(.48,.57,.23),None),
    ('GrassDark',(.26,.39,.14),None),('Pink',(.77,.32,.41),None),
    ('Lavender',(.49,.42,.67),None),('Glass',(.98,.65,.21),None),
    ('Brass',(.61,.40,.16),None),('Dark',(.11,.17,.17),None)]:
    material(key,rgb,style, .35 if key=='Brass' else .8, .45 if key=='Brass' else 0)

def finish(obj, name, mat, smooth=False):
    obj.name=name
    obj.data.materials.append(M[mat])
    for poly in obj.data.polygons:
        poly.use_smooth=smooth
    return obj

def cube(name, pos, size, mat, bevel=.04):
    bpy.ops.mesh.primitive_cube_add(size=1,location=pos)
    obj=bpy.context.object
    obj.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=obj.modifiers.new('Rounded handmade edges','BEVEL')
        mod.width=bevel; mod.segments=2
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return finish(obj,name,mat)

def sphere(name,pos,size,mat,segments=12,rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,radius=1,location=pos)
    obj=bpy.context.object; obj.scale=size
    return finish(obj,name,mat,True)

def rock(name,pos,size,mat='Rock'):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=pos)
    obj=bpy.context.object; obj.scale=size
    obj.rotation_euler=(random.random()*.4,random.random()*.4,random.random()*math.tau)
    return finish(obj,name,mat,True)

def cylinder(name,pos,radius,depth,mat,vertices=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=pos)
    return finish(bpy.context.object,name,mat,True)

def beam(name,a,b,radius,mat):
    vec=Vector(b)-Vector(a)
    obj=cylinder(name,(Vector(a)+Vector(b))/2,radius,vec.length,mat,10)
    obj.rotation_euler=vec.to_track_quat('Z','Y').to_euler()
    return obj

def mesh(name,vertices,faces,mat,smooth=False):
    data=bpy.data.meshes.new(name)
    data.from_pydata(vertices,[],faces); data.update()
    obj=bpy.data.objects.new(name,data); scene.collection.objects.link(obj)
    return finish(obj,name,mat,smooth)

def curve(name,points,radius,mat):
    data=bpy.data.curves.new(name,'CURVE'); data.dimensions='3D'
    data.bevel_depth=radius; data.bevel_resolution=2; data.resolution_u=12
    spline=data.splines.new('BEZIER'); spline.bezier_points.add(len(points)-1)
    for point,co in zip(spline.bezier_points,points):
        point.co=co; point.handle_left_type='AUTO'; point.handle_right_type='AUTO'
    obj=bpy.data.objects.new(name,data); scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active=obj; obj.select_set(True)
    # Avoid converting unrelated selected objects.
    for other in bpy.context.selected_objects:
        if other!=obj: other.select_set(False)
    bpy.ops.object.convert(target='MESH')
    return finish(bpy.context.object,name,mat,True)

def ring(name,pos,major,minor,mat,rotation=(0,0,0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major,minor_radius=minor,
        major_segments=24,minor_segments=6,location=pos,rotation=rotation)
    return finish(bpy.context.object,name,mat,True)

def anchor(name,pos):
    obj=bpy.data.objects.new(name,None); scene.collection.objects.link(obj)
    obj.location=pos; obj.empty_display_type='ARROWS'

def detail_mesh(name, data, mat, smooth=False):
    return mesh(name, data[0], data[1], mat, smooth)

def foliage(name, centers, rng, length=.15, mat='LeafLight'):
    vertices=[];faces=[]
    for center in centers:
        angle=rng.uniform(0,math.tau)
        direction=(math.cos(angle),math.sin(angle),rng.uniform(-.5,.8))
        size=length*rng.uniform(.7,1.2)
        lv,lf=DETAIL['folded_leaf'](center,direction,size,size*.48,rng.uniform(-1.2,1.2))
        offset=len(vertices);vertices.extend(lv)
        faces.extend(tuple(offset+i for i in face) for face in lf)
    return mesh(name,vertices,faces,mat)

# Smooth flat grass cap, curved cliff underside. Surface is one material, no pie wedges.
segments=96
rings=[(.01,0),(7.8,0),(8.4,-.04),(8.9,-.25),(9.3,-.75),(9.15,-1.8),(8.1,-3.0),(6.1,-4.1),(3,-4.8),(.01,-5)]
verts=[]; faces=[]
for band,(radius,height) in enumerate(rings):
    for i in range(segments):
        a=math.tau*i/segments
        wav=.06*math.sin(a*9)+.07*math.sin(a*13)
        r=radius+(wav if band>1 else 0)
        verts.append((r*math.cos(a),r*math.sin(a),height))
for j in range(len(rings)-1):
    for i in range(segments):
        k=(i+1)%segments
        faces.append((j*segments+i,(j+1)*segments+i,(j+1)*segments+k,j*segments+k))
ground=mesh('Ground_Surface',verts,faces,'Meadow',True)
ground.data.materials.append(M['Earth'])
for p in ground.data.polygons: p.material_index=0 if p.index//segments<3 else 1
for i in range(70):
    a=math.tau*i/70; r=random.uniform(8.6,9.05)
    rock('EdgeStone',(r*math.cos(a),r*math.sin(a),random.uniform(-.7,-.25)),
         (random.uniform(.35,.75),random.uniform(.35,.65),random.uniform(.35,.7)))
for i in range(36):
    a=math.tau*i/36; r=8.65
    rock('CliffStone',(r*math.cos(a),r*math.sin(a),-1.75),(.6,.6,random.uniform(.7,1.2)))

# Shallow rounded stepping stones; wide continuous loop guides the opening route.
for i in range(74):
    a=math.tau*i/74
    obj=rock('PathStone',(5.8*math.cos(a),4.8*math.sin(a),.015),(.36,.38,.065),'Stone')
    obj.rotation_euler=(0,0,a)
for i in range(6):
    rock('Doorstep',(-3,-1+i*.43,.025),(.61,.25,.065),'Stone')

# Cottage: cream plaster, curved overlapping teal roof, timber frame, round window.
def roof_z(x): return 4.14-1.64*(abs(x)/2.4)**.67

cube('Cottage_Walls',(-3,3.2,1.25),(4,3.6,2.5),'Plaster',.16)
cube('CottageFoundation',(-3,3.2,.16),(4.17,3.77,.32),'Stone',.1)
# Staggered masonry breaks up the otherwise continuous foundation strip.
# Its projection stays within the existing foundation footprint.
detail_rng=random.Random(1943)
for row in range(2):
    for side_y in (1.395,5.005):
        for i in range(10):
            start=-5.04+(i-.5*(row%2))*4.08/9
            left=max(-5.04,start);right=min(-.96,start+4.08/9)
            if right-left<.05:continue
            cube('FoundationBlock',((left+right)/2,side_y,.11+row*.18),(right-left-.025,.16,.165),
                 'Stone' if i%3 else 'Rock',.035)
    for side_x in (-5.005,-.995):
        for i in range(8):
            cube('FoundationBlock',(side_x,1.58+i*.46,.11+row*.18),(.16,.42,.165),
                 'Stone' if i%3 else 'Rock',.035)
# Follow the same curve as the tiles so plaster cannot poke through the roof.
gable_outline=[(-5,2.4),(-1,2.4)]
for i in range(25):
    x=2-i/6
    gable_outline.append((-3+x,roof_z(x)-.09))
detail_mesh('CottageGables',DETAIL['extruded_outline'](gable_outline,1.4,3.6),'Plaster')
for x in (-4.91,-1.09):
    cube('CornerTimber',(x,1.34,1.30),(.15,.14,2.36),'Timber',.025)
cube('FrontLintel',(-3,1.29,2.42),(4,.14,.17),'Timber')

for side in (-1,1):
    for col in range(5):
        x0=col*.48; x1=(col+1)*.48+.04
        for row in range(12):
            y0=.91+row*.375; y1=y0+.43
            vs=[]
            for y in (y0,y1):
                for n in range(5):
                    x=x0+(x1-x0)*n/4
                    vs.append((-3+side*x,y,roof_z(x)+.055*math.sin(math.pi*n/4)))
            tile=mesh('RoofTile',vs,[(n,n+1,n+6,n+5) if side>0 else (n+5,n+6,n+1,n) for n in range(4)],
                      random.choice(['Teal','Teal','TealLight','TealDark']),True)
            mod=tile.modifiers.new('Tile thickness','SOLIDIFY');mod.thickness=.07
            bpy.context.view_layer.objects.active=tile;bpy.ops.object.modifier_apply(modifier=mod.name)
    curve('RoofFascia',[(-3+side*x,.87,roof_z(x)-.04) for x in (0,.6,1.2,1.8,2.45)],.095,'Timber')
curve('RoofRidge',[(-3,y,4.23) for y in (.72,2,4,5.65)],.11,'TealLight')
for x in (-5.42,-.58):
    beam('RoofEave',(x,.8,2.49),(x,5.6,2.49),.11,'Timber')

# A true semicircular timber door; the stone surround follows its silhouette.
# The cream wall remains the solid collision proxy (there is no interior yet).
detail_mesh('ArchedDoorFrame',DETAIL['arched_panel'](-3,1.16,.06,.62,1.48,.18),'Timber')
detail_mesh('ArchedDoor',DETAIL['arched_panel'](-3,1.10,.09,.535,1.48,.06),'Dark')
for j in range(7):
    left=-3.535+j*1.07/7+.007;right=-3.535+(j+1)*1.07/7-.007
    detail_mesh('OakDoorPlank',DETAIL['arched_panel'](-3,1.065,.10,.535,1.48,.035,(left,right)),
                'LightWood' if j%3 else 'Timber')
for i in range(13):
    start=i*math.pi/13+.012;end=(i+1)*math.pi/13-.012
    detail_mesh('DoorArchStone',DETAIL['arch_stone'](-3,1.08,1.48,.63,.79,start,end,.22),
                'Stone' if i%4 else 'Plaster')
for side in (-1,1):
    for i in range(5):
        cube('DoorJamb',(-3+side*.71,1.19,.17+i*.273),(.16,.22,.255),'Stone',.018)
for z in (.53,1.34):
    cube('DoorHinge',(-3.34,1.025,z),(.30,.035,.052),'Dark',.012)
    for x in (-3.45,-3.24):sphere('HingeRivet',(x,1.002,z),(.015,.012,.015),'Brass',8,4)
cube('DoorHandlePlate',(-2.65,1.024,.97),(.075,.025,.16),'Brass',.02)
ring('DoorHandle',(-2.65,.994,.97),.052,.012,'Dark',(math.pi/2,0,0))
cube('DoorstepTop',(-3,1.03,.06),(1.62,.48,.12),'Stone',.04)

# Two small porch lanterns, with geometric glowing panes and fine brass frames.
for x in (-3.94,-2.06):
    cube('LanternBracket',(x,1.25,2.04),(.09,.09,.25),'Dark',.02)
    curve('LanternHook',[(x,1.24,2.13),(x,.92,2.15),(x,.88,2.06)],.019,'Dark')
    ring('LanternHandle',(x,.88,2.00),.062,.013,'Brass',(math.pi/2,0,0))
    cube('LanternGlow',(x,.88,1.79),(.16,.16,.27),'Glass',.025)
    for dx in (-.105,.105):
        for dy in (-.105,.105):
            beam('LanternFrame',(x+dx,.88+dy,1.61),(x+dx,.88+dy,1.97),.013,'Brass')
    for z in (1.61,1.96):cube('LanternRim',(x,.88,z),(.26,.26,.045),'Brass',.02)
    bpy.ops.mesh.primitive_cone_add(vertices=4,radius1=.205,radius2=.05,depth=.13,location=(x,.88,2.035),rotation=(0,0,math.pi/4))
    finish(bpy.context.object,'LanternRoof','TealDark')

# Hollow clay pots and herbs are clustered at the wall, clear of the door path.
pot_profile=[(0,0),(.14,0),(.19,.04),(.245,.35),(.26,.35),(.26,.40),
             (.218,.40),(.21,.34),(.12,.065),(0,.065)]
for x,y,scale in [(-4.82,.98,1),(-1.19,.96,.85),(-4.50,.94,.65)]:
    profile=[(r*scale,z*scale) for r,z in pot_profile]
    detail_mesh('ClayHerbPot',DETAIL['turned_profile'](x,y,.02,profile),'Mailbox',True)
    cylinder('PotSoil',(x,y,.34*scale),.21*scale,.025,'Soil')
    centers=[]
    for stem in range(7):
        angle=stem*math.tau/7
        tip=(x+math.cos(angle)*.14*scale,y+math.sin(angle)*.14*scale,.66*scale)
        beam('HerbStem',(x,y,.33*scale),tip,.009,'Leaf')
        for step in range(3):
            centers.append((tip[0],tip[1],tip[2]-.07*step*scale))
    foliage('PottedHerbs',centers,detail_rng,.10*scale)
for x in (-4.28,-1.72):
    cube('WindowTrim',(x,1.22,1.55),(.83,.18,.95),'Timber',.14)
    cube('WindowGlass',(x,1.1,1.55),(.64,.06,.75),'Glass',.11)
    cube('WindowCross',(x,1.04,1.55),(.055,.04,.8),'LightWood',.01)
    cube('WindowCross',(x,1.04,1.55),(.66,.04,.055),'LightWood',.01)
    for side in (-1,1):
        cube('Shutter',(x+side*.54,1.18,1.55),(.23,.10,.85),'Teal',.03)
        for k in range(5): cube('ShutterSlat',(x+side*.54,1.12,1.27+k*.13),(.24,.025,.035),'TealLight',.01)
    cube('WindowBox',(x,1.03,1.04),(.85,.40,.25),'LightWood')
    for k in range(6):
        sphere('WindowHerbs',(x-.32+k*.13,.99,1.25+random.random()*.08),(.12,.13,.17),'LeafLight',8,6)
ring('AtticWindow',(-3,1.27,3.11),.39,.07,'Timber',(math.pi/2,0,0))
glass=cylinder('AtticGlass',(-3,1.28,3.11),.34,.035,'Glass',24);glass.rotation_euler.x=math.pi/2
cube('AtticCross',(-3,1.21,3.11),(.055,.045,.67),'LightWood',.01)
cube('AtticCross',(-3,1.21,3.11),(.67,.045,.055),'LightWood',.01)
cube('Chimney',(-4.10,4.15,3.67),(.58,.65,1.75),'Plaster',.08)
for z in (3.3,3.6,3.9,4.2):
    cube('ChimneyStone',(-4.1,4.15,z),(.64,.70,.07),'Stone',.02)
cube('ChimneyCap',(-4.1,4.15,4.58),(.82,.86,.17),'TealDark',.06)
cube('ChimneyOpening',(-4.1,4.15,4.68),(.43,.45,.025),'Dark',.02)

# Ivy drapes over eaves and corner posts. Small folded leaves stay opaque and
# batch with the existing foliage materials, avoiding transparent overdraw.
for side in (-1,1):
    points=[(-3+side*x,.78,roof_z(x)+.03) for x in (.42,.9,1.4,1.95,2.4)]
    points.extend([(-3+side*2.10,1.12,2.10),(-3+side*1.93,1.16,1.72)])
    curve('CottageIvy',points,.023,'Leaf')
    centers=[]
    for a,b in zip(points,points[1:]):
        for j in range(7):
            t=j/7
            centers.append(tuple(a[k]*(1-t)+b[k]*t+detail_rng.uniform(-.09,.09) for k in range(3)))
    foliage('CottageIvyLeaves',centers,detail_rng,.13)
for i in range(30):
    side=detail_rng.choice((-1,1));x=detail_rng.uniform(.4,2.25);y=detail_rng.uniform(1,5.2)
    rock('RoofMoss',(-3+side*x,y,roof_z(x)+.065),(.16,.20,.045),'Leaf')

# Orange postal box: curved lid, narrow slot, visible envelope and raised flag.
cylinder('MailboxPost',(-5.2,-3,.61),.115,1.22,'Timber')
cube('MailboxFoot',(-5.2,-3,.10),(.37,.37,.20),'Stone')
cube('MailboxBody',(-5.2,-3,1.28),(.73,.61,.44),'Mailbox',.11)
sphere('MailboxRoof',(-5.2,-3,1.48),(.365,.305,.28),'Mailbox')
cube('MailSlot',(-5.2,-3.315,1.39),(.47,.025,.065),'Dark',.02)
cube('Envelope',(-5.2,-3.35,1.33),(.39,.035,.22),'Cream',.01)
for a,b in [((-5.39,-3.375,1.43),(-5.2,-3.38,1.32)),((-5.2,-3.38,1.32),(-5.01,-3.375,1.43))]:
    beam('EnvelopeFold',a,b,.006,'Brass')
cylinder('WaxSeal',(-5.2,-3.38,1.31),.038,.015,'Mailbox').rotation_euler.x=math.pi/2
beam('MailFlagPole',(-4.79,-3,1.22),(-4.79,-3,1.94),.025,'Brass')
cube('MailFlag',(-4.66,-3,1.88),(.26,.04,.16),'Mailbox')
cube('MailNameplate',(-5.2,-3.34,1.13),(.26,.03,.09),'Brass',.02)
anchor('Interact_Mailbox',(-5.2,-3.7,.05))

# First flower, with richer garden frame and a watering can.
cube('Soil',(-.9,-.7,.11),(2.2,1.8,.22),'Soil')
for x in (-2,.2): cube('BedFrame',(x,-.7,.24),(.15,1.98,.40),'LightWood')
for y in (-1.65,.25): cube('BedFrame',(-.9,y,.24),(2.35,.15,.40),'LightWood')
for x in (-2,.2):
    for y in (-1.65,.25):
        cube('GardenPeg',(x,y,.32),(.2,.2,.64),'Timber',.04)
for i in range(16):
    x=random.uniform(-1.85,.05); y=random.uniform(-1.5,.12)
    rock('SoilPebble',(x,y,.24),(.045,.04,.025),'Stone')
curve('FlowerStem',[(-.9,-.7,.24),(-.94,-.69,.64),(-.86,-.7,1.06)],.027,'Leaf')
for side in (-1,1):
    leaf=sphere('FlowerLeaf',(-.9+side*.12,-.7,.60+side*.12),(.17,.06,.055),'LeafLight')
    leaf.rotation_euler.y=side*.5
for i in range(8):
    a=math.tau*i/8
    petal=sphere('FlowerPetal',(-.86+.17*math.cos(a),-.7+.17*math.sin(a),1.07),(.17,.075,.045),'Cream')
    petal.rotation_euler.z=a
sphere('FlowerHeart',(-.86,-.7,1.11),(.11,.11,.065),'Glass')
cylinder('WateringCan',(.70,-.45,.27),.22,.43,'Teal')
beam('WateringSpout',(.8,-.45,.27),(1.12,-.45,.54),.055,'Teal')
ring('WateringHandle',(.52,-.45,.39),.22,.035,'Brass',(math.pi/2,0,0))
anchor('Interact_Flower',(-.9,-2.2,.05))

cube('ToolboxBody',(-.6,2.5,.29),(.9,.55,.58),'LightWood')
cube('ToolboxLid',(-.6,2.5,.64),(1,.65,.16),'Teal')
for x in (-.96,-.24): cube('ToolboxBand',(x,2.5,.31),(.07,.58,.6),'Brass',.01)
curve('ToolboxHandle',[(-.8,2.5,.72),(-.8,2.5,.87),(-.4,2.5,.87),(-.4,2.5,.72)],.025,'Timber')
cylinder('BrassSparePart',(-.6,2.5,.91),.12,.14,'Brass')
anchor('Interact_Toolbox',(-.1,1.7,.05))

# Lantern beacon: three swept bronze ribs, glazed core and roof finial.
cylinder('BeaconPlinth',(4.7,-3.2,.14),1,.28,'Stone',32)
cylinder('BeaconStep',(4.7,-3.2,.32),.71,.12,'Stone',24)
cylinder('BeaconFoot',(4.7,-3.2,.47),.48,.20,'Brass',24)
for i in range(3):
    a=math.tau*i/3
    def radial(r,z):return(4.7+r*math.cos(a),-3.2+r*math.sin(a),z)
    curve('BeaconRib',[radial(.49,.42),radial(.63,.9),radial(.51,1.78),radial(.15,2.23)],.065,'Brass')
ring('BeaconLowerRing',(4.7,-3.2,.75),.53,.045,'Brass')
ring('BeaconUpperRing',(4.7,-3.2,1.78),.49,.045,'Brass')
sphere('BeaconCrystal',(4.7,-3.2,1.24),(.25,.25,.49),'Glass',12,8)
cylinder('BeaconCrown',(4.7,-3.2,2.20),.23,.14,'Brass')
sphere('BeaconFinial',(4.7,-3.2,2.39),(.10,.10,.16),'Glass')
anchor('Interact_Beacon',(3.4,-3.3,.05))

# Fruit tree and a comfortable slatted bench.
curve('TreeTrunk',[(2.2,3.6,0),(2.05,3.6,1.2),(2.20,3.6,2.6)],.24,'Timber')
for i in range(9):
    a=math.tau*i/9
    end=(2.2+1.2*math.cos(a),3.6+1.1*math.sin(a),2.8+.55*(i%3))
    curve('Branch',[(2.14,3.6,1.6),((2.2+end[0])/2,(3.6+end[1])/2,2.5),end],.08,'Timber')
    # Smaller cores and individually folded leaves read as foliage from eye level.
    sphere('Canopy',end,(.61,.54,.49),'Leaf',12,8)
    leaf_rng=random.Random(930+i)
    leaf_centers=[]
    for leaf_index in range(110):
        a=leaf_rng.uniform(0,math.tau);z=leaf_rng.uniform(-1,1)
        r=math.sqrt(1-z*z)
        center=Vector(end)+Vector((.88*r*math.cos(a),.80*r*math.sin(a),.72*z))
        leaf_centers.append(center)
    # Two single-material batches can join all nine branches during export.
    foliage('TreeLeavesLight',leaf_centers[::2],leaf_rng,.25,'LeafLight')
    foliage('TreeLeavesShade',leaf_centers[1::2],leaf_rng,.25,'Leaf')
    for j in range(3):
        pos=(end[0]+random.uniform(-.6,.6),end[1]-.55,end[2]+random.uniform(-.6,.1))
        sphere('Fruit',pos,(.105,.105,.12),'Mailbox',10,6)
        beam('FruitStem',pos,(pos[0],pos[1],pos[2]+.16),.015,'Timber')
for j in range(3): cube('BenchSeat' if j==1 else 'BenchSlat',(2.3,2.0+j*.19,.52),(1.9,.17,.12),'LightWood')
for j in range(3): cube('BenchBack',(2.3,2.49,.75+j*.17),(1.9,.12,.14),'LightWood')
for x in (1.55,3.05):
    for y in (2.0,2.4): cube('BenchLeg',(x,y,.27),(.12,.12,.54),'Timber')
    beam('BenchUpright',(x,2.49,.3),(x,2.49,1.18),.055,'Timber')

for i in range(3):
    a=math.tau*i/3
    beam('Tripod',(6+.5*math.cos(a),1.8+.5*math.sin(a),.04),(6,1.8,1.12),.045,'Timber')
a,b=(5.65,1.8,1.18),(6.65,1.8,1.55)
beam('TelescopeTube',a,b,.14,'Brass')
beam('TelescopeLens',(6.61,1.8,1.535),(6.68,1.8,1.56),.16,'Dark')

# Batched grass ribbons / tiny five-petal meadow flowers: low geometry, no alpha.
gv=[]; gf=[]; fv=[]; ff=[]; fi=[]
def clear(x,y):
    if -5.5<x<-.45 and .8<y<5.7:return False
    if -2.3<x<.5 and -1.95<y<.55:return False
    if (x-4.7)**2+(y+3.2)**2<1.4:return False
    if abs((x/5.8)**2+(y/4.8)**2-1)<.18:return False
    if -3.7<x<-2.3 and -1.5<y<1.5:return False
    return True
for i in range(1750):
    x=random.uniform(-8.55,8.55); y=random.uniform(-8.55,8.55)
    if x*x+y*y>8.5**2 or not clear(x,y):continue
    for j in range(3):
        a=random.random()*math.tau; h=random.uniform(.12,.29); w=.027
        n=len(gv);dx=math.cos(a);dy=math.sin(a)
        gv.extend([(x-dy*w,y+dx*w,0),(x+dy*w,y-dx*w,0),(x+dx*.09,y+dy*.09,h)])
        gf.append((n,n+1,n+2));gf.append((n+2,n+1,n))
    if random.random()<.34:
        h=random.uniform(.14,.26)
        for j in range(5):
            a=math.tau*j/5; b=a+.48; c=a-.48; n=len(fv)
            fv.extend([(x,y,h),(x+.085*math.cos(c),y+.085*math.sin(c),h+.025),
                       (x+.105*math.cos(a),y+.105*math.sin(a),h+.035),
                       (x+.085*math.cos(b),y+.085*math.sin(b),h+.025)])
            ff.append((n,n+1,n+2,n+3));fi.append(i%5)
grass=mesh('MeadowGrass',gv,gf,'Grass')
grass.data.materials.append(M['GrassDark'])
for p in grass.data.polygons:p.material_index=(p.index//6)%3==0
flowers=mesh('MeadowFlowers',fv,ff,'Cream')
for key in ['Glass','Pink','Lavender','Cream']:flowers.data.materials.append(M[key])
for p,index in zip(flowers.data.polygons,fi):p.material_index=index

anchor('PlayerSpawn',(0,-5,.08))

# Replace only named tree parts after all original random draws are consumed.
# This keeps the cottage, terrain, flowers and gameplay layout deterministic.
tree=runpy.run_path(str(ROOT/'scripts/home-tree-detail.py'))
tree_report=tree['refine_home_tree'](scene,mesh,material,sphere)

# Refine named terrain objects before batching. Its private random stream keeps
# every unrelated seeded cottage, tree and decoration exactly where it was.
terrain=runpy.run_path(str(ROOT/'scripts/home-terrain-detail.py'))
terrain_report=terrain['refine_home_terrain'](scene,mesh,material,curve)

# Consistent world-space box UVs, so all albedo detail has a comparable scale.
for obj in list(scene.objects):
    if obj.type!='MESH':continue
    if obj.data.uv_layers.get('BarkGrain'):continue
    uv=obj.data.uv_layers.new(name='UVMap') if not obj.data.uv_layers else obj.data.uv_layers.active
    for poly in obj.data.polygons:
        normal=obj.matrix_world.to_3x3() @ poly.normal
        axis=max(range(3),key=lambda j:abs(normal[j]))
        coords=[j for j in range(3) if j!=axis]
        for index in poly.loop_indices:
            co=obj.matrix_world @ obj.data.vertices[obj.data.loops[index].vertex_index].co
            uv.data[index].uv=(co[coords[0]]*.5,co[coords[1]]*.5)

# Keep gameplay/collision meshes distinct; combine all other opaque details per
# material. Names/anchors remain stable and the source stays easy to select.
keep={'Ground_Surface','Cottage_Walls','TreeTrunk','BenchSeat','Soil','BeaconPlinth','BeaconCrystal'}
for mat in M.values():
    objects=[o for o in scene.objects if o.type=='MESH' and o.name not in keep
             and len(o.data.materials)==1 and o.data.materials[0]==mat]
    if len(objects)<2:continue
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.join();bpy.context.object.name='DetailBatch_'+mat.name

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.fbx(filepath=str(EXPORT/'HomeArt-v2.fbx'),use_selection=True,
    object_types={'MESH','EMPTY'},apply_unit_scale=True,axis_forward='-Z',axis_up='Y',
    add_leaf_bones=False,bake_anim=False,path_mode='AUTO')
report={'stage':'home art pass v2, cottage detail revision 2, gameplay layout preserved','seed':612,
    'detailRevision':2,
    'source':'art/models/home-v2/HomeArt-v2.blend','export':'Assets/Models/Story/HomeArt-v2.fbx',
    'meshObjects':sum(o.type=='MESH' for o in scene.objects),
    'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in scene.objects if o.type=='MESH'),
    'materials':{m.name:{'color':list(m.diffuse_color),'texture':next((n.image.name+'.png' for n in m.node_tree.nodes if n.type=='TEX_IMAGE'),None)} for m in M.values()},
    'license':'Original procedural geometry and pixels; no third-party assets or service fees.'}
report['unityMaterials']=[{'name':name,**values} for name,values in report['materials'].items()]
report['terrain']=terrain_report
report['tree']=tree_report
(SOURCE/'home-art-v2.report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
(EXPORT/'HomeArt-v2.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))

world=bpy.data.worlds.new('Warm studio');world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.45,.51,.67,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.6;scene.world=world
bpy.ops.object.light_add(type='AREA',location=(-7,-10,14))
key=bpy.context.object;key.name='Preview_Key';key.data.energy=2500;key.data.size=10
key.rotation_euler=(Vector((0,0,0))-key.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.light_add(type='SUN');bpy.context.object.data.energy=1.6
bpy.context.object.rotation_euler=(.5,-.5,-.4)
bpy.ops.object.camera_add(location=(14,-23,18));cam=bpy.context.object
cam.rotation_euler=(Vector((0,0,-.25))-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.type='ORTHO';cam.data.ortho_scale=24;scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=24
scene.render.resolution_x=1440;scene.render.resolution_y=1080;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(SOURCE/'home-art-v2-blender.png')
scene.view_settings.view_transform='AgX'
for image in maps.values():image.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'HomeArt-v2.blend'))
if '--skip-preview' not in sys.argv:bpy.ops.render.render(write_still=True)
# A perspective close-up is required as well as the overview: details that read
# well in an orthographic miniature can fail at the player's eye level.
bpy.ops.object.camera_add(location=(-.3,-5.5,2.65));detail_cam=bpy.context.object
detail_cam.name='Preview_Cottage_Close';detail_cam.data.type='PERSP';detail_cam.data.lens=34
detail_cam.rotation_euler=(Vector((-3,1.3,1.7))-detail_cam.location).to_track_quat('-Z','Y').to_euler()
scene.camera=detail_cam
scene.render.filepath=str(SOURCE/'home-cottage-detail-blender.png')
if '--skip-preview' not in sys.argv:bpy.ops.render.render(write_still=True)
scene.camera=cam
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'HomeArt-v2.blend'))
print('HOME_ART_OK '+json.dumps(report))
