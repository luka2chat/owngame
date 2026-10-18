using System;
using System.IO;
using System.Linq;
using StarLetters;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

// Small baked density fields retain volume from every walking/overview angle.
// RGB stores density, sun transmission and sky transmission, so runtime takes
// only one filtered 3D lookup per ray step and needs no lighting shadow march.
public static class CloudVolumeSetup
{
    public const string RootName="Volumetric cloud sea v4";
    const string Folder="Assets/Models/Story/CloudVolume-v4";
    const int X=64,Y=32,Z=64;
    static float Noise(Vector3 p)
    {
        return (Mathf.PerlinNoise(p.x+17.1f,p.y+3.7f)+Mathf.PerlinNoise(p.y+8.3f,p.z+29.2f)+Mathf.PerlinNoise(p.z+31.4f,p.x+5.6f))/3;
    }
    static Texture3D MakeVolume(int variant)
    {
        var centers=new[]{new Vector3(-.27f,-.035f,0),new Vector3(-.11f,.08f,.06f),new Vector3(.09f,.15f,-.02f),new Vector3(.27f,-.02f,.01f),new Vector3(0,-.10f,-.20f),new Vector3(.06f,-.10f,.20f),new Vector3(-.18f,.19f,-.09f),new Vector3(.03f,.28f,.04f),new Vector3(.23f,.13f,.13f)};
        var radii=new[]{.20f,.23f,.21f,.19f,.22f,.22f,.14f,.13f,.14f};
        var rng=new System.Random(61220+variant);
        for(int j=0;j<centers.Length;j++)centers[j]+=new Vector3((float)rng.NextDouble()-.5f,(float)rng.NextDouble()-.5f,(float)rng.NextDouble()-.5f)*.07f;
        var density=new float[X*Y*Z];int Index(int x,int y,int z)=>x+X*(y+Y*z);
        for(int z=0;z<Z;z++)for(int y=0;y<Y;y++)for(int x=0;x<X;x++)
        {
            var p=new Vector3(x/(float)(X-1)-.5f,y/(float)(Y-1)-.5f,z/(float)(Z-1)-.5f);
            float field=0;
            for(int j=0;j<centers.Length;j++)
            {
                var delta=p-centers[j];delta.y*=.95f;
                float influence=Mathf.Exp(-delta.sqrMagnitude/(radii[j]*radii[j]) * 2.3f);
                field+=influence;
            }
            float coarse=Mathf.InverseLerp(.31f,.69f,Noise(p*12+Vector3.one*variant*23.7f));
            float fine=Mathf.InverseLerp(.31f,.69f,Noise(p*31+Vector3.one*(variant*17.3f)));
            float wisps=Noise(p*63+Vector3.one*4.2f);
            float shape=field-.18f-(1-coarse)*.32f-(1-fine)*.10f-(1-wisps)*.035f;
            float edge=Mathf.Min(.5f-Mathf.Abs(p.x),Mathf.Min(.5f-Mathf.Abs(p.y),.5f-Mathf.Abs(p.z)));
            density[Index(x,y,z)]=Mathf.Clamp01(shape*8.5f)*Mathf.SmoothStep(0,1,Mathf.Clamp01(edge/.035f));
        }
        float Sample(Vector3 p)
        {
            if(p.x<0 || p.x>1 || p.y<0 || p.y>1 || p.z<0 || p.z>1)return 0;
            return density[Index(Mathf.Clamp(Mathf.RoundToInt(p.x*(X-1)),0,X-1),Mathf.Clamp(Mathf.RoundToInt(p.y*(Y-1)),0,Y-1),Mathf.Clamp(Mathf.RoundToInt(p.z*(Z-1)),0,Z-1))];
        }
        var pixels=new Color[X*Y*Z];var lightDirection=new Vector3(-.75f,.30f,.58f).normalized;
        for(int z=0;z<Z;z++)for(int y=0;y<Y;y++)for(int x=0;x<X;x++)
        {
            var p=new Vector3(x/(float)(X-1),y/(float)(Y-1),z/(float)(Z-1));float sun=0,sky=0;
            for(int step=1;step<=16;step++){sun+=Sample(p+lightDirection*(step*.035f));sky+=Sample(p+Vector3.up*(step*.035f));}
            pixels[Index(x,y,z)]=new Color(density[Index(x,y,z)],Mathf.Exp(-sun*.23f),Mathf.Exp(-sky*.16f),1);
        }
        string path=Folder+"/Cloud-density-"+variant+".asset";
        var texture=AssetDatabase.LoadAssetAtPath<Texture3D>(path);
        if(texture==null){texture=new Texture3D(X,Y,Z,TextureFormat.RGBA32,false){name="Cloud density "+variant};AssetDatabase.CreateAsset(texture,path);}
        texture.wrapMode=TextureWrapMode.Clamp;texture.filterMode=FilterMode.Trilinear;texture.SetPixels(pixels);texture.Apply(false,false);EditorUtility.SetDirty(texture);return texture;
    }
    [MenuItem("Star Letters/Refine Volumetric Cloud Sea")]
    public static string Apply()
    {
        var scene=EditorSceneManager.GetActiveScene();
        if(EditorApplication.isPlayingOrWillChangePlaymode || scene.isDirty || scene.path!=CampaignSetup.ScenePath)throw new InvalidOperationException("Open saved StoryAdventure and stop Play.");
        var d=UnityEngine.Object.FindFirstObjectByType<CampaignDirector>();
        var shader=Shader.Find("StarLetters/CloudVolume");if(shader==null || !shader.isSupported)throw new Exception("Volume shader unavailable.");
        Directory.CreateDirectory(Folder);AssetDatabase.Refresh();
        var materials=new Material[3];
        for(int i=0;i<3;i++)
        {
            string path="Assets/Materials/Story/V4_VolumeCloud"+i+".mat";var m=AssetDatabase.LoadAssetAtPath<Material>(path);
            if(m==null){m=new Material(shader);AssetDatabase.CreateAsset(m,path);}m.shader=shader;
            m.SetTexture("_Volume",MakeVolume(i));m.SetColor("_BaseColor",new Color(1,.83f,.72f));
            m.SetColor("_ShadowColor",new Color(.49f,.40f,.61f));m.SetColor("_HazeColor",new Color(.82f,.65f,.72f));m.SetFloat("_Density",.65f);
            EditorUtility.SetDirty(m);materials[i]=m;
        }
        foreach(var name in new[]{"Cloud sea","Layered cloud sea v3"})
        {var old=scene.GetRootGameObjects().FirstOrDefault(g=>g.name==name);if(old!=null)old.SetActive(false);}
        var distant=d.homeRoot.transform.Find("Home distant clouds");if(distant!=null)distant.gameObject.SetActive(false);
        var prior=scene.GetRootGameObjects().FirstOrDefault(g=>g.name==RootName);if(prior!=null)UnityEngine.Object.DestroyImmediate(prior);
        var root=new GameObject(RootName).transform;var rng=new System.Random(6121944);
        float R(float a,float b)=>Mathf.Lerp(a,b,(float)rng.NextDouble());
        int count=0;
        for(int layer=0;layer<3;layer++)
        {
            int number=layer==0?16:layer==1?24:32;
            for(int i=0;i<number;i++)
            {
                float angle=(i+.37f*layer)*Mathf.PI*2/number+R(-.065f,.065f);
                float radius=layer==0?R(16,21):layer==1?R(28,36):R(45,57);
                float size=layer==0?R(14,18):layer==1?R(19,24):R(25,31);
                var cloud=GameObject.CreatePrimitive(PrimitiveType.Cube);cloud.name="Cloud volume "+count++;cloud.transform.SetParent(root,false);
                cloud.transform.position=new Vector3(Mathf.Cos(angle)*radius,layer==0?R(-8,-6.5f):layer==1?R(-8,-6):R(-9,-6),Mathf.Sin(angle)*radius);
                cloud.transform.localScale=new Vector3(size,size*R(.72f,.85f),size*R(.84f,1.1f));
                UnityEngine.Object.DestroyImmediate(cloud.GetComponent<Collider>());
                var renderer=cloud.GetComponent<MeshRenderer>();renderer.sharedMaterial=materials[i%3];renderer.shadowCastingMode=ShadowCastingMode.Off;renderer.receiveShadows=false;
            }
        }
        d.traveler.viewCamera.GetUniversalAdditionalCameraData().requiresDepthTexture=true;
        Shader.SetGlobalFloat("_StoryWarmth",1);
        EditorSceneManager.MarkSceneDirty(scene);EditorSceneManager.SaveScene(scene);AssetDatabase.SaveAssets();
        return $"CLOUD_VOLUME_OK: {count} bounded volumes, three 64x32x64 density/light fields, 24 samples per ray; depth-tested terrain intersections; no colliders.";
    }
}
