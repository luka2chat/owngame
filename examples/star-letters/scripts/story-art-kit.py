"""Shared original Blender primitives and palette for the story planets."""
import bpy
import json
import math
import random
from pathlib import Path
from mathutils import Vector, noise

ROOT = Path(__file__).resolve().parents[1]
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

