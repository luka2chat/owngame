using System;
using System.IO;
using StarLetters;
using UnityEditor;
using UnityEngine;

public static class GardenPondReview
{
    static void Require(bool value,string message){if(!value)throw new Exception(message);}
    public static string Capture()
    {
        var d=UnityEngine.Object.FindFirstObjectByType<CampaignDirector>();
        Require(EditorApplication.isPlaying && d!=null,"Run StoryAdventure first.");
        var g=d.gardenPresentation;var player=d.traveler;var camera=player.viewCamera;
        string saved=CampaignSave.Encode(d.Progress);bool persistence=d.persistence,enabled=player.enabled;
        var position=player.transform.position;var eye=camera.transform.position;var rotation=camera.transform.rotation;float fov=camera.fieldOfView;
        Material legacy=null;var mesh=g.pond.GetComponent<MeshFilter>().sharedMesh;var bounds=g.pond.bounds;
        var originalMaterial=AssetDatabase.LoadAssetAtPath<Material>(GardenPondSetup.MaterialPath);
        Require(originalMaterial!=null && !ShaderUtil.ShaderHasError(originalMaterial.shader),"Missing or invalid pond shader.");
        Require(originalMaterial.GetFloat("_Season")==0 && originalMaterial.GetFloat("_ReviewTime")==-1,"Shared pond material changed by runtime.");
        string folder=Path.GetFullPath(Path.Combine(Application.dataPath,"../../../art/validation"));
        void Render(string name)
        {
            var center=g.pond.bounds.center;camera.transform.position=center+new Vector3(-.35f,1.65f,2.05f);
            camera.transform.LookAt(center+new Vector3(.1f,0,-.12f));camera.fieldOfView=61;
            GardenArtReview.Render(camera,Path.Combine(folder,"garden-pond-v1-"+name+"-unity.png"));
        }
        try
        {
            d.persistence=false;player.enabled=false;
            var p=new CampaignProgress();
            foreach(var a in new[]{StoryAction.Letter,StoryAction.Flower,StoryAction.Toolbox,StoryAction.Beacon})p.Apply(a);
            p.Travel(StoryWorld.Neighbor);
            foreach(var a in new[]{StoryAction.Artisan,StoryAction.Vane,StoryAction.Vane,StoryAction.Vane,StoryAction.Gardener,StoryAction.Diverter,StoryAction.Sluice,StoryAction.Photo})p.Apply(a);
            p.Travel(StoryWorld.Garden);Require(d.Restore(CampaignSave.Encode(p)),"Invalid winter state.");
            var water=g.pond.sharedMaterial;Require(water!=originalMaterial && water.GetFloat("_Season")==0,"Winter/runtime isolation failed.");
            water.SetFloat("_ReviewTime",0);Render("winter");
            water.SetFloat("_ReviewTime",2);Render("winter-still");water.SetFloat("_ReviewTime",0);
            legacy=new Material(AssetDatabase.LoadAssetAtPath<Material>("Assets/Materials/Story/V2_Ice.mat"));
            g.pond.sharedMaterial=legacy;Render("before-winter");g.pond.sharedMaterial=water;
            foreach(var a in new[]{StoryAction.Giant,StoryAction.Cabinet,StoryAction.EmptyChairs,StoryAction.Giant,StoryAction.GardenMail})p.Apply(a);
            p.Travel(StoryWorld.Neighbor);p.Apply(StoryAction.Artisan);p.Apply(StoryAction.Gardener);p.Travel(StoryWorld.Garden);
            foreach(var a in new[]{StoryAction.GardenGate,StoryAction.PlantSeeds,StoryAction.HangChime,StoryAction.TeaTable})p.Apply(a);
            Require(d.Restore(CampaignSave.Encode(p)) && water.GetFloat("_Season")==1,"Spring pond did not thaw.");
            Render("spring");legacy.SetColor("_BaseColor",new Color(.22f,.52f,.61f));g.pond.sharedMaterial=legacy;
            Render("before-spring");g.pond.sharedMaterial=water;
            water.SetFloat("_ReviewTime",2);Render("ripple");water.SetFloat("_ReviewTime",0);
            water.SetFloat("_Season",.5f);Render("half-thawed");water.SetFloat("_Season",1);
            Require(g.pond.GetComponent<MeshFilter>().sharedMesh==mesh && g.pond.bounds==bounds,"Visible pond geometry changed.");
            var boundary=g.pond.transform.parent.Find("Pond bank boundary");
            Require(boundary!=null && boundary.GetComponent<MeshCollider>()!=null && boundary.GetComponent<Renderer>()==null,"Missing invisible pond bank boundary.");
            var controller=player.GetComponent<CharacterController>();int bankChecks=0;
            // Test actual controller movement from the clear southern shore.
            // A direct walk used to end on top of the water; now it must stop at stone level.
            foreach(float angle in new[]{45f,75f,105f,135f})
            {
                var radial=new Vector3(Mathf.Cos(angle*Mathf.Deg2Rad),0,Mathf.Sin(angle*Mathf.Deg2Rad));
                var start=bounds.center+radial*1.95f;start.y=.12f;player.TeleportTo(start);Physics.SyncTransforms();
                for(int step=0;step<90;step++)controller.Move((-radial*player.walkSpeed+Vector3.down*2)/60);
                var offset=player.transform.position-bounds.center;offset.y=0;
                Require(offset.magnitude>1.48f && offset.magnitude<1.72f,"Player entered pond or failed to reach rim: "+offset.magnitude);
                Require(player.transform.position.y<.4f,"Player climbed onto the water boundary.");bankChecks++;
            }
            return "GARDEN_POND_REVIEW_OK: matching before/after winter and spring views, half-thaw and ripple frames; seasonal runtime clone preserves shared asset; same visible mesh/bounds; "+bankChecks+" controller approaches stopped at stone rim; no save writes.";
        }
        finally
        {
            // Restore the runtime pond even if a legacy comparison render fails.
            var runtime=typeof(GardenPresentation).GetField("water",System.Reflection.BindingFlags.NonPublic|System.Reflection.BindingFlags.Instance).GetValue(g) as Material;
            if(runtime!=null){g.pond.sharedMaterial=runtime;runtime.SetFloat("_ReviewTime",-1);}
            if(legacy!=null)UnityEngine.Object.DestroyImmediate(legacy);
            d.Restore(saved);d.persistence=persistence;player.TeleportTo(position);player.enabled=enabled;
            camera.transform.SetPositionAndRotation(eye,rotation);camera.fieldOfView=fov;
        }
    }
}
