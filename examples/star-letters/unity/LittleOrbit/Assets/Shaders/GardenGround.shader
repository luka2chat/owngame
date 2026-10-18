Shader "StarLetters/GardenGround"
{
    Properties
    {
        _BaseMap("Original meadow texture",2D)="white"{}
        _BaseColor("Spring ground",Color)=(.39,.51,.23,1)
        _Season("Spring amount",Range(0,1))=0
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
                float4 _BaseMap_ST;half4 _BaseColor;half _Season;
            CBUFFER_END
            struct A {float4 positionOS:POSITION;float3 normalOS:NORMAL;};
            struct V {float4 positionCS:SV_POSITION;float3 positionWS:TEXCOORD0;half3 normalWS:TEXCOORD1;};
            V vert(A a){V o;o.positionWS=TransformObjectToWorld(a.positionOS.xyz);o.positionCS=TransformWorldToHClip(o.positionWS);o.normalWS=TransformObjectToWorldNormal(a.normalOS);return o;}
            float noise(float2 p)
            {
                float2 cell=floor(p),f=frac(p);f=f*f*(3-2*f);
                float4 h=frac(sin(float4(dot(cell,float2(127.1,311.7)),dot(cell+float2(1,0),float2(127.1,311.7)),dot(cell+float2(0,1),float2(127.1,311.7)),dot(cell+1,float2(127.1,311.7))))*43758.5453);
                return lerp(lerp(h.x,h.y,f.x),lerp(h.z,h.w,f.x),f.y);
            }
            half4 frag(V i):SV_Target
            {
                float2 p=i.positionWS.xz;
                half3 meadowSample=SAMPLE_TEXTURE2D(_BaseMap,sampler_BaseMap,p*.65).rgb;
                float patches=noise(p*.63+17)*.65+noise(p*2.4)*.25+noise(p*7.2)*.10;
                float frost=smoothstep(.39+_Season*.7,.56+_Season*.7,patches);
                half grain=lerp(.78,1.14,saturate(dot(meadowSample,half3(.3,.59,.11))*2));
                half3 winterSoil=half3(.25,.235,.21)*grain;
                half3 snow=half3(.66,.70,.75)*lerp(.90,1.04,patches);
                half3 spring=meadowSample*_BaseColor.rgb*1.6;
                half3 albedo=lerp(lerp(winterSoil,spring,_Season),snow,frost*(1-_Season));
                half3 n=normalize(i.normalWS);
                InputData input=(InputData)0;input.positionWS=i.positionWS;input.positionCS=i.positionCS;input.normalWS=n;
                input.viewDirectionWS=GetWorldSpaceNormalizeViewDir(i.positionWS);input.shadowCoord=TransformWorldToShadowCoord(i.positionWS);
                input.bakedGI=SampleSH(n);input.shadowMask=half4(1,1,1,1);input.normalizedScreenSpaceUV=GetNormalizedScreenSpaceUV(i.positionCS);
                SurfaceData surface=(SurfaceData)0;surface.albedo=albedo;surface.normalTS=half3(0,0,1);surface.smoothness=.05;surface.occlusion=1;surface.alpha=1;
                return UniversalFragmentPBR(input,surface);
            }
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
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            float4 depthVert(float4 positionOS:POSITION):SV_POSITION{return TransformObjectToHClip(positionOS.xyz);}
            half4 depthFrag():SV_Target{return 0;}
            ENDHLSL
        }
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
