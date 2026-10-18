using System.Collections.Generic;
using UnityEngine;

namespace StarLetters
{
    public sealed class GardenPresentation : MonoBehaviour
    {
        public Transform leftGate,rightGate;
        public Collider gateCollider;
        public GameObject winterSnow,springFlowers,springCanopy,plantedFlowers,hangingChime,seatedGuests;
        public GameObject[] neighborFriends,neighborFriendPoints;
        public Renderer ground,pond;
        public Light sun;
        public GardenMeadow meadow;
        public Renderer[] winterRocks=System.Array.Empty<Renderer>();
        readonly List<Material> rockSeasons=new List<Material>();
        readonly Dictionary<Renderer,Material[]> originalRockMaterials=new Dictionary<Renderer,Material[]>();
        readonly List<Material> canopySeasons=new List<Material>();
        Renderer canopyRenderer;
        Material[] originalCanopyMaterials;
        public float SpringAmount {get;private set;}
        Material grass,water,snow,seasonSky;
        Material originalSky;
        Quaternion leftRest,rightRest;
        Color grassWinter,waterWinter,sunWarm,ambientSkyWarm,ambientEquatorWarm,ambientGroundWarm;
        float sunIntensityWarm;
        readonly Dictionary<string,Color> skyWarm=new Dictionary<string,Color>();
        bool initialized,inGarden;
        float target;

        void Initialize()
        {
            if(initialized)return;initialized=true;
            leftRest=leftGate.rotation;rightRest=rightGate.rotation;
            var groundMaterials=ground.sharedMaterials;grass=new Material(groundMaterials[0]);groundMaterials[0]=grass;ground.sharedMaterials=groundMaterials;
            water=pond.material;snow=winterSnow.GetComponent<Renderer>().material;
            canopyRenderer=springCanopy.GetComponent<Renderer>();originalCanopyMaterials=canopyRenderer.sharedMaterials;
            var canopyMaterials=(Material[])originalCanopyMaterials.Clone();
            for(int i=0;i<canopyMaterials.Length;i++)
            {
                if(!canopyMaterials[i].HasProperty("_Season"))continue;
                canopyMaterials[i]=new Material(canopyMaterials[i]){name=canopyMaterials[i].name+" (Garden bloom)"};
                canopySeasons.Add(canopyMaterials[i]);
            }
            canopyRenderer.sharedMaterials=canopyMaterials;
            foreach(var rock in winterRocks)
            {
                if(rock==null)continue;
                var originals=rock.sharedMaterials;originalRockMaterials.Add(rock,originals);
                var materials=(Material[])originals.Clone();
                for(int i=0;i<materials.Length;i++)
                {
                    if(!materials[i].HasProperty("_SnowAmount"))continue;
                    materials[i]=new Material(materials[i]){name=materials[i].name+" (Garden season)"};
                    rockSeasons.Add(materials[i]);
                }
                rock.sharedMaterials=materials;
            }
            grassWinter=grass.GetColor("_BaseColor");waterWinter=water.GetColor("_BaseColor");sunWarm=sun.color;
            sunIntensityWarm=sun.intensity;
            ambientSkyWarm=RenderSettings.ambientSkyColor;ambientEquatorWarm=RenderSettings.ambientEquatorColor;ambientGroundWarm=RenderSettings.ambientGroundColor;
            originalSky=RenderSettings.skybox;seasonSky=new Material(originalSky);
            foreach(string name in new[]{"_Zenith","_Horizon","_Nadir"})skyWarm[name]=originalSky.GetColor(name);
        }
        public void SetState(CampaignProgress state,bool instant)
        {
            Initialize();target=state.reunion?1:0;inGarden=state.world==StoryWorld.Garden;
            if(instant || target==0)SpringAmount=target;
            leftGate.rotation=Quaternion.AngleAxis(state.gateOpened?-92:0,Vector3.up)*leftRest;
            rightGate.rotation=Quaternion.AngleAxis(state.gateOpened?92:0,Vector3.up)*rightRest;
            gateCollider.enabled=!state.gateOpened;
            plantedFlowers.SetActive(state.seedsPlanted);hangingChime.SetActive(state.chimeHung);
            seatedGuests.SetActive(state.reunion);
            foreach(var friend in neighborFriends)friend.SetActive(!state.reunion);
            foreach(var point in neighborFriendPoints)point.SetActive(!state.reunion);
            ApplySeason();
        }
        void Update()
        {
            if(!initialized)return;
            SpringAmount=Mathf.MoveTowards(SpringAmount,target,Time.deltaTime/5);
            ApplySeason();
        }
        void ApplySeason()
        {
            float t=Mathf.SmoothStep(0,1,SpringAmount);
            if(grass.HasProperty("_Season"))grass.SetFloat("_Season",t);
            else grass.SetColor("_BaseColor",Color.Lerp(grassWinter,new Color(.39f,.51f,.23f),t));
            if(meadow!=null)meadow.Apply(t);
            foreach(var material in rockSeasons)material.SetFloat("_SnowAmount",1-t);
            foreach(var material in canopySeasons)material.SetFloat("_Season",t);
            if(water.HasProperty("_Season"))water.SetFloat("_Season",t);
            else water.SetColor("_BaseColor",Color.Lerp(waterWinter,new Color(.22f,.52f,.61f),t));
            var color=snow.GetColor("_BaseColor");color.a=1-t;snow.SetColor("_BaseColor",color);
            winterSnow.SetActive(t<.999f);
            springFlowers.SetActive(meadow==null && t>.08f);springCanopy.SetActive(t>.1f);
            // Keep the model origins fixed; reveal through color/visibility rather
            // than scaling the entire courtyard toward an arbitrary mesh origin.
            float warmth=inGarden?t:1;
            sun.color=Color.Lerp(new Color(.77f,.85f,1),sunWarm,warmth);
            sun.intensity=Mathf.Lerp(sunIntensityWarm*.67f,sunIntensityWarm,warmth);
            RenderSettings.ambientSkyColor=Color.Lerp(new Color(.48f,.55f,.70f),ambientSkyWarm,warmth);
            RenderSettings.ambientEquatorColor=Color.Lerp(new Color(.38f,.43f,.55f),ambientEquatorWarm,warmth);
            RenderSettings.ambientGroundColor=Color.Lerp(new Color(.25f,.29f,.39f),ambientGroundWarm,warmth);
            Shader.SetGlobalFloat("_StoryWarmth",warmth);
            if(seasonSky.HasProperty("_Warmth"))seasonSky.SetFloat("_Warmth",warmth);
            if(inGarden)
            {
                seasonSky.SetColor("_Zenith",Color.Lerp(new Color(.31f,.39f,.57f),skyWarm["_Zenith"],t));
                seasonSky.SetColor("_Horizon",Color.Lerp(new Color(.67f,.73f,.84f),skyWarm["_Horizon"],t));
                seasonSky.SetColor("_Nadir",Color.Lerp(new Color(.48f,.56f,.70f),skyWarm["_Nadir"],t));
                RenderSettings.skybox=seasonSky;
            }
            else RenderSettings.skybox=originalSky;
        }
        void OnDestroy()
        {
            if(!initialized)return;
            if(RenderSettings.skybox==seasonSky)RenderSettings.skybox=originalSky;
            if(sun!=null){sun.color=sunWarm;sun.intensity=sunIntensityWarm;}
            RenderSettings.ambientSkyColor=ambientSkyWarm;RenderSettings.ambientEquatorColor=ambientEquatorWarm;RenderSettings.ambientGroundColor=ambientGroundWarm;
            Shader.SetGlobalFloat("_StoryWarmth",1);
            foreach(var pair in originalRockMaterials)if(pair.Key!=null)pair.Key.sharedMaterials=pair.Value;
            foreach(var material in rockSeasons)Destroy(material);
            if(canopyRenderer!=null)canopyRenderer.sharedMaterials=originalCanopyMaterials;
            foreach(var material in canopySeasons)Destroy(material);
            Destroy(grass);Destroy(water);Destroy(snow);Destroy(seasonSky);
        }
    }
}
