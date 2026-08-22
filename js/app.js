import { Viewport, lerpViewport, clamp } from './viewport.js';
import {
  cellAt,
  cellRect,
  cellSelection,
  clampSelection,
  clampedCellAt,
  drawDimMask,
  drawGrid,
  drawLabels,
  drawSelection,
  normaliseSelection,
  selectionLabel,
  selectionRect,
  squareColumns,
} from './grid.js';
import { attachGestures } from './gestures.js';
import { Camera } from './camera.js';
import { clearPhoto, loadPhoto, loadSettings, savePhoto, saveSettings } from './storage.js';

const $ = (id) => document.getElementById(id);

const el = {
  body: document.body,
  stage: $('stage'),
  canvas: $('canvas'),
  video: $('video'),
  empty: $('empty'),
  toast: $('toast'),
  hudCell: $('hudCell'),
  hudZoom: $('hudZoom'),
  panel: $('panel'),
  panelToggle: $('panelToggle'),
  filePick: $('filePick'),
  cameraPick: $('cameraPick'),
  modeGrid: $('modeGrid'),
  modeOverlay: $('modeOverlay'),
  rows: $('rows'),
  cols: $('cols'),
  presets: $('presets'),
  squareCells: $('squareCells'),
  lineWidth: $('lineWidth'),
  lineWidthVal: $('lineWidthVal'),
  gridOpacity: $('gridOpacity'),
  gridOpacityVal: $('gridOpacityVal'),
  gridColor: $('gridColor'),
  labelStyle: $('labelStyle'),
  showGrid: $('showGrid'),
  dimOutside: $('dimOutside'),
  selReadout: $('selReadout'),
  zoomSel: $('zoomSel'),
  selUp: $('selUp'),
  selDown: $('selDown'),
  selLeft: $('selLeft'),
  selRight: $('selRight'),
  clearSel: $('clearSel'),
  saveCell: $('saveCell'),
  camStart: $('camStart'),
  camSwitch: $('camSwitch'),
  imgOpacity: $('imgOpacity'),
  imgOpacityVal: $('imgOpacityVal'),
  ovGridOpacity: $('ovGridOpacity'),
  ovGridOpacityVal: $('ovGridOpacityVal'),
  ovShowPhoto: $('ovShowPhoto'),
  ovShowGrid: $('ovShowGrid'),
  ovSelectionOnly: $('ovSelectionOnly'),
  ovLock: $('ovLock'),
  ovFit: $('ovFit'),
  ovFreeze: $('ovFreeze'),
  savePng: $('savePng'),
  saveShot: $('saveShot'),
  toolPan: $('toolPan'),
  toolSelect: $('toolSelect'),
  zoomIn: $('zoomIn'),
  zoomOut: $('zoomOut'),
  fit: $('fit'),
  prevCell: $('prevCell'),
  nextCell: $('nextCell'),
};

const ctx = el.canvas.getContext('2d');
const camera = new Camera(el.video);

const DEFAULTS = {
  mode: 'grid',
  tool: 'pan',
  grid: {
    rows: 4,
    cols: 4,
    lineWidth: 1.5,
    opacity: 0.85,
    color: '#ff3b6b',
    labelStyle: 'alpha',
    show: true,
  },
  dimOutside: false,
  selection: null,
  view: null,        // {scale, tx, ty, rot} — restored per photo
  overlay: {
    photoOpacity: 0.45,
    gridOpacity: 0.9,
    showPhoto: true,
    showGrid: true,
    selectionOnly: false,
    locked: false,
    facing: 'environment',
    view: null,
  },
};

const state = merge(DEFAULTS, loadSettings() || {});
state.mode = 'grid'; // the camera needs a fresh user gesture on every load

// Where the photo was left last time. Snapshotted before anything can
// overwrite it, and consumed once the stored photo has been decoded.
const savedViews = { view: state.view, overlayView: state.overlay.view };

/** @type {ImageBitmap|HTMLImageElement|null} */
let image = null;
let imageSize = { w: 0, h: 0 };
let imageName = 'photo';

const view = new Viewport({ scale: 1, tx: 0, ty: 0, rot: 0 });
const overlayView = new Viewport({ scale: 1, tx: 0, ty: 0, rot: 0 });

let dpr = 1;
let renderQueued = false;
let animation = null;
let dragMode = null;      // 'pan' | 'select' | null
let selectAnchor = null;

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

const activeView = () => (state.mode === 'overlay' ? overlayView : view);

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    render();
  });
}

function resizeCanvas() {
  dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const rect = el.stage.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width * dpr));
  const h = Math.max(1, Math.round(rect.height * dpr));
  if (el.canvas.width !== w || el.canvas.height !== h) {
    el.canvas.width = w;
    el.canvas.height = h;
  }
  return { w: rect.width, h: rect.height };
}

function render() {
  const size = resizeCanvas();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, el.canvas.width, el.canvas.height);

  if (state.mode === 'grid') {
    ctx.fillStyle = '#0a0d12';
    ctx.fillRect(0, 0, el.canvas.width, el.canvas.height);
  }
  if (!image) {
    updateHud();
    return;
  }

  const vp = activeView();
  const ov = state.overlay;
  const overlayMode = state.mode === 'overlay';
  const sel = state.selection;
  const selRect = sel ? selectionRect(state.grid, imageSize, sel) : null;

  const m = vp.matrix();
  ctx.setTransform(m.a * dpr, m.b * dpr, m.c * dpr, m.d * dpr, m.e * dpr, m.f * dpr);

  const clipped = overlayMode && ov.selectionOnly && selRect;
  if (clipped) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(selRect.x, selRect.y, selRect.w, selRect.h);
    ctx.clip();
  }

  const photoAlpha = overlayMode ? (ov.showPhoto ? ov.photoOpacity : 0) : 1;
  if (photoAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = photoAlpha;
    ctx.drawImage(image, 0, 0, imageSize.w, imageSize.h);
    ctx.restore();
  }

  if (!overlayMode && state.dimOutside && selRect) {
    drawDimMask(ctx, { size: imageSize, rect: selRect });
  }

  const showGrid = overlayMode ? ov.showGrid : state.grid.show;
  if (showGrid) {
    drawGrid(ctx, {
      grid: state.grid,
      size: imageSize,
      scale: vp.scale,
      opacity: overlayMode ? ov.gridOpacity : state.grid.opacity,
    });
  }

  if (selRect && (!overlayMode || !ov.selectionOnly)) {
    drawSelection(ctx, { rect: selRect, scale: vp.scale });
  }

  if (clipped) ctx.restore();

  if (showGrid && !clipped) {
    drawLabels(ctx, {
      grid: state.grid,
      size: imageSize,
      viewport: vp,
      style: state.grid.labelStyle,
      color: state.grid.color,
      canvas: el.canvas,
      dpr,
      alpha: overlayMode ? ov.gridOpacity : 1,
    });
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  updateHud(size);
}

function updateHud() {
  el.hudZoom.textContent = image ? `${Math.round(activeView().scale * 100)}%` : '—';
  const sel = state.selection;
  el.hudCell.textContent = sel ? selectionLabel(sel, state.grid.labelStyle) : '—';
  el.selReadout.textContent = sel
    ? `${selectionLabel(sel, state.grid.labelStyle)} · ${sel.c1 - sel.c0 + 1}×${sel.r1 - sel.r0 + 1} square${
        (sel.c1 - sel.c0 + 1) * (sel.r1 - sel.r0 + 1) > 1 ? 's' : ''
      }`
    : 'No square selected';
}

/* ------------------------------------------------------------------ *
 * View helpers
 * ------------------------------------------------------------------ */

function stageSize() {
  const r = el.stage.getBoundingClientRect();
  return { w: r.width, h: r.height };
}

function animateTo(vp, target, ms = 260) {
  const from = vp.toJSON();
  const to = { rot: from.rot, ...target };
  if (ms <= 0 || prefersReducedMotion()) {
    vp.set(to);
    persist();
    scheduleRender();
    return;
  }
  const startTime = performance.now();
  animation?.cancel();
  let cancelled = false;
  animation = { cancel: () => (cancelled = true) };
  const step = (now) => {
    if (cancelled) return;
    const t = Math.min(1, (now - startTime) / ms);
    vp.set(lerpViewport(from, to, t));
    scheduleRender();
    if (t < 1) requestAnimationFrame(step);
    else {
      animation = null;
      persist();
    }
  };
  requestAnimationFrame(step);
}

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function fitImage({ animate = false } = {}) {
  if (!image) return;
  const s = stageSize();
  const target = new Viewport({ rot: activeView().rot })
    .fitRect({ x: 0, y: 0, w: imageSize.w, h: imageSize.h }, s.w, s.h, 20)
    .toJSON();
  animateTo(activeView(), target, animate ? 260 : 0);
}

function zoomToRect(rect, { animate = true, padding = 26 } = {}) {
  const s = stageSize();
  const vp = activeView();
  const target = new Viewport({ rot: vp.rot }).fitRect(rect, s.w, s.h, padding).toJSON();
  animateTo(vp, target, animate ? 300 : 0);
}

function zoomToSelection(opts) {
  if (!image || !state.selection) {
    toast('Tap a square first');
    return;
  }
  zoomToRect(selectionRect(state.grid, imageSize, state.selection), opts);
}

/** Pan (without changing zoom) so a rect is on screen. */
function ensureVisible(rect) {
  const vp = activeView();
  const s = stageSize();
  const corners = [
    vp.toScreen(rect.x, rect.y),
    vp.toScreen(rect.x + rect.w, rect.y),
    vp.toScreen(rect.x, rect.y + rect.h),
    vp.toScreen(rect.x + rect.w, rect.y + rect.h),
  ];
  const minX = Math.min(...corners.map((p) => p.x));
  const maxX = Math.max(...corners.map((p) => p.x));
  const minY = Math.min(...corners.map((p) => p.y));
  const maxY = Math.max(...corners.map((p) => p.y));
  const pad = 24;

  // Too big to fit at this zoom? Re-frame it instead of nudging.
  if (maxX - minX > s.w || maxY - minY > s.h) {
    zoomToRect(rect);
    return;
  }
  let dx = 0, dy = 0;
  if (minX < pad) dx = pad - minX;
  else if (maxX > s.w - pad) dx = s.w - pad - maxX;
  if (minY < pad) dy = pad - minY;
  else if (maxY > s.h - pad) dy = s.h - pad - maxY;
  if (!dx && !dy) return;
  animateTo(vp, { scale: vp.scale, tx: vp.tx + dx, ty: vp.ty + dy }, 180);
}

function zoomBy(factor) {
  if (!image) return;
  const s = stageSize();
  const vp = activeView();
  const next = vp.clone().zoomAt({ x: s.w / 2, y: s.h / 2 }, factor).toJSON();
  animateTo(vp, next, 140);
}

/** Jump to an absolute zoom level, anchored on the middle of the screen. */
function zoomToScale(scale) {
  if (!image) return;
  zoomBy(scale / activeView().scale);
}

/* ------------------------------------------------------------------ *
 * Selection
 * ------------------------------------------------------------------ */

function setSelection(sel, { persistNow = true } = {}) {
  state.selection = sel ? clampSelection(sel, state.grid) : null;
  updateHud();
  scheduleRender();
  if (persistNow) persist();
}

function selectAtScreen(point, { extend = false } = {}) {
  if (!image) return null;
  const p = activeView().toImage(point.x, point.y);
  const cell = cellAt(state.grid, imageSize, p.x, p.y);
  if (!cell) return null;
  setSelection(extend && selectAnchor ? normaliseSelection(selectAnchor, cell) : cellSelection(cell));
  return cell;
}

function moveSelection(dRow, dCol, extend = false) {
  if (!image) return;
  const g = state.grid;
  const sel = state.selection || { r0: 0, c0: 0, r1: 0, c1: 0 };
  let next;
  if (extend) {
    next = { ...sel, r1: sel.r1 + dRow, c1: sel.c1 + dCol };
    if (next.r1 < next.r0 || next.c1 < next.c0) {
      next = { r0: Math.min(next.r0, next.r1), c0: Math.min(next.c0, next.c1), r1: Math.max(next.r0, next.r1), c1: Math.max(next.c0, next.c1) };
    }
  } else {
    const row = clamp(sel.r0 + dRow, 0, g.rows - 1);
    const col = clamp(sel.c0 + dCol, 0, g.cols - 1);
    next = { r0: row, c0: col, r1: row, c1: col };
  }
  setSelection(next);
  ensureVisible(selectionRect(state.grid, imageSize, state.selection));
}

/** Walk the grid in reading order and zoom to the next/previous square. */
function stepCell(delta) {
  if (!image) return;
  const g = state.grid;
  const total = g.rows * g.cols;
  const sel = state.selection;
  const current = sel ? sel.r0 * g.cols + sel.c0 : delta > 0 ? -1 : 0;
  const index = ((current + delta) % total + total) % total;
  setSelection(cellSelection({ row: Math.floor(index / g.cols), col: index % g.cols }));
  zoomToSelection();
}

/* ------------------------------------------------------------------ *
 * Photo loading
 * ------------------------------------------------------------------ */

async function decode(blob) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch {
      /* Safari < 17 and friends: fall through to an <img> */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

/** Returns false if the blob could not be decoded; the caller reports why. */
async function setPhoto(blob, name, { restoreView = null } = {}) {
  let bitmap;
  try {
    bitmap = await decode(blob);
  } catch {
    return false;
  }
  if (image?.close) image.close();
  image = bitmap;
  imageSize = { w: bitmap.width || bitmap.naturalWidth, h: bitmap.height || bitmap.naturalHeight };
  imageName = (name || 'photo').replace(/\.[^.]+$/, '');
  el.empty.hidden = true;

  if (restoreView?.view) {
    view.set(restoreView.view);
    if (restoreView.overlayView) overlayView.set(restoreView.overlayView);
  } else {
    fitImage();
    overlayView.set(view.toJSON());
    setSelection(null, { persistNow: false });
  }
  persist();
  scheduleRender();
  return true;
}

// Apple's default camera format. Safari decodes it; Chrome and Firefox do not.
const HEIC = /(^|\.)hei[cf]$/i;
const isHeic = (file) => HEIC.test(file.name?.split('.').pop() || '') || /hei[cf]/i.test(file.type || '');

async function openFile(file) {
  if (!file) return;
  if (!file.type.startsWith('image/') && !isHeic(file)) {
    toast('Please choose an image file');
    return;
  }
  if (!(await setPhoto(file, file.name))) {
    toast(
      isHeic(file)
        ? 'This browser cannot read Apple HEIC photos. Open it in Safari, or drag the photo out of the Photos app instead — macOS converts it on the way.'
        : 'That file could not be read as an image',
    );
    return;
  }
  const stored = await savePhoto(file, file.name);
  toast(stored ? 'Photo loaded — it will still be here next time' : 'Photo loaded');
}

/* ------------------------------------------------------------------ *
 * Gestures
 * ------------------------------------------------------------------ */

function overlayLocked() {
  return state.mode === 'overlay' && state.overlay.locked;
}

attachGestures(el.canvas, {
  dragStart({ point, event }) {
    if (!image) return;
    animation?.cancel();
    const selecting =
      state.mode === 'grid' && (state.tool === 'select' || event.shiftKey);
    if (selecting) {
      dragMode = 'select';
      const p = view.toImage(point.x, point.y);
      selectAnchor = clampedCellAt(state.grid, imageSize, p.x, p.y);
      setSelection(cellSelection(selectAnchor), { persistNow: false });
    } else {
      dragMode = overlayLocked() ? null : 'pan';
    }
  },

  drag({ point, dx, dy }) {
    if (!image || !dragMode) return;
    if (dragMode === 'pan') {
      activeView().panBy(dx, dy);
      scheduleRender();
      return;
    }
    const p = view.toImage(point.x, point.y);
    const cell = clampedCellAt(state.grid, imageSize, p.x, p.y);
    setSelection(normaliseSelection(selectAnchor, cell), { persistNow: false });
  },

  dragEnd({ moved }) {
    if (dragMode && moved) persist();
    dragMode = null;
    selectAnchor = null;
  },

  pinch({ center, scale, rotation, dx, dy }) {
    if (!image || overlayLocked()) return;
    animation?.cancel();
    const vp = activeView();
    vp.panBy(dx, dy);
    vp.zoomAt(center, scale);
    // Rotation is for aligning the overlay to paper; the grid view stays square.
    if (state.mode === 'overlay') vp.rotateAt(center, rotation);
    scheduleRender();
  },

  pinchEnd() {
    persist();
  },

  wheel({ point, factor }) {
    if (!image || overlayLocked()) return;
    animation?.cancel();
    activeView().zoomAt(point, factor);
    scheduleRender();
    persist();
  },

  tap({ point }) {
    if (!image || state.mode !== 'grid') return;
    if (!selectAtScreen(point)) setSelection(null);
  },

  doubleTap({ point }) {
    if (!image) return;
    if (state.mode === 'overlay') {
      if (!overlayLocked()) fitImage({ animate: true });
      return;
    }
    const p = view.toImage(point.x, point.y);
    const cell = cellAt(state.grid, imageSize, p.x, p.y);
    if (!cell) {
      fitImage({ animate: true });
      return;
    }
    setSelection(cellSelection(cell));
    zoomToRect(cellRect(state.grid, imageSize, cell.row, cell.col));
  },
});

/* ------------------------------------------------------------------ *
 * UI wiring
 * ------------------------------------------------------------------ */

function setMode(mode) {
  state.mode = mode;
  el.body.dataset.mode = mode;
  el.modeGrid.classList.toggle('is-active', mode === 'grid');
  el.modeOverlay.classList.toggle('is-active', mode === 'overlay');
  if (mode === 'overlay') {
    // The overlay keeps its own alignment. First time in (or after a new
    // photo) start from a sensible full-photo fit rather than inheriting
    // whatever deep zoom the grid view happened to be at.
    if (!state.overlay.view && image) fitImage();
    if (!camera.running) startCamera();
  } else {
    camera.stop();
    el.camStart.textContent = 'Start camera';
  }
  persist();
  scheduleRender();
}

async function startCamera() {
  try {
    el.camStart.disabled = true;
    await camera.start(state.overlay.facing);
    el.camStart.textContent = 'Restart camera';
    el.ovFreeze.textContent = 'Freeze frame';
  } catch (err) {
    toast(cameraError(err));
  } finally {
    el.camStart.disabled = false;
  }
}

function cameraError(err) {
  switch (err?.name) {
    case 'NotAllowedError':
      return 'Camera permission was denied — allow it in your browser settings.';
    case 'NotFoundError':
      return 'No camera found on this device.';
    case 'NotReadableError':
      return 'The camera is busy in another app.';
    default:
      return err?.message || 'Could not start the camera.';
  }
}

function setTool(tool) {
  state.tool = tool;
  el.body.dataset.tool = tool;
  el.toolPan.classList.toggle('is-active', tool === 'pan');
  el.toolSelect.classList.toggle('is-active', tool === 'select');
  persist();
}

function setGrid(patch, { refit = false } = {}) {
  Object.assign(state.grid, patch);
  state.grid.rows = clamp(Math.round(state.grid.rows) || 1, 1, 500);
  state.grid.cols = clamp(Math.round(state.grid.cols) || 1, 1, 500);
  if (state.selection) state.selection = clampSelection(state.selection, state.grid);
  syncGridInputs();
  markPreset();
  updateHud();
  persist();
  scheduleRender();
  if (refit && state.selection) zoomToSelection();
}

function syncGridInputs() {
  el.rows.value = state.grid.rows;
  el.cols.value = state.grid.cols;
  el.lineWidth.value = state.grid.lineWidth;
  el.lineWidthVal.textContent = state.grid.lineWidth;
  el.gridOpacity.value = Math.round(state.grid.opacity * 100);
  el.gridOpacityVal.textContent = Math.round(state.grid.opacity * 100);
  el.gridColor.value = state.grid.color;
  el.labelStyle.value = state.grid.labelStyle;
  el.showGrid.checked = state.grid.show;
  el.dimOutside.checked = state.dimOutside;
}

function syncOverlayInputs() {
  const ov = state.overlay;
  el.imgOpacity.value = Math.round(ov.photoOpacity * 100);
  el.imgOpacityVal.textContent = Math.round(ov.photoOpacity * 100);
  el.ovGridOpacity.value = Math.round(ov.gridOpacity * 100);
  el.ovGridOpacityVal.textContent = Math.round(ov.gridOpacity * 100);
  el.ovShowPhoto.checked = ov.showPhoto;
  el.ovShowGrid.checked = ov.showGrid;
  el.ovSelectionOnly.checked = ov.selectionOnly;
  el.ovLock.checked = ov.locked;
}

function markPreset() {
  const key = `${state.grid.cols}x${state.grid.rows}`;
  for (const chip of el.presets.querySelectorAll('.chip')) {
    chip.classList.toggle('is-active', chip.dataset.preset === key);
  }
}

el.filePick.addEventListener('change', (e) => {
  openFile(e.target.files?.[0]);
  e.target.value = '';
});
el.cameraPick.addEventListener('change', (e) => {
  openFile(e.target.files?.[0]);
  e.target.value = '';
});

// Dragging a photo out of the macOS Photos app lands here: it is the simplest
// route to a photo that has no ordinary file on disk.
let dragDepth = 0;
el.stage.addEventListener('dragenter', () => {
  if (++dragDepth === 1) el.stage.classList.add('is-dropping');
});
el.stage.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) {
    dragDepth = 0;
    el.stage.classList.remove('is-dropping');
  }
});
el.stage.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});
el.stage.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  el.stage.classList.remove('is-dropping');
  const file = e.dataTransfer?.files?.[0];
  if (file) openFile(file);
});
window.addEventListener('paste', (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
  if (item) openFile(item.getAsFile());
});

el.modeGrid.addEventListener('click', () => setMode('grid'));
el.modeOverlay.addEventListener('click', () => setMode('overlay'));
el.toolPan.addEventListener('click', () => setTool('pan'));
el.toolSelect.addEventListener('click', () => setTool('select'));

el.panelToggle.addEventListener('click', () => {
  const open = el.body.classList.toggle('panel-open');
  el.panelToggle.setAttribute('aria-expanded', String(open));
});
el.stage.addEventListener('pointerdown', () => el.body.classList.remove('panel-open'));

el.rows.addEventListener('input', () => setGrid({ rows: Number(el.rows.value) }));
el.cols.addEventListener('input', () => setGrid({ cols: Number(el.cols.value) }));
el.presets.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  const [cols, rows] = chip.dataset.preset.split('x').map(Number);
  setGrid({ rows, cols });
});
el.squareCells.addEventListener('click', () => {
  if (!image) {
    toast('Open a photo first');
    return;
  }
  setGrid({ cols: squareColumns(state.grid.rows, imageSize) });
  toast(`${state.grid.cols} × ${state.grid.rows} — square cells`);
});
el.lineWidth.addEventListener('input', () => setGrid({ lineWidth: Number(el.lineWidth.value) }));
el.gridOpacity.addEventListener('input', () => setGrid({ opacity: Number(el.gridOpacity.value) / 100 }));
el.gridColor.addEventListener('input', () => setGrid({ color: el.gridColor.value }));
el.labelStyle.addEventListener('change', () => setGrid({ labelStyle: el.labelStyle.value }));
el.showGrid.addEventListener('change', () => setGrid({ show: el.showGrid.checked }));
el.dimOutside.addEventListener('change', () => {
  state.dimOutside = el.dimOutside.checked;
  persist();
  scheduleRender();
});

el.zoomSel.addEventListener('click', () => zoomToSelection());
el.clearSel.addEventListener('click', () => setSelection(null));
el.selUp.addEventListener('click', () => moveSelection(-1, 0));
el.selDown.addEventListener('click', () => moveSelection(1, 0));
el.selLeft.addEventListener('click', () => moveSelection(0, -1));
el.selRight.addEventListener('click', () => moveSelection(0, 1));
el.prevCell.addEventListener('click', () => stepCell(-1));
el.nextCell.addEventListener('click', () => stepCell(1));
el.zoomIn.addEventListener('click', () => zoomBy(1.4));
el.zoomOut.addEventListener('click', () => zoomBy(1 / 1.4));
el.fit.addEventListener('click', () => fitImage({ animate: true }));

el.camStart.addEventListener('click', startCamera);
el.camSwitch.addEventListener('click', async () => {
  try {
    await camera.switch();
    state.overlay.facing = camera.facing;
    persist();
  } catch (err) {
    toast(cameraError(err));
  }
});
el.ovFreeze.addEventListener('click', () => {
  if (!camera.running) {
    toast('Start the camera first');
    return;
  }
  el.ovFreeze.textContent = camera.toggleFreeze() ? 'Unfreeze' : 'Freeze frame';
});
el.ovFit.addEventListener('click', () => fitImage({ animate: true }));
el.imgOpacity.addEventListener('input', () => setOverlay({ photoOpacity: Number(el.imgOpacity.value) / 100 }));
el.ovGridOpacity.addEventListener('input', () => setOverlay({ gridOpacity: Number(el.ovGridOpacity.value) / 100 }));
el.ovShowPhoto.addEventListener('change', () => setOverlay({ showPhoto: el.ovShowPhoto.checked }));
el.ovShowGrid.addEventListener('change', () => setOverlay({ showGrid: el.ovShowGrid.checked }));
el.ovSelectionOnly.addEventListener('change', () => setOverlay({ selectionOnly: el.ovSelectionOnly.checked }));
el.ovLock.addEventListener('change', () => setOverlay({ locked: el.ovLock.checked }));

function setOverlay(patch) {
  Object.assign(state.overlay, patch);
  syncOverlayInputs();
  persist();
  scheduleRender();
}

el.savePng.addEventListener('click', exportGriddedPhoto);
el.saveCell.addEventListener('click', exportSelection);
el.saveShot.addEventListener('click', exportScreenshot);

document.addEventListener('keydown', (e) => {
  const tag = e.target?.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  const shift = e.shiftKey;
  switch (e.key) {
    case 'ArrowUp': moveSelection(-1, 0, shift); break;
    case 'ArrowDown': moveSelection(1, 0, shift); break;
    case 'ArrowLeft': moveSelection(0, -1, shift); break;
    case 'ArrowRight': moveSelection(0, 1, shift); break;
    case 'Enter': zoomToSelection(); break;
    case 'Escape': setSelection(null); break;
    case '+': case '=': zoomBy(1.4); break;
    case '-': case '_': zoomBy(1 / 1.4); break;
    case '0': fitImage({ animate: true }); break;
    case '1': zoomToScale(1); break;
    case 'g': case 'G': setGrid({ show: !state.grid.show }); break;
    case 's': case 'S': setTool(state.tool === 'pan' ? 'select' : 'pan'); break;
    case 'o': case 'O': setMode(state.mode === 'grid' ? 'overlay' : 'grid'); break;
    default: return;
  }
  e.preventDefault();
});

/* ------------------------------------------------------------------ *
 * Export
 * ------------------------------------------------------------------ */

/** Grid lines scale with the output so exports look like what is on screen. */
function exportLineScale(width) {
  return Math.min(1, 1400 / Math.max(1, width));
}

function exportGriddedPhoto() {
  if (!image) {
    toast('Open a photo first');
    return;
  }
  const c = document.createElement('canvas');
  c.width = imageSize.w;
  c.height = imageSize.h;
  const g = c.getContext('2d');
  g.drawImage(image, 0, 0);
  drawGrid(g, {
    grid: state.grid,
    size: imageSize,
    scale: exportLineScale(imageSize.w),
    opacity: state.grid.opacity,
  });
  download(c, `${imageName}-${state.grid.cols}x${state.grid.rows}-grid.png`);
}

function exportSelection() {
  if (!image || !state.selection) {
    toast('Select one or more squares first');
    return;
  }
  const rect = selectionRect(state.grid, imageSize, state.selection);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(rect.w));
  c.height = Math.max(1, Math.round(rect.h));
  const g = c.getContext('2d');
  g.drawImage(image, rect.x, rect.y, rect.w, rect.h, 0, 0, c.width, c.height);

  // Redraw the part of the grid that falls inside the crop.
  g.save();
  g.translate(-rect.x, -rect.y);
  drawGrid(g, {
    grid: state.grid,
    size: imageSize,
    scale: exportLineScale(c.width),
    opacity: state.grid.opacity,
  });
  g.restore();

  const name = selectionLabel(state.selection, state.grid.labelStyle).replace(/[^\w-]+/g, '');
  download(c, `${imageName}-${name}.png`);
}

function exportScreenshot() {
  const c = document.createElement('canvas');
  c.width = el.canvas.width;
  c.height = el.canvas.height;
  const g = c.getContext('2d');
  g.fillStyle = '#0a0d12';
  g.fillRect(0, 0, c.width, c.height);
  if (state.mode === 'overlay' && camera.running && el.video.videoWidth) {
    drawVideoCover(g, el.video, c.width, c.height);
  }
  g.drawImage(el.canvas, 0, 0);
  download(c, `${imageName}-view.png`);
}

/** Mimic CSS object-fit: cover for the video frame. */
function drawVideoCover(g, video, w, h) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const scale = Math.max(w / vw, h / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  g.drawImage(video, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function download(canvas, filename) {
  canvas.toBlob((blob) => {
    if (!blob) {
      toast('Could not create the image');
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    toast(`Saved ${filename}`);
  }, 'image/png');
}

/* ------------------------------------------------------------------ *
 * Misc
 * ------------------------------------------------------------------ */

let toastTimer = null;
function toast(message) {
  el.toast.textContent = message;
  el.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('show'), 2600);
}

function persist() {
  saveSettings({
    ...state,
    view: view.toJSON(),
    overlay: { ...state.overlay, view: overlayView.toJSON() },
  });
}

function merge(base, patch) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(patch || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base?.[k] && typeof base[k] === 'object') {
      out[k] = merge(base[k], v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

new ResizeObserver(() => scheduleRender()).observe(el.stage);
window.addEventListener('orientationchange', () => setTimeout(scheduleRender, 250));
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.mode === 'overlay') camera.stop();
});

async function boot() {
  syncGridInputs();
  syncOverlayInputs();
  markPreset();
  setTool(state.tool);
  el.body.dataset.mode = state.mode;
  if (!Camera.supported) {
    el.camStart.disabled = true;
    el.camSwitch.disabled = true;
  }

  const stored = await loadPhoto();
  if (stored && (await setPhoto(stored.blob, stored.name, { restoreView: savedViews }))) {
    if (state.selection) setSelection(state.selection, { persistNow: false });
  } else {
    el.empty.hidden = false;
  }
  scheduleRender();
}

boot();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// Handy for debugging from the console.
window.imageGraph = { state, view, overlayView, camera, clearPhoto, render };
