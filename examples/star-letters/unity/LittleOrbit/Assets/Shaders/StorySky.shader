Shader "StarLetters/StorySky"
{
    Properties
    {
        _Zenith("Zenith", Color) = (0.27,0.35,0.58,1)
        _Horizon("Horizon", Color) = (0.94,0.69,0.64,1)
        _Nadir("Below clouds", Color) = (0.48,0.44,0.65,1)
        _CloudStrength("Distant cloud layers", Range(0,1)) = 0
        _SunDirection("Sun direction",Vector)=(-.75,.22,.58,0)
        _Warmth("Season warmth",Range(0,1))=1
    }
    SubShader
    {
        Tags { "Queue"="Background" "RenderType"="Background" "PreviewType"="Skybox" }
        Cull Off ZWrite Off
        Pass
        {
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            struct Attributes { float4 positionOS : POSITION; };
            struct Varyings { float4 positionCS : SV_POSITION; float3 direction : TEXCOORD0; };
            CBUFFER_START(UnityPerMaterial)
                half4 _Zenith, _Horizon, _Nadir;
                half _CloudStrength, _Warmth;
                float4 _SunDirection;
            CBUFFER_END
            Varyings vert(Attributes input)
            {
                Varyings output;
                output.positionCS = TransformObjectToHClip(input.positionOS.xyz);
                output.direction = input.positionOS.xyz;
                return output;
            }
            float cloudNoise(float2 p)
            {
                float2 i=floor(p),f=frac(p); f=f*f*(3-2*f);
                float a=frac(sin(dot(i,float2(127.1,311.7)))*43758.5453);
                float b=frac(sin(dot(i+float2(1,0),float2(127.1,311.7)))*43758.5453);
                float c=frac(sin(dot(i+float2(0,1),float2(127.1,311.7)))*43758.5453);
                float e=frac(sin(dot(i+1,float2(127.1,311.7)))*43758.5453);
                return lerp(lerp(a,b,f.x),lerp(c,e,f.x),f.y);
            }
            half4 frag(Varyings input) : SV_Target
            {
                float3 d = normalize(input.direction);
                half3 color = lerp(_Horizon.rgb, _Zenith.rgb, smoothstep(-.08,.62,d.y));
                color = lerp(color, _Nadir.rgb, smoothstep(-.08,-.8,d.y));
                if (_CloudStrength > .001)
                {
                    float2 uv=d.xz/(max(d.y,.025)+.16)*2.8;
                    float clouds=cloudNoise(uv)*.58+cloudNoise(uv*2.1+8)*.28+cloudNoise(uv*4.3)*.14;
                    float band=smoothstep(.015,.12,d.y)*(1-smoothstep(.35,.72,d.y));
                    float density=smoothstep(.48,.72,clouds)*band*_CloudStrength;
                    half3 cloudColor=lerp(lerp(half3(.43,.51,.67),half3(.66,.45,.61),_Warmth),lerp(half3(.71,.78,.87),half3(1,.80,.56),_Warmth),smoothstep(.48,.75,clouds));
                    color=lerp(color,cloudColor,density);
                    // A distant bank keeps the low walking camera inside a cloud
                    // sea. Direction-based coordinates wrap around without a seam.
                    float billow=cloudNoise(d.xz*5.0)*.72+cloudNoise(d.xz*13.0)*.28;
                    float crest=.015+billow*.16;
                    float bank=(1-smoothstep(crest-.035,crest+.025,d.y))*smoothstep(-.8,-.22,d.y);
                    float rim=smoothstep(crest-.24,crest,d.y);
                    half3 bankColor=lerp(lerp(half3(.40,.48,.65),half3(.59,.40,.62),_Warmth),lerp(half3(.70,.76,.85),half3(1,.76,.61),_Warmth),rim);
                    color=lerp(color,bankColor,bank*_CloudStrength*.88);
                }
                float sun = dot(d, normalize(_SunDirection.xyz));
                color += half3(1,.54,.20) * pow(saturate(sun),12)*.35*_Warmth;
                color = lerp(color, lerp(half3(.77,.84,.94),half3(1,.91,.64),_Warmth), smoothstep(.9989,.9995,sun));
                return half4(color,1);
            }
            ENDHLSL
        }
    }
}
