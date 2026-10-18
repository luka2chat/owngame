Shader "StarLetters/StreamWater"
{
    Properties { _BaseColor("Water tint",Color)=(.22,.52,.61,1) }
    SubShader
    {
        Tags { "RenderType"="Opaque" "RenderPipeline"="UniversalPipeline" }
        Pass
        {
            Tags { "LightMode"="UniversalForward" }
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE _MAIN_LIGHT_SHADOWS_SCREEN
            #pragma multi_compile_fragment _ _SHADOWS_SOFT
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            struct Attributes {float4 positionOS:POSITION;float3 normalOS:NORMAL;};
            struct Varyings {float4 positionCS:SV_POSITION;float3 positionWS:TEXCOORD0;float3 normalWS:TEXCOORD1;};
            CBUFFER_START(UnityPerMaterial)
                half4 _BaseColor;
            CBUFFER_END
            Varyings vert(Attributes v)
            {Varyings o;o.positionWS=TransformObjectToWorld(v.positionOS.xyz);o.positionCS=TransformWorldToHClip(o.positionWS);o.normalWS=TransformObjectToWorldNormal(v.normalOS);return o;}
            half4 frag(Varyings i):SV_Target
            {
                float2 p=i.positionWS.xz;float time=_Time.y;
                float wave=sin(p.y*18-time*1.6+sin(p.x*3)*.75);
                float surface=saturate(i.normalWS.y);
                half3 n=normalize(i.normalWS+float3(cos(p.x*9+p.y*12-time*1.5)*.025,0,sin(p.x*17-p.y*8+time*.9)*.02)*surface);
                half ripple=smoothstep(.93,.995,wave)*(.55+.45*sin(p.x*5+time*.7))*surface;
                InputData input=(InputData)0;
                input.positionWS=i.positionWS;input.positionCS=i.positionCS;input.normalWS=n;
                input.viewDirectionWS=GetWorldSpaceNormalizeViewDir(i.positionWS);input.shadowCoord=TransformWorldToShadowCoord(i.positionWS);
                input.bakedGI=SampleSH(n);input.shadowMask=half4(1,1,1,1);input.normalizedScreenSpaceUV=GetNormalizedScreenSpaceUV(i.positionCS);
                SurfaceData water=(SurfaceData)0;
                water.albedo=lerp(_BaseColor.rgb,half3(.57,.76,.72),ripple*.24);water.metallic=0;water.smoothness=.42;
                water.normalTS=half3(0,0,1);water.occlusion=1;water.alpha=1;
                return UniversalFragmentPBR(input,water);
            }
            ENDHLSL
        }
    }
}
