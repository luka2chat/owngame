using System;
using System.Linq;
using StarLetters;
using UnityEditor;
using UnityEngine;

public static class StoryLetterReview
{
    static void Require(bool condition,string message){if(!condition)throw new Exception(message);}
    public static string Validate()
    {
        var d=UnityEngine.Object.FindFirstObjectByType<CampaignDirector>();
        Require(EditorApplication.isPlaying && d!=null && d.Progress!=null,"Run StoryAdventure first.");
        string original=CampaignSave.Encode(d.Progress);bool persistence=d.persistence;
        var position=d.traveler.transform.position;d.persistence=false;
        try
        {
            d.Restore(CampaignSave.Encode(new CampaignProgress()));
            Require(!d.InspectLetter() && !d.InspectLetter(true) && !d.IsBlockingInput,"Letters available before discovery.");
            var point=d.homeRoot.GetComponentsInChildren<StoryInteraction>().Single(p=>p.action==StoryAction.Letter);
            d.traveler.TeleportTo(point.transform.position);Physics.SyncTransforms();
            Require(d.Interact(point) && d.Progress.homeStep==1 && d.LetterOpen && !d.LetterIsReply,"First mailbox did not show letter.");
            string acquired=CampaignSave.Encode(d.Progress);
            Require(d.IsBlockingInput && !d.Interact(point) && !d.InspectLetter(),"Letter failed to lock interaction.");
            d.FlipLetters();Require(!d.LetterIsReply && CampaignSave.Encode(d.Progress)==acquired,"Early reply leak or progress mutation.");
            d.CloseDialogue();Require(!d.LetterOpen && !d.IsBlockingInput,"Closing letter retained input lock.");
            Require(!d.InspectLetter(true),"Reply appeared before ending.");
            Require(d.InspectLetter() && CampaignSave.Encode(d.Progress)==acquired,"Rereading advanced story.");
            d.CloseDialogue();

            var p=d.Progress;
            foreach(var a in new[]{StoryAction.Flower,StoryAction.Toolbox,StoryAction.Beacon})p.Apply(a);
            p.Travel(StoryWorld.Neighbor);
            foreach(var a in new[]{StoryAction.Artisan,StoryAction.Vane,StoryAction.Vane,StoryAction.Vane,StoryAction.Gardener,StoryAction.Diverter,StoryAction.Sluice,StoryAction.Photo})p.Apply(a);
            p.Travel(StoryWorld.Garden);
            foreach(var a in new[]{StoryAction.Giant,StoryAction.Cabinet,StoryAction.EmptyChairs,StoryAction.Giant,StoryAction.GardenMail})p.Apply(a);
            p.Travel(StoryWorld.Neighbor);p.Apply(StoryAction.Artisan);p.Apply(StoryAction.Gardener);p.Travel(StoryWorld.Garden);
            foreach(var a in new[]{StoryAction.GardenGate,StoryAction.PlantSeeds,StoryAction.HangChime,StoryAction.TeaTable})p.Apply(a);
            Require(p.reunion && !p.endingRead,"Invalid ending fixture.");
            d.Restore(CampaignSave.Encode(p));Require(!d.InspectLetter(true),"Reunion prematurely unlocked reply.");
            point=d.gardenRoot.GetComponentsInChildren<StoryInteraction>().Single(x=>x.action==StoryAction.GardenMail);
            d.traveler.TeleportTo(point.transform.position);Physics.SyncTransforms();
            Require(d.Interact(point) && d.Progress.Complete && d.LetterOpen && d.LetterIsReply,"Ending mailbox did not show reply.");
            string finished=CampaignSave.Encode(d.Progress);
            d.FlipLetters();Require(!d.LetterIsReply && d.LetterOpen && d.IsBlockingInput,"Cannot compare opening after ending.");
            d.FlipLetters();Require(d.LetterIsReply && CampaignSave.Encode(d.Progress)==finished,"Letter comparison mutated progress.");
            d.CloseDialogue();Require(!d.Interact(point) && d.LetterOpen && d.LetterIsReply,"Ending revisit failed.");
            d.CloseDialogue();p=d.Progress;p.Travel(StoryWorld.Home);d.Restore(CampaignSave.Encode(p));
            Require(d.InspectLetter(true),"Reply lost when returning Home.");d.CloseDialogue();
            Require(d.InspectPhotograph() && d.PhotoOpen && !d.LetterOpen,"Letters broke photo viewer.");d.CloseDialogue();
            Require(d.Restore(acquired) && !d.LetterOpen && !d.InspectLetter(true),"Save restore leaked later letter.");
            return "STORY_LETTERS_OK: first acquisition, pre-acquisition and ending gates, input lock, reread/flip without progression, final mailbox, post-ending revisit, Home keepsakes, photo coexistence and earlier-save restoration; user save untouched.";
        }
        finally{d.Restore(original);d.persistence=persistence;d.traveler.TeleportTo(position);}
    }
}
