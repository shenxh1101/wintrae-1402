(function () {
  if (window.__priceTrackerInjected) return;
  window.__priceTrackerInjected = true;

  function detectPlatform(url) {
    if (/taobao\.com/.test(url)) return { key: 'taobao', label: '淘宝', color: '#ff4400' };
    if (/tmall\.com/.test(url)) return { key: 'tmall', label: '天猫', color: '#ff0036' };
    if (/jd\.com/.test(url)) return { key: 'jd', label: '京东', color: '#e1251b' };
    if (/yangkeduo\.com|pinduoduo\.com/.test(url)) return { key: 'pdd', label: '拼多多', color: '#e02e24' };
    if (/suning\.com/.test(url)) return { key: 'suning', label: '苏宁', color: '#f90' };
    if (/amazon\./.test(url)) return { key: 'amazon', label: '亚马逊', color: '#ff9900' };
    if (/mi\.com/.test(url)) return { key: 'mi', label: '小米', color: '#ff6900' };
    return { key: 'other', label: '其他', color: '#0d9488' };
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
  function guessCategory(name) {
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

  function extractProduct() {
    const platform = detectPlatform(location.href);
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
      '[data-testid="product-price"]', '.product-price', '[class*="Price"]'
    ]);
    const shop = textOf([
      '.tb-shop-name a', '.slogo-shopname', '.shop-name', '.seller',
      '#shop-name', '.store-name', '#merchant-info', '.brand-title'
    ]);
    const imageUrl = imageOf([
      '#J_ImgBooth', '.main-image img', '.spec-img', '.goods-img',
      '#imgTagWrapperId img', '#landingImage', '.product-image img',
      '[class*="main-pic"] img'
    ]);
    const specEls = document.querySelectorAll('.sku-item.selected, .sku-item .title, .J_Prop li, .tm-tag, [class*="Sku"] [class*="label"]');
    const specs = Array.from(specEls).map(e => e.textContent.trim()).filter(Boolean).slice(0, 6);
    return {
      name: name.slice(0, 200),
      url: location.href.split('?')[0],
      platform: platform.key,
      category: guessCategory(name),
      currentPrice: price,
      shop,
      imageUrl,
      specs
    };
  }

  function showBadge() {
    const data = extractProduct();
    if (!data.name || !data.currentPrice) return;
    const badge = document.createElement('div');
    badge.innerHTML = `
      <div style="position: fixed; top: 20px; right: 20px; z-index: 999999;
        background: linear-gradient(135deg, #0d9488, #0891b2); color: white;
        padding: 10px 14px; border-radius: 12px; box-shadow: 0 10px 30px rgba(13,148,136,.35);
        font-family: -apple-system, system-ui, sans-serif; font-size: 13px; cursor: pointer;
        display: flex; align-items: center; gap: 10px; backdrop-filter: blur(6px);
        border: 1px solid rgba(255,255,255,.25); transition: all .2s;"
        class="pt-badge-wrap">
        <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
          <path d="M3 17 L9 11 L13 15 L21 6" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="21" cy="6" r="2" fill="white"/>
        </svg>
        <div>
          <div style="font-weight:700; font-size: 12px;">价格追踪助手</div>
          <div style="font-size:11px; opacity:.9;">检测到商品 点击扩展图标收藏</div>
        </div>
      </div>
    `;
    badge.addEventListener('click', () => badge.remove());
    document.body.appendChild(badge);
    setTimeout(() => {
      const el = document.querySelector('.pt-badge-wrap');
      if (el) setTimeout(() => el && el.parentElement && el.parentElement.remove(), 15000);
    }, 1000);
  }

  chrome.runtime.onMessage.addListener((msg, sender, resp) => {
    if (msg && msg.type === 'EXTRACT_PRODUCT_LOCAL') {
      resp(extractProduct());
    }
    return true;
  });

  try {
    if (extractProduct().currentPrice > 0) {
      setTimeout(showBadge, 1500);
    }
  } catch (e) {}
})();
