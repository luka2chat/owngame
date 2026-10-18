using System;
using UnityEditor;
using UnityEngine.Rendering.Universal;

public static class StoryWebQuality
{
    [MenuItem("Star Letters/Refine Web Image Quality")]
    public static string Apply()
    {
        if(EditorApplication.isPlayingOrWillChangePlaymode)throw new InvalidOperationException("Stop Play first.");
        var asset=AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>("Assets/Settings/Mobile_RPAsset.asset");
        asset.renderScale=1;asset.msaaSampleCount=2;
        asset.mainLightShadowmapResolution=2048;asset.shadowCascadeCount=2;
        asset.cascade2Split=.4f;asset.shadowDistance=40;asset.cascadeBorder=.2f;
        asset.shadowDepthBias=1.2f;asset.shadowNormalBias=.7f;
        var serialized=new SerializedObject(asset);
        serialized.FindProperty("m_SoftShadowsSupported").boolValue=true;
        serialized.FindProperty("m_SoftShadowQuality").intValue=2;
        serialized.ApplyModifiedPropertiesWithoutUndo();EditorUtility.SetDirty(asset);AssetDatabase.SaveAssets();
        return "WEB_QUALITY_APPLIED: native render scale, 2x MSAA, 2048px two-cascade filtered shadows; must validate in actual WebGL build.";
    }
}
