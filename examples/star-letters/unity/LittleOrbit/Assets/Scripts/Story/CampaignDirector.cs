using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.InputSystem;

namespace StarLetters
{
    [DefaultExecutionOrder(20)]
    public sealed partial class CampaignDirector : MonoBehaviour
    {
        public HomeAdventure traveler;
        public GameObject homeRoot, neighborRoot, gardenRoot;
        public GardenPresentation gardenPresentation;
        public Vector3 gardenSpawn=new Vector3(0,.16f,5.8f);
        public Vector3 homeSpawn=new Vector3(0,.1f,5), neighborSpawn=new Vector3(0,.1f,5.8f);
        public Transform vane, windmill, sluice, diverter;
        public GameObject irrigationWater, bypassWater, seedlings;
        public Renderer homeCrystal;
        public Light homeLamp;
        public bool persistence=true;
        public CampaignProgress Progress {get;private set;}
        public bool IsBlockingInput => dialogue!=null || travelMenu || restartMenu;
        public bool DialogueOpen => dialogue!=null;
        public string Dialogue => dialogue;
        public bool PhotoOpen => photoOpen;
        public bool PhotoBack => photoBack;
        public string CurrentObjective => Objective();
        StoryInteraction[] points;
        StoryInteraction nearest;
        string dialogue, speaker, toast;
        bool travelMenu,restartMenu,inventoryOpen;
        bool photoOpen,photoBack;
        Texture2D photograph;
        float toastUntil;
        Quaternion vaneRest,sluiceRest,diverterRest;
        Material crystal;
        Font font;
        GUIStyle title,body,small,button;
        StorySound sound;
        readonly string[] compass={"北","东","南","西"};
        readonly string[] routes={"水车","花圃","蓄水池"};

        void Start()
        {
            font=Resources.Load<Font>("Fonts/StarLettersUI");
            photograph=Resources.Load<Texture2D>("Story/OldPhotograph");
            sound=gameObject.AddComponent<StorySound>();
            // Scene roots are siblings of this director.
            points=homeRoot.GetComponentsInChildren<StoryInteraction>(true)
                .Concat(neighborRoot.GetComponentsInChildren<StoryInteraction>(true)).ToArray();
            if(gardenRoot!=null)points=points.Concat(gardenRoot.GetComponentsInChildren<StoryInteraction>(true)).ToArray();
            vaneRest=vane.rotation;sluiceRest=sluice.rotation;diverterRest=diverter.rotation;
            crystal=homeCrystal.material;
            string notice=null;
            Progress=persistence?CampaignSave.Load(out notice):new CampaignProgress();
            ActivateWorld();RefreshWorld(true);
            if(notice!=null)Say("旅程记录",notice);
        }

        void Update()
        {
            if(Progress==null)return;
            if(Progress.windSolved && neighborRoot.activeSelf)windmill.Rotate(Vector3.forward,Time.deltaTime*45,Space.World);
            if(!Application.isFocused)return;
            var keyboard=Keyboard.current;
            if(keyboard==null)return;
            if(IsBlockingInput)
            {
                if(photoOpen && keyboard.fKey.wasPressedThisFrame){FlipPhotograph();return;}
                if(LetterOpen && keyboard.fKey.wasPressedThisFrame){FlipLetters();return;}
                if(keyboard.escapeKey.wasPressedThisFrame){CloseDialogue();return;}
                if(dialogue!=null && keyboard.enterKey.wasPressedThisFrame){CloseDialogue();return;}
                return;
            }
            FindNearest();
            if(keyboard.eKey.wasPressedThisFrame && nearest!=null)Interact(nearest);
        }

        void FindNearest()
        {
            nearest=null;float best=float.PositiveInfinity;
            foreach(var point in points)
            {
                if(!point.gameObject.activeInHierarchy)continue;
                float distance=Vector3.Distance(point.transform.position,traveler.transform.position);
                if(distance<point.radius && distance<best){best=distance;nearest=point;}
            }
        }

        public string InteractionLabel(StoryInteraction point)
        {
            if(Progress==null)return point.label;
            switch(point.action)
            {
                case StoryAction.EmptyChairs: if(Progress.reunion)return "看看重逢的老地方";break;
                case StoryAction.GardenGate: if(Progress.gateOpened)return "看看敞开的大门";break;
                case StoryAction.PlantSeeds: if(Progress.seedsPlanted)return "看看种下的花";break;
                case StoryAction.HangChime: if(Progress.chimeHung)return "听听树下的风铃";break;
                case StoryAction.TeaTable: if(Progress.reunion)return "和朋友再喝杯茶";break;
                case StoryAction.GardenMail: if(Progress.reunion)return Progress.endingRead?"重读最后一封回信":"拆开最后一封回信";break;
                case StoryAction.Vane: if(Progress.windSolved)return "看看迎风的风车";break;
                case StoryAction.Sluice:
                case StoryAction.Diverter: if(Progress.waterSolved)return "看看流向花圃的水";break;
            }
            return point.label;
        }

        public bool Interact(StoryInteraction point)
        {
            if(Progress==null || point==null || IsBlockingInput || !point.gameObject.activeInHierarchy ||
                Vector3.Distance(point.transform.position,traveler.transform.position)>point.radius)return false;
            if(point.action==StoryAction.Beacon && Progress.homeStep==4)
            {travelMenu=true;return true;}
            bool windBefore=Progress.windSolved,waterBefore=Progress.waterSolved,reunionBefore=Progress.reunion;
            bool changed=Progress.Apply(point.action);
            switch(point.action)
            {
                case StoryAction.Letter:
                    InspectLetter();break;
                case StoryAction.Flower:
                    Say("第一朵花",Progress.Complete?"这朵花的种子，原来来自巨人的花园。\n\n很久以前，他把春天寄给了你。今天，你终于把回信送到了。\n\n风吹过花瓣，像有人轻轻说：下次见。":Progress.homeStep>=2?"你扶正了花枝，松了松土。\n\n当年的种子袋还在。邮戳磨花了，只能看清‘春天’两个字。\n\n修好信标，去邻星问问朋友吧。备用接头就在小屋旁的工具箱里。":"信箱里有一封等着你拆开的信。");break;
                case StoryAction.Toolbox:
                    Say("小屋旁的工具箱",Progress.homeStep==4?"放接头的小格子空了。\n\n远处的信标还亮着，像家园为你留的一盏灯。":Progress.homeStep>=3?"一枚备用黄铜接头，还能用。\n\n它正好可以接上信标里断开的线路。":"先去照看花圃里的那朵花吧。");break;
                case StoryAction.Beacon:
                    Say("重新亮起的航路",Progress.homeStep==4?"接头归位，黄铜灯架里亮起一束暖光。\n\n邻星的风铃匠与种植者也许认识写信的人。\n再次触碰信标，就可以出发。":"信标缺少一枚接头。\n\n"+Objective());break;
                case StoryAction.Artisan:
                    if(Progress.reunion){Say("阿栎","椅子还是老样子，茶比以前淡了一点。\n\n可这一次，我听见了门开着的声音。\n下个春天，我们也来。");break;}
                    if(Progress.invitationsSent){Say("一封终于寄出的邀请","阿栎把信翻了两遍。\n\n‘他真的写了“请来坐坐”？没有说要等花开齐？’\n\n他收好工具，笑了：‘那我把茶带上。告诉他，别把大门又关上了。’\n\n阿栎答应赴约。");break;}
                    Say("风铃匠 · 阿栎",Progress.windSolved?
                        "这枚风铃送给你。\n\n告诉那位园丁：风铃要挂在风里，放在柜子里可不会唱歌。\n\n桌边有张旧合影。那时候，他总说下次见。":
                        "你说那座没有春天的花园？我认识它的主人。\n\n先帮我一个小忙吧：风车背着风，风铃已经沉默好几天了。\n看西边那条飘带——风从西边来。把风向标的箭头转向来风的方向，风车就能重新转动。");break;
                case StoryAction.Vane:
                    if(!Progress.artisanMet)Say("风向标","转轴旁留着一张便条：先问问风铃匠，别让风车越转越迷糊。");
                    else if(windBefore)Say("风再次唱歌","箭头稳稳迎向西风，叶片慢慢转着。\n\n"+(Progress.chimeHung?"那枚小风铃已经在巨人的树下唱歌了。":"送给你的风铃安静地躺在行囊里，等着下一阵风。"));
                    else if(Progress.windSolved)Say("风再次唱歌","箭头迎向西风，风车转了起来。\n\n风铃匠把一枚小风铃交到你手里：\n‘它的声音，应该有人一起听。’\n\n获得：黄铜风铃。");
                    else Notify("风向标指向"+compass[Progress.windDirection]+"，叶片仍未迎风。西侧飘带提示着来风方向。");break;
                case StoryAction.Gardener:
                    if(Progress.reunion){Say("阿葵","看，花开得并不整齐。有些早，有些晚。\n\n可谁规定春天一定得整整齐齐呢？\n我们能坐在这里，就很好。");break;}
                    if(Progress.invitationsSent){Say("另一封邀请","阿葵读到‘老地方’时，停了很久。\n\n‘原来那两张椅子还在。’\n她摘下围裙，拿起一小把花种。\n\n‘我来。你先回去，把门打开。’\n\n阿葵答应赴约。");break;}
                    Say("种植者 · 阿葵",Progress.waterSolved?
                        "种子袋替你装好了。\n\n一颗种子不是放得越久就越珍贵。给它土、给它水，也给它一个愿意等待的人。\n\n如果你见到他……问问那两张椅子还在不在。":
                        "温室里的苗等水等得低下了头。\n\n水闸管着水来不来，分水阀管着水往哪儿去。\n把分水阀转向花圃，再打开水闸；顺序倒过来也可以，只要最后水能流到花圃。\n别一直把水送回蓄水池呀。");break;
                case StoryAction.Diverter:
                case StoryAction.Sluice:
                    if(!Progress.gardenerMet)Say("灌溉装置","种植者正在温室前等你，先听听她的烦恼吧。");
                    else if(waterBefore)Say("流到花圃的水","水渠仍在轻轻流淌，花圃里的苗已经挺直了身子。\n\n"+(Progress.seedsPlanted?"你带走的那包种子，也在另一颗星球上扎下了根。":"阿葵交给你的种子还在行囊里。它们需要一片新的土地。"));
                    else if(Progress.waterSolved)Say("流到花圃的水","清水沿着石槽流进花圃，小苗慢慢挺直了身子。\n\n阿葵把一包种子交给你：\n‘把它种下去吧。别再让它只是一件收藏品。’\n\n获得：春日种子。");
                    else Notify("分水阀 → "+routes[Progress.waterRoute]+"；水闸"+(Progress.sluiceOpen?"已打开。看着水流，再试试另一条路。":"还关着。"));break;
                case StoryAction.Photo:
                    InspectPhotograph();break;
                case StoryAction.Giant:
                    Say("窗边的园丁",Progress.reunion?"我一直想把最好的春天留给他们。\n\n可种子被我锁进柜子，风铃被我裹进布里，连‘请来坐坐’都被我留到了明年。\n\n谢谢你。今天，我终于把它们都拿出来了。":Progress.giantOpenedUp?
                        "巨人看着合影，小声说：\n\n‘我总想，等花园足够漂亮，再请他们来。后来，连开门都变得很难。’\n\n他拿出两只信封，第一次划掉了‘明年’。\n‘你愿意替我送去吗？信就在大门外的信箱里。’":
                        "‘那封信，是我写的。’\n\n巨人接过风铃和种子，小心地放回收藏柜。\n‘这些我都有了，可春天为什么还是不来？’\n\n看看柜子，也看看院子里的空椅子，再回来和他说说吧。");break;
                case StoryAction.Cabinet:
                    Say("春天收藏柜",Progress.reunion?"柜子里还留着许多种子，最下面的抽屉却空了。\n\n邀请已经送到，风铃在树下响，院子里传来喝茶的声音。\n\n巨人说：‘剩下这些，留给下一个春天。我们一起种。’":"种子装在精致的瓶子里，一颗也没有种下。\n风铃包在软布里，一次也没有迎过风。\n\n最下面压着许多没有寄出的邀请。\n每一封都写着：‘等花园再好一点，就请你们来。’\n\n柜子买得越来越满，院子却越来越安静。");break;
                case StoryAction.EmptyChairs:
                    Say(Progress.reunion?"老地方，再相见":"两张空椅子",Progress.reunion?"现在，照片外面的人也坐回了照片里的位置。\n\n椅背上的名字还在。阿葵轻轻拍了拍桌沿：‘下次，也来坐坐。’":"椅背上刻着阿栎和阿葵的名字。\n桌上有三只茶杯，杯口都朝着门。\n\n你把旧合影放在旁边。原来，他一直留着他们的位置。\n\n只是从来没有告诉他们。");break;
                case StoryAction.GardenMail:
                    if(Progress.endingRead){InspectLetter(true);break;}
                    Say("花园的橙色信箱",
                        Progress.FriendsInvited?"两封邀请都有了回音。阿栎带上了茶，阿葵收好了种子。\n\n不用再等花开齐了。打开大门，给朋友们留一条进来的路吧。":
                        Progress.invitationsSent?"两封邀请已经装进你的行囊。\n\n‘不必等花开齐。请来坐坐。’\n\n回邻星，亲手把邀请交给阿栎和阿葵吧。":
                        "信箱上夹着一张便条：\n\n‘客人请走西边的小门。我在屋子的窗边。’\n\n大门仍然闩着，西边的小门留了一道能走过去的空隙。");break;
                case StoryAction.GardenGate:
                    Say("花园的大门",Progress.reunion?"大门仍然敞开着。\n\n巨人把门闩放到了窗台上，给来往的风和朋友都留了一条路。":Progress.gateOpened?"门闩落下，大门终于向两边敞开。\n\n这一次，巨人没有再说‘等一等’。\n\n"+PreparationObjective():
                        Progress.invitationsSent?"先把邀请送到两位朋友手里。\n\n"+InvitationObjective():"大门还闩着。先从西边的小门进去，听听巨人的心事。");break;
                case StoryAction.PlantSeeds:
                    Say("从收藏到生长",Progress.seedsPlanted && !changed?"花苗朝着阳光舒展开来。土还是湿的，窗台上的水壶少了半壶水。\n\n有人在每天照看它们。":Progress.seedsPlanted?"你把种子埋进松软的土里。巨人从窗边递来水壶。\n\n它们终于不再只是一件藏品。\n\n"+PreparationObjective():"巨人还舍不得拆开种子袋。先看看收藏柜和空椅子，再和他聊聊。");break;
                case StoryAction.HangChime:
                    Say("风铃的归处",Progress.chimeHung && !changed?"树下的风铃轻轻碰在一起。\n\n阿栎说过，它的声音应该有人一起听。现在，风把声音送到了每个人身边。":Progress.chimeHung?"你解开软布，把黄铜风铃挂在树旁。\n\n第一声轻响很小，却一直传到了大门外。\n\n好像有人在回答那封等了很久的信。":"挂钩空着，风也在等。先让巨人愿意把春天从收藏柜里拿出来吧。");break;
                case StoryAction.TeaTable:
                    if(reunionBefore){Say("再添一杯茶","茶壶还温着，朋友们把话说得很慢。\n\n巨人从窗口探出头：‘不赶路的话，就再坐一会儿。’\n\n"+(Progress.endingRead?"来信已经有了回音。下一次见面，不必再等一个完美的春天。":"橙色信箱里，有一封写给你的回信。"));break;}
                    Say(Progress.reunion?"迟到的春天":"第三只茶杯",Progress.reunion?
                        "脚步声从敞开的大门传来。\n\n阿栎坐回左边，阿葵坐回右边。巨人把第三只茶杯捧在手心。\n‘我以为你们早就忘了。’\n‘我们只是一直在等你说：请进。’\n\n雪慢慢化开。不是因为春天被买齐了，而是终于有人一起等它。\n\n信箱里，还有巨人写给你的最后一封回信。":
                        "桌上还缺一点准备。\n\n"+PreparationObjective());break;
            }
            if(changed)
            {
                Persist();RefreshWorld();
                if((Progress.windSolved && !windBefore)||(Progress.waterSolved && !waterBefore)||(Progress.reunion && !reunionBefore))sound.Reward();
                else if(point.action==StoryAction.Vane || point.action==StoryAction.Diverter || point.action==StoryAction.Sluice)sound.Mechanism();
            }
            return changed;
        }

        public bool Travel(StoryWorld world)
        {
            if(!travelMenu || Progress==null || (world==StoryWorld.Garden && gardenRoot==null) || !Progress.Travel(world))return false;
            CloseDialogue();ActivateWorld();RefreshWorld();Persist();
            Notify(world==StoryWorld.Home?"回到了家园。":world==StoryWorld.Neighbor?
                (Progress.reunion?"回到了邻星。两位朋友还在花园喝茶，风车和水渠仍在运转。":"抵达邻星。风铃匠和种植者就在各自的小屋前。"):
                Progress.gateOpened?"回到了花园。大门敞开着，欢迎再来坐坐。":
                Progress.FriendsInvited?"两位朋友都已答应赴约。去打开花园的大门吧。":"抵达巨人的花园。大门闩着，请从西边的小门入内。");return true;
        }

        void ActivateWorld()
        {
            homeRoot.SetActive(Progress.world==StoryWorld.Home);neighborRoot.SetActive(Progress.world==StoryWorld.Neighbor);
            if(gardenRoot!=null)gardenRoot.SetActive(Progress.world==StoryWorld.Garden);
            traveler.spawn=Progress.world==StoryWorld.Home?homeSpawn:Progress.world==StoryWorld.Neighbor?neighborSpawn:gardenSpawn;
            inventoryOpen=false;traveler.ResetWalkingCamera(Progress.world);
            traveler.TeleportTo(traveler.spawn);Physics.SyncTransforms();FindNearest();
        }
        void RefreshWorld(bool instant=false)
        {
            vane.rotation=Quaternion.AngleAxis(Progress.windDirection*90,Vector3.up)*vaneRest;
            diverter.rotation=Quaternion.AngleAxis(Progress.waterRoute*120,Vector3.up)*diverterRest;
            sluice.rotation=Quaternion.AngleAxis(Progress.sluiceOpen?-55:0,Vector3.right)*sluiceRest;
            irrigationWater.SetActive(Progress.waterSolved);
            bypassWater.SetActive(Progress.sluiceOpen && Progress.waterRoute!=1);
            seedlings.SetActive(Progress.waterSolved);
            sound.SetAmbience((Progress.world==StoryWorld.Neighbor && Progress.windSolved)||(Progress.world==StoryWorld.Garden && Progress.chimeHung),
                (Progress.world==StoryWorld.Neighbor && Progress.sluiceOpen)||(Progress.world==StoryWorld.Garden && Progress.reunion));
            if(gardenPresentation!=null)gardenPresentation.SetState(Progress,instant);
            homeLamp.enabled=Progress.homeStep==4;
            crystal.SetColor("_BaseColor",Progress.homeStep==4?new Color(1,.65f,.18f):new Color(.22f,.32f,.35f));
            crystal.EnableKeyword("_EMISSION");crystal.SetColor("_EmissionColor",Progress.homeStep==4?new Color(1,.5f,.1f)*2:Color.black);
        }
        void Persist(){if(persistence)CampaignSave.Save(Progress);}
        void Say(string name,string text){speaker=name;dialogue=text;photoOpen=false;photoBack=false;LetterOpen=false;}
        void Notify(string text){toast=text;toastUntil=Time.unscaledTime+6;}
        public void CloseDialogue(){dialogue=null;travelMenu=false;restartMenu=false;photoOpen=false;photoBack=false;LetterOpen=false;LetterIsReply=false;}
        public void FlipPhotograph(){if(photoOpen)photoBack=!photoBack;}
        public bool InspectPhotograph()
        {
            if(Progress==null || !Progress.photoSeen || IsBlockingInput)return false;
            Say("一张旧合影",Progress.reunion?"照片里的人，又坐回了花园的椅子上。\n\n背面那句‘明年春天，老地方’，终于变成了今天。\n\n下次该拍一张新的了。也给你留一个位置。":"照片里，阿栎和阿葵坐在两张木椅子上。身后的巨人弯下腰，努力挤进小小的画框。\n\n那两张椅子，和信封上画的一模一样。\n\n也许，花园缺的东西并不在购物清单里。");
            photoOpen=photograph!=null;inventoryOpen=false;return true;
        }

        public void ResetJourney()
        {
            Progress=new CampaignProgress();CloseDialogue();ActivateWorld();RefreshWorld(true);Persist();
        }
        // Test restoration uses the same validation and presentation path as saved play.
        public bool Restore(string json)
        {
            if(!CampaignSave.TryDecode(json,out var restored))return false;
            if(restored.world==StoryWorld.Garden && gardenRoot==null)return false;
            Progress=restored;CloseDialogue();ActivateWorld();RefreshWorld(true);return true;
        }
        string Objective()
        {
            if(Progress==null)return "正在整理来信……";
            if(Progress.Complete)return "回信已送达 · 你可以继续探访三颗星球";
            if(Progress.homeStep<4)return new[]{"拆开信箱里的来信","照看花圃里的第一朵花","从工具箱取出备用接头","修好灯笼信标"}[Progress.homeStep];
            if(Progress.reunion)return "去花园信箱，读巨人的最后一封回信";
            if(Progress.invitationsSent)
            {
                if(!Progress.FriendsInvited)return InvitationObjective();
                if(Progress.world!=StoryWorld.Garden)return "回到巨人的花园，迎接两位朋友";
                return PreparationObjective();
            }
            if(Progress.NeighborComplete)
            {
                if(Progress.world!=StoryWorld.Garden)return "沿信标去巨人的花园，寻找写信人";
                if(!Progress.giantMet)return "从西侧小门入内，和窗边的巨人说话";
                if(!Progress.cabinetSeen)return "看看巨人的春天收藏柜";
                if(!Progress.chairsSeen)return "看看茶桌旁的两张空椅子";
                if(!Progress.giantOpenedUp)return "带着发现，再和巨人聊聊";
                return "去大门外的信箱，取出两封邀请";
            }
            if(Progress.world==StoryWorld.Home)return "通过信标去邻星，寻找写信人的线索";
            if(!Progress.artisanMet && !Progress.gardenerMet)return "和风铃匠、种植者聊聊";
            if(!Progress.windSolved)return Progress.artisanMet?"迎着西风转动风向标，让风铃再次响起":"去小屋前认识风铃匠";
            if(!Progress.waterSolved)return Progress.gardenerMet?"把水引向花圃，再打开水闸":"去温室前认识种植者";
            if(!Progress.photoSeen)return "看看两张椅子后面的旧合影";
            return "带上风铃、种子和旧合影，准备前往巨人的花园";
        }
        string InvitationObjective()
        {
            if(Progress.FriendsInvited)return "两位朋友都已答应，回花园打开大门";
            string who=!Progress.artisanInvited && !Progress.gardenerInvited?"阿栎和阿葵":!Progress.artisanInvited?"阿栎":"阿葵";
            return "在邻星把邀请亲手交给"+who;
        }
        string PreparationObjective()
        {
            if(!Progress.FriendsInvited)return InvitationObjective();
            if(!Progress.gateOpened)return "打开花园的大门，迎接朋友";
            if(!Progress.seedsPlanted)return "把春日种子种进花圃";
            if(!Progress.chimeHung)return "在树旁挂起黄铜风铃";
            return "到茶桌旁，摆好第三只茶杯";
        }

        void Styles()
        {
            if(title!=null)return;
            title=new GUIStyle(GUI.skin.label){font=font,fontSize=26,wordWrap=true};
            body=new GUIStyle(title){fontSize=21};small=new GUIStyle(body){fontSize=17};
            button=new GUIStyle(GUI.skin.button){font=font,fontSize=20,wordWrap=true};
        }
        void OnGUI()
        {
            if(Progress==null)return;
            Styles();var previous=GUI.matrix;
            bool homeView=Progress.world==StoryWorld.Home;
            float scale=Mathf.Min(Screen.width/1280f,Screen.height/720f);
            scale=Mathf.Min(Mathf.Max(.95f,scale),Screen.width/780f);
            float layoutWidth=Screen.width/scale,layoutHeight=Screen.height/scale;
            bool narrow=layoutWidth<1120,neighborView=Progress.world==StoryWorld.Neighbor;
            GUI.matrix=Matrix4x4.Scale(Vector3.one*scale);
            if(LetterOpen)
            {
                DrawLetter(layoutWidth,layoutHeight);GUI.matrix=previous;return;
            }
            if(photoOpen)
            {
                DrawPhotograph(layoutWidth,layoutHeight);GUI.matrix=previous;return;
            }
            Panel(new Rect(22,20,440,neighborView?130:94));
            GUI.Label(new Rect(42,30,400,40),"星野来信 · "+(homeView?"家园":neighborView?"邻星":"巨人花园"),body);
            GUI.Label(new Rect(42,67,400,38),Objective(),small);
            if(neighborView)
                GUI.Label(new Rect(42,108,400,32),"风向 "+compass[Progress.windDirection]+" · 分水 → "+routes[Progress.waterRoute]+" · 水闸 "+(Progress.sluiceOpen?"开":"关"),small);
            var inventory=new List<string>();if(Progress.windSolved)inventory.Add(Progress.chimeHung?"风铃已挂起":"黄铜风铃");if(Progress.waterSolved)inventory.Add(Progress.seedsPlanted?"种子已种下":"春日种子");if(Progress.photoSeen)inventory.Add("旧合影");
            if(Progress.invitationsSent)inventory.Add(Progress.FriendsInvited?"邀请已送达":"等待送出的邀请");
            float controlsY=narrow?(neighborView?162:126):26;
            float controlsX=narrow?22:layoutWidth-515;
            if(!IsBlockingInput && GUI.Button(new Rect(controlsX+220,controlsY,100,40),inventoryOpen?"收起行囊":"行囊",button))inventoryOpen=!inventoryOpen;
            if(inventoryOpen && !IsBlockingInput)
            {
                float bagX=narrow?22:layoutWidth-405,bagY=controlsY+52;
                int keepsakes=(Progress.homeStep>0?1:0)+(Progress.endingRead?1:0)+(Progress.photoSeen?1:0);
                Panel(new Rect(bagX,bagY,380,120+keepsakes*48));
                GUI.Label(new Rect(bagX+20,bagY+8,340,28),"行囊 · "+(persistence?"进度自动保存":"试玩验证"),small);
                GUI.Label(new Rect(bagX+20,bagY+43,340,70),inventory.Count==0?"一封等待回音的信":string.Join(" · ",inventory),small);
                float itemY=bagY+120;
                if(Progress.homeStep>0){if(GUI.Button(new Rect(bagX+20,itemY,340,38),"重读第一封来信",button))InspectLetter();itemY+=48;}
                if(Progress.endingRead){if(GUI.Button(new Rect(bagX+20,itemY,340,38),"重读最后一封回信",button))InspectLetter(true);itemY+=48;}
                if(Progress.photoSeen && GUI.Button(new Rect(bagX+20,itemY,340,38),"查看旧合影",button))InspectPhotograph();
            }
            if(!IsBlockingInput && GUI.Button(new Rect(controlsX+335,controlsY,155,40),"从头开始",button))restartMenu=true;
            if(sound!=null && !IsBlockingInput)
            {
                if(GUI.Button(new Rect(controlsX,controlsY,100,40),sound.MusicEnabled?"音乐 开":"音乐 关",button))sound.ToggleMusic();
                if(GUI.Button(new Rect(controlsX+110,controlsY,100,40),sound.EffectsEnabled?"音效 开":"音效 关",button))sound.ToggleEffects();
            }
            if(!IsBlockingInput && nearest!=null && GUI.Button(new Rect((layoutWidth-390)/2,layoutHeight-118,390,50),"E · "+InteractionLabel(nearest),button))Interact(nearest);
            GUI.Label(new Rect(28,layoutHeight-(narrow?65:45),layoutWidth-56,narrow?60:32),
                narrow?"WASD 行走 · E 互动 · 右键环视 · Q/R 转向\nI/K 抬头低头 · 滚轮远近 · V 全景 · C 复位":"WASD 行走 · Shift 跑步 · E 互动 · 右键环视 · 滚轮远近 · Q/R 转向 · I/K 抬头低头 · V 全景 · C 复位",small);
            // Dialogues retain a centered readable canvas; HUD anchors to the viewport edges.
            GUI.matrix=Matrix4x4.TRS(new Vector3((Screen.width-1280*scale)/2,(Screen.height-720*scale)/2,0),Quaternion.identity,Vector3.one*scale);
            if(!IsBlockingInput && toast!=null && Time.unscaledTime<toastUntil)
            {Panel(new Rect(285,510,710,78));GUI.Label(new Rect(305,522,670,60),toast,small);}
            if(dialogue!=null && !photoOpen)
            {
                Panel(new Rect(275,170,730,420));GUI.Label(new Rect(305,185,670,40),speaker,title);
                GUI.Label(new Rect(305,237,670,290),dialogue,body);
                if(GUI.Button(new Rect(785,535,190,40),"继续 · Enter",button))CloseDialogue();
            }
            if(travelMenu)
            {
                Panel(new Rect(325,200,630,340));GUI.Label(new Rect(355,220,560,45),"沿着星光，寄出下一封信",title);
                if(GUI.Button(new Rect(355,290,255,60),"家园",button))Travel(StoryWorld.Home);
                if(GUI.Button(new Rect(635,290,285,60),"邻星 · 风铃与种子",button))Travel(StoryWorld.Neighbor);
                bool wasEnabled=GUI.enabled;GUI.enabled=Progress.NeighborComplete && gardenRoot!=null;
                if(GUI.Button(new Rect(355,370,565,60),"巨人花园 · 迟到的春天",button))Travel(StoryWorld.Garden);
                GUI.enabled=wasEnabled;
                if(!Progress.NeighborComplete)GUI.Label(new Rect(355,437,560,32),"先在邻星找到风铃、种子与旧合影",small);
                if(GUI.Button(new Rect(760,475,160,40),"留在这里",button))CloseDialogue();
            }
            if(restartMenu)
            {
                Panel(new Rect(360,240,560,230));GUI.Label(new Rect(390,265,500,80),"从第一封信重新开始？\n当前旅程会回到家园。",body);
                if(GUI.Button(new Rect(390,390,220,45),"继续当前旅程",button))CloseDialogue();
                if(GUI.Button(new Rect(650,390,230,45),"重新开始",button))ResetJourney();
            }
            GUI.matrix=previous;
        }
        void DrawPhotograph(float width,float height)
        {
            var backdrop=GUI.color;GUI.color=new Color(.06f,.07f,.10f,.42f);GUI.DrawTexture(new Rect(0,0,width,height),Texture2D.whiteTexture);GUI.color=backdrop;
            bool stacked=width<1000;
            float w=Mathf.Min(width-40,1080),h=Mathf.Min(height-40,stacked?910:630);
            var panel=new Rect((width-w)/2,(height-h)/2,w,h);Panel(panel);
            GUI.Label(new Rect(panel.x+28,panel.y+16,w-56,42),speaker+" · "+(photoBack?"背面":"正面"),title);
            float imageWidth=stacked?w-64:Mathf.Min(650,w*.63f);
            float imageHeight=Mathf.Min(imageWidth/1.5f,stacked?h-330:h-190);
            imageWidth=imageHeight*1.5f;
            var imageRect=new Rect(stacked?panel.center.x-imageWidth/2:panel.x+30,panel.y+76,imageWidth,imageHeight);
            var old=GUI.color;GUI.color=new Color(.91f,.84f,.68f);GUI.DrawTexture(new Rect(imageRect.x-10,imageRect.y-10,imageRect.width+20,imageRect.height+36),Texture2D.whiteTexture);GUI.color=old;
            if(!photoBack)GUI.DrawTexture(imageRect,photograph,ScaleMode.ScaleToFit);
            else
            {
                var ink=new GUIStyle(body);ink.normal.textColor=new Color(.29f,.22f,.16f);
                var inscription=new GUIStyle(ink){fontSize=32,alignment=TextAnchor.MiddleCenter};
                GUI.Label(new Rect(imageRect.x+20,imageRect.y+15,imageRect.width-40,40),"照片背面 · 褪色的字迹",ink);
                GUI.Label(new Rect(imageRect.x+25,imageRect.y+imageRect.height*.24f,imageRect.width-50,imageRect.height*.42f),"明年春天，\n老地方。",inscription);
                GUI.Label(new Rect(imageRect.x+30,imageRect.yMax-65,imageRect.width-60,42),"阿栎 · 阿葵 · 花园的主人",ink);
            }
            var caption=new GUIStyle(small){alignment=TextAnchor.MiddleCenter};caption.normal.textColor=new Color(.32f,.25f,.18f);
            GUI.Label(new Rect(imageRect.x,imageRect.yMax+3,imageRect.width,27),"两张木椅，三只茶杯，一个约定",caption);
            var textRect=stacked?new Rect(panel.x+30,imageRect.yMax+53,w-60,panel.yMax-imageRect.yMax-140):new Rect(imageRect.xMax+38,panel.y+84,panel.xMax-imageRect.xMax-68,h-180);
            GUI.Label(textRect,dialogue,body);
            if(GUI.Button(new Rect(panel.x+28,panel.yMax-68,210,44),photoBack?"看看正面 · F":"翻到背面 · F",button))FlipPhotograph();
            if(GUI.Button(new Rect(panel.xMax-238,panel.yMax-68,210,44),"收好合影 · Enter",button))CloseDialogue();
        }
        static void Panel(Rect rect)
        {
            var old=GUI.color;GUI.color=new Color(.12f,.16f,.22f,.97f);GUI.DrawTexture(rect,Texture2D.whiteTexture);GUI.color=old;
        }
        void OnApplicationPause(bool paused){if(paused && Progress!=null)Persist();}
        void OnDestroy(){if(crystal!=null)Destroy(crystal);}
    }
}
