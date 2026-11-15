// main.js – Entry point that wires UI events and manages screen navigation
import { startCamera, captureFrame, loadImageFromFile } from './camera.js';
import { initProcessor, startNewDocument, handleShutter, handleFileSelect, confirmCrop, keepPage, autoDetectEdges } from './processor.js';
import { exportDocument } from './export.js';
import { getDocument, getPagesForDocument, deleteDocument, listDocuments, deletePage, updatePageBlob } from './db.js';

// UI elements
const newDocBtn = document.getElementById('new-doc-btn');
const importDocBtn = document.getElementById('import-doc-btn');
const shutterBtn = document.getElementById('shutter-btn');
const cancelCaptureBtn = document.getElementById('cancel-capture-btn');
const autoDetectBtn = document.getElementById('auto-detect-btn');
const resetCornersBtn = document.getElementById('reset-corners-btn');
const rotateLeftBtn = document.getElementById('rotate-left-btn');
const rotateRightBtn = document.getElementById('rotate-right-btn');
const retakeBtn = document.getElementById('retake-btn');
const cancelCropBtn = document.getElementById('cancel-crop-btn');
const confirmCropBtn = document.getElementById('confirm-crop-btn');
const reeditCropBtn = document.getElementById('reedit-crop-btn');
const retakePageBtn = document.getElementById('retake-page-btn');
const keepPageBtn = document.getElementById('keep-page-btn');
const scanNextBtn = document.getElementById('scan-next-btn');
const exportBtn = document.getElementById('export-btn');
const deleteDocBtn = document.getElementById('delete-doc-btn');
const backHomeBtn = document.getElementById('back-home-btn');
const closeExportBtn = document.getElementById('close-export-btn');
const exportOptionButtons = document.querySelectorAll('.export-btn');
const docListDiv = document.getElementById('doc-list');
const pageListDiv = document.getElementById('page-list');
const pageCountSpan = document.getElementById('page-count');
const docTitleInput = document.getElementById('doc-title');
const fileInput = document.getElementById('file-input');

let currentDoc = null;
let videoStream = null;

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

function refreshDocList() {
  docListDiv.innerHTML = '';
  listDocuments().then(docs => {
    docs.forEach(doc => {
      const div = document.createElement('div');
      div.textContent = doc.title || 'Untitled';
      div.className = 'doc-item';
      div.addEventListener('click', () => loadDocument(doc.id));
      docListDiv.appendChild(div);
    });
  }).catch(err => console.error('Failed to load documents', err));
}

async function loadDocument(docId) {
  currentDoc = await getDocument(docId);
  if (!currentDoc) return;
  sessionStorage.setItem('currentDocId', currentDoc.id);
  docTitleInput.value = currentDoc.title;
  await renderPageThumbnails();
  updatePageCount();
  showScreen('document-screen');
}

// Add diagnostics
console.log('main.js loaded');

// After initProcessor (inside initApp) we'll add later

async function initApp() {
  initProcessor();
  console.log('Processor initialized');
  const videoEl = document.getElementById('camera-video');
  videoStream = await startCamera(videoEl);
  // Wire UI events
  newDocBtn.addEventListener('click', async () => {
    console.log('New Document button clicked');
    currentDoc = await startNewDocument();
    sessionStorage.setItem('currentDocId', currentDoc.id);
    docTitleInput.value = currentDoc.title;
    updatePageCount();
    showScreen('document-screen');
    renderPageThumbnails();
  });

  importDocBtn.addEventListener('click', () => {
    console.log('Import button clicked');
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    console.log('File input changed');
    handleFileSelect(e);
  });

  shutterBtn.addEventListener('click', handleShutter);
  cancelCaptureBtn.addEventListener('click', () => showScreen('home-screen'));

  // Crop controls
  resetCornersBtn.addEventListener('click', () => {
    if (window.cropper) window.cropper.reset();
  });
  rotateLeftBtn.addEventListener('click', () => {
    if (window.cropper) window.cropper.rotateLeft();
  });
  rotateRightBtn.addEventListener('click', () => {
    if (window.cropper) window.cropper.rotateRight();
  });
  retakeBtn.addEventListener('click', () => showScreen('capture-screen'));
  cancelCropBtn.addEventListener('click', () => showScreen('home-screen'));
  confirmCropBtn.addEventListener('click', confirmCrop);

  reeditCropBtn.addEventListener('click', () => showScreen('crop-screen'));
  retakePageBtn.addEventListener('click', () => showScreen('capture-screen'));
  keepPageBtn.addEventListener('click', async () => {
    await keepPage();
    await renderPageThumbnails();
    showScreen('document-screen');
    updatePageCount();
  });

  scanNextBtn.addEventListener('click', () => showScreen('capture-screen'));
  exportBtn.addEventListener('click', () => showScreen('export-screen'));
  closeExportBtn.addEventListener('click', () => showScreen('document-screen'));

  exportOptionButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const fmt = btn.dataset.format;
      exportDocument(fmt);
    });
  });

  deleteDocBtn.addEventListener('click', async () => {
    if (!currentDoc) return;
    if (confirm('Delete this document?')) {
      await deleteDocument(currentDoc.id);
      currentDoc = null;
      sessionStorage.removeItem('currentDocId');
      showScreen('home-screen');
    }
  });

  backHomeBtn.addEventListener('click', () => showScreen('home-screen'));
}


async function renderPageThumbnails() {
  if (!currentDoc) return;
  const pages = await getPagesForDocument(currentDoc.id);
  pageListDiv.innerHTML = '';
  pages.forEach(async (page, idx) => {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(page.blob);
    img.className = 'thumb';
    img.title = `Page ${idx + 1}`;
    // Add simple controls for delete and rotate
    const container = document.createElement('div');
    container.className = 'thumb-container';
    container.appendChild(img);
    const delBtn = document.createElement('button');
    delBtn.textContent = '✕';
    delBtn.className = 'thumb-delete';
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      // Delete page from DB
      const db = await import('./db.js');
      const tx = (await db.openDatabase()).transaction('pages', 'readwrite');
      tx.objectStore('pages').delete(page.id);
      await tx.complete;
      await renderPageThumbnails();
      updatePageCount();
    });
    const rotateBtn = document.createElement('button');
    rotateBtn.textContent = '↻';
    rotateBtn.className = 'thumb-rotate';
    rotateBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      // Simple rotate by 90° using canvas then replace blob
      const bitmap = await createImageBitmap(page.blob);
      const tmp = document.createElement('canvas');
      tmp.width = bitmap.height;
      tmp.height = bitmap.width;
      const ctx = tmp.getContext('2d');
      ctx.translate(tmp.width / 2, tmp.height / 2);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
      tmp.toBlob(async newBlob => {
        // Update page record
        const db = await import('./db.js');
        const dbInst = await db.openDatabase();
        const tx = dbInst.transaction(['pages'], 'readwrite');
        const store = tx.objectStore('pages');
        const getReq = store.get(page.id);
        getReq.onsuccess = () => {
          const rec = getReq.result;
          rec.blob = newBlob;
          store.put(rec);
        };
        tx.oncomplete = async () => {
          await renderPageThumbnails();
        };
      }, 'image/jpeg', 0.92);
    });
    container.appendChild(delBtn);
    container.appendChild(rotateBtn);
    pageListDiv.appendChild(container);
  });
}

function updatePageCount() {
  if (!currentDoc) {
    pageCountSpan.textContent = '';
    return;
  }
  getPagesForDocument(currentDoc.id).then(pages => {
    pageCountSpan.textContent = `${pages.length} page(s)`;
  });
}

// Initialize after DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// Expose cropper globally for simple control from UI (processor will set window.cropper)
window.cropper = null;
