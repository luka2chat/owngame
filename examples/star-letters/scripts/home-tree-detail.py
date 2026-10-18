"""Original small-leaf fruit tree. Blender Z-up; independent of layout RNG."""
import math
import random
import bpy
from mathutils import Vector
from pathlib import Path


def refine_home_tree(scene, mesh, material, sphere):
    rng = random.Random(6122026)
    for obj in list(scene.objects):
        if obj.name.split('.')[0] in {'TreeTrunk', 'Branch', 'Canopy', 'TreeLeavesLight',
                                      'TreeLeavesShade', 'Fruit', 'FruitStem'}:
            bpy.data.objects.remove(obj, do_unlink=True)
    materials={}
    for key, color in [('TreeBark', (.31, .23, .145)), ('TreeTwig', (.39, .29, .17)),
                       ('TreeLeafDeep', (.20, .32, .105)), ('TreeLeafMid', (.32, .43, .14)),
                       ('TreeLeafSun', (.43, .51, .19)), ('TreeFruit', (.83, .37, .13))]:
        materials[key]=material(key, color)
    # Small original tileable albedo and normal maps give close-up bark relief.
    size=256;heights=[]
    for y in range(size):
        v=y/size
        for x in range(size):
            u=x/size
            bend=.09*math.sin(v*math.tau)+.035*math.sin(v*math.tau*3+u*math.tau*2)
            fibre=(.5+.5*math.sin((u*18+bend)*math.tau))**12
            grain=math.sin(u*math.tau*67+math.sin(v*math.tau*7))*.025
            heights.append(.68-fibre*.19+grain)
    for normal in (False,True):
        name='V2_tree-bark-normal' if normal else 'V2_tree-bark'
        image=bpy.data.images.new(name,width=size,height=size);pixels=[]
        if normal:image.colorspace_settings.name='Non-Color'
        for y in range(size):
            for x in range(size):
                if normal:
                    dx=(heights[y*size+(x+1)%size]-heights[y*size+(x-1)%size])*1.8
                    dy=(heights[((y+1)%size)*size+x]-heights[((y-1)%size)*size+x])*1.8
                    n=Vector((-dx,-dy,1)).normalized();pixels.extend((n.x*.5+.5,n.y*.5+.5,n.z*.5+.5,1))
                else:
                    h=heights[y*size+x];pixels.extend((h+.19,h+.19,h+.19,1))
        image.pixels.foreach_set(pixels)
        image.filepath_raw=str(Path(__file__).resolve().parents[1]/'unity/LittleOrbit/Assets/Textures/Story'/(name+'.png'))
        image.file_format='PNG';image.save();image.pack()
        if not normal:
            for key in ('TreeBark','TreeTwig'):
                mat=materials[key];nodes=mat.node_tree.nodes
                tex=nodes.new('ShaderNodeTexImage');tex.image=image
                tint=nodes.new('ShaderNodeMixRGB');tint.blend_type='MULTIPLY';tint.inputs[0].default_value=1
                tint.inputs[2].default_value=mat.diffuse_color
                mat.node_tree.links.new(tex.outputs['Color'],tint.inputs[1])
                mat.node_tree.links.new(tint.outputs[0],nodes.get('Principled BSDF').inputs['Base Color'])
    batches = {k: [[], []] for k in ('TreeBark', 'TreeTwig', 'TreeLeafDeep', 'TreeLeafMid', 'TreeLeafSun')}
    bark_uvs={'TreeBark':[],'TreeTwig':[]}

    def bark_uv(obj, coords):
        uv=obj.data.uv_layers.new(name='BarkGrain')
        for poly in obj.data.polygons:
            seam=max(coords[i][0] for i in poly.vertices)-min(coords[i][0] for i in poly.vertices)>.5
            for loop in poly.loop_indices:
                u,v=coords[obj.data.loops[loop].vertex_index]
                uv.data[loop].uv=(u+1 if seam and u<.5 else u,v)

    def append(key, vertices, faces):
        vs, fs = batches[key]; offset = len(vs)
        vs.extend(vertices); fs.extend(tuple(offset+i for i in face) for face in faces)

    def tube(points, radii, key='TreeBark', sides=10, separate=None):
        # Catmull-Rom centerline, tapered and slightly fluted cross-sections.
        points = [Vector(p) for p in points]
        centers = []; widths = []
        for j in range(len(points)-1):
            a,b,c,d = points[max(0,j-1)],points[j],points[j+1],points[min(len(points)-1,j+2)]
            for k in range(5):
                t=k/5
                centers.append(.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t))
                widths.append(radii[j]*(1-t)+radii[j+1]*t)
        centers.append(points[-1]); widths.append(radii[-1])
        vs=[];fs=[];coords=[];distance=0
        for j,(center,width) in enumerate(zip(centers,widths)):
            if j:distance+=(center-centers[j-1]).length
            along=(centers[min(j+1,len(centers)-1)]-centers[max(0,j-1)]).normalized()
            ref=Vector((0,1,0)) if abs(along.y)<.9 else Vector((1,0,0))
            right=along.cross(ref).normalized();up=right.cross(along).normalized()
            for k in range(sides):
                angle=k*math.tau/sides
                r=width*(1+.075*math.sin(angle*5+j*.15)+.035*math.sin(angle*3-j*.23))
                vs.append(tuple(center+(right*math.cos(angle)+up*math.sin(angle))*r))
                coords.append((k/sides,distance*.6))
            if j:
                for k in range(sides):
                    n=(k+1)%sides;fs.append(((j-1)*sides+k,j*sides+k,j*sides+n,(j-1)*sides+n))
        fs.extend((tuple(reversed(range(sides))),tuple((len(centers)-1)*sides+k for k in range(sides))))
        if separate:
            obj=mesh(separate,vs,fs,key,True);bark_uv(obj,coords);return obj
        append(key,vs,fs)
        bark_uvs[key].extend(coords)

    def leaf(base, direction, length, roll, key):
        along=Vector(direction).normalized();base=Vector(base)
        ref=Vector((0,0,1)) if abs(along.z)<.95 else Vector((0,1,0))
        side=ref.cross(along).normalized();normal=along.cross(side).normalized()
        side=side*math.cos(roll)+normal*math.sin(roll);normal=along.cross(side).normalized()
        # Rounded eight-sided outline and curved midrib, closed on both sides.
        outline=[(0,0),(.22,-.29),(.56,-.37),(.84,-.23),(1,0),(.84,.23),(.56,.37),(.22,.29)]
        vs=[tuple(base+along*(a*length)+side*(b*length)+normal*(math.sin(a*math.pi)*length*.065)) for a,b in outline]
        vs.extend([tuple(base+along*(length*.51)+normal*(length*.12)),
                   tuple(base+along*(length*.51)+normal*(length*.025))])
        fs=[]
        for i in range(8):fs.extend(((i,(i+1)%8,8),((i+1)%8,i,9)))
        append(key,vs,fs)

    trunk=tube([(2.2,3.6,-.02),(2.13,3.59,.45),(2.03,3.63,1.2),
                (2.14,3.32,2.15),(2.20,2.95,2.90)], [.38,.30,.24,.16,.08],sides=16,separate='TreeTrunk')
    # Shallow roots flare into the lawn without lifting the walking surface.
    for j in range(7):
        a=j*math.tau/7+.15
        end=Vector((2.2+math.cos(a)*.82,3.6+math.sin(a)*.72,.015))
        tube([(2.2,3.6,.30),(2.2+math.cos(a)*.37,3.6+math.sin(a)*.35,.12),end], [.16,.10,.008],sides=8)
    # Broad, asymmetric crown with airy gaps; all lower branches clear the bench.
    forks=[Vector((1.35,3.78,2.65)),Vector((2.90,3.90,2.85)),Vector((2.20,2.95,2.90))]
    for j,fork in enumerate(forks):
        if j==2:continue # The curved trunk continues directly into this fork.
        tube([(2.10,3.62,1.35+j*.13),(2.1+(fork.x-2.1)*.45,3.62+(fork.y-3.62)*.4,2.1),fork],
             [.18,.135,.085],sides=12)
    ends=[(-1.72,-.25,3.47),(-1.30,1.02,3.82),(-.36,1.30,4.20),
          (.70,1.12,4.30),(1.64,.42,3.87),(1.77,-.70,3.62),(.60,-.92,3.89),(-.56,-.74,4.08)]
    leaf_count=0; fruit_count=0; twig_count=0
    for j,(dx,dy,z) in enumerate(ends):
        end=Vector((2.2+dx,3.6+dy,z))
        start=forks[min(2,j//3)]
        bend=start.lerp(end,.55)+Vector((0,0,.12))
        tube([start,bend,end],[.09,.065,.018],sides=10)
        for k in range(24):
            angle=k*math.tau/24+rng.uniform(-.2,.2)
            radial=rng.uniform(.40,.96)
            tip=end+Vector((math.cos(angle)*radial,math.sin(angle)*radial*.82,rng.uniform(-.65,.85)))
            attach=end*.75+bend*.25
            fork=(attach+tip)*.5+Vector((0,0,.10))
            tube([attach,fork,tip],[.030,.018,.003],'TreeTwig',6);twig_count+=1
            # Multiple alternating leaf sprays physically attach to each twig.
            for n in range(22):
                t=rng.uniform(.20,1.0);base=attach.lerp(tip,t)+Vector((0,0,math.sin(t*math.pi)*.08))
                a=angle+(1 if n%2 else -1)*rng.uniform(.65,1.65)
                length=rng.uniform(.18,.28)
                direction=Vector((math.cos(a),math.sin(a),rng.uniform(-.4,.65)))
                key=rng.choices(['TreeLeafDeep','TreeLeafMid','TreeLeafSun'],weights=[2,5,3])[0]
                leaf(base,direction,length,rng.uniform(-1.0,1.0),key);leaf_count+=1
            if k in (1,9,17):
                pos=tip-Vector((0,0,.16));fruit=sphere('TreeFruit',pos,(.083,.083,.098),'TreeFruit',12,8)
                # A shallow dimple and asymmetric profile keep the fruit organic.
                for v in fruit.data.vertices:
                    v.co.z-=.10*max(0,v.co.z)**8
                tube([tip,pos+Vector((0,0,.07))],[.009,.005],'TreeTwig',6)
                leaf(tip,(-.7,.4,.3),.16,.4,'TreeLeafSun');leaf_count+=1;fruit_count+=1
    for key,(vs,fs) in batches.items():
        obj=mesh('TreeDetail_'+key,vs,fs,key,True)
        if key in bark_uvs:bark_uv(obj,bark_uvs[key])
    return {'revision':1,'leaves':leaf_count,'fruit':fruit_count,'twigs':twig_count,
            'opaqueLeaves':True,'crownCores':0,'seed':6122026,
            'trunkBounds': [list(trunk.dimensions)],'note':'Rounded small leaves attached to tapered twigs; no opaque canopy spheres.'}
