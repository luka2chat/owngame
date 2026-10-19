// owngame adaptation, GPL-3.0-or-later. UI text only; save identifiers remain upstream-compatible.
const phrases={
'harvest':'收获','wooden hut':'木屋','wooden huts':'木屋','Total Buildings:':'建筑总数：','Autosaved':'已自动存档','Saved game':'已保存','Game Saved':'存档已保存','skin':'毛皮','herb':'草药',
'CivClicker':'小小文明','Settings':'设置','FAQ & Instructions':'玩法与原作说明','Game Updates Log':'原作更新记录',
'Population:':'人口：','Zombies:':'亡灵：','Happiness:':'幸福度：','Blissful':'欣欣向荣','Happy':'快乐','Content':'满意','Unhappy':'不满','Angry':'愤怒',
'Build more housing to grow your civilization':'建造更多住房，容纳更多居民','Recruit new citizens as':'招募新居民，职业为','Idle Citizens':'空闲居民','Farmers':'农夫','Woodcutters':'伐木工','Miners':'矿工','Recruit Citizens':'招募居民','Events':'城邦记事','Skins:':'毛皮：','Leather:':'皮革：','Herbs:':'草药：','Piety:':'信仰：','Ore:':'矿石：','Metal:':'金属：','Gold:':'黄金：',
'Buildings':'建筑','Upgrades':'科技','Deity':'信仰','Conquest':'征服','Achievements':'成就','Stats':'统计','Trade':'交易','Wonders':'奇观','Build Altar':'建造祭坛','Gather':'采集','Chop':'伐木','Cut':'伐木','Mine':'采矿',
'Naming':'命名','Rename Civilisation':'更改城邦名','Rename Yourself':'更改领主名','Rename Current Deity':'更改神明名','Display':'显示','Text Size':'字号','Use Custom Quantities':'自定义数量','Number Delimiters':'数字千位分隔','Dark Mode':'深色模式','Text Shadows':'文字阴影','Show Notes':'显示说明','Worksafe Mode':'简洁模式','Use Icons':'显示图标','Save & Load Controls':'存档管理','Manual Save':'立即保存','Autosave':'自动存档','Reset Game':'开启新文明','Delete Save File':'删除本游戏存档','Save game data:':'存档数据：','Export':'导出','Select All':'全选','Import':'导入','Custom Quantity':'自定义数量','Total Land:':'总土地：','Free Land:':'空闲土地：','Unfilled Graves:':'空墓穴：','Start Building Wonder':'开始建造奇观','Rename':'更名','Speed Wonder':'加速奇观','Cancel':'取消',
'food':'粮食','wood':'木材','stone':'石料','skins':'毛皮','herbs':'草药','ore':'矿石','leather':'皮革','metal':'金属','piety':'信仰','gold':'黄金','devotion':'虔诚','free land':'空闲土地','tent':'帐篷','tents':'帐篷','hut':'茅屋','huts':'茅屋','cottage':'小屋','cottages':'小屋','house':'住宅','houses':'住宅','mansion':'宅邸','mansions':'宅邸','barn':'粮仓','barns':'粮仓','wood stockpile':'木材堆场','wood stockpiles':'木材堆场','stone stockpile':'石料堆场','stone stockpiles':'石料堆场','tannery':'制革坊','tanneries':'制革坊','smithy':'铁匠铺','smithies':'铁匠铺','apothecary':'药房','apothecaries':'药房','temple':'神殿','temples':'神殿','barracks':'兵营','stable':'马厩','stables':'马厩','mill':'磨坊','mills':'磨坊','graveyard':'墓园','graveyards':'墓园','fortification':'城防','fortifications':'城防',
'unemployed':'空闲居民','unemployed worker':'空闲居民','unemployed workers':'空闲居民','idle citizen':'空闲居民','idle citizens':'空闲居民','farmer':'农夫','farmers':'农夫','woodcutter':'伐木工','woodcutters':'伐木工','miner':'矿工','miners':'矿工','tanner':'制革工','tanners':'制革工','blacksmith':'铁匠','blacksmiths':'铁匠','healer':'医师','healers':'医师','cleric':'祭司','clerics':'祭司','soldier':'士兵','soldiers':'士兵','cavalry':'骑兵','labourer':'工匠','labourers':'工匠','siege engine':'攻城车','siege engines':'攻城车','corpse':'遗骸','corpses':'遗骸',
'Thorp':'聚落','Hamlet':'小村','Village':'村庄','Small Town':'小镇','Large Town':'城镇','Small City':'小城','Large City':'城市','Metropolis':'都会','Small Nation':'小国','Nation':'王国','Large Nation':'大国','Empire':'帝国',
'Skinning':'剥皮术','Harvesting':'草药采集','Prospecting':'勘探','Domestication':'驯养','Ploughshares':'犁耕','Irrigation':'灌溉','Butchering':'屠宰','Gardening':'园艺','Extraction':'开采','Flensing':'精细剥皮','Macerating':'浸渍','Crop Rotation':'轮作','Selective Breeding':'选择育种','Fertilisers':'肥料','Masonry':'砌筑','Construction':'建筑学','Architecture':'建筑艺术','Tenements':'公寓','Civil Service':'公共管理','Administration':'行政管理','Granaries':'谷仓管理','Palisade':'栅栏','Weaponry':'武器制造','Shields':'盾牌','Horseback Riding':'骑术','Wheel':'车轮','Writing':'文字','Currency':'货币','Commerce':'商业','Stay':'留驻','Mathematics':'数学','Aesthetics':'美学','Secrets':'秘术','Feudalism':'封建制度','Guilds':'行会','Serfs':'佃农',
'Allows larger population':'提高人口上限','Store more food':'储存更多粮食','Store more wood':'储存更多木材','Store more stone':'储存更多石料','Max':'最多','max:':'上限：','per second':'每秒','Original 1.0 Game':'初代原作','Source':'源码','Resetting allows you to':'重开文明可以','gain another deity':'获得另一位神明','build another Wonder':'建造另一座奇观',
'Save':'保存','Load':'读取','OK':'确定','Food':'粮食','Wood':'木材','Stone':'石料'
}
const lookup=new Map(Object.entries(phrases).map(([a,b])=>[a.toLowerCase(),b]));
export function zh(value){
 if(typeof value!=='string')return value;
 const trim=value.trim(),direct=lookup.get(trim.toLowerCase());if(direct)return value.replace(trim,direct);
 const colon=trim.match(/^(.+?)(\s*:\s*)$/);if(colon&&lookup.has(colon[1].toLowerCase()))return lookup.get(colon[1].toLowerCase())+'：';
 return value.replace(/max:/gi,'上限：').replace(/max pop\./gi,'人口上限').replace(/\bfor\b/gi,'需要').replace(/\b(food|wood|stone|skins|herbs|ore|leather|metal|piety|gold)\b/gi,m=>lookup.get(m.toLowerCase()));
}
let scheduled=false;const observer=new MutationObserver(()=>{if(!scheduled){scheduled=true;requestAnimationFrame(translate)}});
function translate(){
 scheduled=false;observer.disconnect();
 const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;while(n=walker.nextNode()){
  if(n.parentElement?.closest('script,style,textarea,#civName,#rulerName,#credits-dialog'))continue;
  const changed=zh(n.nodeValue);if(changed!==n.nodeValue)n.nodeValue=changed;
 }
 document.querySelectorAll('[title],input[type=button]').forEach(el=>{if(el.title)el.title=zh(el.title);if(el.tagName==='INPUT')el.value=zh(el.value)});
 observer.observe(document.body,{subtree:true,childList:true,characterData:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',translate);else translate();
