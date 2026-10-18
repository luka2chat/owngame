using System;
using System.Linq;
using StarLetters;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class GardenTreeSetup
{
    public static string Apply()
    {
        var scene=EditorSceneManager.GetActiveScene();
        if(EditorApplication.isPlayingOrWillChangePlaymode || scene.isDirty || scene.path!=CampaignSetup.ScenePath)
            throw new InvalidOperationException("Open saved StoryAdventure and stop Play first.");
        const string manifest="Assets/Models/Story/GardenArt-v1.json";
        foreach(string key in new[]{"GardenBark","GardenLeafDeep","GardenLeafSun","GardenBlossomPink","GardenBlossomIvory","GardenPollen"})
        {
            var material=HomeArtSetup.ImportMaterial("V2_"+key,Shader.Find("Universal Render Pipeline/Lit"),manifest);
            if(key=="GardenBark")
            {
                material.SetTexture("_BumpMap",AssetDatabase.LoadAssetAtPath<Texture2D>("Assets/Textures/Story/V2_tree-bark-normal.png"));
                material.SetFloat("_BumpScale",.55f);material.SetFloat("_Smoothness",.08f);material.EnableKeyword("_NORMALMAP");
            }
            EditorUtility.SetDirty(material);
        }
        AssetDatabase.SaveAssets();GardenSetup.RefreshArtDetails();
        var director=UnityEngine.Object.FindFirstObjectByType<CampaignDirector>();
        var trunk=director.gardenRoot.GetComponentsInChildren<MeshRenderer>(true).Single(r=>r.name=="Solid_Tree");
        var collider=director.gardenRoot.GetComponentsInChildren<BoxCollider>(true).Single(c=>c.name=="Solid_Tree collision");
        collider.transform.position=trunk.bounds.center;collider.center=Vector3.zero;collider.size=trunk.bounds.size;
        EditorSceneManager.MarkSceneDirty(scene);EditorSceneManager.SaveScene(scene);AssetDatabase.SaveAssets();
        return "GARDEN_TREE_IMPORTED: original bark maps reused; five opaque growing foliage materials; existing trunk collision fitted to new trunk.";
    }
}
