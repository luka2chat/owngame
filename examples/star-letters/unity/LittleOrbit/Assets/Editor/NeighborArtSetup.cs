using System;
using System.Linq;
using StarLetters;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;

public static class NeighborArtSetup
{
    const string Manifest="Assets/Models/Story/NeighborArt-v1.json";
    [MenuItem("Star Letters/Refresh Neighbor Art Details")]
    public static string Refresh()
    {
        if(EditorApplication.isPlayingOrWillChangePlaymode)throw new InvalidOperationException("Stop Play first.");
        var scene=EditorSceneManager.GetActiveScene();
        if(scene.path!=CampaignSetup.ScenePath || scene.isDirty)throw new InvalidOperationException("Open saved StoryAdventure.");
        var d=UnityEngine.Object.FindFirstObjectByType<CampaignDirector>();
        var model=d.neighborRoot.transform.Find("Neighbor environment");
        var prefab=AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Models/Story/NeighborArt-v1.fbx");
        var targets=model.GetComponentsInChildren<Transform>(true).ToDictionary(t=>t.name);
        var shader=Shader.Find("Universal Render Pipeline/Lit");
        var waterShader=Shader.Find("StarLetters/StreamWater");
        if(waterShader==null || !waterShader.isSupported)throw new Exception("Stream water shader unavailable");
        string waterPath="Assets/Materials/Story/V2_NeighborWaterMotion.mat";
        var water=AssetDatabase.LoadAssetAtPath<Material>(waterPath);
        if(water==null){water=new Material(waterShader);AssetDatabase.CreateAsset(water,waterPath);}
        water.shader=waterShader;water.SetColor("_BaseColor",new Color(.22f,.52f,.61f));EditorUtility.SetDirty(water);
        int meshes=0,addedColliders=0;
        foreach(var source in prefab.GetComponentsInChildren<MeshRenderer>(true))
        {
            if(!targets.TryGetValue(source.name,out var target))
            {
                target=new GameObject(source.name).transform;target.SetParent(model,false);
                target.gameObject.AddComponent<MeshFilter>();target.gameObject.AddComponent<MeshRenderer>();
            }
            // Batch origins can change when Blender joins new details. Copy the
            // imported local pose as well as the mesh while keeping root references.
            target.localPosition=source.transform.localPosition;target.localRotation=source.transform.localRotation;target.localScale=source.transform.localScale;
            var filter=target.GetComponent<MeshFilter>();filter.sharedMesh=source.GetComponent<MeshFilter>().sharedMesh;
            var renderer=target.GetComponent<MeshRenderer>();
            renderer.sharedMaterials=source.sharedMaterials.Select(m=>m.name=="V2_Water"?water:HomeArtSetup.ImportMaterial(m.name,shader,Manifest)).ToArray();
            foreach(var material in renderer.sharedMaterials)
            {
                if(material.name!="V2_GreenhouseGlass")continue;
                material.SetColor("_BaseColor",new Color(.57f,.76f,.69f,.32f));
                material.SetFloat("_Surface",1);material.SetFloat("_Blend",0);material.SetFloat("_ZWrite",0);
                material.SetFloat("_SrcBlend",(float)BlendMode.SrcAlpha);material.SetFloat("_DstBlend",(float)BlendMode.OneMinusSrcAlpha);
                material.SetFloat("_Cull",(float)CullMode.Back);material.SetFloat("_Smoothness",.48f);
                material.SetOverrideTag("RenderType","Transparent");material.renderQueue=(int)RenderQueue.Transparent;
                material.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");material.DisableKeyword("_ALPHAPREMULTIPLY_ON");
                material.SetShaderPassEnabled("ShadowCaster",false);material.SetShaderPassEnabled("DepthOnly",false);
                renderer.shadowCastingMode=ShadowCastingMode.Off;EditorUtility.SetDirty(material);
            }
            if(source.name.StartsWith("Solid_"))
            {
                string collisionName=source.name+" collision";var proxy=d.neighborRoot.transform.Find(collisionName);
                if(proxy==null){proxy=new GameObject(collisionName).transform;proxy.SetParent(d.neighborRoot.transform,false);proxy.gameObject.AddComponent<BoxCollider>();addedColliders++;}
                proxy.position=renderer.bounds.center;proxy.GetComponent<BoxCollider>().size=renderer.bounds.size;
            }
            PrefabUtility.RecordPrefabInstancePropertyModifications(target);PrefabUtility.RecordPrefabInstancePropertyModifications(filter);
            PrefabUtility.RecordPrefabInstancePropertyModifications(renderer);meshes++;
        }
        foreach(var name in new[]{"WorkshopLamp","GardenHouseLamp"})
        {
            var anchor=model.GetComponentsInChildren<Transform>(true).SingleOrDefault(t=>t.name==name);
            if(anchor==null)throw new InvalidOperationException("Missing imported light anchor: "+name);
            var existing=d.neighborRoot.transform.Find(name+" glow");
            var obj=existing!=null?existing.gameObject:new GameObject(name+" glow");obj.transform.SetParent(d.neighborRoot.transform,false);obj.transform.position=anchor.position;
            var light=obj.GetComponent<Light>();if(light==null)light=obj.AddComponent<Light>();
            light.type=LightType.Point;light.color=new Color(1,.71f,.39f);light.intensity=.65f;light.range=2.7f;light.shadows=LightShadows.None;
        }
        foreach(var reference in new[]{d.windmill,d.vane,d.sluice,d.diverter})
            if(reference==null || !reference.IsChildOf(model))throw new Exception("Lost moving-part binding");
        if(d.irrigationWater==null || d.bypassWater==null || d.seedlings==null)throw new Exception("Lost puzzle reward binding");
        var ground=model.GetComponentsInChildren<MeshFilter>(true).Single(f=>f.name=="Ground_Surface");
        ground.GetComponent<MeshCollider>().sharedMesh=ground.sharedMesh;
        EditorSceneManager.MarkSceneDirty(scene);EditorSceneManager.SaveScene(scene);AssetDatabase.SaveAssets();
        return $"NEIGHBOR_DETAILS_OK: {meshes} meshes refreshed; {addedColliders} new solid proxies; chime workshop, garden house, greenhouse and channels; moving and interaction references retained.";
    }
}
