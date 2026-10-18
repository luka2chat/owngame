using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

public static class StoryWebBuild
{
    public static string Output => Path.GetFullPath(Environment.GetEnvironmentVariable("STAR_LETTERS_BUILD_OUTPUT") ?? "Builds/WebStory");
    [MenuItem("Star Letters/Build Full Story Web")]
    public static void Build()
    {
        if(EditorApplication.isPlayingOrWillChangePlaymode)throw new InvalidOperationException("Stop Play first.");
        if(UnityEditor.SceneManagement.EditorSceneManager.GetActiveScene().isDirty)throw new InvalidOperationException("Save scene changes first.");
        WebBuild.Configure();
        // Preserve the original save identity.
        PlayerSettings.WebGL.template="PROJECT:StarLetters";
        PlayerSettings.defaultWebScreenWidth=1280;PlayerSettings.defaultWebScreenHeight=720;
        EditorBuildSettings.scenes=new[]{new EditorBuildSettingsScene(CampaignSetup.ScenePath,true)};
        Directory.CreateDirectory(Output);
        var report=BuildPipeline.BuildPlayer(new BuildPlayerOptions{scenes=new[]{CampaignSetup.ScenePath},locationPathName=Output,target=BuildTarget.WebGL,options=BuildOptions.DetailedBuildReport});
        var s=report.summary;
        File.WriteAllText(Path.Combine(Output,"build-summary.json"),JsonUtility.ToJson(new Summary{result=s.result.ToString(),unity=Application.unityVersion,scene=CampaignSetup.ScenePath,errors=s.totalErrors,warnings=s.totalWarnings,bytes=s.totalSize,seconds=s.totalTime.TotalSeconds},true));
        if(s.result!=BuildResult.Succeeded)throw new BuildFailedException("Story Web build failed; inspect build-summary.json.");
        Debug.Log("STORY_WEB_BUILD_OK "+Output);
    }
    [Serializable] class Summary {public string result,unity,scene;public int errors,warnings;public ulong bytes;public double seconds;}
}
