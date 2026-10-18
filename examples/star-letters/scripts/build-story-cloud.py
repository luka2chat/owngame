"""Original fused cumulus mesh. Small editable working set; no image/model downloads."""
import bpy
import math
import random
from pathlib import Path

root=Path(__file__).resolve().parents[1]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
data=bpy.data.metaballs.new('Layered cumulus')
data.resolution=.11
data.render_resolution=.11
data.threshold=.64
obj=bpy.data.objects.new('Cumulus',data)
bpy.context.collection.objects.link(obj)
lobes=[(-1.55,0,0,.98),(-.6,0,.05,1.06),(.45,0,.05,1.08),(1.45,0,-.08,.9),
       (-.8,0,.75,1.03),(.15,0,1.0,1.08),(1,0,.55,.9),
       (-.65,.7,.0,.84),(.4,.7,.0,.9),(-.6,-.7,.0,.9),(.5,-.7,.1,.85)]
rng=random.Random(181026)
for i in range(9):
    a=i*math.tau/9
    lobes.append((math.cos(a)*1.35,math.sin(a)*.78,.48+rng.uniform(-.1,.30),rng.uniform(.48,.63)))
for x,y,z,radius in lobes:
    e=data.elements.new();e.co=(x,y,z);e.radius=radius
bpy.context.view_layer.objects.active=obj;obj.select_set(True)
bpy.ops.object.convert(target='MESH')
obj=bpy.context.object
before=sum(len(p.vertices)-2 for p in obj.data.polygons)
mod=obj.modifiers.new('Cloud silhouette budget','DECIMATE');mod.ratio=min(1,2800/max(1,before))
bpy.ops.object.modifier_apply(modifier=mod.name)
for p in obj.data.polygons:p.use_smooth=True
bpy.ops.export_scene.fbx(filepath=str(root/'unity/LittleOrbit/Assets/Models/Story/Cumulus-v3.fbx'),
    use_selection=True,object_types={'MESH'},axis_forward='-Z',axis_up='Y',bake_anim=False)
bpy.ops.wm.save_as_mainfile(filepath=str(root/'art/models/home-v2/Cumulus-v3.blend'))
print('CUMULUS_OK triangles',sum(len(p.vertices)-2 for p in obj.data.polygons))
