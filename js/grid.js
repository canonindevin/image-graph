/**
 * Grid geometry and drawing. All grid maths happens in image pixel space, so a
 * square keeps its identity no matter how the view is panned, zoomed, rotated
 * or re-opened days later.
 */

/** Rect (in image space) of a single cell. */
export function cellRect(grid, size, row, col) {
  const cw = size.w / grid.cols;
  const ch = size.h / grid.rows;
  return { x: col * cw, y: row * ch, w: cw, h: ch };
}

/** Rect (in image space) spanning a normalised selection. */
export function selectionRect(grid, size, sel) {
  const cw = size.w / grid.cols;
  const ch = size.h / grid.rows;
  return {
    x: sel.c0 * cw,
    y: sel.r0 * ch,
    w: (sel.c1 - sel.c0 + 1) * cw,
    h: (sel.r1 - sel.r0 + 1) * ch,
  };
}

/** Which cell contains an image-space point? Null when outside the photo. */
export function cellAt(grid, size, x, y) {
  if (x < 0 || y < 0 || x >= size.w || y >= size.h) return null;
  return {
    row: Math.min(grid.rows - 1, Math.floor((y / size.h) * grid.rows)),
    col: Math.min(grid.cols - 1, Math.floor((x / size.w) * grid.cols)),
  };
}

/** Nearest cell to an image-space point, clamped to the photo. */
export function clampedCellAt(grid, size, x, y) {
  const col = clampInt(Math.floor((x / size.w) * grid.cols), 0, grid.cols - 1);
  const row = clampInt(Math.floor((y / size.h) * grid.rows), 0, grid.rows - 1);
  return { row, col };
}

export function normaliseSelection(a, b) {
  return {
    r0: Math.min(a.row, b.row),
    c0: Math.min(a.col, b.col),
    r1: Math.max(a.row, b.row),
    c1: Math.max(a.col, b.col),
  };
}

export function cellSelection(cell) {
  return { r0: cell.row, c0: cell.col, r1: cell.row, c1: cell.col };
}

export function clampSelection(sel, grid) {
  return {
    r0: clampInt(sel.r0, 0, grid.rows - 1),
    c0: clampInt(sel.c0, 0, grid.cols - 1),
    r1: clampInt(sel.r1, 0, grid.rows - 1),
    c1: clampInt(sel.c1, 0, grid.cols - 1),
  };
}

/** Spreadsheet-style column name: A, B … Z, AA, AB … */
export function columnName(index) {
  let n = index, out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

export function cellLabel(row, col, style) {
  if (style === 'numeric') return `${col + 1}-${row + 1}`;
  return `${columnName(col)}${row + 1}`;
}

export function selectionLabel(sel, style) {
  const a = cellLabel(sel.r0, sel.c0, style);
  if (sel.r0 === sel.r1 && sel.c0 === sel.c1) return a;
  return `${a} → ${cellLabel(sel.r1, sel.c1, style)}`;
}

/** Columns that make cells (close to) square for a given row count. */
export function squareColumns(rows, size) {
  const aspect = size.w / size.h;
  return clampInt(Math.round(rows * aspect), 1, 500);
}

function clampInt(v, lo, hi) {
  v = Math.round(v);
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Draw the grid.
 *
 * The canvas transform is expected to already map image space -> device
 * pixels; `scale` is that combined scale so line widths stay constant on
 * screen regardless of zoom.
 */
export function drawGrid(ctx, { grid, size, scale, opacity = 1 }) {
  if (grid.rows < 1 || grid.cols < 1) return;
  const px = grid.lineWidth / scale;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = grid.color;
  ctx.lineWidth = px;
  ctx.beginPath();

  for (let c = 1; c < grid.cols; c++) {
    const x = (c / grid.cols) * size.w;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size.h);
  }
  for (let r = 1; r < grid.rows; r++) {
    const y = (r / grid.rows) * size.h;
    ctx.moveTo(0, y);
    ctx.lineTo(size.w, y);
  }
  ctx.stroke();

  // Outer border, a touch heavier so the photo edge reads clearly.
  ctx.lineWidth = px * 1.6;
  ctx.strokeRect(px / 2, px / 2, size.w - px, size.h - px);
  ctx.restore();
}

/** Translucent wash over everything outside the selection. */
export function drawDimMask(ctx, { size, rect }) {
  ctx.save();
  ctx.fillStyle = 'rgba(6, 9, 13, 0.62)';
  ctx.beginPath();
  ctx.rect(0, 0, size.w, size.h);
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.fill('evenodd');
  ctx.restore();
}

/** Highlight the selected squares. */
export function drawSelection(ctx, { rect, scale, color = '#4cc2ff' }) {
  ctx.save();
  ctx.fillStyle = hexToRgba(color, 0.16);
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5 / scale;
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}

/**
 * Cell labels, drawn in screen space so they stay upright and legible while
 * the photo underneath is rotated or deeply zoomed. Labels are skipped when
 * cells get too small to hold them (a 100x100 grid zoomed out, say).
 */
export function drawLabels(ctx, { grid, size, viewport, style, color, canvas, dpr, alpha = 1 }) {
  if (style === 'none' || alpha <= 0) return;
  const cellW = (size.w / grid.cols) * viewport.scale;
  const cellH = (size.h / grid.rows) * viewport.scale;
  if (Math.min(cellW, cellH) < 34) return;

  const fontSize = Math.max(10, Math.min(16, Math.min(cellW, cellH) * 0.2));
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  const pad = Math.max(3, fontSize * 0.3);
  const viewW = canvas.width / dpr;
  const viewH = canvas.height / dpr;

  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const p = viewport.toScreen((c * size.w) / grid.cols, (r * size.h) / grid.rows);
      if (p.x < -cellW || p.y < -cellH || p.x > viewW || p.y > viewH) continue;
      const text = cellLabel(r, c, style);
      const w = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(6, 9, 13, 0.55)';
      ctx.fillRect(p.x + pad - 2, p.y + pad - 1, w + 6, fontSize + 4);
      ctx.fillStyle = color;
      ctx.fillText(text, p.x + pad + 1, p.y + pad + 1);
    }
  }
  ctx.restore();
}

export function hexToRgba(hex, alpha) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return `rgba(76, 194, 255, ${alpha})`;
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
