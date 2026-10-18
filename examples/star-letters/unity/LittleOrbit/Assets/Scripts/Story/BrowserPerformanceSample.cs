using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace StarLetters
{
    // Opt-in diagnostic for actual player builds. No overlay or work in a normal
    // session; ?profile=1 records frame intervals without changing story state.
    public sealed class BrowserPerformanceSample : MonoBehaviour
    {
        readonly List<float> samples = new List<float>(1800);
        readonly HashSet<StoryWorld> completed = new HashSet<StoryWorld>();
        CampaignDirector campaign;
        StoryWorld world;
        float warmup, elapsed;
        bool initialized;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void StartIfRequested()
        {
            if (Application.isEditor || !Uri.TryCreate(Application.absoluteURL, UriKind.Absolute, out var uri)) return;
            bool requested = Array.Exists(uri.Query.TrimStart('?').Split('&'), part => part == "profile=1");
            if (requested) new GameObject("Browser frame sample").AddComponent<BrowserPerformanceSample>();
        }

        void Update()
        {
            if (campaign == null) campaign = FindFirstObjectByType<CampaignDirector>();
            if (campaign == null || campaign.Progress == null) return;
            var current = campaign.Progress.world;
            if (!Application.isFocused || !initialized || current != world)
            {
                samples.Clear(); elapsed = 0; warmup = 3; world = current; initialized = true;
                return;
            }
            if (completed.Contains(world)) return;
            if (warmup > 0) { warmup -= Time.unscaledDeltaTime; return; }
            float dt = Time.unscaledDeltaTime;
            if (dt <= 0) return;
            samples.Add(dt * 1000); elapsed += dt;
            if (elapsed < 12 || samples.Count < 30) return;
            samples.Sort();
            var pipeline=GraphicsSettings.currentRenderPipeline as UniversalRenderPipelineAsset;
            var result = new Result {
                planet = world.ToString(), frames = samples.Count, seconds = elapsed,
                meanFps = samples.Count / elapsed,
                medianMs = samples[samples.Count / 2],
                p95Ms = samples[Mathf.Min(samples.Count - 1, Mathf.CeilToInt(samples.Count * .95f) - 1)],
                maxMs = samples[samples.Count - 1],
                width = Screen.width, height = Screen.height,
                graphics = SystemInfo.graphicsDeviceName, unity = Application.unityVersion,
                pipeline=pipeline==null?"unknown":pipeline.name,
                renderScale=pipeline==null?0:pipeline.renderScale,
                msaa=pipeline==null?0:pipeline.msaaSampleCount,
                shadowResolution=pipeline==null?0:pipeline.mainLightShadowmapResolution,
                shadowCascades=pipeline==null?0:pipeline.shadowCascadeCount,
                scope = "Unity unscaled frame intervals in a focused browser; not a GPU timing or low-end hardware benchmark"
            };
            Debug.Log("STAR_LETTERS_PERF " + JsonUtility.ToJson(result));
            completed.Add(world); samples.Clear();
        }

        [Serializable] sealed class Result
        {
            public string planet, graphics, unity, scope, pipeline;
            public int frames, width, height;
            public int msaa, shadowResolution, shadowCascades;
            public float renderScale;
            public float seconds, meanFps, medianMs, p95Ms, maxMs;
        }
    }
}
