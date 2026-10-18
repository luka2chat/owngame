"""Hand-laid garden wall skins, without changing their collision cores.

Runs after the original random layout is complete, before material batching.
Uses its own RNG so doors, terrain, vegetation and story anchors remain stable.
"""
import math
import random
import bpy
from mathutils import Vector, noise


def refine_masonry(scene, mesh, materials, snow_parts):
    rng = random.Random(261018)
    # mathutils.noise owns a separate RNG; Python's Random does not seed it.
    noise.seed_set(261018)
    stones = sorted((o for o in scene.objects if o.name.split('.')[0] == 'WallMasonry'), key=lambda o:o.name)
    before_triangles = sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in stones)
    stone_count = 0
    for old in stones:
        name = old.name
        pos = old.location.copy()
        size = old.dimensions.copy()
        along = 0 if size.x > size.y else 1
        depth = 1-along
        # A thicker visible face allows broad worn edges instead of the former
        # narrow bevel. The back still overlaps the unchanged solid wall core.
        size[depth] = .16
        size[along] *= rng.uniform(.95, 1.025)
        size.z *= rng.uniform(.92, 1.10)
        pos.z += rng.uniform(-.017, .017)
        if old.location.z > .85:
            # The upper course covers the formerly exposed straight backing lip.
            size.z *= 1.25
            pos.z += .05
        pos[depth] += rng.uniform(-.012, .012)
        material = old.data.materials[0].name.replace('V2_', '')
        if material == 'Plaster':
            material = 'Stone'
        vertices = []
        # Correlated corner shifts make one uneven block, not noisy fragments.
        upper_tilt = rng.uniform(-.035, .035)
        lower_tilt = rng.uniform(-.025, .025)
        for z in (-1, 1):
            for y in (-1, 1):
                for x in (-1, 1):
                    v = Vector((x*size.x/2, y*size.y/2, z*size.z/2))
                    side = x if along == 0 else y
                    v.z += side*(upper_tilt if z > 0 else lower_tilt)
                    v[along] += rng.uniform(-.016, .016)
                    v[depth] += rng.uniform(-.009, .009)
                    vertices.append(tuple(v))
        faces = [(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)]
        bpy.data.objects.remove(old, do_unlink=True)
        obj = mesh(name, vertices, faces, material, True)
        obj.location = pos
        bpy.context.view_layer.objects.active = obj
        # Small chips and irregular corners stay inside a bounded silhouette.
        bevel = obj.modifiers.new('Worn stone corners','BEVEL')
        bevel.width = min(size[along]*.19, rng.uniform(.033, .058))
        bevel.segments = 3
        bpy.ops.object.modifier_apply(modifier=bevel.name)
        for v in obj.data.vertices:
            p = v.co + pos
            n = noise.noise_vector(p*9 + Vector((5.1,13.7,2.3)))
            v.co[depth] += n[depth]*.006
        weighted = obj.modifiers.new('Broad stone faces','WEIGHTED_NORMAL')
        weighted.keep_sharp = True
        weighted.weight = 35
        bpy.ops.object.modifier_apply(modifier=weighted.name)
        stone_count += 1

    caps = sorted((o for o in scene.objects if o.name.split('.')[0] == 'WallCap'),key=lambda o:o.name)
    for obj in caps:
        # Break the identical egg-shaped coping rhythm with low irregular slabs.
        obj.scale.x *= rng.uniform(.91,1.14)
        obj.scale.y *= rng.uniform(.90,1.08)
        obj.scale.z *= rng.uniform(.68,.95)
        obj.location.z += rng.uniform(-.015,.025)
        for v in obj.data.vertices:
            p=v.co
            factor=1+noise.noise_vector(p*2.8+obj.location)[0]*.14
            p *= factor

    wall_cores = [o for o in scene.objects if o.name in {
        'Solid_FrontWest','Solid_FrontMiddle','Solid_FrontEast','Solid_WestWall','Solid_EastWall','Solid_BackWall'}]
    for core in wall_cores:
        # The same solid backing reads as recessed warm mortar through joints.
        core.data.materials[0] = materials['Rock']

    removed_snow = 0
    for obj in list(snow_parts):
        if obj.name.split('.')[0] in {'WallSnow','PondSnow','PostSnow'}:
            snow_parts.remove(obj)
            bpy.data.objects.remove(obj, do_unlink=True)
            removed_snow += 1
    after_triangles = sum(sum(len(p.vertices)-2 for p in o.data.polygons)
                          for o in scene.objects if o.name.split('.')[0]=='WallMasonry')
    return {'revision':1,'seed':261018,'wallStones':stone_count,'copingStones':len(caps),
            'originalWallTriangles':before_triangles,'newWallTriangles':after_triangles,
            'collisionCoresUnchanged':len(wall_cores),'redundantSnowCapsRemoved':removed_snow,
            'snow':'Existing CourtyardStone shader coats actual upward-facing stone surfaces.'}
