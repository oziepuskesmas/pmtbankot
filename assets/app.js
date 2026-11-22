/**
 * APLIKASI DOKUMENTASI KEGIATAN & PMT LOKAL
 * Clean Modular Application Logic v1.3
 * Integrated with Local Gallery: G:\My Drive\APLIKASI PMT\FOTO PMT
 */

// ==========================================
// 1. CONSTANTS & SYSTEM CONFIGURATION
// ==========================================
const API_BASE = (window.location.protocol === 'file:') ? 'http://localhost:3800' : '';
const CLOUD_SCRIPT_KEY = 'pmt_cloud_script_url';
const DEFAULT_CLOUD_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxTrF2uS-vddZMHydebLQp2GTiWH5c7EVCiYEM-Pw6IFk0r29pBkJmh787Koir_xdlNmw/exec';

// ==========================================
// 1. PERSISTENCE ENGINE & DATA STORE (DEEP MODULE)
// ==========================================

/**
 * Adapter 1: Cloudflare D1 Backend (REST API via _worker.js)
 */
class D1BackendAdapter {
  constructor(apiBase = '') {
    this.apiBase = apiBase;
  }

  getAuthHeaders() {
    try {
      const raw = localStorage.getItem('pmt_auth_user');
      if (raw) {
        const u = JSON.parse(raw);
        if (u && u.token) return { 'Authorization': `Bearer ${u.token}` };
      }
    } catch (e) {}
    return {};
  }

  async getDocuments() {
    const res = await fetch(`${this.apiBase}/api/documents`, {
      headers: {
        'Accept': 'application/json',
        ...this.getAuthHeaders()
      }
    });
    if (!res.ok) throw new Error(`D1 HTTP ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  async saveDocuments(docs) {
    const res = await fetch(`${this.apiBase}/api/documents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify(docs)
    });
    if (!res.ok) throw new Error(`D1 HTTP ${res.status}`);
    return true;
  }

  async deleteDocument(id) {
    if (!id) return false;
    try {
      const res = await fetch(`${this.apiBase}/api/documents?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: {
          'Accept': 'application/json',
          ...this.getAuthHeaders()
        }
      });
      return res.ok;
    } catch (e) {
      console.warn('D1 deleteDocument error:', e);
      return false;
    }
  }

  async getGallery() {
    const res = await fetch(`${this.apiBase}/api/gallery`, {
      headers: { ...this.getAuthHeaders() }
    });
    if (!res.ok) throw new Error(`D1 HTTP ${res.status}`);
    return await res.json();
  }

  async login(username, password) {
    const res = await fetch(`${this.apiBase}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    return await res.json();
  }
}

/**
 * Adapter 2: Google Drive Apps Script Backend (Web App Endpoint)
 */
class DriveBackendAdapter {
  constructor(getScriptUrlFn) {
    this.getScriptUrl = getScriptUrlFn;
  }

  get isConfigured() {
    const url = this.getScriptUrl();
    return Boolean(url && url.trim().length > 10);
  }

  async getDocuments() {
    const url = this.getScriptUrl();
    if (!url) return null;
    const res = await fetch(`${url}?action=getDocuments`);
    if (!res.ok) throw new Error(`Drive HTTP ${res.status}`);
    const data = await res.json();
    return (data && data.success && Array.isArray(data.documents)) ? data.documents : [];
  }

  async saveDocuments(docs) {
    const url = this.getScriptUrl();
    if (!url) return false;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'saveDocuments', documents: docs })
      });
      return res.ok;
    } catch (e) {
      console.warn('Drive saveDocuments error:', e);
      return false;
    }
  }

  async deleteDocument(id) {
    const url = this.getScriptUrl();
    if (!url) return false;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'deleteDocument', id: id })
      });
      return res.ok;
    } catch (e) {
      console.warn('Drive deleteDocument error:', e);
      return false;
    }
  }

  async getGallery() {
    const url = this.getScriptUrl();
    if (!url) return null;
    const res = await fetch(`${url}?action=getGallery`);
    if (!res.ok) throw new Error(`Drive HTTP ${res.status}`);
    return await res.json();
  }

  async login(username, password) {
    const url = this.getScriptUrl();
    if (!url) return null;
    const res = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ action: 'login', username, password })
    });
    return await res.json();
  }
}

/**
 * Adapter 3: IndexedDB Storage Adapter (Local Offline Persistence)
 */
class IndexedDBStorageAdapter {
  constructor(dbName = 'AplikasiPMT_Database_v2', storeName = 'documents', version = 1) {
    this.dbName = dbName;
    this.storeName = storeName;
    this.version = version;
    this._db = null;
  }

  async getDB() {
    if (this._db) return this._db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this._db = request.result;
        resolve(this._db);
      };
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('desa', 'desa', { unique: false });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };
    });
  }

  async getAll() {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, 'readonly');
        const store = tx.objectStore(this.storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('IndexedDB getAll error:', err);
      return [];
    }
  }

  async getById(id) {
    const all = await this.getAll();
    return all.find(d => d.id === id) || null;
  }

  async put(doc) {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const req = store.put(doc);
      req.onsuccess = () => resolve(doc);
      req.onerror = () => reject(req.error);
    });
  }

  async putBatch(docs) {
    if (!Array.isArray(docs) || docs.length === 0) return;
    const db = await this.getDB();
    const tx = db.transaction(this.storeName, 'readwrite');
    const store = tx.objectStore(this.storeName);
    for (const doc of docs) {
      store.put(doc);
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async replaceAll(docs) {
    if (!Array.isArray(docs)) return;
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      store.clear();
      for (const doc of docs) {
        store.put(doc);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async delete(id) {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }
}

/**
 * DEEP MODULE: PMTDataStore
 * Small, high-leverage interface with deep encapsulation:
 * - Transparent multi-adapter failover (Google Drive, Cloudflare D1, IndexedDB)
 * - Automatic photo usage status reconciliation across documents
 * - Built-in offline resilient authentication & background sync
 */
class PMTDataStore {
  constructor(options = {}) {
    this.cloudScriptKey = options.cloudScriptKey || CLOUD_SCRIPT_KEY;
    this.apiBase = options.apiBase !== undefined ? options.apiBase : API_BASE;

    // Adapters behind the seam
    this.idbAdapter = new IndexedDBStorageAdapter();
    this.d1Adapter = new D1BackendAdapter(this.apiBase);
    this.driveAdapter = new DriveBackendAdapter(() => this.getDriveUrl());
    this.cachedGallery = [];
  }

  // --- Provider & Configuration ---
  getDriveUrl() {
    const saved = localStorage.getItem(this.cloudScriptKey);
    if (saved === 'LOCAL') return '';
    return saved || DEFAULT_CLOUD_SCRIPT_URL;
  }

  setDriveUrl(url) {
    if (url && url.trim()) {
      localStorage.setItem(this.cloudScriptKey, url.trim());
    } else {
      localStorage.setItem(this.cloudScriptKey, 'LOCAL');
    }
    this.updateProviderStatusUI();
  }

  getStatus() {
    const driveUrl = this.getDriveUrl();
    if (driveUrl) {
      return { provider: 'drive', isOnline: true, label: 'Google Drive Online' };
    }
    if (this.apiBase === '') {
      return { provider: 'd1', isOnline: true, label: 'Cloudflare D1 Online' };
    }
    return { provider: 'local', isOnline: true, label: 'Mode Lokal PC' };
  }

  updateProviderStatusUI() {
    const status = this.getStatus();
    const badge = document.getElementById('cloud-status-badge');
    const btn = document.getElementById('btn-cloud-config');
    if (badge) {
      if (status.provider === 'drive') {
        badge.textContent = 'Drive Online';
        if (btn) {
          btn.classList.remove('btn-secondary');
          btn.classList.add('btn-success');
        }
      } else {
        badge.textContent = 'Google Drive';
        if (btn) {
          btn.classList.remove('btn-success');
          btn.classList.add('btn-secondary');
        }
      }
    }
  }

  // --- Document Interface (Deep Methods) ---
  async getDocuments(filter = {}) {
    let docs = [];
    let remoteSuccess = false;

    // 1. Prioritize Cloudflare D1 (Blazing fast ~50ms)
    try {
      const d1Docs = await this.d1Adapter.getDocuments();
      if (Array.isArray(d1Docs)) {
        docs = d1Docs;
        remoteSuccess = true;
      }
    } catch (d1Err) {
      console.warn('D1 tidak dapat diakses, mencoba Drive jika tersedia:', d1Err);
      if (this.driveAdapter.isConfigured) {
        try {
          const driveDocs = await this.driveAdapter.getDocuments();
          if (Array.isArray(driveDocs)) {
            docs = driveDocs;
            remoteSuccess = true;
          }
        } catch (driveErr) {
          console.warn('Drive fallback error:', driveErr);
        }
      }
    }

    // Mirror to local IndexedDB if remote sync succeeded
    if (remoteSuccess) {
      await this.idbAdapter.replaceAll(docs);
    } else {
      // Fallback to local storage ONLY if remote request failed (offline)
      docs = await this.idbAdapter.getAll();
    }

    // Filter out Mekarsari if any legacy documents exist
    docs = docs.filter(d => !d.desa || d.desa.toLowerCase() !== 'mekarsari');

    // 3. Filter options
    if (filter.desa && filter.desa !== 'ALL') {
      docs = docs.filter(d => d.desa && d.desa.toLowerCase() === filter.desa.toLowerCase());
    }
    if (filter.query && filter.query.trim()) {
      const q = filter.query.toLowerCase().trim();
      docs = docs.filter(d =>
        (d.desa && d.desa.toLowerCase().includes(q)) ||
        (d.termin && d.termin.toLowerCase().includes(q)) ||
        (d.tanggalCustom && d.tanggalCustom.toLowerCase().includes(q)) ||
        (d.judul && d.judul.toLowerCase().includes(q))
      );
    }

    return docs;
  }

  async getDocumentById(id) {
    if (!id) return null;
    const localDoc = await this.idbAdapter.getById(id);
    if (localDoc) return localDoc;
    const all = await this.getDocuments();
    return all.find(d => d.id === id) || null;
  }

  async saveDocument(doc) {
    if (!doc || !doc.id) throw new Error('Dokumen tidak valid (ID wajib diisi).');
    doc.updatedAt = new Date().toISOString();
    if (!doc.createdAt) doc.createdAt = doc.updatedAt;

    // 1. Local persistence (Instant)
    await this.idbAdapter.put(doc);

    // 2. Remote D1 Primary Sync (Blazing fast)
    try {
      const allDocs = await this.idbAdapter.getAll();
      await this.d1Adapter.saveDocuments(allDocs);

      // 3. Background non-blocking backup ke Google Drive
      if (this.driveAdapter.isConfigured) {
        this.driveAdapter.saveDocuments(allDocs).catch(err => {
          console.warn('Drive backup background ditunda:', err);
        });
      }
    } catch (syncErr) {
      console.warn('Sinkronisasi D1 ditunda (offline):', syncErr);
    }

    return doc;
  }

  async deleteDocument(id) {
    if (!id) return false;
    // 1. Local delete
    await this.idbAdapter.delete(id);

    // 2. Remote delete across D1 and Drive
    try {
      await this.d1Adapter.deleteDocument(id);
      if (this.driveAdapter.isConfigured) {
        const remainingDocs = await this.idbAdapter.getAll();
        this.driveAdapter.saveDocuments(remainingDocs).catch(() => {});
        this.driveAdapter.deleteDocument(id).catch(() => {});
      }
    } catch (syncErr) {
      console.warn('Sinkronisasi penghapusan ditunda:', syncErr);
    }

    return true;
  }

  // --- Gallery Interface (With automated photo usage reconciliation & Stale-While-Revalidate Cache) ---
  async getGalleryPhotos(forceRefresh = false) {
    // 1. Ambil dari memori jika tersedia dan tidak dipaksa refresh
    if (!forceRefresh && this.cachedGallery && this.cachedGallery.length > 0) {
      return await this.reconcilePhotoUsage(this.cachedGallery);
    }

    // 2. Ambil dari cache localStorage seketika (0 ms!)
    if (!forceRefresh) {
      try {
        const localCached = localStorage.getItem('pmt_cached_gallery');
        if (localCached) {
          const parsed = JSON.parse(localCached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            this.cachedGallery = parsed;
            // Jalankan sinkronisasi background diam-diam
            this.syncGalleryBackground().catch(() => {});
            return await this.reconcilePhotoUsage(this.cachedGallery);
          }
        }
      } catch (e) {}
    }

    // 3. Ambil data dari cloud
    const photos = await this.syncGalleryBackground();
    return await this.reconcilePhotoUsage(photos);
  }

  async syncGalleryBackground() {
    let rawPhotos = [];
    try {
      if (this.driveAdapter.isConfigured) {
        const driveData = await this.driveAdapter.getGallery();
        if (driveData && Array.isArray(driveData.photos)) rawPhotos = driveData.photos;
      } else {
        const localData = await this.d1Adapter.getGallery();
        if (localData && Array.isArray(localData.photos)) rawPhotos = localData.photos;
      }
    } catch (err) {
      console.warn('Galeri foto tidak dapat diakses:', err);
    }

    if (rawPhotos.length > 0) {
      // Filter out any photos from Mekarsari
      rawPhotos = rawPhotos.filter(p => p.desa && p.desa.toLowerCase() !== 'mekarsari');
      this.cachedGallery = rawPhotos;
      try {
        localStorage.setItem('pmt_cached_gallery', JSON.stringify(rawPhotos));
      } catch (e) {}
    }

    return this.cachedGallery || [];
  }

  async reconcilePhotoUsage(rawPhotos) {
    if (!Array.isArray(rawPhotos)) return [];
    const allDocs = await this.idbAdapter.getAll();
    const photoUsageMap = new Map();
    for (const doc of allDocs) {
      if (Array.isArray(doc.fotos)) {
        for (const f of doc.fotos) {
          const key = (f.galleryPath || f.relativePath || f.filename || '').toLowerCase();
          if (key && !photoUsageMap.has(key)) {
            photoUsageMap.set(key, { docId: doc.id, desa: doc.desa, termin: doc.termin });
          }
        }
      }
    }

    const annotatedPhotos = rawPhotos.map(photo => {
      const key = (photo.relativePath || photo.filename || '').toLowerCase();
      const usedInfo = photoUsageMap.get(key) || photo.usedInfo || null;
      return {
        ...photo,
        isUsed: Boolean(usedInfo),
        usedInfo: usedInfo
      };
    });

    return annotatedPhotos;
  }

  // --- Authentication Interface ---
  async authenticate(username, password) {
    const u = (username || '').trim();
    const p = (password || '').trim();
    if (!u || !p) return null;

    // 1. Try remote provider
    try {
      let result = null;
      if (this.driveAdapter.isConfigured) {
        result = await this.driveAdapter.login(u, p);
      } else {
        result = await this.d1Adapter.login(u, p);
      }
      if (result && result.success && result.user) {
        const userObj = { ...result.user };
        if (result.token) userObj.token = result.token;
        return userObj;
      }
    } catch (netErr) {
      console.warn('Autentikasi remote gagal, memeriksa akun offline:', netErr);
    }

    // 2. Offline fallback admin verification
    if (u.toLowerCase() === 'mochamad fauzie, s.gz' && p === '213117') {
      return {
        id: 'u_admin_1',
        username: 'Mochamad Fauzie, S.Gz',
        role: 'Admin',
        puskesmas: 'Puskesmas Banjaran Kota',
        token: 'offline_session_token'
      };
    }

    return null;
  }
}

// Global Store Instance
const pmtStore = new PMTDataStore();
window.pmtStore = pmtStore;

// Helpers mapped to Deep Store
function getCloudScriptUrl() {
  return pmtStore.getDriveUrl();
}

function setCloudScriptUrl(url) {
  pmtStore.setDriveUrl(url);
}

function updateCloudStatusUI() {
  pmtStore.updateProviderStatusUI();
}

// Backwards-Compatible Facades
class PMTStorage {
  static openDB() { return pmtStore.idbAdapter.getDB(); }
  static getAll() { return pmtStore.getDocuments(); }
  static getById(id) { return pmtStore.getDocumentById(id); }
  static save(doc) { return pmtStore.saveDocument(doc); }
  static delete(id) { return pmtStore.deleteDocument(id); }
  static getAllFromIDB() { return pmtStore.idbAdapter.getAll(); }
}
window.PMTStorage = PMTStorage;

class ApiClient {
  static getDocuments() { return pmtStore.getDocuments(); }
  static saveDocuments(docs) { return pmtStore.d1Adapter.saveDocuments(docs); }
  static getGallery() { return pmtStore.getGalleryPhotos(); }
  static login(u, p) { return pmtStore.authenticate(u, p); }
}
window.ApiClient = ApiClient;

function openCloudConfigModal() {
  const modal = document.getElementById('cloud-config-modal');
  const input = document.getElementById('input-apps-script-url');
  if (input) input.value = pmtStore.getDriveUrl();
  if (modal) modal.style.display = 'flex';
}

function closeCloudConfigModal() {
  const modal = document.getElementById('cloud-config-modal');
  if (modal) modal.style.display = 'none';
}

async function saveCloudConfig() {
  const input = document.getElementById('input-apps-script-url');
  const url = input ? input.value.trim() : '';
  pmtStore.setDriveUrl(url);
  closeCloudConfigModal();
  showToast(url ? 'Berhasil terhubung ke Google Drive Cloud!' : 'Kembali ke mode lokal PC.');
  await refreshDocumentsList();
  await refreshGallery();
}

const VILLAGES = [
  'Banjaran Kulon',
  'Banjaran Wetan',
  'Ciapus',
  'Mekarjaya',
  'Tarajusari'
];

const DEFAULT_DOC_CONFIG = {
  judul: 'DOKUMENTASI KEGIATAN',
  subJudul: 'PMT LOKAL IBU HAMIL KEK DAN BALITA BERMASALAH GIZI',
  kertas: 'A4',
  page1Photos: 6,
  subsequentPhotos: 9
};


// ==========================================
// 3. IMAGE PROCESSOR & COMPRESSION
// ==========================================
class ImageOptimizer {
  static async compressAndOrient(fileOrUrl, maxWidth = 1600, maxHeight = 1600, quality = 0.88) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = reject;

      if (typeof fileOrUrl === 'string') {
        img.src = fileOrUrl;
      } else {
        const reader = new FileReader();
        reader.onload = (e) => { img.src = e.target.result; };
        reader.onerror = reject;
        reader.readAsDataURL(fileOrUrl);
      }
    });
  }

  static async rotateImage(dataUrl, angleDegrees = 90) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (angleDegrees === 90 || angleDegrees === 270) {
          canvas.width = img.height;
          canvas.height = img.width;
        } else {
          canvas.width = img.width;
          canvas.height = img.height;
        }

        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((angleDegrees * Math.PI) / 180);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);

        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }
}

// ==========================================
// 4. APPLICATION STATE & CONTROLLER
// ==========================================
const AppState = {
  currentView: 'list', // 'list', 'gallery', or 'editor'
  activeDesaFilter: 'ALL',
  searchQuery: '',
  documents: [],
  activeDoc: null,
  isProcessingImages: false,
  currentZoom: 'fit',

  // Gallery from FOTO PMT
  galleryPhotos: [],
  galleryFilterDesa: 'ALL',
  galleryFilterStatus: 'UNUSED',
  selectedModalPhotos: new Set()
};

// Security: HTML Entity Sanitizer to prevent Stored & Reflected DOM XSS
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// UI Helper: Toast
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3500);
}

// Format Indonesian Date Range
function formatIndonesianDateRange(startDateStr, endDateStr) {
  if (!startDateStr || !endDateStr) return '';
  const months = [
    'JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI',
    'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'
  ];
  const d1 = new Date(startDateStr);
  const d2 = new Date(endDateStr);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return '';

  const day1 = d1.getDate();
  const month1 = months[d1.getMonth()];
  const year1 = d1.getFullYear();

  const day2 = d2.getDate();
  const month2 = months[d2.getMonth()];
  const year2 = d2.getFullYear();

  if (month1 === month2 && year1 === year2) {
    return `( ${day1} - ${day2} ${month2} ${year2} )`;
  } else if (year1 === year2) {
    return `( ${day1} ${month1} - ${day2} ${month2} ${year2} )`;
  } else {
    return `( ${day1} ${month1} ${year1} - ${day2} ${month2} ${year2} )`;
  }
}

// Zoom Scaling Engine
function setZoom(level) {
  AppState.currentZoom = level;
  applyZoom();

  document.querySelectorAll('.zoom-btn').forEach(btn => {
    btn.classList.remove('active');
    if (level === 'fit' && btn.innerText.includes('Pas')) {
      btn.classList.add('active');
    } else if (typeof level === 'number' && btn.innerText.includes(Math.round(level * 100) + '%')) {
      btn.classList.add('active');
    }
  });
}

function applyZoom() {
  const wrapper = document.getElementById('preview-scale-wrapper');
  if (!wrapper) return;

  let scale = 1.0;
  if (AppState.currentZoom === 'fit') {
    const container = document.querySelector('.editor-preview-container');
    if (container) {
      const availableWidth = container.clientWidth - 48;
      scale = Math.min(1.0, Math.max(0.45, availableWidth / 820));
    } else {
      scale = 0.68;
    }
  } else {
    scale = Number(AppState.currentZoom) || 1.0;
  }

  wrapper.style.transform = `scale(${scale})`;
  wrapper.style.marginBottom = `${(scale - 1) * 320}px`;
}

window.addEventListener('resize', () => {
  if (AppState.currentView === 'editor' && AppState.currentZoom === 'fit') {
    applyZoom();
  }
});

// ==========================================
// 5. AUTHENTICATION & LOGIN MANAGEMENT
// ==========================================
const AUTH_KEY = 'pmt_auth_user';

function getAuthUser() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function setAuthUser(user) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(user));
  updateHeaderUserBadge(user);
}

function clearAuthUser() {
  localStorage.removeItem(AUTH_KEY);
}

function updateHeaderUserBadge(user) {
  const nameEl = document.getElementById('header-user-name');
  const roleEl = document.getElementById('header-user-role');
  const avatarEl = document.getElementById('header-user-avatar');
  if (nameEl) nameEl.textContent = user?.username || 'Pegawai';
  if (roleEl) roleEl.textContent = user?.role || 'Pegawai';
  if (avatarEl) {
    const name = user?.username || 'P';
    const initials = name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
    avatarEl.textContent = initials || 'MF';
  }
}

async function handleLoginSubmit(event) {
  if (event) event.preventDefault();
  const usernameInput = document.getElementById('login-username');
  const passwordInput = document.getElementById('login-password');
  const errorAlert = document.getElementById('login-error');
  const errorMsg = document.getElementById('login-error-msg');
  const submitBtn = document.getElementById('btn-login-submit');

  const username = (usernameInput?.value || '').trim();
  const password = (passwordInput?.value || '').trim();

  if (!username || !password) {
    if (errorAlert) {
      errorAlert.style.display = 'flex';
      if (errorMsg) errorMsg.textContent = 'Nama pegawai dan kata sandi wajib diisi.';
    }
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>Memverifikasi...</span>';
  }
  if (errorAlert) errorAlert.style.display = 'none';

  try {
    const authUser = await pmtStore.authenticate(username, password);
    if (authUser) {
      setAuthUser(authUser);
      const loginScreen = document.getElementById('login-screen');
      const appEl = document.getElementById('app');
      if (loginScreen) loginScreen.style.display = 'none';
      if (appEl) appEl.style.display = 'flex';
      
      // Load user documents and gallery instantly
      renderSidebar();
      await refreshDocumentsList();
      showListView();
      refreshGallery().catch(() => {});
      showToast(`Selamat datang, ${authUser.username}!`);
    } else {
      if (errorAlert) {
        errorAlert.style.display = 'flex';
        if (errorMsg) errorMsg.textContent = 'Nama pegawai atau kata sandi tidak sesuai. Pastikan penulisan sudah benar.';
      }
      if (passwordInput) {
        passwordInput.value = '';
        passwordInput.focus();
      }
    }
  } catch (err) {
    if (errorAlert) {
      errorAlert.style.display = 'flex';
      if (errorMsg) errorMsg.textContent = 'Terjadi kesalahan sistem: ' + err.message;
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>Masuk ke Menu Utama</span><svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>';
    }
  }
}

function handleLogout() {
  if (confirm('Apakah Anda yakin ingin keluar dari aplikasi?')) {
    clearAuthUser();
    const loginScreen = document.getElementById('login-screen');
    const appEl = document.getElementById('app');
    const pwInput = document.getElementById('login-password');
    const errAlert = document.getElementById('login-error');
    if (errAlert) errAlert.style.display = 'none';
    if (pwInput) pwInput.value = '';
    if (appEl) appEl.style.display = 'none';
    if (loginScreen) {
      loginScreen.style.display = 'flex';
      const userInput = document.getElementById('login-username');
      if (userInput) userInput.focus();
    }
    showToast('Anda telah keluar dari aplikasi.');
  }
}

function togglePasswordVisibility() {
  const pwInput = document.getElementById('login-password');
  const iconShow = document.getElementById('icon-eye-show');
  const iconHide = document.getElementById('icon-eye-hide');
  if (pwInput) {
    if (pwInput.type === 'password') {
      pwInput.type = 'text';
      if (iconShow) iconShow.style.display = 'none';
      if (iconHide) iconHide.style.display = 'block';
    } else {
      pwInput.type = 'password';
      if (iconShow) iconShow.style.display = 'block';
      if (iconHide) iconHide.style.display = 'none';
    }
  }
}

function fillAdminCredentials() {
  const userInput = document.getElementById('login-username');
  const pwInput = document.getElementById('login-password');
  const errAlert = document.getElementById('login-error');
  if (errAlert) errAlert.style.display = 'none';
  if (userInput) userInput.value = 'Mochamad Fauzie, S.Gz';
  if (pwInput) pwInput.value = '213117';
  const submitBtn = document.getElementById('btn-login-submit');
  if (submitBtn) submitBtn.focus();
}

// ==========================================
// 6. INITIALIZATION & DATA SYNC
// ==========================================
async function initApp() {
  // Purge any legacy dummy document
  try {
    const legacyDB = await new Promise((resolve) => {
      const req = indexedDB.open('AplikasiPMT_Database', 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
    if (legacyDB && legacyDB.objectStoreNames.contains('documents')) {
      const tx = legacyDB.transaction('documents', 'readwrite');
      tx.objectStore('documents').delete('doc_sample_banjaran_wetan');
    }
  } catch (e) {}

  bindGlobalEvents();
  updateCloudStatusUI();

  // Authentication check before entering main menu
  const currentUser = getAuthUser();
  const loginScreen = document.getElementById('login-screen');
  const appEl = document.getElementById('app');

  if (currentUser) {
    if (loginScreen) loginScreen.style.display = 'none';
    if (appEl) appEl.style.display = 'flex';
    updateHeaderUserBadge(currentUser);
    renderSidebar();
    await refreshDocumentsList();
    showListView();
    refreshGallery().catch(() => {});
  } else {
    if (loginScreen) loginScreen.style.display = 'flex';
    if (appEl) appEl.style.display = 'none';
    const userInput = document.getElementById('login-username');
    if (userInput && !userInput.value) {
      userInput.value = 'Mochamad Fauzie, S.Gz';
    }
  }
}

// Fetch Gallery from FOTO PMT
async function refreshGallery(force = false) {
  try {
    if (force) showToast('Memeriksa foto terbaru di Google Drive...');
    const photos = await pmtStore.getGalleryPhotos(force);
    AppState.galleryPhotos = photos;
    if (force) showToast(`Galeri diperbarui: ${photos.length} foto tersedia.`);
  } catch (err) {
    console.warn('Gallery API error:', err);
  }
  updateStatsBanner();
  renderSidebar();
  if (AppState.currentView === 'gallery') {
    renderGalleryView();
  }
}

// Refresh documents
async function refreshDocumentsList() {
  AppState.documents = await pmtStore.getDocuments();
  // Filter out any lingering sample doc
  AppState.documents = AppState.documents.filter(d => d.id !== 'doc_sample_banjaran_wetan');
  AppState.documents.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  updateStatsBanner();
  renderSidebar();
  renderDocumentList();
}

// Update Top Statistics Banner
function updateStatsBanner() {
  const totalDocsEl = document.getElementById('stat-total-docs');
  const totalPhotosEl = document.getElementById('stat-total-photos');
  const totalGalleryEl = document.getElementById('stat-total-gallery');
  const availablePhotosEl = document.getElementById('stat-available-photos');

  if (!totalDocsEl) return;

  const totalDocs = AppState.documents.length;
  let totalPhotos = 0;
  AppState.documents.forEach(doc => {
    totalPhotos += (doc.fotos ? doc.fotos.length : 0);
  });

  const totalGallery = AppState.galleryPhotos.length;
  const unusedGallery = AppState.galleryPhotos.filter(p => !p.isUsed).length;

  totalDocsEl.innerText = `${totalDocs} Dokumen`;
  totalPhotosEl.innerText = `${totalPhotos} Foto`;
  totalGalleryEl.innerText = `${totalGallery} Foto`;
  availablePhotosEl.innerText = `${unusedGallery} Foto`;
}

// Render Sidebar Navigation
function renderSidebar() {
  const listEl = document.getElementById('village-nav-list');
  if (!listEl) return;

  const counts = { ALL: AppState.documents.length };
  VILLAGES.forEach(v => {
    counts[v] = AppState.documents.filter(d => d.desa === v).length;
  });

  let html = `
    <li class="village-nav-item ${AppState.activeDesaFilter === 'ALL' ? 'active' : ''}" data-desa="ALL">
      <span>Semua Desa</span>
      <span class="village-badge">${counts.ALL}</span>
    </li>
  `;

  VILLAGES.forEach(v => {
    const isActive = AppState.activeDesaFilter === v ? 'active' : '';
    // Count stock photos in FOTO PMT for this village
    const stockCount = AppState.galleryPhotos.filter(p => p.desa === v && !p.isUsed).length;
    html += `
      <li class="village-nav-item ${isActive}" data-desa="${v}">
        <div>
          <span>Desa ${v}</span>
          ${stockCount > 0 ? `<div style="font-size: 0.6875rem; color: var(--teal-700); font-weight: 600;">Stok: ${stockCount} foto</div>` : ''}
        </div>
        <span class="village-badge">${counts[v] || 0}</span>
      </li>
    `;
  });

  listEl.innerHTML = html;

  listEl.querySelectorAll('.village-nav-item').forEach(el => {
    el.addEventListener('click', () => {
      AppState.activeDesaFilter = el.getAttribute('data-desa');
      renderSidebar();
      if (AppState.currentView === 'gallery') {
        document.getElementById('gallery-filter-desa').value = AppState.activeDesaFilter;
        renderGalleryView();
      } else {
        renderDocumentList();
      }
    });
  });
}

// ==========================================
// 6. VIEW NAVIGATION (TABS)
// ==========================================
function showListView() {
  AppState.currentView = 'list';
  document.body.classList.remove('in-editor');

  document.getElementById('list-view').style.display = 'block';
  document.getElementById('gallery-view').style.display = 'none';
  document.getElementById('editor-view').style.display = 'none';

  // Tabs highlight
  document.getElementById('tab-btn-docs').classList.add('active');
  document.getElementById('tab-btn-gallery').classList.remove('active');

  // Header toggles
  document.getElementById('btn-back-to-list').style.display = 'none';
  document.getElementById('brand-icon-box').style.display = 'flex';
  document.getElementById('btn-create-new').style.display = 'inline-flex';
  document.getElementById('editor-header-actions').style.display = 'none';
  document.getElementById('header-nav-tabs').style.display = 'flex';

  document.getElementById('nav-title').innerText = 'Aplikasi Dokumentasi Kegiatan PMT';
  document.getElementById('nav-subtitle').innerText = 'Penyusunan Format Cetak A4 Otomatis & Export Word (.docx)';

  renderDocumentList();
}

function showGalleryView() {
  AppState.currentView = 'gallery';
  document.body.classList.remove('in-editor');

  document.getElementById('list-view').style.display = 'none';
  document.getElementById('gallery-view').style.display = 'block';
  document.getElementById('editor-view').style.display = 'none';

  // Tabs highlight
  document.getElementById('tab-btn-docs').classList.remove('active');
  document.getElementById('tab-btn-gallery').classList.add('active');

  // Header toggles
  document.getElementById('btn-back-to-list').style.display = 'none';
  document.getElementById('brand-icon-box').style.display = 'flex';
  document.getElementById('btn-create-new').style.display = 'inline-flex';
  document.getElementById('editor-header-actions').style.display = 'none';
  document.getElementById('header-nav-tabs').style.display = 'flex';

  document.getElementById('nav-title').innerText = 'Galeri Stok Foto PMT';
  document.getElementById('nav-subtitle').innerText = 'Folder: G:\\My Drive\\APLIKASI PMT\\FOTO PMT';

  renderGalleryView();
}

function showEditorView() {
  AppState.currentView = 'editor';
  document.body.classList.add('in-editor');

  document.getElementById('list-view').style.display = 'none';
  document.getElementById('gallery-view').style.display = 'none';
  document.getElementById('editor-view').style.display = 'block';

  // Header toggles
  document.getElementById('btn-back-to-list').style.display = 'inline-flex';
  document.getElementById('brand-icon-box').style.display = 'none';
  document.getElementById('btn-create-new').style.display = 'none';
  document.getElementById('editor-header-actions').style.display = 'inline-flex';
  document.getElementById('header-nav-tabs').style.display = 'none';

  if (AppState.activeDoc) {
    document.getElementById('nav-title').innerText = `Desa ${AppState.activeDoc.desa || ''} — ${AppState.activeDoc.termin || ''}`;
    document.getElementById('nav-subtitle').innerText = AppState.activeDoc.tanggalCustom || 'Dokumentasi PMT Lokal';
    document.getElementById('btn-pick-folder-text').innerText = `Ambil Foto dari Folder FOTO PMT / ${AppState.activeDoc.desa || ''}`;
  }

  populateEditorForm();
  renderPhotoThumbnails();
  renderPrintPreview();
  setTimeout(applyZoom, 50);
}

// ==========================================
// 7. RENDER GALLERY VIEW
// ==========================================
function renderGalleryView() {
  const container = document.getElementById('gallery-grid-container');
  if (!container) return;

  const desaFilter = document.getElementById('gallery-filter-desa').value;
  const statusFilter = document.getElementById('gallery-filter-status').value;

  let photos = AppState.galleryPhotos;

  if (desaFilter !== 'ALL') {
    photos = photos.filter(p => p.desa === desaFilter);
  }

  if (statusFilter === 'UNUSED') {
    photos = photos.filter(p => !p.isUsed);
  } else if (statusFilter === 'USED') {
    photos = photos.filter(p => p.isUsed);
  }

  if (photos.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <svg class="empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
        </svg>
        <div class="empty-title">Tidak ada foto dalam kriteria ini</div>
        <div class="empty-desc">Pastikan foto tersimpan di sub-folder <code>FOTO PMT\\${desaFilter !== 'ALL' ? desaFilter.toUpperCase() : 'NAMA_DESA'}</code>.</div>
        <button class="btn btn-secondary" onclick="refreshGallery()">Segarkan Folder</button>
      </div>
    `;
    return;
  }

  let html = '';
  photos.forEach(photo => {
    const fullPhotoUrl = photo.url.startsWith('http') ? photo.url : `${API_BASE}${photo.url}`;
    html += `
      <div class="gallery-card ${photo.isUsed ? 'is-used' : ''}">
        <div class="gallery-card-thumb">
          <img src="${fullPhotoUrl}" alt="${photo.filename}" loading="lazy">
          <span class="gallery-badge-status ${photo.isUsed ? 'badge-used' : 'badge-unused'}">
            ${photo.isUsed ? 'SUDAH DIGUNAKAN' : 'BELUM DIGUNAKAN'}
          </span>
        </div>
        <div class="gallery-card-info">
          <div class="gallery-card-filename" title="${photo.filename}">${photo.filename}</div>
          <div class="gallery-card-desa">Desa ${photo.desa}</div>
          ${photo.isUsed && photo.usedInfo ? `
            <div class="gallery-card-used-note">
              Digunakan di: ${photo.usedInfo.desa} - ${photo.usedInfo.termin}
            </div>
          ` : `
            <div style="color: var(--emerald-600); font-weight: 600; font-size: 0.6875rem;">
              ✓ Siap dimasukkan ke dokumen
            </div>
          `}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// ==========================================
// 8. RENDER DOCUMENT LIST (DASHBOARD)
// ==========================================
function renderDocumentList() {
  const container = document.getElementById('document-grid');
  if (!container) return;

  let filtered = AppState.documents;
  if (AppState.activeDesaFilter !== 'ALL') {
    filtered = filtered.filter(d => d.desa === AppState.activeDesaFilter);
  }

  if (AppState.searchQuery.trim() !== '') {
    const q = AppState.searchQuery.toLowerCase();
    filtered = filtered.filter(d =>
      d.desa.toLowerCase().includes(q) ||
      d.termin.toLowerCase().includes(q) ||
      (d.tanggalCustom && d.tanggalCustom.toLowerCase().includes(q))
    );
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <svg class="empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
        </svg>
        <div class="empty-title">Belum ada dokumen kegiatan</div>
        <div class="empty-desc">Pilih "Buat Dokumen Baru" untuk membuat dokumen kegiatan PMT baru dan mengambil foto dari folder FOTO PMT.</div>
        <button class="btn btn-primary" onclick="createNewDocument()">
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
          Buat Dokumen Baru
        </button>
      </div>
    `;
    return;
  }

  let html = '';
  filtered.forEach(doc => {
    const photos = doc.fotos || [];
    const photoCount = photos.length;
    const pageCount = photoCount <= 6 ? (photoCount > 0 ? 1 : 0) : 1 + Math.ceil((photoCount - 6) / 9);

    let thumbStripHtml = '';
    const previewPhotos = photos.slice(0, 4);
    previewPhotos.forEach(p => {
      thumbStripHtml += `<div class="doc-thumb-item"><img src="${p.dataUrl}" alt="Foto"></div>`;
    });
    if (photoCount > 4) {
      thumbStripHtml += `<div class="doc-thumb-more">+${photoCount - 4}</div>`;
    }

    const safeId = escapeHtml(doc.id).replace(/[^a-zA-Z0-9_-]/g, '');
    const safeDesa = escapeHtml(doc.desa || '');
    const safeTermin = escapeHtml(doc.termin || '');
    const safeTanggal = escapeHtml(doc.tanggalCustom || 'Belum diisi rentang tanggal');

    html += `
      <div class="doc-card">
        <div class="doc-card-body" onclick="editDocument('${safeId}')" title="Klik untuk membuka dan mengedit">
          <div class="doc-card-top">
            <div class="doc-card-badge">
              <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path></svg>
              Desa ${safeDesa}
            </div>
            <span class="doc-card-pages-badge">${pageCount} Halaman A4</span>
          </div>

          <div class="doc-card-title">${safeTermin}</div>
          <div class="doc-card-date">${safeTanggal}</div>

          ${photoCount > 0 ? `<div class="doc-thumb-strip">${thumbStripHtml}</div>` : ''}

          <div style="font-size: 0.75rem; color: var(--slate-500); margin-top: 0.5rem;">
            <strong>${photoCount} Foto</strong> • Diperbarui: ${new Date(doc.updatedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
        </div>

        <div class="doc-card-footer">
          <button class="btn btn-primary btn-sm" onclick="openDocumentForPrint('${safeId}')" title="Buka & Cetak / Simpan PDF">
            <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
            Cetak / PDF
          </button>

          <div class="doc-card-actions">
            <button class="btn btn-secondary btn-sm" onclick="exportToWordById('${safeId}')" title="Unduh File Word (.docx)">
              <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
              Word (.docx)
            </button>
            <button class="btn btn-secondary btn-sm btn-icon" onclick="duplicateDocument('${safeId}')" title="Duplikat Dokumen">
              <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
            </button>
            <button class="btn btn-danger btn-sm btn-icon" onclick="confirmDeleteDocument('${safeId}')" title="Hapus Dokumen">
              <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// ==========================================
// 9. EDITOR & FORM CONTROLS
// ==========================================
function createNewDocument(preferredDesa = 'Banjaran Kulon') {
  AppState.activeDoc = {
    id: 'doc_' + Date.now(),
    desa: preferredDesa,
    termin: 'TERMIN 1',
    tanggalAwal: '',
    tanggalAkhir: '',
    tanggalCustom: '',
    judul: DEFAULT_DOC_CONFIG.judul,
    subJudul: DEFAULT_DOC_CONFIG.subJudul,
    kertas: 'A4',
    fotos: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  showEditorView();
}

async function editDocument(id) {
  const doc = await pmtStore.getDocumentById(id);
  if (!doc) {
    showToast('Dokumen tidak ditemukan', 'error');
    return;
  }
  AppState.activeDoc = JSON.parse(JSON.stringify(doc));
  showEditorView();
}

async function duplicateDocument(id) {
  const doc = await pmtStore.getDocumentById(id);
  if (!doc) return;
  const clone = JSON.parse(JSON.stringify(doc));
  clone.id = 'doc_' + Date.now();
  clone.termin = clone.termin + ' (Salinan)';
  clone.createdAt = new Date().toISOString();
  clone.updatedAt = new Date().toISOString();
  await pmtStore.saveDocument(clone);
  showToast(`Berhasil menduplikasi dokumen untuk Desa ${clone.desa}`);
  await refreshDocumentsList();
  await refreshGallery();
}

async function confirmDeleteDocument(id) {
  if (confirm('Apakah Anda yakin ingin menghapus dokumen ini beserta seluruh fotonya? Foto dari folder FOTO PMT yang dipakai dokumen ini akan otomatis dapat digunakan kembali.')) {
    if (AppState.activeDoc && AppState.activeDoc.id === id) {
      AppState.activeDoc = null;
    }
    await pmtStore.deleteDocument(id);
    showToast('Dokumen berhasil dihapus');
    await refreshDocumentsList();
    await refreshGallery();
  }
}

function populateEditorForm() {
  const doc = AppState.activeDoc;
  if (!doc) return;

  const desaSelect = document.getElementById('form-desa');
  let desaOptions = VILLAGES.map(v => `<option value="${v}" ${doc.desa === v ? 'selected' : ''}>${v}</option>`).join('');
  if (!VILLAGES.includes(doc.desa)) {
    desaOptions += `<option value="${doc.desa}" selected>${doc.desa}</option>`;
  }
  desaSelect.innerHTML = desaOptions;

  const terminSelect = document.getElementById('form-termin');
  const terminVal = doc.termin || 'TERMIN 1';
  let terminExists = false;
  for (let i = 0; i < terminSelect.options.length; i++) {
    if (terminSelect.options[i].value === terminVal) {
      terminExists = true;
      break;
    }
  }
  if (!terminExists && terminVal) {
    const opt = document.createElement('option');
    opt.value = terminVal;
    opt.innerText = terminVal;
    terminSelect.appendChild(opt);
  }
  terminSelect.value = terminVal;

  document.getElementById('form-tanggal-awal').value = doc.tanggalAwal || '';
  document.getElementById('form-tanggal-akhir').value = doc.tanggalAkhir || '';
  document.getElementById('form-tanggal-custom').value = doc.tanggalCustom || '';
  document.getElementById('form-judul').value = doc.judul || DEFAULT_DOC_CONFIG.judul;
  document.getElementById('form-subjudul').value = doc.subJudul || DEFAULT_DOC_CONFIG.subJudul;
}

function syncFormToState() {
  if (!AppState.activeDoc) return;
  AppState.activeDoc.desa = document.getElementById('form-desa').value;
  AppState.activeDoc.termin = document.getElementById('form-termin').value;
  AppState.activeDoc.tanggalAwal = document.getElementById('form-tanggal-awal').value;
  AppState.activeDoc.tanggalAkhir = document.getElementById('form-tanggal-akhir').value;
  AppState.activeDoc.tanggalCustom = document.getElementById('form-tanggal-custom').value;
  AppState.activeDoc.judul = document.getElementById('form-judul').value;
  AppState.activeDoc.subJudul = document.getElementById('form-subjudul').value;
  AppState.activeDoc.updatedAt = new Date().toISOString();

  document.getElementById('nav-title').innerText = `Desa ${AppState.activeDoc.desa || ''} — ${AppState.activeDoc.termin || ''}`;
  document.getElementById('nav-subtitle').innerText = AppState.activeDoc.tanggalCustom || 'Dokumentasi PMT Lokal';
  document.getElementById('btn-pick-folder-text').innerText = `Ambil Foto dari Folder FOTO PMT / ${AppState.activeDoc.desa || ''}`;

  renderPrintPreview();
}

async function saveCurrentDocument() {
  if (!AppState.activeDoc) return;
  syncFormToState();
  await pmtStore.saveDocument(AppState.activeDoc);
  const status = pmtStore.getStatus();
  showToast(status.provider === 'drive' ? 'Dokumen tersimpan & disinkronkan ke Google Drive!' : (status.provider === 'd1' ? 'Dokumen tersimpan ke Cloudflare D1!' : 'Dokumen berhasil disimpan secara lokal!'));
  await refreshDocumentsList();
  await refreshGallery();
}

// ==========================================
// 10. PHOTO PICKER MODAL (From FOTO PMT)
// ==========================================
async function openPhotoPickerModal() {
  if (!AppState.activeDoc) return;
  syncFormToState();
  await refreshGallery();

  const desa = AppState.activeDoc.desa;
  const modal = document.getElementById('photo-picker-modal');
  const title = document.getElementById('modal-picker-title');
  const subtitle = document.getElementById('modal-picker-subtitle');
  const grid = document.getElementById('modal-picker-grid');

  title.innerText = `Pilih Foto untuk Desa ${desa}`;
  subtitle.innerHTML = `Folder: FOTO PMT\\${desa.toUpperCase()} &nbsp;&bull;&nbsp; <a href="javascript:void(0)" onclick="refreshPickerPhotos('${desa}')" style="color: var(--teal-600); font-weight: 600; text-decoration: underline;">Segarkan Foto Drive</a>`;

  // Filter gallery photos for this village
  const villagePhotos = AppState.galleryPhotos.filter(p => p.desa.toLowerCase() === desa.toLowerCase());
  AppState.selectedModalPhotos.clear();

  if (villagePhotos.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="padding: 2rem;">
        <div class="empty-title">Belum ada foto di folder Desa ${desa}</div>
        <div class="empty-desc">
          Silakan letakkan foto kegiatan di folder: <br>
          <code>G:\\My Drive\\APLIKASI PMT\\FOTO PMT\\${desa.toUpperCase()}</code>
        </div>
      </div>
    `;
    modal.style.display = 'flex';
    updatePickerSelectedCount();
    return;
  }

  // Check which photos are already in the current document
  const currentDocPhotoPaths = new Set(
    (AppState.activeDoc.fotos || [])
      .map(f => f.galleryPath ? f.galleryPath.toLowerCase() : (f.filename ? f.filename.toLowerCase() : ''))
      .filter(Boolean)
  );

  let html = '<div class="gallery-grid" style="grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));">';

  villagePhotos.forEach(photo => {
    const isUsedInOtherDoc = photo.isUsed && (!photo.usedInfo || photo.usedInfo.docId !== AppState.activeDoc.id);
    const isAlreadyInThisDoc = currentDocPhotoPaths.has(photo.relativePath.toLowerCase()) || currentDocPhotoPaths.has(photo.filename.toLowerCase());

    const isLocked = isUsedInOtherDoc || isAlreadyInThisDoc;
    const fullPhotoUrl = photo.url.startsWith('http') ? photo.url : `${API_BASE}${photo.url}`;

    html += `
      <div class="gallery-card ${isLocked ? 'is-used' : ''}" style="cursor: ${isLocked ? 'not-allowed' : 'pointer'};" onclick="togglePickerPhoto('${photo.id}', ${isLocked})">
        <div class="gallery-card-thumb">
          <img src="${fullPhotoUrl}" alt="${photo.filename}" loading="lazy">
          ${isLocked ? `
            <span class="gallery-badge-status badge-used">
              ${isAlreadyInThisDoc ? 'SUDAH DI DOKUMEN INI' : `DIPAKAI (${photo.usedInfo ? photo.usedInfo.termin : 'TERMIN LAIN'})`}
            </span>
          ` : `
            <span class="gallery-badge-status badge-unused">TERSEDIA</span>
          `}

          <div style="position: absolute; bottom: 6px; right: 6px;">
            <input type="checkbox" id="chk_${photo.id}" ${isLocked ? 'disabled' : ''} style="transform: scale(1.4); cursor: pointer;" onclick="event.stopPropagation(); togglePickerPhoto('${photo.id}', ${isLocked})">
          </div>
        </div>

        <div class="gallery-card-info">
          <div class="gallery-card-filename" title="${photo.filename}">${photo.filename}</div>
          ${isLocked ? `
            <div class="gallery-card-used-note">Tidak bisa digunakan lagi</div>
          ` : `
            <div style="color: var(--teal-700); font-weight: 600; font-size: 0.6875rem;">Siap dipilih</div>
          `}
        </div>
      </div>
    `;
  });

  html += '</div>';
  grid.innerHTML = html;
  modal.style.display = 'flex';
  updatePickerSelectedCount();
}

function closePhotoPickerModal() {
  document.getElementById('photo-picker-modal').style.display = 'none';
}

function togglePickerPhoto(photoId, isLocked) {
  if (isLocked) return;
  const chk = document.getElementById(`chk_${photoId}`);
  if (!chk) return;

  if (AppState.selectedModalPhotos.has(photoId)) {
    AppState.selectedModalPhotos.delete(photoId);
    chk.checked = false;
  } else {
    AppState.selectedModalPhotos.add(photoId);
    chk.checked = true;
  }
  updatePickerSelectedCount();
}

function updatePickerSelectedCount() {
  const count = AppState.selectedModalPhotos.size;
  const countEl = document.getElementById('modal-picker-selected-count');
  const btnAdd = document.getElementById('btn-add-selected-photos');
  if (countEl) countEl.innerText = `${count} Terpilih`;
  if (btnAdd) btnAdd.innerText = `Tambahkan ${count} Foto ke Dokumen`;
}

function pickerSelectBatch(targetCount) {
  pickerDeselectAll();
  const desa = AppState.activeDoc.desa;
  const currentDocPhotoPaths = new Set(
    (AppState.activeDoc.fotos || [])
      .map(f => f.galleryPath ? f.galleryPath.toLowerCase() : '')
  );

  const available = AppState.galleryPhotos.filter(p =>
    p.desa.toLowerCase() === desa.toLowerCase() &&
    !p.isUsed &&
    !currentDocPhotoPaths.has(p.relativePath.toLowerCase())
  );

  const toPick = available.slice(0, targetCount);
  toPick.forEach(p => {
    AppState.selectedModalPhotos.add(p.id);
    const chk = document.getElementById(`chk_${p.id}`);
    if (chk) chk.checked = true;
  });
  updatePickerSelectedCount();
}

function pickerSelectAllUnused() {
  pickerDeselectAll();
  const desa = AppState.activeDoc.desa;
  const currentDocPhotoPaths = new Set(
    (AppState.activeDoc.fotos || [])
      .map(f => f.galleryPath ? f.galleryPath.toLowerCase() : '')
  );

  const available = AppState.galleryPhotos.filter(p =>
    p.desa.toLowerCase() === desa.toLowerCase() &&
    !p.isUsed &&
    !currentDocPhotoPaths.has(p.relativePath.toLowerCase())
  );

  available.forEach(p => {
    AppState.selectedModalPhotos.add(p.id);
    const chk = document.getElementById(`chk_${p.id}`);
    if (chk) chk.checked = true;
  });
  updatePickerSelectedCount();
}

function pickerDeselectAll() {
  AppState.selectedModalPhotos.clear();
  document.querySelectorAll('#modal-picker-grid input[type="checkbox"]').forEach(chk => {
    if (!chk.disabled) chk.checked = false;
  });
  updatePickerSelectedCount();
}

async function addSelectedPhotosToDocument() {
  if (AppState.selectedModalPhotos.size === 0) {
    showToast('Pilih minimal 1 foto terlebih dahulu', 'error');
    return;
  }

  const selectedIds = Array.from(AppState.selectedModalPhotos);
  const selectedPhotoObjects = AppState.galleryPhotos.filter(p => selectedIds.includes(p.id));

  closePhotoPickerModal();
  showToast(`Sedang memproses ${selectedPhotoObjects.length} foto ke format cetak...`);

  try {
    const newPhotos = [];
    for (let i = 0; i < selectedPhotoObjects.length; i++) {
      const p = selectedPhotoObjects[i];
      const fullUrl = p.url.startsWith('http') ? p.url : `${API_BASE}${p.url}`;
      const compressedDataUrl = await ImageOptimizer.compressAndOrient(fullUrl, 1600, 1600, 0.88);
      newPhotos.push({
        id: 'photo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        filename: p.filename,
        galleryPath: p.relativePath,
        dataUrl: compressedDataUrl,
        rotation: 0
      });
    }

    if (!AppState.activeDoc.fotos) {
      AppState.activeDoc.fotos = [];
    }
    AppState.activeDoc.fotos.push(...newPhotos);

    renderPhotoThumbnails();
    renderPrintPreview();
    await saveCurrentDocument();
    showToast(`Berhasil menambahkan ${newPhotos.length} foto! Foto kini ditandai sudah digunakan.`);
  } catch (err) {
    console.error('Error adding gallery photos:', err);
    showToast('Gagal memproses beberapa foto', 'error');
  }
}

// ==========================================
// 11. MANUAL PHOTO UPLOAD
// ==========================================
async function handlePhotoUpload(files) {
  if (!files || files.length === 0 || !AppState.activeDoc) return;

  const dropzone = document.getElementById('photo-dropzone');
  const originalHtml = dropzone.innerHTML;
  dropzone.innerHTML = `
    <div style="padding: 1rem; text-align: center;">
      <svg width="24" height="24" fill="none" viewBox="0 0 24 24" style="animation: spin 1s linear infinite; margin: 0 auto 0.35rem; color: var(--teal-700);">
        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" style="opacity: 0.25;"></circle>
        <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <div style="font-weight: 600; color: var(--slate-800); font-size: 0.8125rem;">Memproses foto...</div>
    </div>
  `;

  try {
    const newPhotos = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;

      const compressedDataUrl = await ImageOptimizer.compressAndOrient(file, 1600, 1600, 0.88);
      newPhotos.push({
        id: 'photo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        filename: file.name,
        galleryPath: null,
        dataUrl: compressedDataUrl,
        rotation: 0
      });
    }

    if (!AppState.activeDoc.fotos) {
      AppState.activeDoc.fotos = [];
    }
    AppState.activeDoc.fotos.push(...newPhotos);

    showToast(`Berhasil menambahkan ${newPhotos.length} foto!`);
  } catch (err) {
    console.error('Error processing images:', err);
    showToast('Gagal memproses gambar', 'error');
  } finally {
    dropzone.innerHTML = originalHtml;
    renderPhotoThumbnails();
    renderPrintPreview();
    await saveCurrentDocument();
  }
}

function renderPhotoThumbnails() {
  const container = document.getElementById('photo-manager-list');
  const countEl = document.getElementById('photo-counter-text');
  if (!container || !AppState.activeDoc) return;

  const photos = AppState.activeDoc.fotos || [];
  const pageCount = photos.length <= 6 ? (photos.length > 0 ? 1 : 0) : 1 + Math.ceil((photos.length - 6) / 9);

  if (countEl) {
    countEl.innerText = `Total ${photos.length} Foto (${pageCount} Halaman)`;
  }

  const indicatorText = document.getElementById('preview-page-indicator-text');
  if (indicatorText) {
    indicatorText.innerText = `📄 Pratinjau Cetak: ${pageCount || 1} Halaman A4 (${photos.length} Foto)`;
  }

  if (photos.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 1.5rem; color: var(--slate-400); font-size: 0.8125rem;">
        Belum ada foto yang dimasukkan. Klik "Ambil Foto dari Folder FOTO PMT" di atas.
      </div>
    `;
    return;
  }

  let html = '';
  photos.forEach((photo, idx) => {
    let pageNum = 1;
    if (idx >= 6) {
      pageNum = 2 + Math.floor((idx - 6) / 9);
    }

    html += `
      <div class="photo-thumb-card" data-index="${idx}">
        <img src="${photo.dataUrl}" alt="Foto ${idx + 1}" loading="lazy">
        <span class="photo-thumb-badge">#${idx + 1}</span>
        <span class="photo-thumb-page-badge">Hal ${pageNum}</span>
        <div class="photo-thumb-actions">
          <button class="photo-action-btn" onclick="rotatePhoto(${idx})" title="Putar 90°">
            <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
          </button>
          <button class="photo-action-btn" onclick="movePhoto(${idx}, -1)" ${idx === 0 ? 'disabled style="opacity:0.3;"' : ''} title="Geser Mundur">
            <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
          </button>
          <button class="photo-action-btn" onclick="movePhoto(${idx}, 1)" ${idx === photos.length - 1 ? 'disabled style="opacity:0.3;"' : ''} title="Geser Maju">
            <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
          </button>
          <button class="photo-action-btn delete" onclick="deletePhoto(${idx})" title="Hapus Foto">
            <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
          </button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

async function rotatePhoto(index) {
  if (!AppState.activeDoc || !AppState.activeDoc.fotos[index]) return;
  const photo = AppState.activeDoc.fotos[index];
  photo.dataUrl = await ImageOptimizer.rotateImage(photo.dataUrl, 90);
  renderPhotoThumbnails();
  renderPrintPreview();
}

function movePhoto(index, delta) {
  if (!AppState.activeDoc) return;
  const photos = AppState.activeDoc.fotos;
  const targetIndex = index + delta;
  if (targetIndex < 0 || targetIndex >= photos.length) return;

  const temp = photos[index];
  photos[index] = photos[targetIndex];
  photos[targetIndex] = temp;

  renderPhotoThumbnails();
  renderPrintPreview();
}

async function deletePhoto(index) {
  if (!AppState.activeDoc) return;
  AppState.activeDoc.fotos.splice(index, 1);
  renderPhotoThumbnails();
  renderPrintPreview();
  await saveCurrentDocument();
}

async function clearAllPhotos() {
  if (!AppState.activeDoc) return;
  if (confirm('Hapus semua foto di dokumen ini? Foto dari folder FOTO PMT akan dapat dipilih kembali.')) {
    AppState.activeDoc.fotos = [];
    renderPhotoThumbnails();
    renderPrintPreview();
    await saveCurrentDocument();
  }
}

// ==========================================
// 12. PRINT & PREVIEW ENGINE
// ==========================================
function renderPrintPreview() {
  const container = document.getElementById('print-preview-sheets');
  if (!container || !AppState.activeDoc) return;

  const doc = AppState.activeDoc;
  const photos = doc.fotos || [];

  const pages = [];
  if (photos.length === 0) {
    pages.push([]);
  } else {
    pages.push(photos.slice(0, 6));
    let remaining = photos.slice(6);
    while (remaining.length > 0) {
      pages.push(remaining.slice(0, 9));
      remaining = remaining.slice(9);
    }
  }

  let html = '';
  pages.forEach((pagePhotos, pageIndex) => {
    const isFirstPage = pageIndex === 0;
    const pageNum = pageIndex + 1;
    const totalPages = pages.length;

    html += `
      <div class="document-sheet" id="print-sheet-${pageNum}">
        ${isFirstPage ? `
          <div class="document-sheet-header">
            <div class="doc-header-line-1">${escapeHtml(doc.judul || 'DOKUMENTASI KEGIATAN')}</div>
            <div class="doc-header-line-2">${escapeHtml(doc.subJudul || 'PMT LOKAL IBU HAMIL KEK DAN BALITA BERMASALAH GIZI')}</div>
            <div class="doc-header-line-3">DESA ${escapeHtml(doc.desa ? doc.desa.toUpperCase() : '')}</div>
            <div class="doc-header-line-4">${escapeHtml(doc.termin ? doc.termin.toUpperCase() : '')}</div>
            <div class="doc-header-line-5">${escapeHtml(doc.tanggalCustom ? doc.tanggalCustom.toUpperCase() : '')}</div>
          </div>
        ` : ''}

        <div class="document-photo-grid ${isFirstPage ? 'grid-page-1' : 'grid-subsequent'}">
          ${pagePhotos.map((photo, pIdx) => `
            <div class="photo-cell">
              <img src="${photo.dataUrl}" alt="Dokumentasi ${(pageIndex === 0 ? pIdx + 1 : 6 + (pageIndex - 1) * 9 + pIdx + 1)}">
            </div>
          `).join('')}
        </div>

        <div class="sheet-page-indicator">Halaman ${pageNum} dari ${totalPages}</div>
      </div>
    `;
  });

  container.innerHTML = html;
  applyZoom();
}

function triggerPrint() {
  window.print();
}

async function openDocumentForPrint(id) {
  await editDocument(id);
  setTimeout(() => {
    window.print();
  }, 450);
}

// ==========================================
// 13. DOCX (MICROSOFT WORD) EXPORT ENGINE
// ==========================================
async function exportToWordById(id) {
  const doc = await pmtStore.getDocumentById(id);
  if (!doc) {
    showToast('Dokumen tidak ditemukan', 'error');
    return;
  }
  await generateAndDownloadDocx(doc);
}

async function exportActiveDocumentToWord() {
  if (!AppState.activeDoc) return;
  syncFormToState();
  await generateAndDownloadDocx(AppState.activeDoc);
}

async function generateAndDownloadDocx(doc) {
  if (typeof docx === 'undefined') {
    showToast('Pustaka DOCX belum siap dimuat.', 'error');
    return;
  }

  showToast('Sedang membuat file Word (.docx)... Mohon tunggu...');

  try {
    const { Document, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, AlignmentType, WidthType, BorderStyle, PageBreak } = docx;

    const photos = doc.fotos || [];

    const dataUrlToUint8Array = (dataUrl) => {
      const base64 = dataUrl.split(',')[1];
      const binaryString = atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    };

    const pages = [];
    if (photos.length === 0) {
      pages.push([]);
    } else {
      pages.push(photos.slice(0, 6));
      let remaining = photos.slice(6);
      while (remaining.length > 0) {
        pages.push(remaining.slice(0, 9));
        remaining = remaining.slice(9);
      }
    }

    const docChildren = [];

    pages.forEach((pagePhotos, pageIdx) => {
      const isFirstPage = pageIdx === 0;

      if (!isFirstPage) {
        docChildren.push(new Paragraph({ children: [new PageBreak()] }));
      }

      if (isFirstPage) {
        docChildren.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 40 },
            children: [
              new TextRun({
                text: doc.judul || 'DOKUMENTASI KEGIATAN',
                bold: true,
                size: 26,
                font: 'Calibri'
              })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 40 },
            children: [
              new TextRun({
                text: doc.subJudul || 'PMT LOKAL IBU HAMIL KEK DAN BALITA BERMASALAH GIZI',
                bold: true,
                size: 22,
                font: 'Calibri'
              })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 40 },
            children: [
              new TextRun({
                text: `DESA ${doc.desa ? doc.desa.toUpperCase() : ''}`,
                bold: true,
                size: 22,
                font: 'Calibri'
              })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 40 },
            children: [
              new TextRun({
                text: doc.termin ? doc.termin.toUpperCase() : '',
                bold: true,
                size: 22,
                font: 'Calibri'
              })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: doc.tanggalCustom ? doc.tanggalCustom.toUpperCase() : '',
                bold: true,
                size: 21,
                font: 'Calibri'
              })
            ]
          })
        );
      }

      const tableRows = [];
      const numRows = isFirstPage ? 2 : 3;
      const targetImgWidth = 195;
      const targetImgHeight = isFirstPage ? 260 : 215;

      for (let r = 0; r < numRows; r++) {
        const rowCells = [];
        for (let c = 0; c < 3; c++) {
          const photoIndex = r * 3 + c;
          const photo = pagePhotos[photoIndex];

          let cellChildren = [];
          if (photo) {
            try {
              const imageBytes = dataUrlToUint8Array(photo.dataUrl);
              cellChildren = [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 15, after: 15 },
                  children: [
                    new ImageRun({
                      data: imageBytes,
                      transformation: {
                        width: targetImgWidth,
                        height: targetImgHeight
                      }
                    })
                  ]
                })
              ];
            } catch (imgErr) {
              cellChildren = [new Paragraph({ text: '' })];
            }
          } else {
            cellChildren = [new Paragraph({ text: '' })];
          }

          rowCells.push(
            new TableCell({
              width: { size: 33, type: WidthType.PERCENTAGE },
              borders: {
                top: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                left: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                right: { style: BorderStyle.SINGLE, size: 4, color: '000000' }
              },
              children: cellChildren
            })
          );
        }

        tableRows.push(new TableRow({ children: rowCells }));
      }

      docChildren.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: tableRows
        })
      );
    });

    const wordDoc = new Document({
      sections: [
        {
          properties: {
            page: {
              size: {
                width: 11906,
                height: 16838
              },
              margin: {
                top: 850,
                bottom: 850,
                left: 850,
                right: 850
              }
            }
          },
          children: docChildren
        }
      ]
    });

    const blob = await docx.Packer.toBlob(wordDoc);
    const filename = `DOKUMENTASI_PMT_${(doc.desa || 'DESA').replace(/\s+/g, '_')}_${(doc.termin || 'TERMIN').replace(/\s+/g, '_')}.docx`;
    saveAs(blob, filename);
    showToast(`Dokumen Word "${filename}" berhasil diunduh!`);
  } catch (error) {
    console.error('Error generating docx:', error);
    showToast('Gagal membuat dokumen Word: ' + error.message, 'error');
  }
}

// ==========================================
// 14. GLOBAL EVENT LISTENERS
// ==========================================
function bindGlobalEvents() {
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      AppState.searchQuery = e.target.value;
      renderDocumentList();
    });
  }

  const galDesa = document.getElementById('gallery-filter-desa');
  if (galDesa) galDesa.addEventListener('change', renderGalleryView);

  const galStatus = document.getElementById('gallery-filter-status');
  if (galStatus) galStatus.addEventListener('change', renderGalleryView);

  const tAwal = document.getElementById('form-tanggal-awal');
  const tAkhir = document.getElementById('form-tanggal-akhir');
  const updateCustomDate = () => {
    if (tAwal.value && tAkhir.value) {
      const formatted = formatIndonesianDateRange(tAwal.value, tAkhir.value);
      document.getElementById('form-tanggal-custom').value = formatted;
      syncFormToState();
    }
  };
  if (tAwal) tAwal.addEventListener('change', updateCustomDate);
  if (tAkhir) tAkhir.addEventListener('change', updateCustomDate);

  ['form-desa', 'form-termin', 'form-tanggal-custom', 'form-judul', 'form-subjudul'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', syncFormToState);
      el.addEventListener('change', syncFormToState);
    }
  });

  const dropzone = document.getElementById('photo-dropzone');
  const fileInput = document.getElementById('photo-file-input');

  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
      handlePhotoUpload(e.target.files);
      fileInput.value = '';
    });

    ['dragenter', 'dragover'].forEach(name => {
      dropzone.addEventListener(name, (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(name => {
      dropzone.addEventListener(name, (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      if (e.dataTransfer && e.dataTransfer.files) {
        handlePhotoUpload(e.dataTransfer.files);
      }
    });
  }

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
      if (AppState.currentView === 'editor') {
        e.preventDefault();
        triggerPrint();
      }
    }
  });
}

// Global scope bindings
window.createNewDocument = createNewDocument;
window.editDocument = editDocument;
window.duplicateDocument = duplicateDocument;
window.confirmDeleteDocument = confirmDeleteDocument;
window.showListView = showListView;
window.showGalleryView = showGalleryView;
window.showEditorView = showEditorView;
window.saveCurrentDocument = saveCurrentDocument;
window.rotatePhoto = rotatePhoto;
window.movePhoto = movePhoto;
window.deletePhoto = deletePhoto;
window.clearAllPhotos = clearAllPhotos;
window.triggerPrint = triggerPrint;
window.openDocumentForPrint = openDocumentForPrint;
window.exportToWordById = exportToWordById;
window.exportActiveDocumentToWord = exportActiveDocumentToWord;
window.setZoom = setZoom;
window.refreshGallery = refreshGallery;
window.openPhotoPickerModal = openPhotoPickerModal;
window.closePhotoPickerModal = closePhotoPickerModal;
window.togglePickerPhoto = togglePickerPhoto;
window.pickerSelectBatch = pickerSelectBatch;
window.pickerSelectAllUnused = pickerSelectAllUnused;
window.pickerDeselectAll = pickerDeselectAll;
window.addSelectedPhotosToDocument = addSelectedPhotosToDocument;
window.handleLoginSubmit = handleLoginSubmit;
window.handleLogout = handleLogout;
window.togglePasswordVisibility = togglePasswordVisibility;
window.fillAdminCredentials = fillAdminCredentials;
window.openCloudConfigModal = openCloudConfigModal;
window.closeCloudConfigModal = closeCloudConfigModal;
window.saveCloudConfig = saveCloudConfig;
window.refreshPickerPhotos = async function(desa) {
  showToast('Memeriksa foto terbaru di Google Drive...');
  await refreshGallery(true);
  openPhotoPickerModal();
};

document.addEventListener('DOMContentLoaded', initApp);
