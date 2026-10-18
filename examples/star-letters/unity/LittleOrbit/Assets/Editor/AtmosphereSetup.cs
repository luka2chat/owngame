using System;
using System.Linq;
using StarLetters;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

public static class AtmosphereSetup
{
    [MenuItem("Star Letters/Refine Golden Hour Atmosphere")]
    public static string Apply()
    {
        var scene=EditorSceneManager.GetActiveScene();
        if(EditorApplication.isPlayingOrWillChangePlaymode || scene.isDirty || scene.path!=CampaignSetup.ScenePath)
            throw new InvalidOperationException("Open saved StoryAdventure and stop Play.");
        var d=UnityEngine.Object.FindFirstObjectByType<CampaignDirector>();
        var sun=d.gardenPresentation.sun;
        var direction=new Vector3(-.75f,.22f,.58f).normalized;
        sun.transform.rotation=Quaternion.LookRotation(-direction,Vector3.up);
        sun.color=new Color(1,.84f,.62f);sun.intensity=2.3f;sun.shadowStrength=.86f;
        var fill=GameObject.Find("Cool sky fill").GetComponent<Light>();fill.intensity=.48f;fill.color=new Color(.65f,.73f,1);
        RenderSettings.ambientMode=AmbientMode.Trilight;
        RenderSettings.ambientSkyColor=new Color(.65f,.68f,.82f);
        RenderSettings.ambientEquatorColor=new Color(.61f,.51f,.51f);
        RenderSettings.ambientGroundColor=new Color(.36f,.32f,.42f);
        var sky=RenderSettings.skybox;
        sky.SetVector("_SunDirection",direction);sky.SetFloat("_Warmth",1);sky.SetFloat("_CloudStrength",.68f);
        sky.SetColor("_Zenith",new Color(.23f,.32f,.57f));sky.SetColor("_Horizon",new Color(.96f,.66f,.55f));sky.SetColor("_Nadir",new Color(.57f,.40f,.63f));
        EditorUtility.SetDirty(sky);RenderSettings.sun=sun;
        var volume=GameObject.Find("Soft storybook light").GetComponent<Volume>();var profile=volume.sharedProfile;
        if(!profile.TryGet<ColorAdjustments>(out var color)){color=profile.Add<ColorAdjustments>();AssetDatabase.AddObjectToAsset(color,profile);}
        color.postExposure.Override(.35f);color.contrast.Override(4);color.saturation.Override(3);
        if(!profile.TryGet<Tonemapping>(out var tone)){tone=profile.Add<Tonemapping>();AssetDatabase.AddObjectToAsset(tone,profile);}
        tone.mode.Override(TonemappingMode.ACES);
        EditorUtility.SetDirty(color);EditorUtility.SetDirty(tone);EditorUtility.SetDirty(profile);
        var cloudRoot=GameObject.Find(CloudVolumeSetup.RootName)??GameObject.Find("Layered cloud sea v3");
        var cloudShader=Shader.Find(cloudRoot.name==CloudVolumeSetup.RootName?"StarLetters/CloudVolume":"StarLetters/CloudAtmosphere");if(cloudShader==null || !cloudShader.isSupported)throw new Exception("Cloud shader unavailable");
        foreach(var mat in cloudRoot.GetComponentsInChildren<Renderer>().Select(r=>r.sharedMaterial).Distinct())
        {
            mat.shader=cloudShader;mat.SetColor("_ShadowColor",new Color(.45f,.43f,.59f));mat.SetColor("_HazeColor",new Color(.79f,.64f,.68f));
            EditorUtility.SetDirty(mat);
        }
        Shader.SetGlobalFloat("_StoryWarmth",1);
        var camera=d.traveler.viewCamera;var cameraSky=camera.GetComponent<Skybox>();if(cameraSky!=null)cameraSky.enabled=false;
        EditorSceneManager.MarkSceneDirty(scene);EditorSceneManager.SaveScene(scene);AssetDatabase.SaveAssets();
        return "ATMOSPHERE_OK: sun and sky direction aligned; golden key light, cool fill, filmic tone mapping, opaque cloud haze and shared seasonal sky.";
    }
}
