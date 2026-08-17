/**
 * Pointer gestures for the stage: drag, two-finger pinch/rotate, wheel zoom,
 * tap and double-tap. Works the same for mouse, trackpad, pen and touch.
 *
 * The controller stays deliberately dumb — it reports what the fingers did and
 * lets the app decide whether that means "pan the view", "drag a selection" or
 * "nudge the overlay into alignment".
 */

const TAP_SLOP = 10;      // px of movement still counted as a tap
const TAP_TIME = 350;     // ms
const DOUBLE_TAP_TIME = 320;
const DOUBLE_TAP_SLOP = 28;

export function attachGestures(el, handlers = {}) {
  const pointers = new Map();
  let gesture = null;   // 'drag' | 'pinch'
  let start = null;     // for tap detection
  let lastTap = null;
  let pinch = null;

  const localPoint = (e) => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const emit = (name, payload) => handlers[name]?.(payload);

  function onPointerDown(e) {
    if (e.button != null && e.button > 1) return;
    el.setPointerCapture?.(e.pointerId);
    const p = localPoint(e);
    pointers.set(e.pointerId, p);

    if (pointers.size === 1) {
      start = { ...p, time: performance.now(), moved: false, id: e.pointerId };
      gesture = 'drag';
      emit('dragStart', { point: p, event: e });
    } else if (pointers.size === 2) {
      // Second finger down: the drag becomes a pinch.
      if (gesture === 'drag') emit('dragEnd', { point: p, cancelled: true, event: e });
      gesture = 'pinch';
      pinch = snapshot(pointers);
      start = null;
    }
  }

  function onPointerMove(e) {
    if (!pointers.has(e.pointerId)) return;
    const p = localPoint(e);
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, p);

    if (gesture === 'pinch' && pointers.size >= 2) {
      const now = snapshot(pointers);
      emit('pinch', {
        center: now.center,
        scale: now.dist / (pinch.dist || 1),
        rotation: angleDelta(pinch.angle, now.angle),
        dx: now.center.x - pinch.center.x,
        dy: now.center.y - pinch.center.y,
      });
      pinch = now;
      return;
    }

    if (gesture === 'drag' && start && e.pointerId === start.id) {
      if (!start.moved && Math.hypot(p.x - start.x, p.y - start.y) > TAP_SLOP) start.moved = true;
      emit('drag', {
        point: p,
        origin: { x: start.x, y: start.y },
        dx: p.x - prev.x,
        dy: p.y - prev.y,
        moved: start.moved,
        event: e,
      });
    }
  }

  function onPointerUp(e) {
    if (!pointers.has(e.pointerId)) return;
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    el.releasePointerCapture?.(e.pointerId);

    if (gesture === 'pinch') {
      if (pointers.size < 2) {
        emit('pinchEnd', {});
        if (pointers.size === 1) {
          // One finger still down — resume dragging from where it is now.
          const [id, pt] = [...pointers.entries()][0];
          start = { ...pt, time: performance.now(), moved: true, id };
          gesture = 'drag';
          emit('dragStart', { point: pt, event: e });
        } else {
          gesture = null;
        }
      }
      return;
    }

    if (gesture === 'drag' && start && e.pointerId === start.id) {
      const elapsed = performance.now() - start.time;
      const isTap = !start.moved && elapsed < TAP_TIME;
      emit('dragEnd', { point: p, origin: { x: start.x, y: start.y }, moved: start.moved, event: e });

      if (isTap) {
        const now = performance.now();
        const isDouble =
          lastTap &&
          now - lastTap.time < DOUBLE_TAP_TIME &&
          Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < DOUBLE_TAP_SLOP;
        if (isDouble) {
          lastTap = null;
          emit('doubleTap', { point: p, event: e });
        } else {
          lastTap = { ...p, time: now };
          emit('tap', { point: p, event: e });
        }
      }
      start = null;
      gesture = pointers.size ? gesture : null;
    }
  }

  function onWheel(e) {
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const point = { x: e.clientX - r.left, y: e.clientY - r.top };
    // Trackpad pinch arrives as ctrl+wheel; both paths zoom, at different rates.
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const delta = e.deltaY * unit * (e.ctrlKey ? 0.012 : 0.0035);
    emit('wheel', { point, factor: Math.exp(-delta), event: e });
  }

  el.addEventListener('pointerdown', onPointerDown);
  el.addEventListener('pointermove', onPointerMove);
  el.addEventListener('pointerup', onPointerUp);
  el.addEventListener('pointercancel', onPointerUp);
  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('contextmenu', (e) => e.preventDefault());

  return () => {
    el.removeEventListener('pointerdown', onPointerDown);
    el.removeEventListener('pointermove', onPointerMove);
    el.removeEventListener('pointerup', onPointerUp);
    el.removeEventListener('pointercancel', onPointerUp);
    el.removeEventListener('wheel', onWheel);
  };
}

function snapshot(pointers) {
  const [a, b] = [...pointers.values()];
  return {
    center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    dist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
    angle: Math.atan2(b.y - a.y, b.x - a.x),
  };
}

/** Shortest signed angle from a to b. */
function angleDelta(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
