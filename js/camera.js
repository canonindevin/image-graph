/**
 * Live camera feed for the overlay mode, plus a screen wake lock so the phone
 * does not sleep while it is propped over a drawing board.
 */

export class Camera {
  constructor(videoEl) {
    this.video = videoEl;
    this.stream = null;
    this.facing = 'environment';
    this.frozen = false;
  }

  get running() {
    return Boolean(this.stream);
  }

  static get supported() {
    return Boolean(navigator.mediaDevices?.getUserMedia);
  }

  async start(facing = this.facing) {
    if (!Camera.supported) {
      throw new Error(
        window.isSecureContext
          ? 'This browser will not give the page a camera.'
          : 'Camera access needs https:// (or localhost).',
      );
    }
    this.stop();
    this.facing = facing;

    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: facing },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      // Some devices reject facingMode outright; fall back to any camera.
      if (err?.name === 'OverconstrainedError' || err?.name === 'NotFoundError') {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      } else {
        throw err;
      }
    }

    this.video.srcObject = this.stream;
    this.frozen = false;
    await this.video.play().catch(() => {});
    await this.#requestWakeLock();
    return this.stream;
  }

  async switch() {
    return this.start(this.facing === 'environment' ? 'user' : 'environment');
  }

  toggleFreeze() {
    if (!this.running) return false;
    this.frozen = !this.frozen;
    if (this.frozen) this.video.pause();
    else this.video.play().catch(() => {});
    return this.frozen;
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.frozen = false;
    this.video.srcObject = null;
    this.#releaseWakeLock();
  }

  async #requestWakeLock() {
    try {
      this.wakeLock = await navigator.wakeLock?.request('screen');
    } catch {
      /* not supported, or denied — harmless */
    }
  }

  #releaseWakeLock() {
    this.wakeLock?.release?.().catch(() => {});
    this.wakeLock = null;
  }
}
