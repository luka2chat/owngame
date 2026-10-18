Shader "StarLetters/GardenTreeFoliage"
{
    Properties
    {
        _BaseColor("Leaf or petal tint",Color)=(.4,.5,.2,1)
        _Season("Spring progression",Range(0,1))=1
        _BloomStart("Unfold starts",Range(0,1))=.08
        _BloomEnd("Unfold finishes",Range(0,1))=.65
        _Breeze("Leaf-tip breeze",Range(0,.1))=.025
    }
    SubShader
    {
        Tags {"RenderType"="Opaque" "RenderPipeline"="UniversalPipeline"}
        HLSLINCLUDE
        #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
        CBUFFER_START(UnityPerMaterial)
            half4 _BaseColor;float _Season,_BloomStart,_BloomEnd,_Breeze;
        CBUFFER_END
        struct A {float4 positionOS:POSITION;float3 normalOS:NORMAL;float4 color:COLOR;};
        float3 GrowingPosition(A v)
        {
            // Linear RGB stores a branch attachment in the fixed-origin story
            // world. Authoring/import validation checks every tree vertex.
            float3 anchor=v.color.rgb*float3(16,8,16)+float3(-8,0,-8);
            float growth=smoothstep(_BloomStart,_BloomEnd,_Season);
            float3 offset=TransformObjectToWorld(v.positionOS.xyz)-anchor;
            float gust=sin(_Time.y*1.2+anchor.x*.8+anchor.z*.5);
            float3 p=anchor+offset*growth;
            p.xz+=float2(1,.4)*gust*_Breeze*length(offset)*growth;
            return p;
        }
        ENDHLSL
        Pass
        {
            Tags {"LightMode"="UniversalForward"}
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE _MAIN_LIGHT_SHADOWS_SCREEN
            #pragma multi_compile_fragment _ _SHADOWS_SOFT
            #pragma multi_compile_fog
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            struct V {float4 positionCS:SV_POSITION;float3 positionWS:TEXCOORD0;half3 normalWS:TEXCOORD1;half fog:TEXCOORD2;};
            V vert(A v)
            {
                V o;o.positionWS=GrowingPosition(v);o.positionCS=TransformWorldToHClip(o.positionWS);
                o.normalWS=TransformObjectToWorldNormal(v.normalOS);o.fog=ComputeFogFactor(o.positionCS.z);return o;
            }
            half4 frag(V i):SV_Target
            {
                half3 normal=normalize(i.normalWS);Light sun=GetMainLight(TransformWorldToShadowCoord(i.positionWS));
                half diffuse=saturate(dot(normal,sun.direction)*.65+.35);
                half3 light=SampleSH(normal)+sun.color*diffuse*sun.shadowAttenuation*.75;
                light+=sun.color*saturate(-dot(normal,sun.direction))*.10;
                return half4(MixFog(_BaseColor.rgb*light,i.fog),1);
            }
            ENDHLSL
        }
        Pass
        {
            Name "ShadowCaster"
            Tags {"LightMode"="ShadowCaster"}
            ZWrite On ColorMask 0
            HLSLPROGRAM
            #pragma vertex shadowVert
            #pragma fragment shadowFrag
            #pragma multi_compile_vertex _ _CASTING_PUNCTUAL_LIGHT_SHADOW
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Shadows.hlsl"
            float3 _LightDirection,_LightPosition;
            float4 shadowVert(A v):SV_POSITION
            {
                float3 p=GrowingPosition(v);float3 n=TransformObjectToWorldNormal(v.normalOS);
                #if _CASTING_PUNCTUAL_LIGHT_SHADOW
                float3 light=normalize(_LightPosition-p);
                #else
                float3 light=_LightDirection;
                #endif
                return ApplyShadowClamping(TransformWorldToHClip(ApplyShadowBias(p,n,light)));
            }
            half4 shadowFrag():SV_Target{return 0;}
            ENDHLSL
        }
        Pass
        {
            Name "DepthOnly"
            Tags {"LightMode"="DepthOnly"}
            ZWrite On ColorMask R
            HLSLPROGRAM
            #pragma vertex depthVert
            #pragma fragment depthFrag
            float4 depthVert(A v):SV_POSITION{return TransformWorldToHClip(GrowingPosition(v));}
            half4 depthFrag():SV_Target{return 0;}
            ENDHLSL
        }
        Pass
        {
            Name "DepthNormals"
            Tags {"LightMode"="DepthNormals"}
            ZWrite On
            HLSLPROGRAM
            #pragma vertex normalVert
            #pragma fragment normalFrag
            #pragma multi_compile_fragment _ _GBUFFER_NORMALS_OCT
            struct N {float4 positionCS:SV_POSITION;half3 normalWS:TEXCOORD0;};
            N normalVert(A v){N o;o.positionCS=TransformWorldToHClip(GrowingPosition(v));o.normalWS=TransformObjectToWorldNormal(v.normalOS);return o;}
            half4 normalFrag(N v):SV_Target
            {
                half3 normal=normalize(v.normalWS);
                #if defined(_GBUFFER_NORMALS_OCT)
                float2 oct=PackNormalOctQuadEncode(normal)*.5+.5;return half4(PackFloat2To888(saturate(oct)),0);
                #else
                return half4(normal,0);
                #endif
            }
            ENDHLSL
        }
    }
}
