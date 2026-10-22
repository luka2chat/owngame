import { SECTIONS, TYPES, STATUSES, id, newProject, newCard, stats, validateWorkspace } from './model.mjs';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const safeURL = value => { try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
const clone = value => structuredClone(value);
let data, revision, section = 'overview', tab = 'all', selected = null, tool = 'select', source = null;
let bindings = {}, polling = false;
let history = [], future = [], view = { x: 30, y: 25, z: .85 }, dirty = false, seq = 0, saveTimer, saving = false, conflict = false;
let dragging = null, space = false, toastTimer, imageTarget = null, searchTerm = '';
const p = () => data.projects.find(p => p.id === data.activeProjectId);
const card = () => p().cards.find(c => c.id === selected);
const sectionName = s => SECTIONS.find(v => v.id === s)?.name || s;
const sectionTabs = { overview:[['all','项目便签']], rules:[['all','规则与验证']], flow:[['all','状态与流转']], world:[['all','全部'],['world','世界'],['character','角色关系'],['story','剧情与任务']], levels:[['all','空间与节奏']], assets:[['all','全部'],['reference','参考'],['asset','生产']] };
function visibleCards() {
  return p().cards.filter(c => c.section === section && (tab === 'all' || tab === c.type || (tab === 'world' && c.type === 'place') || (tab === 'story' && ['story', 'quest'].includes(c.type))));
}
function notify(text) { $('#toast').textContent = text; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 4300); }
function checkpoint() { history.push(JSON.stringify(data)); if (history.length > 35) history.shift(); future = []; updateUndo(); }
function change(action) { if(bindings[p().id]?.available===false){notify('这个项目的文件暂不可用，请恢复目录或 NAS 连接后同步。');return;} checkpoint(); action(); modified(); }
function modified() { dirty = true; seq++; $('#save-status').textContent = conflict ? '保存冲突 · 请先导出' : '● 正在保存…'; clearTimeout(saveTimer); if (!conflict) saveTimer = setTimeout(save, 450); updateUndo(); }
async function save() {
  if (saving || !dirty || conflict) return;
  saving = true; const sent = seq;
  try {
    const response = await fetch('/api/workspace', { method:'PUT', headers:{ 'Content-Type':'application/json', 'X-Owngame-Outline':'1' }, body:JSON.stringify({ revision, workspace:data }) });
    const result = await response.json();
    if (!response.ok) { if (response.status === 409) conflict = true; throw new Error(result.error); }
    revision = result.revision; bindings = result.bindings || bindings; dirty = sent !== seq;
    if (!dirty) { $('#save-status').textContent = '● 已同步项目 JSON'; $('#save-status').classList.remove('error'); }
    renderBinding();
  } catch (e) { $('#save-status').textContent = conflict ? '保存冲突 · 请先导出' : '未保存 · 点击重试'; $('#save-status').classList.add('error'); notify(e.message || '保存失败，请导出备份。'); }
  finally { saving = false; if (dirty && !conflict && sent !== seq) saveTimer = setTimeout(save, 300); }
}
function updateUndo() { $('#undo').disabled = !history.length; $('#redo').disabled = !future.length; }
function undo(redo = false) {
  const from = redo ? future : history, to = redo ? history : future;
  if (!from.length) return;
  to.push(JSON.stringify(data)); data = JSON.parse(from.pop()); selected = null; source = null;
  if (!p()) data.activeProjectId = data.projects[0].id;
  modified(); render();
}
function renderNav() {
  $('#projects').innerHTML = data.projects.map(x => `<option value="${esc(x.id)}" ${x.id === p().id ? 'selected' : ''}>${esc(x.title)}</option>`).join('');
  $('#sections').innerHTML = SECTIONS.map(s => `<button data-section="${s.id}" class="${s.id === section ? 'active' : ''}" title="${s.name}" aria-label="${s.name}" ${s.id === section ? 'aria-current="page"' : ''}><span class="nav-icon">${s.icon}</span><span class="nav-name">${s.name}</span><span class="nav-count">${p().cards.filter(c => c.section === s.id).length}</span></button>`).join('');
  $('#project-crumb').textContent = p().title;
  renderBinding();
}
function renderBinding() {
  const b=bindings[p().id];
  $('#file-status').textContent=b ? (b.available ? `已关联 · ${b.file}` : `文件不可用（只读） · ${b.file}`) : '待创建独立项目 JSON';
  $('#file-status').title=b?.file||'';
  $('#add-card').disabled=b?.available===false; $('#edit-project').disabled=b?.available===false;
  if(b?.available===false) $('#inspector').querySelectorAll('input,textarea,select,button:not(#close-inspector)').forEach(el=>el.disabled=true);
}
function renderOverview() {
  const project = p(), s = stats(project), playable = safeURL(project.playable);
  $('#overview').hidden = section !== 'overview';
  if (section !== 'overview') return;
  $('#overview').innerHTML = `<div class="project-intro"><div class="intro-main"><span class="eyebrow">THE NEXT LITTLE ADVENTURE</span>${project.title === '雾港来信' ? '<span class="sample-tag">可编辑的虚构示例</span>' : ''}<h2>${esc(project.title)}</h2><p class="tagline">${esc(project.tagline)}</p><p class="experience">${esc(project.experience || '想让玩家感受到什么？从「编辑项目」写下目标体验。')}</p></div><div class="intro-side"><div class="scope"><h3>这一次，我们做多大？</h3><p>${esc(project.scope || '先确定一个小而完整的可玩范围。')}</p></div><div class="playable"><strong>▶ 当前可玩版本</strong>${playable ? `<a href="${esc(playable)}" target="_blank" rel="noopener noreferrer">打开试玩 ↗</a>` : '<span class="version-empty">还没放入试玩链接</span>'}</div></div></div>
  <div class="stat-row"><button class="stat" data-stat="character"><span class="stat-value">${s.characters.toString().padStart(2,'0')}</span><span class="stat-name">角色</span><span class="stat-progress">↗</span></button><button class="stat" data-stat="quest"><span class="stat-value">${s.quests.toString().padStart(2,'0')}</span><span class="stat-name">任务</span><span class="stat-progress">${s.questsDone}/${s.quests} 完成</span></button><button class="stat" data-stat="asset"><span class="stat-value">${s.assets.toString().padStart(2,'0')}</span><span class="stat-name">生产资产</span><span class="stat-progress">${s.assetsDone}/${s.assets} 完成</span></button><button class="stat" data-stat="decision"><span class="stat-value">${s.decisions.toString().padStart(2,'0')}</span><span class="stat-name">待决策</span><span class="stat-progress">↗</span></button></div>
  <div class="section-links">${SECTIONS.slice(1).map(s => `<button class="section-link" data-section="${s.id}"><span class="nav-icon">${s.icon}</span>${s.name}<span class="arrow">↗</span></button>`).join('')}</div>`;
}
function cardHTML(c) {
  const type = TYPES[c.type], edges = p().edges.filter(e => e.from === c.id || e.to === c.id).length;
  const fields = Object.entries(type.fields).filter(([k]) => c.fields[k]).slice(0, c.type === 'state' ? 1 : 2);
  return `<article class="card ${type.color} ${selected === c.id ? 'selected' : ''} ${source === c.id ? 'connect-source' : ''}" data-card="${esc(c.id)}" style="left:${c.x}px;top:${c.y}px" tabindex="0" aria-label="${esc(type.name + '：' + c.title)}"><div class="card-head"><span class="type">${type.name}</span><span class="status-dot ${c.status}">● ${STATUSES[c.status]}</span><span class="drag-handle" aria-hidden="true">⠿</span></div>${c.image ? `<img class="card-image" src="${esc(c.image)}" alt="${esc(c.title)}" draggable="false">` : ''}<h3>${esc(c.title)}</h3>${c.body ? `<p class="card-body">${esc(c.body)}</p>` : ''}${fields.map(([k,label]) => `<div class="card-field"><strong>${esc(label)}</strong>${esc(c.fields[k])}</div>`).join('')}${!c.body && !fields.length ? '<p class="card-placeholder">点击补充想法…</p>' : ''}<div class="card-footer"><span>${edges ? `${edges} 个关联` : '点击编辑'}</span><span>${c.type === 'rule' ? (c.fields.example ? '✓ 含验证例子' : '待补验证例子') : c.type === 'reference' ? '仅作参考' : '↗'}</span></div></article>`;
}
function renderCards() {
  $('#cards').innerHTML = visibleCards().map(cardHTML).join('');
  $('#card-count').textContent = `${visibleCards().length} 张卡片`;
  $('#empty').hidden = visibleCards().length > 0;
  requestAnimationFrame(renderEdges);
}
function renderEdges() {
  if(!data)return;
  const nodes = new Map([...document.querySelectorAll('[data-card]')].map(n => [n.dataset.card,n]));
  const defs = '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#7b897c"/></marker></defs>';
  $('#connections').innerHTML = defs + p().edges.filter(e => nodes.has(e.from) && nodes.has(e.to)).map(e => {
    const a = p().cards.find(c => c.id === e.from), b = p().cards.find(c => c.id === e.to), an = nodes.get(e.from), bn = nodes.get(e.to);
    const horizontal = Math.abs(b.x - a.x) > Math.abs(b.y - a.y), forward = horizontal ? b.x >= a.x : b.y >= a.y;
    const lane = p().edges.some(v=>v.from===e.to&&v.to===e.from) ? (forward?-19:19) : 0;
    let x1,y1,x2,y2,d;
    if (horizontal) { x1 = a.x + (forward ? an.offsetWidth : 0); y1 = a.y + an.offsetHeight/2+lane; x2 = b.x + (forward ? 0 : bn.offsetWidth); y2 = b.y + bn.offsetHeight/2+lane; const bend = Math.max(65,Math.abs(x2-x1)*.45)*(forward?1:-1); d = `M${x1} ${y1} C${x1+bend} ${y1},${x2-bend} ${y2},${x2} ${y2}`; }
    else { x1 = a.x+an.offsetWidth/2+lane; y1 = a.y+(forward?an.offsetHeight:0); x2 = b.x+bn.offsetWidth/2+lane; y2 = b.y+(forward?0:bn.offsetHeight); const bend = Math.max(65,Math.abs(y2-y1)*.45)*(forward?1:-1); d = `M${x1} ${y1} C${x1} ${y1+bend},${x2} ${y2-bend},${x2} ${y2}`; }
    return `<g class="edge" data-edge="${esc(e.id)}" tabindex="0" role="button" aria-label="编辑连线：${esc(e.label)}"><path d="${d}" marker-end="url(#arrow)"/><text x="${(x1+x2)/2}" y="${(y1+y2)/2-8}" text-anchor="middle">${esc(e.label || '关联')}</text></g>`;
  }).join('');
}
function render() {
  renderNav(); renderOverview();
  const s = SECTIONS.find(s => s.id === section);
  $('#board-title').textContent = s.name; $('#board-desc').textContent = s.desc; $('#section-crumb').textContent = s.name;
  $('#edit-project').hidden = section !== 'overview';
  $('#tabs').innerHTML = sectionTabs[section].map(([key,label]) => `<button data-tab="${key}" class="${tab === key ? 'active' : ''}" aria-pressed="${tab === key}">${label}</button>`).join('');
  $('#canvas-caption').textContent = section === 'overview' ? '灵感与待决策' : '自由画布';
  renderCards(); applyView(); renderInspector(); updateTool(); updateUndo(); renderSearch();
  renderBinding();
}
function switchSection(next, nextTab = 'all') {
  section = next; tab = nextTab; selected = null; source = null; searchTerm = ''; $('#search').value = '';
  view = clone(p().views[section] || { x:30,y:25,z:.85 }); render(); $('#main').scrollTop = 0;
}
function applyView() {
  $('#world').style.transform = `translate(${view.x}px,${view.y}px) scale(${view.z})`;
  $('#viewport').style.backgroundSize = `${22*view.z}px ${22*view.z}px`;
  $('#viewport').style.backgroundPosition = `${view.x}px ${view.y}px`;
  $('#zoom-reset').textContent = `${Math.round(view.z*100)}%`;
}
function saveView() { if(bindings[p().id]?.available===false)return;p().views[section] = clone(view); modified(); }
function zoom(factor, cx = $('#viewport').clientWidth/2, cy = $('#viewport').clientHeight/2) {
  const z = Math.max(.2,Math.min(2,view.z*factor));
  view.x = cx-(cx-view.x)*z/view.z; view.y = cy-(cy-view.y)*z/view.z; view.z = z; applyView(); saveView();
}
function fit() {
  const cs = visibleCards(); if (!cs.length) { view = {x:30,y:25,z:.85}; applyView(); saveView(); return; }
  const nodes = [...document.querySelectorAll('[data-card]')];
  const minX = Math.min(...cs.map(c=>c.x)), minY = Math.min(...cs.map(c=>c.y));
  const maxX = Math.max(...cs.map(c=>c.x+290)), maxY = Math.max(...cs.map(c=>c.y+(nodes.find(n=>n.dataset.card===c.id)?.offsetHeight || 240)));
  const w=$('#viewport').clientWidth,h=$('#viewport').clientHeight;
  const z=Math.max(.2,Math.min(1,(w-80)/(maxX-minX),(h-60)/(maxY-minY)));
  view={x:(w-(maxX-minX)*z)/2-minX*z,y:(h-(maxY-minY)*z)/2-minY*z,z}; applyView(); saveView();
}
function focusCard(c) {
  if (c.section !== section || !visibleCards().some(v=>v.id===c.id)) switchSection(c.section);
  selected=c.id; source=null; renderInspector();
  const w=$('#viewport').clientWidth,h=$('#viewport').clientHeight;
  const node=document.querySelector(`[data-card="${CSS.escape(c.id)}"]`);
  view.x=w/2-(c.x+145)*view.z; view.y=h/2-(c.y+(node?.offsetHeight||240)/2)*view.z;
  applyView(); saveView(); renderCards();
}
function renderInspector() {
  const c=card(); $('#inspector').hidden=!c;
  if (!c) return;
  const type=TYPES[c.type], edges=p().edges.filter(e=>e.from===c.id||e.to===c.id);
  $('#inspector').innerHTML=`<div class="inspector-top"><span>${type.name} / ${sectionName(c.section)}</span><button id="close-inspector" aria-label="关闭编辑器">×</button></div>
    <label><span class="sr-only">卡片标题</span><input class="title-input" data-prop="title" aria-label="卡片标题" value="${esc(c.title)}" maxlength="200"></label>
    <label>状态<select data-prop="status" aria-label="卡片状态">${Object.entries(STATUSES).map(([key,name])=>`<option value="${key}" ${c.status===key?'selected':''}>${name}</option>`).join('')}</select></label>
    <label>描述<textarea data-prop="body" maxlength="20000">${esc(c.body)}</textarea></label>
    ${Object.entries(type.fields).map(([key,name])=>`<label>${name}<textarea data-field="${key}" maxlength="20000" rows="3">${esc(c.fields[key]||'')}</textarea></label>`).join('')}
    <h3>图片</h3>${c.image?`<img class="image-preview" src="${esc(c.image)}" alt="${esc(c.title)}">`:''}<div class="image-actions"><button id="upload-image">${c.image?'替换图片':'＋ 添加图片'}</button>${c.image?'<button id="remove-image">移除图片</button>':''}</div>
    <h3>关联 · ${edges.length}</h3>${edges.map(e=>{const other=p().cards.find(v=>v.id===(e.from===c.id?e.to:e.from));return `<div class="relation"><button data-jump="${esc(other.id)}"><small>${sectionName(other.section)} · ${esc(e.label||'关联')} ${e.from===c.id?'→':'←'}</small>${esc(other.title)}</button><button data-edit-edge="${esc(e.id)}" aria-label="编辑关联 ${esc(e.label)}">⋯</button></div>`;}).join('')}
    <div class="relation-form"><select id="relation-target" aria-label="关联到卡片"><option value="">选择任意区域的卡片…</option>${p().cards.filter(v=>v.id!==c.id).map(v=>`<option value="${esc(v.id)}">${sectionName(v.section)} / ${esc(v.title)}</option>`).join('')}</select><input id="relation-label" placeholder="关系：例如发布、位于、触发" maxlength="200" aria-label="关联名称"><button id="add-relation" class="outline">＋ 建立关联</button></div>
    <button id="delete-card" class="danger">删除卡片（可撤销）</button>`;
  renderBinding();
}
function renderOne(c) {
  const node=document.querySelector(`[data-card="${CSS.escape(c.id)}"]`); if(node) node.outerHTML=cardHTML(c);
  renderNav(); renderOverview(); requestAnimationFrame(renderEdges);
}
function updateTool() {
  $('#select-tool').classList.toggle('active',tool==='select'); $('#connect-tool').classList.toggle('active',tool==='connect');
  $('#connect-tool').setAttribute('aria-pressed',String(tool==='connect')); $('#select-tool').setAttribute('aria-pressed',String(tool==='select'));
  $('#tool-hint').textContent=tool==='connect'?(source?'再点一张卡片，完成连线 · Esc 取消':'依次点击两张卡片连线'):'单击卡片编辑 · 拖动卡片顶部移动';
}
function openDialog(html) { $('#dialog-content').innerHTML=html; $('#dialog').showModal(); }
function closeDialog() { $('#dialog').close(); }
function addDialog(point) {
  if(bindings[p().id]?.available===false){notify('项目文件暂不可用，恢复连接后可继续编辑。');return;}
  const options=Object.entries(TYPES).filter(([key,t])=>t.section===section && (tab==='all'||tab===key||(tab==='world'&&key==='place')||(tab==='story'&&['story','quest'].includes(key))));
  openDialog(`<h2>放下一个新想法</h2><p class="subtext">${sectionName(section)} · 每张卡片只放一件事，之后再连起来。</p><div class="type-grid">${options.map(([key,t])=>`<button class="type-choice" data-new-type="${key}">${t.name}<small>＋</small></button>`).join('')}</div><div class="dialog-actions"><button data-close>取消</button></div>`);
  $('#dialog').querySelectorAll('[data-new-type]').forEach(button=>button.onclick=()=>{
    const vp=$('#viewport'),pos=point||{x:(vp.clientWidth/2-view.x)/view.z-145,y:(vp.clientHeight/2-view.y)/view.z-90};
    let c;change(()=>{c=newCard(button.dataset.newType,Math.round(pos.x),Math.round(pos.y));p().cards.push(c);}); selected=c.id;closeDialog();render();$('#inspector .title-input').focus();$('#inspector .title-input').select();
  });
}
function projectDialog(isNew=false) {
  if(isNew&&data.projects.length>=50){notify('当前最多保留 50 个项目。');return;}
  const current=isNew?newProject(''):p();
  openDialog(`<h2>${isNew?'一个新游戏，从这里开始':'编辑项目'}</h2><p class="subtext">只保留方向、范围和试玩入口。数量与进度由卡片自动汇总。</p><form id="project-form"><label>游戏名称<input name="title" required maxlength="200" value="${esc(current.title)}" placeholder="给你的游戏起个名字"></label><label>一句话定位<input name="tagline" maxlength="20000" value="${esc(current.tagline)}"></label><label>目标体验<textarea name="experience" maxlength="20000">${esc(current.experience)}</textarea></label><label>范围 · 先做什么，暂不做什么<textarea name="scope" maxlength="20000">${esc(current.scope)}</textarea></label><label>当前可玩版本链接<input name="playable" type="url" maxlength="2000" value="${esc(current.playable)}" placeholder="https://… 或 http://127.0.0.1:…"></label><p id="form-error" class="dialog-error"></p><div class="dialog-actions"><button type="button" data-close>取消</button><button class="primary" type="submit">${isNew?'创建空白项目':'保存项目'}</button></div></form>`);
  if(isNew)$('#project-form').insertAdjacentHTML('afterbegin','<label>游戏目录（相对当前工作区，可留空）<input name="directory" maxlength="1000" placeholder="例如 my-game；留空保存到本地项目目录"></label>');
  $('#project-form').onsubmit=async e=>{
    e.preventDefault();const f=Object.fromEntries(new FormData(e.target)),directory=f.directory?.trim();delete f.directory;
    if(!f.title.trim()){ $('#form-error').textContent='请填写游戏名称。';return;}if(f.playable&&!safeURL(f.playable)){ $('#form-error').textContent='试玩链接需要以 http:// 或 https:// 开头。';return;}
    if(isNew&&directory){
      if(dirty||saving){$('#form-error').textContent='请等待当前修改保存完成后再创建。';return;}
      try{const response=await fetch('/api/projects',{method:'POST',headers:{'Content-Type':'application/json','X-Owngame-Outline':'1'},body:JSON.stringify({directory,project:{...current,...f,title:f.title.trim()}})});const result=await response.json();if(!response.ok)throw Error(result.error);data=result.workspace;revision=result.revision;bindings=result.bindings;data.activeProjectId=result.selectedProjectId;history=[];future=[];closeDialog();switchSection('overview');modified();notify(result.created?'已创建项目内 game-outline.json。':'已打开该目录已有的画板。');}catch(error){$('#form-error').textContent=error.message;}return;
    }
    if(isNew){
      // Creating a persistent project cannot be undone as a card edit.
      if(bindings[p().id]?.available!==false)p().views[section]=clone(view);
      Object.assign(current,f,{title:f.title.trim()});data.projects.push(current);data.activeProjectId=current.id;history=[];future=[];modified();
    }else change(()=>Object.assign(current,f,{title:f.title.trim()}));
    closeDialog();if(isNew)switchSection('overview');else render();
  };
}
function edgeDialog(edge) {
  const from=p().cards.find(c=>c.id===edge.from),to=p().cards.find(c=>c.id===edge.to);
  openDialog(`<h2>编辑关联</h2><p class="subtext">${esc(from.title)} → ${esc(to.title)}</p><form id="edge-form"><label>关系名称<input name="label" maxlength="200" value="${esc(edge.label)}" placeholder="例如：发布任务、触发、重试"></label><div class="dialog-actions"><button type="button" id="delete-edge">删除连线</button><button type="button" data-close>取消</button><button class="primary" type="submit">保存</button></div></form>`);
  $('#edge-form').onsubmit=e=>{e.preventDefault();change(()=>edge.label=new FormData(e.target).get('label'));closeDialog();renderCards();renderInspector();};
  $('#delete-edge').onclick=()=>{change(()=>p().edges=p().edges.filter(v=>v.id!==edge.id));closeDialog();renderCards();renderInspector();};
}
function addEdge(from,to,label='关联') {
  if (from===to) {notify('请连接两张不同的卡片。');return;}
  if (p().edges.some(e=>e.from===from&&e.to===to)) {notify('这两张卡片已经有同方向的连线。');return;}
  change(()=>p().edges.push({id:id(),from,to,label}));renderCards();renderInspector();
}
function selectCard(c) {
  if(tool==='connect') { if(!source){source=c.id;renderCards();updateTool();}else{const from=source;source=null;addEdge(from,c.id);updateTool();}return; }
  selected=c.id;renderCards();renderInspector();
}
function renderSearch() {
  const q=searchTerm.trim().toLowerCase();$('#search-results').hidden=!q;if(!q)return;
  const matches=p().cards.filter(c=>[c.title,c.body,TYPES[c.type].name,...Object.values(c.fields)].join(' ').toLowerCase().includes(q));
  $('#search-results').innerHTML=matches.length?matches.map(c=>`<button class="result" data-jump="${esc(c.id)}"><strong>${esc(c.title)}</strong><small>${sectionName(c.section)} / ${TYPES[c.type].name} · ${STATUSES[c.status]}</small></button>`).join(''):'<p class="no-results">没有找到卡片。试试角色名、任务条件或规则关键词。</p>';
}
function exportFile() {
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=`owngame-构思板-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);notify('已导出所有项目，包含卡片、图片与关联。');
}

document.addEventListener('click',e=>{
  const sectionButton=e.target.closest('[data-section]');if(sectionButton){switchSection(sectionButton.dataset.section);return;}
  const tabButton=e.target.closest('[data-tab]');if(tabButton){tab=tabButton.dataset.tab;selected=null;source=null;render();return;}
  const close=e.target.closest('[data-close]');if(close){closeDialog();return;}
  const jump=e.target.closest('[data-jump]');if(jump){const c=p().cards.find(c=>c.id===jump.dataset.jump);if(c)focusCard(c);return;}
  const stat=e.target.closest('[data-stat]');if(stat){const type=stat.dataset.stat;if(type==='decision'){section='overview';tab='all';selected=null;render();const c=p().cards.find(c=>c.type==='decision'&&c.status!=='done');if(c)focusCard(c);}else switchSection(TYPES[type].section,type==='quest'?'story':type);return;}
  const edge=e.target.closest('[data-edge],[data-edit-edge]');if(edge){const v=p().edges.find(v=>v.id===(edge.dataset.edge||edge.dataset.editEdge));if(v)edgeDialog(v);return;}
});
$('#inspector').addEventListener('focusin',e=>{if(e.target.matches('[data-prop],[data-field]'))checkpoint();});
$('#inspector').addEventListener('input',e=>{const c=card();if(!c)return;if(e.target.dataset.prop)c[e.target.dataset.prop]=e.target.value;else if(e.target.dataset.field)c.fields[e.target.dataset.field]=e.target.value;else return;modified();renderOne(c);});
$('#inspector').addEventListener('click',e=>{
  const c=card();if(!c)return;
  if(e.target.id==='close-inspector'){selected=null;renderInspector();renderCards();}
  if(e.target.id==='delete-card'){change(()=>{p().cards=p().cards.filter(v=>v.id!==c.id);p().edges=p().edges.filter(v=>v.from!==c.id&&v.to!==c.id);});selected=null;render();notify('卡片已删除，可用撤销恢复。');}
  if(e.target.id==='add-relation'){const to=$('#relation-target').value;if(!to){notify('先选择要关联的卡片。');return;}addEdge(c.id,to,$('#relation-label').value.trim()||'关联');}
  if(e.target.id==='upload-image'){imageTarget=c.id;$('#image-file').click();}
  if(e.target.id==='remove-image'){change(()=>c.image='');renderCards();renderInspector();}
});
$('#image-file').onchange=async e=>{
  const file=e.target.files[0],target=imageTarget;e.target.value='';if(!file)return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>15*1024*1024){notify('请选择 15 MB 以内的 PNG、JPEG 或 WebP 图片。');return;}
  try{
    const image=await createImageBitmap(file);const scale=Math.min(1,1400/Math.max(image.width,image.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);image.close();
    const encoded=canvas.toDataURL('image/webp',.85);if(encoded.length>2200000)throw new Error('图片仍然过大，请换一张更小的图片。');
    const c=p().cards.find(v=>v.id===target);if(!c)return;change(()=>c.image=encoded);renderCards();renderInspector();notify('图片已加入，自动缩小以节省本机空间。');
  }catch(error){notify(error.message||'无法读取图片。');}
};
$('#viewport').addEventListener('pointerdown',e=>{
  if(e.button!==0&&e.button!==1)return;if(e.target.closest('[data-edge]'))return;
  const node=e.target.closest('[data-card]'),c=node&&p().cards.find(c=>c.id===node.dataset.card);
  const moveCard=c&&bindings[p().id]?.available!==false&&tool==='select'&&!space&&e.button===0&&e.target.closest('.card-head');
  if(c&&!moveCard&&e.button===0&&!space){selectCard(c);return;}
  if(c&&tool==='connect'&&!space){selectCard(c);return;}
  e.preventDefault();$('#viewport').focus({preventScroll:true});
  dragging={pointer:e.pointerId,startX:e.clientX,startY:e.clientY,x:moveCard?c.x:view.x,y:moveCard?c.y:view.y,c:moveCard?c:null,node:moveCard?node:null,moved:false};
  $('#viewport').setPointerCapture(e.pointerId);
});
$('#viewport').addEventListener('pointermove',e=>{
  if(!dragging||e.pointerId!==dragging.pointer)return;const d=dragging,dx=e.clientX-d.startX,dy=e.clientY-d.startY;
  if(!d.moved&&Math.hypot(dx,dy)<4)return;
  if(!d.moved&&d.c)checkpoint();d.moved=true;
  if(d.c){d.c.x=Math.round(d.x+dx/view.z);d.c.y=Math.round(d.y+dy/view.z);d.node.style.left=`${d.c.x}px`;d.node.style.top=`${d.c.y}px`;renderEdges();}
  else{view.x=d.x+dx;view.y=d.y+dy;applyView();}
});
function endDrag(e){if(!dragging)return;const d=dragging;dragging=null;if($('#viewport').hasPointerCapture(d.pointer))$('#viewport').releasePointerCapture(d.pointer);if(d.moved){if(d.c)modified();else saveView();}else if(d.c)selectCard(d.c);else if(e.type!=='pointercancel'){selected=null;source=null;renderCards();renderInspector();updateTool();}}
$('#viewport').addEventListener('pointerup',endDrag);$('#viewport').addEventListener('pointercancel',endDrag);
$('#viewport').addEventListener('dblclick',e=>{if(e.target.closest('[data-card],[data-edge]'))return;const r=$('#viewport').getBoundingClientRect();addDialog({x:(e.clientX-r.left-view.x)/view.z,y:(e.clientY-r.top-view.y)/view.z});});
$('#viewport').addEventListener('wheel',e=>{e.preventDefault();if(e.ctrlKey||e.metaKey){const r=$('#viewport').getBoundingClientRect();zoom(Math.exp(-e.deltaY*.008),e.clientX-r.left,e.clientY-r.top);}else{view.x-=e.deltaX;view.y-=e.deltaY;applyView();saveView();}},{passive:false});
$('#viewport').addEventListener('keydown',e=>{const c=e.target.closest('[data-card]'),edge=e.target.closest('[data-edge]');if(['Enter',' '].includes(e.key)&&(c||edge)){e.preventDefault();if(c)selectCard(p().cards.find(v=>v.id===c.dataset.card));else edgeDialog(p().edges.find(v=>v.id===edge.dataset.edge));}});
$('#select-tool').onclick=()=>{tool='select';source=null;renderCards();updateTool();};$('#connect-tool').onclick=()=>{tool=tool==='connect'?'select':'connect';source=null;renderCards();updateTool();};
$('#zoom-in').onclick=()=>zoom(1.2);$('#zoom-out').onclick=()=>zoom(1/1.2);$('#zoom-reset').onclick=()=>zoom(1/view.z);$('#fit').onclick=fit;
$('#undo').onclick=()=>undo();$('#redo').onclick=()=>undo(true);$('#add-card').onclick=()=>addDialog();$('#empty-add').onclick=()=>addDialog();$('#new-project').onclick=()=>projectDialog(true);$('#edit-project').onclick=()=>projectDialog();
$('#projects').onchange=e=>{data.activeProjectId=e.target.value;history=[];future=[];modified();switchSection('overview');};
$('#search').oninput=e=>{searchTerm=e.target.value;renderSearch();};
$('#export').onclick=exportFile;$('#import').onclick=()=>$('#import-file').click();
$('#import-file').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;if(file.size>25*1024*1024){notify('备份超过 25 MB，无法导入。');return;}
  try{const incoming=validateWorkspace(JSON.parse(await file.text()));
    // Import as new projects. Existing work is never overwritten.
    if(data.projects.length+incoming.projects.length>50)throw new Error('最多保留 50 个项目，请减少导入的项目数量。');
    for(const original of incoming.projects){const copy=clone(original);copy.id=id();copy.title=`${copy.title}（导入）`.slice(0,200);data.projects.push(copy);}data.activeProjectId=data.projects.at(-1).id;history=[];future=[];modified();switchSection('overview');notify(`已导入 ${incoming.projects.length} 个项目，原项目仍然保留。`);
  }catch(error){notify(error.message||'无法导入备份。');}
};
$('#save-status').onclick=()=>{if(conflict){notify('请先导出备份，再刷新读取其他窗口保存的内容。之后可导入备份作为新项目。');return;}if(dirty)save();};
$('#help').onclick=()=>openDialog(`<h2>让想法在画布上碰个面。</h2><div class="help-content"><p><strong>放卡片</strong>　点击「添加卡片」，或双击空白处。</p><p><strong>移动</strong>　拖卡片顶部重新摆放；拖空白处平移。触控板双指移动，⌘ / Ctrl + 滚轮缩放。</p><p><strong>连线</strong>　按 <kbd>C</kbd>，依次点两张卡片。点击线上的文字可命名或删除；跨区域关联在卡片右侧添加。</p><p><strong>快捷键</strong>　<kbd>V</kbd> 选择 · <kbd>F</kbd> 适合画布 · <kbd>/</kbd> 搜索 · <kbd>Esc</kbd> 取消 · <kbd>⌘/Ctrl Z</kbd> 撤销。选中卡片时用方向键移动，<kbd>Shift</kbd> 加速。</p><p><strong>任务与规则</strong>　任务写发布者、地点、条件、目标、完成与状态变化；通用规则写触发、结果和验证例子。关卡再放具体配置。</p><p class="storage">每个项目自动保存到页眉显示的 game-outline.json，与 CLI 共用，并保留上一次保存的 .bak。空闲时自动读取外部更新；文件或 NAS 不可用时该画板只读。导出包含图片和连线；导入始终创建副本。图片会缩到最长 1400 像素；大型原素材建议放 NAS，卡片只记路径。多窗口保存冲突时会停止覆盖，请先导出再刷新。</p></div><div class="dialog-actions"><button class="primary" data-close>开始构思</button></div>`);
document.addEventListener('keydown',e=>{
  const editing=e.target.matches('input,textarea,select,[contenteditable]');
  if(e.key==='Escape'){source=null;tool='select';if(!$('#dialog').open){selected=null;renderCards();renderInspector();updateTool();}return;}
  if($('#dialog').open)return;
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save();return;}
  if(editing)return;
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo(e.shiftKey);return;}
  if(e.key===' '){if(e.target.closest('[data-card],[data-edge]'))return;e.preventDefault();space=true;}
  if(e.key.toLowerCase()==='c')$('#connect-tool').click();
  if(e.key.toLowerCase()==='v')$('#select-tool').click();
  if(e.key.toLowerCase()==='f')fit();
  if(e.key==='/'){e.preventDefault();$('#search').focus();}
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const delta=e.shiftKey?50:10,dx=e.key==='ArrowLeft'?-delta:e.key==='ArrowRight'?delta:0,dy=e.key==='ArrowUp'?-delta:e.key==='ArrowDown'?delta:0;if(card()){change(()=>{card().x+=dx;card().y+=dy;});renderCards();}else{view.x-=dx;view.y-=dy;applyView();saveView();}}
});
document.addEventListener('keyup',e=>{if(e.key===' ')space=false;});window.addEventListener('blur',()=>space=false);
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
new ResizeObserver(()=>requestAnimationFrame(renderEdges)).observe($('#viewport'));

async function refreshFiles(manual=false){
  if(!data||polling||dirty||saving||$('#dialog').open||(!manual&&(document.hidden||document.activeElement?.matches('input,textarea,select')))){if(manual)notify('请先保存当前编辑；如有冲突，请先导出备份再刷新页面。');return;}
  polling=true;
  try{const response=await fetch('/api/workspace');if(!response.ok)throw Error('无法读取项目文件。');const result=await response.json();
    if(dirty||saving||(!manual&&document.activeElement?.matches('input,textarea,select')))return;
    if(result.revision!==revision){const active=data.activeProjectId;data=validateWorkspace(result.workspace);if(data.projects.some(p=>p.id===active))data.activeProjectId=active;revision=result.revision;bindings=result.bindings||{};history=[];future=[];conflict=false;render();$('#save-status').classList.remove('error');$('#save-status').textContent='● 已同步项目 JSON';if(manual)notify('已读取最新项目文件。');}
    else if(manual)notify('画板与项目 JSON 已一致。');
  }catch(error){if(manual)notify(error.message);}finally{polling=false;}
}
$('#refresh-files').onclick=()=>refreshFiles(true);
setInterval(()=>refreshFiles(),3000);

try {
  const response=await fetch('/api/workspace');if(!response.ok)throw new Error('无法读取本机数据，请确认本地服务仍在运行。');
  const result=await response.json();data=validateWorkspace(result.workspace);revision=result.revision;bindings=result.bindings||{};view=clone(p().views[section]||view);render();$('#save-status').textContent='● 已同步项目 JSON';
}catch(error){$('#save-status').textContent='读取失败';$('#save-status').classList.add('error');$('#add-card').disabled=true;$('#new-project').disabled=true;openDialog(`<h2>构思板暂时无法打开</h2><p class="subtext">${esc(error.message)}</p><p class="subtext">请重新启动 npm run outline，然后刷新页面。已有文件会保留。</p>`);}
