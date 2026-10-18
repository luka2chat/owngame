Shader "StarLetters/WeatheredRock"
{
    Properties
    {
        _BaseMap("Original stone grain",2D)="white"{}
        _BaseColor("Stone tint",Color)=(.5,.46,.38,1)
        _SnowAmount("Seasonal snow",Range(0,1))=0
        [HideInInspector] _Cull("Cull",Float)=2
        [HideInInspector] _Cutoff("Cutoff",Range(0,1))=.5
    }
    SubShader
    {
        Tags {"RenderType"="Opaque" "RenderPipeline"="UniversalPipeline"}
        Pass
        {
            Tags {"LightMode"="UniversalForward"}
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE _MAIN_LIGHT_SHADOWS_SCREEN
            #pragma multi_compile_fragment _ _SHADOWS_SOFT
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            TEXTURE2D(_BaseMap);SAMPLER(sampler_BaseMap);
            CBUFFER_START(UnityPerMaterial)
                float4 _BaseMap_ST;half4 _BaseColor;half _SnowAmount;
            CBUFFER_END
            struct A {float4 positionOS:POSITION;float3 normalOS:NORMAL;};
            struct V {float4 positionCS:SV_POSITION;float3 positionWS:TEXCOORD0;half3 normalWS:TEXCOORD1;};
            V vert(A a){V o;o.positionWS=TransformObjectToWorld(a.positionOS.xyz);o.positionCS=TransformWorldToHClip(o.positionWS);o.normalWS=TransformObjectToWorldNormal(a.normalOS);return o;}
            float noise(float3 p)
            {
                float3 c=floor(p),f=frac(p);f=f*f*(3-2*f);
                float n=dot(c,float3(1,57,113));
                float4 a=frac(sin(n+float4(0,1,57,58))*43758.5453);
                float4 b=frac(sin(n+float4(113,114,170,171))*43758.5453);
                return lerp(lerp(lerp(a.x,a.y,f.x),lerp(a.z,a.w,f.x),f.y),lerp(lerp(b.x,b.y,f.x),lerp(b.z,b.w,f.x),f.y),f.z);
            }
            half4 frag(V i):SV_Target
            {
                float3 p=i.positionWS;half3 n=normalize(i.normalWS);
                half mottling=noise(p*2.2)*.65+noise(p*7.5)*.35;
                half fine=noise(p*38);
                half strata=sin(p.y*16+noise(p*.8)*5)*.035;
                half3 tint=lerp(half3(.84,.85,.86),half3(1.10,1.05,.95),mottling);
                half3 albedo=_BaseColor.rgb*tint*(.91+fine*.12+strata);
                half snow=smoothstep(.36,.78,n.y)*smoothstep(.12,.32,noise(p*1.3))*_SnowAmount;
                albedo=lerp(albedo,half3(.65,.72,.80)*(.94+fine*.06),snow);
                InputData input=(InputData)0;input.positionWS=p;input.positionCS=i.positionCS;input.normalWS=n;
                input.viewDirectionWS=GetWorldSpaceNormalizeViewDir(p);input.shadowCoord=TransformWorldToShadowCoord(p);
                input.bakedGI=SampleSH(n);input.shadowMask=half4(1,1,1,1);input.normalizedScreenSpaceUV=GetNormalizedScreenSpaceUV(i.positionCS);
                SurfaceData surface=(SurfaceData)0;surface.albedo=albedo;surface.normalTS=half3(0,0,1);surface.smoothness=.04;surface.occlusion=1;surface.alpha=1;
                return UniversalFragmentPBR(input,surface);
            }
            ENDHLSL
        }
        UsePass "Universal Render Pipeline/Lit/ShadowCaster"
        UsePass "Universal Render Pipeline/Lit/DepthOnly"
        // SSAO requests a depth-normal prepass. Its depth must include the same
        // geometry as the color pass, otherwise transparent clouds cover terrain.
        Pass
        {
            Name "DepthNormals"
            Tags {"LightMode"="DepthNormals"}
            ZWrite On Cull Back
            HLSLPROGRAM
            #pragma vertex normalVert
            #pragma fragment normalFrag
            #pragma multi_compile_fragment _ _GBUFFER_NORMALS_OCT
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            struct NormalAttributes {float4 positionOS:POSITION;float3 normalOS:NORMAL;half4 color:COLOR;};
            struct NormalVaryings {float4 positionCS:SV_POSITION;half3 normalWS:TEXCOORD0;};
            NormalVaryings normalVert(NormalAttributes v)
            {
                NormalVaryings o;o.positionCS=TransformWorldToHClip(TransformObjectToWorld(v.positionOS.xyz));
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
