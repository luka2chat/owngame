import { initial, position, play, undo, restore, serialize } from './rules.js';
import { theme } from './theme.js';
// Generated per project; keep this stable when updating an existing game.
import { gameId } from './project.js';
const key = `owngame:${gameId}:v1`;
const $ = id => document.getElementById(id);
document.title = theme.title; $('title').textContent = theme.title;
document.documentElement.style.setProperty('--accent', theme.accent);
document.documentElement.style.setProperty('--night', theme.night);
let state = initial(), writesAllowed = true;
function notice(text) { $('storage-notice').hidden = false; $('storage-notice').textContent = text; }
try { const raw = localStorage.getItem(key); if (raw) { try { state = restore(raw); } catch { writesAllowed = false; notice('旧存档无法读取，已保留原数据。本局暂不保存。'); } } }
catch { writesAllowed = false; notice('浏览器暂不允许保存，本局仍可游玩。'); }
function save() { if (!writesAllowed) return; try { localStorage.setItem(key, serialize(state)); } catch { notice('本次进度未能保存，刷新可能丢失进度。'); } }
const buttons = Array.from({length:9}, (_, cell) => {
  const b = document.createElement('button'); b.type = 'button'; b.dataset.cell = cell;
  b.addEventListener('click', () => { const next = play(state, cell); if (next === state) return; state = next; save(); render(); });
  $('board').appendChild(b); return b;
});
function render() {
  const p = position(state), names = { star:'星旅人', moon:'守月人' };
  buttons.forEach((b, i) => {
    const value = p.board[i]; b.textContent = value === 'star' ? '✦' : value === 'moon' ? '☾' : '';
    b.className = `${value ? 'filled '+value : ''} ${p.line.includes(i) ? 'winning' : ''}`;
    b.disabled = Boolean(value || p.winner || p.draw);
    b.setAttribute('aria-label', `第${Math.floor(i/3)+1}行第${i%3+1}列，${value ? names[value] : '空格'}`);
  });
  $('star-player').classList.toggle('active', p.turn === 'star' && !p.winner && !p.draw);
  $('moon-player').classList.toggle('active', p.turn === 'moon' && !p.winner && !p.draw);
  $('status').textContent = p.winner ? `${names[p.winner]}连成星河，获胜！` : p.draw ? '星月相映，这一局平手。' : `${names[p.turn]}落子${state.moves.length ? '' : ' · 由你点亮第一颗星'}`;
  $('undo').disabled = state.moves.length === 0;
}
$('undo').addEventListener('click', () => { state = undo(state); save(); render(); });
$('restart').addEventListener('click', () => { if (state.moves.length && !position(state).winner && !position(state).draw && !confirm('重新开始这一局？')) return; state = initial(); save(); render(); });
render();
// Read-only diagnostics. Actual playtests must use the visible controls.
Object.defineProperty(window, '__owngameGame', { value:Object.freeze({ snapshot:() => ({ ...position(state), moves:[...state.moves], gameId, ready:true }) }) });
const canvas = $('sky'), ctx = canvas.getContext('2d');
function sky() {
  const w = innerWidth, h = innerHeight, ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = w * ratio; canvas.height = h * ratio; ctx.setTransform(ratio,0,0,ratio,0,0);
  for (let i=0;i<90;i++) { const x = ((i*7919+1237)%10000)/10000*w, y=((i*3571+971)%10000)/10000*h; ctx.fillStyle=`rgba(205,224,231,${.12+(i%5)*.09})`; ctx.beginPath();ctx.arc(x,y,i%7===0?1.3:.65,0,Math.PI*2);ctx.fill(); }
  ctx.strokeStyle='#bca77a18';ctx.lineWidth=1;ctx.beginPath();ctx.arc(w/2,h*.43,Math.min(w*.46,285),0,Math.PI*2);ctx.stroke();
}
sky();addEventListener('resize',sky);
