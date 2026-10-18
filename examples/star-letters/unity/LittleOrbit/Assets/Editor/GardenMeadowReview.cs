using System;
using StarLetters;
using UnityEngine;

public static class GardenMeadowReview
{
    public static void Validate(GardenPresentation presentation,float season)
    {
        var meadow=presentation.meadow;
        if(meadow==null || meadow.grasses.Length!=4 || meadow.flowers.Length!=4)throw new Exception("Missing seasonal meadow batches");
        if(meadow.GetComponentsInChildren<Collider>(true).Length!=0)throw new Exception("Meadow should not add collision");
        if(Mathf.Abs(meadow.CurrentSeason-season)>.015f)throw new Exception("Meadow season drift");
        if(Mathf.Abs(presentation.ground.sharedMaterials[0].GetFloat("_Season")-season)>.015f)throw new Exception("Ground snow season drift");
        var block=new MaterialPropertyBlock();
        foreach(var renderer in meadow.grasses)
        {
            renderer.GetPropertyBlock(block);
            if(Mathf.Abs(block.GetFloat("_Growth")-Mathf.Lerp(.55f,1,season))>.015f || Mathf.Abs(block.GetFloat("_Dormancy")-(1-season))>.015f)
                throw new Exception("Grass height or dormancy drift");
            if(Mathf.Abs(renderer.sharedMaterial.GetFloat("_Growth")-1)>.001f || renderer.sharedMaterial.GetFloat("_Dormancy")>.001f)
                throw new Exception("Season leaked into shared Home/Neighbor material");
        }
        foreach(var renderer in meadow.flowers)
        {
            renderer.GetPropertyBlock(block);
            if(renderer.enabled!=(season>.05f))throw new Exception("Flower visibility drift");
            float expected=Mathf.SmoothStep(0,1,Mathf.InverseLerp(.05f,.85f,season));
            if(Mathf.Abs(block.GetFloat("_Growth")-expected)>.015f)throw new Exception("Flower growth drift");
        }
        if(presentation.springFlowers.activeSelf)throw new Exception("Legacy meadow flowers should be hidden");
        if(presentation.winterSnow.activeSelf!=(season<.999f))throw new Exception("Snow visibility drift");
        float alpha=presentation.winterSnow.GetComponent<Renderer>().sharedMaterial.GetColor("_BaseColor").a;
        if(Mathf.Abs(alpha-(1-season))>.015f)throw new Exception("Snow melt opacity drift");
        if(presentation.springCanopy.activeSelf!=(season>.1f))throw new Exception("Spring canopy and rim foliage visibility drift");
        foreach(var material in presentation.springCanopy.GetComponent<Renderer>().sharedMaterials)
        {
            if(!material.HasProperty("_Season"))continue;
            if(Mathf.Abs(material.GetFloat("_Season")-season)>.015f)throw new Exception("Tree blossom progression drift");
            var original=UnityEditor.AssetDatabase.LoadAssetAtPath<Material>("Assets/Materials/Story/"+material.name.Replace(" (Garden bloom)","")+".mat");
            if(original==null || original==material || Mathf.Abs(original.GetFloat("_Season")-1)>.001f)
                throw new Exception("Tree growth changed shared material");
        }
        foreach(var rock in presentation.winterRocks)
        {
            foreach(var mat in rock.sharedMaterials)
            {
                if(!mat.HasProperty("_SnowAmount"))continue;
                if(Mathf.Abs(mat.GetFloat("_SnowAmount")-(1-season))>.015f)throw new Exception("Rock surface snow drift");
                var original=UnityEditor.AssetDatabase.LoadAssetAtPath<Material>("Assets/Materials/Story/"+mat.name.Replace(" (Garden season)","")+".mat");
                if(original==null || original==mat || original.GetFloat("_SnowAmount")>.001f)throw new Exception("Snow leaked into shared rock material");
            }
        }
    }
}
