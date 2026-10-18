using System;
using System.IO;
using System.Linq;
using StarLetters;
using UnityEditor;
using UnityEngine;

public static class NeighborArtReview
{
    public static string Capture(string prefix="neighbor-detail-v2")
    {
        var d=UnityEngine.Object.FindFirstObjectByType<CampaignDirector>();
        if(!EditorApplication.isPlaying || d==null || d.Progress==null)throw new InvalidOperationException("Run StoryAdventure.");
        var p=d.traveler;var camera=p.viewCamera;var saved=CampaignSave.Encode(d.Progress);
        bool persist=d.persistence,enabled=p.enabled;var position=p.transform.position;
        var eye=camera.transform.position;var rotation=camera.transform.rotation;float fov=camera.fieldOfView;
        var sky=camera.GetComponent<Skybox>();bool skyEnabled=sky!=null && sky.enabled;
        string folder=Path.GetFullPath(Path.Combine(Application.dataPath,"../../../art/validation"));
        d.persistence=false;p.enabled=false;
        void View(string name,Vector3 from,Vector3 at,float field)
        {
            camera.transform.position=from;camera.transform.LookAt(at);camera.fieldOfView=field;
            if(sky!=null)sky.enabled=false;
            foreach(var rig in UnityEngine.Object.FindObjectsByType<StorybookCharacter>(FindObjectsSortMode.None))rig.Animate(1-rig.phase);
            GardenArtReview.Render(camera,Path.Combine(folder,name.Replace("neighbor-detail-v2",prefix)));
        }
        try
        {
            var progress=new CampaignProgress();
            foreach(var action in new[]{StoryAction.Letter,StoryAction.Flower,StoryAction.Toolbox,StoryAction.Beacon})progress.Apply(action);
            progress.Travel(StoryWorld.Neighbor);if(!d.Restore(CampaignSave.Encode(progress)))throw new Exception("Invalid neighbor fixture");
            View("neighbor-detail-v2-workshop-unity.png",new Vector3(1.4f,2.0f,2.2f),new Vector3(4.0f,1.3f,-1.6f),54);
            View("neighbor-detail-v2-garden-house-unity.png",new Vector3(-.6f,2.5f,.6f),new Vector3(-4.3f,1.25f,-3.0f),57);
            View("neighbor-detail-v2-greenhouse-unity.png",new Vector3(-8.3f,2.6f,.5f),new Vector3(-5.5f,1.45f,-3.4f),55);
            View("neighbor-detail-v2-overview-unity.png",new Vector3(12,12,20),new Vector3(0,.3f,0),43);
            progress.Apply(StoryAction.Artisan);progress.Apply(StoryAction.Gardener);
            for(int i=0;i<3;i++)progress.Apply(StoryAction.Vane);
            progress.Apply(StoryAction.Diverter);progress.Apply(StoryAction.Sluice);
            if(!progress.waterSolved || !d.Restore(CampaignSave.Encode(progress)))throw new Exception("Invalid water fixture");
            View("neighbor-detail-v2-irrigation-unity.png",new Vector3(-6,2.7f,4.2f),new Vector3(-3.7f,.4f,1.1f),54);
            var meadow=d.neighborRoot.transform.Find("Neighbor meadow v2");
            if(meadow==null || meadow.GetComponentsInChildren<Collider>().Length!=0)throw new Exception("Neighbor meadow must be decoration only");
            var renderers=meadow.GetComponentsInChildren<MeshRenderer>();
            if(renderers.Length!=8 || renderers.Any(r=>r.sharedMaterial.shader.name!="StarLetters/Meadow"))throw new Exception("Unexpected neighbor meadow batches");
            return "NEIGHBOR_ART_REVIEW_OK: workshop, garden house, greenhouse, overview and solved irrigation rendered; 8 meadow batches with no colliders; no save writes.";
        }
        finally
        {
            d.Restore(saved);d.persistence=persist;p.TeleportTo(position);p.enabled=enabled;
            camera.transform.SetPositionAndRotation(eye,rotation);camera.fieldOfView=fov;
            if(sky!=null)sky.enabled=skyEnabled;
        }
    }
}
