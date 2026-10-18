using UnityEngine;

namespace StarLetters
{
    // Letter ownership comes from the existing save state; opening a keepsake never advances the journey.
    public sealed partial class CampaignDirector
    {
        public bool LetterOpen {get;private set;}
        public bool LetterIsReply {get;private set;}
        Vector2 letterScroll;
        GUIStyle letterInk,letterHeading,letterNote,letterButton;
        const string FirstLetter="你好，远方的朋友：\n\n听说你的星球上，开了第一朵花。\n请告诉我，你是怎么做到的？\n\n我已经把春天需要的一切都买齐了，\n可我的花园，还是冬天。\n\n如果你愿意，请来看看。";
        const string LastLetter="亲爱的朋友：\n\n那包邮戳模糊的种子，是我从这座花园寄出的。\n没想到，它在你的星球上，开了第一朵花。\n\n后来，我把种子锁进柜子，把邀请留到了明年。\n原来，春天早就到了你那里。\n现在，它终于带着回信回家了。\n\n下次，不必等花开齐。请来坐坐。";

        public bool InspectLetter(bool reply=false)
        {
            if(Progress==null || IsBlockingInput || Progress.homeStep==0 || (reply && !Progress.endingRead))return false;
            OpenLetter(reply);return true;
        }
        void OpenLetter(bool reply)
        {
            Say(reply?"最后一封回信":"第一封来信",reply?LastLetter:FirstLetter);
            LetterOpen=true;LetterIsReply=reply;inventoryOpen=false;letterScroll=Vector2.zero;
        }
        public void FlipLetters()
        {
            if(LetterOpen && Progress.endingRead)OpenLetter(!LetterIsReply);
        }
        void LetterStyles()
        {
            if(letterInk!=null)return;
            var ink=new Color(.27f,.23f,.20f);
            letterInk=new GUIStyle(body){fontSize=22};letterInk.normal.textColor=ink;
            letterHeading=new GUIStyle(title){fontSize=29};letterHeading.normal.textColor=ink;
            letterNote=new GUIStyle(small){fontSize=17};letterNote.normal.textColor=new Color(.49f,.39f,.29f);
            letterButton=new GUIStyle(letterInk){fontSize=19,alignment=TextAnchor.MiddleCenter};
        }
        static void LetterFill(Rect rect,Color color)
        {
            var previous=GUI.color;GUI.color=color;GUI.DrawTexture(rect,Texture2D.whiteTexture);GUI.color=previous;
        }
        bool LetterButton(Rect rect,string label)
        {
            bool hover=rect.Contains(Event.current.mousePosition);
            LetterFill(rect,hover?new Color(.89f,.81f,.66f):new Color(.94f,.88f,.75f));
            return GUI.Button(rect,label,letterButton);
        }
        void DrawLetter(float width,float height)
        {
            LetterStyles();
            LetterFill(new Rect(0,0,width,height),new Color(.12f,.10f,.19f,.63f));
            float w=Mathf.Min(760,width-48),h=Mathf.Min(690,height-40);
            var paper=new Rect((width-w)/2,(height-h)/2,w,h);
            LetterFill(new Rect(paper.x+9,paper.y+12,w,h),new Color(.07f,.05f,.08f,.24f));
            LetterFill(paper,new Color(.98f,.94f,.84f));
            LetterFill(new Rect(paper.x+12,paper.y+12,w-24,2),new Color(.78f,.66f,.47f,.55f));
            GUI.Label(new Rect(paper.x+40,paper.y+27,w-190,42),speaker,letterHeading);
            GUI.Label(new Rect(paper.x+42,paper.y+70,w-180,30),LetterIsReply?"来自 · 春天回来的花园":"寄信人 · 一位等待春天的园丁",letterNote);
            var stamp=new Rect(paper.xMax-115,paper.y+31,72,63);
            LetterFill(stamp,new Color(.66f,.33f,.30f,.13f));
            var stampInk=new GUIStyle(letterNote){alignment=TextAnchor.MiddleCenter,fontSize=20};
            stampInk.normal.textColor=new Color(.58f,.28f,.25f);
            GUI.Label(stamp,"星野\n邮局",stampInk);
            LetterFill(new Rect(paper.x+40,paper.y+112,w-80,1),new Color(.65f,.53f,.36f,.3f));

            var viewport=new Rect(paper.x+40,paper.y+129,w-80,h-212);
            float textWidth=viewport.width-24;
            float textHeight=letterInk.CalcHeight(new GUIContent(dialogue),textWidth);
            string signature=LetterIsReply?"你的朋友 · 一位重新开始的园丁":"一位等待春天的园丁";
            float signatureHeight=letterInk.CalcHeight(new GUIContent(signature),textWidth);
            string note=LetterIsReply?"信封里，夹着一片刚落下的花瓣。\n落款里，终于写下了‘朋友’。":"信封背面，画着两张空椅子。\n没有名字，也没有日期。";
            float noteWidth=LetterIsReply?textWidth:textWidth-147;
            float noteHeight=Mathf.Max(49,letterNote.CalcHeight(new GUIContent(note),noteWidth));
            float contentHeight=textHeight+signatureHeight+47+noteHeight;
            letterScroll=GUI.BeginScrollView(viewport,letterScroll,new Rect(0,0,textWidth,contentHeight));
            GUI.Label(new Rect(0,0,textWidth,textHeight),dialogue,letterInk);
            var signatureInk=new GUIStyle(letterInk){alignment=TextAnchor.UpperRight};
            GUI.Label(new Rect(0,textHeight+20,textWidth,signatureHeight),signature,signatureInk);
            float noteY=textHeight+signatureHeight+47;
            GUI.Label(new Rect(0,noteY,noteWidth,noteHeight),note,letterNote);
            if(!LetterIsReply)
                DrawLetterChairs(new Vector2(textWidth-128,noteY+4));
            GUI.EndScrollView();
            if(contentHeight>viewport.height && letterScroll.y<contentHeight-viewport.height-5)
                GUI.Label(new Rect(paper.x+40,paper.yMax-78,w-80,25),"向下滚动，读完这封信",letterNote);
            if(Progress.endingRead && LetterButton(new Rect(paper.x+40,paper.yMax-56,270,38),LetterIsReply?"翻看来信 · F":"翻看回信 · F"))FlipLetters();
            if(LetterButton(new Rect(paper.xMax-270,paper.yMax-56,230,38),"收好信件 · Enter"))CloseDialogue();
        }
        static void DrawLetterChairs(Vector2 origin)
        {
            var ink=new Color(.52f,.39f,.24f,.68f);
            for(int i=0;i<2;i++)
            {
                float x=origin.x+i*65,y=origin.y;
                LetterFill(new Rect(x,y,3,49),ink);LetterFill(new Rect(x+37,y+3,3,46),ink);
                LetterFill(new Rect(x,y+3,40,3),ink);LetterFill(new Rect(x,y+24,40,4),ink);
                LetterFill(new Rect(x+10,y+5,2,19),ink);LetterFill(new Rect(x+26,y+5,2,19),ink);
                LetterFill(new Rect(x+2,y+30,35,2),ink);
            }
        }
    }
}
