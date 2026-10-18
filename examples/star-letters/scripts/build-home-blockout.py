"""Deterministic, editable home layout. Run with Blender --background --python this_file.

Builds only the dedicated HomeBlockout-v1 files; never edits the reference art or old demo.
Coordinates are Blender metres (Z up). Named anchors survive FBX import into Unity.
"""
import bpy
import json
import math
import random
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'art/blockouts'
EXPORT = ROOT / 'unity/LittleOrbit/Assets/Models/Story'
SOURCE.mkdir(parents=True, exist_ok=True)
EXPORT.mkdir(parents=True, exist_ok=True)
random.seed(16)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1.0

def material(name, rgb, roughness=0.8):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*rgb, 1)
    mat.use_nodes = True
    node = mat.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value = (*rgb, 1)
    node.inputs['Roughness'].default_value = roughness
    return mat

M = {
    'grass': material('Sage grass', (0.32, .43, .23)),
    'grass_light': material('Meadow light', (.43, .51, .29)),
    'rock': material('Warm rock', (.37, .33, .30)),
    'stone': material('Path sandstone', (.66, .57, .43)),
    'cream': material('Plaster cream', (.83, .72, .51)),
    'roof': material('Patinated teal roof', (.17, .35, .32)),
    'wood': material('Warm timber', (.32, .17, .08)),
    'mail': material('Terracotta mailbox', (.76, .23, .08)),
    'gold': material('Brass', (.68, .40, .10), .4),
    'light': material('Warm lantern glass', (1, .62, .17)),
    'white': material('Flower petals', (.96, .9, .69)),
    'leaf': material('Tree foliage', (.27, .40, .17)),
    'water': material('Stored rainwater', (.23, .43, .49)),
}

def group(name, loc=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    scene.collection.objects.link(obj)
    obj.location = loc
    return obj

def finish(obj, name, mat, parent=None):
    obj.name = name
    if mat:
        obj.data.materials.append(M[mat])
    if parent:
        obj.parent = parent
    return obj

def cube(name, loc, scale, mat, parent=None, bevel=.05):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new('Soft edges', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return finish(obj, name, mat, parent)

def ico(name, loc, scale, mat, parent=None, subdiv=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdiv, radius=1, location=loc)
    obj = bpy.context.object
    obj.scale = scale
    return finish(obj, name, mat, parent)

def cylinder(name, loc, radius, depth, mat, parent=None, vertices=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    return finish(bpy.context.object, name, mat, parent)

def beam(name, a, b, radius, mat, parent=None):
    vec = Vector(b) - Vector(a)
    obj = cylinder(name, (Vector(a) + Vector(b)) / 2, radius, vec.length, mat, parent)
    obj.rotation_euler = vec.to_track_quat('Z', 'Y').to_euler()
    return obj

def anchor(name, pos):
    obj = group(name, pos)
    obj.empty_display_type = 'ARROWS'
    obj.empty_display_size = .5
    return obj

# Wide flat walkable cap, rounded underside; a fixed world-up controller can traverse it.
segments = 64
rings = [(0.01, 0), (7.8, 0), (8.8, -.12), (9.6, -.8), (9.0, -2.5), (6.5, -4.2), (.01, -5)]
verts, faces = [], []
for radius, height in rings:
    for i in range(segments):
        angle = math.tau * i / segments
        verts.append((radius * math.cos(angle), radius * math.sin(angle), height))
for j in range(len(rings) - 1):
    for i in range(segments):
        ni = (i + 1) % segments
        faces.append((j*segments+i, (j+1)*segments+i, (j+1)*segments+ni, j*segments+ni))
mesh = bpy.data.meshes.new('Planet surface mesh')
mesh.from_pydata(verts, [], faces)
mesh.update()
planet = bpy.data.objects.new('Ground_Surface', mesh)
scene.collection.objects.link(planet)
for key in ['grass', 'grass_light', 'rock']:
    mesh.materials.append(M[key])
for face in mesh.polygons:
    band = face.index // segments
    face.material_index = random.randrange(2) if band < 2 else 2

# One loop, large enough for a 0.35m-radius character. Stones are visual only.
paths = group('Paths')
for i in range(60):
    a = math.tau * i / 60
    x, y = 5.8 * math.cos(a), 4.8 * math.sin(a)
    stone = ico('PathStone', (x, y, .035), (.52, .40, .08), 'stone', paths)
    stone.rotation_euler.z = a
for i in range(10):
    cube('Doorstep', (-3, -1 + i * .43, .04), (1.3, .37, .08), 'stone', paths)

# Cottage, 4m wide, 3.6m deep, 2.5m walls; main door faces negative Y.
house = group('Cottage')
cube('Cottage_Walls', (-3, 3.2, 1.25), (4.0, 3.6, 2.5), 'cream', house, .16)
for side in (-1, 1):
    roof = cube('Cottage_Roof', (-3 + side * 1.08, 3.2, 3.1), (2.6, 4.25, .20), 'roof', house)
    roof.rotation_euler.y = side * math.radians(27)
cube('Cottage_Door', (-3, 1.37, 1.0), (1.0, .10, 2.0), 'wood', house, .12)
for x in (-4.25, -1.75):
    cube('WindowFrame', (x, 1.35, 1.55), (.7, .12, .85), 'wood', house)
    cube('WindowGlass', (x, 1.27, 1.55), (.54, .03, .66), 'light', house)
cube('Chimney', (-4.1, 3.6, 3.65), (.55, .6, 1.4), 'stone', house)
anchor('Blocker_Cottage', (-3, 3.2, 1.25))

mail = group('Mailbox')
cylinder('MailboxPost', (-5.2, -3.0, .6), .10, 1.2, 'wood', mail)
cube('MailboxBox', (-5.2, -3, 1.3), (.66, .55, .55), 'mail', mail, .12)
cube('Letter', (-5.2, -3.3, 1.28), (.40, .035, .22), 'white', mail)
anchor('Interact_Mailbox', (-5.2, -3.7, .05))

bed = group('FlowerBed')
cube('Soil', (-.9, -.7, .11), (2.2, 1.8, .22), 'wood', bed)
for x in (-2.0, .2):
    cube('BedFrame', (x, -.7, .22), (.12, 1.95, .35), 'wood', bed)
for y in (-1.65, .25):
    cube('BedFrame', (-.9, y, .22), (2.3, .12, .35), 'wood', bed)
cylinder('FlowerStem', (-.9, -.7, .62), .045, .8, 'leaf', bed)
for i in range(7):
    a = math.tau * i / 7
    ico('FlowerPetal', (-.9 + .2*math.cos(a), -.7 + .2*math.sin(a), 1.03), (.18, .12, .07), 'white', bed)
ico('FlowerHeart', (-.9, -.7, 1.07), (.12, .12, .08), 'gold', bed)
anchor('Interact_Flower', (-.9, -2.2, .05))

tool = group('Toolbox')
cube('ToolboxBody', (-.6, 2.5, .3), (.9, .55, .6), 'wood', tool)
cube('ToolboxLid', (-.6, 2.5, .65), (1.0, .65, .15), 'roof', tool)
cube('BrassSparePart', (-.6, 2.5, .82), (.3, .20, .2), 'gold', tool)
anchor('Interact_Toolbox', (-.1, 1.7, .05))

beacon = group('Beacon')
cylinder('BeaconPlinth', (4.7, -3.2, .14), 1.0, .28, 'stone', beacon, 24)
cylinder('BeaconFoot', (4.7, -3.2, .40), .5, .35, 'gold', beacon)
for i in range(3):
    a = math.tau * i / 3
    beam('BeaconRib', (4.7 + .6*math.cos(a), -3.2 + .6*math.sin(a), .3), (4.7 + .2*math.cos(a), -3.2 + .2*math.sin(a), 1.65), .07, 'gold', beacon)
ico('BeaconCrystal', (4.7, -3.2, 1.1), (.27, .27, .50), 'light', beacon, 2)
anchor('Interact_Beacon', (3.4, -3.3, .05))

tree = group('FruitTree')
beam('TreeTrunk', (2.2, 3.6, 0), (2.1, 3.6, 3), .27, 'wood', tree)
for i in range(7):
    a = math.tau * i / 7
    end = (2.2 + 1.3*math.cos(a), 3.6 + 1.1*math.sin(a), 3.1 + .3*(i%2))
    beam('Branch', (2.1, 3.6, 1.7), end, .11, 'wood', tree)
    ico('Canopy', end, (1.1, .95, .8), 'leaf', tree, 2)
    ico('Fruit', (end[0], end[1]-.6, end[2]-.4), (.13,.13,.13), 'mail', tree, 2)
anchor('Blocker_Tree', (2.2, 3.6, 1.0))
bench = group('Bench')
cube('BenchSeat', (2.3, 2.2, .5), (1.8, .5, .14), 'wood', bench)
cube('BenchBack', (2.3, 2.45, .9), (1.8, .12, .65), 'wood', bench)
for x in (1.6, 3.0):
    cube('BenchLeg', (x, 2.2, .25), (.15, .4, .5), 'wood', bench)

scope = group('Telescope')
for i in range(3):
    a = math.tau * i / 3
    beam('Tripod', (6 + .5*math.cos(a), 1.8 + .5*math.sin(a), 0), (6, 1.8, 1.1), .04, 'wood', scope)
beam('TelescopeTube', (5.6, 1.8, 1.2), (6.65, 1.8, 1.55), .12, 'gold', scope)

details = group('RimRocks')
for i in range(38):
    a = math.tau*i/38
    r = 8.65 + random.uniform(-.15, .15)
    rock = ico('RimRock', (r*math.cos(a), r*math.sin(a), -.1), (.4 + random.random()*.4,.45,.4), 'rock', details)
    rock.rotation_euler.z = a
anchor('PlayerSpawn', (0, -5.0, .08))

# Export only model objects, no preview camera or light; keep source editing hierarchy.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.fbx(filepath=str(EXPORT/'HomeBlockout-v1.fbx'), use_selection=True,
    object_types={'MESH','EMPTY'}, apply_unit_scale=True, axis_forward='-Z', axis_up='Y',
    add_leaf_bones=False, bake_anim=False, path_mode='AUTO')

# Art preview is not evidence of Unity runtime quality.
world = bpy.data.worlds.new('Warm studio sky')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (.29, .34, .45, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = .5
scene.world = world
bpy.ops.object.light_add(type='AREA', location=(-7,-8,14))
bpy.context.object.name = 'Preview_KeyLight'
bpy.context.object.data.energy = 2100
bpy.context.object.data.shape = 'DISK'
bpy.context.object.data.size = 9
bpy.context.object.rotation_euler = (Vector((0,0,0))-bpy.context.object.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.light_add(type='SUN', location=(4,4,8))
bpy.context.object.name = 'Preview_Sun'
bpy.context.object.rotation_euler = (.45,-.55,-.3)
bpy.context.object.data.energy = 1.6
bpy.ops.object.camera_add(location=(15,-23,18))
camera = bpy.context.object
camera.name = 'Preview_Camera'
camera.rotation_euler = (Vector((0,0,-.5))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 25
scene.camera = camera
scene.render.engine = 'CYCLES'
scene.cycles.samples = 24
scene.render.resolution_x = 1280
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = str(SOURCE/'home-blockout-v1.png')
scene.view_settings.view_transform = 'AgX'
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'HomeBlockout-v1.blend'))
report = {
    'source': str(SOURCE/'HomeBlockout-v1.blend'), 'export': str(EXPORT/'HomeBlockout-v1.fbx'),
    'units': 'metres', 'stage': 'layout blockout, not final game art',
    'meshObjects': sum(o.type == 'MESH' for o in scene.objects),
    'triangles': sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in scene.objects if o.type=='MESH'),
    'anchors': {o.name:list(o.location) for o in scene.objects if o.type=='EMPTY' and (o.name.startswith('Interact_') or o.name=='PlayerSpawn')}
}
(SOURCE/'home-blockout-v1.report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
bpy.ops.render.render(write_still=True)
print('HOME_BLOCKOUT_OK ' + json.dumps(report))
