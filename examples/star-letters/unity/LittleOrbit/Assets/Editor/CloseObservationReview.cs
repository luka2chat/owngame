using System;
using System.IO;
using System.Linq;
using System.Reflection;
using StarLetters;
using UnityEditor;
using UnityEngine;

public static class CloseObservationReview
{
    public static string Capture()
    {
        if(!EditorApplication.isPlaying)throw new InvalidOperationException("Run StoryAdventure.");
        var d=UnityEngine.Object.FindFirstObjectByType<CampaignDirector>();var p=d.traveler;var camera=p.viewCamera;
        var progress=CampaignSave.Encode(d.Progress);bool persist=d.persistence,enabled=p.enabled;
        var position=p.transform.position;var eye=camera.transform.position;var facing=camera.transform.rotation;
        float aspect=camera.aspect;int quality=QualitySettings.GetQualityLevel();
        const BindingFlags flags=BindingFlags.Instance|BindingFlags.NonPublic;
        var type=typeof(HomeAdventure);var tick=type.GetMethod("LateUpdate",flags);
        string[] names={"walkYaw","walkPitch","walkDistance","overview","cameraNeedsSnap","cameraFocus","cameraBoom","wasCloseCamera"};
        var state=names.ToDictionary(n=>n,n=>type.GetField(n,flags).GetValue(p));
        void Set(string name,object value)=>type.GetField(name,flags).SetValue(p,value);
        string folder=Path.GetFullPath(Path.Combine(Application.dataPath,"../../../art/validation"));
        d.persistence=false;p.enabled=false;
        void View(string name,Vector3 point,float yaw,float pitch)
        {
            p.TeleportTo(point);Physics.SyncTransforms();Set("overview",false);Set("walkYaw",yaw);Set("walkPitch",pitch);
            Set("walkDistance",4.8f);Set("cameraNeedsSnap",true);tick.Invoke(p,null);
            if(pitch<0 && camera.transform.forward.y<=0)throw new Exception("Camera cannot look up");
            if(camera.transform.position.y<.20f)throw new Exception("Camera dipped into lawn");
            if(pitch<0 && camera.transform.position.y<point.y+.95f)throw new Exception("Looking up lowered the camera below standing eye height");
            GardenArtReview.Render(camera,Path.Combine(folder,"close-observation-v1-"+name+"-unity.png"));
        }
        try
        {
            QualitySettings.SetQualityLevel(0,true);camera.aspect=1280f/720f;
            d.Restore(CampaignSave.Encode(new CampaignProgress()));
            View("tree",new Vector3(-2,.12f,.7f),0,-20);
            View("roof",new Vector3(3,.12f,1.6f),0,-18);
            p.ResetWalkingCamera(StoryWorld.Home);Set("cameraNeedsSnap",true);tick.Invoke(p,null);
            if((float)type.GetField("walkPitch",flags).GetValue(p)!=12)throw new Exception("Reset failed after looking up");
            string cloud=CloudVolumeReview.Validate();
            HomeMeadowReview.Capture("close-observation-v1-web-quality");
            return "CLOSE_OBSERVATION_OK: tree and roof visible looking upward, camera above lawn; C resets to 12 degrees; active Web quality render and cloud occlusion checked. "+cloud;
        }
        finally
        {
            QualitySettings.SetQualityLevel(quality,true);d.Restore(progress);d.persistence=persist;p.TeleportTo(position);p.enabled=enabled;
            foreach(var item in state)Set(item.Key,item.Value);
            camera.transform.SetPositionAndRotation(eye,facing);camera.aspect=aspect;
        }
    }
}
