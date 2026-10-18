using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;
using UnityEngine.Rendering;

public static class WebBuild
{
    public const string Scene = "Assets/Scenes/StoryAdventure.unity";

    [MenuItem("Little Orbit/Configure Web Preview")]
    public static void Configure()
    {
        // Uncompressed output can be served locally without special encoding headers.
        PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled;
        PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.WebGL, false);
        PlayerSettings.SetGraphicsAPIs(BuildTarget.WebGL, new[] { GraphicsDeviceType.OpenGLES3 });
        EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(Scene, true) };
        AssetDatabase.SaveAssets();
    }

    [MenuItem("Little Orbit/Build Web Preview")]
    public static void Build()
    {
        if (EditorApplication.isPlayingOrWillChangePlaymode)
            throw new InvalidOperationException("Stop Play mode before building.");
        if (!File.Exists(Scene))
            throw new FileNotFoundException("Open the included story scene first.", Scene);
        Configure();
        var output = Path.GetFullPath("Builds/Web");
        var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
        {
            scenes = new[] { Scene },
            locationPathName = output,
            target = BuildTarget.WebGL,
            options = BuildOptions.DetailedBuildReport
        });
        var summary = report.summary;
        Directory.CreateDirectory("Builds");
        File.WriteAllText("Builds/web-build-summary.json", JsonUtility.ToJson(new Summary
        {
            result = summary.result.ToString(),
            outputPath = output,
            totalErrors = summary.totalErrors,
            totalWarnings = summary.totalWarnings,
            totalBytes = summary.totalSize,
            seconds = summary.totalTime.TotalSeconds,
            unityVersion = Application.unityVersion
        }, true));
        if (summary.result != BuildResult.Succeeded)
            throw new BuildFailedException("Web build failed; inspect the Editor log and Builds/web-build-summary.json.");
        Debug.Log("Web preview built: " + output);
    }

    [Serializable]
    private class Summary
    {
        public string result, outputPath, unityVersion;
        public int totalErrors, totalWarnings;
        public ulong totalBytes;
        public double seconds;
    }
}
