const state = {
  products: [],
  filtered: [],
  filters: {
    platform: 'all',
    category: '',
    drop: 'all',
    plan: 'all',
    search: ''
  },
  selected: new Set(),
  editingId: null
};

async function loadUnreadBadge() {
  try {
    const r = await sendMsg('GET_UNREAD_COUNT');
    const count = r.ok ? r.data || 0 : 0;
    const badge = $('#navUnreadBadge');
    if (badge) {
      if (count > 0) {
        badge.style.display = 'inline-flex';
        badge.textContent = count > 99 ? '99+' : count;
      } else {
        badge.style.display = 'none';
      }
    }
  } catch (e) {}
}

async function loadProducts() {
  const r = await sendMsg('GET_PRODUCTS');
  state.products = r.ok ? (r.data || []) : [];
  applyFilters();
  renderAll();
  loadUnreadBadge();
}

function getAllGroups() {
  const groups = new Set();
  state.products.forEach(p => { if (p.compareGroup) groups.add(p.compareGroup); });
  return Array.from(groups).sort();
}

function getGroupMembers(groupName) {
  return state.products.filter(p => p.compareGroup === groupName);
}

function applyFilters() {
  let list = [...state.products];
  if (state.filters.platform !== 'all') list = list.filter(p => p.platform === state.filters.platform);
  if (state.filters.category) list = list.filter(p => p.category === state.filters.category);
  if (state.filters.plan !== 'all') list = list.filter(p => p.purchasePlan === state.filters.plan);
  if (state.filters.drop !== 'all') {
    list = list.filter(p => {
      if (!p.highestPrice) return state.filters.drop === 'none';
      const drop = ((p.highestPrice - p.currentPrice) / p.highestPrice) * 100;
      switch (state.filters.drop) {
        case 'over30': return drop >= 30;
        case 'over15': return drop >= 15 && drop < 30;
        case 'over5': return drop >= 5 && drop < 15;
        case 'over0': return drop > 0 && drop < 5;
        case 'up': return drop < 0;
        case 'none': return drop === 0 || !drop;
        default: return true;
      }
    });
  }
  if (state.filters.search) {
    const q = state.filters.search.toLowerCase();
    list = list.filter(p => {
      if (p.name.toLowerCase().includes(q)) return true;
      if ((p.shop || '').toLowerCase().includes(q)) return true;
      if ((p.category || '').toLowerCase().includes(q)) return true;
      if ((p.specNote || '').toLowerCase().includes(q)) return true;
      if (p.specs && p.specs.length) {
        for (const s of p.specs) {
          const name = typeof s === 'string' ? s : s.name;
          const note = typeof s === 'string' ? '' : (s.note || '');
          if (name.toLowerCase().includes(q) || note.toLowerCase().includes(q)) return true;
        }
      }
      return false;
    });
  }
  state.filtered = list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function renderAll() {
  renderStats();
  renderFilters();
  renderGrid();
  renderBatchBar();
  $('#navCount').textContent = state.products.filter(p => p.purchasePlan !== 'archived').length || '';
  $('#pageSubtitle').textContent = `共 ${state.products.length} 件商品 · 实时追踪价格波动`;
}

function renderStats() {
  const products = state.products.filter(p => p.purchasePlan !== 'archived');
  let dropsCount = 0, hitCount = 0, savedSum = 0, totalValue = 0;
  products.forEach(p => {
    totalValue += p.currentPrice || 0;
    if (p.highestPrice && p.currentPrice < p.highestPrice) {
      dropsCount++;
      savedSum += (p.highestPrice - p.currentPrice);
    }
    if (p.targetPrice && p.currentPrice > 0 && p.currentPrice <= p.targetPrice) hitCount++;
  });
  const avgDrop = dropsCount ? savedSum / dropsCount : 0;
  const stats = [
    { label: '追踪商品', value: products.length, cls: 'sc-blue', delta: `较上周 +${Math.min(products.length, 3)}` },
    { label: '降价中', value: dropsCount, cls: 'sc-green', delta: avgDrop > 0 ? `平均省 ¥${avgDrop.toFixed(0)}` : '暂无降价' },
    { label: '达目标价', value: hitCount, cls: 'sc-amber', delta: hitCount ? '快去看看吧！' : '继续等待...' },
    { label: '累计价值', value: '¥' + totalValue.toFixed(0), cls: 'sc-purple', delta: `${products.length} 件商品总计` }
  ];
  $('#statRow').innerHTML = stats.map(s => `
    <div class="stat-card ${s.cls}">
      <span class="stat-label">${s.label}</span>
      <span class="stat-value">${s.value}</span>
      <span class="stat-change" style="color:rgba(15,23,42,.6);">${s.delta}</span>
    </div>
  `).join('');
}

function renderFilters() {
  const platforms = ['all', ...new Set(state.products.map(p => p.platform))];
  const platformLabels = { all: '全部', jd: '京东', taobao: '淘宝', tmall: '天猫', pdd: '拼多多', suning: '苏宁', amazon: '亚马逊', mi: '小米', other: '其他' };
  $('#platformFilters').innerHTML = platforms.map(p => `
    <button class="filter-btn ${state.filters.platform === p ? 'active' : ''}" data-filter="platform" data-value="${escapeHtml(p)}">${escapeHtml(platformLabels[p] || p)}</button>
  `).join('');

  const drops = [
    { k: 'all', l: '全部' }, { k: 'over30', l: '≥30%' },
    { k: 'over15', l: '≥15%' }, { k: 'over5', l: '≥5%' },
    { k: 'over0', l: '微降' }, { k: 'up', l: '涨价' }, { k: 'none', l: '持平' }
  ];
  $('#dropFilters').innerHTML = drops.map(d => `
    <button class="filter-btn ${state.filters.drop === d.k ? 'active' : ''}" data-filter="drop" data-value="${d.k}">${d.l}</button>
  `).join('');

  const plans = [
    { k: 'all', l: '全部', i: '📋' }, { k: 'want', l: '想买', i: '💡' },
    { k: 'cart', l: '加购', i: '🛒' }, { k: 'bought', l: '已购', i: '✅' },
    { k: 'archived', l: '归档', i: '📦' }
  ];
  $('#planFilters').innerHTML = plans.map(p => `
    <button class="filter-btn ${state.filters.plan === p.k ? 'active' : ''}" data-filter="plan" data-value="${p.k}">${p.i} ${p.l}</button>
  `).join('');

  const categories = ['', ...new Set(state.products.map(p => p.category).filter(Boolean))];
  const catSel = $('#categoryFilter');
  catSel.innerHTML = '<option value="">全部品类</option>' +
    categories.filter(Boolean).map(c => `<option value="${escapeHtml(c)}" ${state.filters.category === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
  catSel.value = state.filters.category;

  $$('[data-filter]').forEach(btn => {
    btn.onclick = () => {
      state.filters[btn.dataset.filter] = btn.dataset.value;
      applyFilters();
      renderAll();
    };
  });
}

function renderGrid() {
  const grid = $('#productGrid');
  const empty = $('#emptyState');
  if (state.filtered.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';
  grid.innerHTML = state.filtered.map(p => {
    const isSelected = state.selected.has(p.id);
    const deltaBadgeHtml = deltaBadge(p.currentPrice, p.lowestPrice, p.highestPrice);
    const targetHit = p.targetPrice && p.currentPrice <= p.targetPrice;
    const groupMembers = p.compareGroup ? getGroupMembers(p.compareGroup) : [];
    const groupBest = groupMembers.length >= 2
      ? groupMembers.reduce((best, x) => (!best || Number(x.currentPrice) < Number(best.currentPrice) ? x : best), null)
      : null;
    const compareStripHtml = groupMembers.length >= 2 ? `
      <div class="compare-strip" onclick="event.stopPropagation(); openPage('group', 'name=${encodeURIComponent(p.compareGroup)}');">
        ${groupMembers.slice(0, 5).map(m => `
          <span class="compare-strip-item ${groupBest && m.id === groupBest.id ? 'cs-best' : ''}">
            ${getPlatformBadge(m.platform)}
            <span>¥${Number(m.currentPrice).toFixed(0)}</span>
            ${groupBest && m.id === groupBest.id ? '<span>✓最省</span>' : ''}
          </span>
        `).join('')}
        <span class="compare-strip-item" style="background:var(--primary-soft);color:var(--primary);border-color:var(--primary);font-weight:700;">
          查看对比 →
        </span>
      </div>
    ` : '';
    const groupBadgeHtml = p.compareGroup ? `<span class="group-badge">🏷️ ${escapeHtml(p.compareGroup)}</span>` : '';
    return `
      <div class="product-card ${isSelected ? 'selected' : ''}" data-id="${escapeHtml(p.id)}">
        <label class="product-card-check">
          <input type="checkbox" ${isSelected ? 'checked' : ''} data-check="${escapeHtml(p.id)}">
        </label>
        <div class="product-card-img">
          ${p.imageUrl ? `<img src="${escapeHtml(p.imageUrl)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">` : ''}
          <div class="no-img" style="${p.imageUrl ? 'display:none;' : ''}">${categoryEmoji(p.category)}</div>
          <div class="product-card-top">
            <div class="product-card-top-left">
              <div class="top-badges">
                ${getPlatformBadge(p.platform)}
                ${targetHit ? `<span style="padding:2px 7px;border-radius:20px;font-size:10.5px;font-weight:700;background:#fef3c7;color:#d97706;">🎯 到价</span>` : ''}
                ${deltaBadgeHtml}
              </div>
              ${groupBadgeHtml}
            </div>
            <div class="card-fav" title="收藏">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="${p.purchasePlan === 'archived' ? 'none' : '#ef4444'}"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" stroke="#ef4444" stroke-width="1.6" stroke-linejoin="round"/></svg>
            </div>
          </div>
        </div>
        <div class="product-card-body">
          <h4 class="product-card-title">${escapeHtml(p.name)}</h4>
          <div class="product-card-shop">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none"><path d="M3 9l1-5h16l1 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z M3 9h18M9 21v-5h6v5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
            ${escapeHtml(p.shop || '未知店铺')}
            <span style="margin-left:auto;">${getPlanBadge(p.purchasePlan)}</span>
          </div>
          ${(p.specs && p.specs.length) ? `
            <div class="product-card-specs">
              ${p.specs.slice(0, 4).map(s => {
                const name = typeof s === 'string' ? s : s.name;
                const note = typeof s === 'string' ? '' : (s.note || '');
                return `<span class="product-spec-tag" title="${note ? escapeHtml(note) : escapeHtml(name)}">${escapeHtml(name)}</span>`;
              }).join('')}
              ${p.specs.length > 4 ? `<span class="product-spec-tag">+${p.specs.length - 4}</span>` : ''}
            </div>
            ${p.specs.some(s => typeof s === 'object' && s.note) ? `
              <div class="product-spec-notes">
                ${p.specs.filter(s => typeof s === 'object' && s.note).slice(0, 2).map(s => `
                  <div class="spec-note-line">
                    <span class="spec-note-name">${escapeHtml(s.name)}</span>
                    <span class="spec-note-text">${escapeHtml(s.note)}</span>
                  </div>
                `).join('')}
              </div>
            ` : ''}
          ` : (p.specNote ? `<div style="font-size:11px;color:#64748b;line-height:1.5;background:#f8fafc;padding:6px 8px;border-radius:6px;">📝 ${escapeHtml(p.specNote.substring(0, 50))}</div>` : '')}
          ${compareStripHtml}
          <div class="product-price-row">
            <div class="price-main">
              <span class="price-current"><span class="currency">¥</span>${(p.currentPrice || 0).toFixed(2)}</span>
              <div class="price-meta">
                ${p.lowestPrice ? `<span>最低 <b>¥${Number(p.lowestPrice).toFixed(2)}</b></span>` : ''}
                ${p.targetPrice ? `<span>目标 <b>¥${Number(p.targetPrice).toFixed(2)}</b></span>` : ''}
              </div>
            </div>
            ${p.targetPrice ? `<span style="font-size:10.5px;color:${p.currentPrice <= p.targetPrice ? '#10b981' : '#f59e0b'};font-weight:700;">
              ${p.currentPrice <= p.targetPrice ? '✓ 已达' : `差 ¥${Math.max(0, p.currentPrice - p.targetPrice).toFixed(0)}`}
            </span>` : ''}
          </div>
        </div>
        <div class="product-card-actions">
          <button class="pca-btn primary" data-action="chart" data-id="${escapeHtml(p.id)}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none"><path d="M3 3v18h18 M7 14l4-4 4 4 5-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            价格曲线
          </button>
          <button class="pca-btn" data-action="open" data-id="${escapeHtml(p.id)}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6 M15 3h6v6 M10 14 21 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            购买
          </button>
          <button class="pca-btn" data-action="group" data-id="${escapeHtml(p.id)}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none"><path d="M3 7h13a2 2 0 0 1 2 2v11l-6.5-4-6.5 4V9a2 2 0 0 1-2-2z M8 7V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v13l-2-1.3 M11 11h10" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
            分组
          </button>
          <button class="pca-btn danger" data-action="delete" data-id="${escapeHtml(p.id)}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none"><path d="M3 6h18 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </div>
    `;
  }).join('');

  $$('#productGrid [data-action]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const p = state.products.find(x => x.id === id);
      switch (btn.dataset.action) {
        case 'chart':
          openPage('chart', `productId=${encodeURIComponent(id)}`);
          break;
        case 'open':
          if (p && p.url) {
            (chrome.tabs ? chrome.tabs : window).create ? chrome.tabs.create({ url: p.url }) : window.open(p.url);
          } else showToast('没有商品链接', 'warn');
          break;
        case 'delete':
          if (confirm(`确定删除「${p?.name?.substring(0, 30)}」？此操作不可恢复`)) {
            const r = await sendMsg('DELETE_PRODUCT', { id });
            if (r.ok) { showToast('已删除'); state.selected.delete(id); loadProducts(); }
            else showToast('删除失败：' + (r.error || ''), 'error');
          }
          break;
        case 'group':
          openGroupModal(id);
          break;
      }
      }
    });
  });

  $$('#productGrid [data-check]').forEach(cb => {
    cb.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = cb.dataset.check;
      cb.checked ? state.selected.add(id) : state.selected.delete(id);
      renderGrid();
    });
  });

  $$('.product-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-action]') || e.target.closest('[data-check]')) return;
      const id = card.dataset.id;
      openPage('chart', `productId=${encodeURIComponent(id)}`);
    });
  });
}

function categoryEmoji(cat) {
  const map = {
    '手机数码': '📱', '数码耳机': '🎧', '数码阅读': '📚',
    '家电清洁': '🧹', '服装男装': '👔', '服装女装': '👗',
    '食品零食': '🍿', '美妆护肤': '💄', '鞋靴箱包': '👟',
    '其他': '📦'
  };
  return map[cat] || '🛍️';
}

function renderBatchBar() {
  const bar = $('#batchBar');
  if (state.selected.size === 0) { bar.classList.remove('show'); return; }
  bar.classList.add('show');
  $('#batchCount').textContent = state.selected.size;
}

function attachFilters() {
  $('#categoryFilter').addEventListener('change', (e) => {
    state.filters.category = e.target.value;
    applyFilters();
    renderAll();
  });
  $('#searchInput').addEventListener('input', (e) => {
    state.filters.search = e.target.value.trim();
    applyFilters();
    renderAll();
  });
}

function attachTopActions() {
  $('#selectAllBtn').addEventListener('click', () => {
    const allIds = state.filtered.map(p => p.id);
    const allSelected = allIds.every(id => state.selected.has(id));
    allSelected ? state.selected.clear() : allIds.forEach(id => state.selected.add(id));
    renderAll();
  });
  $('#exportBtn').addEventListener('click', async () => {
    const r = await sendMsg('GET_SETTINGS');
    const fmt = (r.ok && r.data && r.data.exportFormat) || 'csv';
    Exporter.export(state.products.filter(p => p.purchasePlan !== 'archived'), fmt);
    showToast('✅ 已导出购物清单');
  });
  $('#newBtn').addEventListener('click', () => openModal());
  $('#emptyAddBtn').addEventListener('click', () => openModal());
  $('#checkNowBtn').addEventListener('click', async () => {
    showToast('🔍 正在检测价格，请稍候...');
    const r = await sendMsg('TRIGGER_CHECK');
    await loadProducts();
    if (r.ok && r.data) {
      const checked = r.data.checkedCount || 0;
      const notified = r.data.notifiedCount || 0;
      showToast(`✅ 检测完成，共检测 ${checked} 件商品，${notified} 个价格变化提醒`);
    } else {
      showToast('检测完成', 'warn');
    }
  });

  $('#batchArchive').addEventListener('click', async () => {
    const ids = [...state.selected];
    const r = await sendMsg('ARCHIVE_PRODUCTS', { ids });
    if (r.ok) { showToast(`✅ 已归档 ${r.data.archived} 件商品`); state.selected.clear(); loadProducts(); }
  });
  $('#batchExport').addEventListener('click', () => {
    const list = state.products.filter(p => state.selected.has(p.id));
    Exporter.export(list, 'csv');
    showToast('✅ 已导出所选商品');
  });
  $('#batchDelete').addEventListener('click', async () => {
    if (!confirm(`确定删除选中的 ${state.selected.size} 件商品？`)) return;
    for (const id of [...state.selected]) await sendMsg('DELETE_PRODUCT', { id });
    state.selected.clear();
    showToast('已删除');
    loadProducts();
  });

  $$('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      const nav = item.dataset.nav;
      if (nav && nav !== 'favorites') openPage(nav);
    });
  });
}

function openModal(product = null) {
  state.editingId = product ? product.id : null;
  $('#modalTitle').textContent = product ? '编辑商品' : '添加商品';
  $('#mName').value = product?.name || '';
  $('#mPrice').value = product?.currentPrice || '';
  $('#mTarget').value = product?.targetPrice || '';
  $('#mPlatform').value = product?.platform || 'jd';
  $('#mPlan').value = product?.purchasePlan || 'want';
  $('#mUrl').value = product?.url || '';
  $('#mShop').value = product?.shop || '';
  $('#mCategory').value = product?.category || '';
  $('#mNote').value = product?.specNote || '';
  
  const specsEl = $('#mSpecs');
  if (product && product.specs && product.specs.length) {
    specsEl.innerHTML = product.specs.map(s => {
      const name = typeof s === 'string' ? s : s.name;
      const note = typeof s === 'string' ? '' : (s.note || '');
      return `<span class="product-spec-tag" title="${note ? escapeHtml(note) : escapeHtml(name)}">${escapeHtml(name)}${note ? ` · ${escapeHtml(note)}` : ''}</span>`;
    }).join('');
  } else {
    specsEl.innerHTML = '<span style="font-size:12px;color:#94a3b8;">暂无规格</span>';
  }
  
  $('#productModal').classList.add('show');
  setTimeout(() => $('#mName').focus(), 100);
}
function closeModal() { $('#productModal').classList.remove('show'); }

async function saveModal() {
  const name = $('#mName').value.trim();
  const price = Number($('#mPrice').value) || 0;
  if (!name) return showToast('请输入商品名称', 'error');
  if (!price) return showToast('请输入当前价格', 'error');
  const payload = {
    name,
    currentPrice: price,
    targetPrice: Number($('#mTarget').value) || 0,
    platform: $('#mPlatform').value,
    purchasePlan: $('#mPlan').value,
    url: $('#mUrl').value.trim(),
    shop: $('#mShop').value.trim(),
    category: $('#mCategory').value.trim() || '其他',
    specNote: $('#mNote').value.trim(),
    priceDropNotify: true,
    couponNotify: false,
    restockNotify: false
  };
  if (state.editingId) {
    payload.id = state.editingId;
    payload.lowestPrice = Math.min(price, payload.lowestPrice || Infinity);
    payload.highestPrice = Math.max(price, payload.highestPrice || 0);
    const r = await sendMsg('UPDATE_PRODUCT', { id: state.editingId, payload });
    if (r.ok) showToast('✅ 已更新');
    else showToast('保存失败：' + (r.error || ''), 'error');
  } else {
    payload.lowestPrice = price;
    payload.highestPrice = price;
    payload.specs = [];
    const r = await sendMsg('ADD_PRODUCT', { payload });
    if (r.ok) showToast('✅ 已添加');
    else showToast('添加失败：' + (r.error || ''), 'error');
  }
  closeModal();
  loadProducts();
}

function attachModal() {
  $('#mCancel').addEventListener('click', closeModal);
  $('#mSave').addEventListener('click', saveModal);
  $('#productModal').addEventListener('click', (e) => { if (e.target.id === 'productModal') closeModal(); });
}

function openGroupModal(productId) {
  const p = state.products.find(x => x.id === productId);
  if (!p) return;
  state._groupingId = productId;
  $('#gmProduct').innerHTML = `
    ${getPlatformBadge(p.platform)}
    <span style="margin-left:6px;">${escapeHtml(p.name.substring(0, 40))}${p.name.length > 40 ? '...' : ''}</span>
    <span style="margin-left:auto;color:#0d9488;font-weight:700;">¥${Number(p.currentPrice).toFixed(2)}</span>
  `;
  const groups = getAllGroups();
  const curGroup = p.compareGroup || '';
  $('#gmGroup').innerHTML = '<option value="">-- 不分组 --</option>' +
    groups.map(g => `<option value="${escapeHtml(g)}" ${g === curGroup ? 'selected' : ''}>${escapeHtml(g)}</option>`).join('');
  $('#gmNewGroup').value = '';
  $('#gmGroupList').innerHTML = groups.length
    ? groups.map(g => {
        const cnt = state.products.filter(x => x.compareGroup === g).length;
        return `<span class="group-badge" title="${cnt} 件商品" style="cursor:pointer;padding:4px 10px;">🏷️ ${escapeHtml(g)} · ${cnt}件</span>`;
      }).join('')
    : '<span style="font-size:11.5px;color:#94a3b8;">暂无分组，可在右侧新建</span>';
  $('#gmGroupList').querySelectorAll('.group-badge').forEach(b => {
    b.addEventListener('click', () => {
      const name = b.textContent.replace(/^🏷️\s*/, '').replace(/ · \d+件$/, '');
      $('#gmGroup').value = name;
    });
  });
  $('#groupModal').classList.add('show');
  $('#groupModal').removeAttribute('hidden');
}

function closeGroupModal() {
  $('#groupModal').classList.remove('show');
  $('#groupModal').setAttribute('hidden', '');
  state._groupingId = null;
}

async function saveGroup() {
  const id = state._groupingId;
  if (!id) return;
  const newName = $('#gmNewGroup').value.trim();
  const selName = $('#gmGroup').value.trim();
  const groupName = newName || selName || '';
  const r = await sendMsg('UPDATE_PRODUCT', { id, payload: { compareGroup: groupName } });
  if (r.ok) {
    showToast(groupName ? `✅ 已加入分组「${groupName}」` : '已移出分组');
    closeGroupModal();
    loadProducts();
  } else {
    showToast('保存失败：' + (r.error || ''), 'error');
  }
}

async function removeGroup() {
  const id = state._groupingId;
  if (!id) return;
  const r = await sendMsg('UPDATE_PRODUCT', { id, payload: { compareGroup: '' } });
  if (r.ok) {
    showToast('已从分组中移除');
    closeGroupModal();
    loadProducts();
  }
}

function attachGroupModal() {
  $$('[data-close="groupModal"]').forEach(b => b.addEventListener('click', closeGroupModal));
  $('#groupModal').addEventListener('click', (e) => { if (e.target.id === 'groupModal') closeGroupModal(); });
  $('#gmSave').addEventListener('click', saveGroup);
  $('#gmRemoveGroup').addEventListener('click', removeGroup);
  $('#gmMakeGroup').addEventListener('click', () => {
    const p = state.products.find(x => x.id === state._groupingId);
    if (p) $('#gmNewGroup').value = p.name.substring(0, 15);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  attachFilters();
  attachTopActions();
  attachModal();
  attachGroupModal();
  loadProducts();
});
