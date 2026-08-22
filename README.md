# Image Graph

Grid any photo, zoom into a single square, and superimpose that photo — grid and
all — on your paper through the camera. Built for painters and drawers who work
square by square.

Everything runs in the browser. No build step, no dependencies, no upload: the
photo never leaves the device.

## What it does

**Grid mode**

- Open a photo from a file, the camera, a drag-and-drop, or a paste.
  On a Mac, images inside the Photos app are not ordinary files, so no web
  page can browse them — drag one out of Photos onto the window, or copy it
  there and paste it here. HEIC photos need Safari; dragging out of Photos
  converts them on the way.
- Impose any grid you like: `2×2`, `5×2`, `100×100` — rows and columns are set
  independently, from 1 to 500 each, with one-tap presets and a
  **Make cells square** helper that matches the columns to the photo's aspect.
- Every square is labelled (`A1`, `B7`, … or `3-4` numeric style), and the label
  stays upright and readable however far you zoom.
- Tune the grid to suit the photo: line colour, line width, opacity, labels on
  or off.

**Zooming into squares**

- Tap a square to select it; double-tap to select *and* zoom straight in.
- Switch to the **Select** tool (or hold <kbd>Shift</kbd>) and drag to pick a
  whole region of squares, then **Zoom to selection** to fill the screen with
  just that region.
- Arrow keys walk the selection around the grid; <kbd>‹</kbd> / <kbd>›</kbd>
  step through the squares in reading order and zoom to each one — that is the
  whole painting session, one button.
- **Dim outside selection** greys everything but the square you are painting.
- Pan by dragging, zoom with the wheel, trackpad, or a two-finger pinch.

**Camera overlay mode**

- Point the phone or webcam at your paper and the photo is drawn over the live
  feed, semi-transparent, with the same grid on top.
- Drag, pinch and *twist* the photo until its grid lines land on the ones you
  ruled on the paper — two-finger rotation is there because paper is never
  perfectly square to the camera.
- Independent **photo opacity** and **grid opacity** sliders, plus toggles to
  hide either layer, so you can flick between "what should be there" and "what
  I have drawn".
- **Selected squares only** shows the overlay for just the square you are
  working on.
- **Lock alignment** freezes the transform so a stray finger cannot knock the
  registration out once it is right.
- **Freeze frame** holds the camera image still; the screen wake lock keeps the
  phone awake while it is propped over the board.

**It remembers where you were.** The photo (in IndexedDB), the grid, the
selected square and the exact pan/zoom of both views are saved as you go, so
closing the tab mid-painting and coming back lands you on the same square at the
same magnification.

**Exports**

- *Save gridded photo* — the full-resolution photo with the grid burned in, for
  printing as a reference.
- *Save square* — the selected square (or region) cropped at native resolution.
- *Save screenshot* — the current view, camera feed included in overlay mode.

## Running it

```bash
npm start           # http://localhost:8080
npm run start:https # https://localhost:8443, self-signed (needs openssl)
npm test            # unit tests for the grid and viewport maths
```

Any static file server works — there is nothing to compile. `server.js` is a
zero-dependency convenience, and `python3 -m http.server` serves the folder just
as well.

### Using it on a phone

The camera overlay is the point of the app, and browsers only hand out the
camera on a **secure origin**: `https://` or `localhost`. Two easy routes:

1. **Host it.** The repo is a plain static site, so GitHub Pages (Settings →
   Pages → deploy from branch, root) serves it over HTTPS as-is.
2. **Serve it from your machine.** `npm run start:https`, then open the printed
   `https://<your-lan-ip>:8443` on the phone and accept the self-signed
   certificate warning once.

Add it to the home screen and it runs full-screen and offline — there is a
service worker caching the shell and a web manifest.

## Keyboard

| Key | Action |
| --- | --- |
| <kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd> | Move the selected square |
| <kbd>Shift</kbd> + arrows | Grow the selection into a region |
| <kbd>Enter</kbd> | Zoom to selection |
| <kbd>Esc</kbd> | Clear the selection |
| <kbd>+</kbd> / <kbd>−</kbd> | Zoom in / out |
| <kbd>0</kbd> / <kbd>1</kbd> | Fit to screen / actual size |
| <kbd>G</kbd> | Grid on / off |
| <kbd>S</kbd> | Pan / Select tool |
| <kbd>O</kbd> | Grid / Overlay mode |

## How it is put together

```
index.html          app shell and controls
styles.css          dark, responsive layout (panel becomes a drawer on phones)
js/app.js           state, rendering, UI wiring, exports
js/viewport.js      pan/zoom/rotate transform, fitting and animation
js/grid.js          cell geometry, labels, and all grid drawing
js/gestures.js      pointer gestures: drag, pinch, rotate, tap, double-tap
js/camera.js        getUserMedia, camera switching, freeze, wake lock
js/storage.js       photo in IndexedDB, settings in localStorage
sw.js               offline cache
server.js           dev server (http, or https with a self-signed cert)
test/               node:test unit tests for the pure geometry
```

The grid lives entirely in **image pixel space**: a square is a row/column pair
over the photo's own coordinates, and a `Viewport` maps that space onto the
screen. So a square keeps its identity no matter how the view is panned,
zoomed, rotated or restored days later — which is what makes "zoom back to B7"
and the camera alignment reliable. Grid mode and overlay mode are two viewports
over the same photo, sharing one set of gesture handlers; only the overlay uses
rotation.

## Tests

`npm test` runs the geometry unit tests (cell mapping, labels, selection
normalisation, viewport inverses, zoom anchoring, fitting). The interactive
layers — file loading, selection, zoom-to-square, camera overlay, persistence
across reloads and the mobile layout — were verified end-to-end in Chromium
with a fake camera device.

## Browser support

Any current Chrome, Edge, Firefox or Safari (desktop or mobile). The camera
overlay needs `getUserMedia` on a secure origin; everything else degrades
gracefully if a camera is unavailable.
