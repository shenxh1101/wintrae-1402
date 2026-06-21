chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.type) {
        case 'GET_PRODUCTS':
          sendResponse({ ok: true, data: await StorageAPI.getProducts() });
          break;
        case 'ADD_PRODUCT': {
          const p = msg.payload;
          if (!p.id) p.id = `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          if (!p.createdAt) p.createdAt = Date.now();
          p.updatedAt = Date.now();
          if (!p.currentPrice && p.currentPrice !== 0) p.currentPrice = 0;
          p.lowestPrice = p.lowestPrice || p.currentPrice;
          p.highestPrice = p.highestPrice || p.currentPrice;
          const saved = await StorageAPI.addProduct(p);
          if (p.currentPrice) {
            try {
              const db = await openDB();
              const tx = db.transaction('priceHistory', 'readwrite');
              tx.objectStore('priceHistory').add({
                productId: p.id, price: p.currentPrice, timestamp: Date.now(), source: 'init'
              });
            } catch (_) {
              const key = `hist_${p.id}`;
              const r = await chrome.storage.local.get(key);
              const arr = r[key] || [];
              arr.push({ productId: p.id, price: p.currentPrice, timestamp: Date.now(), source: 'init' });
              await chrome.storage.local.set({ [key]: arr });
            }
          }
          sendResponse({ ok: true, data: saved });
          break;
        }
        case 'UPDATE_PRODUCT':
          sendResponse({ ok: true, data: await StorageAPI.updateProduct(msg.id, msg.payload) });
          break;
        case 'DELETE_PRODUCT':
          await StorageAPI.deleteProduct(msg.id);
          sendResponse({ ok: true });
          break;
        case 'GET_HISTORY':
          sendResponse({ ok: true, data: await StorageAPI.getPriceHistory(msg.productId) });
          break;
        case 'GET_SETTINGS':
          sendResponse({ ok: true, data: await StorageAPI.getSettings() });
          break;
        case 'SAVE_SETTINGS':
          await StorageAPI.saveSettings(msg.payload);
          sendResponse({ ok: true });
          break;
        case 'MERGE_DUPLICATES':
          sendResponse({ ok: true, data: await mergeDuplicates() });
          break;
        case 'ARCHIVE_PRODUCTS':
          sendResponse({ ok: true, data: await archiveProducts(msg.ids) });
          break;
        case 'TRIGGER_CHECK':
          const result = await self.checkAllPrices ? self.checkAllPrices() : { notifiedCount: 0 };
          sendResponse({ ok: true, data: result });
          break;
        case 'EXTRACT_FROM_PAGE': {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab || !tab.id) { sendResponse({ ok: false, error: 'No active tab' }); return; }
          try {
            const [{ result }] = await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: extractProductFromPage,
              args: [tab.url]
            });
            sendResponse({ ok: true, data: result });
          } catch (e) {
            sendResponse({ ok: false, error: String(e) });
          }
          break;
        }
        default:
          sendResponse({ ok: false, error: 'Unknown message type' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e), stack: e.stack });
    }
  })();
  return true;
});

function extractProductFromPage(url) {
  function detectPlatform(u) {
    if (/taobao\.com/.test(u)) return 'taobao';
    if (/tmall\.com/.test(u)) return 'tmall';
    if (/jd\.com/.test(u)) return 'jd';
    if (/yangkeduo\.com|pinduoduo\.com/.test(u)) return 'pdd';
    if (/suning\.com/.test(u)) return 'suning';
    if (/amazon\./.test(u)) return 'amazon';
    if (/mi\.com/.test(u)) return 'mi';
    return 'other';
  }
  function textOf(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) return el.textContent.trim();
    }
    return '';
  }
  function priceOf(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const m = el.textContent.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
        if (m) return Number(m[1]);
      }
    }
    return 0;
  }
  function imageOf(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        if (el.tagName === 'IMG' && el.src) return el.src;
        const img = el.querySelector('img');
        if (img && img.src) return img.src;
      }
    }
    return '';
  }
  const platform = detectPlatform(url);
  const name = textOf([
    '.tb-main-title', '#J_Title .tb-main-title', 'h1.item-title',
    '.sku-name', '#itemInfo h1', '.goods-name', '#title',
    '#productTitle', '[data-testid="product-title"]',
    '.product-title', '.detail-title', 'h1.title', 'h1'
  ]) || document.title;
  const price = priceOf([
    '.tb-rmb-num', '.tm-price', '.price', '.p-price .price',
    '.price-number', '.goods-price', '.price-current',
    '#priceblock_ourprice', '#priceblock_dealprice',
    '[data-testid="product-price"]', '.product-price'
  ]);
  const shop = textOf([
    '.tb-shop-name a', '.slogo-shopname', '.shop-name', '.seller',
    '#shop-name', '.store-name', '#merchant-info', '.brand-title'
  ]);
  const imageUrl = imageOf([
    '#J_ImgBooth', '.main-image img', '.spec-img', '.goods-img',
    '#imgTagWrapperId img', '#landingImage', '.product-image img'
  ]);
  const specEls = document.querySelectorAll('.sku-item.selected, .sku-item .title, .J_Prop li, .tm-tag');
  const specs = Array.from(specEls).map(e => e.textContent.trim()).filter(Boolean).slice(0, 6);
  return {
    name: name.slice(0, 200),
    url: url.split('?')[0],
    platform,
    category: guessCategory(name, platform),
    currentPrice: price,
    shop,
    imageUrl,
    specs: specs.length ? specs : []
  };
  function guessCategory(name, platform) {
    const n = name.toLowerCase();
    if (/手机|phone|xiaomi|apple|iphone|华为|荣耀|小米|oppo|vivo/.test(n)) return '手机数码';
    if (/耳机|音响|蓝牙|airpod|sound/.test(n)) return '数码耳机';
    if (/书|kindle|阅读/.test(n)) return '数码阅读';
    if (/吸尘器|家电|冰箱|洗衣机|空调|电视/.test(n)) return '家电清洁';
    if (/衣|裤|外套|羽绒|t恤|衬衫|优衣库/.test(n)) return '服装男装';
    if (/裙|女|连衣裙|上衣/.test(n)) return '服装女装';
    if (/零食|坚果|三只松鼠|食品|牛奶|饮料/.test(n)) return '食品零食';
    if (/护肤|口红|面膜|化妆|精华/.test(n)) return '美妆护肤';
    if (/鞋|靴|运动/.test(n)) return '鞋靴箱包';
    return '其他';
  }
}

async function mergeDuplicates() {
  const products = await StorageAPI.getProducts();
  const groups = {};
  products.forEach(p => {
    const key = p.url.replace(/[?#].*$/, '') || p.name.substring(0, 10);
    (groups[key] = groups[key] || []).push(p);
  });
  let merged = 0;
  const result = [];
  for (const key in groups) {
    const g = groups[key];
    if (g.length === 1) result.push(g[0]);
    else {
      const primary = g.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
      const secondary = g.filter(x => x !== primary);
      for (const s of secondary) {
        if (s.priceDropNotify) primary.priceDropNotify = true;
        if (s.couponNotify) primary.couponNotify = true;
        if (s.restockNotify) primary.restockNotify = true;
        if (!primary.targetPrice || (s.targetPrice && s.targetPrice < primary.targetPrice)) {
          primary.targetPrice = s.targetPrice || primary.targetPrice;
        }
        if (s.specNote) primary.specNote = (primary.specNote ? primary.specNote + '\n' : '') + s.specNote;
        if (s.specs && s.specs.length) primary.specs = [...new Set([...(primary.specs || []), ...s.specs])];
        primary.lowestPrice = Math.min(primary.lowestPrice || Infinity, s.lowestPrice || Infinity);
        primary.highestPrice = Math.max(primary.highestPrice || 0, s.highestPrice || 0);
        merged++;
        await StorageAPI.deleteProduct(s.id);
      }
      result.push(primary);
    }
  }
  await StorageAPI.saveProducts(result);
  return { merged, total: result.length };
}

async function archiveProducts(ids) {
  const list = await StorageAPI.getProducts();
  list.forEach(p => {
    if (ids.includes(p.id)) {
      p.purchasePlan = 'archived';
      p.updatedAt = Date.now();
    }
  });
  await StorageAPI.saveProducts(list);
  return { archived: ids.length };
}
