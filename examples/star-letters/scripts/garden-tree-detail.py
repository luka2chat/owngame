"""Original flowering tree: connected tapered limbs, rounded leaves and petals.

Executed after layout generation with an independent RNG. Growth-anchor colors
encode Unity world coordinates; the three story roots share a fixed origin.
"""
import math
import random
from pathlib import Path
import bpy
from mathutils import Vector


def refine_tree(scene, mesh, material, canopy):
    rng=random.Random(6142026)
    old_names={'Solid_Tree','BareBranch','Twig','FineTwig','SpringCanopy',
               'TreeBloom_LeafLight','TreeBloom_Pink','TreeBloom_Cream'}
    for obj in list(scene.objects):
        if obj.name.split('.')[0] in old_names:
            if obj in canopy:canopy.remove(obj)
            bpy.data.objects.remove(obj,do_unlink=True)
    palette={
        'GardenBark':(.34,.235,.145),
        'GardenLeafDeep':(.23,.34,.12),'GardenLeafSun':(.40,.49,.20),
        'GardenBlossomPink':(.87,.54,.59),'GardenBlossomIvory':(.97,.80,.72),
        'GardenPollen':(.71,.46,.14)}
    mats={k:material(k,v) for k,v in palette.items()}
    bark=bpy.data.images.load(str(Path(__file__).resolve().parents[1]/'unity/LittleOrbit/Assets/Textures/Story/V2_tree-bark.png'))
    bark.name='V2_tree-bark';bark.pack()
    mat=mats['GardenBark'];nodes=mat.node_tree.nodes
    texture=nodes.new('ShaderNodeTexImage');texture.image=bark
    tint=nodes.new('ShaderNodeMixRGB');tint.blend_type='MULTIPLY';tint.inputs[0].default_value=1;tint.inputs[2].default_value=mat.diffuse_color
    mat.node_tree.links.new(texture.outputs['Color'],tint.inputs[1]);mat.node_tree.links.new(tint.outputs[0],nodes.get('Principled BSDF').inputs['Base Color'])
    batches={k:[[],[],[],[]] for k in palette}

    def encoded_anchor(p):
        # Blender -> Unity for the established FBX import: (-x,z,-y).
        return ((-p[0]+8)/16,p[2]/8,(-p[1]+8)/16,1)

    def append(key,vertices,faces,coords=None,anchor=None):
        vs,fs,uvs,colors=batches[key];start=len(vs)
        vs.extend(vertices);fs.extend(tuple(start+i for i in face) for face in faces)
        uvs.extend(coords or [(0,0)]*len(vertices))
        colors.extend([encoded_anchor(anchor) if anchor is not None else (1,1,1,1)]*len(vertices))

    def uv_bark(obj,coords):
        layer=obj.data.uv_layers.new(name='BarkGrain')
        for face in obj.data.polygons:
            seam=max(coords[i][0] for i in face.vertices)-min(coords[i][0] for i in face.vertices)>.5
            for loop in face.loop_indices:
                u,v=coords[obj.data.loops[loop].vertex_index];layer.data[loop].uv=(u+1 if seam and u<.5 else u,v)

    def tube(points,radii,key='GardenBark',sides=8,separate=None,steps=4,anchor=None):
        points=[Vector(p) for p in points];centers=[];widths=[]
        for j in range(len(points)-1):
            a,b,c,d=points[max(0,j-1)],points[j],points[j+1],points[min(len(points)-1,j+2)]
            for k in range(steps):
                t=k/steps
                centers.append(.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t))
                widths.append(radii[j]*(1-t)+radii[j+1]*t)
        centers.append(points[-1]);widths.append(radii[-1]);vs=[];fs=[];uvs=[];distance=0
        for j,(center,width) in enumerate(zip(centers,widths)):
            if j:distance+=(center-centers[j-1]).length
            direction=(centers[min(j+1,len(centers)-1)]-centers[max(0,j-1)]).normalized()
            reference=Vector((0,1,0)) if abs(direction.y)<.9 else Vector((1,0,0))
            right=direction.cross(reference).normalized();up=right.cross(direction).normalized()
            for k in range(sides):
                angle=k*math.tau/sides;r=width*(1+.06*math.sin(angle*5+j*.12))
                vs.append(tuple(center+(right*math.cos(angle)+up*math.sin(angle))*r));uvs.append((k/sides,distance*.65))
            if j:
                for k in range(sides):
                    n=(k+1)%sides;fs.append(((j-1)*sides+k,j*sides+k,j*sides+n,(j-1)*sides+n))
        fs.extend((tuple(reversed(range(sides))),tuple((len(centers)-1)*sides+k for k in range(sides))))
        if separate:
            obj=mesh(separate,vs,fs,key,True);uv_bark(obj,uvs)
        else:append(key,vs,fs,uvs,anchor)
        return centers

    def on_curve(points,t):
        f=t*(len(points)-1);i=min(len(points)-2,int(f));return points[i].lerp(points[i+1],f-i)

    def rounded(base,along,normal,length,key,petal=False,anchor=None):
        along=Vector(along).normalized();normal=Vector(normal).normalized();base=Vector(base)
        across=normal.cross(along).normalized();normal=along.cross(across).normalized()
        if petal:
            outline=[(0,0),(.25,-.40),(.65,-.50),(.94,-.33),(1,0),(.94,.33),(.65,.50),(.25,.40)]
        else:
            outline=[(0,0),(.23,-.27),(.57,-.32),(.85,-.20),(1,0),(.85,.20),(.57,.32),(.23,.27)]
        vs=[tuple(base+along*(a*length)+across*(b*length)+normal*(math.sin(a*math.pi)*length*.09)) for a,b in outline]
        vs += [tuple(base+along*(length*.51)+normal*(length*.15)),tuple(base+along*(length*.51)+normal*(length*.035))]
        fs=[]
        for i in range(8):fs.extend(((i,(i+1)%8,8),((i+1)%8,i,9)))
        append(key,vs,fs,anchor=base if anchor is None else anchor)

    center=Vector((-4.3,3.4,0))
    def at(x,y,z):return center+Vector((x,y,z))
    tube([at(0,0,-.02),at(-.07,.03,.55),at(-.16,0,1.35),at(-.03,-.12,2.25),at(.12,-.25,3.25)],
         [.30,.245,.20,.135,.045],sides=16,separate='Solid_Tree',steps=6)
    for j in range(6):
        a=j*math.tau/6
        tube([at(0,0,.20),at(math.cos(a)*.28,math.sin(a)*.25,.10),at(math.cos(a)*.52,math.sin(a)*.48,.01)], [.10,.065,.006],sides=7)
    forks=[at(-.70,.12,2.60),at(.68,.30,2.75),at(.12,-.25,3.25)]
    for j in range(2):
        tube([at(-.13,0,1.48+j*.25),at((-.35 if j==0 else .25),.08,2.20),forks[j]], [.15,.10,.055],sides=11)
    ends=[(-1.20,-.40,3.25),(-1.18,.65,3.60),(-.35,1.0,3.85),(.65,1.02,3.75),(1.3,.4,3.45),
          (1.35,-.55,3.25),(.60,-.85,3.85),(-.18,-.82,4.0),(-.72,-.65,3.70)]
    leaves=flowers=twigs=0
    for j,offset in enumerate(ends):
        end=at(*offset);start=forks[min(j//3,2)];bend=start.lerp(end,.53)+Vector((0,0,.10))
        branch=tube([start,bend,end],[.060,.038,.009],sides=9)
        for k in range(18):
            a=k*math.tau/18+rng.uniform(-.2,.2);attach=on_curve(branch,rng.uniform(.50,.96))
            tip=end+Vector((math.cos(a)*rng.uniform(.40,.78),math.sin(a)*rng.uniform(.35,.70),rng.uniform(-.42,.65)))
            twig=tube([attach,attach.lerp(tip,.5)+Vector((0,0,.07)),tip],[.018,.010,.0018],sides=6);twigs+=1
            for n in range(18):
                t=rng.uniform(.23,.98);base=on_curve(twig,t);angle=a+(1 if n%2 else -1)*rng.uniform(.7,1.7)
                direction=Vector((math.cos(angle),math.sin(angle),rng.uniform(-.25,.65))).normalized()
                normal=Vector((rng.uniform(-.5,.5),rng.uniform(-.5,.5),1)).normalized()
                rounded(base,direction,normal,rng.uniform(.13,.22),'GardenLeafSun' if n%3 else 'GardenLeafDeep');leaves+=1
            for n in range(7):
                base=on_curve(twig,.37+n*.09);normal=Vector((math.cos(a+n)*.65,math.sin(a+n)*.65,rng.uniform(.3,1))).normalized()
                flower=base+normal*rng.uniform(.04,.07)
                tube([base,flower],[.003,.002],'GardenLeafDeep',sides=4,steps=1,anchor=base)
                reference=Vector((0,0,1)) if abs(normal.z)<.95 else Vector((1,0,0))
                right=normal.cross(reference).normalized();up=normal.cross(right);phase=rng.uniform(0,math.tau)
                key='GardenBlossomPink' if rng.random()<.72 else 'GardenBlossomIvory'
                for petal in range(5):
                    angle=phase+petal*math.tau/5;direction=(right*math.cos(angle)+up*math.sin(angle)+normal*.22).normalized()
                    rounded(flower,direction,normal,rng.uniform(.070,.085),key,True,anchor=base)
                # A small domed pollen centre, shared by one material batch.
                vs=[tuple(flower+normal*.014),tuple(flower-normal*.005)]
                for q in range(8):
                    angle=q*math.tau/8;vs.append(tuple(flower+(right*math.cos(angle)+up*math.sin(angle))*.014))
                fs=[]
                for q in range(8):fs.extend(((0,2+q,2+(q+1)%8),(1,2+(q+1)%8,2+q)))
                append('GardenPollen',vs,fs,anchor=base);flowers+=1
    for key,(vs,fs,uvs,colors) in batches.items():
        obj=mesh('GardenTree_'+key,vs,fs,key,True)
        if key=='GardenBark':uv_bark(obj,uvs)
        else:
            layer=obj.data.color_attributes.new(name='GrowthAnchor',type='FLOAT_COLOR',domain='CORNER')
            for loop in obj.data.loops:layer.data[loop.index].color=colors[loop.vertex_index]
            canopy.append(obj)
    return {'revision':1,'seed':6142026,'leaves':leaves,'flowers':flowers,'fineTwigs':twigs,
            'barkTexture':'Reuses existing original 256px tree bark color and normal maps.',
            'growthAnchors':'Linear vertex RGB: (Unity world position - (-8,0,-8)) / (16,8,16).',
            'opaqueGeometry':True,'winter':'Connected bare branches remain visible; new flower/leaf geometry belongs to SpringCanopy.'}
