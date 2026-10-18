using System;
using UnityEngine;

namespace StarLetters
{
    public enum StoryWorld { Home, Neighbor, Garden }
    public enum StoryAction { Letter, Flower, Toolbox, Beacon, Artisan, Vane, Gardener, Diverter, Sluice, Photo,
        Giant, Cabinet, EmptyChairs, GardenMail, GardenGate, PlantSeeds, HangChime, TeaTable }

    // Plain story state, independent from the rendered scene and keyboard input.
    [Serializable]
    public sealed class CampaignProgress
    {
        public int homeStep;
        public StoryWorld world;
        public bool artisanMet, gardenerMet, windSolved, waterSolved, photoSeen;
        public int windDirection, waterRoute;
        public bool sluiceOpen;
        // Additive v1 fields preserve existing Home/Neighbor saves (default false).
        public bool giantMet, cabinetSeen, chairsSeen, giantOpenedUp, invitationsSent;
        public bool artisanInvited, gardenerInvited, gateOpened, seedsPlanted, chimeHung, reunion, endingRead;
        public bool NeighborComplete => windSolved && waterSolved && photoSeen;
        public bool FriendsInvited => artisanInvited && gardenerInvited;
        public bool SpringReady => FriendsInvited && gateOpened && seedsPlanted && chimeHung;
        public bool Complete => endingRead;

        public bool Apply(StoryAction action)
        {
            if (world==StoryWorld.Home)
            {
                int expected=action==StoryAction.Letter?0:action==StoryAction.Flower?1:
                    action==StoryAction.Toolbox?2:action==StoryAction.Beacon?3:-1;
                if (expected!=homeStep || homeStep>=4)return false;
                homeStep++;return true;
            }
            if (homeStep!=4)return false;
            if(world==StoryWorld.Garden)
            {
                if(!NeighborComplete)return false;
                switch(action)
                {
                    case StoryAction.Giant:
                        if(!giantMet){giantMet=true;return true;}
                        if(cabinetSeen && chairsSeen && !giantOpenedUp){giantOpenedUp=true;return true;}
                        return false;
                    case StoryAction.Cabinet:
                        if(cabinetSeen)return false;cabinetSeen=true;return true;
                    case StoryAction.EmptyChairs:
                        if(chairsSeen)return false;chairsSeen=true;return true;
                    case StoryAction.GardenMail:
                        if(reunion && !endingRead){endingRead=true;return true;}
                        if(giantOpenedUp && !invitationsSent){invitationsSent=true;return true;}
                        return false;
                    case StoryAction.GardenGate:
                        if(!FriendsInvited || gateOpened)return false;gateOpened=true;return true;
                    case StoryAction.PlantSeeds:
                        if(!invitationsSent || seedsPlanted)return false;seedsPlanted=true;return true;
                    case StoryAction.HangChime:
                        if(!invitationsSent || chimeHung)return false;chimeHung=true;return true;
                    case StoryAction.TeaTable:
                        if(!SpringReady || reunion)return false;reunion=true;return true;
                    default:return false;
                }
            }
            if(world!=StoryWorld.Neighbor)return false;
            switch(action)
            {
                case StoryAction.Artisan:
                    if(invitationsSent && !artisanInvited){artisanInvited=true;return true;}
                    if(artisanMet)return false;artisanMet=true;return true;
                case StoryAction.Gardener:
                    if(invitationsSent && !gardenerInvited){gardenerInvited=true;return true;}
                    if(gardenerMet)return false;gardenerMet=true;return true;
                case StoryAction.Vane:
                    if(!artisanMet || windSolved)return false;
                    windDirection=(windDirection+1)%4;
                    windSolved=windDirection==3;return true;
                case StoryAction.Diverter:
                    if(!gardenerMet || waterSolved)return false;
                    waterRoute=(waterRoute+1)%3;UpdateWater();return true;
                case StoryAction.Sluice:
                    if(!gardenerMet || waterSolved)return false;
                    sluiceOpen=!sluiceOpen;UpdateWater();return true;
                case StoryAction.Photo:
                    if(photoSeen)return false;photoSeen=true;return true;
                default:return false;
            }
        }

        void UpdateWater() => waterSolved=sluiceOpen && waterRoute==1;
        public bool Travel(StoryWorld destination)
        {
            if(homeStep<4 || !Enum.IsDefined(typeof(StoryWorld),destination))return false;
            if(destination==StoryWorld.Garden && !NeighborComplete)return false;
            world=destination;return true;
        }

        public bool IsValid()
        {
            if(homeStep<0 || homeStep>4 || !Enum.IsDefined(typeof(StoryWorld),world))return false;
            if(windDirection<0 || windDirection>3 || waterRoute<0 || waterRoute>2)return false;
            if(homeStep<4 && (world!=StoryWorld.Home || artisanMet || gardenerMet || photoSeen || windDirection!=0 || waterRoute!=0 || sluiceOpen))return false;
            if(windSolved && (!artisanMet || windDirection!=3))return false;
            if(waterSolved && (!gardenerMet || !sluiceOpen || waterRoute!=1))return false;
            if(!artisanMet && windDirection!=0)return false;
            if(!gardenerMet && (waterRoute!=0 || sluiceOpen))return false;
            // Reject inconsistent solved flags rather than silently losing rewards.
            if(artisanMet && windDirection==3 && !windSolved)return false;
            if(gardenerMet && sluiceOpen && waterRoute==1 && !waterSolved)return false;
            bool gardenEvidence=giantMet||cabinetSeen||chairsSeen||giantOpenedUp||invitationsSent||artisanInvited||gardenerInvited||gateOpened||seedsPlanted||chimeHung||reunion||endingRead;
            if((world==StoryWorld.Garden || gardenEvidence) && !NeighborComplete)return false;
            if(giantOpenedUp && !(giantMet && cabinetSeen && chairsSeen))return false;
            if(invitationsSent && !giantOpenedUp)return false;
            if((artisanInvited||gardenerInvited||seedsPlanted||chimeHung) && !invitationsSent)return false;
            if(gateOpened && !FriendsInvited)return false;
            if(reunion && !SpringReady)return false;
            if(endingRead && !reunion)return false;
            return true;
        }
    }

    public static class CampaignSave
    {
        public const string Key="StarLetters.Campaign.v1";
        public const string BackupKey=Key+".backup";
        [Serializable] sealed class Envelope { public int version; public CampaignProgress progress; }
        public static string Encode(CampaignProgress progress)
        {
            if(progress==null || !progress.IsValid())throw new InvalidOperationException("Invalid campaign state.");
            return JsonUtility.ToJson(new Envelope{version=1,progress=progress});
        }
        public static bool TryDecode(string json,out CampaignProgress progress)
        {
            progress=null;
            if(string.IsNullOrWhiteSpace(json))return false;
            try
            {
                var envelope=JsonUtility.FromJson<Envelope>(json);
                if(envelope==null || envelope.version!=1 || envelope.progress==null || !envelope.progress.IsValid())return false;
                progress=envelope.progress;return true;
            }
            catch(ArgumentException){return false;}
        }
        public static CampaignProgress Load(out string notice,string key=Key)
        {
            notice=null;
            if(TryDecode(PlayerPrefs.GetString(key,""),out var current))return current;
            if(TryDecode(PlayerPrefs.GetString(key+".backup",""),out var backup))
            {notice="上次的记录没有读完，已恢复前一份旅程记录。";return backup;}
            if(PlayerPrefs.HasKey(key))notice="旅程记录暂时无法读取，已回到家园。旧记录仍保留。";
            return new CampaignProgress();
        }
        public static void Save(CampaignProgress progress,string key=Key)
        {
            var encoded=Encode(progress);
            var previous=PlayerPrefs.GetString(key,"");
            if(TryDecode(previous,out _))PlayerPrefs.SetString(key+".backup",previous);
            PlayerPrefs.SetString(key,encoded);PlayerPrefs.Save();
        }
    }
}
