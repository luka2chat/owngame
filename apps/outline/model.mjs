export const SECTIONS = [
  { id: 'overview', name: '项目总览', icon: '⌂', desc: '把想法，变成下一步。' },
  { id: 'rules', name: '核心玩法', icon: '✦', desc: '写清规则，也写下如何验证。' },
  { id: 'flow', name: '游戏流程', icon: '⇄', desc: '从开始到重试，每一种状态都有去处。' },
  { id: 'world', name: '世界与叙事', icon: '◎', desc: '让地点、角色与玩家的行动连起来。' },
  { id: 'levels', name: '场景与关卡', icon: '⚑', desc: '安排空间、挑战和呼吸的节奏。' },
  { id: 'assets', name: '美术与资产', icon: '▧', desc: '从喜欢的感觉，到真正能用的素材。' },
];
export const TYPES = {
  note: { name: '便签', section: 'overview', color: 'yellow', fields: {} },
  decision: { name: '待决策', section: 'overview', color: 'red', fields: { question: '要决定什么', options: '备选方案', result: '决定与原因' } },
  rule: { name: '通用规则', section: 'rules', color: 'blue', fields: { trigger: '何时触发', behavior: '规则与结果', example: '可验证的例子' } },
  state: { name: '运行状态', section: 'flow', color: 'blue', fields: { entry: '进入条件', exit: '离开条件 / 下一状态', recovery: '中断与异常恢复' } },
  place: { name: '世界设定', section: 'world', color: 'green', fields: { kind: '地点 / 阵营 / 世界规则', detail: '背景与约束' } },
  character: { name: '角色', section: 'world', color: 'yellow', fields: { role: '身份与动机', ability: '能力与限制', relation: '关系说明' } },
  story: { name: '剧情事件', section: 'world', color: 'purple', fields: { chapter: '章节与顺序', event: '事件 / 对白', branch: '分支与结局' } },
  quest: { name: '任务', section: 'world', color: 'red', fields: { giver: '谁发布', location: '在哪里发生', requires: '前置条件 / 需要什么', objective: '玩家需要做什么', completion: '何时完成', changes: '改变哪些世界状态' } },
  level: { name: '关卡', section: 'levels', color: 'green', fields: { space: '空间与路线', config: '具体配置 / 敌人数量与参数', rhythm: '挑战、奖励与节奏', completion: '完成条件' } },
  reference: { name: '参考素材', section: 'assets', color: 'purple', fields: { direction: '借鉴什么', source: '来源链接', license: '授权 / 使用限制' } },
  asset: { name: '生产资产', section: 'assets', color: 'blue', fields: { spec: '规格与验收要求', source: '文件位置或链接', license: '作者与许可' } },
};
export const STATUSES = { idea: '构思中', doing: '进行中', done: '已完成' };
export const id = () => crypto.randomUUID();
export function newProject(title = '未命名游戏') {
  return { id: id(), title, tagline: '一句话，描述你想做的游戏。', experience: '', scope: '', playable: '', cards: [], edges: [], views: {} };
}
export function newCard(type, x = 80, y = 80) {
  const t = TYPES[type];
  return { id: id(), type, section: t.section, title: `新的${t.name}`, body: '', status: 'idea', x, y, fields: Object.fromEntries(Object.keys(t.fields).map(k => [k, ''])), image: '' };
}
export function stats(project) {
  const count = type => project.cards.filter(c => c.type === type).length;
  return { characters: count('character'), quests: count('quest'), questsDone: project.cards.filter(c => c.type === 'quest' && c.status === 'done').length, decisions: project.cards.filter(c => c.type === 'decision' && c.status !== 'done').length, assets: count('asset'), assetsDone: project.cards.filter(c => c.type === 'asset' && c.status === 'done').length };
}
export function sampleWorkspace() {
  const p = newProject('雾港来信');
  p.tagline = '在海雾散去之前，把最后一封信送到灯塔。';
  p.experience = '一段 15 分钟的安静探索。观察潮汐、认识港口里的人，让每一次绕路都有小小的发现。';
  p.scope = '单人 · PC 网页优先 · 1 座港口 / 1 条主线\n先完成：移动 → 接信 → 穿过港口 → 交信\n暂不做：战斗、开放世界、多人联机';
  const add = (type, title, body, x, y, fields = {}, status = 'idea') => { const c = newCard(type, x, y); Object.assign(c, { title, body, fields: { ...c.fields, ...fields }, status }); p.cards.push(c); return c; };
  add('note', '先让一封信抵达', '第一版只回答一个问题：探索港口和送信本身，能不能让人愿意继续玩？', 60, 60, {}, 'doing');
  add('decision', '涨潮需要倒计时吗？', '想保留一点紧迫感，又不想让探索变成赶路。', 405, 100, { question: '真实倒计时，还是完成事件后涨潮？', options: 'A · 真实时间推进\nB · 交付任务推进', result: '先在灰盒里比较两种节奏。' });
  const rule = add('rule', '潮汐改变可走的路', '通用规则只描述变化方式；具体潮位、路线与时长在关卡里配置。', 60, 60, { trigger: '世界状态 tide 从 low 变为 high', behavior: '低洼路径关闭；位于路径上的玩家回到最近安全点，不丢失信件。', example: '站在码头低洼路段 → 触发涨潮 → 回到码头入口，信件仍在背包。' }, 'doing');
  add('rule', '交信是一次明确的承诺', '', 440, 140, { trigger: '携带目标信件，与收件人交谈', behavior: '收件人确认后移除信件，任务完成，只发放一次奖励。', example: '交信后再次对话：不重复扣道具，也不重复奖励。' });
  const states = ['首页', '加载', '游玩', '暂停', '结算', '异常恢复'].map((name, i) => add('state', name, '', 60 + (i % 3) * 370, 65 + Math.floor(i / 3) * 300, { entry: i === 0 ? '打开游戏 / 退出当前游玩' : '', recovery: name === '异常恢复' ? '保留任务状态 → 重试加载；无法恢复时返回首页。' : '' }));
  for (const [a,b,label] of [[0,1,'开始'],[1,2,'加载完成'],[2,3,'暂停'],[3,2,'继续'],[2,4,'交付最后一封信'],[4,1,'重试'],[3,0,'退出'],[1,5,'加载失败'],[5,1,'恢复 / 重试']]) p.edges.push({ id: id(), from: states[a].id, to: states[b].id, label });
  const place = add('place', '旧港口', '潮水退去时，旧街道会重新出现。港口以灯塔的信号钟为时间。', 60, 60, { kind: '地点', detail: '潮汐影响道路，不改变已经完成的任务。' });
  const character = add('character', '阿灯 · 守塔人', '守着一座很久没有亮起的灯塔，也在等一封迟到的信。', 435, 75, { role: '主线收件人；希望确认远航者的平安。', ability: '能辨认旧航路与信号，无法离开灯塔。', relation: '与摆渡人是旧友。' });
  const quest = add('quest', '送往灯塔的信', '让任务定义玩家如何参与故事。', 60, 395, { giver: '港口邮差', location: '旧港口 → 灯塔', requires: '拿到带蓝色火漆的信；tide = low', objective: '找到穿过旧码头的路，把信交给阿灯。', completion: '阿灯接过信件，并完成确认对白。', changes: 'letter_delivered = true\nlighthouse_lit = true\n解锁：返航的船' }, 'doing');
  const story = add('story', '第一章 · 雾里的灯', '玩家交出信之后，灯塔第一次亮起。', 435, 420, { chapter: '第一章结尾', event: '阿灯：原来，他们还记得回来的路。', branch: '主线继续；可选择追问信的来历。' });
  const level = add('level', '01 / 退潮后的旧码头', '先看见目的地，再找到绕过去的路。', 60, 60, { space: '入口 → 邮局 → 低洼栈桥 → 灯塔\n灯塔始终可见，支路放一段可选对白。', config: '潮位：low；NPC：邮差、摆渡人、阿灯\n敌人：0；交互点：3；单程约 4 分钟', rhythm: '接信（目标）→ 找路（观察）→ 摆渡人（停顿）→ 灯塔（回报）', completion: 'letter_delivered = true' }, 'doing');
  const ref = add('reference', '暖灯与安静的夜港', '借鉴已有《潮光归位》的冷暖关系，作为探索方向参考。', 60, 60, { direction: '青绿夜色 / 黄铜暖灯 / 小比例人物', source: 'owngame · 潮光归位', license: '内部已有游戏美术，仅作为本示例的参考，不代表本项目成品。' });
  ref.image = '/brand/harbor-background.png';
  const asset = add('asset', '灯塔 · 场景主物件', '让目的地在远处就能被辨认。', 455, 100, { spec: '透明背景 PNG / 1024 px\n亮灯、熄灯两种状态；验证缩到 128 px 后仍可辨认。', source: '', license: '待确认作者与许可' }, 'doing');
  for (const [a,b,label] of [[character,quest,'收件人'],[place,quest,'发生于'],[quest,story,'完成后触发'],[level,rule,'使用规则'],[level,quest,'承载任务'],[asset,character,'关联角色'],[ref,asset,'视觉方向']]) p.edges.push({ id: id(), from: a.id, to: b.id, label });
  return { version: 1, activeProjectId: p.id, projects: [p] };
}

// Shared by imports and the local server. Never trust imported markup or paths.
export function validateWorkspace(value) {
  const fail = () => { throw new Error('不是有效的构思板文件，或内容超出限制。'); };
  const str = (s, max = 20000) => typeof s === 'string' && s.length <= max;
  const finite = n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1000000;
  if (!value || value.version !== 1 || !Array.isArray(value.projects) || !value.projects.length || value.projects.length > 50) fail();
  const projectIds = new Set();
  for (const p of value.projects) {
    if (!p || !str(p.id, 100) || projectIds.has(p.id) || !str(p.title, 200) || !str(p.tagline) || !str(p.experience) || !str(p.scope) || !str(p.playable, 2000) || !Array.isArray(p.cards) || p.cards.length > 1500 || !Array.isArray(p.edges) || p.edges.length > 5000 || !p.views || Array.isArray(p.views) || typeof p.views !== 'object') fail();
    projectIds.add(p.id);
    const ids = new Set(), edgeIds = new Set();
    for (const c of p.cards) {
      if (!c || !str(c.id, 100) || ids.has(c.id) || !Object.hasOwn(TYPES, c.type) || c.section !== TYPES[c.type].section || !str(c.title, 200) || !str(c.body) || !Object.hasOwn(STATUSES, c.status) || !finite(c.x) || !finite(c.y) || !c.fields || typeof c.fields !== 'object' || Array.isArray(c.fields) || Object.values(c.fields).some(v => !str(v)) || !str(c.image, 2200000)) fail();
      if (c.image && !['/brand/harbor-background.png', '/brand/lighthouse.png'].includes(c.image) && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(c.image)) fail();
      ids.add(c.id);
    }
    for (const e of p.edges) {
      if (!e || !str(e.id, 100) || edgeIds.has(e.id) || !ids.has(e.from) || !ids.has(e.to) || e.from === e.to || !str(e.label, 200)) fail();
      edgeIds.add(e.id);
    }
    for (const [key, v] of Object.entries(p.views)) if (!SECTIONS.some(s => s.id === key) || !v || !finite(v.x) || !finite(v.y) || !finite(v.z) || v.z < 0.2 || v.z > 2) fail();
  }
  if (!projectIds.has(value.activeProjectId)) fail();
  return value;
}
