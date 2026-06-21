const StorageAPI = {
  async getProducts() {
    const r = await chrome.storage.local.get('products');
    return r.products || [];
  },
  async saveProducts(list) {
    await chrome.storage.local.set({ products: list });
  },
  async addCheckLog(log) {
    const r = await chrome.storage.local.get('checkLogs');
    const list = r.checkLogs || [];
    list.unshift({ id: `log_${Date.now()}`, ...log, createdAt: Date.now() });
    if (list.length > 50) list.length = 50;
    await chrome.storage.local.set({ checkLogs: list });
    return list[0];
  },
  async getCheckLogs(limit = 20) {
    const r = await chrome.storage.local.get('checkLogs');
    const list = r.checkLogs || [];
    return limit ? list.slice(0, limit) : list;
  },
  async getLastCheckLog() {
    const r = await chrome.storage.local.get('checkLogs');
    const list = r.checkLogs || [];
    return list[0] || null;
  },
  async getGroupPrefs() {
    const r = await chrome.storage.local.get('groupPrefs');
    return r.groupPrefs || {};
  },
  async saveGroupPrefs(prefs) {
    await chrome.storage.local.set({ groupPrefs: prefs });
  },
  async setPreferredProduct(groupName, productId) {
    const prefs = await this.getGroupPrefs();
    prefs[groupName] = { ...(prefs[groupName] || {}), preferredProductId: productId };
    await this.saveGroupPrefs(prefs);
    return prefs;
  },
  async getGroupSort(groupName) {
    const prefs = await this.getGroupPrefs();
    return prefs[groupName]?.sortBy || 'currentPrice';
  },
  async setGroupSort(groupName, sortBy) {
    const prefs = await this.getGroupPrefs();
    prefs[groupName] = { ...(prefs[groupName] || {}), sortBy };
    await this.saveGroupPrefs(prefs);
    return prefs;
  },
  async addProduct(product) {
    const list = await this.getProducts();
    const idx = list.findIndex(p => p.id === product.id);
    if (idx >= 0) list[idx] = product;
    else list.unshift(product);
    await this.saveProducts(list);
    return product;
  },
  async updateProduct(id, patch) {
    const list = await this.getProducts();
    const idx = list.findIndex(p => p.id === id);
    if (idx < 0) throw new Error('Product not found');
    list[idx] = { ...list[idx], ...patch, updatedAt: Date.now() };
    await this.saveProducts(list);
    return list[idx];
  },
  async deleteProduct(id) {
    const list = await this.getProducts();
    const filtered = list.filter(p => p.id !== id);
    await this.saveProducts(filtered);
    const key = `hist_${id}`;
    await chrome.storage.local.remove(key);
    try {
      const db = await openDB();
      const tx = db.transaction('priceHistory', 'readwrite');
      const store = tx.objectStore('priceHistory');
      const idx = store.index('productId');
      const cursor = idx.openCursor(IDBKeyRange.only(id));
      return new Promise((resolve) => {
        cursor.onsuccess = (e) => {
          const c = e.target.result;
          if (c) { c.delete(); c.continue(); }
          else resolve();
        };
        tx.oncomplete = resolve;
      });
    } catch (_) {}
  },
  async getSettings() {
    const r = await chrome.storage.local.get('settings');
    return r.settings || {};
  },
  async saveSettings(settings) {
    await chrome.storage.local.set({ settings });
  },
  async getPriceHistory(productId) {
    try {
      const db = await openDB();
      const tx = db.transaction('priceHistory', 'readonly');
      const store = tx.objectStore('priceHistory');
      const idx = store.index('productId');
      const req = idx.getAll(IDBKeyRange.only(productId));
      return new Promise((resolve) => {
        req.onsuccess = () => {
          const result = (req.result || []).sort((a, b) => a.timestamp - b.timestamp);
          resolve(result);
        };
        req.onerror = async () => {
          resolve((await chrome.storage.local.get(`hist_${productId}`))[`hist_${productId}`] || []);
        };
      });
    } catch (_) {
      const key = `hist_${productId}`;
      const r = await chrome.storage.local.get(key);
      return r[key] || [];
    }
  }
};

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('priceTrackerDB', 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('priceHistory')) {
        const store = db.createObjectStore('priceHistory', { autoIncrement: true });
        store.createIndex('productId', 'productId');
        store.createIndex('timestamp', 'timestamp');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

self.StorageAPI = StorageAPI;
self.openDB = openDB;
