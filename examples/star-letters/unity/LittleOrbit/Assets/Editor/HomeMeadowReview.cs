using System;
using System.IO;
using System.Linq;
using System.Reflection;
using StarLetters;
using UnityEditor;
using UnityEngine;

public static class HomeMeadowReview
{
    public static string Capture(string prefix="home-meadow-v3")
    {
        var d=UnityEngine.Object.FindFirstObjectByType<CampaignDirector>();
        if(!EditorApplication.isPlaying || d==null || d.Progress==null)throw new InvalidOperationException("Run StoryAdventure first.");
        var p=d.traveler;var camera=p.viewCamera;var saved=CampaignSave.Encode(d.Progress);
        bool persist=d.persistence,enabled=p.enabled;var position=p.transform.position;var avatar=p.avatar.rotation;
        var eye=camera.transform.position;var facing=camera.transform.rotation;float fov=camera.fieldOfView,aspect=camera.aspect;
        string folder=Path.GetFullPath(Path.Combine(Application.dataPath,"../../../art/validation"));
        var type=typeof(HomeAdventure);const BindingFlags flags=BindingFlags.Instance|BindingFlags.NonPublic;
        string[] names={"walkYaw","walkPitch","walkDistance","overview","cameraNeedsSnap","cameraFocus","cameraBoom","wasCloseCamera"};
        var fields=names.ToDictionary(n=>n,n=>type.GetField(n,flags).GetValue(p));
        d.persistence=false;p.enabled=false;
        try
        {
            d.Restore(CampaignSave.Encode(new CampaignProgress()));p.avatar.rotation=Quaternion.identity;
            camera.aspect=1280f/720f;p.ResetWalkingCamera(StoryWorld.Home);
            type.GetMethod("LateUpdate",flags).Invoke(p,null);
            if(Mathf.Abs((float)type.GetField("walkDistance",flags).GetValue(p)-4.8f)>.001f ||
               Mathf.Abs((float)type.GetField("walkPitch",flags).GetValue(p)-12f)>.001f)throw new Exception("Home arrival camera regression");
            GardenArtReview.Render(camera,Path.Combine(folder,prefix+"-arrival-unity.png"));
            camera.transform.position=new Vector3(1.1f,1.35f,6.3f);camera.transform.LookAt(new Vector3(1.8f,.6f,1.5f));camera.fieldOfView=55;
            GardenArtReview.Render(camera,Path.Combine(folder,prefix+"-path-unity.png"));
            camera.transform.position=new Vector3(12,13,20);camera.transform.LookAt(new Vector3(0,.25f,0));camera.fieldOfView=43;
            GardenArtReview.Render(camera,Path.Combine(folder,prefix+"-overview-unity.png"));
            if(prefix.StartsWith("home-tree"))
            {
                camera.transform.position=new Vector3(.4f,1.65f,1.1f);camera.transform.LookAt(new Vector3(-2.2f,2,-3.6f));camera.fieldOfView=54;
                GardenArtReview.Render(camera,Path.Combine(folder,prefix+"-bench-unity.png"));
                camera.transform.position=new Vector3(-4.8f,2.4f,-.8f);camera.transform.LookAt(new Vector3(-2.2f,3.3f,-3.6f));camera.fieldOfView=52;
                GardenArtReview.Render(camera,Path.Combine(folder,prefix+"-canopy-unity.png"));
                var trunk=d.homeRoot.GetComponentsInChildren<MeshRenderer>(true).Single(r=>r.name=="TreeTrunk");
                var collision=d.homeRoot.GetComponentsInChildren<BoxCollider>(true).Single(c=>c.name=="Tree collision");
                if(Vector3.Distance(trunk.bounds.center,collision.bounds.center)>.001f || Vector3.Distance(trunk.bounds.size,collision.bounds.size)>.001f)
                    throw new Exception("Tree trunk and collision disagree");
                if(!trunk.sharedMaterial.IsKeywordEnabled("_NORMALMAP"))throw new Exception("Bark normal map missing");
            }
            if(prefix=="home-terrain-v1")
            {
                camera.transform.position=new Vector3(12,2.1f,12);camera.transform.LookAt(new Vector3(3,-.65f,4));camera.fieldOfView=46;
                GardenArtReview.Render(camera,Path.Combine(folder,prefix+"-cliff-unity.png"));
                foreach(string suffix in new[]{"CliffSlate","CliffWarm","CliffPale","RockMoss","PathWarm","PathPale"})
                {
                    var renderer=d.homeRoot.GetComponentsInChildren<MeshRenderer>(true).Single(r=>r.name=="DetailBatch_V2_"+suffix);
                    string expected=suffix.StartsWith("Cliff")?"StarLetters/WeatheredRock":"Universal Render Pipeline/Lit";
                    if(renderer.sharedMaterial.shader.name!=expected)throw new Exception("Terrain material not remapped: "+suffix);
                }
                var ground=d.homeRoot.GetComponentsInChildren<MeshFilter>(true).Single(f=>f.name=="Ground_Surface");
                if(ground.sharedMesh!=ground.GetComponent<MeshCollider>().sharedMesh)throw new Exception("Ground collision differs from visible mesh");
            }
            var meadow=d.homeRoot.transform.Find("Home meadow v3");
            if(meadow==null || meadow.GetComponentsInChildren<Collider>().Length!=0)throw new Exception("Meadow should be decoration only");
            if(meadow.GetComponentsInChildren<MeshRenderer>().Any(r=>r.sharedMaterial.shader.name!="StarLetters/Meadow"))throw new Exception("Unexpected meadow shader");
            return "HOME_MEADOW_REVIEW_OK: default arrival 4.8m/12deg, walking path and overview rendered; no new colliders; no save writes.";
        }
        finally
        {
            d.Restore(saved);d.persistence=persist;p.TeleportTo(position);p.avatar.rotation=avatar;p.enabled=enabled;
            foreach(var item in fields)type.GetField(item.Key,flags).SetValue(p,item.Value);
            camera.transform.SetPositionAndRotation(eye,facing);camera.fieldOfView=fov;camera.aspect=aspect;
        }
    }
}
