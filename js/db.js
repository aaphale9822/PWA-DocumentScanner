// db.js – IndexedDB wrapper for PrivateScan documents and pages
// Uses a single database "private-scan" with object stores "documents" and "pages".
// Each document has an auto‑generated UUID, title, created timestamp, and an array of page IDs.
// Each page stores the binary image data (Blob) and its order within the document.

const DB_NAME = 'private-scan';
const DB_VERSION = 1;
const DOCUMENT_STORE = 'documents';
const PAGE_STORE = 'pages';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = event => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(DOCUMENT_STORE)) {
        const docStore = db.createObjectStore(DOCUMENT_STORE, { keyPath: 'id', autoIncrement: false });
        docStore.createIndex('by_title', 'title', { unique: false });
      }
      if (!db.objectStoreNames.contains(PAGE_STORE)) {
        const pageStore = db.createObjectStore(PAGE_STORE, { keyPath: 'id', autoIncrement: false });
        pageStore.createIndex('by_doc', 'docId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function generateId() {
  // Simple UUID v4 generator (good enough for local usage)
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
}

export async function createDocument(title = 'Untitled') {
  const db = await openDatabase();
  const tx = db.transaction(DOCUMENT_STORE, 'readwrite');
  const store = tx.objectStore(DOCUMENT_STORE);
  const doc = {
    id: generateId(),
    title,
    created: Date.now(),
    pages: []
  };
  store.add(doc);
  await tx.complete;
  return doc;
}

export async function getDocument(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DOCUMENT_STORE, 'readonly');
    const store = tx.objectStore(DOCUMENT_STORE);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listDocuments() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DOCUMENT_STORE, 'readonly');
    const store = tx.objectStore(DOCUMENT_STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteDocument(id) {
  const db = await openDatabase();
  const tx = db.transaction([DOCUMENT_STORE, PAGE_STORE], 'readwrite');
  const docStore = tx.objectStore(DOCUMENT_STORE);
  const pageStore = tx.objectStore(PAGE_STORE);
  // Remove associated pages first
  const getPages = pageStore.index('by_doc').getAllKeys(IDBKeyRange.only(id));
  getPages.onsuccess = () => {
    const keys = getPages.result;
    keys.forEach(key => pageStore.delete(key));
    docStore.delete(id);
  };
  await tx.complete;
}

export async function addPageToDocument(docId, blob) {
  const db = await openDatabase();
  const tx = db.transaction([PAGE_STORE, DOCUMENT_STORE], 'readwrite');
  const pageStore = tx.objectStore(PAGE_STORE);
  const docStore = tx.objectStore(DOCUMENT_STORE);
  const pageId = generateId();
  const page = { id: pageId, docId, blob, created: Date.now() };
  pageStore.add(page);
  const docRequest = docStore.get(docId);
  docRequest.onsuccess = () => {
    const doc = docRequest.result;
    doc.pages.push(pageId);
    docStore.put(doc);
  };
  await tx.complete;
  return pageId;
}

export async function getPage(pageId) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PAGE_STORE, 'readonly');
    const store = tx.objectStore(PAGE_STORE);
    const request = store.get(pageId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getPagesForDocument(docId) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PAGE_STORE, 'readonly');
    const index = tx.objectStore(PAGE_STORE).index('by_doc');
    const request = index.getAll(IDBKeyRange.only(docId));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Additional helper functions for page management
export async function deletePage(pageId) {
  const db = await openDatabase();
  const tx = db.transaction(PAGE_STORE, 'readwrite');
  const store = tx.objectStore(PAGE_STORE);
  store.delete(pageId);
  await tx.complete;
}

export async function updatePageBlob(pageId, newBlob) {
  const db = await openDatabase();
  const tx = db.transaction(PAGE_STORE, 'readwrite');
  const store = tx.objectStore(PAGE_STORE);
  const getReq = store.get(pageId);
  getReq.onsuccess = () => {
    const rec = getReq.result;
    if (rec) {
      rec.blob = newBlob;
      store.put(rec);
    }
  };
  await tx.complete;
}
