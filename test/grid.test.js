import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cellAt,
  cellLabel,
  cellRect,
  clampSelection,
  clampedCellAt,
  columnName,
  normaliseSelection,
  selectionLabel,
  selectionRect,
  squareColumns,
} from '../js/grid.js';

const grid = { rows: 4, cols: 5 };
const size = { w: 1000, h: 800 };

test('columnName follows spreadsheet naming', () => {
  assert.equal(columnName(0), 'A');
  assert.equal(columnName(25), 'Z');
  assert.equal(columnName(26), 'AA');
  assert.equal(columnName(27), 'AB');
  assert.equal(columnName(51), 'AZ');
  assert.equal(columnName(52), 'BA');
});

test('cellLabel supports both label styles', () => {
  assert.equal(cellLabel(0, 0, 'alpha'), 'A1');
  assert.equal(cellLabel(3, 2, 'alpha'), 'C4');
  assert.equal(cellLabel(3, 2, 'numeric'), '3-4');
});

test('cellRect tiles the image exactly', () => {
  const first = cellRect(grid, size, 0, 0);
  assert.deepEqual(first, { x: 0, y: 0, w: 200, h: 200 });
  const last = cellRect(grid, size, grid.rows - 1, grid.cols - 1);
  assert.equal(last.x + last.w, size.w);
  assert.equal(last.y + last.h, size.h);
});

test('cellAt maps points to squares and rejects points outside the photo', () => {
  assert.deepEqual(cellAt(grid, size, 10, 10), { row: 0, col: 0 });
  assert.deepEqual(cellAt(grid, size, 999.9, 799.9), { row: 3, col: 4 });
  assert.deepEqual(cellAt(grid, size, 200, 200), { row: 1, col: 1 });
  assert.equal(cellAt(grid, size, -1, 10), null);
  assert.equal(cellAt(grid, size, 10, 800), null);
});

test('clampedCellAt keeps drags inside the photo', () => {
  assert.deepEqual(clampedCellAt(grid, size, -500, -500), { row: 0, col: 0 });
  assert.deepEqual(clampedCellAt(grid, size, 5000, 5000), { row: 3, col: 4 });
});

test('normaliseSelection orders corners regardless of drag direction', () => {
  const a = { row: 3, col: 4 };
  const b = { row: 1, col: 2 };
  assert.deepEqual(normaliseSelection(a, b), { r0: 1, c0: 2, r1: 3, c1: 4 });
  assert.deepEqual(normaliseSelection(b, a), { r0: 1, c0: 2, r1: 3, c1: 4 });
});

test('selectionRect spans every selected square', () => {
  const rect = selectionRect(grid, size, { r0: 1, c0: 1, r1: 2, c1: 3 });
  assert.deepEqual(rect, { x: 200, y: 200, w: 600, h: 400 });
});

test('clampSelection survives a grid that shrank under it', () => {
  const sel = { r0: 8, c0: 9, r1: 12, c1: 20 };
  assert.deepEqual(clampSelection(sel, { rows: 4, cols: 5 }), { r0: 3, c0: 4, r1: 3, c1: 4 });
});

test('selectionLabel names single squares and regions', () => {
  assert.equal(selectionLabel({ r0: 0, c0: 0, r1: 0, c1: 0 }, 'alpha'), 'A1');
  assert.equal(selectionLabel({ r0: 0, c0: 0, r1: 2, c1: 1 }, 'alpha'), 'A1 → B3');
});

test('squareColumns matches the image aspect ratio', () => {
  assert.equal(squareColumns(4, { w: 1000, h: 1000 }), 4);
  assert.equal(squareColumns(4, { w: 2000, h: 1000 }), 8);
  assert.equal(squareColumns(10, { w: 800, h: 1000 }), 8);
  assert.equal(squareColumns(1, { w: 1, h: 5000 }), 1); // never drops below one column
});
