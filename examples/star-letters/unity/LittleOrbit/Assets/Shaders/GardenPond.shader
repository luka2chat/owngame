Shader "StarLetters/GardenPond"
{
    Properties
    {
        _BaseColor("Deep water",Color)=(.18,.47,.48,1)
        _ShallowColor("Shallow water",Color)=(.39,.61,.51,1)
        _IceColor("Winter ice",Color)=(.68,.79,.83,1)
        _PondCenterRadius("World center and radius",Vector)=(0,0,0,1.35)
        _Season("Spring amount",Range(0,1))=0
        _ReviewTime("Fixed review time (-1 is live)",Float)=-1
    }
    SubShader
    {
        Tags {"RenderType"="Opaque" "RenderPipeline"="UniversalPipeline" "Queue"="Geometry"}
        Pass
        {
            Name "PondSurface"
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
                half4 _BaseColor,_ShallowColor,_IceColor;
                float4 _PondCenterRadius;
                float _Season,_ReviewTime;
            CBUFFER_END
            struct A {float4 positionOS:POSITION;float3 normalOS:NORMAL;};
            struct V {float4 positionCS:SV_POSITION;float3 positionWS:TEXCOORD0;half3 normalWS:TEXCOORD1;half fog:TEXCOORD2;};
            V vert(A a)
            {
                V o;o.positionWS=TransformObjectToWorld(a.positionOS.xyz);o.positionCS=TransformWorldToHClip(o.positionWS);
                o.normalWS=TransformObjectToWorldNormal(a.normalOS);o.fog=ComputeFogFactor(o.positionCS.z);return o;
            }
            float hash(float2 p){return frac(sin(dot(p,float2(127.1,311.7)))*43758.5453);}
            float noise(float2 p)
            {
                float2 c=floor(p),f=frac(p);f=f*f*(3-2*f);
                return lerp(lerp(hash(c),hash(c+float2(1,0)),f.x),lerp(hash(c+float2(0,1)),hash(c+1),f.x),f.y);
            }
            // Distances to nearby pebbles also describe the irregular ice seams.
            float3 cells(float2 p)
            {
                float2 cell=floor(p),f=frac(p);float first=8,second=8,id=0;
                [unroll]for(int y=-1;y<=1;y++)[unroll]for(int x=-1;x<=1;x++)
                {
                    float2 offset=float2(x,y),key=cell+offset;
                    float2 delta=offset+.2+.6*float2(hash(key),hash(key+43))-f;
                    float distance=dot(delta,delta);
                    if(distance<first){second=first;first=distance;id=hash(key+19);}
                    else second=min(second,distance);
                }
                return float3(sqrt(first),sqrt(second)-sqrt(first),id);
            }
            half4 frag(V i):SV_Target
            {
                float time=_ReviewTime<0?_Time.y:_ReviewTime;
                float2 p=i.positionWS.xz-_PondCenterRadius.xz;
                float radius=length(p)/max(.01,_PondCenterRadius.w);
                float2 flow=p+float2(sin(p.y*5+time*.7),cos(p.x*4-time*.6))*.012*_Season;
                float waveA=dot(p,float2(5.2,3.6))+time*.85;
                float waveB=dot(p,float2(-3.1,6.5))-time*.67;
                half3 rippleNormal=normalize(half3((cos(waveA)*.065+cos(waveB)*.038)*_Season,1,
                    (cos(waveA)*.045-cos(waveB)*.065)*_Season));
                half3 n=normalize(lerp(i.normalWS,rippleNormal,saturate(i.normalWS.y)));
                float shallow=smoothstep(.32,1,radius);
                float3 pebble=cells(flow*12);
                float pebbleShape=1-smoothstep(.16+pebble.z*.08,.28+pebble.z*.10,pebble.x);
                half3 stone=lerp(half3(.27,.32,.26),half3(.53,.49,.35),pebble.z);
                half3 bed=lerp(half3(.28,.32,.23),stone,pebbleShape);
                half3 water=lerp(_BaseColor.rgb,_ShallowColor.rgb,shallow);
                water=lerp(water,bed,shallow*.29);
                float caustic=pow(saturate(sin(waveA*2.1+sin(waveB))*sin(waveB*1.7)),7);
                water+=half3(.16,.20,.12)*caustic*shallow*.20;
                float shoreWave=.5+.5*sin(radius*64-time*1.3+sin(atan2(p.y,p.x)*5)*.7);
                float ripples=pow(shoreWave,22)*smoothstep(.66,.80,radius)*(1-smoothstep(.94,1,radius));
                water+=half3(.13,.19,.16)*ripples*.26;

                float2 drop=p-float2(-.28,.22);float dropRadius=length(drop);
                float ringPhase=frac(dropRadius*3-time*.18);
                float ring=1-smoothstep(.018,.075,abs(ringPhase-.5));
                ring*=smoothstep(.16,.30,dropRadius)*(1-smoothstep(.80,1.18,dropRadius));
                ring*=smoothstep(.22,.72,noise(drop*2.7+time*.05));
                water+=half3(.25,.32,.28)*ring*.30;

                float2 warp=float2(noise(p*4),noise(p*4+29))*.18;
                float3 fracture=cells((p+warp)*3.4);
                float frost=smoothstep(.65,1,radius)*.6+smoothstep(.42,.82,noise(p*3.5))*.28;
                float seam=(1-smoothstep(.007,.024,fracture.y))*smoothstep(.3,.68,noise(p*1.8+27));
                half3 ice=lerp(_IceColor.rgb,half3(.87,.91,.92),saturate(frost+seam*.18));
                ice*=lerp(.91,1.04,noise(p*2.7));
                float meltAt=.22+noise(p*2.3+9)*.55+shallow*.12;
                float frozen=1-smoothstep(meltAt-.12,meltAt+.12,_Season);
                half3 albedo=lerp(water,ice,frozen);
                half3 view=GetWorldSpaceNormalizeViewDir(i.positionWS);
                float fresnel=.035+.55*pow(1-saturate(dot(n,view)),4);
                float3 reflected=reflect(-view,n);
                half3 sky=lerp(half3(.72,.56,.49),half3(.38,.48,.64),saturate(reflected.y));
                sky=lerp(sky,half3(.57,.66,.77),frozen*.6);

                InputData input=(InputData)0;input.positionWS=i.positionWS;input.positionCS=i.positionCS;input.normalWS=n;
                input.viewDirectionWS=view;input.shadowCoord=TransformWorldToShadowCoord(i.positionWS);
                input.bakedGI=SampleSH(n);input.shadowMask=half4(1,1,1,1);input.normalizedScreenSpaceUV=GetNormalizedScreenSpaceUV(i.positionCS);
                SurfaceData surface=(SurfaceData)0;surface.albedo=albedo*(1-fresnel);surface.normalTS=half3(0,0,1);
                surface.smoothness=lerp(.76,.47,frozen);surface.occlusion=1;surface.alpha=1;
                surface.emission=sky*fresnel*lerp(.65,.3,frozen)+albedo*.055;
                half4 color=UniversalFragmentPBR(input,surface);color.rgb=MixFog(color.rgb,i.fog);return color;
            }
            ENDHLSL
        }
        // The surface is opaque and undisplaced: both depth prepasses use its
        // exact geometry so SSAO and the cloud sea cannot paint over the pond.
        UsePass "StarLetters/GardenGround/DepthOnly"
        UsePass "StarLetters/GardenGround/DepthNormals"
    }
}
