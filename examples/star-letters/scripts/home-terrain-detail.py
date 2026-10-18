"""Original rock ledges, roots and worn flagstones shared by all three planets.

Runs before batching/UV export. The local random stream leaves the cottage,
tree, flowers and their existing seeded placements unchanged.
"""
import math
import random
import runpy
from pathlib import Path
import bpy


def refine_terrain(scene, mesh, material, curve, world='home', winter_parts=None, spring_parts=None):
    if world not in {'home','neighbor','garden'}:
        raise ValueError(world)
    if world=='garden' and (winter_parts is None or spring_parts is None):
        raise ValueError('Garden terrain requires winter and spring mesh collections')
    rng = random.Random({'home':1810612,'neighbor':1810613,'garden':1810614}[world])
    # Replace only named terrain details while the editable objects are separate.
    removed = 0
    replacing={'EdgeStone','RimStone','CliffStone','PathStone','Doorstep','WicketPath','GatePath','HousePath'}
    if world=='garden':replacing.add('SnowCap')
    for obj in list(scene.objects):
        if obj.name.split('.')[0] in replacing:
            if winter_parts is not None and obj in winter_parts:winter_parts.remove(obj)
            bpy.data.objects.remove(obj, do_unlink=True)
            removed += 1

    material('CliffSlate', (.40, .40, .37), 'plaster')
    material('CliffWarm', (.53, .48, .39), 'plaster')
    material('CliffPale', (.63, .59, .48), 'plaster')
    material('RockMoss', (.30, .39, .13), 'meadow')
    material('PathWarm', (.66, .57, .43), 'plaster')
    material('PathPale', (.78, .71, .57), 'plaster')
    earth=material('CliffEarth', (.39,.36,.29), 'plaster')

    def boulder(name, center, size, angle, mat, moss=False):
        # Uneven angular rings form broad faces and chipped shoulders instead
        # of uniform smooth spheres. Narrow shoulder rings soften the outline.
        n = 9
        outline = [rng.uniform(.82, 1.14) for _ in range(n)]
        phases = [(i+rng.uniform(-.13,.13))*math.tau/n for i in range(n)]
        rings = [(.26,-1),(.80,-.78),(1,-.18),(.92,.50),(.67,.83),(.22,.89)]
        vs, fs = [], []
        for band,(radius,z) in enumerate(rings):
            for i,a in enumerate(phases):
                x=math.cos(a)*radius*outline[i]*size[0]
                y=math.sin(a)*radius*outline[i]*size[1]
                zz=z*size[2]+rng.uniform(-.06,.06)*size[2]
                vs.append((center[0]+x*math.cos(angle)-y*math.sin(angle),
                           center[1]+x*math.sin(angle)+y*math.cos(angle),center[2]+zz))
        fs.append(tuple(reversed(range(n))))
        for band in range(len(rings)-1):
            for i in range(n):
                j=(i+1)%n
                fs.append((band*n+i,band*n+j,(band+1)*n+j,(band+1)*n+i))
        fs.append(tuple((len(rings)-1)*n+i for i in range(n)))
        obj=mesh(name,vs,fs,mat)
        # Leave the broad stone faces visible, but bevel their sharp junctions.
        bpy.context.view_layer.objects.active=obj
        mod=obj.modifiers.new('Weathered edges','BEVEL')
        mod.width=.035;mod.segments=1
        bpy.ops.object.modifier_apply(modifier=mod.name)
        if moss:
            # Moss follows selected upper faces, not a floating oval cap.
            start=(len(rings)-2)*n
            top=[(x,y,z+.012) for x,y,z in vs[start:]]
            mf=[(i,(i+1)%n,n+(i+1)%n,n+i) for i in range(n) if rng.random()>.25]
            mf.append(tuple(n+i for i in range(n)))
            moss_obj=mesh('LedgeMoss',top,mf,'RockMoss',True)
            if spring_parts is not None:spring_parts.append(moss_obj)
    # Broad overlapping strata have different heights and lengths; breaks are
    # filled with smaller fragments rather than another evenly spaced bead ring.
    count=43
    for i in range(count):
        a=math.tau*(i+rng.uniform(-.24,.24))/count
        r=rng.uniform(8.55,8.95)
        width=rng.uniform(.58,1.12)
        boulder('WeatheredLedge',(r*math.cos(a),r*math.sin(a),rng.uniform(-.71,-.46)),
                (width,rng.uniform(.46,.73),rng.uniform(.48,.72)),a+math.pi/2,
                rng.choice(['CliffWarm','CliffWarm','CliffSlate','CliffPale']),i%3!=0)
        if i%3!=1:
            # Recess the lower stones into the skirt, leaving attached shoulders
            # rather than isolated hanging boulders beneath the island.
            lower_r=r+.04
            boulder('LowerCrag',(lower_r*math.cos(a+.04),lower_r*math.sin(a+.04),rng.uniform(-1.62,-1.23)),
                    (rng.uniform(.80,1.35),rng.uniform(.58,.84),rng.uniform(1.02,1.36)),a+math.pi/2,
                    rng.choice(['CliffSlate','CliffWarm']))
        if i%4==0:
            boulder('BrokenLedge',(8.25*math.cos(a-.055),8.25*math.sin(a-.055),-.16),
                    (.32,.28,.20),a,'CliffPale',True)

    # Roots emerge at the rim and disappear into cracks in the lower ledges.
    for i in range(16):
        a=math.tau*(i+rng.uniform(-.35,.35))/16
        points=[]
        for j,(r,z) in enumerate([(8.1,-.03),(8.58,-.27),(8.98,-.92),(8.92,-1.62),(8.42,-2.55)]):
            aa=a+math.sin(j*1.3+i)*.025
            points.append((r*math.cos(aa),r*math.sin(aa),z))
        curve('CliffRoot',points,rng.uniform(.025,.05),'Timber')
        if i%2==0:
            branch=[points[2],(8.96*math.cos(a+.07),8.96*math.sin(a+.07),-1.40),
                    (8.52*math.cos(a+.10),8.52*math.sin(a+.10),-2.15)]
            curve('RootBranch',branch,.018,'Timber')

    # Small leaf sprays bridge turf and mineral edges. Their tips hang over
    # ledges, giving the perimeter a living outline from walking height.
    leaf=runpy.run_path(str(Path(__file__).with_name('home-detail-geometry.py')))['folded_leaf']
    lv,lf=[],[]
    for i in range(35):
        a=math.tau*(i+rng.uniform(-.35,.35))/35
        r=rng.uniform(8.24,8.50)
        for j in range(rng.randrange(7,13)):
            aa=a+rng.uniform(-.035,.035);rr=r+rng.uniform(-.10,.22)
            start=(rr*math.cos(aa),rr*math.sin(aa),rng.uniform(-.06,.015))
            direction=(math.cos(aa+rng.uniform(-.7,.7)),math.sin(aa+rng.uniform(-.7,.7)),rng.uniform(-.8,.4))
            vs,fs=leaf(start,direction,rng.uniform(.19,.34),.065,rng.uniform(-.5,.5))
            offset=len(lv);lv.extend(vs);lf.extend(tuple(offset+k for k in f) for f in fs)
    leaves=mesh('RimLeafSprays',lv,lf,'Leaf')
    if spring_parts is not None:spring_parts.append(leaves)

    # The proven walking plane stays flat inside r=7.8. Only the outer skirt
    # gains a broken silhouette; no building, interaction or grass is lifted.
    ground=scene.objects.get('Ground_Surface')
    ground.data.materials[1]=earth
    for v in ground.data.vertices:
        x,y,z=v.co;r=math.hypot(x,y)
        if r<=7.8:continue
        a=math.atan2(y,x)
        blend=min(1,(r-7.8)/1.1)
        wave=.16*math.sin(a*5+.7)+.12*math.sin(a*11+1.1)+.06*math.sin(a*19)
        factor=(r+wave*blend)/r
        v.co.x*=factor;v.co.y*=factor
        v.co.z+=blend*(.06*math.sin(a*7)+.04*math.sin(a*13))
    ground.data.update()

    def slab(x,y,tangent,width,length,mat):
        n=7;outline=[]
        for j in range(n):
            a=math.tau*(j+rng.uniform(-.09,.09))/n
            # x is across the path, y runs along it.
            xx=math.cos(a)*width*rng.uniform(.88,1.08)
            yy=math.sin(a)*length*rng.uniform(.90,1.08)
            outline.append((x+xx*math.cos(tangent)-yy*math.sin(tangent),
                            y+xx*math.sin(tangent)+yy*math.cos(tangent)))
        vs=[(xx,yy,z) for z in (-.025,.048) for xx,yy in outline]
        fs=[tuple(reversed(range(n))),tuple(n+j for j in range(n))]
        fs.extend((j,(j+1)%n,n+(j+1)%n,n+j) for j in range(n))
        obj=mesh('WornFlagstone',vs,fs,mat)
        bpy.context.view_layer.objects.active=obj
        mod=obj.modifiers.new('Worn slab lip','BEVEL');mod.width=.025;mod.segments=2
        bpy.ops.object.modifier_apply(modifier=mod.name)

    if world in {'home','neighbor'}:
        path_count=74 if world=='home' else 68
        radius_x=5.8 if world=='home' else 5.7
        for i in range(path_count):
            a=math.tau*i/path_count
            x=radius_x*math.cos(a);y=4.8*math.sin(a)
            x+=rng.uniform(-.055,.055);y+=rng.uniform(-.055,.055)
            normal=math.atan2(math.sin(a)/4.8,math.cos(a)/radius_x)
            slab(x,y,normal+rng.uniform(-.16,.16),rng.uniform(.35,.43),rng.uniform(.24,.30),
                 rng.choice(['Stone','Stone','PathWarm','PathPale']))
        if world=='home':
            for i in range(6):slab(-3,-1+i*.43,0,.58,.25,'PathPale' if i%3==0 else 'Stone')
            path_count+=6
        else:
            for x in (-3.8,3.5):
                for i in range(7):slab(x,-1.2+i*.4,0,.49,.23,'PathPale' if i%3==0 else 'Stone')
            path_count+=14
    else:
        # Wicket/gate access stays exactly on the previously proven routes.
        for i in range(13):slab(-4.05,-4.7+i*.49,0,.40,.28,'Stone' if i%3 else 'PathWarm')
        for i in range(10):slab(0,-5.7+i*.55,0,.47,.29,'Stone' if i%3 else 'PathPale')
        for i in range(10):slab(.1,.15+i*.21,0,.45,.14,'Stone' if i%3 else 'PathPale')
        path_count=33

    return {'revision':1,'replacedObjects':removed,'upperLedges':count,'rootClusters':16,
            'world':world,'pathSlabs':path_count,'snowOnRockSurface':world=='garden','walkingPlaneUnchangedWithinRadius':7.8,
            'source':'scripts/home-terrain-detail.py'}


def refine_home_terrain(scene, mesh, material, curve):
    return refine_terrain(scene,mesh,material,curve)
