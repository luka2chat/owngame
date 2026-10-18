using UnityEngine;

namespace StarLetters
{
    // Original synthesized cues: no audio download, paid library, or network call.
    public sealed class StorySound : MonoBehaviour
    {
        AudioSource cues,water,music;
        AudioClip chime,turn,stream,theme;
        public bool MusicEnabled {get;private set;}
        public bool EffectsEnabled {get;private set;}
        bool windy;
        float nextChime;
        public bool WaterPlaying => water!=null && water.isPlaying;

        void Awake()
        {
            cues=gameObject.AddComponent<AudioSource>();cues.playOnAwake=false;cues.volume=.35f;
            water=gameObject.AddComponent<AudioSource>();water.playOnAwake=false;water.loop=true;water.volume=.09f;
            chime=Bell("Wind chime",659.25f,2.2f);
            turn=Bell("Brass mechanism",220,.25f);
            const int sampleRate=22050;var samples=new float[sampleRate*2];var random=new System.Random(613);float filtered=0;
            for(int i=0;i<samples.Length;i++)
            {
                filtered=Mathf.Lerp(filtered,(float)random.NextDouble()*2-1,.16f);
                // A short boundary fade prevents an audible click when the loop wraps.
                float fade=Mathf.Min(1,Mathf.Min(i,samples.Length-1-i)/220f);
                samples[i]=filtered*.65f*fade;
            }
            stream=AudioClip.Create("Small stream",samples.Length,1,sampleRate,false);stream.SetData(samples,0);water.clip=stream;
            music=gameObject.AddComponent<AudioSource>();music.playOnAwake=false;music.loop=true;music.volume=.14f;
            theme=Theme();music.clip=theme;
            MusicEnabled=PlayerPrefs.GetInt("StarLetters.Music",1)!=0;EffectsEnabled=PlayerPrefs.GetInt("StarLetters.Effects",1)!=0;
            music.mute=!MusicEnabled;cues.mute=water.mute=!EffectsEnabled;music.Play();
            AudioListener.pause=!Application.isFocused;
        }

        // Original 32-second pentatonic theme; notes decay inside the loop so
        // its boundary is silent. Kept quieter than dialogue interaction cues.
        static AudioClip Theme()
        {
            const int rate=22050;var samples=new float[rate*32];
            int[] melody={64,67,69,71,67,64,62,59,64,67,74,71,69,67,64,62};
            int[] bass={48,55,57,52};
            void Note(int midi,float start,float duration,float gain)
            {
                float hz=440*Mathf.Pow(2,(midi-69)/12f);
                int offset=(int)(start*rate),length=(int)(duration*rate);
                for(int i=0;i<length && offset+i<samples.Length;i++)
                {
                    float t=i/(float)rate,fade=Mathf.Min(1,t/.025f)*Mathf.Min(1,(duration-t)/.25f)*Mathf.Exp(-t*1.8f);
                    samples[offset+i]+=gain*fade*(Mathf.Sin(2*Mathf.PI*hz*t)+.24f*Mathf.Sin(4*Mathf.PI*hz*t));
                }
            }
            for(int i=0;i<melody.Length;i++)Note(melody[i],i*2,Mathf.Min(3.5f,32-i*2),.25f);
            for(int i=0;i<8;i++){Note(bass[i%4],i*4,3.8f,.15f);Note(bass[i%4]+7,i*4+.4f,3.3f,.09f);}
            var result=AudioClip.Create("Letters among stars - original theme",samples.Length,1,rate,false);result.SetData(samples,0);return result;
        }
        public void ToggleMusic(){MusicEnabled=!MusicEnabled;music.mute=!MusicEnabled;PlayerPrefs.SetInt("StarLetters.Music",MusicEnabled?1:0);PlayerPrefs.Save();}
        public void ToggleEffects(){EffectsEnabled=!EffectsEnabled;cues.mute=water.mute=!EffectsEnabled;PlayerPrefs.SetInt("StarLetters.Effects",EffectsEnabled?1:0);PlayerPrefs.Save();}

        static AudioClip Bell(string name,float frequency,float seconds)
        {
            const int sampleRate=22050;var samples=new float[Mathf.CeilToInt(seconds*sampleRate)];
            for(int i=0;i<samples.Length;i++)
            {
                float t=i/(float)sampleRate;
                float envelope=Mathf.Min(1,t/.008f)*Mathf.Exp(-t*4/seconds)*Mathf.Min(1,(seconds-t)/.04f);
                samples[i]=envelope*(Mathf.Sin(2*Mathf.PI*frequency*t)*.55f+Mathf.Sin(2*Mathf.PI*frequency*2.76f*t)*.17f+Mathf.Sin(2*Mathf.PI*frequency*5.4f*t)*.07f);
            }
            var clip=AudioClip.Create(name,samples.Length,1,sampleRate,false);clip.SetData(samples,0);return clip;
        }
        public void Mechanism()=>cues.PlayOneShot(turn,.45f);
        public void Reward(){cues.PlayOneShot(chime,.9f);nextChime=Time.unscaledTime+7.5f;}
        public void SetAmbience(bool wind,bool runningWater)
        {
            windy=wind;
            if(runningWater && !water.isPlaying)water.Play();
            if(!runningWater && water.isPlaying)water.Stop();
        }
        void Update()
        {
            if(windy && Application.isFocused && Time.unscaledTime>=nextChime)
            {cues.PlayOneShot(chime,.3f);nextChime=Time.unscaledTime+7.5f;}
        }
        void OnApplicationFocus(bool focused){AudioListener.pause=!focused;}
        void OnDestroy()
        {
            if(chime!=null)Destroy(chime);if(turn!=null)Destroy(turn);if(stream!=null)Destroy(stream);if(theme!=null)Destroy(theme);
            AudioListener.pause=false;
        }
    }
}
