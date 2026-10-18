using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using StarLetters;
using UnityEditor;
using UnityEngine;

public static class GardenStoneReview
{
    static void Require(bool value,string message){if(!value)throw new Exception(message);}
    public static string Capture(string prefix="garden-stone-v1",bool compareOriginalMaterials=true)
    {
        var d=UnityEngine.Object.FindFirstObjectByType<CampaignDirector>();
        Require(EditorApplication.isPlaying && d!=null,"Run StoryAdventure first.");
        var g=d.gardenPresentation;var player=d.traveler;var camera=player.viewCamera;
        string saved=CampaignSave.Encode(d.Progress);bool persistence=d.persistence,enabled=player.enabled;
        var position=player.transform.position;var eye=camera.transform.position;var rotation=camera.transform.rotation;float fov=camera.fieldOfView;
        var candidates=g.winterRocks.Where(r=>r.sharedMaterials.Any(m=>m.shader.name==GardenStoneSetup.ShaderName)).ToArray();
        Require(candidates.Length>0,"No garden stone bindings.");
        var materials=candidates.ToDictionary(r=>r,r=>r.sharedMaterials);
        var geometry=candidates.ToDictionary(r=>r,r=>(r.GetComponent<MeshFilter>().sharedMesh,r.bounds));
        var oldMaterials=new Dictionary<Renderer,Material[]>();
        string folder=Path.GetFullPath(Path.Combine(Application.dataPath,"../../../art/validation"));
        void Render(string season,bool before)
        {
            foreach(var r in candidates)r.sharedMaterials=before?oldMaterials[r]:materials[r];
            foreach(bool pond in new[]{true,false})
            {
                camera.transform.position=pond?new Vector3(-2.10f,1.10f,2.30f):new Vector3(-2.65f,1.28f,4.45f);
                camera.transform.LookAt(pond?new Vector3(-3.65f,.13f,.15f):new Vector3(-3.5f,.65f,2.50f));camera.fieldOfView=57;
                GardenArtReview.Render(camera,Path.Combine(folder,prefix+"-"+season+(pond?"-pond":"-wall")+(before?"-before":"")+"-unity.png"));
            }
            foreach(var r in candidates)r.sharedMaterials=materials[r];
        }
        try
        {
            d.persistence=false;player.enabled=false;
            foreach(var pair in materials)
            {
                oldMaterials[pair.Key]=pair.Value.Select(m=>m.shader.name==GardenStoneSetup.ShaderName
                    ?AssetDatabase.LoadAssetAtPath<Material>("Assets/Materials/Story/"+m.name.Replace("Garden_","").Replace(" (Garden season)","")+".mat"):m).ToArray();
                Require(oldMaterials[pair.Key].All(m=>m!=null),"Missing original stone material.");
                foreach(var m in pair.Value.Where(m=>m.shader.name==GardenStoneSetup.ShaderName))
                {
                    Require(!ShaderUtil.ShaderHasError(m.shader),"Stone shader compile error.");
                    Require(!AssetDatabase.Contains(m),"Garden stone should use runtime seasonal clone.");
                }
            }
            // A neighboring world must still use its original shared stone assets.
            foreach(var root in new[]{d.homeRoot,d.neighborRoot})
                Require(!root.GetComponentsInChildren<Renderer>(true).Any(r=>r.sharedMaterials.Any(m=>m!=null && m.shader.name==GardenStoneSetup.ShaderName)),"Garden material leaked to another world.");
            var p=new CampaignProgress();
            foreach(var a in new[]{StoryAction.Letter,StoryAction.Flower,StoryAction.Toolbox,StoryAction.Beacon})p.Apply(a);
            p.Travel(StoryWorld.Neighbor);
            foreach(var a in new[]{StoryAction.Artisan,StoryAction.Vane,StoryAction.Vane,StoryAction.Vane,StoryAction.Gardener,StoryAction.Diverter,StoryAction.Sluice,StoryAction.Photo})p.Apply(a);
            p.Travel(StoryWorld.Garden);Require(d.Restore(CampaignSave.Encode(p)),"Invalid winter state.");
            g.pond.sharedMaterial.SetFloat("_ReviewTime",0);
            GardenMeadowReview.Validate(g,0);if(compareOriginalMaterials)Render("winter",true);Render("winter",false);
            foreach(var a in new[]{StoryAction.Giant,StoryAction.Cabinet,StoryAction.EmptyChairs,StoryAction.Giant,StoryAction.GardenMail})p.Apply(a);
            p.Travel(StoryWorld.Neighbor);p.Apply(StoryAction.Artisan);p.Apply(StoryAction.Gardener);p.Travel(StoryWorld.Garden);
            foreach(var a in new[]{StoryAction.GardenGate,StoryAction.PlantSeeds,StoryAction.HangChime,StoryAction.TeaTable})p.Apply(a);
            Require(d.Restore(CampaignSave.Encode(p)),"Invalid spring state.");GardenMeadowReview.Validate(g,1);
            if(compareOriginalMaterials)Render("spring",true);Render("spring",false);
            foreach(var pair in geometry)Require(pair.Key.GetComponent<MeshFilter>().sharedMesh==pair.Value.Item1 && pair.Key.bounds==pair.Value.Item2,"Stone mesh or bounds changed.");
            return "GARDEN_STONE_REVIEW_OK: "+candidates.Length+" stone renderers, two fixed views in both seasons"+(compareOriginalMaterials?" with original-material comparisons":"")+"; runtime snow isolation, original neighboring-world materials and visible geometry preserved; no save writes.";
        }
        finally
        {
            foreach(var pair in materials)pair.Key.sharedMaterials=pair.Value;
            g.pond.sharedMaterial.SetFloat("_ReviewTime",-1);
            d.Restore(saved);d.persistence=persistence;player.TeleportTo(position);player.enabled=enabled;
            camera.transform.SetPositionAndRotation(eye,rotation);camera.fieldOfView=fov;
        }
    }
}
