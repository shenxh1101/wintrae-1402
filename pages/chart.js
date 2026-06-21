const state = {
  product: null,
  history: [],
  productId: null
};

function getProductId() {
  const p = new URLSearchParams(location.search).get('productId');
  return p;
}

async function loadData() {
  state.productId = getProductId();
  if (!state.productId) {
    showToast('无效的商品ID', 'error');
    setTimeout(() => openPage('favorites'), 1200);
    return;
  }
  const r = await sendMsg('GET_PRODUCTS');
  if (!r.ok) return;
  state.product = (r.data || []).find(p => p.id === state.productId);
  if (!state.product) {
    showToast('商品不存在', 'error');
    setTimeout(() => openPage('favorites'), 1200);
    return;
  }
  const h = await sendMsg('GET_HISTORY', { productId: state.productId });
  state.history = h.ok ? (h.data || []) : [];
  renderAll();
}

function renderAll() {
  renderHeader();
  renderStats();
  renderChart();
  renderInfo();
  renderSettings();
}

function renderHeader() {
  const p = state.product;
  $('#productName').textContent = p.name;
  $('#productMeta').innerHTML = `
    ${getPlatformBadge(p.platform)}
    ${getPlanBadge(p.purchasePlan)}
    <span style="font-size:12px;color:#64748b;">
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" style="vertical-align:-2px;"><path d="M3 9l1-5h16l1 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z" stroke="currentColor" stroke-width="1.6"/></svg>
      ${escapeHtml(p.shop || '未知店铺')}
    </span>
    <span style="font-size:12px;color:#64748b;">
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" style="vertical-align:-2px;"><path d="M12 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM3 21a9 9 0 0 1 18 0" stroke="currentColor" stroke-width="1.6"/></svg>
      ${escapeHtml(p.category || '未分类')}
    </span>
  `;
}

function renderStats() {
  const p = state.product;
  const prices = state.history.map(h => h.price).filter(Boolean);
  const minP = prices.length ? Math.min(...prices) : p.currentPrice;
  const maxP = prices.length ? Math.max(...prices) : p.currentPrice;
  const avgP = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : p.currentPrice;
  const maxDrop = maxP > minP ? ((maxP - minP) / maxP) * 100 : 0;
  const fromLow = ((p.currentPrice - minP) / (minP || 1)) * 100;
  const fromHigh = ((p.currentPrice - maxP) / (maxP || 1)) * 100;

  const stats = [
    {
      label: '历史最低价', value: '¥' + minP.toFixed(2), cls: 'sc-green',
      delta: fromLow > 0.1 ? `当前价 +${fromLow.toFixed(1)}%` : fromLow < -0.1 ? `当前价 ${fromLow.toFixed(1)}%` : '当前就是最低 ✓'
    },
    {
      label: '历史最高价', value: '¥' + maxP.toFixed(2), cls: 'sc-red',
      delta: fromHigh < -0.1 ? `较最高 ${fromHigh.toFixed(1)}%` : '当前就是最高'
    },
    {
      label: '平均价', value: '¥' + avgP.toFixed(2), cls: 'sc-blue',
      delta: prices.length ? `${prices.length} 条记录均值` : '暂无数据'
    },
    {
      label: '最大降幅', value: maxDrop.toFixed(1) + '%', cls: 'sc-purple',
      delta: maxDrop ? `峰值到谷值便宜 ¥${(maxP - minP).toFixed(0)}` : '价格一直持平'
    }
  ];
  $('#chartStats').innerHTML = stats.map(s => `
    <div class="stat-card ${s.cls}">
      <span class="stat-label">${s.label}</span>
      <span class="stat-value">${s.value}</span>
      <span class="stat-change" style="color:rgba(15,23,42,.65);">${s.delta}</span>
    </div>
  `).join('');
}

async function renderChart() {
  const p = state.product;
  const canvas = $('#priceChart');
  const data = state.history.length >= 2 ? state.history : [{
    productId: p.id, price: p.currentPrice, timestamp: p.createdAt, source: 'init'
  }, {
    productId: p.id, price: p.currentPrice, timestamp: Date.now(), source: 'now'
  }];
  const sorted = [...data].sort((a, b) => a.timestamp - b.timestamp);
  const s = await sendMsg('GET_SETTINGS');
  const spike = (s.ok && s.data && s.data.priceSpikeThreshold) || 15;

  requestAnimationFrame(() => {
    PriceChart.draw(canvas, sorted, {
      targetPrice: p.targetPrice || null,
      spikeThreshold: Number(spike) / 100
    });
  });

  const start = sorted[0].timestamp, end = sorted[sorted.length - 1].timestamp;
  const days = Math.max(1, Math.round((end - start) / 86400000));
  $('#chartRange').innerHTML = `
    <span>📅 ${formatDate(start)} ~ ${formatDate(end)}（共 ${days} 天）</span>
    <span>·</span>
    <span>📈 ${sorted.length} 条价格记录</span>
  `;

  const hoverCard = $('#hoverCard');
  PriceChart.attachHover(canvas, (info) => {
    if (!info) { hoverCard.style.opacity = '0'; return; }
    const d = info.data;
    const rect = info.rect;
    hoverCard.style.left = info.x + 'px';
    hoverCard.style.top = info.y + 'px';
    hoverCard.style.opacity = '1';
    $('#hc-date').textContent = formatDate(d.timestamp);
    $('#hc-price').textContent = '¥' + Number(d.price).toFixed(2);
    const delta = sorted[0] ? ((d.price - sorted[0].price) / sorted[0].price) * 100 : 0;
    $('#hc-delta').textContent = delta >= 0 ? `较首日 +${delta.toFixed(1)}%` : `较首日 ${delta.toFixed(1)}%`;
    $('#hc-delta').style.color = delta > 0 ? '#fecaca' : delta < 0 ? '#bbf7d0' : '#cbd5e1';
  });
}

function renderInfo() {
  const p = state.product;
  const items = [
    { label: '当前价', value: `<b style="color:#0f766e;font-size:15px;">¥${Number(p.currentPrice).toFixed(2)}</b>` },
    { label: '目标价', value: p.targetPrice ? `¥${Number(p.targetPrice).toFixed(2)}` : `<span style="color:#94a3b8;">未设置</span>` },
    { label: '最低价', value: `¥${Number(p.lowestPrice || p.currentPrice).toFixed(2)}` },
    { label: '最高价', value: `¥${Number(p.highestPrice || p.currentPrice).toFixed(2)}` },
    { label: '收藏时间', value: formatDate(p.createdAt) },
    { label: '更新时间', value: formatDate(p.updatedAt || p.createdAt) },
    { label: '商品链接', value: p.url ? `<a href="${escapeHtml(p.url)}" target="_blank" style="color:#0d9488;text-decoration:underline;">打开链接 →</a>` : `<span style="color:#94a3b8;">无</span>` }
  ];
  if (p.specs && p.specs.length) items.push({
    label: '规格',
    value: p.specs.map(s => `<span style="padding:2px 8px;background:#f1f5f9;border-radius:6px;font-size:11px;color:#475569;margin:2px 4px 2px 0;display:inline-block;">${escapeHtml(s)}</span>`).join('')
  });
  if (p.specNote) items.push({ label: '备注', value: escapeHtml(p.specNote).replace(/\n/g, '<br>') });
  $('#infoList').innerHTML = items.map(i => `
    <div class="info-item">
      <span class="label">${i.label}</span>
      <span class="value">${i.value}</span>
    </div>
  `).join('');
}

function renderSettings() {
  const p = state.product;
  const notifs = [
    { key: 'priceDropNotify', label: '降价提醒', desc: '价格明显下降时第一时间通知', icon: '📉' },
    { key: 'couponNotify', label: '优惠券提示', desc: '有可用优惠券时提醒', icon: '🎟️' },
    { key: 'restockNotify', label: '补货通知', desc: '缺货商品到货时提醒', icon: '📦' }
  ];
  $('#notifSettings').innerHTML = notifs.map(n => `
    <div class="settings-row" style="padding:12px 0;">
      <div class="settings-label">
        <h4 style="display:flex;align-items:center;gap:6px;"><span style="font-size:14px;">${n.icon}</span>${n.label}</h4>
        <p>${n.desc}</p>
      </div>
      <div class="settings-control">
        <label class="switch">
          <input type="checkbox" id="n-${n.key}" ${p[n.key] ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
      </div>
    </div>
  `).join('');
  notifs.forEach(n => {
    $(`#n-${n.key}`).addEventListener('change', async () => {
      const r = await sendMsg('UPDATE_PRODUCT', { id: p.id, payload: { [n.key]: $(`#n-${n.key}`).checked } });
      if (r.ok) { showToast('设置已保存'); state.product = r.data; }
      else showToast('保存失败', 'error');
    });
  });

  const plans = [
    { k: 'want', l: '想买', i: '💡' },
    { k: 'cart', l: '加购', i: '🛒' },
    { k: 'bought', l: '已购买', i: '✅' },
    { k: 'archived', l: '归档', i: '📦' }
  ];
  $('#planSelect').innerHTML = plans.map(pl => `
    <button class="filter-btn ${p.purchasePlan === pl.k ? 'active' : ''}" style="margin-right:6px;margin-bottom:6px;"
      data-plan="${pl.k}">${pl.i} ${pl.l}</button>
  `).join('');
  $$('[data-plan]').forEach(btn => btn.addEventListener('click', async () => {
    const r = await sendMsg('UPDATE_PRODUCT', { id: p.id, payload: { purchasePlan: btn.dataset.plan } });
    if (r.ok) { state.product = r.data; renderAll(); showToast('状态已更新'); }
  })));
}

function attachActions() {
  $('#backLink').addEventListener('click', () => openPage('favorites'));
  $$('.nav-item').forEach(i => i.addEventListener('click', () => {
    if (i.dataset.nav === 'favorites') openPage('favorites');
    if (i.dataset.nav === 'settings') openPage('settings');
  }));
  $('#refreshBtn').addEventListener('click', async () => {
    showToast('🔄 正在刷新价格...');
    const r = await sendMsg('TRIGGER_CHECK');
    await loadData();
    showToast(r.ok ? '价格已更新' : '刷新完成');
  });
  $('#openBuyBtn').addEventListener('click', () => {
    if (state.product.url) {
      chrome.tabs ? chrome.tabs.create({ url: state.product.url }) : window.open(state.product.url);
    } else showToast('无商品链接', 'warn');
  });
  $('#setTargetBtn').addEventListener('click', () => {
    $('#targetInput').value = state.product.targetPrice || '';
    $('#targetModal').classList.add('show');
    setTimeout(() => $('#targetInput').focus(), 100);
  });
  $('#targetCancel').addEventListener('click', () => $('#targetModal').classList.remove('show'));
  $('#targetSave').addEventListener('click', async () => {
    const v = Number($('#targetInput').value) || 0;
    const enable = $('#targetNotify').checked;
    if (v <= 0 && $('#targetInput').value) return showToast('请输入有效的价格', 'error');
    const payload = { targetPrice: v };
    if (enable) payload.priceDropNotify = true;
    const r = await sendMsg('UPDATE_PRODUCT', { id: state.product.id, payload });
    if (r.ok) { state.product = r.data; renderAll(); showToast('✅ 目标价已设置'); }
    $('#targetModal').classList.remove('show');
  });
  $('#targetModal').addEventListener('click', (e) => { if (e.target.id === 'targetModal') $('#targetModal').classList.remove('show'); });

  window.addEventListener('resize', () => renderChart());
}

document.addEventListener('DOMContentLoaded', () => {
  attachActions();
  loadData();
});
