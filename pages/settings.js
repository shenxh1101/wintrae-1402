const state = {
  products: [],
  settings: {},
  dirty: false
};

async function loadAll() {
  const [p, s] = await Promise.all([sendMsg('GET_PRODUCTS'), sendMsg('GET_SETTINGS')]);
  state.products = p.ok ? (p.data || []) : [];
  state.settings = s.ok ? (s.data || {}) : {};
  const defaults = { checkIntervalHours: 6, priceDropThreshold: 5, priceSpikeThreshold: 15, exportFormat: 'csv', mergeStrategy: 'url-base' };
  state.settings = { ...defaults, ...state.settings };
  renderSettings();
  renderTargetList();
}

function renderSettings() {
  const s = state.settings;
  $('#cfgInterval').value = String(s.checkIntervalHours || 6);
  $('#cfgDrop').value = String(s.priceDropThreshold || 5);
  $('#cfgDropVal').textContent = s.priceDropThreshold + '%';
  $('#cfgSpike').value = String(s.priceSpikeThreshold || 15);
  $('#cfgSpikeVal').textContent = s.priceSpikeThreshold + '%';
  $('#cfgFormat').value = s.exportFormat || 'csv';
}

function bindSettingsInputs() {
  $('#cfgInterval').addEventListener('change', async () => {
    state.settings.checkIntervalHours = Number($('#cfgInterval').value);
    state.dirty = true;
    await persist();
  });
  $('#cfgDrop').addEventListener('input', () => {
    const v = Number($('#cfgDrop').value);
    $('#cfgDropVal').textContent = v + '%';
    state.settings.priceDropThreshold = v;
    state.dirty = true;
  });
  $('#cfgDrop').addEventListener('change', persist);
  $('#cfgSpike').addEventListener('input', () => {
    const v = Number($('#cfgSpike').value);
    $('#cfgSpikeVal').textContent = v + '%';
    state.settings.priceSpikeThreshold = v;
    state.dirty = true;
  });
  $('#cfgSpike').addEventListener('change', persist);
  $('#cfgFormat').addEventListener('change', () => {
    state.settings.exportFormat = $('#cfgFormat').value;
    persist();
  });
}

async function persist() {
  const r = await sendMsg('SAVE_SETTINGS', { payload: state.settings });
  if (r.ok) state.dirty = false;
}

function renderTargetList() {
  const list = state.products.filter(p => p.purchasePlan !== 'archived');
  $('#productCount').textContent = `共 ${list.length} 件商品`;
  if (list.length === 0) {
    $('#targetList').innerHTML = `<div class="empty-state" style="padding:40px 20px;"><div class="empty-icon">📋</div><h3>还没有收藏商品</h3><p>先去电商平台收藏几件吧！</p></div>`;
    return;
  }
  $('#targetList').innerHTML = list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).map(p => {
    const hit = p.targetPrice && p.currentPrice <= p.targetPrice;
    const emojis = { jd: '🛒', taobao: '🧧', tmall: '🐱', pdd: '🍎', suning: '🛍️', amazon: '📦', mi: '📱', other: '🛒' };
    const emoji = emojis[p.platform] || '🛒';
    return `
      <div class="setting-product-item" draggable="true" data-id="${escapeHtml(p.id)}">
        <div class="sp-thumb">${emoji}</div>
        <div class="sp-info">
          <div class="sp-name" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</div>
          <div class="sp-meta">
            ${getPlatformBadge(p.platform)}
            <span>现价 <b style="color:#0f766e;">¥${Number(p.currentPrice).toFixed(2)}</b></span>
            ${p.lowestPrice && p.lowestPrice < p.currentPrice ? `<span style="color:#10b981;">最低 ¥${Number(p.lowestPrice).toFixed(2)}</span>` : ''}
            ${hit ? `<span style="color:#10b981;font-weight:700;">🎯 已到目标价</span>` : ''}
          </div>
          ${p.specs && p.specs.length ? `
            <div class="sp-specs">
              ${p.specs.slice(0, 3).map(s => {
                const name = typeof s === 'string' ? s : s.name;
                const note = typeof s === 'string' ? '' : (s.note || '');
                return `<span class="sp-spec-tag" title="${note ? escapeHtml(note) : escapeHtml(name)}">${escapeHtml(name)}${note ? ` · ${escapeHtml(note)}` : ''}</span>`;
              }).join('')}
              ${p.specs.length > 3 ? `<span class="sp-spec-tag">+${p.specs.length - 3}</span>` : ''}
            </div>
          ` : ''}
        </div>
        <div style="display:flex; align-items:center; gap: 10px; flex-shrink:0;">
          <label class="switch" title="开启降价提醒">
            <input type="checkbox" data-notify="${escapeHtml(p.id)}" ${p.priceDropNotify ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
          <div style="display:flex;align-items:center;gap:4px;">
            <span style="font-size:11px;color:#94a3b8;">目标</span>
            <input type="number" step="0.01" value="${p.targetPrice || ''}"
              class="sp-target-input" placeholder="¥0"
              data-target="${escapeHtml(p.id)}">
          </div>
          <a class="pca-btn" href="${chrome.runtime.getURL('pages/chart.html')}?productId=${encodeURIComponent(p.id)}" title="查看曲线">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none"><path d="M3 3v18h18 M7 14l4-4 4 4 5-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </a>
        </div>
      </div>
    `;
  }).join('');

  $$('[data-target]').forEach(input => {
    input.addEventListener('blur', async () => {
      const id = input.dataset.target;
      const val = Number(input.value) || 0;
      await sendMsg('UPDATE_PRODUCT', { id, payload: { targetPrice: val } });
      showToast('目标价已更新');
      loadAll();
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  });
  $$('[data-notify]').forEach(cb => {
    cb.addEventListener('change', async () => {
      const id = cb.dataset.notify;
      await sendMsg('UPDATE_PRODUCT', { id, payload: { priceDropNotify: cb.checked } });
    });
  });

  attachDragMerge();
}

function attachDragMerge() {
  let dragId = null;
  $$('.setting-product-item').forEach(item => {
    item.addEventListener('dragstart', (e) => {
      dragId = item.dataset.id;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      dragId = null;
    });
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dragId && dragId !== item.dataset.id) {
        item.style.boxShadow = '0 0 0 2px #0d9488 inset';
      }
    });
    item.addEventListener('dragleave', () => { item.style.boxShadow = ''; });
    item.addEventListener('drop', async (e) => {
      e.preventDefault();
      item.style.boxShadow = '';
      if (!dragId || dragId === item.dataset.id) return;
      if (!confirm('确定将这两个商品合并吗？相同链接/相似名称的商品会合并为一条记录')) return;
      const products = state.products;
      const a = products.find(x => x.id === dragId);
      const b = products.find(x => x.id === item.dataset.id);
      if (!a || !b) return;
      const primary = (a.createdAt || 0) > (b.createdAt || 0) ? a : b;
      const secondary = primary === a ? b : a;
      if (secondary.specNote) primary.specNote = (primary.specNote ? primary.specNote + '\n' : '') + secondary.specNote;
      if (secondary.specs && secondary.specs.length) {
        const existing = new Set((primary.specs || []).map(s => typeof s === 'string' ? s : s.name));
        const merged = [...(primary.specs || [])];
        for (const s of secondary.specs) {
          const name = typeof s === 'string' ? s : s.name;
          if (!existing.has(name)) {
            merged.push(typeof s === 'string' ? { name: s, note: '' } : { name: s.name, note: s.note || '' });
            existing.add(name);
          }
        }
        primary.specs = merged;
      }
      primary.lowestPrice = Math.min(primary.lowestPrice || Infinity, secondary.lowestPrice || Infinity);
      primary.highestPrice = Math.max(primary.highestPrice || 0, secondary.highestPrice || 0);
      if (!primary.targetPrice || (secondary.targetPrice && secondary.targetPrice < primary.targetPrice)) primary.targetPrice = secondary.targetPrice || primary.targetPrice;
      primary.priceDropNotify = primary.priceDropNotify || secondary.priceDropNotify;
      primary.couponNotify = primary.couponNotify || secondary.couponNotify;
      primary.restockNotify = primary.restockNotify || secondary.restockNotify;
      await sendMsg('UPDATE_PRODUCT', { id: primary.id, payload: primary });
      await sendMsg('DELETE_PRODUCT', { id: secondary.id });
      showToast('✅ 合并成功');
      loadAll();
    });
  });
}

function bindActions() {
  $$('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      if (item.dataset.nav && item.dataset.nav !== 'settings') openPage(item.dataset.nav);
    });
  });
  $('#saveAllBtn').addEventListener('click', async () => {
    await persist();
    showToast('✅ 所有设置已保存');
  });
  $('#exportAllBtn').addEventListener('click', () => {
    Exporter.export(state.products, state.settings.exportFormat || 'csv');
    showToast('已导出全部数据');
  });
  $('#testNotifBtn').addEventListener('click', () => {
    try {
      chrome.notifications.create('test_notif', {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: '🔔 通知测试',
        message: '如果看到这条消息，说明通知功能正常工作！',
        priority: 2
      });
      showToast('✅ 已发送测试通知');
    } catch (e) {
      showToast('通知发送失败：' + e.message, 'error');
    }
  });
  $('#mergeBtn').addEventListener('click', async () => {
    if (!confirm('将自动扫描重复商品（相同 URL/相似名称）并合并，继续？')) return;
    const r = await sendMsg('MERGE_DUPLICATES');
    if (r.ok) showToast(`✅ 已合并 ${r.data.merged} 件重复商品，剩余 ${r.data.total} 件`);
    else showToast('合并失败：' + (r.error || ''), 'error');
    loadAll();
  });
  $('#archiveBoughtBtn').addEventListener('click', async () => {
    const bought = state.products.filter(p => p.purchasePlan === 'bought');
    if (bought.length === 0) return showToast('没有已购买的商品', 'warn');
    if (!confirm(`归档 ${bought.length} 件「已购买」的商品？可在收藏页筛选「归档」查看`)) return;
    const r = await sendMsg('ARCHIVE_PRODUCTS', { ids: bought.map(p => p.id) });
    if (r.ok) showToast(`✅ 已归档 ${r.data.archived} 件`);
    loadAll();
  });
  $('#resetBtn').addEventListener('click', async () => {
    if (!confirm('⚠️ 将删除所有收藏商品及历史数据，操作不可恢复！确定继续？')) return;
    if (!confirm('再次确认：真的要清空所有数据吗？')) return;
    await chrome.storage.local.clear();
    try {
      const req = indexedDB.deleteDatabase('priceTrackerDB');
      req.onsuccess = console.log;
    } catch (_) {}
    showToast('✅ 已清空全部数据，页面即将刷新');
    setTimeout(() => location.reload(), 1200);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  bindSettingsInputs();
  bindActions();
  loadAll();
});
