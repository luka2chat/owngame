using System;
using System.IO;
using System.Linq;
using StarLetters;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class CampaignSetup
{
    public const string ScenePath="Assets/Scenes/StoryAdventure.unity";
    [MenuItem("Star Letters/Create Story Adventure")]
    public static void Create()
    {
        if(EditorApplication.isPlayingOrWillChangePlaymode)throw new InvalidOperationException("Stop play mode first.");
        if(File.Exists(ScenePath))throw new InvalidOperationException("StoryAdventure already exists; open it to preserve edits.");
        if(EditorSceneManager.GetActiveScene().isDirty)throw new InvalidOperationException("Save the current scene first.");
        var prefab=AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Models/Story/NeighborArt-v1.fbx");
        if(prefab==null)throw new InvalidOperationException("Generate the NeighborArt model first.");
        var scene=EditorSceneManager.OpenScene("Assets/Scenes/HomeArt.unity",OpenSceneMode.Single);
        // Save a separate scene before adding story roots; HomeArt remains a reference.
        EditorSceneManager.SaveScene(scene,ScenePath,true);
        scene=EditorSceneManager.OpenScene(ScenePath,OpenSceneMode.Single);
        var traveler=UnityEngine.Object.FindFirstObjectByType<HomeAdventure>();
        var originalRoots=scene.GetRootGameObjects();
        var home=new GameObject("Home planet");
        string[] shared={"Traveler","Main Camera","Warm sunlight","Cool sky fill","Soft storybook light","Cloud sea","Art comparison cameras"};
        foreach(var root in originalRoots)if(!shared.Contains(root.name))root.transform.SetParent(home.transform,true);
        var director=new GameObject("Journey").AddComponent<CampaignDirector>();
        director.traveler=traveler;director.homeRoot=home;traveler.campaign=director;
        director.homeSpawn=traveler.spawn;director.homeCrystal=traveler.beaconCrystal;director.homeLamp=traveler.beaconLight;
        foreach(var interaction in home.GetComponentsInChildren<HomeInteraction>(true))
        {
            var point=interaction.gameObject.AddComponent<StoryInteraction>();point.radius=interaction.radius;point.label=interaction.displayName;
            point.action=interaction.action==HomeAction.Mailbox?StoryAction.Letter:interaction.action==HomeAction.Flower?StoryAction.Flower:
                interaction.action==HomeAction.Toolbox?StoryAction.Toolbox:StoryAction.Beacon;
        }
        var neighbor=new GameObject("Neighbor planet");director.neighborRoot=neighbor;
        var model=(GameObject)PrefabUtility.InstantiatePrefab(prefab);model.transform.SetParent(neighbor.transform,false);model.name="Neighbor environment";
        var shader=Shader.Find("Universal Render Pipeline/Lit");
        foreach(var renderer in model.GetComponentsInChildren<MeshRenderer>())
            renderer.sharedMaterials=renderer.sharedMaterials.Select(m=>HomeArtSetup.ImportMaterial(m.name,shader,"Assets/Models/Story/NeighborArt-v1.json")).ToArray();
        Transform Find(string name)=>model.GetComponentsInChildren<Transform>().Single(t=>t.name==name);
        var ground=Find("Ground_Surface").gameObject;ground.AddComponent<MeshCollider>().sharedMesh=ground.GetComponent<MeshFilter>().sharedMesh;
        foreach(var renderer in model.GetComponentsInChildren<MeshRenderer>().Where(r=>r.name.StartsWith("Solid_")))
        {
            var proxy=new GameObject(renderer.name+" collision");proxy.transform.SetParent(neighbor.transform,false);
            proxy.transform.position=renderer.bounds.center;proxy.AddComponent<BoxCollider>().size=renderer.bounds.size;
        }
        foreach(var pair in new[]{("Artisan",StoryAction.Artisan,"和风铃匠聊聊"),("Vane",StoryAction.Vane,"转动风向标"),
            ("Gardener",StoryAction.Gardener,"和种植者聊聊"),("Diverter",StoryAction.Diverter,"转动分水阀"),
            ("Sluice",StoryAction.Sluice,"扳动水闸"),("Photo",StoryAction.Photo,"看看旧合影"),("Beacon",StoryAction.Beacon,"沿信标旅行")})
        {
            var point=Find("Interact_"+pair.Item1).gameObject.AddComponent<StoryInteraction>();point.action=pair.Item2;point.label=pair.Item3;point.radius=1.65f;
        }
        director.neighborSpawn=Find("PlayerSpawn").position+Vector3.up*.08f;
        director.vane=Find("Vane");director.windmill=Find("Windmill");director.sluice=Find("SluiceHandle");director.diverter=Find("DiverterHandle");
        director.irrigationWater=Find("IrrigationWater").gameObject;director.bypassWater=Find("BypassWater").gameObject;director.seedlings=Find("Seedlings").gameObject;
        CreateFriend(traveler.avatar,neighbor.transform,Find("NPC_Artisan").position,true);
        CreateFriend(traveler.avatar,neighbor.transform,Find("NPC_Gardener").position,false);
        neighbor.SetActive(false);
        if(File.Exists("Assets/Models/Story/GardenArt-v1.fbx"))GardenSetup.Attach(director);
        EditorSceneManager.SaveScene(scene);AssetDatabase.SaveAssets();
        Debug.Log("STORY_SCENE_CREATED: "+ScenePath);
    }

    static Material Mat(string name,Color color)
    {
        string path="Assets/Materials/Story/"+name+".mat";var mat=AssetDatabase.LoadAssetAtPath<Material>(path);
        if(mat!=null)return mat;
        mat=new Material(Shader.Find("Universal Render Pipeline/Lit")){name=name};mat.SetColor("_BaseColor",color);mat.SetFloat("_Smoothness",.1f);
        AssetDatabase.CreateAsset(mat,path);return mat;
    }
    static void Shape(string name,PrimitiveType type,Transform root,Vector3 pos,Vector3 scale,Material material)
    {
        var obj=GameObject.CreatePrimitive(type);obj.name=name;obj.transform.SetParent(root,false);obj.transform.localPosition=pos;obj.transform.localScale=scale;
        UnityEngine.Object.DestroyImmediate(obj.GetComponent<Collider>());obj.GetComponent<Renderer>().sharedMaterial=material;
    }
    static void CreateFriend(Transform source,Transform parent,Vector3 position,bool artisan)
    {
        var npc=UnityEngine.Object.Instantiate(source.gameObject,parent);npc.name=artisan?"Artisan A-Li":"Gardener A-Kui";
        npc.transform.position=position;npc.transform.rotation=Quaternion.identity;npc.transform.localScale=Vector3.one*(artisan?1.08f:1.02f);
        var collider=npc.AddComponent<CapsuleCollider>();collider.height=1.65f;collider.radius=.3f;collider.center=Vector3.up*.825f;
        var coat=Mat(artisan?"Artisan apron":"Gardener coat",artisan?new Color(.36f,.27f,.17f):new Color(.39f,.50f,.29f));
        foreach(var renderer in npc.GetComponentsInChildren<MeshRenderer>())
        {
            if(renderer.name=="Coat" || renderer.name.Contains("arm"))renderer.sharedMaterial=coat;
            if(renderer.name.Contains("Scarf") || renderer.name=="Travel cap" || renderer.name=="Cap brim")renderer.gameObject.SetActive(false);
        }
        var pale=Mat("Friend warm linen",new Color(.87f,.82f,.67f));var dark=Mat("Friend eyes",new Color(.12f,.12f,.12f));
        for(int side=-1;side<=1;side+=2)Shape("Eye",PrimitiveType.Sphere,npc.transform,new Vector3(side*.07f,1.50f,.19f),new Vector3(.035f,.04f,.025f),dark);
        Shape("Apron",PrimitiveType.Cube,npc.transform,new Vector3(0,.83f,.21f),new Vector3(.38f,.53f,.035f),pale);
        if(artisan)
        {
            for(int i=-1;i<=1;i++)Shape("Silver beard",PrimitiveType.Sphere,npc.transform,new Vector3(i*.07f,1.33f,.18f),new Vector3(.14f,.17f,.13f),pale);
            Shape("Grey hair",PrimitiveType.Sphere,npc.transform,new Vector3(0,1.62f,-.04f),new Vector3(.43f,.22f,.42f),pale);
        }
        else
        {
            var straw=Mat("Gardener straw hat",new Color(.72f,.52f,.27f));
            Shape("Straw hat brim",PrimitiveType.Cylinder,npc.transform,new Vector3(0,1.68f,0),new Vector3(.70f,.025f,.63f),straw);
            Shape("Straw hat crown",PrimitiveType.Sphere,npc.transform,new Vector3(0,1.74f,0),new Vector3(.43f,.24f,.43f),straw);
        }
    }
}
