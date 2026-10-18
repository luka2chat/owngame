using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using StarLetters;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

// Original editable character geometry. Shared low-resolution meshes are
// combined per material and animated joint before saving into the project.
public static class CharacterArtSetup
{
    const string Folder="Assets/Models/Story/Characters-v2";
    static Mesh sphere;
    static Material skin,hair,linen,leather,eye,white,rose,brass,teal,red,green,brown,silver;
    static string key;
    static Material Mat(string name,Color color)
    {
        string path=Folder+"/"+name+".mat";var m=AssetDatabase.LoadAssetAtPath<Material>(path);
        if(m==null){m=new Material(Shader.Find("Universal Render Pipeline/Lit"));AssetDatabase.CreateAsset(m,path);}
        m.name=name;m.SetColor("_BaseColor",color);m.SetFloat("_Smoothness",name=="Eyes"?.32f:.17f);EditorUtility.SetDirty(m);return m;
    }
    static Transform Node(string name,Transform parent,Vector3 position)
    {var t=new GameObject(name).transform;t.SetParent(parent,false);t.localPosition=position;return t;}
    static Mesh SaveMesh(string name,Mesh mesh)
    {
        string path=Folder+"/"+name.Replace(" ","-")+".asset";var existing=AssetDatabase.LoadAssetAtPath<Mesh>(path);
        mesh.name=name;
        if(existing==null){AssetDatabase.CreateAsset(mesh,path);return mesh;}
        // Assign through Mesh setters so a changed vertex/index layout also
        // refreshes the renderer's native buffers, while keeping asset GUIDs.
        existing.Clear();existing.indexFormat=mesh.indexFormat;existing.vertices=mesh.vertices;existing.normals=mesh.normals;
        existing.subMeshCount=mesh.subMeshCount;
        for(int i=0;i<mesh.subMeshCount;i++)existing.SetIndices(mesh.GetIndices(i),mesh.GetTopology(i),i,false);
        existing.bounds=mesh.bounds;existing.UploadMeshData(false);
        UnityEngine.Object.DestroyImmediate(mesh);EditorUtility.SetDirty(existing);return existing;
    }
    static Transform Shape(string name,Transform parent,Vector3 pos,Vector3 size,Material material,Mesh mesh=null)
    {
        var t=Node(name,parent,pos);t.localScale=size;t.gameObject.AddComponent<MeshFilter>().sharedMesh=mesh??sphere;
        t.gameObject.AddComponent<MeshRenderer>().sharedMaterial=material;return t;
    }
    static Mesh UnitSphere()
    {
        const int sides=16,rings=10;var v=new List<Vector3>();var n=new List<Vector3>();var tris=new List<int>();
        for(int r=0;r<=rings;r++)for(int j=0;j<=sides;j++)
        {float a=r*Mathf.PI/rings,b=j*2*Mathf.PI/sides;var p=new Vector3(Mathf.Sin(a)*Mathf.Sin(b),Mathf.Cos(a),Mathf.Sin(a)*Mathf.Cos(b));v.Add(p*.5f);n.Add(p);}
        for(int r=0;r<rings;r++)for(int j=0;j<sides;j++)
        {int a=r*(sides+1)+j,b=a+1,c=a+sides+1,d=c+1;if(r>0)tris.AddRange(new[]{a,c,b});if(r<rings-1)tris.AddRange(new[]{b,c,d});}
        var mesh=new Mesh();mesh.SetVertices(v);mesh.SetNormals(n);mesh.SetTriangles(tris,0);mesh.RecalculateBounds();return SaveMesh("Shared-sphere",mesh);
    }
    static Mesh Garment(bool apron)
    {
        var v=new List<Vector3>();var tris=new List<int>();
        if(apron)
        {
            const int rows=6,columns=8;
            for(int r=0;r<=rows;r++)for(int c=0;c<=columns;c++)
            {float y=Mathf.Lerp(.61f,1.18f,r/(float)rows),width=Mathf.Lerp(.23f,.145f,r/(float)rows),x=Mathf.Lerp(-width,width,c/(float)columns);
             v.Add(new Vector3(x,y,.212f*Mathf.Sqrt(1-x*x/(.30f*.30f))+.02f));}
            for(int r=0;r<rows;r++)for(int c=0;c<columns;c++){int a=r*(columns+1)+c,b=a+1,d=a+columns+1;tris.AddRange(new[]{a,b,d,b,d+1,d});}
        }
        else
        {
            var rings=new[]{new Vector3(.63f,.265f,.205f),new Vector3(.70f,.285f,.22f),new Vector3(1.02f,.26f,.20f),new Vector3(1.20f,.235f,.18f),new Vector3(1.28f,.14f,.13f)};
            const int sides=24;
            foreach(var ring in rings)for(int i=0;i<sides;i++){float a=i*2*Mathf.PI/sides;v.Add(new Vector3(Mathf.Sin(a)*ring.y,ring.x,Mathf.Cos(a)*ring.z));}
            for(int r=0;r<rings.Length-1;r++)for(int i=0;i<sides;i++){int a=r*sides+i,b=r*sides+(i+1)%sides,c=a+sides,d=b+sides;tris.AddRange(new[]{a,b,c,b,d,c});}
            v.Add(new Vector3(0,.63f,0));int bottom=v.Count-1;v.Add(new Vector3(0,1.28f,0));int top=v.Count-1;
            for(int i=0;i<sides;i++){int j=(i+1)%sides;tris.AddRange(new[]{bottom,j,i,top,(rings.Length-1)*sides+i,(rings.Length-1)*sides+j});}
        }
        var mesh=new Mesh();mesh.SetVertices(v);mesh.SetTriangles(tris,0);mesh.RecalculateNormals();mesh.RecalculateBounds();return SaveMesh(apron?"Tailored-apron":"Tailored-coat",mesh);
    }
    static Mesh TrouserLimb()
    {
        var vertices=new List<Vector3>();var triangles=new List<int>();
        float[] heights={.02f,0,-.20f,-.26f},radii={.065f,.095f,.09f,.075f};const int sides=16;
        for(int r=0;r<4;r++)for(int i=0;i<sides;i++){float a=i*Mathf.PI*2/sides;vertices.Add(new Vector3(Mathf.Sin(a)*radii[r],heights[r],Mathf.Cos(a)*radii[r]));}
        for(int r=0;r<3;r++)for(int i=0;i<sides;i++){int a=r*sides+i,b=r*sides+(i+1)%sides,c=a+sides,d=b+sides;triangles.AddRange(new[]{a,c,b,b,c,d});}
        var mesh=new Mesh();mesh.SetVertices(vertices);mesh.SetTriangles(triangles,0);mesh.RecalculateNormals();mesh.RecalculateBounds();return SaveMesh("Tailored-trouser-limb",mesh);
    }
    static Transform Stroke(string name,Transform parent,Vector3[] points,float radius,Material material)
    {
        var v=new List<Vector3>();var tris=new List<int>();const int sides=6;
        for(int i=0;i<points.Length;i++)
        {
            var tangent=(points[Mathf.Min(i+1,points.Length-1)]-points[Mathf.Max(i-1,0)]).normalized;
            var across=Vector3.Cross(tangent,Mathf.Abs(tangent.z)>.9f?Vector3.up:Vector3.forward).normalized;var normal=Vector3.Cross(tangent,across);
            for(int j=0;j<sides;j++){float a=j*Mathf.PI*2/sides;v.Add(points[i]+radius*(Mathf.Cos(a)*across+Mathf.Sin(a)*normal));}
        }
        for(int i=0;i<points.Length-1;i++)for(int j=0;j<sides;j++)
        {int a=i*sides+j,b=i*sides+(j+1)%sides,c=a+sides,d=b+sides;tris.AddRange(new[]{a,b,c,b,d,c});}
        var mesh=new Mesh();mesh.SetVertices(v);mesh.SetTriangles(tris,0);mesh.RecalculateNormals();mesh.RecalculateBounds();
        return Shape(name,parent,Vector3.zero,Vector3.one,material,SaveMesh(key+"-"+name,mesh));
    }
    static void Head(Transform parent,StorybookCharacter rig,string role)
    {
        bool older=role=="Artisan" || role=="Giant";var h=Node("Head pivot",parent,Vector3.zero);rig.head=h;
        Shape("Face",h,Vector3.zero,new Vector3(.48f,.52f,.44f),skin);
        Shape("Jaw",h,new Vector3(0,-.125f,.016f),new Vector3(.34f,.27f,.35f),skin);
        for(int side=-1;side<=1;side+=2)
        {
            Shape("Ear",h,new Vector3(side*.237f,0,0),new Vector3(.087f,.13f,.075f),skin);
            Shape("Ear inner",h,new Vector3(side*.258f,0,.027f),new Vector3(.032f,.065f,.022f),rose);
            Shape("Cheek",h,new Vector3(side*.151f,-.045f,.181f),new Vector3(.074f,.045f,.014f),rose);
            var e=Node(side<0?"Left eye":"Right eye",h,new Vector3(side*.087f,.030f,.208f));
            Shape("Eye white",e,Vector3.zero,new Vector3(.077f,.049f,.022f),white);
            Shape("Iris",e,new Vector3(0,-.003f,.013f),new Vector3(.035f,.039f,.016f),eye);
            Shape("Catchlight",e,new Vector3(-.006f,.008f,.022f),Vector3.one*.010f,white);
            var brow=Node(side<0?"Left brow":"Right brow",h,new Vector3(side*.087f,.098f,.205f));
            Stroke(side<0?"Left brow line":"Right brow line",brow,new[]{new Vector3(-.047f,0,0),new Vector3(0,.014f,.005f),new Vector3(.047f,0,0)},older?.015f:.009f,older?silver:hair);
            if(side<0){rig.leftEye=e;rig.leftBrow=brow;}else{rig.rightEye=e;rig.rightBrow=brow;}
        }
        Shape("Nose",h,new Vector3(0,-.018f,.229f),new Vector3(.091f,.086f,.083f),skin);
        var mouth=Node("Smile pivot",h,new Vector3(0,older?-.14f:-.108f,older?.285f:.204f));rig.mouth=mouth;
        Stroke("Smile",mouth,new[]{new Vector3(-.065f,.012f,0),new Vector3(-.033f,-.005f,.013f),new Vector3(0,-.012f,.017f),new Vector3(.033f,-.005f,.013f),new Vector3(.065f,.012f,0)},.005f,leather);
        var hairMat=older?silver:hair;
        Shape("Hair back",h,new Vector3(0,.125f,-.085f),new Vector3(.49f,.31f,.38f),hairMat);
        for(int i=0;i<8;i++)
        {
            float a=i*Mathf.PI*2/8;var tuft=Shape("Hair lock",h,new Vector3(Mathf.Sin(a)*.19f,.19f+(i%2)*.025f,Mathf.Cos(a)*.12f-.04f),new Vector3(.15f,.10f,.16f),hairMat);
            tuft.localRotation=Quaternion.Euler(0,i*45,15*(i%3-1));
        }
        if(older)
        {
            Shape("Beard base",h,new Vector3(0,-.18f,.15f),new Vector3(.36f,.28f,.23f),silver);
            for(int i=-3;i<=3;i++)
            {var lockPart=Shape("Beard lock",h,new Vector3(i*.043f,-.20f+Mathf.Abs(i)*.012f,.216f),new Vector3(.065f,.19f-Mathf.Abs(i)*.02f,.065f),white);lockPart.localRotation=Quaternion.Euler(5,0,-i*7);}
            for(int side=-1;side<=1;side+=2)
            {var moustache=Shape("Moustache",h,new Vector3(side*.057f,-.083f,.252f),new Vector3(.13f,.065f,.062f),silver);moustache.localRotation=Quaternion.Euler(0,0,side*13);}
        }
        if(role=="Traveler")
        {
            Shape("Travel cap",h,new Vector3(0,.236f,-.025f),new Vector3(.53f,.19f,.46f),teal);
            Shape("Cap brim",h,new Vector3(0,.171f,.18f),new Vector3(.43f,.045f,.27f),teal);
            Shape("Cap button",h,new Vector3(0,.329f,-.025f),new Vector3(.054f,.023f,.054f),brass);
        }
        if(role=="Gardener")
        {
            var straw=Mat("Straw",new Color(.78f,.59f,.33f));
            Shape("Straw brim",h,new Vector3(0,.24f,-.02f),new Vector3(.71f,.052f,.64f),straw);
            Shape("Straw crown",h,new Vector3(0,.30f,-.03f),new Vector3(.43f,.24f,.42f),straw);
            Shape("Hat band",h,new Vector3(0,.263f,-.03f),new Vector3(.44f,.065f,.43f),green);
            Shape("Hair bun",h,new Vector3(0,.03f,-.24f),new Vector3(.25f,.22f,.17f),hair);
            Shape("Hat flower",h,new Vector3(.19f,.29f,.12f),new Vector3(.085f,.085f,.025f),linen);
            Shape("Hat flower center",h,new Vector3(.19f,.29f,.14f),Vector3.one*.025f,brass);
        }
    }
    static void Batch(Transform node,string path)
    {
        foreach(var child in node.Cast<Transform>().ToArray())Batch(child,path+"-"+child.name);
        var renderers=node.Cast<Transform>().Select(t=>t.GetComponent<MeshRenderer>()).Where(r=>r!=null).ToArray();
        foreach(var group in renderers.GroupBy(r=>r.sharedMaterial))
        {
            var mesh=new Mesh();mesh.indexFormat=UnityEngine.Rendering.IndexFormat.UInt32;
            mesh.CombineMeshes(group.Select(r=>new CombineInstance{mesh=r.GetComponent<MeshFilter>().sharedMesh,transform=node.worldToLocalMatrix*r.transform.localToWorldMatrix}).ToArray());
            Shape(group.Key.name+" batch",node,Vector3.zero,Vector3.one,group.Key,SaveMesh(path+"-"+group.Key.name,mesh));
        }
        foreach(var r in renderers)UnityEngine.Object.DestroyImmediate(r.gameObject);
    }
    static StorybookCharacter Build(Transform root,string role,bool seated,bool hero)
    {
        key=hero?"Hero":role+(seated?"-seated":"-standing");
        var old=root.Find("Storybook model");if(old!=null)Undo.DestroyObjectImmediate(old.gameObject);
        foreach(var child in root.Cast<Transform>().ToArray())
            if(child.GetComponentsInChildren<Renderer>(true).Length>0 && child.GetComponent<StoryInteraction>()==null)
            {Undo.RecordObject(child.gameObject,"Preserve prior character art");child.gameObject.SetActive(false);}
        var body=Node("Storybook model",root,Vector3.zero);var rig=body.gameObject.AddComponent<StorybookCharacter>();
        rig.traveler=hero;rig.seated=seated;rig.phase=hero?0:role=="Artisan"?1.6f:3.1f;
        Material cloth=hero?linen:role=="Artisan"?brown:green;
        Shape("Tailored coat",body,Vector3.zero,Vector3.one,cloth,Garment(false));
        Shape("Neck",body,new Vector3(0,1.29f,0),new Vector3(.18f,.19f,.18f),skin);
        for(int side=-1;side<=1;side+=2)
        {
            var collar=Shape("Collar",body,new Vector3(side*.088f,1.22f,.14f),new Vector3(.16f,.10f,.07f),hero?linen:white);collar.localRotation=Quaternion.Euler(0,0,side*26);
            var leg=Node(side<0?"Left leg pivot":"Right leg pivot",body,new Vector3(side*.135f,.64f,0));
            Shape("Trousers upper",leg,Vector3.zero,Vector3.one,teal,TrouserLimb());
            var knee=Node("Knee",leg,new Vector3(0,-.23f,0));
            Shape("Knee cloth",knee,Vector3.zero,Vector3.one*.178f,teal);
            Shape("Trousers lower",knee,Vector3.zero,Vector3.one*.92f,teal,TrouserLimb());
            Shape("Boot",knee,new Vector3(0,-.28f,.055f),new Vector3(.215f,.17f,.32f),leather);
            Shape("Boot sole",knee,new Vector3(0,-.337f,.065f),new Vector3(.22f,.045f,.33f),eye);
            for(int j=0;j<3;j++)Shape("Boot lace",knee,new Vector3(0,-.25f,.15f-j*.03f),new Vector3(.13f,.018f,.018f),linen);
            if(seated){leg.localRotation=Quaternion.Euler(-80,0,0);knee.localRotation=Quaternion.Euler(80,0,0);}
            if(side<0)rig.leftLeg=leg;else rig.rightLeg=leg;
            var arm=Node(side<0?"Left arm pivot":"Right arm pivot",body,new Vector3(side*.28f,1.17f,0));
            Shape("Sleeve",arm,new Vector3(side*.025f,-.145f,0),new Vector3(.18f,.34f,.19f),cloth);
            Shape("Cuff",arm,new Vector3(side*.025f,-.29f,.018f),new Vector3(.175f,.075f,.18f),hero?teal:linen);
            Shape("Hand",arm,new Vector3(side*.025f,-.355f,.03f),new Vector3(.13f,.14f,.12f),skin);
            Shape("Thumb",arm,new Vector3(side*-.035f,-.34f,.085f),new Vector3(.06f,.08f,.06f),skin);
            arm.localRotation=Quaternion.Euler(seated?-50:0,0,side*(seated?6:5));
            if(side<0)rig.leftArm=arm;else rig.rightArm=arm;
        }
        if(hero)
        {
            Shape("Scarf wrap",body,new Vector3(0,1.28f,.015f),new Vector3(.42f,.13f,.39f),red);
            var tail=Shape("Scarf tail",body,new Vector3(-.20f,1.08f,-.20f),new Vector3(.14f,.40f,.045f),red);
            // The scarf has its own pivot so batching does not remove animation.
            var scarf=Node("Scarf pivot",body,tail.localPosition);tail.SetParent(scarf,false);tail.localPosition=Vector3.zero;
            var idle=root.GetComponent<TravelerIdle>();if(idle!=null)idle.scarfTail=scarf;
            Stroke("Satchel strap",body,new[]{new Vector3(-.17f,1.24f,.155f),new Vector3(.02f,1.04f,.215f),new Vector3(.27f,.84f,.10f)},.029f,leather);
            Shape("Mail satchel",body,new Vector3(.32f,.82f,-.045f),new Vector3(.29f,.34f,.22f),leather);
            Shape("Satchel flap",body,new Vector3(.32f,.94f,.07f),new Vector3(.28f,.17f,.055f),brown);
            Shape("Buckle",body,new Vector3(.32f,.88f,.104f),new Vector3(.065f,.075f,.02f),brass);
            Shape("Letter",body,new Vector3(.33f,1.015f,-.04f),new Vector3(.17f,.12f,.018f),white);
            for(int j=0;j<3;j++)Shape("Coat button",body,new Vector3(0,1.12f-j*.13f,.211f),Vector3.one*.035f,brass);
        }
        else
        {
            Shape("Apron",body,Vector3.zero,Vector3.one,linen,Garment(true));
            Stroke("Apron pocket seam",body,new[]{new Vector3(-.13f,.91f,.215f),new Vector3(-.13f,.79f,.228f),new Vector3(.13f,.79f,.228f),new Vector3(.13f,.91f,.215f)},.006f,brown);
            for(int side=-1;side<=1;side+=2)Stroke(side<0?"Left apron strap":"Right apron strap",body,new[]{new Vector3(side*.15f,1.24f,.13f),new Vector3(side*.13f,1.13f,.215f)},.019f,linen);
            if(role=="Artisan")
            {Shape("Pocket pencil",body,new Vector3(.07f,.93f,.235f),new Vector3(.021f,.18f,.021f),brass);Shape("Pocket tool",body,new Vector3(-.03f,.91f,.235f),new Vector3(.045f,.16f,.025f),leather);}
            else Shape("Seed packet",body,new Vector3(.035f,.92f,.235f),new Vector3(.10f,.14f,.02f),brown);
        }
        Head(body,rig,hero?"Traveler":role);rig.head.localPosition=Vector3.up*1.47f;
        Batch(body,key);
        if(!hero){var idle=root.GetComponent<TravelerIdle>();if(idle!=null)idle.scarfTail=null;}
        return rig;
    }
    [MenuItem("Star Letters/Refine Storybook Characters")]
    public static string Apply()
    {
        if(EditorApplication.isPlayingOrWillChangePlaymode)throw new InvalidOperationException("Stop play first.");
        var scene=EditorSceneManager.GetActiveScene();if(scene.path!=CampaignSetup.ScenePath || scene.isDirty)throw new InvalidOperationException("Open saved StoryAdventure first.");
        Directory.CreateDirectory(Folder);AssetDatabase.Refresh();sphere=UnitSphere();
        skin=Mat("Skin",new Color(.77f,.52f,.35f));rose=Mat("Cheek",new Color(.73f,.39f,.29f));hair=Mat("Hair",new Color(.22f,.115f,.065f));
        linen=Mat("Linen",new Color(.83f,.75f,.57f));leather=Mat("Leather",new Color(.22f,.12f,.075f));eye=Mat("Eyes",new Color(.065f,.07f,.065f));
        white=Mat("Ivory",new Color(.96f,.91f,.77f));silver=Mat("Silver hair",new Color(.72f,.70f,.61f));brass=Mat("Brass",new Color(.72f,.48f,.19f));
        teal=Mat("Teal cloth",new Color(.15f,.31f,.31f));red=Mat("Rust scarf",new Color(.73f,.22f,.115f));green=Mat("Sage cloth",new Color(.30f,.42f,.25f));brown=Mat("Ochre cloth",new Color(.43f,.29f,.16f));
        var d=UnityEngine.Object.FindFirstObjectByType<CampaignDirector>();
        var hero=Build(d.traveler.avatar,"Traveler",false,true);d.traveler.leftLeg=hero.leftLeg;d.traveler.rightLeg=hero.rightLeg;
        foreach(var pair in new[]{("Artisan A-Li","Artisan"),("Gardener A-Kui","Gardener")})
        {
            Build(d.neighborRoot.GetComponentsInChildren<Transform>(true).Single(t=>t.name==pair.Item1),pair.Item2,false,false);
            Build(d.gardenPresentation.seatedGuests.GetComponentsInChildren<Transform>(true).Single(t=>t.name=="Seated "+pair.Item1),pair.Item2,true,false);
        }
        var portrait=d.gardenRoot.GetComponentsInChildren<Transform>(true).Single(t=>t.name=="GiantPortrait");
        portrait.gameObject.SetActive(false);PrefabUtility.RecordPrefabInstancePropertyModifications(portrait.gameObject);
        var old=d.gardenRoot.transform.Find("Giant storybook face");if(old!=null)Undo.DestroyObjectImmediate(old.gameObject);
        var giant=Node("Giant storybook face",d.gardenRoot.transform,Vector3.zero);
        giant.position=portrait.position+new Vector3(0,.35f,.01f);giant.localScale=new Vector3(2.4f,2.4f,1.4f);
        key="Giant";var face=giant.gameObject.AddComponent<StorybookCharacter>();face.giant=true;face.phase=2.4f;Head(giant,face,"Giant");Batch(giant,key);
        EditorSceneManager.MarkSceneDirty(scene);EditorSceneManager.SaveScene(scene);AssetDatabase.SaveAssets();
        int triangles=d.traveler.avatar.GetComponentsInChildren<MeshFilter>().Sum(f=>f.sharedMesh.triangles.Length/3);
        return "CHARACTER_ART_OK: traveller, two standing friends, two seated friends and giant rebuilt; hero active triangles "+triangles+"; collision roots and interaction anchors retained.";
    }
}
