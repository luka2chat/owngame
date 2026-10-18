using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using StarLetters;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;

public static class CloudSeaSetup
{
    const string Folder="Assets/Models/Story/CloudSea-v3";
    [MenuItem("Star Letters/Refine Layered Cloud Sea")]
    public static string Apply()
    {
        if(EditorApplication.isPlayingOrWillChangePlaymode || EditorSceneManager.GetActiveScene().isDirty)
            throw new InvalidOperationException("Stop play and save scene before updating clouds.");
        var d=UnityEngine.Object.FindFirstObjectByType<CampaignDirector>();
        if(d==null || d.gameObject.scene.path!=CampaignSetup.ScenePath)throw new InvalidOperationException("Open StoryAdventure.");
        var prefab=AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Models/Story/Cumulus-v3.fbx");
        if(prefab==null)throw new Exception("Run scripts/build-story-cloud.py first.");
        var source=prefab.GetComponentInChildren<MeshFilter>();
        var puff=new Mesh();puff.CombineMeshes(new[]{new CombineInstance{mesh=source.sharedMesh,transform=source.transform.localToWorldMatrix}});
        Directory.CreateDirectory(Folder);AssetDatabase.Refresh();
        var old=GameObject.Find("Cloud sea");if(old!=null)old.SetActive(false);
        var previous=d.gameObject.scene.GetRootGameObjects().FirstOrDefault(g=>g.name=="Layered cloud sea v3");
        if(previous!=null)UnityEngine.Object.DestroyImmediate(previous);
        var distant=d.homeRoot.transform.Find("Home distant clouds");if(distant!=null)distant.gameObject.SetActive(false);
        var root=new GameObject("Layered cloud sea v3").transform;
        var shader=Shader.Find("StarLetters/CloudAtmosphere");if(shader==null || !shader.isSupported)throw new Exception("Cloud shader unavailable");
        var colors=new[]{new Color(1f,.85f,.74f),new Color(.94f,.77f,.81f),new Color(.83f,.77f,.90f)};
        var materials=new Material[3];
        for(int i=0;i<3;i++)
        {
            string path="Assets/Materials/Story/V3_Cloud"+i+".mat";var mat=AssetDatabase.LoadAssetAtPath<Material>(path);
            if(mat==null){mat=new Material(shader);AssetDatabase.CreateAsset(mat,path);}mat.shader=shader;
            mat.SetColor("_BaseColor",colors[i]);
            mat.SetColor("_ShadowColor",new Color(.45f,.43f,.59f));
            mat.SetColor("_HazeColor",new Color(.79f,.64f,.68f));
            EditorUtility.SetDirty(mat);materials[i]=mat;
        }
        var batches=new List<CombineInstance>[12];for(int i=0;i<12;i++)batches[i]=new List<CombineInstance>();
        var rng=new System.Random(6121943);float R(float a,float b)=>Mathf.Lerp(a,b,(float)rng.NextDouble());
        int count=0;
        for(int layer=0;layer<3;layer++)
        {
            int number=layer==0?24:layer==1?36:48;
            for(int i=0;i<number;i++)
            {
                float a=(i+layer*.43f)*Mathf.PI*2/number+R(-.065f,.065f);
                float radius=layer==0?R(12.5f,20f):layer==1?R(20f,35f):R(35f,52f);
                var position=new Vector3(Mathf.Cos(a)*radius,(layer==2?-3.8f:-6.1f)+R(-1.5f,1.1f),Mathf.Sin(a)*radius);
                float size=layer==0?2.6f:layer==1?3.7f:5f;
                var scale=new Vector3(size*R(.85f,1.12f),size*R(.43f,.60f),size*R(.8f,1.12f));
                var matrix=Matrix4x4.TRS(position,Quaternion.Euler(R(-3,3),R(0,360),R(-3,3)),scale);
                int sector=(position.x>0?1:0)+(position.z>0?2:0);float tint=R(0,1);int color=tint<.5f?0:tint<.8f?1:2;
                batches[sector*3+color].Add(new CombineInstance{mesh=puff,transform=matrix});count++;
            }
        }
        int triangles=0;
        for(int i=0;i<12;i++)
        {
            var mesh=new Mesh{name="Cloud sector "+i,indexFormat=IndexFormat.UInt32};mesh.CombineMeshes(batches[i].ToArray());
            string path=Folder+"/Cloud-sector-"+i+".asset";var existing=AssetDatabase.LoadAssetAtPath<Mesh>(path);
            if(existing==null)AssetDatabase.CreateAsset(mesh,path);
            else
            {
                existing.Clear();existing.indexFormat=mesh.indexFormat;existing.vertices=mesh.vertices;existing.normals=mesh.normals;
                existing.triangles=mesh.triangles;existing.bounds=mesh.bounds;existing.UploadMeshData(false);
                UnityEngine.Object.DestroyImmediate(mesh);mesh=existing;EditorUtility.SetDirty(mesh);
            }
            triangles+=mesh.triangles.Length/3;
            var obj=new GameObject(mesh.name);obj.transform.SetParent(root,false);obj.AddComponent<MeshFilter>().sharedMesh=mesh;
            var renderer=obj.AddComponent<MeshRenderer>();renderer.sharedMaterial=materials[i%3];renderer.shadowCastingMode=ShadowCastingMode.Off;renderer.receiveShadows=false;
        }
        Shader.SetGlobalFloat("_StoryWarmth",1);
        UnityEngine.Object.DestroyImmediate(puff);
        EditorSceneManager.MarkSceneDirty(d.gameObject.scene);EditorSceneManager.SaveScene(d.gameObject.scene);AssetDatabase.SaveAssets();
        return $"CLOUD_SEA_OK: {count} fused cloud clusters, 3 depth layers, {triangles} triangles, 12 spatial/material batches; no colliders.";
    }
}
