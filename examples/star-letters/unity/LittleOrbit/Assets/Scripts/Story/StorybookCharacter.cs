using UnityEngine;

namespace StarLetters
{
    // Secondary animation on the visual rig only; locomotion and collisions
    // remain on the established player/NPC roots.
    public sealed class StorybookCharacter : MonoBehaviour
    {
        public Transform head,leftEye,rightEye,mouth,leftBrow,rightBrow,leftArm,rightArm;
        public Transform leftLeg,rightLeg;
        public bool traveler,seated,giant;
        public float phase;
        HomeAdventure player;
        CampaignDirector campaign;
        Quaternion headRest,leftArmRest,rightArmRest;
        Vector3 mouthRest,leftEyeRest,rightEyeRest;
        void Awake()
        {
            player=FindFirstObjectByType<HomeAdventure>();campaign=FindFirstObjectByType<CampaignDirector>();
            headRest=head.localRotation;mouthRest=mouth.localScale;
            leftEyeRest=leftEye.localScale;rightEyeRest=rightEye.localScale;
            if(leftArm!=null){leftArmRest=leftArm.localRotation;rightArmRest=rightArm.localRotation;}
        }
        void LateUpdate() => Animate(Time.time);
        public void Animate(float time)
        {
            float cycle=Mathf.Repeat(time+phase,4.8f);
            float open=cycle<.22f?1f-.94f*Mathf.Sin(cycle/.22f*Mathf.PI):1f;
            leftEye.localScale=Vector3.Scale(leftEyeRest,new Vector3(1,open,1));
            rightEye.localScale=Vector3.Scale(rightEyeRest,new Vector3(1,open,1));
            float yaw=0,pitch=Mathf.Sin(time*.7f+phase)*1.2f;
            if(!traveler && player!=null && Vector3.Distance(player.transform.position,transform.position)<5.5f)
            {
                var direction=transform.InverseTransformDirection(player.transform.position+Vector3.up*1.4f-head.position);
                yaw=Mathf.Clamp(Mathf.Atan2(direction.x,direction.z)*Mathf.Rad2Deg,giant?-12:-30,giant?12:30);
                pitch=Mathf.Clamp(-Mathf.Atan2(direction.y,new Vector2(direction.x,direction.z).magnitude)*Mathf.Rad2Deg,-8,8);
            }
            head.localRotation=Quaternion.Slerp(head.localRotation,headRest*Quaternion.Euler(pitch,yaw,Mathf.Sin(time*.6f+phase)*1.1f),1-Mathf.Exp(-4*Time.deltaTime));
            if(leftArm!=null)
            {
                float swing=traveler && leftLeg!=null?Mathf.DeltaAngle(0,leftLeg.localEulerAngles.x)*.65f:Mathf.Sin(time*1.3f+phase)*(seated?1.5f:2.2f);
                leftArm.localRotation=leftArmRest*Quaternion.Euler(-swing,0,0);
                rightArm.localRotation=rightArmRest*Quaternion.Euler(swing,0,0);
            }
            if(giant && campaign!=null && campaign.gardenPresentation!=null)
            {
                float spring=campaign.gardenPresentation.SpringAmount;
                mouth.localScale=Vector3.Scale(mouthRest,new Vector3(1,Mathf.Lerp(-.45f,1,spring),1));
                leftBrow.localRotation=Quaternion.Euler(0,0,Mathf.Lerp(-16,-3,spring));
                rightBrow.localRotation=Quaternion.Euler(0,0,Mathf.Lerp(16,3,spring));
            }
        }
    }
}
