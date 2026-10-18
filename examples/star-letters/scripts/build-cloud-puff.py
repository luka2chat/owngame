"""A small, fused cloud mesh, made with Blender's free metaball modeller."""
import bpy
from pathlib import Path
root=Path(__file__).resolve().parents[1]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
data=bpy.data.metaballs.new('Fused cloud');data.resolution=.18;data.render_resolution=.18
data.threshold=.65
obj=bpy.data.objects.new('CloudPuff',data);bpy.context.collection.objects.link(obj)
for x,y,z,radius in [(-1.2,0,0,.92),(-.55,0,.38,1.05),(.2,0,.55,1.12),
                      (1,0,.10,.96),(0,.5,-.10,.88),(0,-.5,-.10,.9)]:
    e=data.elements.new();e.co=(x,y,z);e.radius=radius
bpy.context.view_layer.objects.active=obj;obj.select_set(True)
bpy.ops.object.convert(target='MESH');obj=bpy.context.object
mod=obj.modifiers.new('Web mesh budget','DECIMATE');mod.ratio=.48
bpy.ops.object.modifier_apply(modifier=mod.name)
for face in obj.data.polygons:face.use_smooth=True
bpy.ops.export_scene.fbx(filepath=str(root/'unity/LittleOrbit/Assets/Models/Story/CloudPuff-v2.fbx'),
    use_selection=True,object_types={'MESH'},axis_forward='-Z',axis_up='Y',bake_anim=False)
bpy.ops.wm.save_as_mainfile(filepath=str(root/'art/models/home-v2/CloudPuff-v2.blend'))
print('CLOUD_TRIANGLES',sum(len(p.vertices)-2 for p in obj.data.polygons))
