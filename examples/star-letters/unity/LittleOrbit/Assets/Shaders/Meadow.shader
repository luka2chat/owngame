Shader "StarLetters/Meadow"
{
    Properties
    {
        _Breeze("Breeze", Range(0,.15)) = .045
        _Growth("Seasonal height",Range(0,1))=1
        _Dormancy("Dry winter stems",Range(0,1))=0
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" "RenderPipeline"="UniversalPipeline" "Queue"="Geometry" }
        HLSLINCLUDE
        #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
        CBUFFER_START(UnityPerMaterial)
            half _Breeze,_Growth,_Dormancy;
        CBUFFER_END
        float3 MeadowWorldPosition(float3 local,half weight)
        {
            local.y*=_Growth;float3 p=TransformObjectToWorld(local);
            float gust=sin(_Time.y*1.4+p.x*.7+p.z*.45)*.65+sin(_Time.y*2.3+p.z*1.2)*.35;
            p.xz+=float2(1,.45)*gust*_Breeze*weight*_Growth;return p;
        }
        ENDHLSL
        Pass
        {
            Tags { "LightMode"="UniversalForward" }
            Cull Off
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE _MAIN_LIGHT_SHADOWS_SCREEN
            #pragma multi_compile_fragment _ _SHADOWS_SOFT
            #pragma multi_compile_fog
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            struct Attributes { float4 positionOS:POSITION; float3 normalOS:NORMAL; half4 color:COLOR; };
            struct Varyings { float4 positionCS:SV_POSITION; float3 positionWS:TEXCOORD0; half3 normalWS:TEXCOORD1; half3 color:COLOR; half fog:TEXCOORD2; };
            Varyings vert(Attributes v)
            {
                Varyings o;
                float3 p=MeadowWorldPosition(v.positionOS.xyz,v.color.a);
                o.positionWS=p;o.positionCS=TransformWorldToHClip(p);
                o.normalWS=TransformObjectToWorldNormal(v.normalOS);
                half dryVariation=saturate(dot(v.color.rgb,half3(.3,.59,.11))*3);
                o.color=lerp(v.color.rgb,lerp(half3(.14,.10,.06),half3(.40,.32,.20),dryVariation),_Dormancy);
                o.fog=ComputeFogFactor(o.positionCS.z);return o;
            }
            half4 frag(Varyings i):SV_Target
            {
                half3 n=normalize(i.normalWS);
                Light sun=GetMainLight(TransformWorldToShadowCoord(i.positionWS));
                half diffuse=saturate(dot(n,sun.direction)*.65+.35);
                half3 light=SampleSH(n)+sun.color*diffuse*sun.shadowAttenuation*.72;
                // Soft transmission keeps narrow leaves readable when backlit.
                light+=sun.color*saturate(-dot(n,sun.direction))*.1;
                return half4(MixFog(i.color*light,i.fog),1);
            }
            ENDHLSL
        }
        Pass
        {
            Name "DepthOnly"
            Tags {"LightMode"="DepthOnly"}
            ZWrite On ColorMask R Cull Off
            HLSLPROGRAM
            #pragma vertex depthVert
            #pragma fragment depthFrag
            struct DepthAttributes {float4 positionOS:POSITION;half4 color:COLOR;};
            float4 depthVert(DepthAttributes v):SV_POSITION{return TransformWorldToHClip(MeadowWorldPosition(v.positionOS.xyz,v.color.a));}
            half4 depthFrag():SV_Target{return 0;}
            ENDHLSL
        }
        // SSAO requests a depth-normal prepass. Its depth must include the same
        // geometry as the color pass, otherwise transparent clouds cover terrain.
        Pass
        {
            Name "DepthNormals"
            Tags {"LightMode"="DepthNormals"}
            ZWrite On Cull Off
            HLSLPROGRAM
            #pragma vertex normalVert
            #pragma fragment normalFrag
            #pragma multi_compile_fragment _ _GBUFFER_NORMALS_OCT
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            struct NormalAttributes {float4 positionOS:POSITION;float3 normalOS:NORMAL;half4 color:COLOR;};
            struct NormalVaryings {float4 positionCS:SV_POSITION;half3 normalWS:TEXCOORD0;};
            NormalVaryings normalVert(NormalAttributes v)
            {
                NormalVaryings o;o.positionCS=TransformWorldToHClip(MeadowWorldPosition(v.positionOS.xyz,v.color.a));
                o.normalWS=TransformObjectToWorldNormal(v.normalOS);return o;
            }
            half4 normalFrag(NormalVaryings v):SV_Target
            {
                half3 normal=normalize(v.normalWS);
                #if defined(_GBUFFER_NORMALS_OCT)
                float2 oct=PackNormalOctQuadEncode(normal)*.5+.5;
                return half4(PackFloat2To888(saturate(oct)),0);
                #else
                return half4(normal,0);
                #endif
            }
            ENDHLSL
        }
    }
}
