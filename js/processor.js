// processor.js – Orchestrates capture, cropping, preview, and storage
import { startCamera, captureFrame, loadImageFromFile } from './camera.js';
import { Cropper } from './cropper.js';
import { addPageToDocument, createDocument, getDocument, getPagesForDocument } from './db.js';

let currentDoc = null;
let cropper = null;
let videoElem = null;
let canvasElem = null;
let fileInput = null;
let cropCanvas = null;
let cropOverlay = null;
let previewImg = null;
let outputCanvas = null; // canvas for corrected image

/** Initialize UI element references */
export function initProcessor() {
  videoElem = document.getElementById('camera-video');
  canvasElem = document.getElementById('camera-canvas');
  fileInput = document.getElementById('file-input');
  cropCanvas = document.getElementById('crop-canvas');
  cropOverlay = document.getElementById('crop-overlay');
  previewImg = document.getElementById('page-preview');
  outputCanvas = document.createElement('canvas'); // offscreen canvas for corrected output
  // Initialize Cropper instance (will be set later after image load)
}

/** Start a new document */
export async function startNewDocument() {
  currentDoc = await createDocument('Untitled');
  // update UI doc title etc.
}

/** Load image from capture or file and feed into cropper */
export async function loadImage(img) {
  // Downscale if image is very large to keep canvas memory reasonable
  const MAX_DIM = 2000;
  let imgForCrop = img;
  if (img.width > MAX_DIM || img.height > MAX_DIM) {
    const scale = Math.min(MAX_DIM / img.width, MAX_DIM / img.height);
    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = img.width * scale;
    tmpCanvas.height = img.height * scale;
    const tmpCtx = tmpCanvas.getContext('2d');
    tmpCtx.drawImage(img, 0, 0, tmpCanvas.width, tmpCanvas.height);
    const downImg = new Image();
    downImg.src = tmpCanvas.toDataURL('image/jpeg', 0.9);
    await new Promise(res => { downImg.onload = res; });
    imgForCrop = downImg;
  }
  // Ensure outputCanvas matches source size
  outputCanvas.width = imgForCrop.width;
  outputCanvas.height = imgForCrop.height;
  // Initialize cropper with source and output canvas and overlay
  cropper = new Cropper(cropCanvas, outputCanvas, cropOverlay);
  cropper.loadImage(imgForCrop);
  // expose globally for UI controls
  window.cropper = cropper;
}

// Auto-detect document edges – placeholder implementation
export async function autoDetectEdges() {
  if (window.cropper) {
    // In a full implementation, run edge detection on the image.
    // For now, simply reset to full image bounds.
    window.cropper.reset();
  }
}
/** Handle shutter button click */
export async function handleShutter() {
  const img = captureFrame(videoElem, canvasElem);
  await loadImage(img);
  // Switch screens
  showScreen('crop-screen');
}

/** Handle file input change */
export async function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  const img = await loadImageFromFile(file);
  await loadImage(img);
  showScreen('crop-screen');
}

/** Confirm crop: produce corrected image and store page */
export async function confirmCrop() {
  const correctedCanvas = cropper.getCorrectedImage();
  // Convert canvas to Blob (JPEG) for storage
  correctedCanvas.toBlob(async blob => {
    if (currentDoc) {
      await addPageToDocument(currentDoc.id, blob);
    }
    // Show preview
    const url = URL.createObjectURL(blob);
    previewImg.src = url;
    showScreen('preview-screen');
  }, 'image/jpeg', 0.92);
}

/** Keep page and return to document screen */
export async function keepPage() {
  // Refresh page list UI (handled in main.js)
  showScreen('document-screen');
}

/** Helper to show specific screen */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

/** Expose functions for main.js */
export { handleShutter, handleFileSelect, confirmCrop, keepPage, startNewDocument, autoDetectEdges };
