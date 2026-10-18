using System;
using System.IO;
using System.Linq;
using StarLetters;
using UnityEditor;
using UnityEngine;

public static class StoryPhotoReview
{
    static void Require(bool condition,string message){if(!condition)throw new Exception(message);}
    public static string ValidateAndCapture()
    {
        var d=UnityEngine.Object.FindFirstObjectByType<CampaignDirector>();
        Require(EditorApplication.isPlaying && d!=null && d.Progress!=null,"Run StoryAdventure first.");
        string saved=CampaignSave.Encode(d.Progress);bool persistence=d.persistence;d.persistence=false;
        var player=d.traveler;var camera=player.viewCamera;bool enabled=player.enabled;var position=player.transform.position;
        var eye=camera.transform.position;var rotation=camera.transform.rotation;float fov=camera.fieldOfView;
        try
        {
            var progress=new CampaignProgress();d.Restore(CampaignSave.Encode(progress));
            Require(!d.InspectPhotograph() && !d.IsBlockingInput,"Photograph appeared before discovery.");
            foreach(var action in new[]{StoryAction.Letter,StoryAction.Flower,StoryAction.Toolbox,StoryAction.Beacon})progress.Apply(action);
            progress.Travel(StoryWorld.Neighbor);d.Restore(CampaignSave.Encode(progress));
            var point=d.neighborRoot.GetComponentsInChildren<StoryInteraction>().Single(p=>p.action==StoryAction.Photo);
            player.TeleportTo(point.transform.position);Physics.SyncTransforms();
            Require(d.Interact(point) && d.Progress.photoSeen && d.PhotoOpen && !d.PhotoBack,"First discovery did not show the photograph front.");
            string acquired=CampaignSave.Encode(d.Progress);
            Require(!d.Interact(point) && !d.InspectPhotograph(),"Photo did not block duplicate interaction.");
            d.FlipPhotograph();Require(d.PhotoBack && d.IsBlockingInput,"Back inspection lost input lock.");
            d.FlipPhotograph();Require(!d.PhotoBack && CampaignSave.Encode(d.Progress)==acquired,"Flipping changed story progress.");
            d.CloseDialogue();Require(!d.PhotoOpen && !d.PhotoBack && !d.IsBlockingInput,"Closing photo did not restore input.");
            Require(!d.Interact(point) && d.PhotoOpen && CampaignSave.Encode(d.Progress)==acquired,"Revisiting photo duplicated progress or failed to open.");
            d.CloseDialogue();
            var print=d.neighborRoot.transform.Find("Old photograph print");
            var texture=Resources.Load<Texture2D>("Story/OldPhotograph");
            Require(texture!=null && texture.width==1536 && texture.height==1024,"Missing full photograph asset.");
            Require(print!=null && print.GetComponent<Renderer>().sharedMaterial.mainTexture==texture,"World/UI photographs differ.");
            Require(print.GetComponentsInChildren<Collider>().Length==0,"Photograph introduced collision.");
            player.enabled=false;player.TeleportTo(new Vector3(0,.1f,5));camera.transform.position=new Vector3(0,2.05f,-.9f);camera.transform.LookAt(print.position);camera.fieldOfView=38;
            GardenArtReview.Render(camera,Path.GetFullPath(Path.Combine(Application.dataPath,"../../../art/validation/old-photograph-v1-frame-unity.png")));
            progress=d.Progress;progress.Travel(StoryWorld.Home);d.Restore(CampaignSave.Encode(progress));
            string beforeInventory=CampaignSave.Encode(d.Progress);
            Require(d.InspectPhotograph() && d.PhotoOpen,"Carried photograph unavailable in Home.");d.FlipPhotograph();d.CloseDialogue();
            Require(CampaignSave.Encode(d.Progress)==beforeInventory,"Inventory inspection mutated progress.");
            Require(d.Restore(beforeInventory) && !d.PhotoOpen && !d.IsBlockingInput,"Save restoration retained photo modal.");
            return "STORY_PHOTO_OK: discovery gating, first acquisition, repeat visit, front/back input lock, close/reset, carried inspection across worlds, unchanged progress, matching world/UI texture and noncolliding frame; no player save writes.";
        }
        finally
        {
            d.Restore(saved);d.persistence=persistence;player.TeleportTo(position);player.enabled=enabled;
            camera.transform.SetPositionAndRotation(eye,rotation);camera.fieldOfView=fov;
        }
    }
}
