import test from 'node:test';
import assert from 'node:assert/strict';

import { Viewport, lerpViewport } from '../js/viewport.js';

const close = (a, b, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) < eps, `expected ${a} to be within ${eps} of ${b}`);

test('toScreen and toImage are inverses, rotation included', () => {
  const vp = new Viewport({ scale: 2.5, tx: 40, ty: -15, rot: 0.7 });
  const p = { x: 123.5, y: -47.25 };
  const back = vp.toImage(...Object.values(vp.toScreen(p.x, p.y)));
  close(back.x, p.x, 1e-9);
  close(back.y, p.y, 1e-9);
});

test('zoomAt keeps the point under the cursor fixed', () => {
  const vp = new Viewport({ scale: 1, tx: 0, ty: 0 });
  const anchor = { x: 320, y: 210 };
  const before = vp.toImage(anchor.x, anchor.y);
  vp.zoomAt(anchor, 3.7);
  const after = vp.toScreen(before.x, before.y);
  close(after.x, anchor.x, 1e-9);
  close(after.y, anchor.y, 1e-9);
  close(vp.scale, 3.7);
});

test('rotateAt keeps the point under the fingers fixed', () => {
  const vp = new Viewport({ scale: 1.4, tx: 30, ty: 12 });
  const anchor = { x: 150, y: 90 };
  const before = vp.toImage(anchor.x, anchor.y);
  vp.rotateAt(anchor, 0.42);
  const after = vp.toScreen(before.x, before.y);
  close(after.x, anchor.x, 1e-9);
  close(after.y, anchor.y, 1e-9);
  close(vp.rot, 0.42);
});

test('zoom is clamped to sane limits', () => {
  const vp = new Viewport({ scale: 1 });
  vp.zoomAt({ x: 0, y: 0 }, 1e6);
  assert.ok(vp.scale <= 200);
  vp.zoomAt({ x: 0, y: 0 }, 1e-9);
  assert.ok(vp.scale >= 0.02);
});

test('fitRect centres a rect and fits the tighter axis', () => {
  const vp = new Viewport();
  vp.fitRect({ x: 0, y: 0, w: 400, h: 200 }, 800, 800, 0);
  close(vp.scale, 2);
  const centre = vp.toScreen(200, 100);
  close(centre.x, 400);
  close(centre.y, 400);
});

test('fitRect on a single square zooms far in and centres it', () => {
  const vp = new Viewport();
  // One square of a 100x100 grid over a 2000x2000 photo.
  vp.fitRect({ x: 400, y: 600, w: 20, h: 20 }, 600, 600, 0);
  close(vp.scale, 30);
  const centre = vp.toScreen(410, 610);
  close(centre.x, 300);
  close(centre.y, 300);
});

test('lerpViewport starts and ends exactly on the endpoints', () => {
  const from = { scale: 1, tx: 0, ty: 0, rot: 0 };
  const to = { scale: 8, tx: -120, ty: 60, rot: 0.3 };
  const start = lerpViewport(from, to, 0);
  const end = lerpViewport(from, to, 1);
  close(start.scale, 1);
  close(end.scale, 8);
  close(end.tx, -120);
  close(end.rot, 0.3);
});
