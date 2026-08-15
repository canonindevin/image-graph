/**
 * Maps image coordinates to screen (CSS pixel) coordinates.
 *
 *   screen = translate(tx, ty) · rotate(rot) · scale(s) · image
 *
 * Rotation is only used by the camera overlay, where the photo has to be
 * twisted to line up with a sheet of paper, but the same class drives the
 * grid view so both share one set of gesture handlers.
 */

export const MIN_SCALE = 0.02;
export const MAX_SCALE = 200;

export class Viewport {
  constructor(init = {}) {
    this.scale = init.scale ?? 1;
    this.tx = init.tx ?? 0;
    this.ty = init.ty ?? 0;
    this.rot = init.rot ?? 0;
  }

  clone() {
    return new Viewport(this.toJSON());
  }

  toJSON() {
    return { scale: this.scale, tx: this.tx, ty: this.ty, rot: this.rot };
  }

  set(v) {
    this.scale = v.scale;
    this.tx = v.tx;
    this.ty = v.ty;
    this.rot = v.rot ?? 0;
    return this;
  }

  /** Image point -> screen point. */
  toScreen(x, y) {
    const c = Math.cos(this.rot), s = Math.sin(this.rot), k = this.scale;
    return {
      x: k * (c * x - s * y) + this.tx,
      y: k * (s * x + c * y) + this.ty,
    };
  }

  /** Screen point -> image point. */
  toImage(x, y) {
    const c = Math.cos(this.rot), s = Math.sin(this.rot), k = this.scale;
    const dx = (x - this.tx) / k;
    const dy = (y - this.ty) / k;
    return { x: c * dx + s * dy, y: -s * dx + c * dy };
  }

  /** 2D matrix for ctx.setTransform(), in CSS pixels. */
  matrix() {
    const c = Math.cos(this.rot), s = Math.sin(this.rot), k = this.scale;
    return { a: k * c, b: k * s, c: -k * s, d: k * c, e: this.tx, f: this.ty };
  }

  /** Zoom by `factor`, keeping the image point under `screen` pinned. */
  zoomAt(screen, factor) {
    const next = clamp(this.scale * factor, MIN_SCALE, MAX_SCALE);
    const applied = next / this.scale;
    if (applied === 1) return this;
    const p = this.toImage(screen.x, screen.y);
    this.scale = next;
    this.#pin(p, screen);
    return this;
  }

  /** Rotate by `delta` radians, keeping the image point under `screen` pinned. */
  rotateAt(screen, delta) {
    if (!delta) return this;
    const p = this.toImage(screen.x, screen.y);
    this.rot += delta;
    this.#pin(p, screen);
    return this;
  }

  panBy(dx, dy) {
    this.tx += dx;
    this.ty += dy;
    return this;
  }

  /** Place image point `p` exactly under screen point `q`. */
  #pin(p, q) {
    const c = Math.cos(this.rot), s = Math.sin(this.rot), k = this.scale;
    this.tx = q.x - k * (c * p.x - s * p.y);
    this.ty = q.y - k * (s * p.x + c * p.y);
  }

  /**
   * Fit an image-space rect into a viewport of `w` x `h` CSS px.
   * Existing rotation is preserved (the rect's rotated bounds are fitted).
   */
  fitRect(rect, w, h, padding = 16) {
    const availW = Math.max(1, w - padding * 2);
    const availH = Math.max(1, h - padding * 2);
    const c = Math.abs(Math.cos(this.rot)), s = Math.abs(Math.sin(this.rot));
    const spanW = rect.w * c + rect.h * s;
    const spanH = rect.w * s + rect.h * c;
    this.scale = clamp(Math.min(availW / spanW, availH / spanH), MIN_SCALE, MAX_SCALE);
    const center = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
    this.#pin(center, { x: w / 2, y: h / 2 });
    return this;
  }

  centerOn(point, w, h) {
    this.#pin(point, { x: w / 2, y: h / 2 });
    return this;
  }
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Eased interpolation between two viewport states, for animated zooms. */
export function lerpViewport(from, to, t) {
  const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
  return {
    // Scale interpolates geometrically so the zoom feels linear.
    scale: from.scale * Math.pow(to.scale / from.scale, e),
    tx: from.tx + (to.tx - from.tx) * e,
    ty: from.ty + (to.ty - from.ty) * e,
    rot: from.rot + (to.rot - from.rot) * e,
  };
}
