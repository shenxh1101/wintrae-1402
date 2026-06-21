const state = {
  records: [],
  filterType: 'all',
  onlyUnread: false,
  viewMode: 'list',
  expandedProduct: null
};

const NOTIF_META = {
  priceDrop: { label: '降价', emoji: '📉', color: '#10b981', bg: '#ecfdf5' },
  targetReached: { label: '到价', emoji: '🎯', color: '#f59e0b', bg: '#fffbeb' },
  priceSpike: { label: '涨价', emoji: '⚠️', color: '#ef4444', bg: '#fef2f2' },
  restock: { label: '补货', emoji: '📦', color: '#0d9488', bg: '#f0fdfa' },
  coupon: { label: '优惠券', emoji: '🎟️', color: '#8b5cf6', bg: '#faf5ff' }
};

async function loadData() {
  const r = await sendMsg('GET_NOTIFICATIONS');
  if (r.ok) state.records = r.data || [];
  renderAll();
  loadAndRenderCheckInfo();
}

function applyFilter() {
  let list = state.records;
  if (state.filterType !== 'all') list = list.filter(x => x.type === state.filterType);
  if (state.onlyUnread) list = list.filter(x => !x.read);
  return list;
}

function renderStats() {
  const r = state.records;
  const total = r.length;
  const drop = r.filter(x => x.type === 'priceDrop').length;
  const target = r.filter(x => x.type === 'targetReached').length;
  const unread = r.filter(x => !x.read).length;
  $('#statTotal').textContent = total;
  $('#statTotalDesc').textContent = total ? `最近 ${formatDate(r[0].createdAt)} 起` : '暂无';
  $('#statDrop').textContent = drop;
  $('#statTarget').textContent = target;
  $('#statUnread').textContent = unread;
  const badge = $('#unreadBadge');
  if (unread > 0) {
    badge.style.display = 'inline-flex';
    badge.textContent = unread > 99 ? '99+' : unread;
  } else {
    badge.style.display = 'none';
  }
}

function getNotificationPriceInfo(item, meta) {
  if (!item.extra) return '';
  const parts = [];
  if (item.extra.oldPrice !== undefined && item.extra.newPrice !== undefined && item.extra.oldPrice !== item.extra.newPrice) {
    parts.push(`
      <span class="np-old">当时 ¥${Number(item.extra.oldPrice).toFixed(2)}</span>
      <span class="np-arrow">→</span>
      <span class="np-new" style="color:${meta.color};">触发 ¥${Number(item.extra.newPrice).toFixed(2)}</span>
      ${item.extra.deltaPct !== undefined ? `<span class="np-delta" style="background:${meta.bg};color:${meta.color};">${item.extra.deltaPct > 0 ? '+' : ''}${item.extra.deltaPct.toFixed(1)}%</span>` : ''}
    `);
  } else if (item.extra.newPrice !== undefined) {
    parts.push(`<span class="np-new" style="color:${meta.color};">触发价 ¥${Number(item.extra.newPrice).toFixed(2)}</span>`);
  }
  if (item.extra.targetPrice) {
    parts.push(`<span class="np-target">🎯 目标 ¥${Number(item.extra.targetPrice).toFixed(2)}</span>`);
  }
  if (item.extra.couponValue) {
    parts.push(`<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 6px;background:#faf5ff;color:#8b5cf6;border-radius:4px;font-size:10.5px;font-weight:600;">🎟️ 券 ¥${Number(item.extra.couponValue).toFixed(0)}</span>`);
  }
  if (item.extra.restockInfo) {
    parts.push(`<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 6px;background:#f0fdfa;color:#0d9488;border-radius:4px;font-size:10.5px;font-weight:600;">📦 ${escapeHtml(item.extra.restockInfo)}</span>`);
  }
  return parts.length ? `<div class="notif-prices">${parts.join('')}</div>` : '';
}

function renderList() {
  const list = applyFilter();
  const container = $('#notifList');
  const empty = $('#emptyState');
  if (!list.length) {
    container.innerHTML = '';
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';
  container.innerHTML = list.map(item => {
    const meta = NOTIF_META[item.type] || { label: '通知', emoji: '🔔', color: '#0d9488', bg: '#f0fdfa' };
    const priceInfo = getNotificationPriceInfo(item, meta);
    return `
      <div class="notif-card ${item.read ? 'read' : 'unread'}" data-id="${escapeHtml(item.id)}" data-pid="${escapeHtml(item.productId)}" data-ts="${item.createdAt}" data-type="${item.type}">
        <div class="notif-icon" style="background:${meta.bg};color:${meta.color};">
          ${meta.emoji}
        </div>
        <div class="notif-body">
          <div class="notif-top">
            <span class="notif-type" style="color:${meta.color};background:${meta.bg};">${meta.label}</span>
            <span class="notif-time">${formatDateTime(item.createdAt)}</span>
            ${!item.read ? '<span class="notif-dot" title="未读"></span>' : '<span style="font-size:10px;color:#94a3b8;margin-left:auto;">已读</span>'}
          </div>
          <h4 class="notif-title">${escapeHtml(item.title)}</h4>
          <p class="notif-msg">${escapeHtml(item.message)}</p>
          ${priceInfo}
          <div class="notif-product">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none"><path d="M20 21H4a1 1 0 0 1-1-1V8l9-5 9 5v12a1 1 0 0 1-1 1z M3 8h18 M10 21v-7h4v7" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
            <span>${escapeHtml(item.productName || '未知商品')}</span>
          </div>
        </div>
        <div class="notif-actions">
          <button class="notif-btn" data-action="read" title="${item.read ? '标记未读' : '标为已读'}">
            ${item.read ? '✓' : '📖'}
          </button>
          <button class="notif-btn" data-action="chart" title="查看价格曲线（定位到触发点）">
            📈
          </button>
          <button class="notif-btn" data-action="buy" title="去购买">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none"><path d="M15 3h6v6 M10 14 L21 3 M21 14v7H3V3h7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </div>
    `;
  }).join('');

  $$('.notif-card').forEach(card => {
    const id = card.dataset.id;
    const pid = card.dataset.pid;
    const ts = Number(card.dataset.ts);
    const type = card.dataset.type;
    card.addEventListener('click', async (e) => {
      if (e.target.closest('[data-action]')) return;
      await sendMsg('MARK_NOTIF_READ', { id });
      openChart(pid, id, ts, type);
    });
    const btns = card.querySelectorAll('[data-action]');
    btns.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        if (action === 'read') {
          const item = state.records.find(x => x.id === id);
          if (item) {
            if (item.read) await sendMsg('MARK_NOTIF_UNREAD', { id });
            else await sendMsg('MARK_NOTIF_READ', { id });
          }
          loadData();
        } else if (action === 'chart') {
          await sendMsg('MARK_NOTIF_READ', { id });
          openChart(pid, id, ts, type);
        } else if (action === 'buy') {
          await sendMsg('MARK_NOTIF_READ', { id });
          const productR = await sendMsg('GET_PRODUCTS');
          const product = productR.ok ? (productR.data || []).find(p => p.id === pid) : null;
          if (product && product.url) {
            chrome.tabs ? chrome.tabs.create({ url: product.url }) : window.open(product.url);
          } else {
            openChart(pid, id, ts, type);
          }
        }
      });
    });
  });
}

function openChart(productId, notifId, timestamp, type) {
  if (!productId) { showToast('商品不存在', 'warn'); return; }
  const params = new URLSearchParams({ productId: encodeURIComponent(productId) });
  if (notifId) params.set('notifId', notifId);
  if (timestamp) params.set('t', timestamp);
  if (type) params.set('src', type);
  openPage('chart', params.toString());
}

function getGroupedData() {
  const list = applyFilter();
  const groups = {};
  list.forEach(item => {
    const pid = item.productId;
    if (!groups[pid]) {
      groups[pid] = {
        productId: pid,
        productName: item.productName || '未知商品',
        records: [],
        typeCount: {},
        unreadCount: 0,
        latestAt: 0,
        lowestPrice: null,
        latestPrice: null
      };
    }
    groups[pid].records.push(item);
    groups[pid].typeCount[item.type] = (groups[pid].typeCount[item.type] || 0) + 1;
    if (!item.read) groups[pid].unreadCount++;
    if (item.createdAt > groups[pid].latestAt) groups[pid].latestAt = item.createdAt;
    if (item.extra && item.extra.newPrice !== undefined) {
      if (groups[pid].lowestPrice === null || item.extra.newPrice < groups[pid].lowestPrice) {
        groups[pid].lowestPrice = item.extra.newPrice;
      }
      if (groups[pid].latestPrice === null || item.createdAt > groups[pid].latestPriceAt) {
        groups[pid].latestPrice = item.extra.newPrice;
        groups[pid].latestPriceAt = item.createdAt;
      }
    }
  });
  return Object.values(groups).sort((a, b) => b.latestAt - a.latestAt);
}

function renderGroupedView() {
  const groups = getGroupedData();
  const container = $('#notifList');
  const empty = $('#emptyState');
  if (!groups.length) {
    container.innerHTML = '';
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';
  container.innerHTML = groups.map(group => {
    const isExpanded = state.expandedProduct === group.productId;
    const typeBadges = Object.entries(group.typeCount).map(([type, count]) => {
      const meta = NOTIF_META[type] || { label: '通知', emoji: '🔔', color: '#0d9488', bg: '#f0fdfa' };
      return `<span style="display:inline-flex;align-items:center;gap:2px;padding:2px 6px;background:${meta.bg};color:${meta.color};border-radius:10px;font-size:10.5px;font-weight:600;">${meta.emoji} ${meta.label} ×${count}</span>`;
    }).join('');
    const header = `
      <div class="notif-card ${group.unreadCount > 0 ? 'unread' : 'read'}" data-group="${escapeHtml(group.productId)}" style="cursor:pointer;">
        <div class="notif-icon" style="background:linear-gradient(135deg,#f59e0b,#ef4444);color:white;width:42px;height:42px;font-size:18px;">
          📦
        </div>
        <div class="notif-body" style="flex:1;">
          <div class="notif-top">
            <span class="notif-type" style="background:#fef3c7;color:#d97706;">商品汇总</span>
            <span class="notif-time">最近 ${formatDateTime(group.latestAt)}</span>
            ${group.unreadCount > 0 ? `<span class="notif-dot" style="width:18px;height:18px;font-size:10px;display:inline-flex;align-items:center;justify-content:center;">${group.unreadCount}</span>` : ''}
          </div>
          <h4 class="notif-title" style="margin-bottom:6px;">${escapeHtml(group.productName)}</h4>
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;">${typeBadges}</div>
          <div style="display:flex;gap:16px;font-size:12px;color:var(--text-2);">
            <span>📊 共 ${group.records.length} 条</span>
            ${group.latestPrice !== null ? `<span>💰 现价 ¥${Number(group.latestPrice).toFixed(2)}</span>` : ''}
            ${group.lowestPrice !== null ? `<span>📉 历史低 ¥${Number(group.lowestPrice).toFixed(2)}</span>` : ''}
          </div>
        </div>
        <div class="notif-actions">
          <button class="notif-btn" data-action="toggle" title="${isExpanded ? '收起' : '展开'}">
            ${isExpanded ? '▲' : '▼'}
          </button>
        </div>
      </div>
    `;
    if (!isExpanded) return header;
    const records = group.records.sort((a, b) => b.createdAt - a.createdAt);
    const recordItems = records.map(item => {
      const meta = NOTIF_META[item.type] || { label: '通知', emoji: '🔔', color: '#0d9488', bg: '#f0fdfa' };
      const priceInfo = getNotificationPriceInfo(item, meta);
      return `
        <div class="notif-card ${item.read ? 'read' : 'unread'}" data-id="${escapeHtml(item.id)}" data-pid="${escapeHtml(item.productId)}" data-ts="${item.createdAt}" data-type="${item.type}" style="margin-left:32px;border-left:3px solid ${meta.bg};">
          <div class="notif-icon" style="background:${meta.bg};color:${meta.color};">
            ${meta.emoji}
          </div>
          <div class="notif-body">
            <div class="notif-top">
              <span class="notif-type" style="color:${meta.color};background:${meta.bg};">${meta.label}</span>
              <span class="notif-time">${formatDateTime(item.createdAt)}</span>
              ${!item.read ? '<span class="notif-dot"></span>' : '<span style="font-size:10px;color:#94a3b8;margin-left:auto;">已读</span>'}
            </div>
            <h4 class="notif-title">${escapeHtml(item.title)}</h4>
            <p class="notif-msg">${escapeHtml(item.message)}</p>
            ${priceInfo}
          </div>
          <div class="notif-actions">
            <button class="notif-btn" data-action="read" title="${item.read ? '标记未读' : '标为已读'}">
              ${item.read ? '✓' : '📖'}
            </button>
            <button class="notif-btn" data-action="chart" title="查看价格曲线（定位到触发点）">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none"><path d="M3 3v18h18 M7 14l4-4 4 4 5-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <button class="notif-btn" data-action="buy" title="去购买">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none"><path d="M15 3h6v6 M10 14 L21 3 M21 14v7H3V3h7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');
    return header + recordItems;
  }).join('');

  $$('#notifList [data-group]').forEach(card => {
    const pid = card.dataset.group;
    card.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (btn) {
        e.stopPropagation();
        const action = btn.dataset.action;
        if (action === 'toggle') {
          state.expandedProduct = state.expandedProduct === pid ? null : pid;
          renderAll();
        }
      } else {
        state.expandedProduct = state.expandedProduct === pid ? null : pid;
        renderAll();
      }
    });
  });

  $$('#notifList .notif-card[data-id]').forEach(card => {
    const id = card.dataset.id;
    const pid = card.dataset.pid;
    const ts = Number(card.dataset.ts);
    const type = card.dataset.type;
    card.addEventListener('click', async (e) => {
      if (e.target.closest('[data-action]')) return;
      await sendMsg('MARK_NOTIF_READ', { id });
      openChart(pid, id, ts, type);
    });
    const btns = card.querySelectorAll('[data-action]');
    btns.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        if (action === 'read') {
          const item = state.records.find(x => x.id === id);
          if (item) {
            if (item.read) await sendMsg('MARK_NOTIF_UNREAD', { id });
            else await sendMsg('MARK_NOTIF_READ', { id });
          }
          loadData();
        } else if (action === 'chart') {
          await sendMsg('MARK_NOTIF_READ', { id });
          openChart(pid, id, ts, type);
        } else if (action === 'buy') {
          await sendMsg('MARK_NOTIF_READ', { id });
          const productR = await sendMsg('GET_PRODUCTS');
          const product = productR.ok ? (productR.data || []).find(p => p.id === pid) : null;
          if (product && product.url) {
            chrome.tabs ? chrome.tabs.create({ url: product.url }) : window.open(product.url);
          } else {
            openChart(pid, id, ts, type);
          }
        }
      });
    });
  });
}

function renderFilters() {
  $$('#typeFilter .filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.type === state.filterType);
    b.onclick = () => { state.filterType = b.dataset.type; renderAll(); };
  });
  const cb = $('#onlyUnread');
  cb.checked = state.onlyUnread;
  cb.onchange = () => { state.onlyUnread = cb.checked; renderAll(); };
}

function renderAll() {
  renderStats();
  renderFilters();
  if (state.viewMode === 'list') {
    renderList();
  } else {
    renderGroupedView();
  }
}

function bindViewSwitch() {
  $$('#viewSwitch [data-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === state.viewMode);
    btn.onclick = () => {
      state.viewMode = btn.dataset.view;
      state.expandedProduct = null;
      renderAll();
    };
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  bindViewSwitch();
  $('#markAllReadBtn').addEventListener('click', async () => {
    await sendMsg('MARK_NOTIF_ALL_READ');
    showToast('✅ 已全部标为已读');
    loadData();
  });
  $('#clearAllBtn').addEventListener('click', async () => {
    if (!confirm('确定要清空所有通知记录吗？此操作不可撤销。')) return;
    await sendMsg('CLEAR_NOTIFICATIONS');
    showToast('已清空通知记录');
    loadData();
  });
  $('#checkNowBtn').addEventListener('click', async () => {
    showToast('🔍 正在检测价格，请稍候...');
    const r = await sendMsg('TRIGGER_CHECK');
    setTimeout(loadData, 300);
    if (r.ok && r.data) {
      const checked = r.data.checkedCount || 0;
      const notified = r.data.notifiedCount || 0;
      showToast(`✅ 检测完成，共检测 ${checked} 件商品，${notified} 个变化提醒`);
    }
  });
  $('#emptyGotoFav').addEventListener('click', () => openPage('favorites'));
  $$('.nav-item').forEach(i => i.addEventListener('click', () => {
    if (i.dataset.nav && i.dataset.nav !== 'notifications') openPage(i.dataset.nav);
  }));
});
