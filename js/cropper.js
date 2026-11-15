// cropper.js - Handles interactive four-corner cropping and perspective correction
// This module provides a Cropper class that manages corner points on a canvas,
// allows dragging with mouse/touch, and can produce a corrected image using a
// triangle‑subdivision algorithm (no external libraries).

export class Cropper {
  /**
   * @param {HTMLCanvasElement} canvas - Canvas where the source image is drawn.
   * @param {HTMLCanvasElement} outputCanvas - Canvas where the corrected image will be rendered.
   * @param {HTMLSvgElement} overlay - SVG element used to display corner handles and overlay.
   */
  constructor(canvas, outputCanvas, overlay) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.outputCanvas = outputCanvas;
    this.overlay = overlay;
    this.img = null; // Image element drawn onto the source canvas
    // Initialize corner points (clockwise starting top‑left)
    this.corners = [
      { x: 50, y: 50 },
      { x: canvas.width - 50, y: 50 },
      { x: canvas.width - 50, y: canvas.height - 50 },
      { x: 50, y: canvas.height - 50 },
    ];
    this.activeCorner = null;
    this.dragging = false;
    this._setupOverlay();
    this._bindEvents();
  }

  /** Load an image and draw it onto the source canvas */
  loadImage(img) {
    this.img = img;
    const ratio = Math.min(this.canvas.width / img.width, this.canvas.height / img.height);
    const w = img.width * ratio;
    const h = img.height * ratio;
    const offsetX = (this.canvas.width - w) / 2;
    const offsetY = (this.canvas.height - h) / 2;
    // Reset corners to the image bounds
    this.corners = [
      { x: offsetX, y: offsetY },
      { x: offsetX + w, y: offsetY },
      { x: offsetX + w, y: offsetY + h },
      { x: offsetX, y: offsetY + h },
    ];
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(img, offsetX, offsetY, w, h);
    this._drawOverlay();
  }

  /** Reset corners to the full image rectangle */
  reset() {
    if (!this.img) return;
    this.loadImage(this.img);
  }

  /** Rotate the source image 90° clockwise */
  rotateRight() {
    if (!this.img) return;
    const temp = document.createElement('canvas');
    const ctx = temp.getContext('2d');
    temp.width = this.img.height;
    temp.height = this.img.width;
    ctx.translate(temp.width / 2, temp.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(this.img, -this.img.width / 2, -this.img.height / 2);
    const rotatedImg = new Image();
    rotatedImg.src = temp.toDataURL();
    rotatedImg.onload = () => this.loadImage(rotatedImg);
  }

  /** Rotate the source image 90° counter‑clockwise */
  rotateLeft() {
    if (!this.img) return;
    const temp = document.createElement('canvas');
    const ctx = temp.getContext('2d');
    temp.width = this.img.height;
    temp.height = this.img.width;
    ctx.translate(temp.width / 2, temp.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(this.img, -this.img.width / 2, -this.img.height / 2);
    const rotatedImg = new Image();
    rotatedImg.src = temp.toDataURL();
    rotatedImg.onload = () => this.loadImage(rotatedImg);
  }

  /** Perform perspective correction and draw to outputCanvas */
  getCorrectedImage(grid = 16) {
    if (!this.img) return null;
    const dst = this.outputCanvas;
    const ctx = dst.getContext('2d');
    ctx.clearRect(0, 0, dst.width, dst.height);
    const w = this.img.width;
    const h = this.img.height;
    const srcCorners = [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ];
    // Map source rectangle to user‑adjusted corners (still in source canvas coords)
    // First convert canvas corners back to image‑space coordinates
    const canvasRect = this.canvas.getBoundingClientRect();
    const ratio = Math.min(this.canvas.width / this.img.width, this.canvas.height / this.img.height);
    const offsetX = (this.canvas.width - w * ratio) / 2;
    const offsetY = (this.canvas.height - h * ratio) / 2;
    const destCorners = this.corners.map(p => ({
      x: (p.x - offsetX) / ratio,
      y: (p.y - offsetY) / ratio,
    }));

    // Use triangle subdivision (grid × grid) to approximate the warp
    for (let y = 0; y < grid; y++) {
      const v0 = y / grid;
      const v1 = (y + 1) / grid;
      for (let x = 0; x < grid; x++) {
        const u0 = x / grid;
        const u1 = (x + 1) / grid;
        // Source quad
        const s0 = { x: u0 * w, y: v0 * h };
        const s1 = { x: u1 * w, y: v0 * h };
        const s2 = { x: u1 * w, y: v1 * h };
        const s3 = { x: u0 * w, y: v1 * h };
        // Destination points via bilinear interpolation on destCorners
        const d0 = bilinear(destCorners, u0, v0);
        const d1 = bilinear(destCorners, u1, v0);
        const d2 = bilinear(destCorners, u1, v1);
        const d3 = bilinear(destCorners, u0, v1);
        // Draw two triangles
        drawTriangle(ctx, this.img, s0, s1, s3, d0, d1, d3);
        drawTriangle(ctx, this.img, s1, s2, s3, d1, d2, d3);
      }
    }
    return dst;
  }

  /** Private helpers **/
  _setupOverlay() {
    // Clear any existing children
    while (this.overlay.firstChild) this.overlay.removeChild(this.overlay.firstChild);
    // Create polygon line
    this.polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    this.polygon.setAttribute('stroke', '#00ff00');
    this.polygon.setAttribute('stroke-width', '2');
    this.polygon.setAttribute('fill', 'rgba(0,255,0,0.1)');
    this.overlay.appendChild(this.polygon);
    // Create 4 corner circles
    this.handles = [];
    for (let i = 0; i < 4; i++) {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('r', '10');
      circle.setAttribute('fill', '#ff0000');
      circle.setAttribute('cursor', 'pointer');
      this.overlay.appendChild(circle);
      this.handles.push(circle);
    }
    this._drawOverlay();
  }

  _drawOverlay() {
    const points = this.corners.map(p => `${p.x},${p.y}`).join(' ');
    this.polygon.setAttribute('points', points);
    this.handles.forEach((h, i) => {
      h.setAttribute('cx', this.corners[i].x);
      h.setAttribute('cy', this.corners[i].y);
    });
  }

  _bindEvents() {
    const getPointer = e => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      return { x, y };
    };
    // Touch/mouse down
    const down = e => {
      e.preventDefault();
      const pos = getPointer(e.type.startsWith('touch') ? e.touches[0] : e);
      // Find nearest corner within 15px
      for (let i = 0; i < 4; i++) {
        const c = this.corners[i];
        const dx = c.x - pos.x;
        const dy = c.y - pos.y;
        if (Math.hypot(dx, dy) < 15) {
          this.activeCorner = i;
          this.dragging = true;
          break;
        }
      }
    };
    const move = e => {
      if (!this.dragging) return;
      const pos = getPointer(e.type.startsWith('touch') ? e.touches[0] : e);
      // Constrain within canvas bounds
      const x = Math.max(0, Math.min(this.canvas.width, pos.x));
      const y = Math.max(0, Math.min(this.canvas.height, pos.y));
      this.corners[this.activeCorner] = { x, y };
      this._drawOverlay();
    };
    const up = () => {
      this.dragging = false;
      this.activeCorner = null;
    };
    this.overlay.addEventListener('mousedown', down);
    this.overlay.addEventListener('touchstart', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('touchmove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchend', up);
    window.addEventListener('touchcancel', up);
  }
}

/** Helper: bilinear interpolation inside quadrilateral */
function bilinear(corners, u, v) {
  const x =
    (1 - u) * (1 - v) * corners[0].x +
    u * (1 - v) * corners[1].x +
    u * v * corners[2].x +
    (1 - u) * v * corners[3].x;
  const y =
    (1 - u) * (1 - v) * corners[0].y +
    u * (1 - v) * corners[1].y +
    u * v * corners[2].y +
    (1 - u) * v * corners[3].y;
  return { x, y };
}

/** Draw a source triangle onto destination using affine transform */
function drawTriangle(ctx, img, s0, s1, s2, d0, d1, d2) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(d0.x, d0.y);
  ctx.lineTo(d1.x, d1.y);
  ctx.lineTo(d2.x, d2.y);
  ctx.closePath();
  ctx.clip();
  // Compute affine transform matrix from source to destination triangle
  const denom = (s0.x - s2.x) * (s1.y - s2.y) - (s1.x - s2.x) * (s0.y - s2.y);
  if (denom === 0) { ctx.restore(); return; }
  const a = ((d0.x - d2.x) * (s1.y - s2.y) - (d1.x - d2.x) * (s0.y - s2.y)) / denom;
  const b = ((d0.x - d2.x) * (s2.x - s1.x) - (d1.x - d2.x) * (s2.x - s0.x)) / denom;
  const c = ((d0.y - d2.y) * (s1.y - s2.y) - (d1.y - d2.y) * (s0.y - s2.y)) / denom;
  const d = ((d0.y - d2.y) * (s2.x - s1.x) - (d1.y - d2.y) * (s2.x - s0.x)) / denom;
  const e = d0.x - a * s0.x - b * s0.y;
  const f = d0.y - c * s0.x - d * s0.y;
  ctx.transform(a, c, b, d, e, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}
