const state = {
  records: [],
  filterType: 'all',
  onlyUnread: false
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
    const priceInfo = item.extra && item.extra.oldPrice !== undefined ? `
      <div class="notif-prices">
        ${item.extra.oldPrice !== item.extra.newPrice ? `
          <span class="np-old">原价 ¥${Number(item.extra.oldPrice).toFixed(2)}</span>
          <span class="np-arrow">→</span>
          <span class="np-new" style="color:${meta.color};">现价 ¥${Number(item.extra.newPrice).toFixed(2)}</span>
          <span class="np-delta" style="background:${meta.bg};color:${meta.color};">${item.extra.deltaPct !== undefined ? (item.extra.deltaPct > 0 ? '+' : '') + item.extra.deltaPct.toFixed(1) + '%' : ''}</span>
        ` : ''}
        ${item.extra.targetPrice ? `<span class="np-target">🎯 目标 ¥${Number(item.extra.targetPrice).toFixed(2)}</span>` : ''}
      </div>
    ` : '';
    return `
      <div class="notif-card ${item.read ? 'read' : 'unread'}" data-id="${escapeHtml(item.id)}" data-pid="${escapeHtml(item.productId)}">
        <div class="notif-icon" style="background:${meta.bg};color:${meta.color};">
          ${meta.emoji}
        </div>
        <div class="notif-body">
          <div class="notif-top">
            <span class="notif-type" style="color:${meta.color};background:${meta.bg};">${meta.label}</span>
            <span class="notif-time">${formatDateTime(item.createdAt)}</span>
            ${!item.read ? '<span class="notif-dot"></span>' : ''}
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
          <button class="notif-btn" data-action="read" title="${item.read ? '已读' : '标为已读'}">
            ${item.read ? '✓' : '📖'}
          </button>
          <button class="notif-btn" data-action="open" title="查看商品">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none"><path d="M15 3h6v6 M10 14 L21 3 M21 14v7H3V3h7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </div>
    `;
  }).join('');

  $$('.notif-card').forEach(card => {
    const id = card.dataset.id;
    const pid = card.dataset.pid;
    card.addEventListener('click', async (e) => {
      if (e.target.closest('[data-action]')) return;
      await sendMsg('MARK_NOTIF_READ', { id });
      openChart(pid);
    });
    const btns = card.querySelectorAll('[data-action]');
    btns.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        if (action === 'read') {
          await sendMsg('MARK_NOTIF_READ', { id });
          loadData();
        } else if (action === 'open') {
          await sendMsg('MARK_NOTIF_READ', { id });
          openChart(pid);
        }
      });
    });
  });
}

function openChart(productId) {
  if (!productId) { showToast('商品不存在', 'warn'); return; }
  openPage('chart', `productId=${encodeURIComponent(productId)}`);
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
  renderList();
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
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
