using System;
using System.Linq;
using StarLetters;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering.Universal;

public static class CloudVolumeReview
{
    static void Require(bool condition,string text){if(!condition)throw new Exception(text);}
    static Texture2D Read(Camera camera)
    {
        var texture=new RenderTexture(512,288,24);var target=camera.targetTexture;var active=RenderTexture.active;
        try
        {
            camera.targetTexture=texture;camera.Render();RenderTexture.active=texture;
            var pixels=new Texture2D(512,288,TextureFormat.RGB24,false);pixels.ReadPixels(new Rect(0,0,512,288),0,0);pixels.Apply();return pixels;
        }
        finally{camera.targetTexture=target;RenderTexture.active=active;texture.Release();UnityEngine.Object.DestroyImmediate(texture);}
    }
    public static string Validate()
    {
        Require(EditorApplication.isPlaying,"Run StoryAdventure first.");
        var d=UnityEngine.Object.FindFirstObjectByType<CampaignDirector>();var root=GameObject.Find(CloudVolumeSetup.RootName);
        Require(root!=null && root.GetComponentsInChildren<Collider>().Length==0,"Missing cloud sea or unexpected cloud collisions.");
        Require(GameObject.Find("Layered cloud sea v3")==null && GameObject.Find("Cloud sea")==null,"Old clouds render together with new volumes.");
        var renderers=root.GetComponentsInChildren<Renderer>();Require(renderers.Length==72,"Unexpected volume draw budget.");
        Require(renderers.All(r=>r.sharedMaterial.shader.name=="StarLetters/CloudVolume"),"Cloud shader binding lost.");
        var textures=renderers.Select(r=>r.sharedMaterial.GetTexture("_Volume") as Texture3D).Distinct().ToArray();
        Require(textures.Length==3 && textures.All(t=>t!=null && t.width==64 && t.height==32 && t.depth==64),"Cloud density assets missing or oversized.");
        foreach(var t in textures)
        {
            var pixels=t.GetPixels();bool interior=false;
            for(int z=0;z<64;z++)for(int y=0;y<32;y++)for(int x=0;x<64;x++)
            {
                float density=pixels[x+64*(y+32*z)].r;
                if(x==0 || x==63 || y==0 || y==31 || z==0 || z==63)Require(density==0,"Density reaches volume box edge.");
                if(density>.5f)interior=true;
            }
            Require(interior,"Cloud density field is empty.");
        }
        var camera=d.traveler.viewCamera;Require(camera.GetUniversalAdditionalCameraData().requiresDepthTexture,"Depth texture disabled.");
        var position=camera.transform.position;var rotation=camera.transform.rotation;float fov=camera.fieldOfView;
        bool playerEnabled=d.traveler.enabled;d.traveler.enabled=false;
        GameObject blocker=null;Material material=null;Texture2D on=null,off=null;
        try
        {
            camera.transform.position=new Vector3(0,2,9);camera.transform.LookAt(new Vector3(0,-4,28));camera.fieldOfView=60;
            // Positive control uses exactly the same pixels as every occlusion check.
            on=Read(camera);root.SetActive(false);off=Read(camera);root.SetActive(true);
            float backgroundDifference=0;
            for(int y=24;y<264;y+=4)for(int x=24;x<488;x+=4)
            {var delta=on.GetPixel(x,y)-off.GetPixel(x,y);backgroundDifference+=Mathf.Abs(delta.r)+Mathf.Abs(delta.g)+Mathf.Abs(delta.b);}
            Require(backgroundDifference>5,"Occlusion control has no visible cloud behind its test region.");
            UnityEngine.Object.DestroyImmediate(on);UnityEngine.Object.DestroyImmediate(off);on=off=null;
            blocker=GameObject.CreatePrimitive(PrimitiveType.Cube);UnityEngine.Object.DestroyImmediate(blocker.GetComponent<Collider>());
            blocker.transform.position=camera.transform.position+camera.transform.forward*2;blocker.transform.rotation=camera.transform.rotation;
            blocker.transform.localScale=new Vector3(6,4,.05f);
            float foregroundError=0;
            foreach(var shaderName in new[]{"Universal Render Pipeline/Unlit","StarLetters/GardenGround","StarLetters/WeatheredRock","StarLetters/Meadow","StarLetters/GardenPond","StarLetters/CourtyardStone","StarLetters/GardenTreeFoliage"})
            {
                material=new Material(Shader.Find(shaderName));
                if(material.HasProperty("_BaseColor"))material.SetColor("_BaseColor",new Color(.15f,.36f,.30f));
                if(material.HasProperty("_Breeze"))material.SetFloat("_Breeze",0);
                blocker.GetComponent<Renderer>().sharedMaterial=material;
                on=Read(camera);root.SetActive(false);off=Read(camera);root.SetActive(true);
                float error=0;
                for(int y=24;y<264;y+=4)for(int x=24;x<488;x+=4)
                {var delta=on.GetPixel(x,y)-off.GetPixel(x,y);error=Mathf.Max(error,Mathf.Abs(delta.r)+Mathf.Abs(delta.g)+Mathf.Abs(delta.b));}
                Require(error<.025f,shaderName+" failed to occlude cloud: "+error);
                foregroundError=Mathf.Max(foregroundError,error);
                UnityEngine.Object.DestroyImmediate(on);UnityEngine.Object.DestroyImmediate(off);on=off=null;
                UnityEngine.Object.DestroyImmediate(material);material=null;
            }
            return $"CLOUD_VOLUME_REVIEW_OK: 72 noncolliding volumes, 3 bounded density fields; seven actual foreground shaders max RGB error {foregroundError:F5}; same-pixel cloud positive control {backgroundDifference:F3}; no save writes.";
        }
        finally
        {
            root.SetActive(true);camera.transform.SetPositionAndRotation(position,rotation);camera.fieldOfView=fov;d.traveler.enabled=playerEnabled;
            foreach(var obj in new UnityEngine.Object[]{blocker,material,on,off})if(obj!=null)UnityEngine.Object.DestroyImmediate(obj);
        }
    }
}
