using System;
using System.IO;
using System.Linq;
using StarLetters;
using UnityEditor;
using UnityEngine;

// Fixed Unity render views for comparing both seasons after model edits.
// This review temporarily restores valid story states without writing saves.
public static class GardenArtReview
{
    public static string Capture(string prefix="garden-cottage-v3")
    {
        var director=UnityEngine.Object.FindFirstObjectByType<CampaignDirector>();
        if(!EditorApplication.isPlaying || director==null || director.Progress==null)
            throw new InvalidOperationException("Run StoryAdventure first.");
        var traveler=director.traveler;var camera=traveler.viewCamera;
        var saved=CampaignSave.Encode(director.Progress);bool persist=director.persistence,enabled=traveler.enabled;
        var position=traveler.transform.position;var cameraPosition=camera.transform.position;var rotation=camera.transform.rotation;
        float fov=camera.fieldOfView;var sky=camera.GetComponent<Skybox>();bool skyEnabled=sky!=null && sky.enabled;
        string folder=Path.GetFullPath(Path.Combine(Application.dataPath,"../../../art/validation"));
        var progress=new CampaignProgress();director.persistence=false;traveler.enabled=false;
        void View(string name,Vector3 eye,Vector3 focus,float field)
        {
            camera.transform.position=eye;camera.transform.LookAt(focus);camera.fieldOfView=field;
            if(sky!=null)sky.enabled=false;
            foreach(var rig in UnityEngine.Object.FindObjectsByType<StorybookCharacter>(FindObjectsSortMode.None))rig.Animate(1-rig.phase);
            Render(camera,Path.Combine(folder,name));
        }
        try
        {
            foreach(var action in new[]{StoryAction.Letter,StoryAction.Flower,StoryAction.Toolbox,StoryAction.Beacon})progress.Apply(action);
            progress.Travel(StoryWorld.Neighbor);progress.Apply(StoryAction.Artisan);progress.Apply(StoryAction.Gardener);progress.Apply(StoryAction.Photo);
            for(int i=0;i<3;i++)progress.Apply(StoryAction.Vane);
            progress.Apply(StoryAction.Diverter);progress.Apply(StoryAction.Sluice);progress.Travel(StoryWorld.Garden);
            if(!director.Restore(CampaignSave.Encode(progress)))throw new Exception("Invalid winter fixture");
            if(prefix=="garden-terrain-v1" && director.gardenPresentation.winterRocks.Count(r=>r.sharedMaterials.Any(m=>m.shader.name=="StarLetters/WeatheredRock"))!=3)
                throw new Exception("Expected three cliff batches bound to seasonal rock snow");
            if(prefix=="garden-ground-v2" || prefix=="garden-terrain-v1")GardenMeadowReview.Validate(director.gardenPresentation,0);
            View(prefix+"-winter-unity.png",new Vector3(-7.5f,5.8f,11.4f),new Vector3(-.1f,1,-.3f),50);
            if(prefix.StartsWith("garden-tree"))
            {
                View(prefix+"-winter-tree-unity.png",new Vector3(2.9f,2.3f,-.1f),new Vector3(4.3f,2.9f,-3.4f),58);
                View(prefix+"-winter-bark-unity.png",new Vector3(4.95f,1.2f,-1.6f),new Vector3(4.3f,1.65f,-3.4f),55);
            }
            var giant=director.gardenRoot.GetComponentsInChildren<StorybookCharacter>().FirstOrDefault(r=>r.giant);
            if(prefix=="characters-v2" && giant!=null)
            {
                View(prefix+"-giant-winter-unity.png",giant.head.position+new Vector3(.15f,.05f,2.5f),giant.head.position,48);
                if(giant.mouth.localScale.y>=0)throw new Exception("Winter giant did not show concerned expression");
            }
            foreach(var action in new[]{StoryAction.Cabinet,StoryAction.EmptyChairs,StoryAction.Giant,StoryAction.Giant,StoryAction.GardenMail})progress.Apply(action);
            progress.Travel(StoryWorld.Neighbor);progress.Apply(StoryAction.Artisan);progress.Apply(StoryAction.Gardener);progress.Travel(StoryWorld.Garden);
            foreach(var action in new[]{StoryAction.PlantSeeds,StoryAction.HangChime,StoryAction.GardenGate,StoryAction.TeaTable})progress.Apply(action);
            if(!progress.reunion || !director.Restore(CampaignSave.Encode(progress)))throw new Exception("Invalid spring fixture");
            if(prefix=="garden-ground-v2" || prefix=="garden-terrain-v1")GardenMeadowReview.Validate(director.gardenPresentation,1);
            View(prefix+"-spring-unity.png",new Vector3(-7.5f,5.8f,11.4f),new Vector3(-.1f,1,-.3f),50);
            if(prefix.StartsWith("garden-tree"))
            {
                View(prefix+"-spring-tree-unity.png",new Vector3(2.9f,2.3f,-.1f),new Vector3(4.3f,2.9f,-3.4f),58);
                View(prefix+"-spring-bark-unity.png",new Vector3(4.95f,1.2f,-1.6f),new Vector3(4.3f,1.65f,-3.4f),55);
            }
            View(prefix+"-detail-unity.png",new Vector3(-2,2.6f,3),new Vector3(1.2f,1.8f,-2.2f),56);
            if(prefix=="characters-v2" && giant!=null)
            {
                View(prefix+"-giant-spring-unity.png",giant.head.position+new Vector3(.15f,.05f,2.5f),giant.head.position,48);
                if(giant.mouth.localScale.y<=0)throw new Exception("Spring giant did not smile");
            }
            return "GARDEN_ART_REVIEW_OK: winter, spring and cottage detail rendered at 1280x720; no save writes.";
        }
        finally
        {
            director.Restore(saved);director.persistence=persist;traveler.TeleportTo(position);traveler.enabled=enabled;
            camera.transform.SetPositionAndRotation(cameraPosition,rotation);camera.fieldOfView=fov;
            if(sky!=null)sky.enabled=skyEnabled;
        }
    }

    public static void Render(Camera camera,string path)
    {
        var target=new RenderTexture(1280,720,24);var previous=camera.targetTexture;var active=RenderTexture.active;
        Texture2D pixels=null;
        try
        {
            camera.targetTexture=target;camera.Render();RenderTexture.active=target;
            pixels=new Texture2D(1280,720,TextureFormat.RGB24,false);pixels.ReadPixels(new Rect(0,0,1280,720),0,0);pixels.Apply();
            Directory.CreateDirectory(Path.GetDirectoryName(path));File.WriteAllBytes(path,pixels.EncodeToPNG());
        }
        finally
        {
            camera.targetTexture=previous;RenderTexture.active=active;target.Release();UnityEngine.Object.DestroyImmediate(target);
            if(pixels!=null)UnityEngine.Object.DestroyImmediate(pixels);
        }
    }
}
