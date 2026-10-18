using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using StarLetters;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;

// Re-photographs the game's own characters. No downloaded or generated artwork.
public static class StoryPhotoSetup
{
    public const string ImagePath="Assets/Resources/Story/OldPhotograph.png";
    const string MaterialPath="Assets/Materials/Story/OldPhotograph.mat";
    const string MeshPath="Assets/Models/Story/OldPhotograph.asset";
    static readonly List<UnityEngine.Object> temporary=new List<UnityEngine.Object>();
    static Transform stage;
    static Material ColorMaterial(string name,Color color)
    {
        var material=new Material(Shader.Find("Universal Render Pipeline/Lit")){name=name};
        material.SetColor("_BaseColor",color);material.SetFloat("_Smoothness",.12f);temporary.Add(material);return material;
    }
    static Transform Shape(string name,PrimitiveType type,Vector3 position,Vector3 scale,Material material)
    {
        var obj=GameObject.CreatePrimitive(type);obj.name=name;obj.transform.SetParent(stage,false);
        obj.transform.localPosition=position;obj.transform.localScale=scale;
        UnityEngine.Object.DestroyImmediate(obj.GetComponent<Collider>());obj.GetComponent<Renderer>().sharedMaterial=material;return obj.transform;
    }
    static void Beam(string name,Vector3 a,Vector3 b,float radius,Material material)
    {
        var part=Shape(name,PrimitiveType.Cylinder,(a+b)/2,new Vector3(radius*2,(b-a).magnitude/2,radius*2),material);
        part.rotation=Quaternion.FromToRotation(Vector3.up,b-a);
    }
    static Transform Person(StorybookCharacter source,string name,Vector3 position,float scale)
    {
        var obj=UnityEngine.Object.Instantiate(source.gameObject,stage);obj.name=name;obj.SetActive(true);
        obj.transform.localPosition=position;obj.transform.localRotation=Quaternion.identity;obj.transform.localScale=Vector3.one*scale;
        foreach(var behaviour in obj.GetComponentsInChildren<MonoBehaviour>(true))UnityEngine.Object.DestroyImmediate(behaviour);
        return obj.transform;
    }
    static void Chair(float x,Material wood,Material dark)
    {
        Shape("Chair seat",PrimitiveType.Cube,new Vector3(x,.42f,0),new Vector3(.62f,.10f,.61f),wood);
        foreach(float dx in new[]{-.25f,.25f})foreach(float dz in new[]{-.23f,.23f})
            Beam("Chair leg",new Vector3(x+dx,0,dz),new Vector3(x+dx,.44f,dz),.036f,dark);
        foreach(float dx in new[]{-.25f,.25f})Beam("Chair upright",new Vector3(x+dx,.3f,-.27f),new Vector3(x+dx,1.02f,-.27f),.038f,dark);
        foreach(float y in new[]{.68f,.87f})Shape("Chair back",PrimitiveType.Cube,new Vector3(x,y,-.27f),new Vector3(.62f,.12f,.065f),wood);
    }

    [MenuItem("Star Letters/Render Story Photograph")]
    public static string Render()
    {
        if(EditorApplication.isPlayingOrWillChangePlaymode)throw new InvalidOperationException("Stop Play before photographing source characters.");
        var director=UnityEngine.Object.FindFirstObjectByType<CampaignDirector>();
        if(director==null)throw new InvalidOperationException("Open StoryAdventure first.");
        var preview=EditorSceneManager.NewPreviewScene();
        var root=new GameObject("Old photograph studio");SceneManager.MoveGameObjectToScene(root,preview);stage=root.transform;
        RenderTexture target=null;Texture2D pixels=null;var active=RenderTexture.active;
        try
        {
            var wood=ColorMaterial("Chair honey wood",new Color(.50f,.29f,.12f));
            var dark=ColorMaterial("Tree bark",new Color(.22f,.13f,.065f));
            var grass=ColorMaterial("Garden green",new Color(.34f,.43f,.19f));
            var stone=ColorMaterial("Warm garden wall",new Color(.64f,.56f,.41f));
            var leaf=ColorMaterial("Young leaves",new Color(.42f,.52f,.23f));
            var pink=ColorMaterial("Spring blossom",new Color(.83f,.53f,.48f));
            var cream=ColorMaterial("Tea porcelain",new Color(.91f,.83f,.62f));
            Shape("Lawn",PrimitiveType.Cube,new Vector3(0,-.08f,-.5f),new Vector3(14,.12f,10),grass);
            for(int row=0;row<3;row++)for(int col=-6;col<=6;col++)
                Shape("Garden wall",PrimitiveType.Cube,new Vector3(col*.54f+(row%2)*.27f,row*.25f+.12f,-2.4f),new Vector3(.52f,.23f,.24f),stone);
            for(int col=-6;col<=6;col++)Shape("Wall coping",PrimitiveType.Sphere,new Vector3(col*.55f,.78f,-2.4f),new Vector3(.58f,.16f,.32f),stone);
            var guests=director.gardenPresentation.seatedGuests.GetComponentsInChildren<StorybookCharacter>(true);
            Person(guests.Single(r=>r.transform.parent.name.Contains("Artisan")),"Memory of A-Li",new Vector3(.92f,-.15f,.1f),1.08f);
            Person(guests.Single(r=>r.transform.parent.name.Contains("Gardener")),"Memory of A-Kui",new Vector3(-.92f,-.15f,.1f),1.02f);
            Chair(-.92f,wood,dark);Chair(.92f,wood,dark);
            var standing=director.neighborRoot.GetComponentsInChildren<StorybookCharacter>(true).Single(r=>r.transform.parent.name.Contains("Artisan"));
            var giant=Person(standing,"Giant leaning into the photograph",new Vector3(0,0,-.94f),1.68f);
            giant.localRotation=Quaternion.Euler(16,0,-4);
            var head=giant.Find("Head pivot");
            var sourceHead=director.gardenRoot.GetComponentsInChildren<StorybookCharacter>(true).Single(r=>r.giant).head;
            var giantHead=UnityEngine.Object.Instantiate(sourceHead.gameObject,giant).transform;
            giantHead.localPosition=head.localPosition;giantHead.localRotation=Quaternion.Euler(-12,0,4);giantHead.localScale=Vector3.one*1.14f;
            UnityEngine.Object.DestroyImmediate(head.gameObject);
            giant.Find("Left arm pivot").localRotation=Quaternion.Euler(-32,0,-14);
            giant.Find("Right arm pivot").localRotation=Quaternion.Euler(-32,0,14);
            // The giant wears a faded blue shirt, distinct from the artisan's ochre.
            var blue=ColorMaterial("Giant blue work shirt",new Color(.24f,.36f,.38f));
            foreach(var renderer in giant.GetComponentsInChildren<MeshRenderer>())
                if(renderer.sharedMaterial.name=="Ochre cloth")renderer.sharedMaterial=blue;
            Shape("Tea table",PrimitiveType.Cylinder,new Vector3(0,.56f,.61f),new Vector3(.73f,.055f,.73f),wood);
            Beam("Table foot",new Vector3(0,0,.61f),new Vector3(0,.55f,.61f),.065f,dark);
            for(int i=0;i<3;i++)
            {
                float angle=i*Mathf.PI*2/3;var p=new Vector3(Mathf.Cos(angle)*.22f,.66f,.61f+Mathf.Sin(angle)*.22f);
                Shape("Tea cup",PrimitiveType.Cylinder,p,new Vector3(.10f,.055f,.10f),cream);
                Shape("Tea surface",PrimitiveType.Cylinder,p+Vector3.up*.056f,new Vector3(.077f,.002f,.077f),dark);
            }
            var random=new System.Random(1810614);
            float Next(float a,float b)=>Mathf.Lerp(a,b,(float)random.NextDouble());
            Beam("Flowering tree",new Vector3(-2.05f,0,-1.7f),new Vector3(-2.0f,2.7f,-1.7f),.13f,dark);
            for(int i=0;i<8;i++)
            {
                float a=i*Mathf.PI*2/8;var tip=new Vector3(-2+Mathf.Cos(a)*.9f,2.4f+Next(-.1f,.7f),-1.7f+Mathf.Sin(a)*.65f);
                Beam("Spring branch",new Vector3(-2,1.6f,-1.7f),tip,.045f,dark);
                for(int j=0;j<15;j++)
                {
                    var center=tip+new Vector3(Next(-.4f,.4f),Next(-.2f,.4f),Next(-.35f,.35f));
                    Shape("Leaf",PrimitiveType.Sphere,center,new Vector3(.24f,.07f,.15f),leaf).rotation=Quaternion.Euler(Next(-50,50),Next(0,180),Next(-60,60));
                    if(j%2==0)for(int k=0;k<5;k++)
                    {float a2=k*Mathf.PI*2/5;Shape("Blossom petal",PrimitiveType.Sphere,center+new Vector3(Mathf.Cos(a2)*.06f,Mathf.Sin(a2)*.06f,.08f),new Vector3(.09f,.08f,.035f),k%2==0?pink:cream);}
                }
            }
            for(int i=0;i<55;i++)
            {
                var p=new Vector3(Next(-3.6f,3.6f),.07f,Next(-1.7f,1.1f));
                if(Mathf.Abs(p.x)<1.4f && p.z>-.5f)continue;
                Shape("Flower in lawn",PrimitiveType.Sphere,p,new Vector3(.075f,.035f,.075f),i%3==0?pink:cream);
            }
            foreach(var settings in new[]{(new Vector3(40,-30,0),new Color(1,.84f,.63f),2.0f),(new Vector3(25,145,0),new Color(.71f,.78f,1),.6f)})
            {
                var light=new GameObject("Photo studio light").AddComponent<Light>();light.transform.SetParent(stage,false);
                light.type=LightType.Directional;light.color=settings.Item2;light.intensity=settings.Item3;light.transform.rotation=Quaternion.Euler(settings.Item1);light.shadows=LightShadows.Soft;
            }
            var camera=new GameObject("Photo camera").AddComponent<Camera>();camera.transform.SetParent(stage,false);camera.scene=preview;
            camera.transform.position=new Vector3(.15f,2.45f,7.5f);camera.transform.LookAt(new Vector3(0,1.25f,0));
            camera.fieldOfView=31;camera.clearFlags=CameraClearFlags.SolidColor;camera.backgroundColor=new Color(.79f,.72f,.64f);camera.nearClipPlane=.05f;camera.farClipPlane=30;
            target=new RenderTexture(1536,1024,24);camera.targetTexture=target;camera.Render();RenderTexture.active=target;
            pixels=new Texture2D(1536,1024,TextureFormat.RGB24,false);pixels.ReadPixels(new Rect(0,0,1536,1024),0,0);pixels.Apply();
            // A restrained aged-print grade retains each friend's recognizable colors.
            var colors=pixels.GetPixels();
            for(int y=0;y<1024;y++)for(int x=0;x<1536;x++)
            {
                int i=y*1536+x;var c=colors[i];float luminance=c.r*.299f+c.g*.587f+c.b*.114f;
                c=Color.Lerp(c,new Color(luminance*1.04f,luminance*.98f,luminance*.86f),.23f);
                float edge=Mathf.Pow(Mathf.Max(Mathf.Abs(x/1535f-.5f)*2,Mathf.Abs(y/1023f-.5f)*2),5);
                float grain=((x*73+y*151)%29-14)*.00055f;
                colors[i]=new Color(c.r*(1-edge*.12f)+.035f+grain,c.g*(1-edge*.12f)+.025f+grain,c.b*(1-edge*.12f)+.015f+grain,1);
            }
            pixels.SetPixels(colors);pixels.Apply();Directory.CreateDirectory(Path.GetDirectoryName(ImagePath));File.WriteAllBytes(ImagePath,pixels.EncodeToPNG());
        }
        finally
        {
            RenderTexture.active=active;if(target!=null){target.Release();UnityEngine.Object.DestroyImmediate(target);}
            if(pixels!=null)UnityEngine.Object.DestroyImmediate(pixels);
            EditorSceneManager.ClosePreviewScene(preview);foreach(var item in temporary)UnityEngine.Object.DestroyImmediate(item);temporary.Clear();stage=null;
        }
        AssetDatabase.ImportAsset(ImagePath,ImportAssetOptions.ForceSynchronousImport);
        var importer=(TextureImporter)AssetImporter.GetAtPath(ImagePath);importer.textureType=TextureImporterType.Default;importer.sRGBTexture=true;importer.mipmapEnabled=true;
        importer.wrapMode=TextureWrapMode.Clamp;importer.npotScale=TextureImporterNPOTScale.None;importer.maxTextureSize=2048;importer.textureCompression=TextureImporterCompression.Uncompressed;importer.SaveAndReimport();
        return "STORY_PHOTO_RENDERED: original scene characters, two chairs, three tea cups and flowering garden; 1536x1024.";
    }

    [MenuItem("Star Letters/Apply Story Photograph")]
    public static string Apply()
    {
        if(EditorApplication.isPlayingOrWillChangePlaymode)throw new InvalidOperationException("Stop Play first.");
        var scene=EditorSceneManager.GetActiveScene();if(scene.path!=CampaignSetup.ScenePath || scene.isDirty)throw new InvalidOperationException("Open saved StoryAdventure first.");
        var texture=AssetDatabase.LoadAssetAtPath<Texture2D>(ImagePath);if(texture==null)throw new InvalidOperationException("Render the story photograph first.");
        var material=AssetDatabase.LoadAssetAtPath<Material>(MaterialPath);
        if(material==null){material=new Material(Shader.Find("Universal Render Pipeline/Unlit"));AssetDatabase.CreateAsset(material,MaterialPath);}
        material.SetTexture("_BaseMap",texture);material.SetColor("_BaseColor",Color.white);EditorUtility.SetDirty(material);
        var mesh=AssetDatabase.LoadAssetAtPath<Mesh>(MeshPath);
        if(mesh==null){mesh=new Mesh(){name="Old photograph print"};AssetDatabase.CreateAsset(mesh,MeshPath);}
        mesh.Clear();mesh.vertices=new[]{new Vector3(-.645f,-.415f,0),new Vector3(.645f,-.415f,0),new Vector3(.645f,.415f,0),new Vector3(-.645f,.415f,0)};
        mesh.uv=new[]{new Vector2(1,0),new Vector2(0,0),new Vector2(0,1),new Vector2(1,1)};mesh.triangles=new[]{0,1,2,0,2,3};mesh.RecalculateNormals();mesh.RecalculateBounds();EditorUtility.SetDirty(mesh);
        var d=UnityEngine.Object.FindFirstObjectByType<CampaignDirector>();var existing=d.neighborRoot.transform.Find("Old photograph print");
        var obj=existing!=null?existing.gameObject:new GameObject("Old photograph print");obj.transform.SetParent(d.neighborRoot.transform,false);
        obj.transform.localPosition=new Vector3(0,1.73f,-3.37f);obj.transform.localRotation=Quaternion.identity;
        var filter=obj.GetComponent<MeshFilter>();if(filter==null)filter=obj.AddComponent<MeshFilter>();filter.sharedMesh=mesh;
        var renderer=obj.GetComponent<MeshRenderer>();if(renderer==null)renderer=obj.AddComponent<MeshRenderer>();renderer.sharedMaterial=material;renderer.shadowCastingMode=ShadowCastingMode.Off;
        EditorSceneManager.MarkSceneDirty(scene);EditorSceneManager.SaveScene(scene);AssetDatabase.SaveAssets();
        return "STORY_PHOTO_APPLIED: same photograph in world frame and inspection UI; two triangles; no collision changes.";
    }
}
