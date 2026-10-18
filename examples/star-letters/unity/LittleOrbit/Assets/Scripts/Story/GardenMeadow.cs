using UnityEngine;

namespace StarLetters
{
    // Per-renderer values keep shared Home/Neighbor meadow materials untouched.
    public sealed class GardenMeadow : MonoBehaviour
    {
        public Renderer[] grasses,flowers;
        public float CurrentSeason {get;private set;}=-1;
        MaterialPropertyBlock grassProperties,flowerProperties;
        public void Apply(float season)
        {
            season=Mathf.Clamp01(season);
            if(Mathf.Abs(CurrentSeason-season)<.0001f)return;
            CurrentSeason=season;
            if(grassProperties==null){grassProperties=new MaterialPropertyBlock();flowerProperties=new MaterialPropertyBlock();}
            grassProperties.SetFloat("_Growth",Mathf.Lerp(.55f,1,season));grassProperties.SetFloat("_Dormancy",1-season);
            flowerProperties.SetFloat("_Growth",Mathf.SmoothStep(0,1,Mathf.InverseLerp(.05f,.85f,season)));
            flowerProperties.SetFloat("_Dormancy",0);
            foreach(var renderer in grasses)if(renderer!=null)renderer.SetPropertyBlock(grassProperties);
            foreach(var renderer in flowers)if(renderer!=null){renderer.enabled=season>.05f;renderer.SetPropertyBlock(flowerProperties);}
        }
    }
}
