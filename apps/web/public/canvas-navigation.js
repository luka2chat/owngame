// View-only camera movement. Never change card positions or saved draft data.
export function attachCanvasNavigation(viewport, board) {
  let x = 0,
    y = 0,
    gesture;
  const controller = new AbortController();
  const options = { signal: controller.signal };
  function paint() {
    board.style.translate = `${x}px ${y}px`;
  }
  function normalizeScroll() {
    x -= viewport.scrollLeft;
    y -= viewport.scrollTop;
    viewport.scrollTo(0, 0);
  }
  function move(dx, dy) {
    normalizeScroll();
    x += dx;
    y += dy;
    paint();
  }
  function finish(event) {
    if (!gesture || event.pointerId !== gesture.id) return;
    gesture = undefined;
    viewport.classList.remove("is-panning");
    if (viewport.hasPointerCapture(event.pointerId))
      viewport.releasePointerCapture(event.pointerId);
  }
  viewport.addEventListener(
    "pointerdown",
    (event) => {
      if (gesture || !event.isPrimary || ![0, 1].includes(event.button)) return;
      // Primary-button card actions keep their selection and step-drag behavior.
      if (
        event.button === 0 &&
        event.target.closest(
          "button, a, input, textarea, select, .workflow-card, .blueprint-card",
        )
      )
        return;
      event.preventDefault();
      normalizeScroll();
      paint();
      gesture = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        x,
        y,
      };
      viewport.setPointerCapture(event.pointerId);
      viewport.classList.add("is-panning");
      viewport.focus({ preventScroll: true });
    },
    options,
  );
  viewport.addEventListener(
    "pointermove",
    (event) => {
      if (!gesture || gesture.id !== event.pointerId) return;
      event.preventDefault();
      x = gesture.x + event.clientX - gesture.startX;
      y = gesture.y + event.clientY - gesture.startY;
      paint();
    },
    options,
  );
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    viewport.addEventListener(type, finish, options);
  viewport.addEventListener(
    "auxclick",
    (event) => {
      if (event.button === 1) event.preventDefault();
    },
    options,
  );
  viewport.addEventListener(
    "wheel",
    (event) => {
      if (event.ctrlKey || event.metaKey) return; // Preserve browser zoom gestures.
      event.preventDefault();
      const unit =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? viewport.clientHeight
            : 1;
      move(
        -(event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX) * unit,
        -(event.shiftKey && !event.deltaX ? 0 : event.deltaY) * unit,
      );
    },
    { ...options, passive: false },
  );
  viewport.addEventListener(
    "keydown",
    (event) => {
      if (event.target !== viewport) return;
      const delta = {
        ArrowLeft: [80, 0],
        ArrowRight: [-80, 0],
        ArrowUp: [0, 80],
        ArrowDown: [0, -80],
      }[event.key];
      if (!delta) return;
      event.preventDefault();
      move(...delta);
    },
    options,
  );
  return {
    reset() {
      x = 0;
      y = 0;
      viewport.scrollTo(0, 0);
      paint();
    },
    dispose() {
      controller.abort();
      if (gesture && viewport.hasPointerCapture(gesture.id))
        viewport.releasePointerCapture(gesture.id);
      gesture = undefined;
      viewport.classList.remove("is-panning");
    },
  };
}
