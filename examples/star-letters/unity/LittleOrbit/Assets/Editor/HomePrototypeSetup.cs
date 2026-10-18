using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using StarLetters;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;

public static class HomePrototypeSetup
{
    public const string ScenePath = "Assets/Scenes/HomePrototype.unity";
    const string ModelPath = "Assets/Models/Story/HomeBlockout-v1.fbx";
    const string MaterialPath = "Assets/Materials/Story";

    [MenuItem("Star Letters/Create Home Prototype")]
    public static void Create() => CreateScene(ScenePath, ModelPath, false);

    [MenuItem("Star Letters/Create Home Art Scene")]
    public static void CreateArt() => CreateScene("Assets/Scenes/HomeArt.unity", "Assets/Models/Story/HomeArt-v2.fbx", true);

    static void CreateScene(string scenePath, string modelPath, bool art)
    {
        if (EditorApplication.isPlayingOrWillChangePlaymode) throw new InvalidOperationException("Stop play mode first.");
        if (File.Exists(scenePath)) throw new InvalidOperationException(scenePath + " already exists. Open it; do not overwrite manual scene edits.");
        if (EditorSceneManager.GetActiveScene().isDirty) throw new InvalidOperationException("Save the current scene first.");
        AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
        var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(modelPath);
        if (prefab == null) throw new FileNotFoundException("Generate the Blender model first.", modelPath);
        var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        var model = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
        model.name = "Home Environment";
        Directory.CreateDirectory(MaterialPath);
        AssetDatabase.Refresh();

        var shader = Shader.Find("Universal Render Pipeline/Lit");
        if (shader == null) throw new InvalidOperationException("URP/Lit unavailable.");
        var materials = new Dictionary<string, Material>();
        foreach (var renderer in model.GetComponentsInChildren<Renderer>())
        {
            var converted = renderer.sharedMaterials.Select(source => {
                string key = source != null ? source.name : "Fallback";
                if (!materials.TryGetValue(key, out var material))
                {
                    Color color = source != null && source.HasProperty("_Color") ? source.color : new Color(.65f,.6f,.5f);
                    material = art ? HomeArtSetup.ImportMaterial(key, shader) : MakeMaterial(key, color, shader);
                    materials.Add(key, material);
                }
                return material;
            }).ToArray();
            renderer.sharedMaterials = converted;
        }
        Transform Find(string name) => model.GetComponentsInChildren<Transform>().First(t => t.name == name);
        var ground = Find("Ground_Surface").gameObject;
        ground.AddComponent<MeshCollider>().sharedMesh = ground.GetComponent<MeshFilter>().sharedMesh;
        // Collision proxies derive world bounds from exported geometry; visual detail
        // is intentionally not a forest of tiny colliders.
        AddBoundsCollider(Find("Cottage_Walls").GetComponent<Renderer>(), "Cottage collision");
        AddBoundsCollider(Find("TreeTrunk").GetComponent<Renderer>(), "Tree collision");
        AddBoundsCollider(Find("BenchSeat").GetComponent<Renderer>(), "Bench collision");
        AddBoundsCollider(Find("Soil").GetComponent<Renderer>(), "Flower bed collision");
        AddBoundsCollider(Find("BeaconPlinth").GetComponent<Renderer>(), "Beacon collision");

        var points = new List<HomeInteraction>();
        foreach (var pair in new[] {
            ("Mailbox", HomeAction.Mailbox, "打开来信"), ("Flower", HomeAction.Flower, "照看花朵"),
            ("Toolbox", HomeAction.Toolbox, "查看工具箱"), ("Beacon", HomeAction.Beacon, "查看信标") })
        {
            var interaction = Find("Interact_" + pair.Item1).gameObject.AddComponent<HomeInteraction>();
            interaction.action = pair.Item2; interaction.displayName = pair.Item3;
            points.Add(interaction);
        }

        var player = new GameObject("Traveler");
        player.transform.position = Find("PlayerSpawn").position + Vector3.up * .08f;
        var controller = player.AddComponent<CharacterController>();
        controller.height = 1.65f; controller.radius = .28f; controller.center = new Vector3(0,.825f,0);
        controller.stepOffset = .25f; controller.skinWidth = .03f;
        var avatar = new GameObject("Avatar").transform;
        avatar.SetParent(player.transform, false);
        var coat = MakeMaterial("Traveler coat", new Color(.83f,.74f,.56f), shader);
        var leather = MakeMaterial("Traveler leather", new Color(.25f,.13f,.07f), shader);
        var skin = MakeMaterial("Traveler skin", new Color(.76f,.51f,.33f), shader);
        Shape("Coat", PrimitiveType.Capsule, avatar, new Vector3(0,.9f,0), new Vector3(.55f,.40f,.42f), coat);
        Shape("Head", PrimitiveType.Sphere, avatar, new Vector3(0,1.48f,.02f), Vector3.one*.39f, skin);
        Shape("Hair", PrimitiveType.Sphere, avatar, new Vector3(0,1.61f,-.035f), new Vector3(.41f,.23f,.40f), leather);
        Shape("Mail satchel", PrimitiveType.Cube, avatar, new Vector3(0,.94f,-.27f), new Vector3(.40f,.44f,.18f), leather);
        var left = new GameObject("Left leg pivot").transform; left.SetParent(avatar,false); left.localPosition=new Vector3(-.16f,.58f,0);
        var right = new GameObject("Right leg pivot").transform; right.SetParent(avatar,false); right.localPosition=new Vector3(.16f,.58f,0);
        Shape("Left leg", PrimitiveType.Capsule, left, new Vector3(0,-.27f,0), new Vector3(.19f,.28f,.2f), leather);
        Shape("Right leg", PrimitiveType.Capsule, right, new Vector3(0,-.27f,0), new Vector3(.19f,.28f,.2f), leather);
        Shape("Left arm", PrimitiveType.Capsule, avatar, new Vector3(-.34f,.91f,0), new Vector3(.16f,.29f,.16f), coat);
        Shape("Right arm", PrimitiveType.Capsule, avatar, new Vector3(.34f,.91f,0), new Vector3(.16f,.29f,.16f), coat);

        var camera = new GameObject("Main Camera").AddComponent<Camera>();
        camera.tag = "MainCamera"; camera.fieldOfView = 43;
        camera.nearClipPlane = .1f; camera.farClipPlane = 180;
        camera.clearFlags=CameraClearFlags.SolidColor; camera.backgroundColor = new Color(.48f,.53f,.67f);
        camera.transform.position = new Vector3(12,15,18); camera.transform.LookAt(Vector3.zero);
        camera.gameObject.AddComponent<AudioListener>();
        var sun = new GameObject("Warm sunlight").AddComponent<Light>();
        sun.type=LightType.Directional; sun.color=new Color(1,.84f,.64f); sun.intensity=1.7f;
        sun.shadows=LightShadows.Soft; sun.transform.rotation=Quaternion.Euler(42,-35,0);
        RenderSettings.ambientMode=AmbientMode.Trilight;
        RenderSettings.ambientSkyColor=new Color(.58f,.64f,.76f);
        RenderSettings.ambientEquatorColor=new Color(.49f,.43f,.36f);
        RenderSettings.ambientGroundColor=new Color(.25f,.29f,.26f);
        var lamp = new GameObject("Beacon glow").AddComponent<Light>();
        lamp.type=LightType.Point; lamp.color=new Color(1,.55f,.18f); lamp.range=5; lamp.intensity=4;
        lamp.transform.position=Find("BeaconCrystal").position + Vector3.up*.3f; lamp.enabled=false;
        var adventure = player.AddComponent<HomeAdventure>();
        adventure.viewCamera=camera; adventure.avatar=avatar; adventure.leftLeg=left; adventure.rightLeg=right;
        adventure.interactions=points.ToArray(); adventure.beaconLight=lamp;
        adventure.beaconCrystal=Find("BeaconCrystal").GetComponent<Renderer>();
        adventure.spawn=player.transform.position;
        if (art) HomeArtSetup.Configure(model, adventure, camera, sun);
        EditorSceneManager.SaveScene(scene,scenePath);
        AssetDatabase.SaveAssets();
        Debug.Log("HOME_SCENE_CREATED: " + scenePath);
    }

    static Material MakeMaterial(string name, Color color, Shader shader)
    {
        string path = MaterialPath + "/" + name.Replace("/","-") + ".mat";
        var material = AssetDatabase.LoadAssetAtPath<Material>(path);
        if (material != null) return material;
        material=new Material(shader) {name=name}; material.SetColor("_BaseColor",color); material.SetFloat("_Smoothness",.15f);
        AssetDatabase.CreateAsset(material,path); return material;
    }
    static void Shape(string name, PrimitiveType type, Transform parent, Vector3 position, Vector3 scale, Material mat)
    {
        var obj=GameObject.CreatePrimitive(type); obj.name=name; obj.transform.SetParent(parent,false);
        obj.transform.localPosition=position; obj.transform.localScale=scale;
        UnityEngine.Object.DestroyImmediate(obj.GetComponent<Collider>());
        obj.GetComponent<Renderer>().sharedMaterial=mat;
    }
    static void AddBoundsCollider(Renderer renderer, string name)
    {
        var proxy=new GameObject(name); proxy.transform.position=renderer.bounds.center;
        proxy.AddComponent<BoxCollider>().size=renderer.bounds.size;
    }

    [MenuItem("Star Letters/Validate Home Rules")]
    public static void ValidateRules()
    {
        var q=new HomeQuest();
        void Require(bool condition,string description) { if(!condition) throw new Exception(description); }
        Require(!q.Apply(HomeAction.Beacon),"Early beacon must not complete quest.");
        Require(!q.Apply(HomeAction.Toolbox),"Early toolbox must not skip letter.");
        Require(q.Apply(HomeAction.Mailbox),"Letter should advance.");
        Require(!q.Apply(HomeAction.Mailbox),"Duplicate letter must not advance.");
        Require(!q.Apply(HomeAction.Toolbox),"Toolbox must not skip flower.");
        Require(q.Apply(HomeAction.Flower),"Flower should advance.");
        Require(!q.Apply(HomeAction.Beacon),"Beacon needs the spare part.");
        Require(q.Apply(HomeAction.Toolbox),"Toolbox should advance.");
        Require(q.Apply(HomeAction.Beacon) && q.Stage==HomeStage.Ready,"Beacon completes opening.");
        foreach(HomeAction a in Enum.GetValues(typeof(HomeAction))) Require(!q.Apply(a),"Completion must be stable.");
        q.Reset(); Require(q.Stage==HomeStage.ReadLetter,"Reset restores initial stage.");
        Debug.Log("HOME_RULES_OK: sequence, early actions, duplicate actions, terminal state, restart.");
    }

    // Integration check deliberately uses live scene interaction and proximity guards.
    // It does not substitute for exercising keyboard controls and camera visually.
    public static string ValidateLiveInteractions()
    {
        if(!EditorApplication.isPlaying) throw new InvalidOperationException("Run in Play mode.");
        var game=UnityEngine.Object.FindFirstObjectByType<HomeAdventure>();
        if(game==null) throw new Exception("No HomeAdventure.");
        game.Restart();
        var initial=game.transform.position;
        var ordered=game.interactions.OrderBy(p=>(int)p.action).ToArray();
        foreach(var point in ordered)
        {
            game.TeleportTo(point.transform.position + Vector3.up*.05f);
            if(!game.Interact(point)) throw new Exception("Cannot interact at "+point.name);
            game.CloseDialogue();
        }
        if(game.Quest.Stage!=HomeStage.Ready || !game.beaconLight.enabled) throw new Exception("Beacon did not light.");
        game.Restart();
        game.TeleportTo(new Vector3(0,20,0));
        if(game.Interact(ordered[0])) throw new Exception("Out-of-range interaction accepted.");
        game.TeleportTo(initial);
        return "HOME_LIVE_OK: four interactions, lit beacon, restart and range guard.";
    }

    public static string ValidateWalkingRoute()
    {
        if(!EditorApplication.isPlaying) throw new InvalidOperationException("Run in Play mode.");
        var game=UnityEngine.Object.FindFirstObjectByType<HomeAdventure>();
        var controller=game.GetComponent<CharacterController>();
        game.Restart();
        Physics.SyncTransforms();
        void Walk(Vector3 target)
        {
            for(int frame=0;frame<1500;frame++)
            {
                var delta=Vector3.ProjectOnPlane(target-game.transform.position,Vector3.up);
                if(delta.magnitude<.10f) return;
                controller.Move(Vector3.ClampMagnitude(delta,.04f)+Vector3.down*.04f);
                if(game.transform.position.y < -.5f) throw new Exception("Character fell through ground.");
            }
            throw new Exception("Route blocked before "+target+" at "+game.transform.position);
        }
        HomeInteraction Point(HomeAction action) => game.interactions.First(p=>p.action==action);
        void Visit(HomeAction action)
        {
            var point=Point(action); Walk(point.transform.position);
            if(!game.Interact(point)) throw new Exception("Walking did not reach interaction: "+action);
            game.CloseDialogue();
        }
        Visit(HomeAction.Mailbox);
        Visit(HomeAction.Flower);
        Walk(new Vector3(-.6f,0,2.2f));
        Walk(new Vector3(-.6f,0,-1.7f));
        Visit(HomeAction.Toolbox);
        Walk(new Vector3(-.6f,0,-1.7f));
        Walk(new Vector3(-2f,0,0));
        Visit(HomeAction.Beacon);
        if(game.Quest.Stage!=HomeStage.Ready) throw new Exception("Walking route failed to finish.");
        // Push toward the closed cottage: the actual collider must stop movement.
        var house=GameObject.Find("Cottage collision").GetComponent<BoxCollider>();
        game.TeleportTo(new Vector3(house.bounds.center.x,.08f,house.bounds.max.z+1));
        Physics.SyncTransforms();
        for(int i=0;i<120;i++) controller.Move(new Vector3(0,-.04f,-.04f));
        if(game.transform.position.z < house.bounds.max.z+.1f) throw new Exception("Character passed through cottage.");
        game.Restart();
        return "HOME_WALK_OK: CharacterController traversed all four objectives; ground and cottage collision verified.";
    }
}
