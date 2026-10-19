// owngame integration for the MIT-licensed Spaceship Shooter Game.
const SAVE_KEY = 'owngame:neon-shooter:v1';
let paused = false, bestScore = 0, savedFlight = null, incompatibleSave = false;
const byId = id => document.getElementById(id);
const isTouch = () => matchMedia('(pointer:coarse), (max-width:768px)').matches;
function flightY() { return canvas.height - (isTouch() && canvas.height > 500 ? 155 : 80); }
function clearInput() {
    for (const key of Object.keys(keys)) delete keys[key];
    mobileLeft = mobileRight = mobileFire = false;
    dragPointer = null;
}
let dragPointer = null, lastDragX = 0;
function showFlightControls() {
    byId('pause-btn').hidden = false;
    byId('credits-btn').hidden = true;
    byId('pause-screen').hidden = true;
}
function readProgress() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) { byId('best-score').textContent = '最高得分 0'; return; }
        const save = JSON.parse(raw);
        if (save.schema !== 1) { incompatibleSave = true; throw new Error('Unknown save version'); }
        bestScore = Math.max(0, Number(save.best) || 0);
        soundEnabled = save.sound !== false;
        const s = save.flight;
        // Accept only this version's finite, bounded state before offering resume.
        if (s && s.game?.running && Number.isFinite(s.width) && s.width > 0 && Number.isFinite(s.height) && s.height > 0 &&
            ['score','level','lives','health','enemySpawnTimer','enemySpawnRate','enemiesKilled','enemiesPerWave'].every(k => Number.isFinite(s.game[k])) &&
            ['x','y','speed','fireRate','fireTimer','invincible','weaponLevel'].every(k => Number.isFinite(s.player?.[k])) &&
            s.game.level >= 1 && s.game.lives > 0 &&
            ['bullets','enemyBullets','enemies','powerups'].every(k => Array.isArray(s.game[k]) && s.game[k].length < 2000 && s.game[k].every(v => Number.isFinite(v.x) && Number.isFinite(v.y)))) {
            savedFlight = s;
        }
    } catch { byId('save-warning').hidden = false; }
    byId('best-score').textContent = `最高得分 ${bestScore}`;
    byId('load-btn').hidden = !savedFlight;
    byId('sound-toggle').textContent = soundEnabled ? '🔊' : '🔇';
    byId('sound-toggle').classList.toggle('muted', !soundEnabled);
}
function saveProgress() {
    if (incompatibleSave) return; // Preserve a newer schema rather than overwrite it.
    bestScore = Math.max(bestScore, game.score);
    const flight = game.running ? {
        width:canvas.width, height:canvas.height,
        game:{...game, stars:[], particles:[], shakeTimer:0}, player:{...player}
    } : savedFlight;
    try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({schema:1, best:bestScore, sound:soundEnabled, flight}));
        byId('save-warning').hidden = true;
    } catch { byId('save-warning').hidden = false; }
}
function pauseFlight() {
    clearInput();
    if (!game.running) return;
    paused = true;
    saveProgress();
    byId('pause-screen').hidden = false;
    byId('pause-screen').querySelector('p').textContent = byId('save-warning').hidden ? '进度已保存在此设备' : '游戏已暂停，设备暂时无法保存';
}
function resumeFlight() {
    if (document.hidden) return;
    clearInput();
    initAudio();
    paused = false;
    previousFrame = 0; accumulator = 0;
    byId('pause-screen').hidden = true;
}
function scalePositions(oldW, oldH) {
    const sx = canvas.width / oldW, sy = canvas.height / oldH;
    for (const group of ['bullets','enemyBullets','enemies','powerups']) {
        for (const entity of game[group]) {
            entity.x *= sx; entity.y *= sy;
            if (entity.startX !== undefined) entity.startX *= sx;
            if (entity.amplitude !== undefined) entity.amplitude *= sx;
        }
    }
    player.x = Math.max(25, Math.min(canvas.width - 25, player.x * sx));
    player.y = flightY();
}
let measuredWidth = canvas.width, measuredHeight = canvas.height;
new ResizeObserver(() => {
    const oldW = measuredWidth, oldH = measuredHeight;
    resize();
    measuredWidth = canvas.width; measuredHeight = canvas.height;
    if (oldW !== measuredWidth || oldH !== measuredHeight) {
        scalePositions(oldW, oldH);
        initStars();
    }
}).observe(byId('viewport'));
function setupMobile(id, down, up) {
    const button = byId(id);
    button.addEventListener('pointerdown', event => {
        event.preventDefault();
        if (!game.running || paused) return;
        button.setPointerCapture(event.pointerId); initAudio(); down();
    });
    for (const name of ['pointerup','pointercancel','lostpointercapture']) button.addEventListener(name, up);
}
setupMobile('left-btn', () => {mobileLeft = true;}, () => {mobileLeft = false;});
setupMobile('right-btn', () => {mobileRight = true;}, () => {mobileRight = false;});
setupMobile('fire-btn', () => {mobileFire = true;}, () => {mobileFire = false;});
canvas.addEventListener('pointerdown', event => {
    if (!game.running || paused) return;
    event.preventDefault(); canvas.setPointerCapture(event.pointerId);
    dragPointer = event.pointerId; lastDragX = event.clientX; mobileFire = true; initAudio();
});
canvas.addEventListener('pointermove', event => {
    if (event.pointerId !== dragPointer || paused) return;
    player.x = Math.max(25, Math.min(canvas.width - 25, player.x + event.clientX - lastDragX));
    lastDragX = event.clientX;
});
for (const name of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(name, event => {
    if (event.pointerId === dragPointer) { dragPointer = null; mobileFire = false; }
});
document.addEventListener('keydown', event => {
    if (['ArrowLeft','ArrowRight','KeyA','KeyD','Space'].includes(event.code) && game.running && !paused) {
        event.preventDefault(); keys[event.code] = true;
    }
    if (event.code === 'Escape' && game.running) paused ? resumeFlight() : pauseFlight();
});
document.addEventListener('keyup', event => { keys[event.code] = false; });
byId('pause-btn').addEventListener('click', pauseFlight);
byId('resume-btn').addEventListener('click', resumeFlight);
byId('load-btn').addEventListener('click', () => {
    if (!savedFlight) return;
    game = {...game, ...savedFlight.game}; player = {...player, ...savedFlight.player};
    scalePositions(savedFlight.width, savedFlight.height);
    savedFlight = null;
    initStars(); updateHUD(); showFlightControls();
    byId('start-screen').style.display = 'none';
    byId('hud').style.display = 'flex'; byId('health-bar').style.display = 'block';
    resumeFlight();
});
// Explicit new-game/game-over actions discard only this game's active attempt.
byId('start-btn').addEventListener('click', () => {savedFlight = null; saveProgress();});
byId('restart-btn').addEventListener('click', () => {savedFlight = null; saveProgress();});
const originalGameOver = gameOver;
gameOver = function () {savedFlight = null; originalGameOver();};
byId('credits-btn').addEventListener('click', () => byId('credits').showModal());
byId('close-credits').addEventListener('click', () => byId('credits').close());
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseFlight(); });
window.addEventListener('blur', pauseFlight);
window.addEventListener('pagehide', () => { pauseFlight(); saveProgress(); });
setInterval(() => {if (game.running && !paused) saveProgress();}, 2000);
// Diagnostics expose detached snapshots only; no gameplay mutation API.
window.__owngameNeon = Object.freeze({snapshot:() => JSON.parse(JSON.stringify({
    ready:flightArtReady, running:game.running, paused, score:game.score, level:game.level, lives:game.lives, health:game.health,
    enemies:game.enemies.map(e=>({type:e.type,x:e.x,y:e.y,hp:e.hp})),
    bullets:game.bullets.length, kills:game.enemiesKilled, waveTransition:game.waveTransition,
    player:{x:player.x,y:player.y,weapon:player.weaponLevel}, width:canvas.width,height:canvas.height,
    best:bestScore, resumable:!!savedFlight, saveKey:SAVE_KEY
}))});
readProgress(); initStars(); requestAnimationFrame(loop);
for(const id of ['start-btn','load-btn','restart-btn']) byId(id).disabled=true;
flightArtPromise.then(()=>{for(const id of ['start-btn','load-btn','restart-btn']) byId(id).disabled=false;}).catch(()=>{byId('best-score').textContent='美术资源未能载入，请重新打开游戏';});
