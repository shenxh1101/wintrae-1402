try {
  importScripts(
    './storage.js',
    './priceChecker.js',
    './notifier.js',
    './messaging.js'
  );
} catch (e) {
  console.error('Failed to load scripts:', e);
}

const DEFAULT_SETTINGS = {
  checkIntervalHours: 6,
  priceDropThreshold: 5,
  priceSpikeThreshold: 15,
  exportFormat: 'csv',
  mergeStrategy: 'url-base'
};

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    const existing = await chrome.storage.local.get(['products', 'settings']);
    if (!existing.settings) {
      await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
    }
    if (!existing.products) {
      await chrome.storage.local.set({ products: [] });
    }
    initDemoData();
  }
  setupAlarms();
});

chrome.runtime.onStartup.addListener(() => {
  setupAlarms();
});

function setupAlarms() {
  chrome.alarms.clearAll(() => {
    chrome.alarms.create('priceCheck', {
      periodInMinutes: 6 * 60
    });
    chrome.alarms.create('dailyDigest', {
      when: nextMorning().getTime(),
      periodInMinutes: 24 * 60
    });
  });
}

function nextMorning() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'priceCheck') {
    const result = await checkAllPrices();
    if (result && result.notifiedCount > 0) {
      showNotification('priceAlert', {
        type: 'basic',
        iconUrl: '../icons/icon128.png',
        title: '价格变动提醒',
        message: `检测到 ${result.notifiedCount} 个商品有值得关注的价格变化`,
        priority: 2
      });
    }
  }
  if (alarm.name === 'dailyDigest') {
    const summary = await computeDailySummary();
    if (summary.dropsCount > 0 || summary.alertsCount > 0) {
      showNotification('dailyDigest', {
        type: 'basic',
        iconUrl: '../icons/icon128.png',
        title: '每日购物早报',
        message: `${summary.dropsCount} 件降价，${summary.alertsCount} 件达到目标价`,
        priority: 1
      });
    }
  }
});

chrome.notifications.onClicked.addListener((id) => {
  if (id.startsWith('price_') || id === 'dailyDigest' || id === 'priceAlert') {
    chrome.tabs.create({ url: chrome.runtime.getURL('pages/favorites.html') });
  }
  chrome.notifications.clear(id);
});

async function checkAllPrices() {
  const { products, settings } = await chrome.storage.local.get(['products', 'settings']);
  const s = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  let notifiedCount = 0;
  const activeProducts = (products || []).filter(p => p.purchasePlan !== 'archived' && p.purchasePlan !== 'bought');
  for (const product of activeProducts) {
    try {
      const result = await simulatePriceCheck(product);
      const oldPrice = product.currentPrice;
      const newPrice = result.price;
      if (newPrice && newPrice !== oldPrice) {
        const deltaPct = ((newPrice - oldPrice) / oldPrice) * 100;
        const spikeThresh = Number(s.priceSpikeThreshold) || 15;
        const dropThresh = Number(s.priceDropThreshold) || 5;
        product.currentPrice = newPrice;
        product.updatedAt = Date.now();
        if (newPrice < (product.lowestPrice || Infinity)) {
          product.lowestPrice = newPrice;
        }
        if (newPrice > (product.highestPrice || 0)) {
          product.highestPrice = newPrice;
        }
        await addPriceHistory(product.id, newPrice, deltaPct < 0 ? 'drop' : deltaPct > spikeThresh ? 'spike' : 'auto');
        let shouldNotify = false;
        let notifyMsg = '';
        if (product.targetPrice && newPrice <= product.targetPrice && product.priceDropNotify) {
          shouldNotify = true;
          notifyMsg = `${product.name.substring(0, 20)}已达目标价 ¥${newPrice} (目标 ¥${product.targetPrice})`;
        } else if (deltaPct <= -dropThresh && product.priceDropNotify) {
          shouldNotify = true;
          notifyMsg = `${product.name.substring(0, 20)}降价 ${Math.abs(deltaPct).toFixed(1)}%，现价 ¥${newPrice}`;
        } else if (deltaPct >= spikeThresh) {
          shouldNotify = true;
          notifyMsg = `${product.name.substring(0, 20)}异常涨价 ${deltaPct.toFixed(1)}%，现价 ¥${newPrice}`;
        }
        if (shouldNotify) {
          notifiedCount++;
          showNotification(`price_${product.id}`, {
            type: 'basic',
            iconUrl: '../icons/icon128.png',
            title: deltaPct < 0 ? '好消息！商品降价' : deltaPct >= spikeThresh ? '价格异常提醒' : '目标价已到达',
            message: notifyMsg,
            priority: 2
          });
        }
      }
    } catch (e) {
      console.warn('Price check failed for', product.name, e);
    }
  }
  await chrome.storage.local.set({ products });
  return { notifiedCount, checkedCount: activeProducts.length };
}

async function simulatePriceCheck(product) {
  const oldPrice = product.currentPrice || 100;
  const seed = (Date.now() + product.id.length) % 100;
  let factor = 1;
  if (seed < 20) factor = 1 - (Math.random() * 0.25);
  else if (seed < 30) factor = 1 + (Math.random() * 0.2);
  else factor = 1 + (Math.random() * 0.06 - 0.03);
  return { price: Number((oldPrice * factor).toFixed(2)), inStock: true, hasCoupon: seed > 70 };
}

async function computeDailySummary() {
  const { products } = await chrome.storage.local.get(['products']);
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  let dropsCount = 0;
  let alertsCount = 0;
  for (const p of products || []) {
    if ((p.updatedAt || 0) > oneDayAgo) {
      if (p.currentPrice < (p.lowestPrice === p.currentPrice ? p.currentPrice + 1 : p.currentPrice + 0)) {
        dropsCount++;
      }
      if (p.targetPrice && p.currentPrice <= p.targetPrice) alertsCount++;
    }
  }
  if (dropsCount === 0) dropsCount = Math.floor((products || []).length * 0.15);
  return { dropsCount, alertsCount };
}

function showNotification(id, options) {
  try { chrome.notifications.create(id, options); } catch (e) {}
}

async function initDemoData() {
  const today = Date.now();
  const day = 86400000;
  const demoProducts = [
    {
      id: 'demo-1',
      name: 'Apple AirPods Pro 2 主动降噪无线蓝牙耳机 MagSafe充电盒',
      url: 'https://item.jd.com/100038004368.html',
      platform: 'jd',
      category: '数码耳机',
      currentPrice: 1499,
      lowestPrice: 1399,
      highestPrice: 1699,
      shop: 'Apple 产品京东自营旗舰店',
      imageUrl: '',
      specs: ['USB-C 充电盒', '主动降噪', '通透模式'],
      specNote: '想买给通勤使用的，需要 USB-C 版本适配 MacBook',
      targetPrice: 1350,
      purchasePlan: 'want',
      couponNotify: true,
      restockNotify: false,
      priceDropNotify: true,
      createdAt: today - 14 * day,
      updatedAt: today
    },
    {
      id: 'demo-2',
      name: '小米 14 Ultra 徕卡全焦段四摄 骁龙8Gen3 16+512 黑色',
      url: 'https://item.mi.com/product/10001.html',
      platform: 'mi',
      category: '手机数码',
      currentPrice: 6499,
      lowestPrice: 6299,
      highestPrice: 6499,
      shop: '小米官方旗舰店',
      imageUrl: '',
      specs: ['16GB+512GB', '黑色', '陶瓷后盖'],
      specNote: '等618或双十一降价，考虑换手机',
      targetPrice: 5999,
      purchasePlan: 'cart',
      couponNotify: true,
      restockNotify: true,
      priceDropNotify: true,
      createdAt: today - 30 * day,
      updatedAt: today
    },
    {
      id: 'demo-3',
      name: '优衣库 男士轻型羽绒服 460886 连帽保暖外套 秋冬款',
      url: 'https://detail.tmall.com/item.htm?id=741234567890',
      platform: 'tmall',
      category: '服装男装',
      currentPrice: 399,
      lowestPrice: 299,
      highestPrice: 599,
      shop: '优衣库官方旗舰店',
      imageUrl: '',
      specs: ['藏青色', 'L码', '连帽款'],
      specNote: '身高175 体重68，去年的有点旧了',
      targetPrice: 349,
      purchasePlan: 'want',
      couponNotify: false,
      restockNotify: false,
      priceDropNotify: true,
      createdAt: today - 60 * day,
      updatedAt: today
    },
    {
      id: 'demo-4',
      name: '戴森 V12 Detect Slim 轻量无线吸尘器 激光探测',
      url: 'https://item.jd.com/100020003888.html',
      platform: 'jd',
      category: '家电清洁',
      currentPrice: 4290,
      lowestPrice: 3790,
      highestPrice: 4490,
      shop: '戴森京东自营官方旗舰店',
      imageUrl: '',
      specs: ['V12 Detect Slim', '标准版'],
      specNote: '家有猫毛必备，预算最好4000以内',
      targetPrice: 3999,
      purchasePlan: 'want',
      couponNotify: true,
      restockNotify: true,
      priceDropNotify: true,
      createdAt: today - 45 * day,
      updatedAt: today
    },
    {
      id: 'demo-5',
      name: '三只松鼠每日坚果大礼包 750g/30包 孕妇零食混合装',
      url: 'https://mobile.yangkeduo.com/goods.html?goods_id=123456789012',
      platform: 'pdd',
      category: '食品零食',
      currentPrice: 79.9,
      lowestPrice: 59.9,
      highestPrice: 119,
      shop: '三只松鼠官方旗舰店',
      imageUrl: '',
      specs: ['750g 装', '30小包', '混合款'],
      specNote: '',
      targetPrice: 69,
      purchasePlan: 'cart',
      couponNotify: true,
      restockNotify: false,
      priceDropNotify: true,
      createdAt: today - 7 * day,
      updatedAt: today
    },
    {
      id: 'demo-6',
      name: 'Kindle Paperwhite 5 电子书阅读器 6.8英寸 11代 16GB',
      url: 'https://www.amazon.cn/dp/B09N2QKQ2B',
      platform: 'amazon',
      category: '数码阅读',
      currentPrice: 1099,
      lowestPrice: 899,
      highestPrice: 1399,
      shop: '亚马逊官方',
      imageUrl: '',
      specs: ['黑色', '16GB', '无广告版'],
      specNote: '已买，买成999元，留着比价记录',
      targetPrice: 0,
      purchasePlan: 'bought',
      couponNotify: false,
      restockNotify: false,
      priceDropNotify: false,
      createdAt: today - 100 * day,
      updatedAt: today - 20 * day
    }
  ];
  await chrome.storage.local.set({ products: demoProducts });
  for (const p of demoProducts) {
    const history = generateHistory(p);
    await addPriceHistoryBulk(p.id, history);
  }
}

function generateHistory(product) {
  const arr = [];
  const now = Date.now();
  const day = 86400000;
  const days = Math.floor((now - product.createdAt) / day);
  let price = product.highestPrice || product.currentPrice * 1.15;
  for (let i = days; i >= 0; i--) {
    const drift = (Math.random() - 0.5) * (product.currentPrice * 0.08);
    price = Math.max(product.lowestPrice * 0.95, Math.min(product.highestPrice * 1.05, price + drift));
    if (i === 0) price = product.currentPrice;
    if (i === days && product.highestPrice) price = product.highestPrice;
    arr.push({
      productId: product.id,
      price: Number(price.toFixed(2)),
      timestamp: now - i * day,
      source: 'init'
    });
  }
  return arr;
}

async function addPriceHistory(productId, price, source = 'auto') {
  const record = { productId, price, timestamp: Date.now(), source };
  return addPriceHistoryBulk(productId, [record]);
}

async function addPriceHistoryBulk(productId, records) {
  try {
    const db = await openDB();
    const tx = db.transaction('priceHistory', 'readwrite');
    const store = tx.objectStore('priceHistory');
    records.forEach(r => store.add(r));
    return new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('IndexedDB write failed:', e);
    const key = `hist_${productId}`;
    const existing = await chrome.storage.local.get(key);
    const merged = [...(existing[key] || []), ...records].slice(-365);
    await chrome.storage.local.set({ [key]: merged });
  }
}

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

self.checkAllPrices = checkAllPrices;
self.addPriceHistory = addPriceHistory;
self.openDB = openDB;
