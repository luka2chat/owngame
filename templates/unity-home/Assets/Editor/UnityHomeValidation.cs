using System;
using System.Linq;
using StarLetters;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

// Validation runs on the open starter scene; it never rewrites scene assets.
public static class UnityHomeValidation
{
    public const string Scene = "Assets/Scenes/HomeArt.unity";

    [MenuItem("owngame/Validate Home Template")]
    public static void Validate()
    {
        ValidateRules();
        if (EditorSceneManager.GetActiveScene().path != Scene)
            throw new InvalidOperationException("Open " + Scene + " first.");
        foreach (var root in EditorSceneManager.GetActiveScene().GetRootGameObjects())
            foreach (var t in root.GetComponentsInChildren<Transform>(true))
                if (GameObjectUtility.GetMonoBehavioursWithMissingScriptCount(t.gameObject) != 0)
                    throw new Exception("Missing script: " + t.name);
        var game = UnityEngine.Object.FindFirstObjectByType<HomeAdventure>();
        if (game == null || game.viewCamera == null || game.avatar == null ||
            game.beaconLight == null || game.beaconCrystal == null ||
            game.interactions == null || game.interactions.Length != 4 ||
            game.interactions.Any(p => p == null) ||
            game.interactions.Select(p => p.action).Distinct().Count() != 4)
            throw new Exception("Incomplete starter scene references.");
        if (Resources.Load<Font>("Fonts/StarLettersUI") == null)
            throw new Exception("Missing UI font.");
        if (EditorApplication.isPlaying)
        {
            Debug.Log(ValidateLiveInteractions());
            Debug.Log(ValidateWalkingRoute());
        }
        Debug.Log("UNITY_HOME_VALID: rules and scene references; play mode also checks interactions and walking.");
    }

    // Batch entry: omit -quit so Unity can enter Play mode and run the live checks.
    public static void RunBatch()
    {
        EditorSceneManager.OpenScene(Scene);
        Validate();
        SessionState.SetBool("owngame.home.batch", true);
        SessionState.SetFloat("owngame.home.deadline", (float)EditorApplication.timeSinceStartup + 90f);
        RegisterBatch();
        EditorApplication.EnterPlaymode();
    }
    [InitializeOnLoadMethod]
    static void RegisterBatch()
    {
        if (SessionState.GetBool("owngame.home.batch", false))
        {
            EditorApplication.update -= PollBatch;
            EditorApplication.update += PollBatch;
        }
    }
    static void PollBatch()
    {
        if (!EditorApplication.isPlaying)
        {
            if (EditorApplication.timeSinceStartup < SessionState.GetFloat("owngame.home.deadline", 0f)) return;
            Debug.LogError("UNITY_HOME_TIMEOUT: could not enter Play mode within 90 seconds.");
            EditorApplication.Exit(1);
            return;
        }
        EditorApplication.update -= PollBatch;
        SessionState.SetBool("owngame.home.batch", false);
        try { Validate(); EditorApplication.Exit(0); }
        catch (Exception e) { Debug.LogException(e); EditorApplication.Exit(1); }
    }
    
    static void ValidateRules()
    {
        var q=new HomeQuest();
        void Require(bool condition,string description) { if(!condition) throw new Exception(description); }
        Require(!q.Apply(HomeAction.Beacon),"Early beacon must not complete quest.");
        Require(!q.Apply(HomeAction.Toolbox),"Early toolbox must not skip letter.");
        Require(q.Apply(HomeAction.Mailbox),"Letter should advance.");
        Require(!q.Apply(HomeAction.Mailbox),"Duplicate letter must not advance.");
        Require(!q.Apply(HomeAction.Toolbox),"Toolbox must not skip flower.");
        Require(q.Apply(HomeAction.Flower),"Flower should advance.");
        Require(!q.Apply(HomeAction.Beacon),"Beacon needs the spare part.");
        Require(q.Apply(HomeAction.Toolbox),"Toolbox should advance.");
        Require(q.Apply(HomeAction.Beacon) && q.Stage==HomeStage.Ready,"Beacon completes opening.");
        foreach(HomeAction a in Enum.GetValues(typeof(HomeAction))) Require(!q.Apply(a),"Completion must be stable.");
        q.Reset(); Require(q.Stage==HomeStage.ReadLetter,"Reset restores initial stage.");
        Debug.Log("HOME_RULES_OK: sequence, early actions, duplicate actions, terminal state, restart.");
    }

    // Integration check deliberately uses live scene interaction and proximity guards.
    // It does not substitute for exercising keyboard controls and camera visually.
    public static string ValidateLiveInteractions()
    {
        if(!EditorApplication.isPlaying) throw new InvalidOperationException("Run in Play mode.");
        var game=UnityEngine.Object.FindFirstObjectByType<HomeAdventure>();
        if(game==null) throw new Exception("No HomeAdventure.");
        game.Restart();
        var initial=game.transform.position;
        var ordered=game.interactions.OrderBy(p=>(int)p.action).ToArray();
        foreach(var point in ordered)
        {
            game.TeleportTo(point.transform.position + Vector3.up*.05f);
            if(!game.Interact(point)) throw new Exception("Cannot interact at "+point.name);
            game.CloseDialogue();
        }
        if(game.Quest.Stage!=HomeStage.Ready || !game.beaconLight.enabled) throw new Exception("Beacon did not light.");
        game.Restart();
        game.TeleportTo(new Vector3(0,20,0));
        if(game.Interact(ordered[0])) throw new Exception("Out-of-range interaction accepted.");
        game.TeleportTo(initial);
        return "HOME_LIVE_OK: four interactions, lit beacon, restart and range guard.";
    }

    public static string ValidateWalkingRoute()
    {
        if(!EditorApplication.isPlaying) throw new InvalidOperationException("Run in Play mode.");
        var game=UnityEngine.Object.FindFirstObjectByType<HomeAdventure>();
        var controller=game.GetComponent<CharacterController>();
        game.Restart();
        Physics.SyncTransforms();
        void Walk(Vector3 target)
        {
            for(int frame=0;frame<1500;frame++)
            {
                var delta=Vector3.ProjectOnPlane(target-game.transform.position,Vector3.up);
                if(delta.magnitude<.10f) return;
                controller.Move(Vector3.ClampMagnitude(delta,.04f)+Vector3.down*.04f);
                if(game.transform.position.y < -.5f) throw new Exception("Character fell through ground.");
            }
            throw new Exception("Route blocked before "+target+" at "+game.transform.position);
        }
        HomeInteraction Point(HomeAction action) => game.interactions.First(p=>p.action==action);
        void Visit(HomeAction action)
        {
            var point=Point(action); Walk(point.transform.position);
            if(!game.Interact(point)) throw new Exception("Walking did not reach interaction: "+action);
            game.CloseDialogue();
        }
        Visit(HomeAction.Mailbox);
        Visit(HomeAction.Flower);
        Walk(new Vector3(-.6f,0,2.2f));
        Walk(new Vector3(-.6f,0,-1.7f));
        Visit(HomeAction.Toolbox);
        Walk(new Vector3(-.6f,0,-1.7f));
        Walk(new Vector3(-2f,0,0));
        Visit(HomeAction.Beacon);
        if(game.Quest.Stage!=HomeStage.Ready) throw new Exception("Walking route failed to finish.");
        // Push toward the closed cottage: the actual collider must stop movement.
        var house=GameObject.Find("Cottage collision").GetComponent<BoxCollider>();
        game.TeleportTo(new Vector3(house.bounds.center.x,.08f,house.bounds.max.z+1));
        Physics.SyncTransforms();
        for(int i=0;i<120;i++) controller.Move(new Vector3(0,-.04f,-.04f));
        if(game.transform.position.z < house.bounds.max.z+.1f) throw new Exception("Character passed through cottage.");
        game.Restart();
        return "HOME_WALK_OK: CharacterController traversed all four objectives; ground and cottage collision verified.";
    }
}
