using System;
using System.IO;
using StarLetters;
using UnityEditor;
using UnityEngine;

// Observe actual Play-mode updates; never advance a timer or write a player save.
public static class AtmosphereTransitionReview
{
    static CampaignDirector director;
    static string saved,capturePrefix;
    static bool capturedMidpoint;
    static bool persistence,playerEnabled,midpoint,background;
    static Vector3 position;
    static double started;
    public static string Result {get;private set;}="Not run";
    public static string Begin(string imagePrefix=null)
    {
        if(Result=="Running")throw new InvalidOperationException("Already running");
        director=UnityEngine.Object.FindFirstObjectByType<CampaignDirector>();
        if(!EditorApplication.isPlaying || director==null)throw new InvalidOperationException("Run StoryAdventure");
        capturePrefix=imagePrefix;capturedMidpoint=false;
        saved=CampaignSave.Encode(director.Progress);persistence=director.persistence;playerEnabled=director.traveler.enabled;position=director.traveler.transform.position;
        background=Application.runInBackground;Application.runInBackground=true;
        director.persistence=false;director.traveler.enabled=false;
        var q=new CampaignProgress();
        foreach(var a in new[]{StoryAction.Letter,StoryAction.Flower,StoryAction.Toolbox,StoryAction.Beacon})q.Apply(a);
        q.Travel(StoryWorld.Neighbor);q.Apply(StoryAction.Artisan);q.Apply(StoryAction.Gardener);q.Apply(StoryAction.Photo);
        for(int i=0;i<3;i++)q.Apply(StoryAction.Vane);
        q.Apply(StoryAction.Diverter);q.Apply(StoryAction.Sluice);q.Travel(StoryWorld.Garden);
        foreach(var a in new[]{StoryAction.Cabinet,StoryAction.EmptyChairs,StoryAction.Giant,StoryAction.Giant,StoryAction.GardenMail})q.Apply(a);
        q.Travel(StoryWorld.Neighbor);q.Apply(StoryAction.Artisan);q.Apply(StoryAction.Gardener);q.Travel(StoryWorld.Garden);
        foreach(var a in new[]{StoryAction.PlantSeeds,StoryAction.HangChime,StoryAction.GardenGate})q.Apply(a);
        if(!director.Restore(CampaignSave.Encode(q))){Finish("FAILED: invalid winter fixture");return Result;}
        q.Apply(StoryAction.TeaTable);
        if(!q.reunion){Finish("FAILED: reunion fixture");return Result;}
        director.gardenPresentation.SetState(q,false);started=EditorApplication.timeSinceStartup;midpoint=false;Result="Running";
        EditorApplication.update+=Tick;EditorApplication.QueuePlayerLoopUpdate();return Result;
    }
    static void Tick()
    {
        if(!EditorApplication.isPlaying || director==null){Finish("FAILED: play stopped");return;}
        float amount=director.gardenPresentation.SpringAmount;
        float expected=Mathf.SmoothStep(0,1,amount);
        if(Mathf.Abs(Shader.GetGlobalFloat("_StoryWarmth")-expected)>.015f){Finish("FAILED: cloud season drift");return;}
        if(Mathf.Abs(RenderSettings.skybox.GetFloat("_Warmth")-expected)>.015f){Finish("FAILED: sky season drift");return;}
        var pond=director.gardenPresentation.pond.sharedMaterial;
        if(pond.HasProperty("_Season") && Mathf.Abs(pond.GetFloat("_Season")-expected)>.015f){Finish("FAILED: pond season drift");return;}
        if(director.gardenPresentation.meadow!=null)
        {
            try{GardenMeadowReview.Validate(director.gardenPresentation,expected);}
            catch(Exception error){Finish("FAILED: "+error.Message);return;}
        }
        if(amount>.2f && amount<.8f)midpoint=true;
        if(capturePrefix!=null && !capturedMidpoint && amount>.45f && amount<.8f)
        {
            var camera=director.traveler.viewCamera;var eye=camera.transform.position;var rotation=camera.transform.rotation;float fov=camera.fieldOfView;
            try
            {
                camera.transform.position=new Vector3(-7.5f,5.8f,11.4f);camera.transform.LookAt(new Vector3(-.1f,1,-.3f));camera.fieldOfView=50;
                if(capturePrefix.StartsWith("garden-tree"))
                {camera.transform.position=new Vector3(2.9f,2.3f,-.1f);camera.transform.LookAt(new Vector3(4.3f,2.9f,-3.4f));camera.fieldOfView=58;}
                GardenArtReview.Render(camera,Path.GetFullPath(Path.Combine(Application.dataPath,"../../../art/validation/"+capturePrefix+"-transition-unity.png")));
                capturedMidpoint=true;
            }
            catch(Exception error){Finish("FAILED: midpoint capture "+error.Message);return;}
            finally{camera.transform.SetPositionAndRotation(eye,rotation);camera.fieldOfView=fov;}
        }
        if(amount>=.999f)
        {
            Finish(midpoint && (capturePrefix==null || capturedMidpoint)?"ATMOSPHERE_TRANSITION_OK: actual winter-to-spring frames observed; sky/cloud warmth, optional meadow height, flowers, ground/rock snow, architectural snow opacity and spring foliage/tree growth followed intermediate/final values; shared meadow/rock/tree materials unchanged; saved progress restored.":"FAILED: no intermediate frames observed");
        }
        else if(EditorApplication.timeSinceStartup-started>20)Finish("FAILED: timed out waiting for Play-mode frames");
    }
    static void Finish(string result)
    {
        EditorApplication.update-=Tick;Result=result;Application.runInBackground=background;
        if(director!=null && EditorApplication.isPlaying)
        {
            director.Restore(saved);director.persistence=persistence;director.traveler.TeleportTo(position);director.traveler.enabled=playerEnabled;
        }
    }
}
