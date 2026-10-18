using System;
using System.IO;
using System.Linq;
using StarLetters;
using UnityEditor;
using UnityEngine;

public static class CharacterArtReview
{
    public static string CaptureAndValidate()
    {
        var d=UnityEngine.Object.FindFirstObjectByType<CampaignDirector>();
        if(!EditorApplication.isPlaying || d==null || d.Progress==null)throw new InvalidOperationException("Run StoryAdventure first");
        var rigs=UnityEngine.Object.FindObjectsByType<StorybookCharacter>(FindObjectsInactive.Include,FindObjectsSortMode.None);
        if(rigs.Length!=6)throw new Exception("Expected hero, four friend instances and giant");
        var portrait=d.gardenRoot.GetComponentsInChildren<Transform>(true).Single(t=>t.name=="GiantPortrait");
        var giant=rigs.Single(r=>r.giant);
        if(Vector3.ProjectOnPlane(giant.head.position-portrait.position,Vector3.up).magnitude>.1f)
            throw new Exception("Giant head is outside the imported window anchor");
        foreach(var rig in rigs)
        {
            if(rig.head==null || rig.leftEye==null || rig.rightEye==null || rig.mouth==null)throw new Exception("Incomplete face rig: "+rig.name);
            if(rig.GetComponentsInChildren<Collider>(true).Length!=0)throw new Exception("Visual rig changed collision geometry");
            if(rig.seated && Mathf.Abs(Mathf.DeltaAngle(rig.leftLeg.localEulerAngles.x,-80))>.1f)throw new Exception("Seated thigh not folded");
        }
        var p=d.traveler;var camera=p.viewCamera;var saved=CampaignSave.Encode(d.Progress);bool persistence=d.persistence,enabled=p.enabled;
        var oldPosition=p.transform.position;var oldRotation=p.avatar.rotation;var eye=camera.transform.position;var facing=camera.transform.rotation;float fov=camera.fieldOfView;
        d.persistence=false;p.enabled=false;
        string folder=Path.GetFullPath(Path.Combine(Application.dataPath,"../../../art/validation"));
        try
        {
            d.Restore(CampaignSave.Encode(new CampaignProgress()));p.avatar.rotation=Quaternion.identity;
            var hero=p.avatar.GetComponentInChildren<StorybookCharacter>();
            // Reproduce both open and shut eye poses on an initialized rig.
            hero.Animate(1);float open=hero.leftEye.localScale.y;hero.Animate(.11f);
            if(hero.leftEye.localScale.y>open*.1f)throw new Exception("Blink does not close eyes");hero.Animate(1);
            camera.transform.position=p.transform.position+new Vector3(1.5f,1.5f,3.3f);camera.transform.LookAt(p.transform.position+Vector3.up*1.02f);camera.fieldOfView=40;
            GardenArtReview.Render(camera,Path.Combine(folder,"characters-v2-traveler-unity.png"));
        }
        finally
        {
            d.Restore(saved);d.persistence=persistence;p.TeleportTo(oldPosition);p.avatar.rotation=oldRotation;p.enabled=enabled;
            camera.transform.SetPositionAndRotation(eye,facing);camera.fieldOfView=fov;
        }
        GardenArtReview.Capture("characters-v2");
        return "CHARACTER_REVIEW_OK: six bound visual rigs, seated legs, no new colliders, actual blink poses; hero and winter/spring renders; no save writes.";
    }
}
