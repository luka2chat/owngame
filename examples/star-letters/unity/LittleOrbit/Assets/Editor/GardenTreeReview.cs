using System;
using System.Linq;
using StarLetters;
using UnityEditor;
using UnityEngine;

public static class GardenTreeReview
{
    public static string Validate()
    {
        var d=UnityEngine.Object.FindFirstObjectByType<CampaignDirector>();
        if(!EditorApplication.isPlaying || d==null)throw new Exception("Run StoryAdventure first.");
        var canopy=d.gardenPresentation.springCanopy.GetComponent<MeshRenderer>();
        var mesh=canopy.GetComponent<MeshFilter>().sharedMesh;var vertices=mesh.vertices;var colors=mesh.colors;
        if(colors.Length!=vertices.Length)throw new Exception("Missing imported growth-anchor colors.");
        int count=0,materials=0;float maximum=0;
        for(int submesh=0;submesh<canopy.sharedMaterials.Length;submesh++)
        {
            var material=canopy.sharedMaterials[submesh];
            if(material.shader.name!="StarLetters/GardenTreeFoliage")continue;
            if(ShaderUtil.ShaderHasError(material.shader))throw new Exception("Foliage shader error.");
            materials++;
            foreach(int index in mesh.GetTriangles(submesh).Distinct())
            {
                var c=colors[index];var anchor=new Vector3(c.r*16-8,c.g*8,c.b*16-8);
                float distance=Vector3.Distance(anchor,canopy.transform.TransformPoint(vertices[index]));
                if(distance>.34f || anchor.y<1.8f || anchor.y>5f)throw new Exception("Imported growth anchor mismatch: "+distance+" / "+anchor);
                maximum=Mathf.Max(maximum,distance);count++;
            }
        }
        if(materials!=5 || count<10000)throw new Exception("Missing new flower/leaf batches.");
        var trunk=d.gardenRoot.GetComponentsInChildren<Renderer>(true).Single(r=>r.name=="Solid_Tree");
        var collider=d.gardenRoot.GetComponentsInChildren<BoxCollider>(true).Single(c=>c.name=="Solid_Tree collision");
        var colliderCenter=collider.transform.TransformPoint(collider.center);
        var colliderSize=Vector3.Scale(collider.size,collider.transform.lossyScale);
        if(Vector3.Distance(colliderCenter,trunk.bounds.center)>.001f || Vector3.Distance(colliderSize,trunk.bounds.size)>.001f)
            throw new Exception("Trunk collision no longer fits tree.");
        if(trunk.sharedMaterial.GetTexture("_BumpMap")==null || !trunk.sharedMaterial.IsKeywordEnabled("_NORMALMAP"))throw new Exception("Missing bark relief.");
        return "GARDEN_TREE_REVIEW_OK: "+materials+" growing material batches; "+count+" imported vertices checked, maximum vertex-to-branch-anchor distance "+maximum.ToString("F4")+" m; bark normal map and fitted trunk collision present.";
    }
}
