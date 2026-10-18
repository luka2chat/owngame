using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using StarLetters;
using UnityEditor;
using UnityEngine;

public static class HomeCameraValidation
{
    // Uses the actual scene colliders, including both sides of the cottage.
    // Saves no progress and restores the live player's position and camera state.
    public static string Validate()
    {
        var game=UnityEngine.Object.FindFirstObjectByType<HomeAdventure>();
        if(!EditorApplication.isPlaying || game==null || game.campaign.Progress.world!=StoryWorld.Home)
            throw new InvalidOperationException("Run this check in the Home chapter.");
        const BindingFlags flags=BindingFlags.NonPublic|BindingFlags.Instance;
        var type=typeof(HomeAdventure);
        string[] names={"walkYaw","walkPitch","walkDistance","overview","cameraNeedsSnap","cameraFocus","cameraBoom","wasCloseCamera"};
        var state=names.ToDictionary(n=>n,n=>type.GetField(n,flags).GetValue(game));
        void Set(string n,object value)=>type.GetField(n,flags).SetValue(game,value);
        var tick=type.GetMethod("LateUpdate",flags);
        var originalPosition=game.transform.position;
        var points=new List<Vector3>{game.spawn};
        points.AddRange(game.campaign.homeRoot.GetComponentsInChildren<StoryInteraction>().Select(p=>p.transform.position+Vector3.up*.12f));
        var cottage=GameObject.Find("Cottage collision").GetComponent<Collider>().bounds;
        points.Add(new Vector3(cottage.min.x-.42f,.16f,cottage.center.z));
        points.Add(new Vector3(cottage.max.x+.42f,.16f,cottage.center.z));
        points.Add(new Vector3(cottage.center.x,.16f,cottage.min.z-.42f));
        points.Add(new Vector3(cottage.center.x,.16f,cottage.max.z+.42f));
        int samples=0,pulledIn=0;
        try
        {
            foreach(var point in points)
            foreach(float pitch in new[]{-25f,-12f,0f,8f,18f,45f,60f})
            foreach(float distance in new[]{3.2f,6.8f,11f})
            for(int angle=0;angle<360;angle+=30)
            {
                game.TeleportTo(point);Physics.SyncTransforms();
                Set("overview",false);Set("walkYaw",(float)angle);Set("walkPitch",pitch);Set("walkDistance",distance);Set("cameraNeedsSnap",true);
                tick.Invoke(game,null);
                var camera=game.viewCamera;
                Vector3 focus=(Vector3)type.GetField("cameraFocus",flags).GetValue(game);
                Vector3 delta=camera.transform.position-focus;
                if(float.IsNaN(delta.x) || camera.orthographic || camera.fieldOfView<55.99f || camera.fieldOfView>85.01f)
                    throw new Exception("Invalid perspective camera pose");
                if(delta.magnitude<distance-.1f)pulledIn++;
                foreach(var hit in Physics.RaycastAll(focus,delta.normalized,delta.magnitude,~0,QueryTriggerInteraction.Ignore))
                    if(!hit.collider.transform.IsChildOf(game.transform))
                        throw new Exception("Camera crossed "+hit.collider.name+" at "+point+" yaw "+angle+" pitch "+pitch);
                samples++;
            }
            Set("overview",true);Set("cameraNeedsSnap",true);tick.Invoke(game,null);
            if(game.viewCamera.fieldOfView!=43)throw new Exception("Overview camera did not restore");
            return "HOME_CAMERA_OK: "+samples+" actual collider poses; "+pulledIn+" obstacle pull-ins; perspective and overview passed; no save writes.";
        }
        finally
        {
            game.TeleportTo(originalPosition);
            foreach(var item in state)Set(item.Key,item.Value);
            Set("cameraNeedsSnap",true);tick.Invoke(game,null);
        }
    }
}
