using System;
using System.Linq;
using StarLetters;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class GardenStoneSetup
{
    public const string ShaderName="StarLetters/CourtyardStone";
    public static Material ForGarden(Material source)
    {
        if(source==null || (source.name!="V2_Stone" && source.name!="V2_Rock"))return source;
        return AssetDatabase.LoadAssetAtPath<Material>("Assets/Materials/Story/Garden_"+source.name+".mat") ?? source;
    }
    [MenuItem("Star Letters/Refine Garden Stone")]
    public static string Apply()
    {
        if(EditorApplication.isPlayingOrWillChangePlaymode)throw new InvalidOperationException("Stop Play first.");
        var scene=EditorSceneManager.GetActiveScene();
        if(scene.path!=CampaignSetup.ScenePath || scene.isDirty)throw new InvalidOperationException("Open saved StoryAdventure first.");
        var shader=Shader.Find(ShaderName);
        if(shader==null || ShaderUtil.ShaderHasError(shader))throw new InvalidOperationException("Courtyard stone shader unavailable.");
        foreach(string name in new[]{"V2_Stone","V2_Rock"})
        {
            var original=AssetDatabase.LoadAssetAtPath<Material>("Assets/Materials/Story/"+name+".mat");
            string path="Assets/Materials/Story/Garden_"+name+".mat";
            var material=AssetDatabase.LoadAssetAtPath<Material>(path);
            if(material==null){material=new Material(shader){name="Garden_"+name};AssetDatabase.CreateAsset(material,path);}
            material.shader=shader;material.SetColor("_BaseColor",original.GetColor("_BaseColor"));
            material.SetColor("_MossColor",new Color(.26f,.32f,.13f));material.SetFloat("_MossAmount",.8f);
            material.SetFloat("_Relief",.005f);material.SetFloat("_SnowAmount",0);
            material.SetVector("_PondCenterRadius",new Vector4(-3.65f,0,.15f,2.1f));EditorUtility.SetDirty(material);
        }
        var d=UnityEngine.Object.FindFirstObjectByType<CampaignDirector>();
        var model=d.gardenRoot.transform.Find("Garden environment");int count=0;
        foreach(var renderer in model.GetComponentsInChildren<MeshRenderer>(true))
        {
            var materials=renderer.sharedMaterials;bool changed=false;
            for(int i=0;i<materials.Length;i++)
            {
                var next=ForGarden(materials[i]);if(next==materials[i])continue;
                materials[i]=next;count++;changed=true;
            }
            if(!changed)continue;
            renderer.sharedMaterials=materials;PrefabUtility.RecordPrefabInstancePropertyModifications(renderer);
        }
        d.gardenPresentation.winterRocks=model.GetComponentsInChildren<MeshRenderer>(true)
            .Where(r=>r!=d.gardenPresentation.ground && r.sharedMaterials.Any(m=>m!=null && m.HasProperty("_SnowAmount"))).Cast<Renderer>().ToArray();
        EditorUtility.SetDirty(d.gardenPresentation);EditorSceneManager.MarkSceneDirty(scene);EditorSceneManager.SaveScene(scene);AssetDatabase.SaveAssets();
        return "GARDEN_STONE_APPLIED: "+count+" material slots replaced; "+d.gardenPresentation.winterRocks.Length+" seasonal stone renderers; geometry unchanged.";
    }
}
