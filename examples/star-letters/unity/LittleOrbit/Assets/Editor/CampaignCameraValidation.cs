using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using StarLetters;
using UnityEditor;
using UnityEngine;

public static class CampaignCameraValidation
{
    public static string Validate()
    {
        var director=UnityEngine.Object.FindFirstObjectByType<CampaignDirector>();
        if(!EditorApplication.isPlaying || director==null || director.Progress==null)
            throw new InvalidOperationException("Run StoryAdventure in Play mode first.");
        var game=director.traveler;
        string saved=CampaignSave.Encode(director.Progress);
        bool persistence=director.persistence;director.persistence=false;
        var position=game.transform.position;
        const BindingFlags flags=BindingFlags.Instance|BindingFlags.NonPublic;
        var type=typeof(HomeAdventure);
        string[] fields={"walkYaw","walkPitch","walkDistance","overview","cameraNeedsSnap","cameraFocus","cameraBoom","wasCloseCamera"};
        var cameraState=fields.ToDictionary(n=>n,n=>type.GetField(n,flags).GetValue(game));
        void Set(string name,object value)=>type.GetField(name,flags).SetValue(game,value);
        var tick=type.GetMethod("LateUpdate",flags);
        var results=new List<string>();int pulledIn=0;
        var avatarRenderers=game.avatar.GetComponentsInChildren<Renderer>(true);
        int bodyClearances=0;
        var progress=new CampaignProgress();
        void Review(string label)
        {
            if(!director.Restore(CampaignSave.Encode(progress)))throw new Exception("Cannot restore "+label);
            Physics.SyncTransforms();tick.Invoke(game,null);
            if(!game.CloseCamera)throw new Exception("Arrival kept an old overview camera: "+label);
            if(Vector3.Dot(Vector3.ProjectOnPlane(game.viewCamera.transform.forward,Vector3.up),-game.spawn)<0)
                throw new Exception("Arrival camera faces away from the island: "+label);
            var root=progress.world==StoryWorld.Home?director.homeRoot:progress.world==StoryWorld.Neighbor?director.neighborRoot:director.gardenRoot;
            var points=new List<Vector3>{game.spawn};
            points.AddRange(root.GetComponentsInChildren<StoryInteraction>().Select(p=>p.transform.position+Vector3.up*.12f));
            if(progress.world==StoryWorld.Garden)
                points.AddRange(new[]{new Vector3(0,.16f,3.1f),new Vector3(0,.16f,1.9f),new Vector3(-4.5f,.16f,2.1f),new Vector3(-4.5f,.16f,3.1f)});
            int samples=0;
            foreach(var point in points)
            foreach(float pitch in progress.world==StoryWorld.Home?new[]{-25f,-12f,0f,8f,12f,18f,45f,60f}:new[]{-25f,-12f,0f,8f,18f,45f,60f})
            foreach(float distance in progress.world==StoryWorld.Home?new[]{3.2f,4.8f,6.8f,11f}:new[]{3.2f,6.8f,11f})
            for(int angle=0;angle<360;angle+=30)
            {
                game.TeleportTo(point);Physics.SyncTransforms();
                Set("overview",false);Set("walkYaw",(float)angle);Set("walkPitch",pitch);Set("walkDistance",distance);Set("cameraNeedsSnap",true);
                tick.Invoke(game,null);
                var camera=game.viewCamera;var focus=(Vector3)type.GetField("cameraFocus",flags).GetValue(game);
                var delta=camera.transform.position-focus;
                float avatarDistance=Vector3.Distance(camera.transform.position,point+Vector3.up*1.15f);
                if(float.IsNaN(delta.x) || camera.orthographic || camera.fieldOfView<55.99f || camera.fieldOfView>85.01f)
                    throw new Exception("Invalid perspective camera in "+label);
                if(delta.magnitude<distance-.1f)pulledIn++;
                if(avatarDistance<1.2f)
                {
                    if(avatarRenderers.Any(r=>r.shadowCastingMode!=UnityEngine.Rendering.ShadowCastingMode.ShadowsOnly))
                        throw new Exception("Traveller fills compressed camera in "+label);
                    bodyClearances++;
                }
                if(avatarDistance>1.5f && avatarRenderers.All(r=>r.shadowCastingMode==UnityEngine.Rendering.ShadowCastingMode.ShadowsOnly))
                    throw new Exception("Traveller did not reappear after camera cleared "+label);
                foreach(var hit in Physics.RaycastAll(focus,delta.normalized,delta.magnitude,~0,QueryTriggerInteraction.Ignore))
                    if(!hit.collider.transform.IsChildOf(game.transform))
                        throw new Exception($"Camera crosses {hit.collider.name} in {label} at {point}, yaw {angle}, pitch {pitch}");
                samples++;
            }
            Set("overview",true);Set("cameraNeedsSnap",true);tick.Invoke(game,null);
            if(game.viewCamera.fieldOfView!=43)throw new Exception("Overview failed in "+label);
            if(avatarRenderers.Any(r=>r.shadowCastingMode==UnityEngine.Rendering.ShadowCastingMode.ShadowsOnly))
                throw new Exception("Traveller remained hidden in overview: "+label);
            results.Add(label+": "+samples);
        }
        try
        {
            Review("Home");
            foreach(var action in new[]{StoryAction.Letter,StoryAction.Flower,StoryAction.Toolbox,StoryAction.Beacon})progress.Apply(action);
            progress.Travel(StoryWorld.Neighbor);Review("Neighbor");
            progress.Apply(StoryAction.Artisan);progress.Apply(StoryAction.Gardener);progress.Apply(StoryAction.Photo);
            for(int i=0;i<3;i++)progress.Apply(StoryAction.Vane);
            progress.Apply(StoryAction.Diverter);progress.Apply(StoryAction.Sluice);
            progress.Travel(StoryWorld.Garden);Review("Garden winter / closed gate");
            foreach(var action in new[]{StoryAction.Cabinet,StoryAction.EmptyChairs,StoryAction.Giant,StoryAction.Giant,StoryAction.GardenMail})progress.Apply(action);
            progress.Travel(StoryWorld.Neighbor);progress.Apply(StoryAction.Artisan);progress.Apply(StoryAction.Gardener);
            progress.Travel(StoryWorld.Garden);
            foreach(var action in new[]{StoryAction.PlantSeeds,StoryAction.HangChime,StoryAction.GardenGate,StoryAction.TeaTable})progress.Apply(action);
            if(!progress.reunion)throw new Exception("Spring fixture did not reach reunion");
            Review("Garden spring / open gate");
            return "CAMPAIGN_CAMERA_OK: "+string.Join("; ",results)+"; obstacle pull-ins "+pulledIn+"; compressed views with body clearance "+bodyClearances+"; arrival, overview, avatar restoration and collider checks passed; no save writes.";
        }
        finally
        {
            director.Restore(saved);director.persistence=persistence;game.TeleportTo(position);
            foreach(var item in cameraState)Set(item.Key,item.Value);
            Set("cameraNeedsSnap",true);tick.Invoke(game,null);
        }
    }
}
