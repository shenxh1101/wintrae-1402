const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

async function sendMsg(type, payload = {}) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type, ...payload }, (r) => {
        if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
        else resolve(r || { ok: false });
      });
    } catch (e) { resolve({ ok: false, error: String(e) }); }
  });
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]);
}

function formatPrice(v) {
  if (v == null || isNaN(v)) return '¥--';
  return '¥' + Number(v).toFixed(2);
}

function formatDate(ts) {
  if (!ts) return '--';
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysBetween(a, b) {
  return Math.floor(Math.abs((b - a) / 86400000));
}

const PLATFORM_MAP = {
  jd: { label: '京东', color: '#e1251b', bg: '#fff1f0' },
  taobao: { label: '淘宝', color: '#ff4400', bg: '#fff2e8' },
  tmall: { label: '天猫', color: '#ff0036', bg: '#ffebee' },
  pdd: { label: '拼多多', color: '#e02e24', bg: '#ffe9e8' },
  suning: { label: '苏宁', color: '#f90', bg: '#fff6e6' },
  amazon: { label: '亚马逊', color: '#ff9900', bg: '#fff5e0' },
  mi: { label: '小米', color: '#ff6900', bg: '#fff0e5' },
  other: { label: '其他', color: '#0d9488', bg: '#ccfbf1' }
};

const PLAN_MAP = {
  want: { label: '想买', icon: '💡', color: '#6366f1', bg: '#eef2ff' },
  cart: { label: '加购', icon: '🛒', color: '#f59e0b', bg: '#fffbeb' },
  bought: { label: '已购', icon: '✅', color: '#10b981', bg: '#ecfdf5' },
  archived: { label: '归档', icon: '📦', color: '#64748b', bg: '#f1f5f9' }
};

function getPlatformBadge(platform) {
  const p = PLATFORM_MAP[platform] || PLATFORM_MAP.other;
  return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;
    border-radius: 20px; font-size: 10.5px; font-weight: 600; color:${p.color};
    background:${p.bg}; letter-spacing: .2px;">${p.label}</span>`;
}

function getPlanBadge(plan) {
  const p = PLAN_MAP[plan] || PLAN_MAP.want;
  return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;
    border-radius: 20px; font-size: 10.5px; font-weight: 600; color:${p.color};
    background:${p.bg};">${p.icon} ${p.label}</span>`;
}

function showToast(msg, type = 'success') {
  let t = document.getElementById('__toast__');
  if (!t) {
    t = document.createElement('div');
    t.id = '__toast__';
    t.style.cssText = `position:fixed;top:24px;left:50%;transform:translateX(-50%);
      padding: 10px 22px; border-radius: 24px; color: white; font-size: 13px;
      font-weight: 600; z-index: 99999; box-shadow: 0 10px 30px rgba(0,0,0,.18);
      transition: all .3s cubic-bezier(.3,1.5,.6,1); opacity: 0; pointer-events: none;
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif;`;
    document.body.appendChild(t);
  }
  const colors = { success: '#0d9488', error: '#ef4444', warn: '#f59e0b', info: '#3b82f6' };
  t.style.background = colors[type] || colors.success;
  t.textContent = msg;
  requestAnimationFrame(() => {
    t.style.opacity = '1';
    t.style.transform = 'translateX(-50%) translateY(0)';
  });
  clearTimeout(t._timer);
  t._timer = setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateX(-50%) translateY(-8px)';
  }, 2200);
}

function openPage(name, params = '') {
  const m = { favorites: 'favorites.html', settings: 'settings.html', chart: 'chart.html' };
  const url = chrome.runtime.getURL('pages/' + (m[name] || m.favorites)) + (params ? `?${params}` : '');
  chrome.tabs ? chrome.tabs.create({ url }) : window.open(url, '_blank');
}

function deltaBadge(current, lowest, highest) {
  if (!highest || highest === current) return '';
  const delta = current >= highest
    ? ((current - lowest) / (lowest || 1)) * 100
    : ((current - highest) / (highest || 1)) * 100;
  if (Math.abs(delta) < 0.5) return '';
  const isDown = delta < 0;
  const color = isDown ? '#10b981' : '#ef4444';
  const bg = isDown ? '#ecfdf5' : '#fef2f2';
  return `<span style="display:inline-flex;align-items:center;gap:2px;padding:2px 7px;
    border-radius: 20px; font-size: 10.5px; font-weight: 700; color:${color};
    background:${bg}; font-variant-numeric: tabular-nums;">
    ${isDown ? '↓' : '↑'} ${Math.abs(delta).toFixed(1)}%</span>`;
}
