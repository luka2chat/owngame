using System;
using System.Linq;
using StarLetters;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;

public static class GardenSetup
{
    [MenuItem("Star Letters/Refresh Garden Art Details")]
    public static void RefreshArtDetails()
    {
        if(EditorApplication.isPlayingOrWillChangePlaymode)throw new InvalidOperationException("Stop Play first.");
        var scene=EditorSceneManager.GetActiveScene();
        if(scene.path!=CampaignSetup.ScenePath || scene.isDirty)
            throw new InvalidOperationException("Open the saved StoryAdventure scene first.");
        var director=UnityEngine.Object.FindFirstObjectByType<CampaignDirector>();
        var model=director.gardenRoot.transform.Find("Garden environment");
        var prefab=AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Models/Story/GardenArt-v1.fbx");
        var sources=prefab.GetComponentsInChildren<MeshRenderer>(true).ToDictionary(r=>r.name);
        var targets=model.GetComponentsInChildren<Transform>(true).ToDictionary(t=>t.name);
        foreach(var source in sources.Values)
        {
            if(!targets.TryGetValue(source.name,out var target))
            {
                target=new GameObject(source.name).transform;target.SetParent(model,false);
                target.gameObject.AddComponent<MeshFilter>();target.gameObject.AddComponent<MeshRenderer>();
            }
            // A batch's origin can change when its first source object is replaced.
            // Keep the existing object/references but use the newly imported pose.
            target.localPosition=source.transform.localPosition;target.localRotation=source.transform.localRotation;target.localScale=source.transform.localScale;
            var renderer=target.GetComponent<MeshRenderer>();
            var filter=renderer.GetComponent<MeshFilter>();
            Undo.RecordObjects(new UnityEngine.Object[]{renderer,filter},"Refresh garden details");
            filter.sharedMesh=source.GetComponent<MeshFilter>().sharedMesh;
            renderer.sharedMaterials=source.sharedMaterials.Select(m=>HomeArtSetup.ImportMaterial(m.name,
                Shader.Find("Universal Render Pipeline/Lit"),"Assets/Models/Story/GardenArt-v1.json")).Select(GardenStoneSetup.ForGarden).ToArray();
            if(renderer==director.gardenPresentation.ground && director.gardenPresentation.meadow!=null)
            {
                var materials=renderer.sharedMaterials;
                materials[0]=AssetDatabase.LoadAssetAtPath<Material>("Assets/Materials/Story/V2_GardenSeasonGround.mat");
                renderer.sharedMaterials=materials;
            }
            if(renderer==director.gardenPresentation.pond)
            {
                var pondMaterial=AssetDatabase.LoadAssetAtPath<Material>(GardenPondSetup.MaterialPath);
                if(pondMaterial!=null)renderer.sharedMaterial=pondMaterial;
            }
            PrefabUtility.RecordPrefabInstancePropertyModifications(renderer);
            PrefabUtility.RecordPrefabInstancePropertyModifications(filter);
            PrefabUtility.RecordPrefabInstancePropertyModifications(target);
        }
        var groundFilter=director.gardenPresentation.ground.GetComponent<MeshFilter>();
        groundFilter.GetComponent<MeshCollider>().sharedMesh=groundFilter.sharedMesh;
        director.gardenPresentation.winterRocks=model.GetComponentsInChildren<MeshRenderer>(true)
            .Where(r=>r!=director.gardenPresentation.ground && r.sharedMaterials.Any(m=>m!=null && m.HasProperty("_SnowAmount"))).Cast<Renderer>().ToArray();
        EditorUtility.SetDirty(director.gardenPresentation);
        foreach(float x in new[]{1.04f,3.78f})
        {
            string name=x<2?"Garden porch light left":"Garden porch light right";
            var existing=director.gardenRoot.transform.Find(name);
            var lamp=existing!=null?existing.gameObject:new GameObject(name);
            if(existing==null){Undo.RegisterCreatedObjectUndo(lamp,"Add garden porch light");lamp.transform.SetParent(director.gardenRoot.transform,false);}
            lamp.transform.position=model.GetComponentsInChildren<Transform>(true).Single(t=>t.name==(x<2?"PorchLightLeft":"PorchLightRight")).position;
            var light=lamp.GetComponent<Light>();if(light==null)light=lamp.AddComponent<Light>();
            light.type=LightType.Point;light.range=2.6f;light.intensity=.65f;
            light.color=new Color(1f,.67f,.34f);light.shadows=LightShadows.None;
        }
        EditorSceneManager.MarkSceneDirty(scene);EditorSceneManager.SaveScene(scene);AssetDatabase.SaveAssets();
        Debug.Log("GARDEN_DETAILS_REFRESHED: masonry, arched door, window shutters, lanterns and evergreen ivy; gameplay anchors and seasonal references retained.");
    }

    [MenuItem("Star Letters/Refresh Garden Seasonal Canopy")]
    public static void RefreshSeasonalCanopy()
    {
        if(EditorApplication.isPlayingOrWillChangePlaymode)throw new InvalidOperationException("Stop Play first.");
        var scene=EditorSceneManager.GetActiveScene();
        if(scene.path!=CampaignSetup.ScenePath || scene.isDirty)
            throw new InvalidOperationException("Open the saved StoryAdventure scene first.");
        var director=UnityEngine.Object.FindFirstObjectByType<CampaignDirector>();
        var target=director.gardenPresentation.springCanopy;
        var prefab=AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Models/Story/GardenArt-v1.fbx");
        var source=prefab.GetComponentsInChildren<MeshRenderer>(true).Single(r=>r.name=="SpringCanopy");
        var renderer=target.GetComponent<MeshRenderer>();var filter=target.GetComponent<MeshFilter>();
        Undo.RecordObjects(new UnityEngine.Object[]{renderer,filter},"Refresh garden canopy");
        filter.sharedMesh=source.GetComponent<MeshFilter>().sharedMesh;
        renderer.sharedMaterials=source.sharedMaterials.Select(m=>HomeArtSetup.ImportMaterial(m.name,
            Shader.Find("Universal Render Pipeline/Lit"),"Assets/Models/Story/GardenArt-v1.json")).ToArray();
        PrefabUtility.RecordPrefabInstancePropertyModifications(renderer);
        PrefabUtility.RecordPrefabInstancePropertyModifications(filter);
        EditorSceneManager.MarkSceneDirty(scene);EditorSceneManager.SaveScene(scene);AssetDatabase.SaveAssets();
        Debug.Log("GARDEN_CANOPY_REFRESHED: "+filter.sharedMesh.vertexCount+" vertices, "+renderer.sharedMaterials.Length+" material batches; seasonal binding preserved.");
    }

    [MenuItem("Star Letters/Add Garden Chapter")]
    public static void AddToCurrentScene()
    {
        if(EditorApplication.isPlayingOrWillChangePlaymode)throw new InvalidOperationException("Stop Play first.");
        var scene=EditorSceneManager.GetActiveScene();
        if(scene.path!=CampaignSetup.ScenePath)throw new InvalidOperationException("Open StoryAdventure first.");
        if(scene.isDirty)throw new InvalidOperationException("Save existing edits first.");
        Attach(UnityEngine.Object.FindFirstObjectByType<CampaignDirector>());
        EditorSceneManager.SaveScene(scene);AssetDatabase.SaveAssets();
    }
    public static void Attach(CampaignDirector director)
    {
        if(director==null)throw new InvalidOperationException("No campaign director.");
        if(director.gardenRoot!=null)throw new InvalidOperationException("Garden already exists; preserve its edits.");
        var prefab=AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Models/Story/GardenArt-v1.fbx");
        if(prefab==null)throw new InvalidOperationException("Generate GardenArt first.");
        var root=new GameObject("Garden planet");director.gardenRoot=root;
        var model=(GameObject)PrefabUtility.InstantiatePrefab(prefab);model.name="Garden environment";model.transform.SetParent(root.transform,false);
        foreach(var renderer in model.GetComponentsInChildren<MeshRenderer>())
            renderer.sharedMaterials=renderer.sharedMaterials.Select(m=>HomeArtSetup.ImportMaterial(m.name,Shader.Find("Universal Render Pipeline/Lit"),"Assets/Models/Story/GardenArt-v1.json")).ToArray();
        Transform Find(string name)=>model.GetComponentsInChildren<Transform>().Single(t=>t.name==name);
        var ground=Find("Ground_Surface").gameObject;ground.AddComponent<MeshCollider>().sharedMesh=ground.GetComponent<MeshFilter>().sharedMesh;
        foreach(var renderer in model.GetComponentsInChildren<MeshRenderer>().Where(r=>r.name.StartsWith("Solid_")))
        {
            var proxy=new GameObject(renderer.name+" collision");proxy.transform.SetParent(root.transform,false);
            proxy.transform.position=renderer.bounds.center;proxy.AddComponent<BoxCollider>().size=renderer.bounds.size;
        }
        foreach(var pair in new[]{("Beacon",StoryAction.Beacon,"沿信标旅行"),("Giant",StoryAction.Giant,"和窗边的巨人说话"),
            ("Cabinet",StoryAction.Cabinet,"看看春天收藏柜"),("EmptyChairs",StoryAction.EmptyChairs,"看看两张空椅子"),
            ("GardenMail",StoryAction.GardenMail,"查看花园信箱"),("GardenGate",StoryAction.GardenGate,"推开花园的大门"),
            ("PlantSeeds",StoryAction.PlantSeeds,"把种子种进土里"),("HangChime",StoryAction.HangChime,"挂起黄铜风铃"),("TeaTable",StoryAction.TeaTable,"摆好第三只茶杯")})
        {
            var point=Find("Interact_"+pair.Item1).gameObject.AddComponent<StoryInteraction>();point.action=pair.Item2;point.label=pair.Item3;point.radius=1.45f;
        }
        director.gardenSpawn=Find("PlayerSpawn").position+Vector3.up*.08f;
        var visual=director.gameObject.AddComponent<GardenPresentation>();director.gardenPresentation=visual;
        visual.leftGate=Find("GateLeft");visual.rightGate=Find("GateRight");
        var gate=new GameObject("Garden gate collision");gate.transform.SetParent(root.transform,false);gate.transform.position=new Vector3(0,.94f,2.5f);
        var gateCollider=gate.AddComponent<BoxCollider>();gateCollider.size=new Vector3(2.5f,1.78f,.30f);visual.gateCollider=gateCollider;
        visual.winterSnow=Find("WinterSnow").gameObject;visual.springCanopy=Find("SpringCanopy").gameObject;visual.springFlowers=Find("SpringFlowers").gameObject;
        visual.plantedFlowers=Find("PlantedFlowers").gameObject;visual.hangingChime=Find("HangingChime").gameObject;
        visual.ground=ground.GetComponent<Renderer>();visual.pond=Find("Pond").GetComponent<Renderer>();
        visual.sun=GameObject.Find("Warm sunlight").GetComponent<Light>();
        var snowRenderer=visual.winterSnow.GetComponent<Renderer>();snowRenderer.shadowCastingMode=ShadowCastingMode.Off;
        var snow=snowRenderer.sharedMaterial;snow.SetFloat("_Surface",1);snow.SetFloat("_SrcBlend",(float)BlendMode.SrcAlpha);
        snow.SetFloat("_DstBlend",(float)BlendMode.OneMinusSrcAlpha);snow.SetFloat("_ZWrite",0);snow.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");snow.renderQueue=3000;EditorUtility.SetDirty(snow);
        visual.seatedGuests=new GameObject("Reunited friends");visual.seatedGuests.transform.SetParent(root.transform,false);
        var friends=director.neighborRoot.GetComponentsInChildren<Transform>(true).Where(t=>t.name=="Artisan A-Li" || t.name=="Gardener A-Kui").ToArray();
        visual.neighborFriends=friends.Select(t=>t.gameObject).ToArray();
        visual.neighborFriendPoints=director.neighborRoot.GetComponentsInChildren<StoryInteraction>(true).Where(p=>p.action==StoryAction.Artisan || p.action==StoryAction.Gardener).Select(p=>p.gameObject).ToArray();
        foreach(var friend in friends)
        {
            bool artisan=friend.name=="Artisan A-Li";
            var guest=UnityEngine.Object.Instantiate(friend.gameObject,visual.seatedGuests.transform);
            guest.name=artisan?"Seated Artisan A-Li":"Seated Gardener A-Kui";guest.transform.position=Find(artisan?"Seat_Artisan":"Seat_Gardener").position;
            guest.transform.rotation=Quaternion.identity;
            foreach(var collider in guest.GetComponentsInChildren<Collider>())UnityEngine.Object.DestroyImmediate(collider);
            foreach(var part in guest.GetComponentsInChildren<Transform>())
                if(part.name=="Left leg pivot" || part.name=="Right leg pivot")part.localRotation=Quaternion.Euler(-55,0,0);
            var talk=new GameObject("Talk to seated friend");talk.transform.SetParent(guest.transform,false);talk.transform.localPosition=new Vector3(0,.15f,1);
            var point=talk.AddComponent<StoryInteraction>();point.action=artisan?StoryAction.Artisan:StoryAction.Gardener;point.label=artisan?"和阿栎喝杯茶":"和阿葵看看花";
        }
        visual.seatedGuests.SetActive(false);visual.springFlowers.SetActive(false);visual.springCanopy.SetActive(false);visual.plantedFlowers.SetActive(false);visual.hangingChime.SetActive(false);
        root.SetActive(false);
        Debug.Log("GARDEN_CHAPTER_ATTACHED: winter, spring, giant, gates and reunited friends.");
    }
}
