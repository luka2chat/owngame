using System;
using System.IO;
using StarLetters;
using UnityEditor;
using UnityEngine;

public static class AtmosphereReview
{
    public static string Capture(string prefix="atmosphere-v1")
    {
        var d=UnityEngine.Object.FindFirstObjectByType<CampaignDirector>();
        if(!EditorApplication.isPlaying || d==null || d.Progress==null)throw new InvalidOperationException("Run StoryAdventure.");
        var p=d.traveler;var camera=p.viewCamera;var saved=CampaignSave.Encode(d.Progress);
        bool persist=d.persistence,enabled=p.enabled;var position=p.transform.position;
        var eye=camera.transform.position;var rotation=camera.transform.rotation;float fov=camera.fieldOfView;
        string folder=Path.GetFullPath(Path.Combine(Application.dataPath,"../../../art/validation"));
        d.persistence=false;p.enabled=false;
        void View(string name,Vector3 from,Vector3 at,float field)
        {
            camera.transform.position=from;camera.transform.LookAt(at);camera.fieldOfView=field;
            var overrideSky=camera.GetComponent<Skybox>();if(overrideSky!=null)overrideSky.enabled=false;
            GardenArtReview.Render(camera,Path.Combine(folder,prefix+"-"+name+"-unity.png"));
        }
        void Warm()
        {
            if(Mathf.Abs(Shader.GetGlobalFloat("_StoryWarmth")-1)>.001f)throw new Exception("Warm atmosphere not restored outside winter garden");
            var direction=(Vector3)RenderSettings.skybox.GetVector("_SunDirection");
            if(Vector3.Dot(direction.normalized,-d.gardenPresentation.sun.transform.forward)<.999f)throw new Exception("Visible sun and light disagree");
        }
        try
        {
            var progress=new CampaignProgress();d.Restore(CampaignSave.Encode(progress));Warm();
            View("home",new Vector3(1.1f,1.35f,6.3f),new Vector3(1.8f,.6f,1.5f),55);
            View("home-overview",new Vector3(12,13,20),new Vector3(0,.25f,0),43);
            View("cloud-bank",new Vector3(0,2,9),new Vector3(0,-4,28),60);
            foreach(var action in new[]{StoryAction.Letter,StoryAction.Flower,StoryAction.Toolbox,StoryAction.Beacon})progress.Apply(action);
            progress.Travel(StoryWorld.Neighbor);d.Restore(CampaignSave.Encode(progress));Warm();
            View("neighbor",new Vector3(1.4f,2,2.2f),new Vector3(4,1.3f,-1.6f),54);
            progress.Apply(StoryAction.Artisan);progress.Apply(StoryAction.Gardener);progress.Apply(StoryAction.Photo);
            for(int i=0;i<3;i++)progress.Apply(StoryAction.Vane);
            progress.Apply(StoryAction.Diverter);progress.Apply(StoryAction.Sluice);progress.Travel(StoryWorld.Garden);
            d.Restore(CampaignSave.Encode(progress));
            float winterIntensity=d.gardenPresentation.sun.intensity;
            if(Shader.GetGlobalFloat("_StoryWarmth")>.001f || RenderSettings.skybox.GetFloat("_Warmth")>.001f)throw new Exception("Winter atmosphere is warm");
            progress.Travel(StoryWorld.Home);d.Restore(CampaignSave.Encode(progress));Warm();
            if(d.gardenPresentation.sun.intensity<=winterIntensity)throw new Exception("Home light did not restore");
            View("home-return",new Vector3(1.1f,1.35f,6.3f),new Vector3(1.8f,.6f,1.5f),55);
            return "ATMOSPHERE_REVIEW_OK: home, overview, neighbor and winter-to-home return rendered; sun alignment and cold/warm restoration checked; no save writes.";
        }
        finally
        {
            d.Restore(saved);d.persistence=persist;p.TeleportTo(position);p.enabled=enabled;
            camera.transform.SetPositionAndRotation(eye,rotation);camera.fieldOfView=fov;
        }
    }
}
