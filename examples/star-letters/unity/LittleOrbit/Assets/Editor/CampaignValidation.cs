using System;
using System.Collections.Generic;
using System.Linq;
using StarLetters;
using UnityEditor;
using UnityEngine;

public static class CampaignValidation
{
    static void Require(bool condition,string why){if(!condition)throw new Exception(why);}
    static CampaignProgress Copy(CampaignProgress p)
    {
        Require(CampaignSave.TryDecode(CampaignSave.Encode(p),out var clone),"Round-trip failed");return clone;
    }
    [MenuItem("Star Letters/Validate Campaign Rules")]
    public static string ValidateRules()
    {
        var q=new CampaignProgress();
        Require(!q.Travel(StoryWorld.Neighbor),"Travel must be locked before beacon");
        Require(!q.Apply(StoryAction.Toolbox),"Early toolbox skipped flower");
        foreach(var action in new[]{StoryAction.Letter,StoryAction.Flower,StoryAction.Toolbox,StoryAction.Beacon})Require(q.Apply(action),"Opening failed at "+action);
        Require(q.Travel(StoryWorld.Neighbor),"Neighbor travel failed");
        Require(!q.Travel(StoryWorld.Garden),"Garden unlocked before discoveries");
        Require(!q.Apply(StoryAction.Vane) && !q.Apply(StoryAction.Sluice),"Puzzle skipped meeting its friend");
        Require(q.Apply(StoryAction.Photo),"Early exploration must allow the photo");
        Require(q.Apply(StoryAction.Gardener),"Gardener meeting failed");
        q.Apply(StoryAction.Sluice);Require(!q.waterSolved,"Opening gate alone solved wrong route");
        q.Apply(StoryAction.Diverter);Require(q.waterSolved,"Gate-first irrigation order failed");
        q.Apply(StoryAction.Artisan);q.Apply(StoryAction.Vane);q.Apply(StoryAction.Vane);Require(!q.windSolved,"Wrong direction solved wind");
        q.Apply(StoryAction.Vane);Require(q.NeighborComplete,"All discoveries did not complete neighbor");
        Require(!q.Apply(StoryAction.Sluice) && !q.Apply(StoryAction.Diverter) && !q.Apply(StoryAction.Vane),"Completed puzzle lost its reward");
        q.Travel(StoryWorld.Home);q.Travel(StoryWorld.Neighbor);Require(q.NeighborComplete,"Travel lost inventory");
        Require(!CampaignSave.TryDecode("{bad",out _) && !CampaignSave.TryDecode("{\"version\":99,\"progress\":{}}",out _),"Invalid save accepted");
        var invalid=Copy(q);invalid.world=(StoryWorld)99;Require(!invalid.IsValid(),"Unknown world accepted");
        invalid=Copy(q);invalid.endingRead=true;Require(!invalid.IsValid(),"Ending without reunion accepted");
        Require(CampaignSave.TryDecode("{\"version\":1,\"progress\":{\"homeStep\":4,\"world\":1,\"artisanMet\":true,\"gardenerMet\":true,\"windSolved\":true,\"waterSolved\":true,\"photoSeen\":true,\"windDirection\":3,\"waterRoute\":1,\"sluiceOpen\":true}}",out var legacy) && legacy.NeighborComplete && !legacy.giantMet,"Existing v1 save did not migrate");

        // Explore every reachable state and check restoration plus a constructive
        // route to completion from each. This catches free-exploration softlocks.
        var queue=new Queue<CampaignProgress>();var seen=new HashSet<string>();queue.Enqueue(new CampaignProgress());
        while(queue.Count>0)
        {
            var state=queue.Dequeue();string encoded=CampaignSave.Encode(state);if(!seen.Add(encoded))continue;
            Require(state.IsValid(),"Reachable invalid state");
            var finish=Copy(state);
            if(finish.homeStep<4)
                foreach(var action in new[]{StoryAction.Letter,StoryAction.Flower,StoryAction.Toolbox,StoryAction.Beacon})finish.Apply(action);
            finish.Travel(StoryWorld.Neighbor);finish.Apply(StoryAction.Artisan);finish.Apply(StoryAction.Gardener);finish.Apply(StoryAction.Photo);
            for(int i=0;i<4 && !finish.windSolved;i++)finish.Apply(StoryAction.Vane);
            for(int i=0;i<3 && finish.waterRoute!=1;i++)finish.Apply(StoryAction.Diverter);
            if(!finish.sluiceOpen)finish.Apply(StoryAction.Sluice);
            Require(finish.NeighborComplete,"Softlock at "+encoded);
            finish.Travel(StoryWorld.Garden);
            finish.Apply(StoryAction.Cabinet);finish.Apply(StoryAction.EmptyChairs);
            finish.Apply(StoryAction.Giant);finish.Apply(StoryAction.Giant);finish.Apply(StoryAction.GardenMail);
            finish.Travel(StoryWorld.Neighbor);finish.Apply(StoryAction.Artisan);finish.Apply(StoryAction.Gardener);
            finish.Travel(StoryWorld.Garden);finish.Apply(StoryAction.PlantSeeds);finish.Apply(StoryAction.HangChime);
            finish.Apply(StoryAction.GardenGate);finish.Apply(StoryAction.TeaTable);finish.Apply(StoryAction.GardenMail);
            Require(finish.Complete,"Ending unreachable from "+encoded);
            foreach(StoryAction action in Enum.GetValues(typeof(StoryAction)))
            {var next=Copy(state);if(next.Apply(action))queue.Enqueue(next);}
            foreach(StoryWorld world in Enum.GetValues(typeof(StoryWorld)))
            {var next=Copy(state);if(next.Travel(world) && next.world!=state.world)queue.Enqueue(next);}
        }
        string key="StarLetters.Validation."+Guid.NewGuid().ToString("N");
        try
        {
            var first=new CampaignProgress();CampaignSave.Save(first,key);first.Apply(StoryAction.Letter);CampaignSave.Save(first,key);
            Require(CampaignSave.Load(out _,key).homeStep==1,"Persisted progress not loaded");
            PlayerPrefs.SetString(key,"truncated");
            Require(CampaignSave.Load(out var notice,key).homeStep==0 && notice!=null,"Backup recovery failed");
        }
        finally{PlayerPrefs.DeleteKey(key);PlayerPrefs.DeleteKey(key+".backup");PlayerPrefs.Save();}
        return "CAMPAIGN_RULES_OK: "+seen.Count+" reachable states; ending reachable from every state; legacy v1 migration, round-trip restoration and isolated save backup.";
    }

    public static string ValidateLiveRoute()
    {
        Require(EditorApplication.isPlaying,"Run the story scene in play mode.");
        var game=UnityEngine.Object.FindFirstObjectByType<CampaignDirector>();Require(game!=null && game.Progress!=null,"Director not ready");
        string original=CampaignSave.Encode(game.Progress);bool persistence=game.persistence;game.persistence=false;
        int visited=0;
        try
        {
            game.ResetJourney();
            void Visit(StoryAction action,int repeat=1)
            {
                game.CloseDialogue();
                var point=UnityEngine.Object.FindObjectsByType<StoryInteraction>(FindObjectsSortMode.None).Single(p=>p.action==action);
                Walk(game.traveler,point.transform.position);
                for(int i=0;i<repeat;i++){Require(game.Interact(point),"Cannot interact after walking to "+action);game.CloseDialogue();}
                visited++;
            }
            foreach(var action in new[]{StoryAction.Letter,StoryAction.Flower,StoryAction.Toolbox,StoryAction.Beacon})Visit(action);
            Visit(StoryAction.Beacon); // opens the travel menu; the helper closes it, so explicitly reopen.
            var beacon=UnityEngine.Object.FindObjectsByType<StoryInteraction>(FindObjectsSortMode.None).Single(p=>p.action==StoryAction.Beacon);
            Require(game.Interact(beacon) && game.Travel(StoryWorld.Neighbor),"Cannot depart home");
            Visit(StoryAction.Photo);Visit(StoryAction.Gardener);Visit(StoryAction.Sluice);Visit(StoryAction.Diverter);
            Require(game.irrigationWater.activeSelf && game.seedlings.activeSelf,"Irrigation did not restore visible plants");
            Visit(StoryAction.Artisan);Visit(StoryAction.Vane,3);Require(game.Progress.NeighborComplete,"Neighbor not complete");
            foreach(var action in new[]{StoryAction.Vane,StoryAction.Diverter})
            {
                var point=game.neighborRoot.GetComponentsInChildren<StoryInteraction>().Single(p=>p.action==action);
                Walk(game.traveler,point.transform.position);var before=CampaignSave.Encode(game.Progress);
                Require(!game.Interact(point) && game.DialogueOpen,"Solved puzzle revisit did not show dialogue");
                Require(!game.Dialogue.Contains("获得：") && CampaignSave.Encode(game.Progress)==before,"Solved puzzle repeated its reward");
                game.CloseDialogue();visited++;
            }
            string completed=CampaignSave.Encode(game.Progress);game.ResetJourney();Require(game.Restore(completed),"Restore failed");
            Require(game.neighborRoot.activeSelf && !game.homeRoot.activeSelf && game.seedlings.activeSelf,"Restored state not reflected in world");
            Visit(StoryAction.Beacon);beacon=UnityEngine.Object.FindObjectsByType<StoryInteraction>(FindObjectsSortMode.None).Single(p=>p.action==StoryAction.Beacon);
            Require(game.Interact(beacon) && game.Travel(StoryWorld.Home),"Cannot return home");
            Require(game.Progress.NeighborComplete && game.homeLamp.enabled,"Return trip lost reward or beacon");
            // Range and inactive-world checks use the actual public interaction entry.
            var remote=game.neighborRoot.GetComponentsInChildren<StoryInteraction>(true).First();
            Require(!game.Interact(remote),"Inactive world interaction accepted");
            var distant=game.homeRoot.GetComponentsInChildren<StoryInteraction>().Single(p=>p.action==StoryAction.Letter);
            Require(!game.Interact(distant),"Out-of-range active interaction accepted");
            void Depart(StoryWorld world)
            {
                Visit(StoryAction.Beacon);
                var current=UnityEngine.Object.FindObjectsByType<StoryInteraction>(FindObjectsSortMode.None).Single(p=>p.action==StoryAction.Beacon);
                Require(game.Interact(current) && game.Travel(world),"Travel failed to "+world);
            }
            Depart(StoryWorld.Garden);
            Require(game.gardenPresentation.gateCollider.enabled,"Winter gate already open");
            Walk(game.traveler,new Vector3(0,.1f,3.2f));
            var controller=game.traveler.GetComponent<CharacterController>();
            for(int i=0;i<30;i++)controller.Move(Vector3.back*.045f+Vector3.down*.035f);
            Require(game.traveler.transform.position.z>2.7f,"Walked through closed main gate");
            // Interior goals must be reached through the side wicket while the main gate is closed.
            Visit(StoryAction.Cabinet);Visit(StoryAction.EmptyChairs);Visit(StoryAction.Giant,2);Visit(StoryAction.GardenMail);
            Require(game.Progress.invitationsSent,"Invitation not collected");
            Visit(StoryAction.PlantSeeds);Visit(StoryAction.HangChime);
            Require(!game.Progress.reunion && game.gardenPresentation.gateCollider.enabled,"Preparation skipped invitations");
            Depart(StoryWorld.Neighbor);Visit(StoryAction.Gardener);Visit(StoryAction.Artisan);
            Depart(StoryWorld.Garden);Visit(StoryAction.GardenGate);
            Require(!game.gardenPresentation.gateCollider.enabled,"Opened gate still blocks player");
            Visit(StoryAction.TeaTable);
            Require(game.Progress.reunion && game.gardenPresentation.seatedGuests.activeSelf,"Friends missing from reunion");
            Require(game.gardenPresentation.seatedGuests.transform.childCount==2 && game.gardenPresentation.neighborFriends.All(f=>!f.activeSelf),"Reunion duplicated or lost friends");
            Visit(StoryAction.GardenMail);Require(game.Progress.Complete,"Final letter did not end story");
            completed=CampaignSave.Encode(game.Progress);game.ResetJourney();Require(game.Restore(completed),"Ending restoration failed");
            Require(!game.gardenPresentation.winterSnow.activeSelf && game.gardenPresentation.springCanopy.activeSelf && game.gardenPresentation.SpringAmount==1,"Restored ending remained winter");
            foreach(var action in new[]{StoryAction.EmptyChairs,StoryAction.Cabinet,StoryAction.GardenGate,StoryAction.PlantSeeds,StoryAction.HangChime,StoryAction.TeaTable})
            {
                var point=game.gardenRoot.GetComponentsInChildren<StoryInteraction>().Single(p=>p.action==action);
                Walk(game.traveler,point.transform.position);
                Require(!game.Interact(point) && game.DialogueOpen,"Completed interaction should show a revisit without advancing: "+action);
                Require(CampaignSave.Encode(game.Progress)==completed,"Revisit changed completed progress: "+action);
                Require(!game.Dialogue.Contains("一颗也没有种下") && !game.Dialogue.Contains("脚步声从敞开的大门传来"),"Revisit replayed the winter/arrival scene: "+action);
                Require(!game.InteractionLabel(point).Contains("空椅子"),"Occupied chairs still labelled empty");
                game.CloseDialogue();visited++;
            }
            Depart(StoryWorld.Home);
            var flower=game.homeRoot.GetComponentsInChildren<StoryInteraction>().Single(p=>p.action==StoryAction.Flower);
            Walk(game.traveler,flower.transform.position);game.Interact(flower);
            Require(game.Dialogue.Contains("巨人的花园"),"Opening flower did not acknowledge final letter");game.CloseDialogue();
            Depart(StoryWorld.Garden);Require(game.Progress.Complete,"Post-ending travel lost completion");
            return "CAMPAIGN_LIVE_OK: "+visited+" objectives walked via CharacterController; three planets, closed gate collision, side wicket, invitations, reunion, ending restoration, two solved-puzzle revisits, six post-reunion revisits and post-ending travel.";
        }
        finally{game.Restore(original);game.persistence=persistence;}
    }

    static void Walk(HomeAdventure traveler,Vector3 target)
    {
        const float step=.4f;var controller=traveler.GetComponent<CharacterController>();Physics.SyncTransforms();
        Vector2Int Cell(Vector3 p)=>new Vector2Int(Mathf.RoundToInt(p.x/step),Mathf.RoundToInt(p.z/step));
        Vector3 Position(Vector2Int cell)=>new Vector3(cell.x*step,.10f,cell.y*step);
        bool Clear(Vector2Int cell)
        {
            var p=Position(cell);if(new Vector2(p.x,p.z).magnitude>7.6f)return false;
            return !Physics.OverlapCapsule(p+Vector3.up*.35f,p+Vector3.up*1.32f,.30f)
                .Any(c=>c!=controller && !c.isTrigger);
        }
        var start=Cell(traveler.transform.position);var goal=Cell(target);
        var queue=new Queue<Vector2Int>();var previous=new Dictionary<Vector2Int,Vector2Int>();queue.Enqueue(start);previous[start]=start;
        var directions=new[]{Vector2Int.right,Vector2Int.left,Vector2Int.up,Vector2Int.down};
        while(queue.Count>0 && !previous.ContainsKey(goal))
        {
            var cell=queue.Dequeue();
            foreach(var dir in directions){var next=cell+dir;if(!previous.ContainsKey(next) && Clear(next)){previous[next]=cell;queue.Enqueue(next);}}
        }
        Require(previous.ContainsKey(goal),"No walkable route to "+target);
        var path=new List<Vector3>();var cursor=goal;while(cursor!=start){path.Add(Position(cursor));cursor=previous[cursor];}path.Reverse();path.Add(target);
        foreach(var waypoint in path)
        {
            int frame=0;
            while(Vector3.ProjectOnPlane(waypoint-traveler.transform.position,Vector3.up).magnitude>.08f)
            {
                var move=Vector3.ProjectOnPlane(waypoint-traveler.transform.position,Vector3.up);
                controller.Move(Vector3.ClampMagnitude(move,.045f)+Vector3.down*.035f);
                Require(traveler.transform.position.y>-.5f,"Fell through the planet");
                Require(++frame<100,"Actual collider blocked path at "+traveler.transform.position+" toward "+waypoint);
            }
        }
    }
}
