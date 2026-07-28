// Camera controller: manages getUserMedia streams, front/back switching,
// high-quality capture, and lifecycle.

export class Camera {
  constructor(videoEl) {
    this.video = videoEl;
    this.stream = null;
    this.facing = 'user';
    this.devices = [];
  }

  async listCameras() {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      this.devices = list.filter(d => d.kind === 'videoinput');
    } catch { this.devices = []; }
    return this.devices;
  }

  async start({ hq = true } = {}) {
    this.stop();
    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: this.facing },
        width:  { ideal: hq ? 1920 : 1280 },
        height: { ideal: hq ? 1080 : 720 },
      },
    };
    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.video.srcObject = this.stream;
    await this.video.play().catch(()=>{});
    await this.listCameras();
    return this.stream;
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
      this.video.srcObject = null;
    }
  }

  async switch() {
    this.facing = this.facing === 'user' ? 'environment' : 'user';
    try {
      await this.start();
    } catch (e) {
      // revert
      this.facing = this.facing === 'user' ? 'environment' : 'user';
      throw e;
    }
  }

  hasMultiple() { return this.devices.length > 1; }

  capture({ maxWidth = 1280 } = {}) {
    const v = this.video;
    const w = v.videoWidth || 640;
    const h = v.videoHeight || 480;
    const scale = Math.min(1, maxWidth / w);
    const cw = Math.round(w * scale), ch = Math.round(h * scale);
    const canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(v, 0, 0, cw, ch);
    return { canvas, dataUrl: canvas.toDataURL('image/jpeg', 0.85), width: cw, height: ch };
  }
}
