// The shipped Unity Input System already handles Web keyboard events. Keep the
// adapter outside the engine so existing story saves and runtime stay intact.
export function installTouchControls(canvas) {
  const root = document.createElement('div');
  root.id = 'touch-controls';
  root.hidden = true;
  root.innerHTML = `
    <div class="touch-tools" aria-label="视角操作">
      <button data-key="KeyV" aria-label="切换全景">全景</button>
      <button data-key="KeyC" aria-label="恢复镜头">复位</button>
      <button data-key="KeyF" aria-label="翻看信件或照片">翻面</button>
    </div>
    <div id="touch-stick" role="group" aria-label="拖动摇杆行走"><i></i><span>移动</span></div>
    <div class="touch-actions">
      <button data-key="Escape" aria-label="关闭对话或菜单">收起</button>
      <button data-key="Enter">继续</button>
      <button data-key="KeyE" class="touch-interact">互动</button>
    </div>
    <p class="touch-tip">左侧摇杆行走 · 空白处滑动看四周</p>`;
  document.body.append(root);
  const held = new Set(), timers = new Map();
  const keyInfo = code => code.startsWith('Key') ? [code.slice(3).toLowerCase(), code.charCodeAt(3)] : [code, code === 'Enter' ? 13 : 27];
  function setKey(code, down) {
    if (held.has(code) === down) return;
    const [key, keyCode] = keyInfo(code);
    canvas.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', {
      key, code, keyCode, which: keyCode, bubbles: true, cancelable: true,
    }));
    if (down) held.add(code); else held.delete(code);
  }
  function pulse(code, duration = 100) {
    clearTimeout(timers.get(code));
    setKey(code, true);
    timers.set(code, setTimeout(() => { setKey(code, false); timers.delete(code); }, duration));
  }
  const stick = root.querySelector('#touch-stick'), knob = stick.querySelector('i');
  let stickId = null, lookId = null, lastLook = null;
  function moveStick(event) {
    const box = stick.getBoundingClientRect(), radius = box.width * .34;
    let x = (event.clientX - box.left - box.width / 2) / radius;
    let y = (event.clientY - box.top - box.height / 2) / radius;
    const length = Math.hypot(x, y);
    if (length > 1) { x /= length; y /= length; }
    knob.style.transform = `translate(${x * radius}px,${y * radius}px)`;
    setKey('KeyA', x < -.28); setKey('KeyD', x > .28);
    setKey('KeyW', y < -.28); setKey('KeyS', y > .28);
  }
  function releaseStick() {
    stickId = null; knob.style.transform = '';
    for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) setKey(key, false);
  }
  function reset() {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear(); releaseStick(); lookId = null; lastLook = null;
    for (const code of [...held]) setKey(code, false);
  }
  stick.addEventListener('pointerdown', event => {
    if (stickId !== null) return;
    event.preventDefault(); stickId = event.pointerId;
    stick.setPointerCapture(stickId); canvas.focus({preventScroll: true}); moveStick(event);
  });
  stick.addEventListener('pointermove', event => {
    if (event.pointerId === stickId) { event.preventDefault(); moveStick(event); }
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) stick.addEventListener(type, event => {
    if (event.pointerId === stickId) releaseStick();
  });
  for (const button of root.querySelectorAll('button')) button.addEventListener('click', () => {
    canvas.focus({preventScroll: true}); pulse(button.dataset.key);
  });
  // Canvas keeps ordinary taps for Unity's letters, bag, and travel buttons.
  // Only a drag becomes camera input; the joystick owns a separate pointer.
  canvas.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' || lookId !== null) return;
    lookId = event.pointerId; lastLook = {x: event.clientX, y: event.clientY};
    canvas.setPointerCapture(lookId);
  });
  canvas.addEventListener('pointermove', event => {
    if (event.pointerId !== lookId || !lastLook) return;
    const x = event.clientX - lastLook.x, y = event.clientY - lastLook.y;
    if (Math.abs(x) > 1) { setKey(x > 0 ? 'KeyQ' : 'KeyR', false); pulse(x > 0 ? 'KeyR' : 'KeyQ', Math.min(140, Math.abs(x) * 8)); }
    if (Math.abs(y) > 1) { setKey(y > 0 ? 'KeyI' : 'KeyK', false); pulse(y > 0 ? 'KeyK' : 'KeyI', Math.min(140, Math.abs(y) * 8)); }
    lastLook = {x: event.clientX, y: event.clientY};
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, event => {
    if (event.pointerId !== lookId) return;
    lookId = null; lastLook = null;
    for (const key of ['KeyQ', 'KeyR', 'KeyI', 'KeyK']) { clearTimeout(timers.get(key)); timers.delete(key); setKey(key, false); }
  });
  const media = matchMedia('(any-pointer: coarse)');
  const show = () => { root.hidden = !media.matches; if (root.hidden) reset(); };
  media.addEventListener('change', show); show();
  // A touchscreen attached to a desktop also gets controls after its first tap.
  addEventListener('pointerdown', event => { if (event.pointerType === 'touch') root.hidden = false; });
  addEventListener('blur', reset); addEventListener('pagehide', reset);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
  addEventListener('resize', reset);
  return {reset};
}
