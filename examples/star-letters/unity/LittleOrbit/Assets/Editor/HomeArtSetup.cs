using System;
using System.IO;
using System.Linq;
using StarLetters;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

// Art-specific presentation is separate from the tested gameplay scene builder.
public static class HomeArtSetup
{
    [MenuItem("Star Letters/Refresh Home Terrain Materials")]
    public static string RefreshHomeTerrain()
    {
        if(EditorApplication.isPlayingOrWillChangePlaymode)throw new InvalidOperationException("Stop Play first.");
        var d=UnityEngine.Object.FindFirstObjectByType<CampaignDirector>();
        if(d==null || d.gameObject.scene.path!=CampaignSetup.ScenePath || d.gameObject.scene.isDirty)
            throw new InvalidOperationException("Open and save StoryAdventure first.");
        const string model="Assets/Models/Story/HomeArt-v2.fbx";
        var importer=(ModelImporter)AssetImporter.GetAtPath(model);
        foreach(string name in new[]{"V2_CliffSlate","V2_CliffWarm","V2_CliffPale","V2_CliffEarth","V2_RockMoss","V2_PathWarm","V2_PathPale"})
        {
            var material=ImportMaterial(name,Shader.Find("Universal Render Pipeline/Lit"));
            importer.AddRemap(new AssetImporter.SourceAssetIdentifier(typeof(Material),name),material);
        }
        importer.SaveAndReimport();
        var ground=d.homeRoot.GetComponentsInChildren<MeshFilter>(true).Single(f=>f.name=="Ground_Surface");
        ground.GetComponent<MeshCollider>().sharedMesh=ground.sharedMesh;
        var groundMaterials=ground.GetComponent<MeshRenderer>().sharedMaterials;
        groundMaterials[1]=AssetDatabase.LoadAssetAtPath<Material>(Folder+"/V2_CliffEarth.mat");
        ground.GetComponent<MeshRenderer>().sharedMaterials=groundMaterials;
        UnityEditor.SceneManagement.EditorSceneManager.SaveScene(d.gameObject.scene);
        AssetDatabase.SaveAssets();
        return "HOME_TERRAIN_IMPORTED: seven original terrain materials remapped; ground collision mesh synchronized; story and camera settings retained.";
    }

    [Serializable] sealed class MaterialInfo { public string name; public float[] color; public string texture; }
    [Serializable] sealed class ArtInfo { public MaterialInfo[] unityMaterials; }
    const string Folder = "Assets/Materials/Story";

    public static Material ImportMaterial(string name, Shader shader, string manifestPath="Assets/Models/Story/HomeArt-v2.json")
    {
        bool rock=name.StartsWith("V2_Cliff");
        bool treeFoliage=name.StartsWith("V2_GardenLeaf") || name.StartsWith("V2_GardenBlossom") || name=="V2_GardenPollen";
        if(treeFoliage)shader=Shader.Find("StarLetters/GardenTreeFoliage");
        if(rock)
        {
            shader=Shader.Find("StarLetters/WeatheredRock");
            if(shader==null || !shader.isSupported)throw new InvalidOperationException("Weathered rock shader unavailable");
        }
        var info = JsonUtility.FromJson<ArtInfo>(File.ReadAllText(manifestPath));
        var entry = info.unityMaterials.FirstOrDefault(item => item.name == name);
        if (entry == null) throw new InvalidOperationException("Art material is missing from manifest: " + name);
        string path = Folder + "/" + name + ".mat";
        var material = AssetDatabase.LoadAssetAtPath<Material>(path);
        if (material != null)
        {
            if((rock || treeFoliage) && material.shader!=shader){material.shader=shader;EditorUtility.SetDirty(material);}
            return material;
        }
        material = new Material(shader) { name = name };
        if(treeFoliage)
        {
            bool blossom=!name.StartsWith("V2_GardenLeaf");
            material.SetFloat("_BloomStart",blossom?.22f:.08f);material.SetFloat("_BloomEnd",blossom?.95f:.65f);
        }
        material.SetColor("_BaseColor", new Color(entry.color[0],entry.color[1],entry.color[2],entry.color[3]));
        material.SetFloat("_Smoothness", name=="V2_Brass" ? .38f : .13f);
        material.SetFloat("_Metallic", name=="V2_Brass" ? .35f : 0);
        if (!string.IsNullOrEmpty(entry.texture))
        {
            string texturePath="Assets/Textures/Story/"+entry.texture;
            var importer=(TextureImporter)AssetImporter.GetAtPath(texturePath);
            importer.maxTextureSize=256; importer.wrapMode=TextureWrapMode.Repeat;
            importer.mipmapEnabled=true; importer.textureCompression=TextureImporterCompression.Compressed;
            importer.SaveAndReimport();
            material.SetTexture("_BaseMap",AssetDatabase.LoadAssetAtPath<Texture2D>(texturePath));
        }
        if (name=="V2_Glass")
        {
            material.EnableKeyword("_EMISSION");
            material.SetColor("_EmissionColor",new Color(.9f,.43f,.10f)*.4f);
        }
        AssetDatabase.CreateAsset(material,path);
        return material;
    }

    static Material Material(string name, Color color)
    {
        string path=Folder+"/"+name+".mat";
        var mat=AssetDatabase.LoadAssetAtPath<Material>(path);
        if(mat!=null)return mat;
        mat=new Material(Shader.Find("Universal Render Pipeline/Lit")){name=name};
        mat.SetColor("_BaseColor",color);mat.SetFloat("_Smoothness",.07f);
        AssetDatabase.CreateAsset(mat,path);return mat;
    }

    static GameObject Shape(string name, PrimitiveType type, Transform parent, Vector3 pos, Vector3 scale, Material material)
    {
        var obj=GameObject.CreatePrimitive(type);obj.name=name;obj.transform.SetParent(parent,false);
        obj.transform.localPosition=pos;obj.transform.localScale=scale;
        UnityEngine.Object.DestroyImmediate(obj.GetComponent<Collider>());
        obj.GetComponent<Renderer>().sharedMaterial=material;return obj;
    }

    public static void Configure(GameObject model, HomeAdventure game, Camera camera, Light sun)
    {
        foreach(var renderer in model.GetComponentsInChildren<MeshRenderer>())
            GameObjectUtility.SetStaticEditorFlags(renderer.gameObject,StaticEditorFlags.BatchingStatic);
        camera.clearFlags=CameraClearFlags.Skybox;
        var skyShader=Shader.Find("StarLetters/StorySky");
        if(skyShader==null)throw new InvalidOperationException("StorySky shader did not compile.");
        string skyPath=Folder+"/V2_StorySky.mat";
        var sky=AssetDatabase.LoadAssetAtPath<Material>(skyPath);
        if(sky==null){sky=new Material(skyShader);AssetDatabase.CreateAsset(sky,skyPath);}
        RenderSettings.skybox=sky;
        sun.intensity=1.8f;sun.color=new Color(1,.86f,.69f);
        sun.transform.rotation=Quaternion.Euler(36,-58,0);
        var fill=new GameObject("Cool sky fill").AddComponent<Light>();
        fill.type=LightType.Directional;fill.color=new Color(.72f,.81f,1);fill.intensity=.38f;
        fill.transform.rotation=Quaternion.Euler(50,135,0);fill.shadows=LightShadows.None;
        RenderSettings.ambientMode=AmbientMode.Trilight;
        RenderSettings.ambientSkyColor=new Color(.64f,.69f,.83f);
        RenderSettings.ambientEquatorColor=new Color(.56f,.49f,.47f);
        RenderSettings.ambientGroundColor=new Color(.34f,.31f,.38f);
        RenderSettings.fog=false;
        camera.GetUniversalAdditionalCameraData().renderPostProcessing=true;
        var volume=new GameObject("Soft storybook light").AddComponent<Volume>();
        volume.isGlobal=true;
        var profile=ScriptableObject.CreateInstance<VolumeProfile>();
        AssetDatabase.CreateAsset(profile,Folder+"/V2_HomeLight.asset");
        var bloom=profile.Add<Bloom>();bloom.intensity.Override(.18f);bloom.threshold.Override(1.1f);
        var color=profile.Add<ColorAdjustments>();color.postExposure.Override(.15f);color.saturation.Override(5);
        // URP's volume profile needs saved subassets to survive closing/reopening.
        foreach(var component in profile.components)AssetDatabase.AddObjectToAsset(component,profile);
        volume.sharedProfile=profile;

        CreateCloudSea();

        // Readable traveler silhouette: scarf, cap, small boots and satchel buckle.
        var scarf=Material("V2_TravelerScarf",new Color(.81f,.25f,.12f));
        var teal=Material("V2_TravelerCap",new Color(.17f,.36f,.34f));
        var leather=AssetDatabase.LoadAssetAtPath<Material>(Folder+"/Traveler leather.mat");
        var brass=AssetDatabase.LoadAssetAtPath<Material>(Folder+"/V2_Brass.mat");
        Shape("Scarf",PrimitiveType.Sphere,game.avatar,new Vector3(0,1.25f,.02f),new Vector3(.51f,.16f,.45f),scarf);
        var tail=Shape("Scarf tail",PrimitiveType.Cube,game.avatar,new Vector3(-.19f,1.04f,-.24f),new Vector3(.17f,.38f,.045f),scarf);
        Shape("Travel cap",PrimitiveType.Sphere,game.avatar,new Vector3(0,1.67f,-.02f),new Vector3(.46f,.25f,.44f),teal);
        Shape("Cap brim",PrimitiveType.Sphere,game.avatar,new Vector3(0,1.60f,.16f),new Vector3(.42f,.055f,.31f),teal);
        Shape("Satchel buckle",PrimitiveType.Cube,game.avatar,new Vector3(.30f,.83f,-.16f),new Vector3(.08f,.08f,.02f),brass);
        foreach(var leg in new[]{game.leftLeg,game.rightLeg})
            Shape("Boot",PrimitiveType.Sphere,leg,new Vector3(0,-.49f,.045f),new Vector3(.22f,.16f,.30f),leather);
        game.avatar.gameObject.AddComponent<TravelerIdle>().scarfTail=tail.transform;
        CreateReviewCameras();
    }

    public static void CreateReviewCameras()
    {
        if(GameObject.Find("Art comparison cameras")!=null)return;
        var root=new GameObject("Art comparison cameras").transform;
        void Add(string name,Vector3 position,Vector3 target,float fov)
        {
            var camera=new GameObject(name).AddComponent<Camera>();camera.transform.SetParent(root,false);
            camera.transform.position=position;camera.transform.LookAt(target);camera.fieldOfView=fov;
            camera.clearFlags=CameraClearFlags.Skybox;camera.enabled=false;
            camera.GetUniversalAdditionalCameraData().renderPostProcessing=true;
        }
        Add("Art Overview",new Vector3(14,17,23),Vector3.zero,43);
        Add("Art Cottage Detail",new Vector3(9,6,8),new Vector3(2.8f,1.3f,-1.6f),43);
    }

    public static void CreateCloudSea()
    {
        var cloudRoot=new GameObject("Cloud sea").transform;
        var pink=Material("V2_CloudRose",new Color(.88f,.72f,.74f));
        var cream=Material("V2_CloudCream",new Color(.99f,.86f,.76f));
        var lavender=Material("V2_CloudLavender",new Color(.65f,.63f,.80f));
        foreach(var mat in new[]{pink,cream,lavender})
        {
            var color=mat.GetColor("_BaseColor");mat.shader=Shader.Find("Universal Render Pipeline/Lit");
            mat.SetColor("_BaseColor",color);mat.SetFloat("_ReceiveShadows",0);
            mat.EnableKeyword("_RECEIVE_SHADOWS_OFF");mat.EnableKeyword("_EMISSION");
            mat.SetColor("_EmissionColor",color*.22f);EditorUtility.SetDirty(mat);
        }
        var rng=new System.Random(612);
        // Opaque cloud clusters outside the gameplay rim; no overdraw-heavy fog planes.
        var puff=MakeCloudMesh();
        for(int i=0;i<36;i++)
        {
            float angle=i*Mathf.PI*2/18;
            float radius=(i<18?12.5f:22)+(float)rng.NextDouble()*3;
            var obj=new GameObject("Cloud");obj.transform.SetParent(cloudRoot,false);
            obj.transform.position=new Vector3(Mathf.Cos(angle)*radius,-5.7f-(float)rng.NextDouble()*2,Mathf.Sin(angle)*radius);
            obj.transform.rotation=Quaternion.Euler(0,i*31,0);
            obj.transform.localScale=new Vector3(2.8f+(float)rng.NextDouble(),1.6f+(float)rng.NextDouble()*.4f,2.8f);
            obj.AddComponent<MeshFilter>().sharedMesh=puff;
            var renderer=obj.AddComponent<MeshRenderer>();renderer.sharedMaterial=i%3==0?cream:i%3==1?pink:lavender;
            renderer.shadowCastingMode=ShadowCastingMode.Off;renderer.receiveShadows=false;
        }
        CombineClouds(cloudRoot,new[]{pink,cream,lavender});
        UnityEngine.Object.DestroyImmediate(puff);
    }

    static Mesh MakeCloudMesh()
    {
        var prefab=AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Models/Story/CloudPuff-v2.fbx");
        if(prefab==null)throw new InvalidOperationException("Run scripts/build-cloud-puff.py first.");
        var mesh=new Mesh(){name="Puffy cloud"};
        mesh.CombineMeshes(prefab.GetComponentsInChildren<MeshFilter>().Select(f=>new CombineInstance
            {mesh=f.sharedMesh,transform=f.transform.localToWorldMatrix}).ToArray());
        return mesh;
    }

    [MenuItem("Star Letters/Refresh Home Distant Clouds")]
    public static void RefreshHomeDistantClouds()
    {
        if (EditorApplication.isPlayingOrWillChangePlaymode) throw new InvalidOperationException("Stop Play first.");
        var campaign = UnityEngine.Object.FindFirstObjectByType<CampaignDirector>();
        if (campaign == null || campaign.homeRoot == null) throw new InvalidOperationException("Open StoryAdventure first.");
        var existing = campaign.homeRoot.transform.Find("Home distant clouds");
        if (existing != null) UnityEngine.Object.DestroyImmediate(existing.gameObject);
        var root = new GameObject("Home distant clouds").transform;
        root.SetParent(campaign.homeRoot.transform, false);
        var materials = new[] {
            Material("V2_HomeFarCloudCream", new Color(.97f,.82f,.74f)),
            Material("V2_HomeFarCloudRose", new Color(.88f,.68f,.74f)),
            Material("V2_HomeFarCloudLavender", new Color(.69f,.59f,.79f))
        };
        var cloudColors = new[] {new Color(.97f,.85f,.79f),new Color(.91f,.77f,.82f),new Color(.82f,.74f,.87f)};
        for (int m=0;m<materials.Length;m++)
        {
            var mat=materials[m]; mat.SetColor("_BaseColor",cloudColors[m]);
            mat.SetFloat("_ReceiveShadows",0); mat.EnableKeyword("_RECEIVE_SHADOWS_OFF");
            mat.EnableKeyword("_EMISSION"); mat.SetColor("_EmissionColor",cloudColors[m]*.38f);
            EditorUtility.SetDirty(mat);
        }
        var puff = MakeCloudMesh();
        var rng = new System.Random(1943);
        for (int i=0;i<20;i++)
        {
            float angle=i*Mathf.PI*2/20, radius=31+(float)rng.NextDouble()*3;
            var obj=new GameObject("Distant cloud"); obj.transform.SetParent(root,false);
            obj.transform.localPosition=new Vector3(Mathf.Cos(angle)*radius,-4.5f-(float)rng.NextDouble(),Mathf.Sin(angle)*radius);
            obj.transform.localRotation=Quaternion.Euler(0,-i*18-90,0);
            obj.transform.localScale=new Vector3(7.5f,2.8f+(float)rng.NextDouble(),5.5f);
            obj.AddComponent<MeshFilter>().sharedMesh=puff;
            var renderer=obj.AddComponent<MeshRenderer>(); renderer.sharedMaterial=materials[i%3];
            renderer.shadowCastingMode=ShadowCastingMode.Off; renderer.receiveShadows=false;
        }
        CombineClouds(root,materials,"Assets/Models/Story/HomeDistantClouds");
        UnityEngine.Object.DestroyImmediate(puff);
        UnityEditor.SceneManagement.EditorSceneManager.MarkSceneDirty(campaign.gameObject.scene);
        AssetDatabase.SaveAssets();
    }

    static void CombineClouds(Transform root, Material[] materials, string folder="Assets/Models/Story/Clouds")
    {
        var sources=root.GetComponentsInChildren<MeshFilter>();
        foreach(var material in materials)
        {
            var matching=sources.Where(f=>f.GetComponent<MeshRenderer>().sharedMaterial==material).ToArray();
            var mesh=new Mesh(){name=material.name+" mesh",indexFormat=IndexFormat.UInt32};
            mesh.CombineMeshes(matching.Select(f=>new CombineInstance{mesh=f.sharedMesh,transform=f.transform.localToWorldMatrix}).ToArray());
            Directory.CreateDirectory(folder);AssetDatabase.Refresh();
            string path=folder+"/"+material.name+".asset";
            var existing=AssetDatabase.LoadAssetAtPath<Mesh>(path);
            if(existing==null)AssetDatabase.CreateAsset(mesh,path);
            else
            {
                // CopySerialized can leave old native vertex/index buffers alive on
                // Metal. Assign mesh data explicitly so the saved asset and GPU agree.
                existing.Clear();existing.indexFormat=mesh.indexFormat;existing.vertices=mesh.vertices;
                existing.normals=mesh.normals;existing.triangles=mesh.triangles;existing.RecalculateBounds();
                UnityEngine.Object.DestroyImmediate(mesh);mesh=existing;EditorUtility.SetDirty(mesh);
            }
            var obj=new GameObject(material.name);obj.transform.SetParent(root,false);
            obj.AddComponent<MeshFilter>().sharedMesh=mesh;
            var renderer=obj.AddComponent<MeshRenderer>();renderer.sharedMaterial=material;
            renderer.shadowCastingMode=ShadowCastingMode.Off;renderer.receiveShadows=false;
        }
        foreach(var source in sources)UnityEngine.Object.DestroyImmediate(source.gameObject);
    }
}
