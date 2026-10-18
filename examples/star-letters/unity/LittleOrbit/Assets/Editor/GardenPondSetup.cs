using System;
using StarLetters;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;

public static class GardenPondSetup
{
    public const string MaterialPath="Assets/Materials/Story/V2_GardenPond.mat";
    [MenuItem("Star Letters/Refine Garden Pond")]
    public static string Apply()
    {
        if(EditorApplication.isPlayingOrWillChangePlaymode)throw new InvalidOperationException("Stop Play first.");
        var scene=EditorSceneManager.GetActiveScene();
        if(scene.path!=CampaignSetup.ScenePath)throw new InvalidOperationException("Open StoryAdventure first.");
        var garden=UnityEngine.Object.FindFirstObjectByType<GardenPresentation>(FindObjectsInactive.Include);
        if(garden==null || garden.pond==null)throw new InvalidOperationException("Missing garden pond.");
        var shader=Shader.Find("StarLetters/GardenPond");
        if(shader==null || ShaderUtil.ShaderHasError(shader))throw new InvalidOperationException("Pond shader must compile.");
        var material=AssetDatabase.LoadAssetAtPath<Material>(MaterialPath);
        if(material==null){material=new Material(shader);AssetDatabase.CreateAsset(material,MaterialPath);}
        material.shader=shader;material.SetColor("_BaseColor",new Color(.18f,.47f,.48f));
        material.SetColor("_ShallowColor",new Color(.39f,.61f,.51f));material.SetColor("_IceColor",new Color(.68f,.79f,.83f));
        var bounds=garden.pond.bounds;var center=bounds.center;
        material.SetVector("_PondCenterRadius",new Vector4(center.x,center.y,center.z,Mathf.Max(bounds.extents.x,bounds.extents.z)));
        material.SetFloat("_Season",0);material.SetFloat("_ReviewTime",-1);
        garden.pond.sharedMaterial=material;garden.pond.shadowCastingMode=ShadowCastingMode.Off;
        // The former flat pond let the traveler walk over the water. A low
        // cylindrical volume follows the inside of its stone rim in both seasons.
        const string collisionPath="Assets/Models/Story/GardenPondBoundary.asset";
        var collision=AssetDatabase.LoadAssetAtPath<Mesh>(collisionPath);
        if(collision==null){collision=new Mesh{name="Garden pond bank collision"};AssetDatabase.CreateAsset(collision,collisionPath);}
        const int sides=32;var vertices=new Vector3[2+sides*2];var triangles=new int[sides*12];
        vertices[0]=new Vector3(0,-.1f,0);vertices[1]=new Vector3(0,.55f,0);
        float radius=Mathf.Max(bounds.extents.x,bounds.extents.z)-.05f;
        for(int i=0;i<sides;i++)
        {
            float angle=i*Mathf.PI*2/sides;float x=Mathf.Cos(angle)*radius,z=Mathf.Sin(angle)*radius;
            vertices[2+i*2]=new Vector3(x,-.1f,z);vertices[3+i*2]=new Vector3(x,.55f,z);
            int b=2+i*2,t=b+1,bn=2+((i+1)%sides)*2,tn=bn+1,k=i*12;
            int[] faces={b,t,tn,b,tn,bn,1,tn,t,0,b,bn};for(int j=0;j<12;j++)triangles[k+j]=faces[j];
        }
        collision.Clear();collision.vertices=vertices;collision.triangles=triangles;collision.RecalculateBounds();collision.RecalculateNormals();
        var parent=garden.pond.transform.parent;var boundary=parent.Find("Pond bank boundary");
        if(boundary==null){boundary=new GameObject("Pond bank boundary").transform;boundary.SetParent(parent,false);}
        boundary.SetPositionAndRotation(center,Quaternion.identity);boundary.localScale=Vector3.one;
        var collider=boundary.GetComponent<MeshCollider>();if(collider==null)collider=boundary.gameObject.AddComponent<MeshCollider>();
        collider.sharedMesh=null;collider.sharedMesh=collision;collider.convex=false;
        EditorUtility.SetDirty(collision);
        // Talk from the dry strip beside the giant's window. The former
        // marker was at the water's edge and overlapped the traveler's clearance.
        var director=UnityEngine.Object.FindFirstObjectByType<CampaignDirector>();
        foreach(var point in director.gardenRoot.GetComponentsInChildren<StoryInteraction>(true))
            if(point.action==StoryAction.Giant)
            {
                var at=point.transform.position;at.x=center.x+1.8f;at.z=center.z-1.25f;point.transform.position=at;
                PrefabUtility.RecordPrefabInstancePropertyModifications(point.transform);
            }
        foreach(var character in director.gardenRoot.GetComponentsInChildren<StorybookCharacter>(true))
        {
            if(!character.giant)continue;
            bool first=true;var localBounds=new Bounds();
            foreach(var renderer in character.head.GetComponentsInChildren<Renderer>(true))
            {
                var b=renderer.bounds;
                for(int corner=0;corner<8;corner++)
                {
                    var p=b.center+Vector3.Scale(b.extents,new Vector3((corner&1)==0?-1:1,(corner&2)==0?-1:1,(corner&4)==0?-1:1));
                    p=character.head.InverseTransformPoint(p);
                    if(first){localBounds=new Bounds(p,Vector3.zero);first=false;}else localBounds.Encapsulate(p);
                }
            }
            if(first)throw new InvalidOperationException("Missing giant head renderers.");
            var obstruction=character.head.GetComponent<BoxCollider>();
            if(obstruction==null)obstruction=character.head.gameObject.AddComponent<BoxCollider>();
            obstruction.center=localBounds.center;obstruction.size=localBounds.size+Vector3.one*.02f;
            PrefabUtility.RecordPrefabInstancePropertyModifications(obstruction);
        }
        PrefabUtility.RecordPrefabInstancePropertyModifications(garden.pond);EditorUtility.SetDirty(material);
        EditorSceneManager.MarkSceneDirty(scene);EditorSceneManager.SaveScene(scene);AssetDatabase.SaveAssets();
        return "GARDEN_POND_OK: seasonal frost, shallow pebble bed, slow ripples and stylized sky reflection; same visible mesh, new low bank collision boundary.";
    }
}
