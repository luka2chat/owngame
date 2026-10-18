using System;
using System.Linq;
using StarLetters;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class HomeTreeSetup
{
    [MenuItem("Star Letters/Refresh Home Fruit Tree")]
    public static string Apply()
    {
        var scene=EditorSceneManager.GetActiveScene();
        if(EditorApplication.isPlayingOrWillChangePlaymode || scene.isDirty || scene.path!=CampaignSetup.ScenePath)
            throw new InvalidOperationException("Open saved StoryAdventure and stop Play first.");
        const string normalPath="Assets/Textures/Story/V2_tree-bark-normal.png";
        var normalImporter=(TextureImporter)AssetImporter.GetAtPath(normalPath);
        normalImporter.textureType=TextureImporterType.NormalMap;normalImporter.sRGBTexture=false;
        normalImporter.maxTextureSize=256;normalImporter.mipmapEnabled=true;normalImporter.wrapMode=TextureWrapMode.Repeat;
        normalImporter.SaveAndReimport();
        var importer=(ModelImporter)AssetImporter.GetAtPath("Assets/Models/Story/HomeArt-v2.fbx");
        foreach(var suffix in new[]{"TreeBark","TreeTwig","TreeLeafDeep","TreeLeafMid","TreeLeafSun","TreeFruit"})
        {
            string name="V2_"+suffix;
            var material=HomeArtSetup.ImportMaterial(name,Shader.Find("Universal Render Pipeline/Lit"));
            material.SetFloat("_Smoothness",suffix=="TreeFruit"?.28f:.12f);
            if(suffix=="TreeBark" || suffix=="TreeTwig")
            {
                material.SetTexture("_BumpMap",AssetDatabase.LoadAssetAtPath<Texture2D>(normalPath));
                material.SetFloat("_BumpScale",.55f);material.EnableKeyword("_NORMALMAP");
            }
            EditorUtility.SetDirty(material);
            importer.AddRemap(new AssetImporter.SourceAssetIdentifier(typeof(Material),name),material);
        }
        importer.SaveAndReimport();
        var director=UnityEngine.Object.FindFirstObjectByType<CampaignDirector>();
        var trunk=director.homeRoot.GetComponentsInChildren<MeshRenderer>(true).Single(r=>r.name=="TreeTrunk");
        // The original scene has an explicit timber override on this renderer.
        trunk.sharedMaterial=AssetDatabase.LoadAssetAtPath<Material>("Assets/Materials/Story/V2_TreeBark.mat");
        var collider=director.homeRoot.GetComponentsInChildren<BoxCollider>(true).Single(c=>c.name=="Tree collision");
        collider.transform.position=trunk.bounds.center;collider.center=Vector3.zero;collider.size=trunk.bounds.size;
        EditorSceneManager.MarkSceneDirty(scene);EditorSceneManager.SaveScene(scene);AssetDatabase.SaveAssets();
        return "HOME_TREE_IMPORTED: six dedicated materials; 256px bark color/normal; existing trunk collision fitted to new trunk; other collision proxies retained.";
    }
}
