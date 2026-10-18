Shader "StarLetters/CloudAtmosphere"
{
    Properties
    {
        _BaseColor("Cloud tint",Color)=(1,.85,.8,1)
        _ShadowColor("Lavender shadow",Color)=(.48,.36,.64,1)
        _HazeColor("Horizon haze",Color)=(.84,.59,.68,1)
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" "RenderPipeline"="UniversalPipeline" "Queue"="Geometry" }
        Pass
        {
            Tags { "LightMode"="UniversalForward" }
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            struct Attributes {float4 positionOS:POSITION;float3 normalOS:NORMAL;};
            struct Varyings {float4 positionCS:SV_POSITION;float3 positionWS:TEXCOORD0;half3 normalWS:TEXCOORD1;};
            CBUFFER_START(UnityPerMaterial)
                half4 _BaseColor,_ShadowColor,_HazeColor;
            CBUFFER_END
            // Updated with the same five-second season transition as the garden.
            half _StoryWarmth;
            Varyings vert(Attributes v)
            {
                Varyings o;o.positionWS=TransformObjectToWorld(v.positionOS.xyz);
                o.positionCS=TransformWorldToHClip(o.positionWS);o.normalWS=TransformObjectToWorldNormal(v.normalOS);return o;
            }
            half4 frag(Varyings i):SV_Target
            {
                half3 n=normalize(i.normalWS);Light sun=GetMainLight();
                half diffuse=saturate(dot(n,sun.direction)*.55+.45);
                half top=saturate(n.y*.5+.5);
                half3 shade=lerp(half3(.29,.37,.55),_ShadowColor.rgb,_StoryWarmth);
                half3 lit=lerp(_BaseColor.rgb*half3(.68,.8,1),_BaseColor.rgb,_StoryWarmth);
                half3 color=lerp(shade,lit,smoothstep(.10,.94,diffuse)*.78+top*.14);
                float3 view=normalize(_WorldSpaceCameraPos-i.positionWS);
                half rim=pow(1-saturate(dot(n,view)),3)*saturate(dot(-view,sun.direction));
                color+=half3(1,.60,.24)*rim*.25*_StoryWarmth;
                float distanceToEye=length(_WorldSpaceCameraPos-i.positionWS);
                half haze=smoothstep(16,62,distanceToEye)*.66;
                half3 horizon=lerp(half3(.45,.54,.69),_HazeColor.rgb,_StoryWarmth);
                color=lerp(color,horizon,haze);
                return half4(color,1);
            }
            ENDHLSL
        }
    }
}
