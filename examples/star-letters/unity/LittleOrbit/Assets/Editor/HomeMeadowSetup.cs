using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using StarLetters;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;

// Original opaque geometry, grouped into four spatial chunks for culling.
// Decoration has no colliders; existing paths and interaction anchors stay clear.
public static class HomeMeadowSetup
{
    sealed class Geometry
    {
        public readonly List<Vector3> vertices=new List<Vector3>(),normals=new List<Vector3>();
        public readonly List<Color> colors=new List<Color>();
        public readonly List<int> indices=new List<int>();
        public int Vertex(Vector3 p,Vector3 n,Color color,float wind)
        {int i=vertices.Count;vertices.Add(p);normals.Add(n.normalized);color=color.linear;color.a=wind;colors.Add(color);return i;}
        public void Triangle(int a,int b,int c){indices.Add(a);indices.Add(b);indices.Add(c);}
        public void Quad(int a,int b,int c,int d){Triangle(a,b,c);Triangle(a,c,d);}
    }
    static System.Random rng;
    static float R(float lo,float hi)=>Mathf.Lerp(lo,hi,(float)rng.NextDouble());
    static Vector3 Direction(float a)=>new Vector3(Mathf.Cos(a),0,Mathf.Sin(a));
    static readonly Color Dark=new Color(.22f,.32f,.095f),Green=new Color(.36f,.48f,.12f),Gold=new Color(.57f,.62f,.24f);
    static float PathDistance(float x,float z)=>Mathf.Abs(Mathf.Sqrt(x*x/(5.8f*5.8f)+z*z/(4.8f*4.8f))-1)*5.1f;
    static bool Clear(float x,float z,Vector3[] points)
    {
        if(x*x+z*z>8.35f*8.35f)return false;
        if(x>.5f && x<5.6f && z> -5.7f && z<-.75f)return false;
        if(x>-.55f && x<2.4f && z>-.6f && z<2.02f)return false;
        if((x+4.7f)*(x+4.7f)+(z-3.2f)*(z-3.2f)<1.85f)return false;
        if(x>2.2f && x<3.8f && z> -1.55f && z<1.6f)return false;
        if(x> -3.65f && x< -1f && z> -2.75f && z< -1.6f)return false;
        if((x+2.12f)*(x+2.12f)+(z+3.6f)*(z+3.6f)<.42f)return false;
        if(PathDistance(x,z)<.47f)return false;
        foreach(var p in points)if((x-p.x)*(x-p.x)+(z-p.z)*(z-p.z)<.34f)return false;
        return true;
    }
    static void Blade(Geometry g,Vector3 root,float height,float width,float angle,Color tip)
    {
        var forward=Direction(angle);var side=Direction(angle+Mathf.PI*.5f);
        var n=(Vector3.up*.75f-forward*.35f).normalized;
        var middle=root+Vector3.up*height*.58f+forward*height*.16f;
        var end=root+Vector3.up*height+forward*height*.48f;
        int a=g.Vertex(root-side*width,n,Dark,0),b=g.Vertex(root+side*width,n,Dark,0);
        int c=g.Vertex(middle+side*width*.65f,n,Color.Lerp(Green,tip,.55f),.45f);
        int d=g.Vertex(middle-side*width*.65f,n,Color.Lerp(Green,tip,.55f),.45f);
        int e=g.Vertex(end,n,tip,1);g.Quad(a,b,c,d);g.Triangle(d,c,e);
    }
    static void Leaf(Geometry g,Vector3 origin,float angle,float length,float width,Color color,float wind)
    {
        var direction=Direction(angle);var side=Direction(angle+Mathf.PI*.5f);
        var middle=origin+direction*length*.55f+Vector3.up*length*.18f;
        var end=origin+direction*length+Vector3.up*length*.09f;
        int a=g.Vertex(origin,Vector3.up,color*.7f,wind*.2f);
        int b=g.Vertex(middle-side*width,Vector3.up,color,wind*.6f);
        int c=g.Vertex(middle+Vector3.up*.015f,Vector3.up,color*1.12f,wind*.6f);
        int d=g.Vertex(middle+side*width,Vector3.up,color,wind*.6f);
        int e=g.Vertex(end,Vector3.up,color*.9f,wind);
        g.Triangle(a,b,c);g.Triangle(a,c,d);g.Triangle(b,e,c);g.Triangle(c,e,d);
    }
    static void Disc(Geometry g,Vector3 center,float radius,Color color,float wind)
    {
        int middle=g.Vertex(center+Vector3.up*.007f,Vector3.up,color,wind);
        for(int i=0;i<8;i++)
        {
            int a=g.Vertex(center+Direction(i*Mathf.PI*.25f)*radius,Vector3.up,color*.84f,wind);
            int b=g.Vertex(center+Direction((i+1)*Mathf.PI*.25f)*radius,Vector3.up,color*.84f,wind);
            g.Triangle(middle,b,a);
        }
    }
    static void Flower(Geometry g,Vector3 root,float height,float radius,Color petals)
    {
        var top=root+new Vector3(R(-.035f,.035f),height,R(-.035f,.035f));
        int a=g.Vertex(root-Vector3.right*.008f,Vector3.up,Dark,0),b=g.Vertex(root+Vector3.right*.008f,Vector3.up,Dark,0);
        int c=g.Vertex(top+Vector3.right*.006f,Vector3.up,Green,1),d=g.Vertex(top-Vector3.right*.006f,Vector3.up,Green,1);
        g.Quad(a,b,c,d);
        for(int i=0;i<2;i++)Leaf(g,root+Vector3.up*height*(.25f+i*.22f),R(0,Mathf.PI*2),height*.45f,.026f,Green,.6f);
        float start=R(0,Mathf.PI*2);
        for(int i=0;i<8;i++)
        {
            float angle=start+i*Mathf.PI*.25f;var axis=Direction(angle);var side=Direction(angle+Mathf.PI*.5f);
            int center=g.Vertex(top+axis*radius*.52f+Vector3.up*.013f,Vector3.up,petals,1);
            var outline=new[]{top+axis*radius*.16f,top+axis*radius*.5f-side*radius*.22f,
                top+axis*radius*.91f-side*radius*.14f+Vector3.up*.022f,top+axis*radius+Vector3.up*.03f,
                top+axis*radius*.91f+side*radius*.14f+Vector3.up*.022f,top+axis*radius*.5f+side*radius*.22f};
            for(int j=0;j<6;j++)
            {int u=g.Vertex(outline[j],Vector3.up,petals*.88f,1),v=g.Vertex(outline[(j+1)%6],Vector3.up,petals*.88f,1);g.Triangle(center,v,u);}
        }
        Disc(g,top+Vector3.up*.023f,radius*.23f,new Color(.86f,.57f,.10f),1);
    }
    static void Save(Transform root,string folder,string name,Geometry g,Material material)
    {
        var mesh=new Mesh{name=name,indexFormat=IndexFormat.UInt32};
        mesh.SetVertices(g.vertices);mesh.SetNormals(g.normals);mesh.SetColors(g.colors);mesh.SetTriangles(g.indices,0);mesh.RecalculateBounds();
        var bounds=mesh.bounds;bounds.Expand(.25f);mesh.bounds=bounds;
        string path=folder+"/"+name+".asset";var existing=AssetDatabase.LoadAssetAtPath<Mesh>(path);
        if(existing==null)AssetDatabase.CreateAsset(mesh,path);
        else
        {
            existing.Clear();existing.indexFormat=mesh.indexFormat;existing.vertices=mesh.vertices;existing.normals=mesh.normals;
            existing.colors=mesh.colors;existing.triangles=mesh.triangles;existing.bounds=mesh.bounds;existing.UploadMeshData(false);
            UnityEngine.Object.DestroyImmediate(mesh);mesh=existing;EditorUtility.SetDirty(mesh);
        }
        var obj=new GameObject(name);obj.transform.SetParent(root,false);obj.AddComponent<MeshFilter>().sharedMesh=mesh;
        var renderer=obj.AddComponent<MeshRenderer>();renderer.sharedMaterial=material;renderer.shadowCastingMode=ShadowCastingMode.Off;
    }
    [MenuItem("Star Letters/Refine Home Meadow")]
    public static string Apply()=>ApplyMeadow(StoryWorld.Home);
    [MenuItem("Star Letters/Refine Neighbor Meadow")]
    public static string ApplyNeighbor()=>ApplyMeadow(StoryWorld.Neighbor);

    static float NeighborPathDistance(float x,float z)=>Mathf.Abs(Mathf.Sqrt(x*x/(5.7f*5.7f)+z*z/(4.8f*4.8f))-1)*5.1f;
    static bool ClearNeighbor(float x,float z,Vector3[] points)
    {
        // Flat top only. Keep buildings, workshop, greenhouse, stream and puzzle
        // approaches readable; grass must never suggest a path through a wall.
        if(x*x+z*z>7.8f*7.8f || NeighborPathDistance(x,z)<.47f)return false;
        if(x>1.95f && x<5.65f && z>-4.95f && z<-.40f)return false;
        if(x>-4.85f && x<-1.55f && z>-5.1f && z<-1.35f)return false;
        if(x>-6.85f && x<-4.30f && z>-5.05f && z<-1.80f)return false;
        if(Mathf.Abs(x)<.94f && z>-3.7f && z<4.6f)return false;
        if(Mathf.Abs(x)<1.45f && z>-4.05f && z<-1.65f)return false;
        if(x>-5.65f && x<-2.65f && z>-1.2f && z<3.05f)return false;
        if(x>-2.85f && x<.2f && z>1.45f && z<2.65f)return false;
        if((Mathf.Abs(x-3.8f)<.64f || Mathf.Abs(x+3.5f)<.64f) && z>-1.6f && z<1.55f)return false;
        if((x-2.4f)*(x-2.4f)+(z-4.3f)*(z-4.3f)<1.15f)return false;
        if((x-5.6f)*(x-5.6f)+(z-.4f)*(z-.4f)<.60f)return false;
        foreach(var p in points)if((x-p.x)*(x-p.x)+(z-p.z)*(z-p.z)<.42f)return false;
        return true;
    }
    [MenuItem("Star Letters/Refine Garden Seasonal Meadow")]
    public static string ApplyGarden()=>ApplyMeadow(StoryWorld.Garden);

    static float GardenPathDistance(float x,float z)
    {
        float bx=-x,by=-z;
        float wicket=by> -5.1f && by<1.6f?Mathf.Abs(bx+4.05f):100;
        float gate=by> -6.1f && by<2.4f?Mathf.Abs(bx):100;
        return Mathf.Min(wicket,gate);
    }
    static bool ClearGarden(float x,float z,Vector3[] points)
    {
        float bx=-x,by=-z; // Same authored coordinates as build-garden-art.py.
        if(x*x+z*z>7.8f*7.8f || GardenPathDistance(x,z)<.62f)return false;
        if(bx> -1f && bx<4.25f && by>1.6f && by<6.0f)return false;
        if(bx> -3.45f && bx<-.85f && by>2.65f && by<4.65f)return false;
        if(bx> -3.45f && bx<-.20f && by> -1.25f && by<1.1f)return false;
        if((bx-3.65f)*(bx-3.65f)+(by+.15f)*(by+.15f)<1.75f*1.75f)return false;
        if((bx+4.3f)*(bx+4.3f)+(by-3.4f)*(by-3.4f)<.55f)return false;
        if(bx>.25f && bx<1.75f && by> -1.45f && by<.15f)return false;
        if((bx+1.7f)*(bx+1.7f)+(by+4.8f)*(by+4.8f)<.85f)return false;
        if(Mathf.Abs(by+2.5f)<.50f && bx> -6.4f && bx<6.4f)return false;
        if(Mathf.Abs(Mathf.Abs(bx)-6)<.45f && by> -2.85f && by<4.85f)return false;
        if(Mathf.Abs(by-5.8f)<.45f && Mathf.Abs(bx)<5.1f)return false;
        foreach(var p in points)if((x-p.x)*(x-p.x)+(z-p.z)*(z-p.z)<.42f)return false;
        return true;
    }
    static string ApplyMeadow(StoryWorld worldId)
    {
        bool neighbor=worldId==StoryWorld.Neighbor,garden=worldId==StoryWorld.Garden;
        if(EditorApplication.isPlayingOrWillChangePlaymode || EditorSceneManager.GetActiveScene().isDirty)
            throw new InvalidOperationException("Stop play and save scene before updating meadow.");
        var campaign=UnityEngine.Object.FindFirstObjectByType<CampaignDirector>();
        if(campaign==null || campaign.gameObject.scene.path!=CampaignSetup.ScenePath)throw new InvalidOperationException("Open StoryAdventure.");
        var shader=Shader.Find("StarLetters/Meadow");if(shader==null || !shader.isSupported)throw new Exception("Meadow shader unavailable");
        string folder="Assets/Models/Story/"+(garden?"GardenMeadow-v2":neighbor?"NeighborMeadow-v2":"HomeMeadow-v3");
        string rootName=garden?"Garden meadow v2":neighbor?"Neighbor meadow v2":"Home meadow v3";
        var world=garden?campaign.gardenRoot:neighbor?campaign.neighborRoot:campaign.homeRoot;
        Directory.CreateDirectory(folder);AssetDatabase.Refresh();
        string matPath="Assets/Materials/Story/V3_Meadow.mat";var material=AssetDatabase.LoadAssetAtPath<Material>(matPath);
        if(material==null){material=new Material(shader);AssetDatabase.CreateAsset(material,matPath);}material.shader=shader;material.SetFloat("_Breeze",.045f);
        var old=world.transform.Find(rootName);if(old!=null)UnityEngine.Object.DestroyImmediate(old.gameObject);
        foreach(var r in world.GetComponentsInChildren<MeshRenderer>(true))
            if(r.name=="MeadowGrass" || r.name=="MeadowFlowers")r.gameObject.SetActive(false);
        var root=new GameObject(rootName).transform;root.SetParent(world.transform,false);
        var points=world.GetComponentsInChildren<StoryInteraction>(true).Select(p=>world.transform.InverseTransformPoint(p.transform.position)).ToArray();
        rng=new System.Random(garden?181028:neighbor?181027:181026);var grasses=new Geometry[4];var blooms=new Geometry[4];
        for(int i=0;i<4;i++){grasses[i]=new Geometry();blooms[i]=new Geometry();}
        int tufts=0,flowers=0,clovers=0;
        for(int i=0;i<14500;i++)
        {
            float x=R(-8.35f,8.35f),z=R(-8.35f,8.35f);if(!(garden?ClearGarden(x,z,points):neighbor?ClearNeighbor(x,z,points):Clear(x,z,points)))continue;
            float patch=Mathf.PerlinNoise(x*.43f+19,z*.43f+38);
            if(R(0,1)>Mathf.Lerp(.12f,.98f,Mathf.SmoothStep(0,1,Mathf.InverseLerp(.3f,.66f,patch))))continue;
            int chunk=(x>0?1:0)+(z>0?2:0);var g=grasses[chunk];var f=blooms[chunk];
            float edge=Mathf.InverseLerp(.47f,1.4f,(garden?GardenPathDistance(x,z):neighbor?NeighborPathDistance(x,z):PathDistance(x,z)));
            float height=R(.08f,.20f)*Mathf.Lerp(.7f,1.35f,patch)*Mathf.Lerp(.7f,1,edge);
            var tip=Color.Lerp(Green,Gold,Mathf.PerlinNoise(x*.2f+4,z*.2f+2));
            for(int j=0;j<6;j++)Blade(g,new Vector3(x+R(-.055f,.055f),.006f,z+R(-.055f,.055f)),height*R(.6f,1.3f),R(.012f,.025f),R(0,Mathf.PI*2),tip*R(.85f,1.12f));
            tufts++;
            if(patch>.46f && R(0,1)<.105f)
            {
                var petal=R(0,1)<.76f?new Color(.96f,.89f,.68f):R(0,1)<.5f?new Color(.73f,.39f,.51f):new Color(.52f,.46f,.74f);
                Flower(f,new Vector3(x,.008f,z),R(.16f,.32f),R(.045f,.082f),petal);flowers++;
            }
            if(R(0,1)<.2f)
            {
                for(int j=0;j<3;j++)Leaf(g,new Vector3(x,.035f,z),j*Mathf.PI*2/3+R(0,.6f),R(.065f,.11f),.033f,new Color(.31f,.44f,.16f),.25f);
                clovers++;
            }
        }
        for(int i=0;i<4;i++){Save(root,folder,"Meadow grasses "+i,grasses[i],material);Save(root,folder,"Meadow flowers "+i,blooms[i],material);}
        if(garden)
        {
            var seasonal=root.gameObject.AddComponent<GardenMeadow>();
            seasonal.grasses=root.GetComponentsInChildren<Renderer>().Where(r=>r.name.StartsWith("Meadow grasses")).ToArray();
            seasonal.flowers=root.GetComponentsInChildren<Renderer>().Where(r=>r.name.StartsWith("Meadow flowers")).ToArray();
            campaign.gardenPresentation.meadow=seasonal;seasonal.Apply(0);
            campaign.gardenPresentation.springFlowers.SetActive(false);
            var groundShader=Shader.Find("StarLetters/GardenGround");
            if(groundShader==null || !groundShader.isSupported)throw new Exception("Garden ground shader unavailable");
            string groundPath="Assets/Materials/Story/V2_GardenSeasonGround.mat";
            var ground=AssetDatabase.LoadAssetAtPath<Material>(groundPath);
            if(ground==null){ground=new Material(groundShader);AssetDatabase.CreateAsset(ground,groundPath);}
            ground.shader=groundShader;
            ground.SetTexture("_BaseMap",AssetDatabase.LoadAssetAtPath<Material>("Assets/Materials/Story/V2_GardenGrass.mat").GetTexture("_BaseMap"));
            ground.SetColor("_BaseColor",new Color(.39f,.51f,.23f));ground.SetFloat("_Season",0);
            var materials=campaign.gardenPresentation.ground.sharedMaterials;materials[0]=ground;
            campaign.gardenPresentation.ground.sharedMaterials=materials;EditorUtility.SetDirty(ground);
        }
        EditorUtility.SetDirty(material);EditorSceneManager.MarkSceneDirty(campaign.gameObject.scene);EditorSceneManager.SaveScene(campaign.gameObject.scene);AssetDatabase.SaveAssets();
        return $"{(garden?"GARDEN":neighbor?"NEIGHBOR":"HOME")}_MEADOW_OK: {tufts} grass tufts, {flowers} flowers, {clovers} clover clusters; {grasses.Sum(g=>g.indices.Count/3)+blooms.Sum(g=>g.indices.Count/3)} triangles; 8 renderers; no added colliders.";
    }
}
