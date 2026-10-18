Shader "StarLetters/CourtyardStone"
{
    Properties
    {
        _BaseColor("Warm stone",Color)=(.62,.57,.46,1)
        _MossColor("Damp moss",Color)=(.24,.30,.115,1)
        _MossAmount("Moss coverage",Range(0,1))=.6
        _Relief("Surface relief in metres",Range(0,.02))=.003
        _SnowAmount("Seasonal snow",Range(0,1))=0
        _PondCenterRadius("Damp pond vicinity",Vector)=(-3.65,0,.15,2.1)
        [HideInInspector] _Cull("Cull",Float)=2
        [HideInInspector] _Cutoff("Cutoff",Range(0,1))=.5
    }
    SubShader
    {
        Tags {"RenderType"="Opaque" "RenderPipeline"="UniversalPipeline"}
        Pass
        {
            Name "Forward"
            Tags {"LightMode"="UniversalForward"}
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE _MAIN_LIGHT_SHADOWS_SCREEN
            #pragma multi_compile_fragment _ _SHADOWS_SOFT
            #pragma multi_compile_fog
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            CBUFFER_START(UnityPerMaterial)
                half4 _BaseColor,_MossColor;float4 _PondCenterRadius;
                float _Relief;half _MossAmount,_SnowAmount;
            CBUFFER_END
            struct A {float4 positionOS:POSITION;float3 normalOS:NORMAL;};
            struct V {float4 positionCS:SV_POSITION;float3 positionWS:TEXCOORD0;half3 normalWS:TEXCOORD1;half fog:TEXCOORD2;};
            V vert(A a)
            {
                V o;o.positionWS=TransformObjectToWorld(a.positionOS.xyz);o.positionCS=TransformWorldToHClip(o.positionWS);
                o.normalWS=TransformObjectToWorldNormal(a.normalOS);o.fog=ComputeFogFactor(o.positionCS.z);return o;
            }
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
                float3 p=i.positionWS;float3 baseNormal=normalize(i.normalWS);
                float broad=noise(p*2.5),grain=noise(p*18),fine=noise(p*78);
                // Fade subpixel grain instead of letting it sparkle at a distance.
                float footprint=length(fwidth(p));float detail=1-smoothstep(.006,.025,footprint);
                fine=lerp(.5,fine,detail);
                float damp=(1-smoothstep(.12,.85,p.y))*.75;
                damp=max(damp,(1-smoothstep(_PondCenterRadius.w-.55,_PondCenterRadius.w+.35,distance(p.xz,_PondCenterRadius.xz)))*(1-smoothstep(.18,.55,p.y)));
                float moss=smoothstep(.42,.69,broad+grain*.14)*damp*_MossAmount;
                float lichen=smoothstep(.62,.80,broad)*smoothstep(.40,.64,grain)*saturate(baseNormal.y+.3)*.25;
                half3 stone=_BaseColor.rgb*lerp(.80,1.13,broad)*(.94+grain*.12+(fine-.5)*.12);
                stone=lerp(stone,half3(.66,.65,.48),lichen);
                half3 albedo=lerp(stone,_MossColor.rgb*(.80+grain*.32),moss);
                // Surface-gradient bump follows world-space stone, independent of
                // FBX UV seams, without moving vertices or collision geometry.
                float height=(grain*.7+fine*.3)*_Relief*(1-moss*.35);
                float3 dx=ddx(p),dy=ddy(p);float3 rx=cross(dy,baseNormal),ry=cross(baseNormal,dx);
                float determinant=dot(dx,rx);
                float3 gradient=sign(determinant)*(ddx(height)*rx+ddy(height)*ry);
                float3 n=normalize(max(abs(determinant),1e-10)*baseNormal-gradient);
                float snow=smoothstep(.25,.75,baseNormal.y)*smoothstep(.16,.36,broad)*_SnowAmount;
                albedo=lerp(albedo,half3(.70,.77,.84)*(.95+grain*.05),snow);
                n=normalize(lerp(n,baseNormal,snow*.8));
                InputData input=(InputData)0;input.positionWS=p;input.positionCS=i.positionCS;input.normalWS=n;
                input.viewDirectionWS=GetWorldSpaceNormalizeViewDir(p);input.shadowCoord=TransformWorldToShadowCoord(p);
                input.bakedGI=SampleSH(n);input.shadowMask=half4(1,1,1,1);input.normalizedScreenSpaceUV=GetNormalizedScreenSpaceUV(i.positionCS);
                SurfaceData surface=(SurfaceData)0;surface.albedo=albedo;surface.normalTS=half3(0,0,1);
                surface.smoothness=lerp(.10,.035,moss);surface.occlusion=1;surface.alpha=1;
                half4 color=UniversalFragmentPBR(input,surface);color.rgb=MixFog(color.rgb,i.fog);return color;
            }
            ENDHLSL
        }
        UsePass "Universal Render Pipeline/Lit/ShadowCaster"
        UsePass "Universal Render Pipeline/Lit/DepthOnly"
        UsePass "StarLetters/WeatheredRock/DepthNormals"
    }
}
