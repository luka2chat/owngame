Shader "StarLetters/CloudVolume"
{
    Properties
    {
        _Volume("Density, sunlight, skylight",3D)="white"{}
        _BaseColor("Sunlit cloud",Color)=(1,.84,.71,1)
        _ShadowColor("Lavender interior",Color)=(.49,.40,.61,1)
        _HazeColor("Distant air",Color)=(.82,.65,.72,1)
        _Density("Optical density",Range(.1,2))=.65
    }
    SubShader
    {
        Tags {"RenderPipeline"="UniversalPipeline" "RenderType"="Transparent" "Queue"="Transparent-20"}
        Pass
        {
            Tags {"LightMode"="UniversalForward"}
            Blend One OneMinusSrcAlpha
            ZWrite Off ZTest Always Cull Front
            HLSLPROGRAM
            #pragma target 3.5
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/DeclareDepthTexture.hlsl"
            TEXTURE3D(_Volume);SAMPLER(sampler_Volume);
            CBUFFER_START(UnityPerMaterial)
                half4 _BaseColor,_ShadowColor,_HazeColor;
                float _Density;
            CBUFFER_END
            half _StoryWarmth;
            struct Attributes {float4 positionOS:POSITION;};
            struct Varyings {float4 positionCS:SV_POSITION;float3 positionWS:TEXCOORD0;};
            Varyings vert(Attributes v)
            {
                Varyings o;o.positionWS=TransformObjectToWorld(v.positionOS.xyz);o.positionCS=TransformWorldToHClip(o.positionWS);return o;
            }
            half4 frag(Varyings i):SV_Target
            {
                float3 direction=normalize(i.positionWS-_WorldSpaceCameraPos);
                float3 originOS=TransformWorldToObject(_WorldSpaceCameraPos);
                float3 directionOS=mul((float3x3)unity_WorldToObject,direction);
                float3 inverse=rcp(directionOS+float3(1e-7,1e-7,1e-7));
                float3 a=(-.5-originOS)*inverse,b=(.5-originOS)*inverse;
                float3 lo=min(a,b),hi=max(a,b);
                float start=max(0,max(lo.x,max(lo.y,lo.z)));
                float end=min(hi.x,min(hi.y,hi.z));
                float rawDepth=SampleSceneDepth(i.positionCS.xy/_ScaledScreenParams.xy);
                float eyeDepth=LinearEyeDepth(rawDepth,_ZBufferParams);
                float eyeRay=max(.001,-mul((float3x3)UNITY_MATRIX_V,direction).z);
                end=min(end,eyeDepth/eyeRay);
                clip(end-start);
                // Fixed bounded work; each lookup contains precomputed light transport.
                const int steps=24;
                float stepSize=(end-start)/steps;
                float3 p=originOS+directionOS*(start+stepSize*.5)+.5;
                float3 advance=directionOS*stepSize;
                half3 shade=lerp(half3(.35,.43,.61),_ShadowColor.rgb,_StoryWarmth);
                half3 lit=lerp(_BaseColor.rgb*half3(.71,.83,1),_BaseColor.rgb,_StoryWarmth);
                Light sun=GetMainLight();
                half glow=pow(saturate(dot(direction,sun.direction)),8)*.25*_StoryWarmth;
                half3 haze=lerp(half3(.51,.59,.72),_HazeColor.rgb,_StoryWarmth);
                half air=smoothstep(24,110,start)*.35;
                half transmission=1;half3 color=0;
                [loop] for(int j=0;j<steps;j++)
                {
                    half3 volume=SAMPLE_TEXTURE3D_LOD(_Volume,sampler_Volume,p,0).rgb;
                    half alpha=1-exp(-volume.r*stepSize*_Density);
                    half illumination=saturate(volume.g*.80+volume.b*.20);
                    half3 scattering=lerp(shade,lit,illumination);
                    scattering+=half3(1,.62,.28)*glow*volume.g;
                    scattering=lerp(scattering,haze,air);
                    color+=transmission*alpha*scattering;
                    transmission*=1-alpha;
                    p+=advance;
                    if(transmission<.015)break;
                }
                return half4(color,1-transmission);
            }
            ENDHLSL
        }
    }
}
